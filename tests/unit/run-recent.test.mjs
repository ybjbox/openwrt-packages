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

/* r199：起轮标记。没有它的话，起轮后头几秒的流水会掺进上一轮的收尾 ——
 * tail 取的是文件末尾，本轮还没写几行时"末尾"就落在上一轮里。 */
test('r199 引擎：每轮第一行写起轮标记，且写在抢锁之后', () => {
	assert.ok(engine.includes("ROUND_MARK='===== 新一轮开始 ====='"), '缺起轮标记常量');
	/* 抢不到锁的那一轮根本没开始，不能留标记（否则「跳过本轮」会被当成新起点）；
	 * 标记也要早于配置告警 —— 告警属于这一轮，得落在标记之后才看得见。
	 * 这里按「制表符顶格的调用行」匹配，免得撞上注释里提到的同名函数。 */
	assert.match(engine,
		/if ! lock_acquire; then[\s\S]{0,700}?log "\$ROUND_MARK"[\s\S]{0,700}?\n\tcfg_warn_flush\n/,
		'标记必须落在 lock_acquire 成功之后、cfg_warn_flush 之前');
});

test('r199 引擎：流水从最后一条标记切起，本轮不足 8 行就只给这几行', () => {
	const seg = engine.slice(engine.indexOf('recent_tail()'), engine.indexOf('merge_recent()'));
	assert.ok(seg.includes('index($0, ENVIRON["MARK"])'), '按标记数行号（ENVIRON 传参，不用 awk -v）');
	assert.ok(!/awk -v [a-z]+=/.test(seg), 'awk -v 会解释反斜杠，不能用来传参');
	assert.ok(seg.includes('{ n = NR }'), '取最后一条标记的行号（后写覆盖前写）');
	assert.ok(seg.includes('tail -n +"$mark"'), '从标记行切起');
	assert.ok(seg.includes('tail -n 8'), '切完仍只取末 8 行');
	/* 没有标记（老日志/被 trim 掉）必须退回整段尾巴，不能给空数组 */
	assert.ok(/else\s+tail -n 8 "\$LOG"/.test(seg), '找不到标记要软退化到整段尾巴');
	assert.ok(/case "\$\{mark:-\}" in ''\|\*\[!0-9\]\*\) mark=0/.test(seg), '非数字行号要归零');
	assert.ok(engine.includes('rj=$(recent_tail | sed '), 'merge_recent 必须走 recent_tail');
	assert.ok(engine.includes('_recent) recent_tail ;;'), '缺离线自验入口 _recent');
});
