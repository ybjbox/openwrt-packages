/* r205：空闲时也要有心跳，页面不可见时不发请求。
 *
 * 改之前的行为是「不在 running 就 stopPoll」—— 定时轮由引擎自己起，页面完全
 * 看不见，到点了一直显示「已完成」，非得手动刷新。另一个方向的问题是后台标签
 * 照样 3 秒一次 status，而每次都是一次进程启动。
 *
 * 这里不满足于静态断言：把 90-shell.js 里的 gapSec 抠出来，用真实的常量跑一遍，
 * 确认三种状态各自对应正确的间隔。
 */
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(here, '..', '..');
const src = path.join(root, 'luci-app-cf-ipcheck', 'view-src');
const shell = fs.readFileSync(path.join(src, '90-shell.js'), 'utf8');
const view = fs.readFileSync(path.join(src, '99-view.js'), 'utf8');

function grab(text, marker) {
	const at = text.indexOf(marker);
	assert.ok(at >= 0, '没有找到 ' + marker);
	let depth = 0;
	for (let i = text.indexOf('{', at); i < text.length; i++) {
		if (text[i] === '{') depth++;
		else if (text[i] === '}' && --depth === 0) return text.slice(at, i + 1);
	}
	throw new Error('花括号没配平：' + marker);
}

function constOf(name) {
	const m = shell.match(new RegExp('var\\s+' + name + '\\s*=\\s*(\\d+);'));
	assert.ok(m, '90-shell.js 里没有常量 ' + name);
	return Number(m[1]);
}

/* 用产物自己的 gapSec 与常量跑，别在测试里重写一份判断。 */
function gapOf(state, misses) {
	const decl = [
		'var POLL_SEC = ' + constOf('POLL_SEC') + ';',
		'var POLL_SLOW = ' + constOf('POLL_SLOW') + ';',
		'var POLL_IDLE = ' + constOf('POLL_IDLE') + ';',
		'var FAIL_STALE = ' + constOf('FAIL_STALE') + ';'
	].join('\n');
	const fn = new Function('misses', 'store',
		decl + '\n' + grab(shell, 'function gapSec') + '\nreturn gapSec;');
	const store = { get: function () { return { status: { state: state } }; } };
	return fn(misses, store)();
}

test('r205 轮询：跑着 3 秒，空闲 30 秒，连续失败退到 10 秒', () => {
	assert.equal(gapOf('running', 0), constOf('POLL_SEC'));
	assert.equal(gapOf('done', 0), constOf('POLL_IDLE'));
	assert.equal(gapOf('error', 0), constOf('POLL_IDLE'));
	assert.equal(gapOf('never_run', 0), constOf('POLL_IDLE'));
	assert.equal(gapOf('running', 9), constOf('POLL_SLOW'), '连续读不到状态时要放慢，别再猛敲');
	assert.ok(constOf('POLL_IDLE') > constOf('POLL_SEC') * 5, '空闲心跳必须明显比跑着时稀');
});

test('r205 轮询：状态读成功后一律挂表，不再用停表表示空闲', () => {
	const at = shell.indexOf('var st = CFI.ipc.parseStatus(out);');
	assert.ok(at > 0, '没找到状态落库那一段');
	const tail = shell.slice(at, at + 700);
	assert.match(tail, /startPoll\(\);/, '读成功后必须重新挂表');
	assert.ok(!/else\s*\n?\s*stopPoll\(\);/.test(tail), '不许再在空闲时停表（那样定时轮看不见）');
});

test('r205 轮询：页面在后台时不发请求，切回前台立刻补一次', () => {
	assert.match(shell, /function pageHidden\(\)/, '没有 pageHidden()');
	assert.match(grab(shell, 'function pollTick'), /if \(pageHidden\(\)\)/, 'pollTick 没挡后台');
	assert.match(grab(shell, 'function logTick'), /pageHidden\(\)/, 'logTick 没挡后台（日志页 4 秒一拍）');
	assert.match(shell, /addEventListener\('visibilitychange', onVisible\)/, '没监听切回前台');
	assert.match(grab(shell, 'function destroy'), /removeEventListener\('visibilitychange', onVisible\)/, '销毁时没摘监听器');
});

test('r205 轮询：首屏就挂表，不再只在 running 时挂', () => {
	/* 视图入口原来写的是 if (state === 'running') sh.startPoll()。 */
	assert.match(view, /^\s*sh\.startPoll\(\);/m, '99-view.js 没在首屏挂表');
	assert.ok(!/state === 'running'\)\s*\n?\s*sh\.startPoll/.test(view), '还在按 running 决定要不要挂表');
});
