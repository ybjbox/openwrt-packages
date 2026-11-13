/* r198「测速过程」实时流水：静态契约 + 日志行 JSON 转义口径。 */
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(here, '..', '..');
const ENGINE = path.join(root, 'luci-app-cf-ipcheck', 'root', 'usr', 'bin', 'cf-ipcheck');
const VIEW = path.join(root, 'luci-app-cf-ipcheck', 'htdocs', 'luci-static',
	'resources', 'view', 'cf_ipcheck', 'settings.js');
const engine = fs.readFileSync(ENGINE, 'utf8');
const view = fs.readFileSync(VIEW, 'utf8');

test('r198 引擎：running 状态并上 recent，且只在正在跑时给', () => {
	for (const needle of ['merge_recent()', '| merge_recent | merge_cfg',
		'tail -n 8 "$LOG"'])
		assert.ok(engine.includes(needle), '引擎缺少 ' + needle);
	/* 源码里是 shell 字符串 ",\"recent\":["，去掉转义后才是 JSON 的 "recent":[ */
	assert.ok(/recent\\":\[/.test(engine), '引擎缺少 recent 数组合并');
	assert.ok(/if grep -q '"state":"running"' "\$STATUS"[\s\S]{0,400}merge_recent/.test(engine),
		'merge_recent 必须挂在 running 分支里，done/error 不该带日志尾巴');
});

test('r198 引擎：日志里的双引号与反斜杠必须转义', () => {
	const seg = engine.slice(engine.indexOf('merge_recent()'), engine.indexOf('show_status()'));
	assert.ok(seg.includes('sed ') && seg.includes('s/"') && seg.includes('\\\\'), '缺 sed 转义');
	assert.ok(seg.includes('RECENT_JSON=$rj awk') && !/awk -v r=/.test(seg),
		'必须用环境变量传已转义的 JSON；awk -v 会把转义吃回去');
	assert.ok(seg.includes('"]" "}"'), '拼 recent 后必须把原来的右括号补回去');
	/* 与 awk 里同口径地验一次：日志行含 JSON 片段时 status 仍可 JSON.parse */
	const lines = [
		'2026-11-14T00:42:30+0800 达标 126 / 147；分类 {"none":133,"timeout":12,"tls":2}',
		'2026-11-14T00:37:52+0800 源 https://raw.githubusercontent.com/XIU2/x.txt',
		'路径 C:\\tmp\\a'
	];
	const json = '[' + lines.map((s) =>
		'"' + s.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\t/g, ' ') + '"'
	).join(',') + ']';
	assert.deepEqual(JSON.parse(json), lines.map((s) => s.replace(/\t/g, ' ')));
	assert.deepEqual(JSON.parse('[]'), []);
});

test('r198 视图：进度条下面挂实时流水，内容不变不重绘', () => {
	for (const needle of ['run-recent', 'run-recent-list', 'run-recent-line',
		'st.recent', '测速过程 · 最近 8 条', 'elapsedText', 'last.recent'])
		assert.ok(view.includes(needle), '视图缺少 ' + needle);
	assert.ok(/recentHost\.hidden = st\.state !== 'running'/.test(view),
		'只在 running 时显示');
});

test('r198 契约：STATUS 键登记了 recent（contract 与 lint 两处）', () => {
	const contract = fs.readFileSync(path.join(root, 'tests', 'contract.mjs'), 'utf8');
	const lint = fs.readFileSync(path.join(root, 'tests', 'lint.sh'), 'utf8');
	assert.match(contract, /stage_done stage_total recent upload/);
	assert.match(lint, /stage_done stage_total recent upload/);
});
