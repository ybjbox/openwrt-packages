// 用 stub 把 LuCI 视图模块跑起来，验证读数面板在各种引擎状态下的渲染结果：
// 状态文案、列数与对齐、数字格式化、失败三态、标签切换的节点同一性、分组重组。
// 纯 Node，不联网、不依赖真实 DOM。
//
// 为什么单独一个文件而不是并进 shell 测试：lint 那个 job 跑在 alpine 容器里，
// 那里没有 Node；而「列数 / 右对齐 / 三态区分」这些约束用 grep 断言根本表达不出来。
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
// 在 return 之前插一个导出钩子，把私有函数拿出来单测。
// 注意：需要「活引用」的（store、P）用 getter 导出，因为模块里会重新赋值/打补丁。
const hook = "\nglobalThis.__cf_t = {\n" +
	"\tparseStatus: parseStatus, parseSources: parseSources,\n" +
	"\ttone: tone, stateWord: stateWord, why: why,\n" +
	"\tnum: num, ms: ms, mbps: mbps, ago: ago, clock: clock,\n" +
	"\tstale: stale, scheduleLine: scheduleLine, DASH: DASH,\n" +
	"\tLeaderboard: Leaderboard, COLS: COLS, domainKinds: domainKinds,\n" +
	"\tSummaryStrip: SummaryStrip, BoardPane: BoardPane,\n" +
	"\tSourceMatrix: SourceMatrix, SourcesPane: SourcesPane, srcMessage: srcMessage,\n" +
	"\tTabBar: TabBar, StatusRail: StatusRail, Readout: Readout,\n" +
	"\tregroupForm: regroupForm, ConfigPane: ConfigPane,\n" +
	"\thelp: help, applyHelp: applyHelp, HelpMark: HelpMark, HELP: HELP,\n" +
	"\tTAB_DEFS: TAB_DEFS, GROUPS: GROUPS, GROUP_OPTIONS: GROUP_OPTIONS,\n" +
	"\tCSS: CSS, el: el, get store() { return store; },\n" +
	"\tget P() { return P; }, goto: goto, savedTab: savedTab,\n" +
	"\tbuildPage: buildPage, runCmd: runCmd\n" +
	"};\n";
const src = src0.replace(marker, hook + 'return view.extend({');

/* ------------------------------------------------------------------ *
 * 最小 DOM stub
 *
 * 视图用的是 document.createElement + addEventListener + setAttribute +
 * querySelector(All) + classList(经由 className 字符串) + style + focus。
 * 这里逐个补齐，够跑通组件即可 —— 目标是断言「渲染出来的形状」，不是当浏览器。
 * ------------------------------------------------------------------ */
function makeNode(tag) {
	const node = {
		tagName: String(tag).toUpperCase(),
		childNodes: [],
		attrs: {},
		style: {},
		_events: {},
		_listeners: {},
		textContent: '',
		innerHTML: '',
		parentNode: null,
		__el: true
	};
	node.appendChild = function (c) {
		if (c && c.__txt) {
			this.childNodes.push(c);
		} else if (c) {
			c.parentNode = this;
			this.childNodes.push(c);
		}
		return c;
	};
	node.removeChild = function (c) {
		const i = this.childNodes.indexOf(c);
		if (i >= 0) this.childNodes.splice(i, 1);
		if (c) c.parentNode = null;
		return c;
	};
	Object.defineProperty(node, 'firstChild', {
		get() { return this.childNodes[0] || null; }
	});
	Object.defineProperty(node, 'children', {
		get() { return this.childNodes.filter(c => !c.__txt); }
	});
	Object.defineProperty(node, 'className', {
		get() { return this.attrs['class'] || ''; },
		set(v) { this.attrs['class'] = String(v); }
	});
	Object.defineProperty(node, 'textContent', {
		get() {
			if (this._ownText != null && !this.childNodes.length) return this._ownText;
			let s = '';
			const dig = n => {
				if (n.__txt) { s += n.data; return; }
				if (n._ownText != null && !(n.childNodes || []).length) { s += n._ownText; return; }
				(n.childNodes || []).forEach(dig);
			};
			dig(this);
			return s;
		},
		set(v) { this.childNodes = []; this._ownText = String(v); }
	});
	Object.defineProperty(node, 'value', {
		get() { return this._value != null ? this._value : (this.attrs.value || ''); },
		set(v) { this._value = v; }
	});
	['disabled', 'checked', 'hidden'].forEach(k => {
		Object.defineProperty(node, k, {
			get() { return !!this['_' + k]; },
			set(v) { this['_' + k] = !!v; if (v) this.attrs[k] = ''; else delete this.attrs[k]; }
		});
	});
	node.addEventListener = function (ev, fn) {
		(this._listeners[ev] = this._listeners[ev] || []).push(fn);
	};
	node.removeEventListener = function (ev, fn) {
		const a = this._listeners[ev] || [];
		const i = a.indexOf(fn);
		if (i >= 0) a.splice(i, 1);
	};
	node.dispatch = function (ev, arg) {
		(this._listeners[ev] || []).forEach(fn => fn(arg || { preventDefault() {}, key: '' }));
	};
	node.setAttribute = function (k, v) { this.attrs[k] = String(v); };
	node.getAttribute = function (k) { return this.attrs[k] != null ? this.attrs[k] : null; };
	node.removeAttribute = function (k) { delete this.attrs[k]; };
	node.hasAttribute = function (k) { return Object.prototype.hasOwnProperty.call(this.attrs, k); };
	node.focus = function () { this._focused = true; };
	/* 只支持选择器里真正用到的那几种：.cls / #id / tag / [attr] / a.b */
	node.querySelectorAll = function (sel) {
		const out = [];
		const dig = n => {
			(n.childNodes || []).forEach(c => {
				if (!c.__txt && matchSel(c, sel)) out.push(c);
				if (!c.__txt) dig(c);
			});
		};
		dig(this);
		return out;
	};
	node.querySelector = function (sel) {
		const all = this.querySelectorAll(sel);
		return all.length ? all[0] : null;
	};
	node.closest = function (sel) {
		let n = this;
		while (n) {
			if (matchSel(n, sel)) return n;
			n = n.parentNode;
		}
		return null;
	};
	node.contains = function (n) {
		while (n) { if (n === this) return true; n = n.parentNode; }
		return false;
	};
	/* 真 DOM 把若干 attributes 也影子成同名属性。视图里用到的是 label.htmlFor
	 * （= for）与 input.id/name（= id/name）。不补这条，regroupForm 读到的
	 * htmlFor 永远是 undefined，字段会被当成「没有归属」。 */
	Object.defineProperty(node, 'htmlFor', {
		get() { return this.attrs['for'] != null ? this.attrs['for'] : undefined; },
		set(v) { this.attrs['for'] = String(v); }
	});
	Object.defineProperty(node, 'id', {
		get() { return this.attrs.id != null ? this.attrs.id : ''; },
		set(v) { this.attrs.id = String(v); }
	});
	Object.defineProperty(node, 'name', {
		get() { return this.attrs.name != null ? this.attrs.name : ''; },
		set(v) { this.attrs.name = String(v); }
	});
	Object.defineProperty(node, 'title', {
		get() { return this.attrs.title != null ? this.attrs.title : ''; },
		set(v) { this.attrs.title = String(v); }
	});
	return node;
}

/* 够用的选择器匹配：支持 "tag"、"tag.cls"、".cls"、"#id"、".cls .cls"（后代） */
function matchSel(node, sel) {
	sel = String(sel).trim();
	if (sel.includes(' ')) {
		/* 后代选择器：只判断最后一段（祖先关系在上层 querySelectorAll 的遍历里已保证） */
		const parts = sel.split(/\s+/);
		return matchSel(node, parts[parts.length - 1]);
	}
	let rest = sel;
	const mTag = rest.match(/^[a-zA-Z][\w-]*/);
	if (mTag) {
		if (node.tagName !== mTag[0].toUpperCase()) return false;
		rest = rest.slice(mTag[0].length);
	}
	const mId = rest.match(/^#[\w-]+/);
	if (mId) {
		if (node.attrs.id !== mId[0].slice(1)) return false;
		rest = rest.slice(mId[0].length);
	}
	const classes = [];
	let cm;
	const cRe = /\.([\w-]+)/g;
	while ((cm = cRe.exec(rest))) classes.push(cm[1]);
	if (classes.length) {
		const own = String(node.attrs['class'] || '').split(/\s+/);
		for (const c of classes) if (!own.includes(c)) return false;
	}
	const aRe = /\[([\w-]+)(?:=([^\]]+))?\]/g;
	let am;
	while ((am = aRe.exec(rest))) {
		const k = am[1];
		if (!(k in node.attrs)) return false;
		if (am[2] != null && String(node.attrs[k]) !== am[2].replace(/^["']|["']$/g, '')) return false;
	}
	return true;
}

const documentStub = {
	createElement: tag => makeNode(tag),
	createTextNode: data => ({ __txt: true, data: String(data) }),
	getElementById: () => null,
	addEventListener: () => {},
	body: makeNode('body'),
	documentElement: makeNode('html')
};

function walk(node, out) {
	out = out || { nodes: [] };
	if (!node) return out;
	if (node.__txt) return out;
	out.nodes.push(node);
	(node.childNodes || []).forEach(c => walk(c, out));
	return out;
}
function all(node) { return walk(node).nodes; }
function byClass(node, cls) {
	/* 支持一次传多个 class（"pane on"），全部命中才算 */
	const want = String(cls).split(/\s+/).filter(Boolean);
	return all(node).filter(n => {
		const own = String(n.attrs['class'] || '').split(/\s+/);
		return want.every(c => own.includes(c));
	});
}
function byTag(node, tag) { return all(node).filter(n => n.tagName === String(tag).toUpperCase()); }
function textOf(node) { return String(node && node.textContent || ''); }
function hasText(node, sub) { return textOf(node).includes(sub); }
function byData(node, key) { return all(node).filter(n => n.attrs['data-' + key] != null); }

const noop = () => {};
String.prototype.format = function (...a) {
	let i = 0;
	return String(this).replace(/%s/g, () => String(a[i++]));
};

/* localStorage：默认「不存在」以复现无痕/被禁的情形，需要时再挂一个假的 */
let lsData = null;
const windowStub = {
	get localStorage() {
		if (lsData === null) return undefined;
		return {
			getItem: k => (k in lsData ? lsData[k] : null),
			setItem: (k, v) => { lsData[k] = String(v); },
			removeItem: k => { delete lsData[k]; }
		};
	},
	isSecureContext: false
};

const _ = s => String(s);
const rpcStub = { declare: () => async () => '' };
const viewStub = { extend: o => o };
function MapStub() { this.sections = []; }
MapStub.prototype.section = function () {
	const sec = { options: [], option: function (T, name) { const o = { name: name, __opt: true }; this.options.push(o); return o; } };
	this.sections.push(sec);
	return sec;
};

const formStub = {
	Map: MapStub,
	TypedSection: 'TypedSection',
	Flag: 'Flag',
	Value: 'Value',
	DynamicList: 'DynamicList'
};

const uiStub = { addToast: noop, toast: noop };
const ctx = new Function('form', 'rpc', 'ui', 'view', 'E', '_', 'L', 'window', 'document',
	'setTimeout', 'setInterval', 'clearInterval', 'navigator', 'globalThis', src);
ctx(formStub, rpcStub, uiStub, viewStub, () => makeNode('div'), _, {
	addItem: noop, network: {}
}, windowStub, documentStub,
	() => 0, () => 0, () => 0,
	{ clipboard: undefined }, globalThis);

const t = globalThis.__cf_t;
if (!t) { console.log('NO-HOOK'); process.exit(1); }

let fails = 0;
function eq(desc, got, want) {
	if (String(got) === String(want)) console.log('[PASS] ' + desc);
	else { console.log(`[FAIL] ${desc}: got <${got}> want <${want}>`); fails++; }
}
function ok(desc, cond) { eq(desc, cond ? 'yes' : 'no', 'yes'); }
function has(desc, node, sub) {
	const txt = typeof node === 'string' ? node : textOf(node);
	eq(desc + ' 含「' + sub + '」', txt.includes(sub) ? 'yes' : 'no ···' + txt.slice(0, 220), 'yes');
}
function hasNot(desc, node, sub) {
	const txt = typeof node === 'string' ? node : textOf(node);
	eq(desc + ' 不含「' + sub + '」', txt.includes(sub) ? 'no ···' + txt.slice(0, 220) : 'yes', 'yes');
}

/* ================================================================== *
 * 1. 解析层：三种「读不到」必须互相区分（整页可信度的地基）
 * ================================================================== */
eq('exec 失败(null) → unreachable', t.parseStatus(null).state, 'unreachable');
eq('空串 → never_run', t.parseStatus('').state, 'never_run');
eq('非 JSON → parse_error', t.parseStatus('curl: (23) boom').state, 'parse_error');
eq('parse_error 保留原文', t.parseStatus('garbage').raw, 'garbage');
eq('items 缺失时补成空数组', t.parseStatus('{"state":"done"}').items.length, 0);
eq('intercepted 字符串 "1" 归一成数字 1', t.parseStatus('{"state":"done","intercepted":"1"}').intercepted, 1);
ok('合法 JSON 原样通过', t.parseStatus('{"state":"done","pool":3}').pool === 3);

eq('源检测 exec 失败 → unreachable', t.parseSources(null).state, 'unreachable');
eq('源检测空串 → empty', t.parseSources('').state, 'empty');
eq('源检测空数组 → empty', t.parseSources('[]').state, 'empty');
eq('源检测非 JSON → parse_error', t.parseSources('<html>').state, 'parse_error');
eq('源检测正常 → ok', t.parseSources('[{"url":"x"}]').state, 'ok');

/* ================================================================== *
 * 2. 格式化：null 不编数，单位要对，时间不印 ISO
 * ================================================================== */
eq('num(null) 给破折号', t.num(null), t.DASH);
eq('num(undefined) 给破折号', t.num(undefined), t.DASH);
eq('num(0) 是 0 不是破折号', t.num(0), '0');
eq('num 支持小数位', t.num(1.234, 1), '1.2');
eq('ms 保留一位小数（同列好竖着比）', t.ms(123), '123.0');
eq('ms 小数保留一位', t.ms(12.34), '12.3');
eq('ms(null) 给破折号', t.ms(null), t.DASH);
eq('ms(0) 是 0 不是破折号（握手确实很快）', t.ms(0), '0.0');
eq('mbps 十进制两位小数', t.mbps(10.64), '10.64');
eq('mbps 不足两位补零', t.mbps(10.6), '10.60');
eq('mbps(0) 给破折号（=0 视为没测出来）', t.mbps(0), t.DASH);
eq('mbps(null) 给破折号', t.mbps(null), t.DASH);

const isoNew = new Date(Date.now() - 5 * 60000).toISOString().replace(/\.\d+Z$/, 'Z');
const agoStr = t.ago(isoNew);
ok('ago 输出相对时间', /分钟前/.test(agoStr));
eq('ago 不印 ISO 的 T/Z', /[TZ]/.test(agoStr), false);
eq('clock 输出本地时分秒', /^\d\d:\d\d:\d\d（.+）$/.test(t.clock(isoNew)), true);
eq('clock 吃掉 ISO 的 T/Z', /[TZ]/.test(t.clock(isoNew)), false);
eq('ago 对垃圾输入给空串（不编「刚刚」）', t.ago('昨天下午'), '');
eq('ago(null) 给空串', t.ago(null), '');
eq('clock(垃圾) 给破折号', t.clock('昨天下午'), t.DASH);
eq('clock(null) 给破折号', t.clock(null), t.DASH);
ok('一分钟内说「刚刚」', /刚刚/.test(t.ago(new Date().toISOString().replace(/\.\d+Z$/, 'Z'))));

/* ================================================================== *
 * 3. 语义色与状态词：五种 tone 各有明确触发条件
 * ================================================================== */
eq('never_run → idle', t.tone({ state: 'never_run' }), 'idle');
eq('running → run', t.tone({ state: 'running' }), 'run');
eq('error → bad', t.tone({ state: 'error' }), 'bad');
eq('unreachable → bad', t.tone({ state: 'unreachable' }), 'bad');
eq('parse_error → bad', t.tone({ state: 'parse_error' }), 'bad');
eq('done 有榜单 → ok', t.tone({ state: 'done', items: [{}] }), 'ok');
eq('done 无榜单 → warn（完成但没结果）', t.tone({ state: 'done', items: [] }), 'warn');
eq('done 被接管 → warn（读数不可信）', t.tone({ state: 'done', intercepted: 1, items: [{}] }), 'warn');
eq('running 状态词', t.stateWord({ state: 'running' }), '测速中');
ok('never_run 状态词明说还没跑', /未测|没有|尚未/.test(t.stateWord({ state: 'never_run' })));
eq('done 状态词', t.stateWord({ state: 'done', items: [{}] }), '已完成');

/* 中止原因：sink 写入失败必须有自己的文案，不能落到兜底那句 */
ok('interrupted 说明锁被回收', /锁/.test(t.why('interrupted')));
ok('sink_not_writable 提到 rc=23', t.why('sink_not_writable').includes('rc=23'));
ok('sink_not_writable 不是兜底文案', !t.why('sink_not_writable').includes('引擎报告'));
ok('empty_pool 给出下一步', /源|检测/.test(t.why('empty_pool')));
ok('未知原因才走兜底', /失败/.test(t.why('something_new')));

/* ================================================================== *
 * 4. 榜单：列数随「胜出域名种类」变，数字列一律右对齐
 * ================================================================== */
const done = t.parseStatus(JSON.stringify({
	state: 'done', pool: 256, qualified: 41, usable: 2, intercepted: 0,
	counts: { none: 41, timeout: 9, dns: 3 }, domains: 'www.cloudflare.com',
	finished: isoNew,
	items: [
		{ ip: '104.16.1.1', code: 200, connect_ms: 100, tls_ms: 50, ttfb_ms: 118, total_ms: 270, colo: 'LAX', speed_mbytes: 10.6, domain: 'www.cloudflare.com' },
		{ ip: '104.16.2.2', code: 200, connect_ms: 90, tls_ms: 40, ttfb_ms: 100, total_ms: 150, colo: 'n/a', speed_mbytes: null, domain: 'www.cloudflare.com' }
	]
}));

let lb = t.Leaderboard(done.items);
let heads = byClass(lb, 'head')[0];
eq('单域名时列数 = 9', byClass(heads, 'bc').length, 9);
eq('数据行数 = 2', byClass(lb, 'data').length, 2);
has('列头用 MB/s', heads, 'MB/s');
hasNot('列头不该出现「下载 MB/s」这种长词', heads, '云计算');

/* 列对齐：数字列 r，IP / 域名 l */
function headCls(lb) { return byClass(byClass(lb, 'head')[0], 'bc').map(d => d.attrs['class']); }
let hc = headCls(lb);
eq('名次列右对齐', hc[0], 'bc r');
eq('IP 列左对齐', hc[1], 'bc l');
eq('HTTP 列右对齐', hc[2], 'bc r');
eq('TCP 列右对齐', hc[3], 'bc r');
eq('总计列右对齐', hc[6], 'bc r');
eq('机房列右对齐', hc[7], 'bc r');
eq('吞吐列右对齐', hc[8], 'bc r');
eq('表头行有 role=row', heads.attrs.role, 'row');
eq('表头单元格有 columnheader', byClass(heads, 'bc')[0].attrs.role, 'columnheader');

/* 数据行：名次弱化、IP 等宽、状态码上色、吞吐带迷你条 */
let rows = byClass(lb, 'data');
eq('第一名带 top 强调', rows[0].attrs['class'], 'brow data top');
eq('第二名不带 top', rows[1].attrs['class'], 'brow data');
ok('名次用弱化小字', byClass(rows[0], 'rk').length === 1);
ok('IP 单元格等宽', byClass(rows[0], 'ip').length === 1);
ok('2xx 用 ok 色', byClass(rows[0], 'code-ok').length >= 1);
ok('吞吐有迷你条', byClass(rows[0], 'spd-fill').length === 1);
eq('迷你条宽度进了 style', byClass(rows[0], 'spd-fill')[0].style.width, '100%');
ok('吞吐为 null 时不画条', byClass(rows[1], 'spd-fill').length === 0);

/* 单一域名不占地方；出现两种才加列 */
eq('只有一种域名时不算多域名', t.domainKinds(done.items), 1);
const twoDom = done.items.map((it, i) => Object.assign({}, it, { domain: i ? 'b.example.com' : 'a.example.com' }));
eq('两种域名时计数为 2', t.domainKinds(twoDom), 2);
lb = t.Leaderboard(twoDom);
eq('多域名时列数 = 10', byClass(byClass(lb, 'head')[0], 'bc').length, 10);
ok('多域名时容器带 multi 标记', /multi/.test(lb.attrs['class']));
has('多域名时出现「胜出域名」列', lb, '胜出域名');
eq('空榜单不渲染', t.Leaderboard([]), null);

/* ================================================================== *
 * 5. 汇总读数带：只呈现引擎真给了的数
 * ================================================================== */
let strip = t.SummaryStrip(done);
has('读数带给出候选池', strip, '候选池');
has('读数带给出达标数', strip, '达标');
has('读数带给出榜单条数', strip, '榜单');
has('读数带给出失败分类', strip, 'timeout 9');
ok('失败分类用 warn 色', byClass(strip, 'warn').length >= 1);
has('读数带给出完成时间', strip, '完成于');
/* 引擎没给 pool 时这一格仍然在（结构稳定），但值是破折号而不是编出来的 0 */
const bare = t.SummaryStrip({ state: 'done', items: [] });
has('缺 pool 时值显示成破折号', byClass(bare, 'n')[0].textContent, t.DASH);
eq('缺 counts 时不画未达标格', hasText(bare, '未达标'), false);

/* ================================================================== *
 * 6. 榜单面板：五种状态各有各的说法，且互相不串味
 * ================================================================== */
const noActions = { run: noop, stop: noop, refresh: noop, copy: noop, check: noop };

let pane = t.BoardPane(done, noActions);
has('正常态渲染榜单', pane, '104.16.1.1');
has('正常态给出排序说明', pane, '按总耗时升序');

pane = t.BoardPane(t.parseStatus(JSON.stringify({ state: 'done', intercepted: 1, items: [] })), noActions);
has('接管态给出红条', pane, '出口被代理接管');
has('接管态说明跳过机房与吞吐', pane, '跳过机房与吞吐');
ok('接管态红条用 bad 色', byClass(pane, 'bad').length >= 1);

pane = t.BoardPane(t.parseStatus('{"state":"running","started":"x","items":[]}'), noActions);
has('运行态给等待文案', pane, '正在测速');
ok('运行态有转圈指示', byClass(pane, 'spin').length >= 1);
hasNot('运行态不画空榜单表', pane, '按总耗时升序');

pane = t.BoardPane(t.parseStatus(null), noActions);
has('unreachable 明说执行不了什么', pane, '无法执行 /usr/bin/cf-ipcheck');
has('unreachable 给出重新读取', pane, '重新读取');

pane = t.BoardPane(t.parseStatus('not json at all'), noActions);
has('parse_error 保留原文片段', pane, 'not json at all');
has('parse_error 与 unreachable 措辞不同', pane, '读不懂');

pane = t.BoardPane(t.parseStatus('{"state":"error","reason":"interrupted","items":[]}'), noActions);
has('error 态说明本轮中止', pane, '本轮没有跑完');
has('error 态解释原因', pane, '运行锁已被回收');
has('error 态仍给重跑按钮', pane, '立即测速');

/* 本轮失败但上一轮榜单还在 → 照样展示 */
const errWithItems = t.parseStatus(JSON.stringify({ state: 'error', reason: 'net', items: done.items }));
pane = t.BoardPane(errWithItems, noActions);
has('失败但有旧榜单时仍然列出', pane, '104.16.1.1');

pane = t.BoardPane(t.parseStatus('{"state":"never_run","items":[]}'), noActions);
has('从未跑过给首轮引导', pane, '还没有测过');
pane = t.BoardPane(t.parseStatus('{"state":"done","items":[]}'), noActions);
has('跑完但空榜单时指向配置页', pane, '测速与判定');

/* ================================================================== *
 * 7. 源检测：段内占比是判定源是否还可用的关键
 * ================================================================== */
const srcRows = [
	{ url: 'https://a.example/ips.txt', http: '200', rc: 0, ips: 100, cf_in: 98 },
	{ url: 'https://b.example/ips.txt', http: '200', rc: 0, ips: 100, cf_in: 40 },
	{ url: 'https://c.example/ips.txt', http: '000', rc: 28, ips: 0, cf_in: 0 }
];
let sm = t.SourceMatrix(srcRows);
eq('源矩阵列数 = 5', byClass(byClass(sm, 'head')[0], 'bc').length, 5);
eq('源矩阵行数 = 3', byClass(sm, 'data').length, 3);
has('源矩阵列头有 CF 段内', sm, 'CF 段内');
has('源矩阵算出段内占比', sm, '98%');
ok('低占比标黄', byClass(sm, 'code-odd').length >= 1);
ok('正常占比标绿', byClass(sm, 'code-ok').length >= 1);
has('拉不到的源标「拉不到」', sm, '拉不到');

let sp = t.SourcesPane(null, { check: noop });
has('未检测时说明这一页干嘛', sp, '还没有检测过');
has('未检测时给检测按钮', sp, '开始检测');
sp = t.SourcesPane({ state: 'checking' }, { check: noop });
has('检测中给等待文案', sp, '正在拉取源');
sp = t.SourcesPane({ state: 'ok', rows: srcRows }, { check: noop });
has('检测完成渲染矩阵', sp, 'a.example');
has('检测完成给 CF 段内说明', sp, 'CF 段内');
sp = t.SourcesPane({ state: 'unreachable' }, { check: noop });
has('检测执行不了说明原因', sp, '无法执行');
sp = t.SourcesPane({ state: 'empty' }, { check: noop });
has('空源清单指向配置页', sp, '候选池来源');
sp = t.SourcesPane({ state: 'parse_error', raw: 'oops' }, { check: noop });
has('检测输出读不懂保留原文', sp, 'oops');

/* ================================================================== *
 * 8. 标签栏：切换只翻 class / aria，绝不重建节点
 * ================================================================== */
let picked = null;
const bar = t.TabBar([
	{ id: 'board', label: '榜单', count: 12 },
	{ id: 'sources', label: '源与检测' },
	{ id: 'config', label: '配置', count: 4 }
], 'board', id => { picked = id; });

const tabs = byClass(bar, 'tab');
eq('标签数 = 3', tabs.length, 3);
eq('标签栏 role=tablist', bar.attrs.role, 'tablist');
eq('当前标签 class 带 on', tabs[0].attrs['class'], 'tab on');
eq('当前标签 aria-selected=true', tabs[0].attrs['aria-selected'], 'true');
eq('非当前标签 aria-selected=false', tabs[1].attrs['aria-selected'], 'false');
eq('当前标签可聚焦', tabs[0].attrs.tabindex, '0');
eq('非当前标签 tabindex=-1', tabs[1].attrs.tabindex, '-1');
has('标签带计数', tabs[0], '12');
eq('无计数的标签不画徽标', byClass(tabs[1], 'tab-n').length, 0);
eq('有计数的标签画徽标', byClass(tabs[0], 'tab-n').length, 1);
eq('记录当前标签便于调试', bar.attrs['data-current'], 'board');

tabs[1].dispatch('click');
eq('点标签回调带上 id', picked, 'sources');

/* 键盘：左右 + Home/End */
picked = null;
tabs[0].dispatch('keydown', { preventDefault: noop, key: 'ArrowRight' });
eq('右方向键走到下一个', picked, 'sources');
picked = null;
tabs[0].dispatch('keydown', { preventDefault: noop, key: 'ArrowLeft' });
eq('左方向键回绕到末位', picked, 'config');
picked = null;
tabs[1].dispatch('keydown', { preventDefault: noop, key: 'Home' });
eq('Home 跳到首位', picked, 'board');
picked = null;
tabs[1].dispatch('keydown', { preventDefault: noop, key: 'End' });
eq('End 跳到末位', picked, 'config');
picked = null;
tabs[1].dispatch('keydown', { preventDefault: noop, key: 'a' });
eq('无关按键不触发切换', picked, null);

/* ================================================================== *
 * 9. 状态读数条：常驻，任何状态下都得说清「现在是什么」
 * ================================================================== */
let rail = t.StatusRail(done, {}, noActions);
has('读数条给出状态词', rail, '已完成');
/* 首帧只有 status、没有 enabled 字段（load 里能拿到引擎带出来的 enabled），
 * 所以「定时实测」这句在真机上取决于引擎是否回传该字段。 */
has('读数条在引擎回传 enabled 时给出定时说明',
	t.StatusRail(Object.assign({}, done, { enabled: 1, interval: 6 }), {}, noActions), '定时实测');
ok('读数条有主操作按钮', byTag(rail, 'button').length >= 1);
eq('读数条四个操作入口', byTag(rail, 'button').length, 4);

rail = t.StatusRail({ state: 'never_run', items: [] }, {}, noActions);
has('未跑过时读数条说明', rail, '尚未运行');

rail = t.StatusRail({ state: 'running', started: isoNew, items: [] }, {}, noActions);
has('运行中读数条给停止入口', rail, '停止');
ok('运行中「立即测速」被禁用', byTag(rail, 'button')[0].disabled === true);

rail = t.StatusRail({ state: 'unreachable', items: [] }, {}, noActions);
eq('读不到时状态灯用 bad 色', byClass(rail, 'lamp')[0].attrs['class'], 'lamp t-bad');
rail = t.StatusRail({ state: 'running', items: [] }, {}, noActions);
eq('运行中状态灯用 run 色', byClass(rail, 'lamp')[0].attrs['class'], 'lamp t-run');
rail = t.StatusRail({ state: 'never_run', items: [] }, {}, noActions);
eq('从未跑过状态灯用 idle 色', byClass(rail, 'lamp')[0].attrs['class'], 'lamp t-idle');
rail = t.StatusRail(done, {}, noActions);
eq('正常完成状态灯用 ok 色', byClass(rail, 'lamp')[0].attrs['class'], 'lamp t-ok');

/* 过期提示：结果老过设定的周期才提，刚跑完 / 正在跑都不提 */
const oldIso = new Date(Date.now() - 30 * 3600000).toISOString().replace(/\.\d+Z$/, 'Z');
eq('超过周期时判为过时', t.stale({ state: 'done', finished: oldIso, interval: 6 }), true);
eq('刚跑完不判过时', t.stale({ state: 'done', finished: isoNew, interval: 6 }), false);
eq('运行中不判过时', t.stale({ state: 'running', finished: oldIso, interval: 6 }), false);
eq('缺 interval 不判过时', t.stale({ state: 'done', finished: oldIso }), false);

/* 定时说明 */
eq('关掉时明说关闭', t.scheduleLine({ enabled: 0 }), '定时实测：关闭');
eq('缺 enabled 时不编周期', t.scheduleLine({}), '');
has('开启时报周期', t.scheduleLine({ enabled: 1, interval: 6 }), '每 6 小时');
has('有完成时间时报下一轮', t.scheduleLine({ enabled: 1, interval: 6, finished: isoNew }), '下一轮约');
eq('缺 interval 时不编时间', t.scheduleLine({ enabled: 1 }).includes('下一轮'), false);

/* ================================================================== *
 * 10. 配置分组：字段一个都不能丢
 * ================================================================== */
function fakeForm(optionNames) {
	const map = makeNode('div');
	['基本设置', '候选池来源', '测速与判定', 'Gist 上传'].forEach(title => {
		const sec = makeNode('section');
		sec.attrs['class'] = 'cbi-section';
		const h3 = makeNode('h3');
		h3.appendChild(documentStub.createTextNode(title));
		sec.appendChild(h3);
		const node = makeNode('div');
		node.attrs['class'] = 'cbi-section-node';
		sec.appendChild(node);
		map.appendChild(sec);
	});
	/* 先建好 section 再按标题分配字段，模拟 form.js 的产出顺序 */
	optionNames.forEach(name => {
		const row = makeNode('div');
		row.attrs['class'] = 'cbi-value';
		const lab = makeNode('label');
		lab.attrs['for'] = 'widget.cf_ipcheck.' + name;
		row.appendChild(lab);
		const first = map.querySelectorAll('.cbi-section')[0];
		first.querySelectorAll('.cbi-section-node')[0].appendChild(row);
	});
	return map;
}

const allOptions = [];
Object.keys(t.GROUP_OPTIONS).forEach(g => t.GROUP_OPTIONS[g].forEach(o => allOptions.push(o)));
const mapNode = fakeForm(allOptions);
/* 再塞一个不属于任何分组的字段，验证兜底组 */
const stray = makeNode('div');
stray.attrs['class'] = 'cbi-value';
const strayLab = makeNode('label');
strayLab.attrs['for'] = 'widget.cf_ipcheck.某个未来字段';
stray.appendChild(strayLab);
mapNode.querySelectorAll('.cbi-section-node')[1].appendChild(stray);

const grps = t.regroupForm(mapNode);
ok('重组返回容器', !!grps);
const boxes = byData(grps, 'group');
eq('分组数 = 4', boxes.length, 4);
let moved = 0;
boxes.forEach(b => { moved += byClass(b, 'brow').length + b.querySelectorAll('.cbi-value').length; });
eq('所有字段都被搬进分组', moved, allOptions.length);
has('未归类字段进兜底组', grps, '未归类字段');
eq('分组头可聚焦', byClass(boxes[0], 'grp-h')[0].attrs.tabindex, '0');
eq('分组头 role=button', byClass(boxes[0], 'grp-h')[0].attrs.role, 'button');
eq('展开状态进 aria-expanded', byClass(boxes[0], 'grp-h')[0].attrs['aria-expanded'], 'true');
/* 「测速与判定」字段最多，默认收起 */
const probe = boxes.find(b => b.attrs['data-group'] === 'probe');
ok('「测速与判定」默认收起', !/\bopen\b/.test(probe.attrs['class']));
ok('「基本设置」默认展开', /\bopen\b/.test(boxes[0].attrs['class']));

/* 折叠：点一下翻 class + aria（并写 localStorage，无 storage 时静默） */
const head0 = byClass(boxes[0], 'grp-h')[0];
head0.dispatch('click');
ok('点击后收起', !/\bopen\b/.test(boxes[0].attrs['class']));
eq('收起后 aria-expanded=false', head0.attrs['aria-expanded'], 'false');
head0.dispatch('keydown', { preventDefault: noop, key: 'Enter' });
ok('回车再展开', /\bopen\b/.test(boxes[0].attrs['class']));
eq('展开后 aria-expanded=true', head0.attrs['aria-expanded'], 'true');

/* 无字段时返回 null，调用方不会误把 undefined 当容器 */
eq('空表单返回 null', t.regroupForm(makeNode('div')), null);
eq('null 表单返回 null', t.regroupForm(null), null);

/* 字段说明：短句留在页面上，完整解释挂 ⓘ */
eq('help 只返回短句', t.help('enabled', '短句', '很长的完整解释……'), '短句');
const helpMap = fakeForm([ 'enabled', 'probe_user' ]);
/* 给字段补上 form.js 会生成的说明节点 */
helpMap.querySelectorAll('.cbi-value').forEach(row => {
	const d = makeNode('div');
	d.attrs['class'] = 'cbi-value-description';
	row.appendChild(d);
});
t.help('enabled', '关掉后不再自动跑。', '关闭时后台只空转，不会消耗流量……');
t.help('probe_user', '默认 nobody，别轻易改。', '探测以哪个用户身份发起，默认 nobody 是刻意的……');
t.applyHelp(helpMap);
const marks = byClass(helpMap, 'hmark');
eq('每个有长解释的字段都贴了一个 ⓘ', marks.length, 2);
eq('ⓘ 可聚焦', marks[0].attrs.tabindex, '0');
eq('ⓘ role=button', marks[0].attrs.role, 'button');
eq('ⓘ 初始 aria-expanded=false', marks[0].attrs['aria-expanded'], 'false');
ok('ⓘ 带完整解释的 title', marks[0].attrs.title.includes('不会消耗流量'));
ok('label 也带完整解释', helpMap.querySelectorAll('label')[0].attrs.title.includes('不会消耗流量'));
/* 点一下就地展开，再点收起，且内容一致 */
marks[0].dispatch('click');
eq('点开后 aria-expanded=true', marks[0].attrs['aria-expanded'], 'true');
has('展开体写出完整解释', helpMap, '不会消耗流量');
marks[0].dispatch('click');
eq('再点收起', marks[0].attrs['aria-expanded'], 'false');
/* 只有短句、没有登记的字段不贴 ⓘ，也不该抛 */
const noHelp = fakeForm([ 'nope' ]);
const nd = makeNode('div');
nd.attrs['class'] = 'cbi-value-description';
noHelp.querySelectorAll('.cbi-value')[0].appendChild(nd);
t.applyHelp(noHelp);
eq('未登记长解释的字段不贴 ⓘ', byClass(noHelp, 'hmark').length, 0);
eq('applyHelp(null) 不抛异常', t.applyHelp(null) === undefined, true);

/* 重复调用不该贴第二个 ⓘ */
t.applyHelp(helpMap);
eq('重复 applyHelp 不重复贴 ⓘ', byClass(helpMap, 'hmark').length, 2);

/* ConfigPane 的「全部展开 / 收起」要能驱动分组 */
const cp = t.ConfigPane();
ok('配置面板有分组宿主', !!cp.host);
has('配置面板提示改动下一轮生效', cp.node, '下一轮生效');
const lnkBtns = byTag(cp.node, 'button');
eq('配置面板有全部展开 / 收起两个入口', lnkBtns.length, 2);

/* ================================================================== *
 * 11. 页面拼装：面板常驻、切换不重建、tab 落 localStorage
 * ================================================================== */
const page = t.buildPage(null);
ok('页面根节点带 cfp 标记', /cfp/.test(page.attrs['class']));
eq('三个面板都在文档里', byClass(page, 'pane').length, 3);
ok('读数条常驻（不在任何 pane 里）', !!t.P.rail && !t.P.rail.closest('.pane'));

const boardPane = t.P.panes['board'];
const srcPane = t.P.panes['sources'];
const cfgPane = t.P.panes['config'];
ok('面板节点登记在 P.panes', !!boardPane && !!srcPane && !!cfgPane);

/* render() 的最后一步才是点燃默认标签；这里手动走一遍同一条路径 */
t.goto('board', false);
eq('点燃默认面板后只有一个点亮', byClass(page, 'pane on').length, 1);
eq('榜单面板默认点亮', boardPane.attrs['class'], 'pane on');
eq('源面板默认收起', srcPane.attrs['class'], 'pane');
eq('配置面板默认收起', cfgPane.attrs['class'], 'pane');

t.goto('sources', false);
eq('切到源面板：源点亮', srcPane.attrs['class'], 'pane on');
eq('切到源面板：榜单收起', boardPane.attrs['class'], 'pane');
eq('切换后每个面板仍是同一节点', t.P.panes['sources'], srcPane);
ok('参数里说到的 tab 状态同步', t.store.get().tab === 'sources');

/* localStorage 可用时记住选择 */
lsData = {};
t.goto('config', true);
eq('切换写进 localStorage', lsData['cf-ipcheck.tab'], 'config');
eq('savedTab 读回记录', t.savedTab(), 'config');
lsData = {};
lsData['cf-ipcheck.tab'] = 'no-such-tab';
eq('野值由调用方回落到榜单（savedTab 原样返回）', t.savedTab(), 'no-such-tab');
lsData = null;
eq('localStorage 不可用时 savedTab 不抛异常', t.savedTab(), null);

/* store 是模块级单例：重复 buildPage 不能把订阅叠起来。
 * 叠了的话每进一次页面重画次数就翻倍，而且旧回调还在往脱离文档的旧节点上画。 */
const before = t.store.count();
t.buildPage(null);
t.buildPage(null);
eq('重复组装页面不会累积订阅', t.store.count(), before);
ok('组装后订阅数恰好为 1', t.store.count() === 1);

/* ================================================================== *
 * 12. 样式：设计令牌必须真的被写进产物
 * ================================================================== */
const css = t.CSS;
ok('CSS 用 oklch 色空间', /oklch\(/.test(css));
ok('CSS 声明暗色为默认', /:root\s*\{[^}]*--bg/.test(css));
ok('CSS 有浅色媒体查询', /prefers-color-scheme:\s*light/.test(css));
ok('CSS 数字用等宽 + tabular-nums', /tabular-nums/.test(css));
ok('CSS 尊重减少动效偏好', /prefers-reduced-motion/.test(css));
ok('CSS 有可见焦点环', /:focus-visible/.test(css));
ok('CSS 里的 class 前缀统一', /\.cfp/.test(css) && /\.board/.test(css) && /\.tabs/.test(css));

console.log(fails === 0 ? '=== view 渲染断言全部通过' : `=== view 渲染断言失败 ${fails} 项`);
process.exit(fails === 0 ? 0 : 1);
