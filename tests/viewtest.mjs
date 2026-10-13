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
	"\tRunProgress: RunProgress, STAGES: STAGES, SRC_COLS: SRC_COLS,\n" +
	"\tSummaryStrip: SummaryStrip, BoardPane: BoardPane,\n" +
	"\tSourceMatrix: SourceMatrix, SourcesPane: SourcesPane, srcMessage: srcMessage,\n" +
	"\tparseLog: parseLog, LogsPane: LogsPane, LogBlock: LogBlock, logTone: logTone,\n" +
	"\tTabBar: TabBar, StatusRail: StatusRail, Readout: Readout,\n" +
	"\tregroupForm: regroupForm, ConfigPane: ConfigPane,\n" +
	"\thelp: help, applyHelp: applyHelp, HelpMark: HelpMark, HELP: HELP,\n" +
	"\tTAB_DEFS: TAB_DEFS, GROUPS: GROUPS, GROUP_OPTIONS: GROUP_OPTIONS,\n" +
	"\tel: el, luminanceOf: luminanceOf, detectScheme: detectScheme,\n" +
	"\tlinkStyle: linkStyle, applyScheme: applyScheme, CSS_PATH: CSS_PATH,\n" +
	"\tget store() { return store; },\n" +
	"\tget P() { return P; }, goto: goto, savedTab: savedTab,\n" +
	"\tbuildPage: buildPage, runCmd: runCmd,\n" +
	"\tactRun: actRun, actCheck: actCheck,\n" +
	"\tlayoutForm: layoutForm, relocateSourceEditor: relocateSourceEditor,\n" +
	"\tSRC_EDIT_KEY: SRC_EDIT_KEY, EDIT_ONLY_OPTIONS: EDIT_ONLY_OPTIONS,\n" +
	"\trailKeyOf: railKeyOf, boardKeyOf: boardKeyOf,\n" +
	"\tlogsRefresh: logsRefresh,\n" +
	"\trefresh: refresh, startPoll: startPoll, stopPoll: stopPoll, afterMiss: afterMiss,\n" +
	"\tflash: flash, whyNoReply: whyNoReply,\n" +
	"\tget pollFail() { return pollFail; }, pollGapSec: pollGapSec,\n" +
	"\tPOLL_SEC: POLL_SEC, POLL_SLOW_SEC: POLL_SLOW_SEC, pollTick: pollTick,\n" +
	"\tFAIL_STALE: FAIL_STALE, FAIL_GIVEUP: FAIL_GIVEUP,\n" +
	"\tHUNG: HUNG, CMD_LIMIT: CMD_LIMIT, isRunningReply: isRunningReply\n" +
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

/* L.poll 桩：镜像真机 luci.js 里那个单例的语义，连**怪癖**一起镜像 ——
 * add() 只在「起过表又停了」的情况下才顺手起表，首次登记只入队不起表。
 * 不这样写，视图忘了 poll.start() 也能把测试骗过去（真机上反而是被框架
 * 别处的 start() 带起来的，那不该是依赖）。间隔单位是秒、按函数身份去重、
 * remove 撤登记，也都照抄。 */
const pollEntries = new Map();
let pollTimerOn = false;
let pollEverStarted = false;
const pollStub = {
	add(fn, sec) {
		if (pollEntries.has(fn))
			return false;
		pollEntries.set(fn, (sec == null || sec <= 0) ? 5 : sec);
		if (pollEverStarted && !pollTimerOn)
			pollTimerOn = true;
		return true;
	},
	remove(fn) {
		const had = pollEntries.delete(fn);
		if (!pollEntries.size && pollTimerOn)
			pollTimerOn = false;
		return had;
	},
	start() {
		if (pollTimerOn)
			return false;
		pollTimerOn = true;
		pollEverStarted = true;
		return true;
	},
	stop() {
		if (!pollTimerOn)
			return false;
		pollTimerOn = false;
		return true;
	},
	active() { return pollTimerOn; },
	/* 回到「这个页面从没起过表」的初始态。不起这个的话，前面某次 startPoll 已经把
	 * pollEverStarted 置真，桩里的 add() 就会顺手起表，"视图忘调 poll.start" 这条
	 * 断言会被自己的桩蒙混过去。 */
	__reset() { pollEntries.clear(); pollTimerOn = false; pollEverStarted = false; }
};
const pollSecOf = (fn) => (pollEntries.has(fn) ? pollEntries.get(fn) : null);
const livePolls = () => pollEntries.size;

const _ = s => String(s);
/* rpc 桩：视图走的已经是 rpcd 的 ucode 具名方法，真机回包形状是 { ok, text }
 * （text = 引擎原样输出）。测试里仍然按「引擎那份文本」写桩，可读性高，
 * 这里统一包一层成真实形状 —— 少了这层，桩就把视图的解包代码测成了摆设。 */
let rpcImpl = async () => '';
const rpcStub = {
	declare: (decl) => (...a) => Promise.resolve(rpcImpl(decl, a)).then((v) => {
		if (typeof v === 'string')
			return { ok: true, text: v };
		return v;
	})
};
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

/* Map.save() 的桩：「保存并检测」的第一步。记调用顺序、可切换成败，
 * 用来钉住"存失败就不许去检测"这条（否则检出来的是配置文件里的旧清单，更骗人）。 */
const saveCalls = [];
let saveImpl = () => Promise.resolve();
MapStub.prototype.save = function (cb, silent) {
	saveCalls.push({ cb: cb, silent: silent });
	return saveImpl();
};

/* ui 桩只放**官方 LuCI 真有的**方法。早先这里给的是 addToast/toast —— 那两个
 * 方法官方从来没有（是厂商分支的），桩件照着写就等于替视图把一条永远不成立的分支
 * 测成"绿的"。现在按真机 ui.js 的实际 API 面来，并且留一个开关（置 undefined）
 * 用来模拟"这个版本没有该 API"，好测兜底路径。 */
const notifications = [];
let notifyImpl = function (title, body, ms, cls) {
	notifications.push({ title: String(title), text: textOf(body), ms: ms, cls: cls });
};
const uiStub = {
	get addTimeLimitedNotification() { return notifyImpl; },
	addNotification: function (title, body) { notifications.push({ title: String(title), text: textOf(body), ms: 0, cls: '' }); },
	showModal: noop, hideModal: noop, showIndicator: noop, hideIndicator: noop
};
/* 定时器做成登记表而不是 () => 0：默认依然永不触发（与旧桩行为一致，异步合帧的
 * 订阅在测试里不会莫名跑起来），但「挂住到超时」这类分支能被测试亲手点亮。 */
const timers = [];
const stubSetTimeout = (fn, ms) => { timers.push({ fn: fn, ms: ms }); return timers.length; };
const stubClearTimeout = (id) => { if (id) timers[id - 1] = null; };
const liveTimers = () => timers.filter(x => x).length;
function fireTimers(ms) {
	timers.filter(x => x && x.ms === ms).forEach(x => { const f = x.fn; x.ms = -1; f(); });
}
/* 轮询也要能被测试亲手点亮：桩里的 setInterval 原本恒返回 0（既不会跳，
 * stopPoll 的 if (poller) 也判不出真假），于是「一次读不到就掐掉心跳」这类
 * 病根本没地方断言。做成和 timers 一样的登记表。 */
const intervals = [];
const stubSetInterval = (fn, ms) => { intervals.push({ fn: fn, ms: ms }); return intervals.length; };
const stubClearInterval = (id) => { if (id) intervals[id - 1] = null; };
const liveIntervals = () => intervals.filter(x => x).length;
const lastInterval = () => {
	for (let i = intervals.length - 1; i >= 0; i--)
		if (intervals[i]) return intervals[i];
	return null;
};

const ctx = new Function('form', 'rpc', 'ui', 'poll', 'view', 'E', '_', 'L', 'window', 'document',
	'setTimeout', 'setInterval', 'clearInterval', 'clearTimeout', 'navigator', 'globalThis', src);
ctx(formStub, rpcStub, uiStub, pollStub, viewStub, () => makeNode('div'), _, {
	addItem: noop, network: {}
}, windowStub, documentStub,
	stubSetTimeout, stubSetInterval, stubClearInterval, stubClearTimeout,
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
has('unreachable 点名是哪个方法，并给出 ucode 这条路的排查项', pane, '调不到 luci.cf-ipcheck 的 status 方法');
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
has('未检测时给「保存并检测」按钮', sp, '保存并检测');
sp = t.SourcesPane({ state: 'saving' }, { check: noop });
has('保存阶段单独说一声（不谎报成"正在拉取源"）', sp, '正在保存源清单');
sp = t.SourcesPane({ state: 'checking' }, { check: noop });
has('检测中给等待文案', sp, '正在拉取源');
sp = t.SourcesPane({ state: 'ok', rows: srcRows }, { check: noop });
has('检测完成渲染矩阵', sp, 'a.example');
has('检测完成给 CF 段内说明', sp, 'CF 段内');
sp = t.SourcesPane({ state: 'unreachable' }, { check: noop });
has('检测执行不了说明原因', sp, '调不到 luci.cf-ipcheck 的 check_sources 方法');
sp = t.SourcesPane({ state: 'empty' }, { check: noop });
has('空源清单指向本页的编辑区（不再赶人去配置页）', sp, '上面「源清单」是空的');
sp = t.SourcesPane({ state: 'saving' }, { check: noop });
has('保存阶段有独立文案（不谎称已经在拉源）', sp, '正在保存源清单');
sp = t.SourcesPane({ state: 'save_failed', reason: '选项 "探测端口" 含非法输入' }, { check: noop });
has('保存失败说清没存进去', sp, '没有存进去');
has('把 LuCI 的校验原因原样带出来', sp, '探测端口');
has('保存失败也来自「源与检测」这一页的文案', t.SourcesPane(null, { check: noop }), '保存并应用');
sp = t.SourcesPane({ state: 'parse_error', raw: 'oops' }, { check: noop });
has('检测输出读不懂保留原文', sp, 'oops');

/* ================================================================== *
 * 8. 标签栏：切换只翻 class / aria，绝不重建节点
 * ================================================================== */
let picked = null;
const bar = t.TabBar([
	{ id: 'board', label: '榜单', count: 12 },
	{ id: 'sources', label: '源与检测' },
	{ id: 'logs', label: '日志' },
	{ id: 'config', label: '配置', count: 4 }
], 'board', id => { picked = id; });

const tabs = byClass(bar, 'tab');
eq('标签数 = 4', tabs.length, 4);
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
eq('四个面板都在文档里', byClass(page, 'pane').length, 4);
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
 * 12. 样式：独立 css 文件 + 跟随主题 + 明暗判定
 * ================================================================== */
const cssPath = viewPath.replace(/\.js$/, '.css');
const relCss = 'view/cf_ipcheck/settings.css';
ok('样式表是独立文件（不再在 JS 里拼 CSS 字符串）', fs.existsSync(cssPath));
ok('视图里已经没有 CSS 常量', !/var CSS = \[/.test(src0));
ok('样式路径与磁盘上的文件对得上', src0.includes("CSS_PATH = '" + relCss + "'") &&
	cssPath.replace(/\\/g, '/').endsWith('/luci-static/resources/' + relCss));
ok('用 <link rel=stylesheet> 挂，优先走 L.resource()', /L\.resource\(CSS_PATH\)/.test(src0) && /rel: 'stylesheet'/.test(src0));

const css = fs.readFileSync(cssPath, 'utf8');
ok('CSS 用 oklch 色空间', /oklch\(/.test(css));
ok('CSS 声明暗色为默认', /:root\s*\{[^}]*--bg/.test(css));
ok('浅色令牌挂在 .cfp.is-light 上（由 JS 判定后加类）', /\.cfp\.is-light\s*\{/.test(css));
ok('不再用 prefers-color-scheme 规则判明暗（会被主题的强制深色打脸）',
	!/@media\s*\(prefers-color-scheme:/.test(css));
ok('强调色优先取主题主色（暗色用 --dark-primary）',
	/--accent:var\(--dark-primary, var\(--primary,/.test(css));
ok('强调色优先取主题主色（亮色用 --primary）',
	/--accent:var\(--primary, var\(--primary-color-high,/.test(css));
ok('暗色下的强调文字走淡化版，不直接拿主题色当文字',
	/--accent-ink:color-mix\(in oklab, var\(--accent\)/.test(css));
ok('文字型强调不再用填充色（填充与文字分令牌）',
	!/(^|[{;\s])color:var\(--accent\)/m.test(css));
ok('正文继承主题字体，不再自带一套字体栈', /\.cfp\{color:var\(--ink\);font-family:inherit/.test(css));
ok('等宽字体优先取主题的 --font-mono', /--mono:var\(--font-mono/.test(css));
ok('CSS 数字用等宽 + tabular-nums', /tabular-nums/.test(css));
ok('CSS 尊重减少动效偏好', /prefers-reduced-motion/.test(css));
ok('CSS 有可见焦点环', /:focus-visible/.test(css));
ok('CSS 里的 class 前缀统一', /\.cfp/.test(css) && /\.board/.test(css) && /\.tabs/.test(css));
ok('忙碌态在图标位画转圈', /\.cfp button\.busy \.bi\{[^]*?animation:cfp-spin/.test(css));
ok('忙碌态不再只靠降透明度', !/\.cfp button\.busy\{pointer-events:none;opacity:\.6\}/.test(css));

/* linkStyle：幂等，挂不上也不许抛 */
documentStub.head = makeNode('head');
t.linkStyle();
const links1 = byTag(documentStub.head, 'link');
eq('第一次挂上一条 link', links1.length, 1);
eq('link 的 href 在 L 没给 resource 时落到默认路径', links1[0].attrs.href, '/luci-static/resources/' + relCss);
t.linkStyle();
eq('再挂一次不累积（按 href 去重）', byTag(documentStub.head, 'link').length, 1);

/* 明暗判定：量主题真正渲染出来的底色 */
eq('oklch 的 L 分量直接当亮度', t.luminanceOf('oklch(19.5% 0.012 250)'), 0.195);
eq('纯白亮度是 1', t.luminanceOf('rgb(255, 255, 255)'), 1);
eq('纯黑亮度是 0', t.luminanceOf('#000000'), 0);
eq('全透明不算底色（要继续往上找）', String(t.luminanceOf('rgba(0, 0, 0, 0)')), 'null');
eq('认不出的颜色回 null 而不是瞎判', String(t.luminanceOf('tomato')), 'null');
const oldGCS = globalThis.getComputedStyle;
globalThis.getComputedStyle = () => ({ backgroundColor: 'rgb(244, 245, 247)' });
eq('量到 Argon 亮色底（实测 rgb(244,245,247)）就判 light', t.detectScheme(), 'light');
const node = { className: 'cfp' };
eq('applyScheme 回 light', t.applyScheme(node), 'light');
eq('根节点加上 is-light', node.className, 'cfp is-light');
globalThis.getComputedStyle = () => ({ backgroundColor: 'rgb(30, 30, 30)' });
eq('量到 Argon 暗色底（实测 rgb(30,30,30)）就判 dark', t.detectScheme(), 'dark');
eq('切回暗色时把类摘掉', t.applyScheme(node), 'dark');
eq('根节点类名回到 cfp', node.className, 'cfp');
globalThis.getComputedStyle = () => ({ backgroundColor: 'rgba(0, 0, 0, 0)' });
eq('全程拿不到不透明底色时默认暗色（不误闪一下亮底）', t.detectScheme(), 'dark');
if (oldGCS === undefined) delete globalThis.getComputedStyle;
else globalThis.getComputedStyle = oldGCS;

/* ================================================================== *
 * 13. RPC 三态：正常 / 被拒 / 挂住
 * 挂住必须单独成一态：旧版把「rpc 永不返回」和「rpc 被拒」混成 null，于是一次挂住
 * 之后 inflight 永不复位，整页刷新停摆而画面上一条提示都没有。
 * ================================================================== */
eq('status 的等待上限是 8 秒', t.CMD_LIMIT.status, 8000);
eq('run-now 的等待上限是 10 秒', t.CMD_LIMIT['run-now'], 10000);
eq('check-sources 给 45 秒（引擎最坏约 12 秒；rpcd 的 exec 超时是 30 秒，客户端等更久也等不到更完整的结果）',
	t.CMD_LIMIT['check-sources'], 45000);
/* LuCI 的 rpc 会把同一拍的调用并进一个 POST（真机抓到过 logs 与 status 同体），
 * 响应要等两条都跑完；logs 的上限一旦大过 status，一次慢日志就把 status 拖成
 * 「没有回应」。这条大小关系是硬约束，钉住。 */
ok('logs 的上限必须小于 status（否则同体请求会连坐）',
	t.CMD_LIMIT.logs < t.CMD_LIMIT.status);
ok('logs 的上限也必须小于运行期的 status 上限',
	t.CMD_LIMIT.logs < t.CMD_LIMIT.status_running);

eq('被拒不带 reason，文案仍是「读取失败」', t.stateWord(t.parseStatus(null)), '读取失败');
eq('超时 → unreachable', t.parseStatus(t.HUNG).state, 'unreachable');
eq('超时 → reason=hung', t.parseStatus(t.HUNG).reason, 'hung');
eq('超时的状态词是「没有回应」', t.stateWord(t.parseStatus(t.HUNG)), '没有回应');

pane = t.BoardPane(t.parseStatus(t.HUNG), noActions);
has('超时空态说「路由器没有回应」', pane, '路由器没有回应');
has('超时空态指向本机代理/TUN 这条真因', pane, 'TUN');
hasNot('超时空态不谎报「包没装好」', pane, '包没装好');
hasNot('被拒的空态不说「没有回应」', t.BoardPane(t.parseStatus(null), noActions), '没有回应');

eq('源检测超时 → hung 态', t.parseSources(t.HUNG).state, 'hung');
has('源检测 hung 文案说没有回应', t.srcMessage({ state: 'hung' }), '没有回应');
has('源检测被拒文案点名 check_sources', t.srcMessage({ state: 'unreachable' }), '调不到 luci.cf-ipcheck 的 check_sources 方法');

ok('run-now 回 running 判为「还在跑」', t.isRunningReply('{"state":"running"}') === true);
ok('run-now 回 done 不算还在跑', t.isRunningReply('{"state":"done"}') === false);
ok('run-now 回脏值不算还在跑', t.isRunningReply('sh: out of memory') === false);

/* 忙碌标记要跟着 store 的 busy 走，而不是只改被点那一下的 DOM：
 * 读数条每次 store 变化都整体重画，若只靠 setBusy，重画后转圈就没了。 */
rail = t.StatusRail({ state: 'done', items: [] }, { run: true }, noActions);
ok('run 忙时按钮带 busy 类', byClass(rail, 'busy').length >= 1);
eq('忙按钮标了 aria-busy', byClass(rail, 'busy')[0].attrs['aria-busy'], 'true');
rail = t.StatusRail({ state: 'done', items: [] }, {}, noActions);
eq('不忙时没有 busy 类', byClass(rail, 'busy').length, 0);

/* rpc 永不返回 → 到点回 HUNG，绝不让调用方悬着 */
rpcImpl = () => new Promise(() => {});
const hungCall = t.runCmd([ 'status' ]);
ok('挂住的调用注册了自己的超时', timers.some(x => x && x.ms === t.CMD_LIMIT.status));
fireTimers(t.CMD_LIMIT.status);
ok('到点即回 HUNG（不等 rpc）', (await hungCall) === t.HUNG);

/* rpc 照常返回 → 结果原样给出，且把自己的定时器清掉（轮询不该把定时器堆起来） */
rpcImpl = async () => '{"state":"done"}';
const beforeTimers = liveTimers();
eq('正常返回照常给出字符串', await t.runCmd([ 'status' ]), '{"state":"done"}');
eq('正常返回后不留未触发的定时器', liveTimers(), beforeTimers);

/* ================================================================== *
 * 14. 引擎日志页：四种「没有日志」要分开说
 * ================================================================== */
eq('日志：被拒 → unreachable', t.parseLog(null).state, 'unreachable');
eq('日志：超时 → hung', t.parseLog(t.HUNG).state, 'hung');
eq('日志：空串 → empty（不是读不到）', t.parseLog('').state, 'empty');
eq('日志：只剩空白也算 empty', t.parseLog('\n  \n').state, 'empty');
eq('日志：有内容 → ok', t.parseLog('a\nb\n').state, 'ok');
eq('日志：原文不加工', t.parseLog('a\nb\n').text, 'a\nb\n');

eq('日志行：失败类标 bad', t.logTone('2026-10-12T00:00:00Z 取源失败 https://x'), 'bad');
eq('日志行：截旧日志只是提醒', t.logTone('2026-10-12T00:00:00Z 日志已超过上限 16 KB，较早的内容被丢弃'), 'warn');
eq('日志行：正常行不上色', t.logTone('2026-10-12T00:00:00Z 候选池 96 个'), '');

let lp = t.LogsPane(null, { refresh: noop, copy: noop });
has('日志页未读到时有引导', lp, '还没读到日志');
has('引导说清日志在设备上哪', lp, '/tmp/cf-ipcheck/cf-ipcheck.log');
ok('引导态给一个能点的读取按钮', byTag(lp, 'button').length >= 1);
/* busy 是从 store 读的（LogsPane 没有第三个参数），所以先打补丁再画 */
t.store.set({ busy: { logs: true } });
lp = t.LogsPane(null, { refresh: noop, copy: noop });
has('正在读取时给转圈文案', lp, '正在读取日志');
hasNot('正在读取时不重复给引导按钮', lp, '还没读到日志');
t.store.set({ busy: {} });

lp = t.LogsPane({ state: 'empty' }, { refresh: noop, copy: noop });
has('空文件说「还没有日志」', lp, '还没有日志');
hasNot('空文件不谎称「读不到」', lp, '读不到');

lp = t.LogsPane({ state: 'hung' }, { refresh: noop, copy: noop });
has('超时说没有回应', lp, '没有回应');
hasNot('超时说不上「读不到」', lp, '读不到');

lp = t.LogsPane({ state: 'unreachable' }, { refresh: noop, copy: noop });
has('被拒明说是 logs 方法调不到', lp, '调不到 luci.cf-ipcheck 的 logs 方法');

lp = t.LogsPane({ state: 'ok', text: '一行\n二行\n三行失败\n' }, { refresh: noop, copy: noop });
eq('日志按行渲染（尾部空行不占一行）', byClass(lp, 'lline').length, 3);
eq('坏消息行带上 bad 类', byClass(lp, 'lline bad').length, 1);
eq('正常行不带色类', byClass(lp, 'lline bad').length + byClass(lp, 'lline warn').length, 1);
ok('日志画在自己的滚动容器里', byClass(lp, 'logbox').length === 1);
has('说明只给最近一段', lp, '60 KB');
has('给复制入口', lp, '复制全部');

/* 面板从 3 个变 4 个：日志页和另外三页同一条约束 —— 一直在文档里，切换只翻 class */
eq('标签顺序：日志在配置之前', t.TAB_DEFS.map(d => d.id).join(','), 'board,sources,logs,config');
ok('store 默认带 logs（null = 还没读过）', t.store.get().logs === null);
ok('日志上限这一项归进基本设置组',
	t.GROUP_OPTIONS.basic.indexOf('log_max_kb') >= 0);

/* ================================================================== *
 * 15. 日志是主动取的：不用先点一下「读取日志」才看得到
 * ================================================================== */
let logCalls = 0;
rpcImpl = async () => { logCalls++; return ''; };
await t.logsRefresh();
eq('主动取一次就把结果写进 store', t.store.get().logs.state, 'empty');
eq('取完把忙碌标记清掉', String(t.store.get().busy.logs), 'false');
eq('确实打到引擎一次', logCalls, 1);

/* 并发去重：页面刚打开会连着触发几次（首帧 + 点按钮），不能叠成多个 rpc */
logCalls = 0;
let release = null;
rpcImpl = () => new Promise(res => { logCalls++; release = () => res(''); });
const pa = t.logsRefresh();
const pb = t.logsRefresh();
eq('同一时刻不叠日志请求', logCalls, 1);
release();
await Promise.all([pa, pb]);
eq('去重的那次也拿到同一份结果', t.store.get().logs.state, 'empty');

/* ================================================================== *
 * 16. 运行进度：七个环节、当前那条带计数，缺信息就退回老实的一句话
 * ================================================================== */
eq('环节顺序按 do_run 的真实走法（先建池，再做出口自检）',
	t.STAGES.map(s => s.id).join(','), 'fetch,canary,probe,rank,colo,speed,upload');

let rp = t.RunProgress({ state: 'running' });
has('没给环节时不画半截清单', rp, '还没读到环节进度');
eq('没给环节时一条步骤都不出', byClass(rp, 'pstep').length, 0);

rp = t.RunProgress({ state: 'running', stage: 'probe', stage_done: 40, stage_total: 100, upload: 1 });
eq('七个环节都画出来', byClass(rp, 'pstep').length, 7);
eq('排在探测前的两条标已完成', byClass(rp, 'pstep done').length, 2);
eq('当前环节只有一条高亮', byClass(rp, 'pstep now').length, 1);
has('标题带当前环节与计数', rp, '并发探测 40/100');
eq('进度条宽度按 done/total 算', byClass(rp, 'pbar')[0].childNodes[0].style.width, '40%');
eq('探测之后的环节排在待做', byClass(rp, 'pstep todo').length, 4);

rp = t.RunProgress({ state: 'running', stage: 'probe', stage_done: 100, stage_total: 100, upload: 1 });
eq('环节跑满就不再挂「当前」', byClass(rp, 'pstep now').length, 0);
eq('跑满后全部标完成', byClass(rp, 'pstep done').length, 3);

rp = t.RunProgress({ state: 'running', stage: 'speed', stage_done: 3, stage_total: 10, upload: 0 });
eq('没开上传时那一条标灰', byClass(rp, 'pstep off').length, 1);
has('没开上传要写清楚', rp, '未开启');

rp = t.RunProgress({ state: 'running', stage: 'canary', stage_done: 0, stage_total: 0, upload: 1 });
eq('total 为 0 时不画进度条', byClass(rp, 'pbar').length, 0);
hasNot('total 为 0 时不显示编出来的 0/0', rp, '0/0');

/* 读数条那句状态词不受影响：running 仍然说「测速中」 */
eq('running 的状态词仍是测速中', t.stateWord({ state: 'running' }), '测速中');

/* 版本标记：装机后报障第一眼就能说清浏览器里跑的是哪一版 */
rail = t.StatusRail({ state: 'done', items: [] }, {}, noActions);
const buildEls = byClass(rail, 'build');
eq('读数条带一个版本标记', buildEls.length, 1);
ok('版本号形如 r+数字', /^r[0-9]+$/.test(textOf(buildEls[0])));

/* ================================================================== *
 * 17. 回归：表单分组必须留在 LuCI 的 map 节点里面
 * 一旦搬出去（早先是调用方 clear 掉宿主再塞 wrap），map 就采不到字段值 ——
 * 表现是改了任何一项都提示「没有待应用的更改」，页面上根本存不下配置。
 * 这条是 r25 装机后才发现的真事故，必须有断言钉着。
 * ================================================================== */
function hasAncestor(root, node) {
	while (node) {
		if (node === root) return true;
		node = node.parentNode;
	}
	return false;
}
const keepMap = fakeForm([ 'enabled', 'interval_hours', 'community_sources', 'candidate_budget' ]);
const keepWrap = t.regroupForm(keepMap);
ok('分组容器落在 map 节点里面', hasAncestor(keepMap, keepWrap));
ok('map 节点仍在页面树里（没被 clear 掉）', hasAncestor(keepWrap, keepWrap) && keepMap.childNodes.length > 0);
ok('字段行仍可从分组回溯到 map 节点', hasAncestor(keepMap, keepMap.querySelectorAll('.cbi-value')[0]));

/* ================================================================== *
 * 18. 回归：点「立即测速」后本地必须立刻进 running
 * run-now 返回「已启动」只是命令被受理，引擎几毫秒后才把 running 写进状态。
 * 抢跑的 refresh 若读到上一轮的 done，轮询就永远不会开 —— 页面停在「已完成」+
 * 转圈，看起来就是「点了没反应」（r26 现场抓到的竞态）。断言：命令返回后、
 * refresh 尚未落地前，store 的状态必须已经是 running。
 * ================================================================== */
let rpcCalls = 0;
rpcImpl = () => {
	rpcCalls++;
	return rpcCalls === 1 ? Promise.resolve('{"state":"started"}') : new Promise(() => {});
};
t.store.set({ status: { state: 'done', items: [] }, busy: {} });
const runP = t.actRun(null);          // 第二次 rpc（refresh 的 status）永不返回，runP 不会 settle
/* 等真实链路走完：桩里 runCmd 多包了一层 Promise.resolve(回).then(解包)，
   手工数微任务个数太脆，直接排空到宏任务再断言。 */
await new Promise((r) => setImmediate(r));
eq('命令一返回，本地状态已是 running', t.store.get().status.state, 'running');
eq('忙碌标记同时被清掉', String(t.store.get().busy.run), 'false');

/* ================================================================== *
 * 19. 回归：读数条/榜单不许无谓重建 —— 真实鼠标点击会被重建吞掉
 * mousedown 与 mouseup 之间宿主节点被替换，Chromium 就不合成 click，
 * 表现就是「点了没反应」。所以这些面板只在内容真变时才允许重建。
 * ================================================================== */
const doneSt = t.parseStatus(JSON.stringify({ state: 'done', items: [] }));
eq('同一状态同一忙碌 → 读数条指纹相同', t.railKeyOf(doneSt, {}),
	t.railKeyOf(t.parseStatus(JSON.stringify({ state: 'done', items: [] })), {}));
eq('忙碌标记变化 → 读数条指纹变化', t.railKeyOf(doneSt, { run: true }) === t.railKeyOf(doneSt, {}), false);
eq('items 变化 → 榜单指纹变化', t.boardKeyOf(doneSt) ===
	t.boardKeyOf(t.parseStatus(JSON.stringify({ state: 'done', items: [ { ip: '1.1.1.1' } ] }))), false);
eq('提示条变化不影响读数条指纹（分属两棵树）', t.railKeyOf(doneSt, {}),
	t.railKeyOf(doneSt, {}));

/* ================================================================== *
 * 20. 回归：一次读不到不许打死页面（r32 现场抓到的病根）
 * 现象：点完「立即测速」，一轮跑到中途整页翻成「路由器没有回应」，榜单被抹成
 * 白板，而且从此不再轮询，非按 F5 不可 —— 而引擎那一轮其实好端端在跑。
 * 根因两条：refresh 拿到 HUNG 就把 store.status 覆盖成 unreachable；随后
 * state !== 'running' 又触发 stopPoll，把心跳一起掐了。
 * 这里钉住三件事：保住上一帧读数、心跳不停、连着失败到阈值才认输。
 * ================================================================== */
const runFrame = {
	state: 'running', stage: 'probe', stage_done: 40, stage_total: 111,
	upload: 1, pool: 111, items: [ { ip: '1.1.1.1', total: 120, ttfb: 80, colo: 'LAX' } ]
};
t.store.set({ status: Object.assign({}, runFrame), busy: {}, logs: { state: 'ok', text: '一行\n二行\n' } });
rpcImpl = () => new Promise(() => {});        // 路由器不回话

t.startPoll();
eq('正常节奏 3 秒（L.poll 按秒登记）', pollSecOf(t.pollTick), t.POLL_SEC);

let mp = t.refresh();
fireTimers(t.CMD_LIMIT.status_running);
await mp;
eq('运行中用的是放宽后的上限', t.CMD_LIMIT.status_running, 20000);
eq('第一次没读到：状态仍是 running', t.store.get().status.state, 'running');
eq('第一次没读到：进度没被抹掉', t.store.get().status.stage_done, 40);
eq('第一次没读到：还不算滞留（下一拍大概率就回来了）', String(t.store.get().status.staleFor), 'undefined');
eq('失败计数 1', t.pollFail, 1);
eq('心跳没被掐掉（登记还在）', livePolls(), 1);

mp = t.refresh();
fireTimers(t.CMD_LIMIT.status_running);
await mp;
eq('第二次没读到：挂上滞留秒数', typeof t.store.get().status.staleFor, 'number');
eq('第二次没读到：进度仍在', t.store.get().status.stage_done, 40);
eq('第二次没读到：状态词说实话', t.stateWord(t.store.get().status), '测速中 · 读数滞留');
eq('节奏放慢到 10 秒（不是停机：改节奏是 remove+add）', pollSecOf(t.pollTick), t.POLL_SLOW_SEC);
has('滞留时榜单顶上挂一条横幅', t.BoardPane(t.store.get().status, noActions), '路由器暂时没回话');
has('横幅明说不用刷新页面', t.BoardPane(t.store.get().status, noActions), '不需要刷新');

for (let i = 0; i < t.FAIL_GIVEUP - t.FAIL_STALE; i++) {
	mp = t.refresh();
	fireTimers(t.CMD_LIMIT.status_running);
	await mp;
}
const gaveUp = t.store.get().status;
eq('连着 %s 次才认输'.format(t.FAIL_GIVEUP), gaveUp.state, 'unreachable');
eq('认输时说的是「没有回应」', gaveUp.reason, 'hung');
eq('认输也不许把上一帧榜单扔掉', gaveUp.items.length, 1);
has('认输的面板照样把榜单端出来', t.BoardPane(gaveUp, noActions), '1.1.1.1');
has('认输的面板说清是没有回应', t.BoardPane(gaveUp, noActions), '路由器没有回应');
ok('认输之后心跳仍在（恢复了能自己跟上，不用 F5）', livePolls() === 1);
eq('认输后不再计滞留秒数（指纹因此稳定，「重新读取」按钮不会被反复换掉）',
	String(gaveUp.staleFor), 'null');
eq('认输后连着再读不到，指纹也不再变', t.boardKeyOf(gaveUp),
	t.boardKeyOf(t.afterMiss(gaveUp, true)));

rpcImpl = async () => JSON.stringify({ state: 'running', stage: 'speed', stage_done: 3, stage_total: 10, items: [] });
mp = t.refresh();
await mp;
eq('路由器一回话就自愈', t.store.get().status.stage, 'speed');
eq('失败计数清零', t.pollFail, 0);
eq('滞留标记去掉', String(t.store.get().status.staleFor), 'undefined');
eq('节奏回到 3 秒', pollSecOf(t.pollTick), t.POLL_SEC);

rpcImpl = async () => JSON.stringify({ state: 'done', items: [ { ip: '2.2.2.2' } ] });
mp = t.refresh();
await mp;
eq('这一轮跑完就撤登记', livePolls(), 0);

/* 手上根本没有任何读数（刚进页面第一次就没读到）时不许装样子：直说没回应 */
t.store.set({ status: { state: 'never_run', items: [] }, busy: {} });
rpcImpl = () => new Promise(() => {});
mp = t.refresh();
fireTimers(t.CMD_LIMIT.status);
await mp;
eq('没有读数可保时立刻说「没有回应」', t.store.get().status.state, 'unreachable');
eq('被拒/超时之外不上调上限', t.CMD_LIMIT.status, 8000);
t.stopPoll();

/* 日志那边同一个道理：一次读不到不许把用户正在看的日志抹掉 */
t.store.set({ logs: { state: 'ok', text: '一行\n二行\n' }, busy: {} });
rpcImpl = () => new Promise(() => {});
const keepLog = t.logsRefresh();
fireTimers(t.CMD_LIMIT.logs);
await keepLog;
eq('读不到日志时保住上一份', t.store.get().logs.state, 'ok');
eq('日志内容一个字都没少', t.store.get().logs.text, '一行\n二行\n');
eq('日志的忙碌标记照样清掉', String(t.store.get().busy.logs), 'false');

/* ================================================================== *
 * 21. 回归：榜单指纹必须覆盖环节进度
 * r32 真机实测：点完测速，进度清单画出来一次就冻住 —— 停在「拉取社区源 1/13」
 * 30 秒不动，而同一时刻引擎已经跑到 12/13。原因是 boardKeyOf 里没有
 * stage/stage_done/stage_total/upload，指纹不变就不重画。
 * ================================================================== */
const pf = { state: 'running', stage: 'probe', stage_done: 1, stage_total: 13, upload: 1, items: [] };
eq('进度计数变了 → 指纹必须变', t.boardKeyOf(pf) ===
	t.boardKeyOf(Object.assign({}, pf, { stage_done: 2 })), false);
eq('换环节 → 指纹必须变', t.boardKeyOf(pf) ===
	t.boardKeyOf(Object.assign({}, pf, { stage: 'rank' })), false);
eq('总数变了 → 指纹必须变', t.boardKeyOf(pf) ===
	t.boardKeyOf(Object.assign({}, pf, { stage_total: 14 })), false);
eq('上传开关变了 → 指纹必须变（那一条要标灰）', t.boardKeyOf(pf) ===
	t.boardKeyOf(Object.assign({}, pf, { upload: 0 })), false);
/* 这条在 r33 是反的（当时断言 pool/qualified 不该进指纹）。r39 复查时被抓出来：
 * SummaryStrip 确实读它们，指纹里没有就等于允许面板停在旧数字上 —— 改了「定时周期」
 * 后那格「完成于」的滞留告警永远不刷新。现在按它该有的样子钉：读到的就得进指纹。 */
eq('SummaryStrip 读的字段变了 → 指纹必须变', t.boardKeyOf(pf) ===
	t.boardKeyOf(Object.assign({}, pf, { pool: 999, qualified: 5 })), false);
['interval', 'started', 'usable', 'domains'].forEach(function (k) {
	const patch = {};
	patch[k] = 'zzz';
	eq(k + ' 变了 → 指纹必须变（它被 SummaryStrip/看板读）', t.boardKeyOf(pf) ===
		t.boardKeyOf(Object.assign({}, pf, patch)), false);
});
eq('面板不读的字段变了 → 指纹不变（别白白重建面板）', t.boardKeyOf(pf),
	t.boardKeyOf(Object.assign({}, pf, { some_field_nobody_reads: 12345 })));
eq('滞留跨 10 秒档 → 指纹变（横幅上的秒数要能更新）',
	t.boardKeyOf(Object.assign({}, pf, { staleFor: 3 })) ===
	t.boardKeyOf(Object.assign({}, pf, { staleFor: 12 })), false);
eq('同一档内秒数变了 → 指纹不变（别每拍重建）',
	t.boardKeyOf(Object.assign({}, pf, { staleFor: 3 })),
	t.boardKeyOf(Object.assign({}, pf, { staleFor: 7 })));
eq('滞留只影响灯色一次：读数条指纹只认有没有滞留',
	t.railKeyOf(Object.assign({}, pf, { staleFor: 3 }), {}),
	t.railKeyOf(Object.assign({}, pf, { staleFor: 300 }), {}));
eq('读数条指纹认得出「开始滞留」', t.railKeyOf(pf, {}) ===
	t.railKeyOf(Object.assign({}, pf, { staleFor: 3 }), {}), false);

/* ================================================================== *
 * 22. 提示的通道：瞬时事件走官方通知条，常驻状态走页内横幅
 * 官方 LuCI 没有 ui.addToast / ui.toast（那是厂商分支的 API，真机 ui.js 命中 0），
 * 确实存在的是 ui.addTimeLimitedNotification(title, node, ms, ...classes)。
 * 分通道的理由：通知条是一次性的、不会随状态变化改写，所以「读数滞留」这种
 * 要原地更新的话必须留在页内横幅里。
 * ================================================================== */
t.store.set({ flash: null });
notifications.length = 0;
t.flash('已启动一轮测速', '引擎说这一轮开始了', 'ok');
eq('瞬时事件走官方限时通知', notifications.length, 1);
eq('通知条标题就是这句话', notifications[0].title, '已启动一轮测速');
eq('通知条正文是节点不是裸串', notifications[0].text, '引擎说这一轮开始了');
eq('通知条 6 秒自动消失', notifications[0].ms, 6000);
eq('语义色翻成主题的样式类', notifications[0].cls, 'success');
eq('走了通知条就不再占页内横幅', String(t.store.get().flash), 'null');

t.flash('读取状态没有回应', '页面停在 46 秒前的读数上', 'warn', 1);
eq('常驻状态仍写页内横幅（要能跟着 store 原地更新）', t.store.get().flash.tone, 'warn');
eq('常驻状态不去挤通知条', notifications.length, 1);

notifyImpl = undefined;         /* 模拟老版本 LuCI 没有这个 API */
t.store.set({ flash: null });
t.flash('复制失败', '浏览器不让写剪贴板', 'warn');
eq('没有官方 API 时退回页内横幅', t.store.get().flash.title, '复制失败');
eq('退回的横幅照样带上语义色', t.store.get().flash.tone, 'warn');
notifyImpl = function (title, body, ms, cls) {
	notifications.push({ title: String(title), text: textOf(body), ms: ms, cls: cls });
};

/* ================================================================== *
 * 23. 通道换成 rpcd 的 ucode 具名方法（不再是 file.exec）
 * file.exec 的 ACL 语义是「允许用任意参数执行这个绝对路径」；换成具名方法后，
 * 能做什么由插件里那张表决定。回包形状 { ok, text }，text 是引擎原样输出，
 * 解析仍然只在视图这一层（字段契约不在两处各写一遍）。
 * ================================================================== */
ok('视图不再走 rpcd 的 file.exec', !/method: 'exec'/.test(src0) && !/object: 'file'/.test(src0));
ok('视图声明了 ucode 对象名', /var RPC_OBJECT = 'luci\.cf-ipcheck'/.test(src0));
rpcImpl = async (decl) => { lastDecl = decl; return '{"state":"done","items":[]}'; };
let lastDecl = null;
eq('runCmd 把 {ok,text} 里的 text 交出来', await t.runCmd([ 'status' ]), '{"state":"done","items":[]}');
eq('status 走的是插件的 status 方法', lastDecl.object + '/' + lastDecl.method, 'luci.cf-ipcheck/status');
await t.runCmd([ 'check-sources' ]);
eq('check-sources 走的是插件的 check_sources 方法（下划线）', lastDecl.object + '/' + lastDecl.method, 'luci.cf-ipcheck/check_sources');
await t.runCmd([ 'run-now' ]);
eq('run-now 走的是插件的 run 方法', lastDecl.method, 'run');
rpcImpl = async () => { throw new Error('ubus 拒绝'); };
eq('调用被拒 → null（不是 HUNG）', await t.runCmd([ 'status' ]), null);
rpcImpl = async () => ({ ok: true });          /* 少了 text，形状不对就当没读到 */
eq('回包形状不对时按「读不到」处理，不猜', await t.runCmd([ 'status' ]), null);
rpcImpl = async () => '';
eq('认不出的子命令一律 null，绝不发一个不存在的 ubus 方法', await t.runCmd([ 'bogus-cmd' ]), null);
/* 「调不到引擎」的排查话术集中在一处，成因要带上 ucode 这条路特有的两种可能 */
const why = t.whyNoReply ? t.whyNoReply('读不到日志', 'logs') : '';
ok('排查话术提到 rpcd-mod-ucode', /rpcd-mod-ucode/.test(why));
ok('排查话术提到 rpcd reload', /reload/.test(why));
ok('排查话术点名是哪个方法', /logs/.test(why));

/* ================================================================== *
 * 24. 轮询交给官方 L.poll：登记唯一、改节奏不重复、停机后能再开
 * ================================================================== */
t.store.set({ status: { state: 'running', stage: 'probe', stage_done: 1, stage_total: 9, items: [] }, busy: {} });
pollStub.__reset();
t.startPoll();
t.startPoll();
t.startPoll();
eq('连着开三次也只登记一份（L.poll 按函数身份去重，我们也自己拦）', livePolls(), 1);
eq('登记的间隔就是正常节奏', pollSecOf(t.pollTick), t.POLL_SEC);
ok('startPoll 之后全局表确实在转（视图自己调了 poll.start，不靠框架别处带）',
	pollStub.active() === true);
t.stopPoll();
ok('stopPoll 连表一起停（不留一个空转的全局定时器拖累别的页面）',
	pollStub.active() === false);
eq('停轮询是撤登记，不是留着不管', livePolls(), 0);
t.startPoll();
eq('停了之后还能重新开起来', pollSecOf(t.pollTick), t.POLL_SEC);
t.stopPoll();
eq('重复停不报错', livePolls(), 0);
ok('视图里已经没有自己写的 setInterval 轮询', !/setInterval\(/.test(src0.replace(/\/\*[\s\S]*?\*\//g, '')));
/* L.poll 的重入守卫是 Promise.resolve(fn()).finally(...) 判的：pollTick 不把
 * promise 交回去，那个守卫就是空转的（它以为这一拍瞬间完成）。 */
t.store.set({ status: { state: 'running', stage: 'probe', stage_done: 1, stage_total: 9, items: [] }, busy: {} });
rpcImpl = async () => '{"state":"running","stage":"probe","stage_done":2,"stage_total":9,"items":[]}';
const tickRet = t.pollTick();
ok('pollTick 把 promise 交回给 L.poll（守卫才有东西可判）',
	!!tickRet && typeof tickRet.then === 'function');
await tickRet;
eq('这一拍确实读到了新进度', t.store.get().status.stage_done, 2);

/* ================================================================== *
 * 25. r39：审查确认的八条 bug，逐条钉住
 * ================================================================== */
/* 25a 插件说「没执行成」时，绝不能再被当成「跑完了但没结果」 */
rpcImpl = async () => ({ ok: false, text: null });
eq('ok:false + text:null → 按「没执行成」交回 null', await t.runCmd([ 'status' ]), null);
rpcImpl = async () => ({ ok: false, text: '' });
eq('ok:false + 空串也按「没执行成」（run-now 不再报绿色的假成功）', await t.runCmd([ 'run-now' ]), null);
rpcImpl = async () => ({ ok: true, text: '{"state":"never_run","items":[]}' });
eq('引擎真的回 never_run 时仍按 never_run（两条路没被混掉）',
	t.parseStatus(await t.runCmd([ 'status' ])).state, 'never_run');
rpcImpl = async () => '';

/* 25b busy.refresh 只服务手动刷新：它进了 railKeyOf，轮询每拍翻两次就等于
 * 每拍重建读数条，而重建会换掉按钮节点 —— 真实鼠标点击会被吞（r29 的教训）。 */
let releaseStatus = null;
rpcImpl = () => new Promise((res) => { releaseStatus = () => res({ ok: true, text: '{"state":"never_run","items":[]}' }); });
t.store.set({ status: { state: 'never_run', items: [] }, busy: {} });
const pm25 = t.refresh(true);
eq('手动点刷新时置 busy.refresh（按钮该有转圈）', t.store.get().busy.refresh, true);
releaseStatus();
await pm25;
eq('手动刷新结束后把标记清掉', String(t.store.get().busy.refresh), 'false');
releaseStatus = null;
const pa25 = t.refresh();
eq('轮询那一拍不碰 busy.refresh', String(t.store.get().busy.refresh), 'false');
releaseStatus();
await pa25;
rpcImpl = async () => '';

/* 25c 人手动试探失败不该往「连着几次没读到」里记账 */
const failBefore = t.pollFail;
t.afterMiss({ state: 'running', items: [] }, true, true);
eq('手动刷新失败：pollFail 不涨', t.pollFail, failBefore);
t.afterMiss({ state: 'running', items: [] }, true, false);
eq('轮询失败才计入连续失败', t.pollFail, failBefore + 1);
t.afterMiss({ state: 'running', items: [] }, true, false);

/* 25d 跑着的时候不许复制上一轮的榜单（页面上根本没显示列表） */
const railRunning = t.StatusRail({ state: 'running', items: [ { ip: '1.1.1.1' } ] }, {}, noActions);
const copyBtn = byTag(railRunning, 'button').find((b) => textOf(b).includes('复制榜单'));
ok('运行中「复制榜单 IP」是禁用的', copyBtn && copyBtn.disabled === true);
ok('并且说清为什么禁用', copyBtn && String(copyBtn.attrs.title || '').includes('还在跑'), false);
const railDone = t.StatusRail({ state: 'done', items: [ { ip: '1.1.1.1' } ] }, {}, noActions);
const copyBtn2 = byTag(railDone, 'button').find((b) => textOf(b).includes('复制榜单'));
ok('跑完了就能复制', copyBtn2 && !copyBtn2.disabled);

/* 25e 表格的列数必须等于它自己那套网格的轨道数。
 * 真机踩过：源清单只有 5 列却套了榜单的 9 条轨道 —— URL 列被压到 34px
 * （文字溢出到自己的框外）、HTTP 列反而占 708px，右边还挂 4 条空轨道。 */
function trackCount(spec) {
	/* 轨道之间是空格分隔；逗号只出现在 minmax(0,1fr) / clamp(...) 这类函数里面，
	 * 所以要在括号深度为 0 时才把空白当分隔符。 */
	let depth = 0, n = 0, pending = false;
	for (const ch of String(spec)) {
		if (ch === '(') depth++;
		else if (ch === ')') depth--;
		else if (/\s/.test(ch) && depth === 0) { if (pending) { n++; pending = false; } continue; }
		pending = true;
	}
	if (pending) n++;
	return n;
}
const lbRule = /\.cfp \.brow\{[^}]*?grid-template-columns:([^;]+);/.exec(css);
const srcRule = /\.cfp \.board\.src \.brow\{[^}]*?grid-template-columns:([^;]+);/.exec(css);
ok('CSS 里两条网格模板都在', !!lbRule && !!srcRule);
eq('榜单：列定义数 = 自己的轨道数', t.COLS.length, trackCount(lbRule[1]));
eq('源清单：列定义数 = 自己的轨道数（不再共用榜单的）', t.SRC_COLS.length, trackCount(srcRule[1]));
const srcBoard = t.SourceMatrix([ { url: 'https://x/y.txt', http: '200', rc: 0, ips: 12, cf_in: 12 } ]);
ok('源清单的容器带上了 board src 这个类', String(srcBoard.attrs['class'] || '').includes('board src'));
eq('源清单渲染出来的单元格数与列定义一致',
	byClass(srcBoard, 'brow')[1].childNodes.length, t.SRC_COLS.length);

/* 25f pollTick 必须把 promise 交回去，且同步抛错不能让心跳永久卡死 */
ok('pollTick 返回 promise（L.poll 的重入守卫靠它复位）',
	(() => {
		t.store.set({ status: { state: 'never_run', items: [] }, busy: {} });
		const r = t.pollTick();
		return !!r && typeof r.then === 'function';
	})());

/* 25g ARIA：屏幕阅读器要能看懂这棵树 */
const lbAria = t.Leaderboard([ { ip: '1.1.1.1', code: 200 } ]);
eq('榜单容器带 role=table（行是 role=row、格是 cell/columnheader，缺祖先就是噪声）',
	(byClass(lbAria, 'board')[0].attrs || {}).role, 'table');
const smAria = t.SourceMatrix([ { url: 'https://x', http: '200', rc: 0, ips: 1, cf_in: 1 } ]);
eq('源清单容器也带 role=table', (smAria.attrs || {}).role, 'table');
const panesOk = [ 'board', 'sources', 'logs', 'config' ].every((k) => {
	const p = t.P.panes && t.P.panes[k];
	return p && p.attrs.role === 'tabpanel' && p.attrs.tabindex === '0' &&
		p.attrs['aria-labelledby'] === 'cfp-tab-' + k;
});
ok('四个面板都是 role=tabpanel + tabindex=0 + aria-labelledby 指回自己的标签', panesOk);
const tabIds = [ 'board', 'sources', 'logs', 'config' ].every((k) =>
	(t.P.tabs ? String(textOf(t.P.tabs)).length > 0 : true) && t.P.panes[k].attrs.id === 'cfp-pane-' + k);
ok('面板各自的 id 与标签的 aria-controls 对得上', tabIds);
const lfMap = fakeForm([ 'enabled', 'totally_unknown_option_xyz' ]);
const lfWrap = t.regroupForm(lfMap);
const lfGrps = byClass(lfWrap, 'grp');
const leftover = lfGrps.find((g) => textOf(g).includes('其它'));
ok('认不出归属的字段落到「其它」兜底组', !!leftover);
ok('兜底组也交了 __apply（顶部「全部展开 / 收起」管得到它）',
	leftover && typeof leftover.__apply === 'function');
const lfHead = leftover ? byClass(leftover, 'grp-h')[0] : null;
ok('兜底组的标题可键盘操作（tabindex + role=button + aria-expanded）',
	!!lfHead && lfHead.attrs.tabindex === '0' && lfHead.attrs.role === 'button' &&
	lfHead.attrs['aria-expanded'] === 'true');
leftover.__apply(false);
eq('调 __apply(false) 真的会收起', leftover.className.indexOf('open') >= 0, false);
eq('同时把 aria-expanded 改掉', lfHead.attrs['aria-expanded'], 'false');

/* ================================================================== *
 * 26. r41：源清单编辑搬进「源与检测」页 + 「保存并检测」的顺序
 * Ryan 要求把源编辑与源检测并成一页。两个必须钉住的性质：
 *   a) 那一行只有一份，且搬进源页的固定宿主（不参与每拍重画）；
 *   b) 检测之前必须先保存，保存失败就不检测（否则检的是配置文件里的旧清单，更骗人）。
 * ================================================================== */
eq('源清单不再归「配置」的任何分组（改由源页宿主接管）',
	(t.GROUP_OPTIONS.pool || []).indexOf('community_sources'), -1);
eq('它被登记成"只搬不分组"的字段', t.EDIT_ONLY_OPTIONS.community_sources, true);

const mgMap = fakeForm([ 'enabled', 'use_official_ranges', 'community_sources', 'candidate_budget' ]);
/* HELP 是 render() 里逐条 help() 注册进来的；这里不跑整个 render，先手工登记这一条，
 * 才能验"ⓘ 跟着那一行一起搬过来"。 */
t.help('community_sources', '这一项显示在「源与检测」页顶部。', '完整解释：逐行提取 IPv4 并进候选池。');
/* form.js 会在字段行里生成说明节点，ⓘ 是贴在它上面的 —— 桩要照形状补出来才测得到"ⓘ 跟着搬" */
mgMap.querySelectorAll('.cbi-value').forEach(row => {
	const d = makeNode('div');
	d.attrs['class'] = 'cbi-value-description';
	row.appendChild(d);
});
const mgHost = makeNode('div');
const mgWrap = t.layoutForm(mgMap, mgHost);
const mgRow = mgMap.querySelectorAll('.cbi-value').concat(mgHost.querySelectorAll('.cbi-value'))
	.find(r => String((r.querySelector('label[for]') || {}).htmlFor || '').indexOf('community_sources') >= 0);
ok('源清单那一行确实找到了', !!mgRow);
ok('那一行搬进了源页的宿主里', hasAncestor(mgHost, mgRow));
ok('那一行已经不在配置页的分组容器里（全文只有一份）', !hasAncestor(mgWrap, mgRow));
const mgBox = byClass(mgHost, 'src-edit')[0];
ok('宿主里是一个可折叠盒（复用配置页那套 .grp 外观）', !!mgBox && !!mgBox.__apply);
const mgHead = mgBox ? byClass(mgBox, 'grp-h')[0] : null;
ok('默认收起（这次合并就是为了省版面）', !!mgHead && mgHead.attrs['aria-expanded'] === 'false');
ok('收起状态下输入区不可见', !!mgBox && mgBox.className.indexOf('open') < 0);
mgBox.__apply(true);
ok('点开后 aria-expanded 跟着翻', byClass(mgBox, 'grp-h')[0].attrs['aria-expanded'], 'true');
const mgText = textOf(mgHost);
ok('折叠标题说清"改完点保存并检测"', mgText.includes('保存并检测'));
ok('源清单那一行的 ⓘ 也跟着搬过来了', byClass(mgHost, 'hmark').length >= 1);
const mgMap2 = mgMap;			/* 同一个宿主，再排一次（模拟 m.save() 之后 form.js 重画 map） */
t.layoutForm(mgMap2, mgHost);
eq('重复排版不会在宿主里叠出两份编辑盒', byClass(mgHost, 'src-edit').length, 1);

/* 「保存并检测」的顺序：先 save 再 check；save 失败则不 check */
t.P.form = new formStub.Map();
t.P.mapnode = mgMap2;
t.P.srcEdit = mgHost;
let seenCmds = [];
const oldRpc = rpcImpl;
rpcImpl = (decl) => { seenCmds.push(String(decl.method || '')); return Promise.resolve('[{"url":"a.example","code":"200","ips":10,"inflows":9}]'); };
saveCalls.length = 0;
saveImpl = () => { seenCmds.push('save'); return Promise.resolve(); };
t.actCheck(null);
await new Promise((r) => setImmediate(r));
await new Promise((r) => setImmediate(r));
eq('确实先调了 Map.save()', seenCmds[0], 'save');
ok('保存之后才发 check_sources', seenCmds.indexOf('check_sources') > 0);
eq('保存按钮的忙碌标记落地后被清掉', String(t.store.get().busy.check), 'false');
eq('检测结果进了 store', t.store.get().sources && t.store.get().sources.state, 'ok');

seenCmds = [];
saveCalls.length = 0;
saveImpl = () => Promise.reject(new TypeError('选项 "定时周期（小时）" 里的输入不合法'));
t.actCheck(null);
await new Promise((r) => setImmediate(r));
await new Promise((r) => setImmediate(r));
eq('保存被拒时没有去检测（免得拿旧清单的结果骗人）', seenCmds.indexOf('check_sources'), -1);
eq('状态说清是保存失败', t.store.get().sources.state, 'save_failed');
ok('失败原因把 LuCI 的校验文案带出来', String(t.store.get().sources.reason).includes('定时周期'));
eq('忙碌标记照样清掉（不能卡在转圈）', String(t.store.get().busy.check), 'false');
rpcImpl = oldRpc;
saveImpl = () => Promise.resolve();

/* 每拍重画不许碰编辑宿主：输入框被换掉 = 打字打到一半丢字 + 吞真实点击（r29 的机制） */
const mgPage = t.buildPage(null);
const hostRef = t.P.srcEdit;
const boxRef = hostRef && hostRef.childNodes[0];
t.store.set({ status: t.parseStatus(JSON.stringify({ state: 'running', stage: 'fetch', stage_done: 3, stage_total: 13 })) });
fireTimers(0);
t.store.set({ sources: { state: 'ok', rows: srcRows } });
fireTimers(0);
t.store.set({ busy: Object.assign({}, t.store.get().busy, { check: true }) });
fireTimers(0);
ok('重画之后编辑宿主还是同一颗节点', t.P.srcEdit === hostRef && t.P.srcEdit.childNodes[0] === boxRef);
ok('而结果区确实被重画了（说明上面那条不是"整个没动"）',
	!!t.P.srcRes && textOf(t.P.srcRes).includes('a.example'));

/* 「下一轮约 …」的口径必须跟引擎的守门一致：从【起轮】算，不是从【结束】算。
 * 一轮跑两三分钟，用 finished 算就会把预估晚推这么久，页面说的时间和实际开跑对不上。 */
const slStart = Date.UTC(2026, 9, 13, 10, 0, 0);			/* 10:00:00Z 起轮 */
const slFin = Date.UTC(2026, 9, 13, 10, 3, 0);			/* 10:03:00Z 结束 */
const slWant = new Date(slStart + 6 * 3600000);
const slBad = new Date(slFin + 6 * 3600000);
function hhmm(d) {
	const p = (n) => (n < 10 ? '0' + n : String(n));
	return p(d.getHours()) + ':' + p(d.getMinutes());
}
const slLine = t.scheduleLine({ enabled: 1, interval: 6,
	started: new Date(slStart).toISOString(), finished: new Date(slFin).toISOString() });
ok('预估落在「起轮 + 周期」那一刻', slLine.includes(hhmm(slWant)), slLine);
ok('而不是「结束 + 周期」（会晚整整一轮的时长）', slLine.indexOf(hhmm(slBad)) < 0, slLine);

console.log(fails === 0 ? '=== view 渲染断言全部通过' : `=== view 渲染断言失败 ${fails} 项`);
process.exit(fails === 0 ? 0 : 1);
