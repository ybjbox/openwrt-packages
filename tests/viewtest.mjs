// 用 stub 把 LuCI 视图模块跑起来，验证 renderTable/parseStatus 在引擎各种状态
// 输出下渲染出的文字、列数与对齐类名是否正确（纯 Node，不联网、不依赖真实 DOM）。
//
// 为什么单独一个文件而不是并进 shell 测试：lint 那个 job 跑在 alpine 容器里，
// 那里没有 Node；而视图的形状（列数、右对齐、六态文案）用 grep 断言根本表达不出来。
//
// 用法（仓库根目录执行）:
//   node tests/viewtest.mjs                  # 自动定位 cf-ipcheck 的 settings.js
//   node tests/viewtest.mjs <path-to-settings.js>
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const viewPath = process.argv[2] || path.join(here, '..', 'luci-app-cf-ipcheck',
	'htdocs', 'luci-static', 'resources', 'view', 'cf_ipcheck', 'settings.js');
if (!fs.existsSync(viewPath)) {
	console.log('NO-VIEWFILE: ' + viewPath);
	process.exit(1);
}

const src0 = fs.readFileSync(viewPath, 'utf8');
const marker = '\nreturn view.extend({';
if (!src0.includes(marker)) { console.log('NO-MARKER'); process.exit(1); }
// 在 return 之前插一个导出钩子，把私有函数拿出来单测
const hook = "\nglobalThis.__cf_t = { renderTable, parseStatus, countsText, domainKinds, stateLabel, reasonText, fmtTime, cfgText, scheduleText, staleText, notify, nodes, renderTabs, activateTab, savedTab, paneOf, getTabDefs: function () { return tabDefs; }, getTabs: function () { return tabs; } };\n";
const src = src0.replace(marker, hook + 'return view.extend({');

function collect(n, out) {
	if (n == null) return out;
	if (typeof n === 'string' || typeof n === 'number' ||
		(typeof n === 'object' && !n.__el && !Array.isArray(n))) {
		out.text += String(n);
		return out;
	}
	if (Array.isArray(n)) { n.forEach(x => collect(x, out)); return out; }
	if (n.__el) {
		out.nodes.push(n);
		(n.children || []).forEach(c => collect(c, out));
	}
	return out;
}

function E(tag, attrs, children) {
	const node = { __el: true, tag, attrs: attrs || {}, children: [], innerHTML: '', style: {} };
	node.appendChild = function (c) { node.children.push(c); return c; };
	node.addEventListener = function () {};
	node.setAttribute = function (k, v) { node.attrs[k] = v; };
	node.querySelector = function () { return null; };
	node.querySelectorAll = function () { return []; };
	/* activateTab / busy / 折叠那几处都是改写 .className 而不是 attrs.class，
	 * stub 得跟真 DOM 一样把这个属性映射回 attrs，否则断言读到的是初始值。 */
	Object.defineProperty(node, 'className', {
		get() { return this.attrs.class || ''; },
		set(v) { this.attrs.class = String(v); }
	});
	if (children != null) {
		const kids = Array.isArray(children) ? children : [ children ];
		kids.forEach(c => node.children.push(c));
	}
	return node;
}
function walk(node) { return collect(node, { text: '', nodes: [] }); }
function textOf(node) { return walk(node).text; }
function tags(node, tag) { return walk(node).nodes.filter(n => n.tag === tag); }
function headCount(node) { return tags(node, 'th').length; }
function rowCount(node) { return tags(node, 'tr').length - 1; }
function cellTexts(node, i) {
	const trs = tags(node, 'tr');
	return tags(trs[i], 'td').map(td => textOf(td).trim());
}

const noop = () => {};
// LuCI 在启动时给 String.prototype 加了 format（`'a %s'.format(x)` 满仓库都在用），
// stub 里补上同一条，否则测的是环境差异而不是视图逻辑。
String.prototype.format = function (...a) {
	let i = 0;
	return String(this).replace(/%s/g, () => String(a[i++]));
};
const _ = s => String(s);
const rpcStub = { declare: () => async () => '' };
const viewStub = { extend: o => o };
const formStub = { Map: function () {}, TypedSection: {}, Flag: {}, Value: {}, DynamicList: {} };
formStub.Map.prototype.section = () => ({ option: () => ({}) });

const uiStub = { addToast: noop, toast: noop };
const ctx = new Function('form', 'rpc', 'ui', 'view', 'E', '_', 'L', 'window', 'document',
	'setTimeout', 'setInterval', 'clearInterval', 'globalThis', src);
ctx(formStub, rpcStub, uiStub, viewStub, E, _, {
	addItem: noop, network: {}
}, {}, { getElementById: () => null, addEventListener: noop },
	() => 0, () => 1, () => 0, globalThis);

const t = globalThis.__cf_t;
if (!t) { console.log('NO-HOOK'); process.exit(1); }

let fails = 0;
function eq(desc, got, want) {
	if (String(got) === String(want)) console.log('[PASS] ' + desc);
	else { console.log(`[FAIL] ${desc}: got <${got}> want <${want}>`); fails++; }
}
function hasText(desc, node, sub) {
	const txt = typeof node === 'string' ? node : textOf(node);
	eq(desc + ' 含「' + sub + '」', txt.includes(sub) ? 'yes' : 'no ···' + txt.slice(0, 200), 'yes');
}

// ---- parseStatus 的三条失败分支必须互相区分 ----
eq('exec 失败(null) → unreachable', t.parseStatus(null).state, 'unreachable');
eq('空串 → never_run', t.parseStatus('').state, 'never_run');
eq('非 JSON → parse_error', t.parseStatus('curl: (23) boom').state, 'parse_error');

// ---- 正常榜单 ----
const done = t.parseStatus(JSON.stringify({
	state: 'done', pool: 256, qualified: 41, usable: 2, intercepted: 0,
	counts: { none: 41, timeout: 9, dns: 3 }, domains: 'www.cloudflare.com',
	finished: '2026-09-27T01:00:00Z',
	items: [
		{ ip: '104.16.1.1', code: 200, connect_ms: 100, tls_ms: 50, ttfb_ms: 118, total_ms: 270, colo: 'LAX', speed_mbytes: 10.6, domain: 'www.cloudflare.com' },
		{ ip: '104.16.2.2', code: 200, connect_ms: 90, tls_ms: 40, ttfb_ms: 100, total_ms: 150, colo: 'n/a', speed_mbytes: null, domain: 'www.cloudflare.com' }
	]
}));
let n = t.renderTable(done);
eq('单域名时列数 = 9', headCount(n), 9);
eq('数据行数 = 2', rowCount(n), 2);
hasText('列头是十进制 MB/s', n, '下载 MB/s');
eq('null 吞吐显示成 —', cellTexts(n, 2)[8], '—');
hasText('meta 里有失败分类', n, 'timeout 9');

// ---- 多域名时才多一列 ----
const two = JSON.parse(JSON.stringify(done));
two.items = [
	{ ip: '1.1.1.1', code: 200, total_ms: 1, ttfb_ms: 1, colo: 'HKG', speed_mbytes: 1, domain: 'a.example.com' },
	{ ip: '2.2.2.2', code: 200, total_ms: 2, ttfb_ms: 2, colo: 'NRT', speed_mbytes: 1, domain: 'b.example.com' }
];
eq('多域名时列数 = 10', headCount(t.renderTable(t.parseStatus(JSON.stringify(two)))), 10);

// ---- error / interrupted ----
n = t.renderTable(t.parseStatus('{"state":"error","reason":"interrupted","items":[]}'));
hasText('error 状态给出中止提示', n, '本轮中止');
hasText('interrupted 说明锁被回收', n, '运行锁已被回收');

n = t.renderTable(t.parseStatus('{"state":"error","reason":"empty_pool","items":[]}'));
hasText('empty_pool 给出下一步', n, '检测源可用性');

// ---- 新增的 sink 中止必须有自己的文案，不能落到 default 的“引擎报告本轮失败” ----
eq('sink_not_writable 说明 rc=23 与运行目录', t.reasonText('sink_not_writable').includes('rc=23'), true);
eq('sink_not_writable 不是兜底文案', t.reasonText('sink_not_writable').includes('引擎报告本轮失败'), false);

// ---- 后端不可用 / 输出不是 JSON ----
n = t.renderTable(t.parseStatus(null));
hasText('unreachable 明说执行不了什么', n, '无法执行 /usr/bin/cf-ipcheck');
n = t.renderTable(t.parseStatus('not json at all'));
hasText('parse_error 保留原文片段', n, 'not json at all');

// ---- 接管红条 / running ----
n = t.renderTable(t.parseStatus(JSON.stringify({ state: 'done', intercepted: 1, items: [] })));
hasText('接管时红条说明跳过机房与吞吐', n, '下载 MB/s');
n = t.renderTable(t.parseStatus('{"state":"running","started":"x","items":[]}'));
hasText('running 时表格给等待文案', n, '正在测速');

// ---- 时间：本地时分秒 + 相对时间，不能把 UTC 的 ISO 串原样印出来 ----
const isoNew = new Date(Date.now() - 5 * 60000).toISOString().replace(/\.\d+Z$/, 'Z');
const ft = t.fmtTime(isoNew);
eq('fmtTime 不出现 ISO 的 T/Z', /[TZ]/.test(ft), false);
eq('fmtTime 带相对时间', ft.includes('分钟前'), true);
eq('fmtTime 对垃圾输入原样返回', t.fmtTime('昨天下午'), '昨天下午');
eq('fmtTime 空值给 —', t.fmtTime(null), '—');

// ---- 数字列右对齐 ----
function cellClasses(node, rowIdx) {
	const trs = tags(node, 'tr');
	return tags(trs[rowIdx], 'td').map(td => td.attrs['class'] || '');
}
n = t.renderTable(done);
let cls = cellClasses(n, 1);
eq('列数与类名数量一致', cls.length, 9);
eq('TCP 列右对齐', cls[3].includes('right'), true);
eq('总计列右对齐', cls[6].includes('right'), true);
eq('吞吐列右对齐+等宽', cls[8], 'right mono');
eq('IP 列仍左对齐+等宽', cls[1], 'left mono');
eq('机房列改右对齐（否则与吞吐列之间空 160px）', cls[7], 'right');
const thW = tags(tags(n, 'tr')[0], 'th').map(td => td.attrs.style || '');
eq('表头不换行且带左右边距', thW.filter(s => /white-space:nowrap/.test(s) && /padding-left/.test(s)).length, 9);
const tds = tags(tags(n, 'tr')[1], 'td').map(td => td.attrs.style || '');
eq('单元格与表头同一边距（右对齐才不会错缝）', tds.filter(s => s === thW[2]).length >= 8, true);
// 收缩必须写 max-content：display:table 的 width:auto 在 Chrome 里是「铺满可用宽」，
// 铺满就会把多出来的宽度摊到每列，列与列之间裂出断层（真机 A/B 量过 173px vs 47px）。
const tbl = tags(n, 'div').find(d => String(d.attrs.class || '').includes('cbi-section-table'));
eq('表格按内容收缩，不铺满卡片', /width:max-content/.test(tbl.attrs.style || ''), true);
const wrap = tags(n, 'div').find(d => String(d.attrs.class || '').includes('cf-tablewrap'));
eq('表格外层有横向滚动容器（窄屏不撑宽整页）', !!wrap, true);
const thCls = tags(tags(n, 'tr')[0], 'th').map(td => td.attrs['class'] || '');
eq('表头与列同向对齐', thCls[6].includes('right'), true);

// ---- 本轮生效配置回显 ----
const withCfg = t.parseStatus(JSON.stringify({ state: 'done', budget: 256, port: 8443, items: [] }));
hasText('meta 回显本轮上限', t.renderTable(withCfg), '上限 256');
hasText('meta 回显端口', t.renderTable(withCfg), '8443');
eq('老状态里没有 budget 时不编一个出来', t.cfgText({ state: 'done' }), '');

// ---- 定时实测的下一轮提示 ----
eq('关掉时明说关闭', t.scheduleText({ enabled: 0 }), ' · 定时实测：关闭');
hasText('开启时报周期', t.scheduleText({ enabled: 1, interval: 6 }), '每 6 小时');
hasText('有完成时间时报下一轮', t.scheduleText({ enabled: 1, interval: 6, finished: isoNew }), '下一轮约');
eq('缺 interval 时不编时间', t.scheduleText({ enabled: 1 }).includes('下一轮'), false);

// ---- 过期提示 ----
const oldIso = new Date(Date.now() - 30 * 3600000).toISOString().replace(/\.\d+Z$/, 'Z');
hasText('结果超过周期时说过时', t.staleText({ state: 'done', finished: oldIso, interval: 6 }), '已超过设定的 6 小时周期');
eq('刚跑完不说过时', t.staleText({ state: 'done', finished: isoNew, interval: 6 }), '');
eq('running 时不说过时', t.staleText({ state: 'running', finished: oldIso, interval: 6 }), '');
eq('时间与相对时间被括号分开（不会粘成 20:29:35刚刚）', /\d\d:\d\d:\d\d（.+）$/.test(t.fmtTime(isoNew)), true);
eq('一分钟内的说法是刚刚', t.fmtTime(new Date().toISOString().replace(/\.\d+Z$/, 'Z')).includes('刚刚'), true);

// ---- notify 的页内兜底：真机那版 LuCI 两个 toast API 都不存在 ----
let toasted = null;
uiStub.addToast = (a, b, c) => { toasted = 'addToast:' + a + '|' + b + '|' + c; };
uiStub.toast = (a, b, c) => { toasted = 'toast:' + a + '|' + b + '|' + c; };
t.nodes.notice = { textContent: '', style: {}, className: '' };
t.notify('标题A', '正文A', 'warning');
eq('有 addToast 时优先用它', toasted.startsWith('addToast:标题A|正文A|warning'), true);
eq('有 toast 时不会去写页内提示', t.nodes.notice.textContent, '');
toasted = null;
uiStub.addToast = undefined;
t.notify('标题B', '正文B', 'error');
eq('只剩 ui.toast 时用它', toasted.startsWith('toast:error|标题B|正文B'), true);
toasted = null;
uiStub.toast = undefined;
t.notify('已复制 10 个 IP', '一行一个，可直接粘进客户端。', 'info');
eq('两个都没有时写进页内提示', t.nodes.notice.textContent.includes('已复制 10 个 IP'), true);
eq('页内提示被显示出来', t.nodes.notice.style.display, 'block');
eq('提示类型进 class', t.nodes.notice.className.includes('small'), true);
t.nodes.notice = null;
t.notify('没有提示节点也不能抛异常', 'x', 'info');
eq('nodes.notice 为 null 时静默返回', true, true);

// ---- 标签栏：三个面板 + 切换只改 class、不重建节点 ----
// 切换若重建面板，结果块刷新用的 nodes.table 会指向脱离文档的孤儿，
// 之后 replaceChild 静默失败、页面再也不更新 —— 这条断言就是钉住这一点。
const tabsEl = t.renderTabs([
	{ id: 'result', label: '榜单', count: 10 },
	{ id: 'sources', label: '源与检测', count: '' },
	{ id: 'config', label: '配置', count: 4 }
]);
const tabBtns = tags(tabsEl, 'button');
eq('标签数是 3', tabBtns.length, 3);
eq('标签栏是 tablist', String(tabsEl.attrs['role'] || ''), 'tablist');
eq('未选中的标签 aria-selected=false', String(tabBtns[0].attrs['aria-selected']), 'false');
hasText('第一个标签写榜单', tabBtns[0], '榜单');
hasText('计数进标签', tabBtns[0], '10');
const cnts = tags(tabsEl, 'span').filter(s => String(s.attrs.class || '').includes('cf-tab-cnt'));
eq('只有带计数的标签画计数徽标', cnts.length, 2);

// paneOf 把面板登记到 tabDefs，activateTab 只改 class / aria
const paneR = t.paneOf('result', t.renderTable(done));
const paneS = t.paneOf('sources', E('div', {}, 'src'));
const paneC = t.paneOf('config', E('div', {}, 'cfg'));
eq('面板初始是隐藏的', String(paneR.attrs.class), 'cf-pane');
eq('tabDefs 里结果面板被回填', t.getTabDefs()[0].pane === paneR, true);

t.activateTab('sources');
eq('切到源：源面板点亮', String(paneS.attrs.class), 'cf-pane is-on');
eq('切到源：结果面板收起', String(paneR.attrs.class), 'cf-pane');
eq('切到源：标签 aria 跟着翻', String(tabBtns[1].attrs['aria-selected']), 'true');
eq('切到源：旧标签 aria 归 false', String(tabBtns[0].attrs['aria-selected']), 'false');
eq('切到源：标签按钮 class 带 is-on', String(tabBtns[1].attrs.class), 'cf-tab is-on');
eq('切换不新建面板（节点同一性保持）', t.getTabDefs()[1].pane === paneS, true);

// 面板容器本身必须一直在（display:none 而不是被摘掉），否则 replaceChild 会失败
eq('隐藏面板的父容器仍在（不拆节点）', !!paneR.__el && !!t.getTabDefs()[0].pane, true);

// savedTab：没有记录 / 记录是野值时都回落到第一个标签
const savedSansStore = t.savedTab();
eq('localStorage 不可用时 savedTab 回落第一个标签', savedSansStore, 'result');

console.log(fails === 0 ? '=== view 渲染断言全部通过' : `=== view 渲染断言失败 ${fails} 项`);
process.exit(fails === 0 ? 0 : 1);
