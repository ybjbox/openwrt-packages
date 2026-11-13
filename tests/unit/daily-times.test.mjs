/* r196 每天固定时刻：前端解析/预览与引擎 daily_times_norm() / daily_next_epoch()
 * 必须用同一组样例向量。这里从产物 settings.js 里把那几个纯函数原样取出来执行
 * （只取函数体，不跑整张视图），与引擎 selftest 的三条跨天用例一一对应。 */
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(here, '..', '..');
const VIEW = path.join(root, 'luci-app-cf-ipcheck', 'htdocs', 'luci-static',
	'resources', 'view', 'cf_ipcheck', 'settings.js');
const ENGINE = path.join(root, 'luci-app-cf-ipcheck', 'root', 'usr', 'bin', 'cf-ipcheck');

const src = fs.readFileSync(VIEW, 'utf8');
const a = src.indexOf('function parseDailyTimes(raw)');
const b = src.indexOf('var GROUPS = [');
assert.ok(a > 0 && b > a, '产物里应能取到 r196 的解析函数段');

const fns = new Function('CFI', 'document',
	src.slice(a, b) + '\nreturn { parseDailyTimes: parseDailyTimes, dailyNorm: dailyNorm, nextFive: nextFive };'
)({}, {});

const SECS = [7200, 28800, 50400, 72000]; // 02:00 / 08:00 / 14:00 / 20:00
const at = (y, m, d, h, mi) => Math.floor(new Date(y, m, d, h, mi || 0, 0).getTime() / 1000);

test('r196 解析：去重、排序、补零，与引擎 daily_times_norm 同口径', () => {
	assert.deepEqual(fns.parseDailyTimes('20:00,08:00,08:00,2:00'), [7200, 28800, 72000]);
	assert.equal(fns.dailyNorm(fns.parseDailyTimes('20:00,08:00,08:00,2:00')), '02:00,08:00,20:00');
	assert.deepEqual(fns.parseDailyTimes(''), []);
	assert.deepEqual(fns.parseDailyTimes('07:35 07:35;19:05'), [27300, 68700]);
});

test('r196 解析：非法值整条退回 null（不许静默丢项）', () => {
	for (const bad of ['08:00,25:00', '08:60', '8:5', 'abc', '24:00', '12:00:30'])
		assert.equal(fns.parseDailyTimes(bad), null, bad);
	const many = Array.from({ length: 13 }, (_, i) =>
		String(i).padStart(2, '0') + ':00').join(',');
	assert.equal(fns.parseDailyTimes(many), null, '超过 12 个');
	assert.equal(fns.parseDailyTimes(Array.from({ length: 12 }, (_, i) =>
		String(i).padStart(2, '0') + ':00').join(',')).length, 12, '刚好 12 个可用');
});

test('r196 下一轮：当天 03:00 → 08:00（引擎 selftest 同一条）', () => {
	const now = at(2026, 10, 13, 3, 0);
	assert.equal(fns.nextFive(SECS, now)[0], at(2026, 10, 13, 8, 0));
});

test('r196 下一轮：当天 21:00 → 次日 02:00（跨天，不补跑）', () => {
	const now = at(2026, 10, 13, 21, 0);
	assert.equal(fns.nextFive(SECS, now)[0], at(2026, 10, 14, 2, 0));
});

test('r196 下一轮：恰好 08:00 起轮后落到 14:00（不会重复触发）', () => {
	const now = at(2026, 10, 13, 8, 0);
	assert.equal(fns.nextFive(SECS, now)[0], at(2026, 10, 13, 14, 0));
});

test('r196 预览：未来 5 次严格递增，且跨天连续', () => {
	const list = fns.nextFive(SECS, at(2026, 10, 13, 21, 0));
	assert.equal(list.length, 5);
	for (let i = 1; i < list.length; i++)
		assert.ok(list[i] > list[i - 1], `第 ${i} 次应晚于上一次`);
	assert.equal(list[1], at(2026, 10, 14, 8, 0));
	assert.equal(list[4], at(2026, 10, 15, 2, 0));
});

test('r196 静态契约：字段、预览挂载、状态文案、引擎守门都在产物里', () => {
	const engine = fs.readFileSync(ENGINE, 'utf8');
	for (const needle of [
		'function parseDailyTimes', 'function applyDailyPreview',
		'form.Value, \'daily_times\'', 'applyDailyPreview(node)',
		'st.daily_times', '定时实测：每天 %s'
	])
		assert.ok(src.includes(needle), '视图缺少 ' + needle);
	for (const needle of [
		'daily_times_norm()', 'daily_next_epoch()', 'schedule_due()',
		'left=$(schedule_due)', '"daily_times":"', 'daily_times 格式不合法'
	])
		assert.ok(engine.includes(needle), '引擎缺少 ' + needle);
	/* 不能退化成「永远不测」：非法时刻必须整条回退旧周期 */
	assert.ok(/C_DAILY=''/.test(engine), '非法时刻要清空 C_DAILY 回退 due_gap');
});
