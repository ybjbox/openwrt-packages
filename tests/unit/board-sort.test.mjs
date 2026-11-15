/* r202：「按速度」要把最快的排在第一行。
 *
 * 原来三处切换排序键（下拉、表头点新列、初始值）都硬写 dir:'asc'，而吞吐是
 * 越大越好 —— 选「按速度」拿到的是 8.53 → 18.24 递增，最快的蹲在最后一行。
 *
 * 这里不满足于静态断言：把 60-run.js 里的默认方向表和 sortedFiltered 抠出来
 * 真跑一遍，用 r201 榜单上那几条真实数据验顺序。
 */
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(here, '..', '..');
const run = fs.readFileSync(
	path.join(root, 'luci-app-cf-ipcheck', 'view-src', '60-run.js'), 'utf8');

/* 按花括号配平切出一个函数/字面量的源码。字符串里没有花括号，够用。 */
function grab(src, marker) {
	const at = src.indexOf(marker);
	assert.ok(at >= 0, '没有找到 ' + marker);
	let depth = 0;
	for (let i = src.indexOf('{', at); i < src.length; i++) {
		if (src[i] === '{') depth++;
		else if (src[i] === '}' && --depth === 0) return src.slice(at, i + 1);
	}
	throw new Error('花括号没配平：' + marker);
}

const DIR = grab(run, 'var SORT_DEF');
const FN = grab(run, 'function sortedFiltered');

/* 用 60-run.js 自己的比较器跑，不另写一份 —— 否则测的是测试、不是产物。 */
function sorter(sort, items, unit) {
	const body = [
		DIR, ';',
		grab(run, 'function sortDefDir'),
		FN,
		';return sortedFiltered;'
	].join('\n');
	const bui = { sort: sort, filter: 'all', q: '' };
	const lastSt = { speed_unit: unit || 'mb' };
	const F = { speedOf: (it, u) => (u === 'mib' ? it.speed_mib : it.speed_mbytes) };
	const fn = new Function('bui', 'lastSt', 'F', 'quality', body);
	return fn(bui, lastSt, F, () => '')(items).map((x) => x.ip);
}

/* r201 榜单截图上的真实读数（IP 与 MB/s、首字节）。 */
const BOARD = [
	{ ip: '172.64.229.8', speed_mbytes: 8.53, ttfb_ms: 243.8, colo: 'NRT' },
	{ ip: '172.64.146.113', speed_mbytes: 8.56, ttfb_ms: 234.2, colo: 'SIN' },
	{ ip: '172.64.146.115', speed_mbytes: 8.74, ttfb_ms: 234.6, colo: 'SIN' },
	{ ip: '104.18.35.197', speed_mbytes: 18.24, ttfb_ms: 225.3, colo: 'SIN' },
	{ ip: '172.64.229.5', speed_mbytes: 12.72, ttfb_ms: 229.3, colo: 'NRT' }
];

test('r202 排序：按速度默认降序，最快的在第一行', () => {
	assert.equal(grab(run, 'var SORT_DEF').includes("spd: 'desc'"), true, '速度的默认方向必须是降序');
	const out = sorter({ key: 'spd', dir: 'desc' }, BOARD);
	assert.deepEqual(out, ['104.18.35.197', '172.64.229.5', '172.64.146.115',
		'172.64.146.113', '172.64.229.8'], '18.24 该排第一，8.53 该垫底');
});

test('r202 排序：首字节与机房仍走升序', () => {
	assert.deepEqual(sorter({ key: 'ttfb', dir: 'asc' }, BOARD).slice(0, 2),
		['104.18.35.197', '172.64.229.5'], '首字节小的在前');
	/* 机房按字符串升序：NRT 在 SIN 之前（这组数据里 NRT 两条、SIN 三条） */
	const byColo = sorter({ key: 'colo', dir: 'asc' }, BOARD);
	assert.deepEqual(byColo.slice(0, 2).map((ip) => BOARD.find((b) => b.ip === ip).colo),
		['NRT', 'NRT'], 'NRT 一组排在 SIN 前');
	assert.equal(BOARD.find((b) => b.ip === byColo[2]).colo, 'SIN');
});

test('r202 排序：每个键都有自己的默认方向', () => {
	/* sortDefDir 是切换时唯一的取值入口；缺省回 asc。 */
	const dir = new Function(grab(run, 'var SORT_DEF') + ';' + grab(run, 'function sortDefDir')
		+ ';return sortDefDir;')();
	assert.equal(dir('spd'), 'desc');
	assert.equal(dir('ttfb'), 'asc');
	assert.equal(dir('colo'), 'asc');
	assert.equal(dir('没这个键'), 'asc', '未知键退回升序');
});

test('r202 排序：三处切换都走默认方向，不再硬写 asc', () => {
	/* 下拉切换 */
	assert.match(run, /bui\.sort = \{ key: sortSel\.value, dir: sortDefDir\(sortSel\.value\) \}/);
	/* 表头点一个还没选中的列 */
	assert.match(run, /bui\.sort = \{ key: k, dir: sortDefDir\(k\) \}/);
	/* 剩下的「dir: 'asc'」只允许出现在初始值那一处（默认键就是首字节） */
	const hard = run.match(/dir:\s*'asc'/g) || [];
	assert.equal(hard.length, 1, '除了初始值，别处不许写死升序');
	assert.match(run, /\{ key: 'ttfb', dir: 'asc' \}/, '初始值仍是按首字节');
});

test('r202 排序：偏好键换名，老版本存的错误方向不再生效', () => {
	/* r201 把「按速度 + 升序」写进过 board.sort；沿用同名键的话，已用过
	   下拉的用户刷新页面还是最慢的排第一。换键名一次性作废那次默认。 */
	assert.match(run, /CFI\.prefs\.get\(CFI\.prefs\.NS \+ 'board\.sort2'/);
	const writes = run.match(/CFI\.prefs\.set\(CFI\.prefs\.NS \+ 'board\.sort2'/g) || [];
	assert.equal(writes.length, 2, '两条写入路径（下拉、表头）都要换新键');
	assert.ok(!/NS \+ 'board\.sort'/.test(run), '不许再读写老键');
});
