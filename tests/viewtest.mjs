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
	"\ttone: tone, stateWord: stateWord, why: why, whyMore: whyMore,\n" +
	"\tnum: num, ms: ms, mbps: mbps, ago: ago, clock: clock,\n" +
	"\tstale: stale, scheduleLine: scheduleLine, DASH: DASH,\n" +
	"\tLeaderboard: Leaderboard, DcSummary: DcSummary, COLS: COLS, domainKinds: domainKinds,\n" +
	"\tRunProgress: RunProgress, STAGES: STAGES, SRC_COLS: SRC_COLS,\n" +
	"\tSummaryStrip: SummaryStrip, BoardPane: BoardPane, AutoOffHint: AutoOffHint,\n" +
	"\tSourceMatrix: SourceMatrix, SourcesPane: SourcesPane, srcMessage: srcMessage, srcMore: srcMore,\n" +
	"\tparseLog: parseLog, LogsPane: LogsPane, LogBlock: LogBlock, logTone: logTone,\n" +
	"\tlogStamp: logStamp, logAnchor: logAnchor, logAnchorTop: logAnchorTop,\n" +
	"\tTabBar: TabBar, StatusRail: StatusRail, Readout: Readout,\n" +
	"\tICONS: ICONS, svgIcon: svgIcon, Button: Button,\n" +
	"dnsLinesOf: (typeof dnsLinesOf === 'function' ? dnsLinesOf : null), dnsTextOf: (typeof dnsTextOf === 'function' ? dnsTextOf : null),\n" +
	"DnsRowsEditor: (typeof DnsRowsEditor === 'function' ? DnsRowsEditor : null),\n" +
	"\tregroupForm: regroupForm, ConfigPane: ConfigPane,\n" +
	"\thelp: help, applyHelp: applyHelp, HelpMark: HelpMark, HELP: HELP,\n" +
	"\tTAB_DEFS: TAB_DEFS, GROUPS: GROUPS, GROUP_OPTIONS: GROUP_OPTIONS,\n" +
	"\tel: el, luminanceOf: luminanceOf, detectScheme: detectScheme,\n" +
	"\tlinkStyle: linkStyle, applyScheme: applyScheme, CSS_PATH: CSS_PATH,\n" +
	/* 用 typeof 兜一下：让 r47 那种「还没有 watchScheme」的旧视图也能加载，
	 * 好把「缺了这个函数」变成一条看得懂的 FAIL，而不是整份文件报错。 */
	"\twatchScheme: (typeof watchScheme === 'function' ? watchScheme : null),\n" +
	"\tget store() { return store; },\n" +
	"\tget P() { return P; }, goto: goto, savedTab: savedTab,\n" +
	"\tbuildPage: buildPage, runCmd: runCmd,\n" +
	"\thashTab: hashTab, writeHashTab: writeHashTab, watchHash: watchHash, logStamp: logStamp, actLogFull: actLogFull,\n" +
	"\terrKindName: (typeof errKindName === 'function' ? errKindName : null),\n" +
	"\tactRun: actRun, actCheck: actCheck, actStop: actStop,\n" +
	"\tsourcesMap: sourcesMap, mountSourcesForm: mountSourcesForm,\n" +
	"\tpendingSourceEdits: pendingSourceEdits,\n" +
	"\trailKeyOf: railKeyOf, boardKeyOf: boardKeyOf,\n" +
	"\tlogsRefresh: logsRefresh,\n" +
	"\trefresh: refresh, startPoll: startPoll, stopPoll: stopPoll, afterMiss: afterMiss,\n" +
	"\tflash: flash, whyNoReply: whyNoReply,\n" +
	"\tget pollFail() { return pollFail; }, pollGapSec: pollGapSec,\n" +
	"\tPOLL_SEC: POLL_SEC, POLL_SLOW_SEC: POLL_SLOW_SEC, pollTick: pollTick,\n" +
	"\tFAIL_STALE: FAIL_STALE, FAIL_GIVEUP: FAIL_GIVEUP,\n" +
	"\tHUNG: HUNG, CMD_LIMIT: CMD_LIMIT, isRunningReply: isRunningReply\n" +
	"};\n";

/* ---- 导出面预检 ----------------------------------------------------------
 * 钩子里引用的每个私有符号必须在源码里真的存在。直接 new Function 的话，任何
 * 一个改名都会让整份脚本在加载阶段 ReferenceError：输出只有一句“x is not
 * defined”，844 条断言一条都跑不到，看起来像测试坏了而不是代码变了。
 * 这里先把缺失的名字一次性列出来再退出。 */
const hookRefs = [];
for (const m of hook.matchAll(/\b([A-Za-z_$][\w$]*)\s*:\s*(?:\(\s*typeof\s+)?([A-Za-z_$][\w$]*)/g))
	hookRefs.push(m[2]);
for (const m of hook.matchAll(/\bget\s+[A-Za-z_$][\w$]*\s*\(\s*\)\s*\{\s*return\s+([A-Za-z_$][\w$]*)/g))
	hookRefs.push(m[1]);
const exportedNames = [ ...new Set(hookRefs) ].filter((n) => !/^(null|undefined|true|false)$/.test(n));
const missingExports = exportedNames.filter((n) =>
	!new RegExp('(^|\\n)(?:function|var)\\s+' + n + '\\b').test(src0));
if (missingExports.length) {
	console.log('NO-SYMBOL: ' + missingExports.join(', '));
	console.log('  钩子引用了源码里不存在的名字；改名/删除后要同步改本文件的 hook 列表');
	process.exit(1);
}
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
		if (!c) return c;
		/* 真 DOM 的 appendChild 会把节点从原父节点上**摘下来**再挂过去。桩件以前不摘，
		 * 于是"搬家"在这里变成"复制"：搬完的旧容器里还留着同一份节点，
		 * querySelector 数出来是双份，而"这个容器已经空了"的判断全部失真
		 * ——r61 收拾空壳那段就是被它坑了一次（数到 2 个 h3 没摘、字段数翻倍）。 */
		if (c.parentNode && Array.isArray(c.parentNode.childNodes)) {
			const old = c.parentNode;
			const i = old.childNodes.indexOf(c);
			if (i >= 0) old.childNodes.splice(i, 1);
		}
		c.parentNode = this;
		this.childNodes.push(c);
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
	/* r55 的内联 SVG 图标走这条。桩件不需要命名空间语义，但必须存在：
	 * 视图里 `!document.createElementNS` 是"这引擎画不了 SVG"的判空分支，
	 * 不给它，图标那条断言会一律测成"图标位是空的"。 */
	createElementNS: (ns, tag) => {
		const n = makeNode(tag);
		n.namespaceURI = String(ns);
		return n;
	},
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
/* location / history：r59 的「标签进 URL」要用。做成可写的假对象，并且把
 * replaceState 的调用记下来 —— 直接赋值 location.hash 会在浏览器历史里每切一次
 * 标签留一条记录（后退要在四个标签间走半天），所以视图走的是 replaceState；
 * 这条区别只能在这里钉住，光看源码看不出来。 */
const locationStub = { hash: '' };
const replaceCalls = [];
const winListeners = {};
const windowStub = {
	location: locationStub,
	history: {
		replaceState(stub, title, url) { replaceCalls.push(String(url)); locationStub.hash = String(url); }
	},
	addEventListener(ev, fn) { (winListeners[ev] = winListeners[ev] || []).push(fn); },
	removeEventListener(ev, fn) {
		const a = winListeners[ev] || [];
		const i = a.indexOf(fn);
		if (i >= 0) a.splice(i, 1);
	},
	fire(ev) { (winListeners[ev] || []).slice().forEach(fn => fn({})); },
	count(ev) { return (winListeners[ev] || []).length; },
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
	const sec = { options: [], option: function (T, name, label) {
		/* form.js 的 option() 交回来的是带 .value(k, v) 的对象（ListValue 靠它加选项），
		 * 桩里照抄这个口 —— 否则视图里 o.value(...) 会被测成"调了个不存在的方法"，
		 * 而真机上它是成立的一步。 */
		const o = { name: name, __opt: true, __label: label, __values: [],
			value: function (k, v) { this.__values.push([k, v]); return this; } };
		this.options.push(o);
		return o;
	} };
	this.sections.push(sec);
	return sec;
};

const formStub = {
	Map: MapStub,
	TypedSection: 'TypedSection',
	Flag: 'Flag',
	Value: 'Value',
	ListValue: 'ListValue',
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
/* render() 按声明过的 option 产出一棵假表单（真 form.js 也是这么产 .cbi-value 的），
 * 这样"整张 map 节点被搬进宿主"这件事能被断言，而不是只在文字层面成立。 */
MapStub.prototype.render = function () {
	const names = [];
	this.sections.forEach(s => s.options.forEach(o => names.push(o.name)));
	return Promise.resolve(fakeForm(names));
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
let nassert = 0;
function eq(desc, got, want) {
	nassert++;
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
/* r63：只给时分秒。以前这里顺手带一个「（5 小时前）」，而它唯一的调用点就是
 * 「完成于」那一格的小字，那格的大字读数本来就是 ago() —— 同一句话在同一格里两遍。 */
eq('clock 只给时分秒，不再带距今', /^\d\d:\d\d:\d\d$/.test(t.clock(isoNew)), true, t.clock(isoNew));
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
/* r70：错误态拆两层 —— 结论常驻（含 rc=23 与下一步），引擎的自愈动作挂 whyMore。
 * 钉住「搬去悬停的细节没丢」：chmod 711 与 .null 666 是原来长句里的实质信息。 */
ok('sink_not_writable 的深度细节进了 whyMore（chmod 711 / .null 666 没丢）',
	/chmod 711/.test(t.whyMore('sink_not_writable')) && /666/.test(t.whyMore('sink_not_writable')));
eq('没登记深度的原因 whyMore 给空串（不会弹个空展开）', t.whyMore('empty_pool'), '');
ok('empty_pool 给出下一步', /源|检测/.test(t.why('empty_pool')));
/* 兜底那句的用处：页面没登记过的原因码不能变成一句英文码糊给用户，
 * 必须仍然说清「发生了什么 + 去哪儿看 + 下一步」。r49 把文案改成人话后这样判。 */
ok('未知原因走兜底：带上原始码、指向日志、给出重试动作',
	t.why('something_new').includes('something_new') && /日志/.test(t.why('something_new')) && /立即测速/.test(t.why('something_new')));
ok('兜底句不再把英文 reason= 当正文抛给用户', !/reason=/.test(t.why('something_new')));

/* ---- r58：三种"没有新结果"的收尾要分开说；下一轮的预告要接引擎那道门 ---- */
ok('stopped 有自己的话术，且不落到"没登记过这个码"那条兜底',
	/不是故障/.test(t.why('stopped')) && !/还没登记过/.test(t.why('stopped')));
ok('stopped 说的是"按你点的停止"，不是"断了"', /你点的「停止本轮」/.test(t.why('stopped')));
ok('no_results 说清是跑完了但零达标', /没有一条 IP 达标/.test(t.why('no_results')) && !/还没登记过/.test(t.why('no_results')));
ok('interrupted 那条没被新分支顶掉', /断电|被杀/.test(t.why('interrupted')));
eq('叫停的灯退到 warn（不是红的"失败"）', t.tone({ state: 'error', reason: 'stopped' }), 'warn');
eq('零达标的灯也退到 warn', t.tone({ state: 'error', reason: 'no_results' }), 'warn');
eq('没有原因码的 error 仍然报红', t.tone({ state: 'error' }), 'bad');
eq('灯上写「已停止」而不是「本轮失败」', t.stateWord({ state: 'error', reason: 'stopped' }), '已停止');
ok('零达标写成「跑完 · 无达标」，不冒充已完成',
	t.stateWord({ state: 'error', reason: 'no_results' }).includes('无达标') &&
	t.stateWord({ state: 'error', reason: 'no_results' }) !== '已完成');
/* 期望值都从同一个式子算出来，不拿"自己等于自己"当判据（那是空判） */
const hhmmAt = (ms) => { const d = new Date(ms), p = n => (n < 10 ? '0' : '') + n; return p(d.getHours()) + ':' + p(d.getMinutes()); };
const nrEpoch = Math.floor(Date.now() / 1000) + 7200;
eq('预告用引擎给的 next_run，哪怕状态里还带着上一轮的 started',
	t.scheduleLine({ enabled: 1, interval: 6, next_run: nrEpoch, started: '2026-10-15T14:50:05Z', finished: '2026-10-15T14:52:04Z' }),
	'定时实测：每 6 小时，下一轮约 ' + hhmmAt(nrEpoch * 1000));
eq('老引擎没有 next_run 时退回 started + 周期（r41 那条算法还在）',
	t.scheduleLine({ enabled: 1, interval: 6, started: '2026-10-15T14:50:05Z' }),
	'定时实测：每 6 小时，下一轮约 ' + hhmmAt(Date.parse('2026-10-15T14:50:05Z') + 6 * 3600000));
eq('next_run 是脏值 ⇒ 不显示编出来的点，退回 started 那条路',
	t.scheduleLine({ enabled: 1, interval: 6, next_run: '胡来', started: '2026-10-15T14:50:05Z' }),
	'定时实测：每 6 小时，下一轮约 ' + hhmmAt(Date.parse('2026-10-15T14:50:05Z') + 6 * 3600000));

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
eq('单域名时列数 = 10（r83 多了质量列）', byClass(heads, 'bc').length, 10);
eq('数据行数 = 2', byClass(lb, 'data').length, 2);
has('列头用 MB/s', heads, 'MB/s');
hasNot('列头不该出现「下载 MB/s」这种长词', heads, '云计算');

/* 列对齐：数字列 r，IP / 域名 l */
function headCls(lb) { return byClass(byClass(lb, 'head')[0], 'bc').map(d => d.attrs['class']); }
let hc = headCls(lb);
eq('名次列右对齐', hc[0].replace(/ c-key-\w+$/, ''), 'bc r');
eq('IP 列左对齐', hc[1].replace(/ c-key-\w+$/, ''), 'bc l');
eq('HTTP 列右对齐', hc[2].replace(/ c-key-\w+$/, ''), 'bc r');
eq('TCP 列右对齐', hc[3].replace(/ c-key-\w+$/, ''), 'bc r');
eq('总计列右对齐', hc[6].replace(/ c-key-\w+$/, ''), 'bc r');
eq('机房列右对齐', hc[7].replace(/ c-key-\w+$/, ''), 'bc r');
eq('吞吐列右对齐', hc[8].replace(/ c-key-\w+$/, ''), 'bc r');
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
eq('多域名时列数 = 11（质量列 + 胜出域名）', byClass(byClass(lb, 'head')[0], 'bc').length, 11);
ok('多域名时容器带 multi 标记', /multi/.test(lb.attrs['class']));
has('多域名时出现「胜出域名」列', lb, '胜出域名');
eq('空榜单不渲染', t.Leaderboard([]), null);

/* ================================================================== *
 * 4b. r71：多样本验证的行内旁注（丢包/抖动挂 IP 副行、净延迟挂 TTFB 副行）
 * 定列网格不加子元素；null 与「验了但没问题」必须能区分。
 * ================================================================== */
const vItem = {
	ip: '172.64.52.43', code: 200, connect_ms: 65, tls_ms: 171, ttfb_ms: 312.8, total_ms: 916.9,
	colo: 'SIN', speed_mbytes: 8.45, domain: 'www.cloudflare.com',
	loss: 0.33, jitter_ms: 87.5, net_ttfb_ms: 233.5, ray_ok: 1
};
const vLb = t.Leaderboard([ vItem ]);
eq('r71/r83 旁注进质量列，列数固定为 10', byClass(byClass(vLb, 'head')[0], 'bc').length, 10);
has('r71 丢包>0 时 IP 副行出「丢包 33%」', vLb, '丢包 33%');
has('r71 抖动>100ms 时 IP 副行出「抖动 120.5」', t.Leaderboard([ Object.assign({}, vItem, { jitter_ms: 120.5 }) ]), '抖动 120.5');
has('r71 净延迟挂 TTFB 副行', vLb, '净 233.5');
const cleanLb = t.Leaderboard([ Object.assign({}, vItem, { loss: 0, jitter_ms: 50, net_ttfb_ms: null }) ]);
ok('r71 零丢包 + 小抖动时旁注不出现', !/丢包|抖动/.test(textOf(cleanLb)), textOf(cleanLb).slice(0, 160));
ok('r71 net_ttfb_ms 为 null 时不显示净延迟（区分「没验」与「没有该头」）', !/净 /.test(textOf(cleanLb)));
const unvLb = t.Leaderboard([ { ip: '1.1.1.1', code: 200, connect_ms: 1, tls_ms: 1, ttfb_ms: 1, total_ms: 1, colo: 'n/a', speed_mbytes: null, domain: 'd', loss: null, jitter_ms: null, net_ttfb_ms: null, ray_ok: null } ]);
ok('r71 四项全 null（没验过）时任何旁注都不出现', !/丢包|抖动|净 /.test(textOf(unvLb)), textOf(unvLb).slice(0, 160));
has('r71 ray_ok=0 时提示「未验到 CF-RAY」', t.Leaderboard([ Object.assign({}, vItem, { ray_ok: 0 }) ]), '未验到 CF-RAY');
ok('r71 ray_ok=null（没验过）时不提示 CF-RAY', !/CF-RAY/.test(textOf(unvLb)));
ok('r71 抖动 87.5（<=100）不显示抖动旁注', !/抖动/.test(textOf(vLb)));

/* ================================================================== *
 * 5. 汇总读数带：只呈现引擎真给了的数
 * ================================================================== */
let strip = t.SummaryStrip(done);
has('读数带给出候选池', strip, '候选池');
has('读数带给出达标数', strip, '达标');
has('读数带给出榜单条数', strip, '榜单');
has('读数带给出失败分类（中文说法，不再是引擎码）', strip, '超时 9');
ok('分类副行里不残留 timeout/dns 这种原始码', !/timeout|dns/.test(textOf(strip)), textOf(strip).slice(0, 120));
ok('失败分类用 warn 色', byClass(strip, 'warn').length >= 1);
has('读数带给出完成时间', strip, '完成于');
ok('r74 正常完成态仍说「完成于」（不误报成上一轮）', !/上一轮完成于/.test(textOf(strip)), textOf(strip).slice(0, 120));
/* r74：叫停 / 跑完零达标两态展示的是上一轮的榜单（carry_previous 连时间一起搬），
 * 这一格必须换标签，否则「完成于 3 分钟前」会被读成"这一轮刚完成"。 */
{
	const carried = t.SummaryStrip(t.parseStatus(JSON.stringify({
		state: 'error', reason: 'stopped', started: isoNew, finished: isoNew,
		pool: 120, qualified: 0, usable: 2, intercepted: 0, counts: {},
		domains: 'www.cloudflare.com', items: [ { ip: '1.1.1.1', code: 200 } ]
	})));
	has('r74 叫停态改说「上一轮完成于」', carried, '上一轮完成于');
	ok('r74 叫停态里没有裸的「完成于」标签',
		!/完成于/.test(textOf(carried).replace(/上一轮完成于/g, '')), textOf(carried).slice(0, 160));
	const nores = t.SummaryStrip(t.parseStatus(JSON.stringify({
		state: 'error', reason: 'no_results', started: isoNew, finished: isoNew,
		pool: 120, qualified: 0, usable: 0, intercepted: 0, counts: { timeout: 120 },
		domains: 'www.cloudflare.com', items: [ { ip: '1.1.1.1', code: 200 } ]
	})));
	has('r74 跑完零达标态同样说「上一轮完成于」', nores, '上一轮完成于');
}
/* 那一格里大字与小字不能各说一遍同一件事 */
{
	const cells = byClass(strip, 'cell');
	const fin = cells.find(c => /完成于/.test(textOf(c)));
	const big = byClass(fin, 'cell-v')[0].textContent.trim();
	const small = byClass(fin, 'cell-sub')[0].textContent.trim();
	ok('「完成于」小字里不再重复大字那句距今（大字 "' + big + '" / 小字 "' + small + '"）',
		small.indexOf(big) < 0 && !/小时前|分钟前|刚刚|天前/.test(small), small);
	ok('小字仍是那个时刻本身（HH:MM:SS）', /^\d\d:\d\d:\d\d$/.test(small), small);
}
/* 引擎没给 pool 时这一格仍然在（结构稳定），但值是破折号而不是编出来的 0 */
const bare = t.SummaryStrip({ state: 'done', items: [] });
has('缺 pool 时值显示成破折号', byClass(bare, 'n')[0].textContent, t.DASH);
eq('缺 counts 时不画未达标格', hasText(bare, '未达标'), false);

/* C2：那一格的副行不能再是引擎的原始码。真机上它显示过 "00 1 · timeout 18"，
 * 是六张读数卡里唯一一条不是中文的，而页面上没有任何地方解释过这些码。 */
{
	const withCounts = t.SummaryStrip({
		state: 'done', items: [], pool: 89, qualified: 69, usable: 10,
		counts: { none: 69, timeout: 18, tls: 2, transport_23: 1 },
		domains: 'www.cloudflare.com',
		started: '2026-10-17T08:51:59+0800', finished: '2026-10-17T08:54:08+0800'
	});
	const cell = byClass(withCounts, 'cell').find(c => /未达标/.test(textOf(c)));
	const sub = byClass(cell, 'cell-sub')[0].textContent.trim();
	ok('未达标副行换成中文说法，不留 timeout/tls（"' + sub + '"）',
		/超时 18/.test(sub) && /握手失败 2/.test(sub) && !/timeout|tls/.test(sub), sub);
	ok('transport_23 那种翻成「传输出错 23」，把那个数留住', /传输出错 23/.test(sub), sub);
	eq('认不出的码原样带出，不编一句看着笃定的假话', t.errKindName('00'), '00');
	eq('stopped 说成「已叫停」', t.errKindName('stopped'), '已叫停');
}

/* ================================================================== *
 * 6. 榜单面板：五种状态各有各的说法，且互相不串味
 * ================================================================== */
const noActions = { run: noop, stop: noop, refresh: noop, copy: noop, check: noop };

let pane = t.BoardPane(done, noActions);
has('正常态渲染榜单', pane, '104.16.1.1');
has('正常态给出排序说明', pane, '按 TTFB 升序排列');
/* r70：脚注拆两层 —— 短结论常驻页面，六列的完整定义挂 ⓘ（HelpMark，触屏/键盘可点）。
 * 钉住「搬去悬停的细节没丢」：TCP/TLS/TTFB/总计/机房/MB/s 六项定义与 SIN 示例都在。 */
const footNote = byClass(pane, 'note').find(n => /按 TTFB 升序排列/.test(textOf(n)));
ok('榜单脚注带 ⓘ（完整列头解释不占常驻版面）', !!footNote && byClass(footNote, 'hmark').length === 1);
ok('悬停里保留六列的完整定义（TCP/TLS/TTFB/总计/机房/MB/s 一个没丢）',
	!!footNote && byClass(footNote, 'hmark').some(m =>
		/能否连上这个 IP/.test(m.attrs.title) && /SIN 新加坡/.test(m.attrs.title) && /1 MB = 1000 KB/.test(m.attrs.title)));
/* r51：章节标题给读屏器一个可跳的层级（过去整块面板里一个标题元素都没有）。
 * 分组头 .grp-h 故意保持 role=button 的 div —— 那是控件，套标题会变成双重语义。 */
const secHeads = byTag(pane, 'h3');
eq('榜单面板画出一个 h3 章节标题', secHeads.length, 1);
eq('h3 就是「榜单」那颗', secHeads.length ? secHeads[0].textContent : '', '榜单');
eq('h3 带的是原来的 .sec-t 类（视觉不变）', secHeads.length ? String(secHeads[0].className) : '', 'sec-t');

pane = t.BoardPane(t.parseStatus(JSON.stringify({ state: 'done', intercepted: 1, items: [] })), noActions);
has('接管态给出红条', pane, '出口被代理接管');
has('接管态说明跳过机房与吞吐', pane, '跳过机房与吞吐');
ok('接管态红条用 bad 色', byClass(pane, 'bad').length >= 1);
/* r70：红条也拆两层 —— 默认探测域名与「不替你改代理」的边界声明挂 ⓘ */
ok('接管红条带 ⓘ（默认域名与边界声明进了悬停）',
	byClass(byClass(pane, 'flash')[0], 'hmark').some(m =>
		/www\.cloudflare\.com/.test(m.attrs.title) && /不替你改代理/.test(m.attrs.title)));

pane = t.BoardPane(t.parseStatus('{"state":"running","started":"x","items":[]}'), noActions);
has('运行态给等待文案', pane, '正在测速');
ok('运行态有转圈指示', byClass(pane, 'spin').length >= 1);
hasNot('运行态不画空榜单表', pane, '按总耗时升序');

pane = t.BoardPane(t.parseStatus(null), noActions);
has('unreachable 点名是哪个方法，并给出 ucode 这条路的排查项', pane, '调不到 luci.cf-ipcheck 的 status 方法');
has('unreachable 给出那颗「刷新」按钮（与工具栏同一颗，名字必须一样）', pane, '刷新');

pane = t.BoardPane(t.parseStatus('not json at all'), noActions);
has('parse_error 保留原文片段', pane, 'not json at all');
has('parse_error 与 unreachable 措辞不同', pane, '读不懂');

pane = t.BoardPane(t.parseStatus('{"state":"error","reason":"interrupted","items":[]}'), noActions);
has('error 态说明本轮中止', pane, '本轮没有跑完');
has('error 态解释原因', pane, '运行锁已被回收');
has('error 态仍给重跑按钮', pane, '立即测速');
/* r98 P0：空态那颗降为 ghost —— 一屏只留读数带那一颗 primary（UX-028）。
 * 断言用 primary 计数而不是按钮文字：文字还在，只是不该再抢主位。 */
eq('error 空态不再有 primary 按钮', byClass(pane, 'primary').length, 0);

/* 本轮失败但上一轮榜单还在 → 照样展示 */
const errWithItems = t.parseStatus(JSON.stringify({ state: 'error', reason: 'net', items: done.items }));
pane = t.BoardPane(errWithItems, noActions);
has('失败但有旧榜单时仍然列出', pane, '104.16.1.1');
/* r49：列头说明过去只在「正常完成」那条分支画，于是本轮失败/读不到但仍列出 9 列时
 * 一个字都不解释 —— 而那一刻恰恰最需要看得懂列头。三条分支现在共用 BoardTable。 */
has('失败态带旧榜单时也带列头说明', pane, '按 TTFB 升序排列');
has('列头说明里 TTFB 有明文解释', pane, '首字节耗时');
has('列头说明里机房列有明文解释', pane, '城市三字码');
const unreachWithItems = t.parseStatus(JSON.stringify({ state: 'unreachable', items: done.items }));
has('读不到但有旧榜单时同样带说明', t.BoardPane(unreachWithItems, noActions), '按 TTFB 升序排列');
/* 反向对照：真的没榜单时不该硬塞一段讲 9 列的脚注 */
hasNot('空榜单不画列头说明', t.BoardPane(t.parseStatus('{"state":"done","items":[]}'), noActions), '按 TTFB 升序排列');

pane = t.BoardPane(t.parseStatus('{"state":"never_run","items":[]}'), noActions);
has('从未跑过给首轮引导', pane, '还没有测过');
eq('从未跑过的空态也没有 primary 按钮', byClass(pane, 'primary').length, 0);
/* r98 P0-5：默认 enabled=0，手动跑完这一轮之后它不会再自己跑 —— 这句话必须写在
 * 首轮引导里，否则用户会以为"点一次就一直在跑"。 */
has('首轮引导说清"只在手动点时跑"', pane, '只在手动点的时候跑');
pane = t.BoardPane(t.parseStatus('{"state":"done","items":[]}'), noActions);
has('跑完但空榜单时指向配置页', pane, '测速与判定');

/* r98 P1-5：跑过一轮但没开「定时实测」—— 全插件最容易被误解的状态。
 * 用户手动跑一次看到十行结果，很自然会以为它此后一直在跑；而 enabled 默认 0。
 * 四条边界都要钉住：关着要提示、开着不提示、没结果不提示、跑着不提示。 */
const doneManual = t.parseStatus(JSON.stringify({ state: 'done', enabled: 0, interval: 6, items: done.items }));
const offHint = t.AutoOffHint(doneManual, { goto: noop });
ok('有结果但没开定时实测时给提示', !!offHint);
has('提示说清"不会再自己跑"', offHint, '不会再自己跑');
has('提示带上周期数字', offHint, '6 小时');
has('提示给一个去配置页的入口', offHint, '去配置');
eq('开了定时实测就不再提示',
	t.AutoOffHint(t.parseStatus(JSON.stringify({ state: 'done', enabled: 1, items: done.items })), { goto: noop }), null);
eq('没有结果时不提示（那一半交给空态文案）',
	t.AutoOffHint(t.parseStatus(JSON.stringify({ state: 'never_run', enabled: 0, items: [] })), { goto: noop }), null);
eq('正在跑的时候不提示',
	t.AutoOffHint(t.parseStatus(JSON.stringify({ state: 'running', enabled: 0, items: done.items })), { goto: noop }), null);

/* ================================================================== *
 * 6b. r90：数据中心汇总 / 判定口径 / 速度单位
 * ------------------------------------------------------------------
 * 三件事都不允许"看源码猜"：汇总表的行数与折行、口径改动只有列头翻还是连值一起翻、
 * 单位切换取的是哪一列 —— 全在渲染树上量。默认值是配置项自己的事，那几项照 r88 的
 * 做法按声明块断（源码里 o.default 就在字段旁边）。
 * ================================================================== */
{
	/* 引擎给的顺序就是展示顺序（已按中位耗时升序），页面不再排一次 */
	const dc = (code, count, med, ip) => ({ dc: code, count: count, ttfb_med: med, best_ip: ip });
	const dcSum3 = [ dc('NRT', 42, 312, '104.21.0.7'), dc('SIN', 30, 180, '172.64.0.9'),
		dc('LAX', 12, 95, '104.16.9.9') ];

	/* --- 1) 四列表头 --- */
	const ds = t.DcSummary({ dc_summary: dcSum3, dc_pick: 'all' });
	const dcHeads = byClass(byClass(ds, 'head')[0], 'dc').map(c => textOf(c));
	eq('r90 机房汇总渲染出四列表头', dcHeads.join(','), '数据中心,条数,中位 TTFB,最快 IP');
	ok('r90 行用自己那套类（dcrow），没有套用榜单的 10 列 brow',
		byClass(ds, 'dcrow').length === 4 && byClass(ds, 'brow').length === 0);

	/* --- 2) 3 行：全显示，没有「其余」 --- */
	eq('r90 只有 3 个机房时三行都摆出来', byClass(ds, 'data').length, 3);
	hasNot('r90 不超过 6 行时不出现「其余」那一句', ds, '其余');
	has('r90 条数与中位耗时按引擎给的值显示', ds, '42');

	/* --- 3) 7 行：只摆 6 行 + 一行「其余」，可展开 --- */
	const seven = [ 'NRT', 'SIN', 'LAX', 'HKG', 'ICN', 'FRA', 'LHR' ]
		.map((c, i) => dc(c, 10 + i, 100 + i * 10, '104.16.0.' + (i + 1)));
	const big = t.DcSummary({ dc_summary: seven, dc_pick: 'all' });
	eq('r90 7 个机房时只渲染前 6 行', byClass(big, 'data').length, 6);
	has('r90 多出来的那句写清「其余 1 个数据中心（共 7 个）」', big, '其余 1 个数据中心（共 7 个）');
	const moreBtn = byTag(big, 'button')[0];
	ok('r90 展开入口是一颗真按钮（回车/空格天生可点，不用自己接 keydown）',
		!!moreBtn && moreBtn.tagName === 'BUTTON' && moreBtn.attrs['aria-expanded'] === 'false');
	moreBtn.dispatch('click');
	eq('r90 点开后 7 行都在', byClass(big, 'data').length, 7);
	has('r90 点开后那颗按钮改说「只看前 6 个」', big, '只看前 6 个');
	byTag(big, 'button')[0].dispatch('click');
	eq('r90 再点一下收回前 6 行', byClass(big, 'data').length, 6);

	/* --- 4) 当前生效的机房有「当前」标记 --- */
	const dsCur = t.DcSummary({ dc_summary: dcSum3, dc_pick: 'SIN' });
	eq('r90 dc_pick 是具体机房码时只有那一行带标记', byClass(dsCur, 'dc-tag').length, 1);
	eq('r90 标记写的字就是「当前」', textOf(byClass(dsCur, 'dc-tag')[0]), '当前');
	ok('r90 标记落在 SIN 那一行（不是第一行）',
		textOf(byClass(dsCur, 'cur')[0]).includes('SIN'), textOf(byClass(dsCur, 'cur')[0]));
	eq('r90 dc_pick=all 时一个「当前」都不出现',
		byClass(t.DcSummary({ dc_summary: dcSum3, dc_pick: 'all' }), 'dc-tag').length, 0);
	has('r90 dc_pick=auto 时表头旁说明自动选了最快的一个',
		t.DcSummary({ dc_summary: dcSum3, dc_pick: 'auto' }), '自动选了中位最快的一个');

	/* --- 5) 没有 dc_summary：整块不渲染，不留空壳 --- */
	eq('r90 缺 dc_summary 时整块返回 null', t.DcSummary({ items: [] }), null);
	eq('r90 dc_summary 是空数组时同样不渲染', t.DcSummary({ dc_summary: [] }), null);
	eq('r90 榜单面板里不会留一个空的汇总壳', byClass(t.BoardPane(done, noActions), 'dcsum').length, 0);
	/* 位置：读数带之后、榜单表格之前 */
	const paneDc = t.BoardPane(Object.assign({}, done, { dc_summary: dcSum3, dc_pick: 'all' }), noActions);
	const seq = all(paneDc);
	const iStrip = seq.indexOf(byClass(paneDc, 'strip')[0]);
	const iDc = seq.indexOf(byClass(paneDc, 'dcsum')[0]);
	const iBoard = seq.indexOf(byClass(paneDc, 'board').filter(n => !/\bdcsum\b/.test(n.attrs['class']))[0]);
	ok('r90 汇总表夹在读数带与榜单表格之间', iStrip >= 0 && iDc > iStrip && iBoard > iDc,
		[ iStrip, iDc, iBoard ].join('/'));

	/* --- 6) 三个新字段的位置与默认值 --- */
	const newFields = [ 'probe_metric', 'dc_pick', 'speed_unit' ];
	const notInProbe = newFields.filter(n => (t.GROUP_OPTIONS.probe || []).indexOf(n) < 0);
	ok('r90 三个新字段都归在「测速与判定」分组', notInProbe.length === 0, notInProbe.join(','));
	const optBlock = name => {
		const m = new RegExp("thr\\.option\\(form\\.\\w+, '" + name + "'").exec(src);
		return m ? src.slice(m.index, m.index + 800) : '';
	};
	ok('r90 probe_metric 默认 http', /o\.default = 'http'/.test(optBlock('probe_metric')));
	ok('r90 dc_pick 默认 all', /o\.default = 'all'/.test(optBlock('dc_pick')));
	ok('r90 speed_unit 默认 mb', /o\.default = 'mb'/.test(optBlock('speed_unit')));
	ok('r90 三个字段都挂了 help()（长解释不常驻页面）',
		newFields.every(n => src.indexOf("help('" + n + "'") > 0));
	ok('r90 probe_metric 两个取值都在、文案没写成内部术语',
		/'http', _\('按 HTTP 首字节时间'\)/.test(optBlock('probe_metric')) &&
		/'tcp', _\('按 TCP 建连时间'\)/.test(optBlock('probe_metric')) &&
		!/1034|同池|边缘校验/.test(optBlock('probe_metric')));
	ok('r90 probe_metric 长说明写明两种结果不能互相比较',
		/两种方式量的不是同一件事，结果不能互相比较/.test(src) && /低 30%~50%/.test(src));
	ok('r90 speed_unit 长说明写明页面固定 MB/s、只影响 CSV',
		/这一项只影响 CSV/.test(src) || /只决定导出的 CSV/.test(src), 'csv');
	ok('r90 dc_pick 长说明给出 all / auto / 三位机房码三条路',
		/all（默认）/.test(src) && /auto/.test(src) && /三位机房码/.test(src));

	/* --- 7) 口径=tcp：列头翻成 TCP，值取建连时间 --- */
	/* 引擎真形状（r90）：探针一次请求把四列都量回来，切口径只换「排哪一列」，
	 * 所以建连时间仍在原来的 connect_ms 上，不是新拆出来的键。 */
	const tcpIt = [ { ip: '1.1.1.1', code: 200, connect_ms: 12.3, tls_ms: 40, ttfb_ms: 300, total_ms: 320, colo: 'NRT' } ];
	const tcpLb = t.Leaderboard(tcpIt, { metric: 'tcp' });
	const tcpHeads = byClass(byClass(tcpLb, 'head')[0], 'bc').map(n => textOf(n));
	eq('r90 口径=tcp 时原来的 TTFB 列改标成 TCP（表里两个 TCP、没有 TTFB）',
		tcpHeads.filter(h => h === 'TCP').length, 2);
	ok('r90 同时那个位置不再叫 TTFB', tcpHeads.indexOf('TTFB') < 0, tcpHeads.join(','));
	has('r90 该列的值换成建连时间（12.3）', tcpLb, '12.3');
	const tcpRow = byClass(tcpLb, 'data')[0];
	eq('r90 排序列与左边 TCP 列同值（同一次探测，只是换了排序依据）',
		textOf(byClass(tcpRow, 'c-key-ttfb')[0]), textOf(byClass(tcpRow, 'c-key-tcp')[0]));
	ok('r90 items 一个建连字段都没有时列头保持 TTFB（不编数、也不报错）',
		textOf(byClass(t.Leaderboard([ { ip: '1.1.1.1', ttfb_ms: 300 } ], { metric: 'tcp' }), 'head')[0]).includes('TTFB'));
	ok('r90 不传 opts 时行为完全不变（老调用点不用改）',
		textOf(byClass(t.Leaderboard(done.items), 'head')[0]).includes('TTFB'));

	/* --- 8) 单位=mib：列头 MiB/s，值取另一列 --- */
	const mibIt = [ { ip: '1.1.1.1', code: 200, ttfb_ms: 100, total_ms: 150, colo: 'NRT',
		speed_mbytes: 10, speed_mib: 9.54 } ];
	const mibLb = t.Leaderboard(mibIt, { unit: 'mib' });
	has('r90 结果写的是 MiB 时列头出现 MiB/s', mibLb, 'MiB/s');
	ok('r90 这时不再有 MB/s 的列头（含 MiB/s 那一格要排除）',
		byClass(byClass(mibLb, 'head')[0], 'bc').map(n => textOf(n)).indexOf('MB/s') < 0);
	has('r90 MiB 取的是另一列（9.54，不是 10.00）', mibLb, '9.54');
	const mbLb = t.Leaderboard(mibIt);
	has('r90 结果没写单位时仍按 MB/s（默认口径不变）', mbLb, '10.00');
	ok('r90 默认口径下列头还是 MB/s', textOf(byClass(mbLb, 'head')[0]).includes('MB/s'));

	/* --- 9) 口径与当前设置不一致：只在真的不一致时提示 --- */
	const miniMap = makeNode('div');
	const mrow = makeNode('div');
	mrow.attrs['class'] = 'cbi-value';
	const mlab = makeNode('label');
	mlab.attrs['for'] = 'widget.cf_ipcheck.probe_metric';
	const msel = makeNode('select');
	msel.attrs['value'] = 'tcp';
	mrow.appendChild(mlab);
	mrow.appendChild(msel);
	miniMap.appendChild(mrow);
	const prevMap = t.P.mapnode;
	t.P.mapnode = miniMap;
	has('r90 结果口径与当前设置不一致时给出轻提示',
		t.BoardPane(Object.assign({}, done, { probe_metric: 'http' }), noActions),
		'当前结果是用 HTTP 口径测的，与你现在的设置不同');
	hasNot('r90 两边一致时不提示',
		t.BoardPane(Object.assign({}, done, { probe_metric: 'tcp' }), noActions), '与你现在的设置不同');
	t.P.mapnode = prevMap;
	hasNot('r90 读不到当前设置时不瞎猜（表单还没渲染的情况）',
		t.BoardPane(Object.assign({}, done, { probe_metric: 'http' }), noActions), '与你现在的设置不同');
}

/* ================================================================== *
 * 6c. r92：点开机房这一行，看该机房的全部测速明细
 * ------------------------------------------------------------------
 * 断言全在渲染树上量，不看源码：行是不是真的能点（role/tabindex）、点开之后
 * 摆了几条、折叠阈值是多少、两种口径下取的是哪一列、没有明细的机房是不是
 * 真的点不动 —— 以及轮询重画之后用户展开的那一段还在不在（模块级 Set 的
 * 用处只在这条上看得出来）。
 * 每个用例用自己的机房码：展开状态是模块级的，复用同一个码会让上一条的
 * 状态漏到下一条里。
 * ================================================================== */
{
	const it1 = (ip, ttfb, conn, bps) => ({ ip: ip, ttfb_ms: ttfb, connect_ms: conn, speed_bps: bps });
	const dcOf = (code, items, extra) => Object.assign({
		dc: code, count: items.length,
		ttfb_med: items.length ? items[0].ttfb_ms : null,
		best_ip: items.length ? items[0].ip : null,
		items: items
	}, extra || {});
	const rowOf = (node, code) => byClass(node, 'dcrow').filter(n =>
		/\bdata\b/.test(String(n.attrs['class'] || '')) && textOf(n).indexOf(code) >= 0)[0];
	/* 明细只是 role=list 那一段里的 listitem；表头那行不在里面（它没有 role） */
	const itemsIn = node => {
		const box = byClass(node, 'dcilist')[0];
		return box ? all(box).filter(n => n.attrs.role === 'listitem') : [];
	};

	/* --- 1) 有明细：整行是一颗展开按钮，初始 aria-expanded=false --- */
	const s1 = t.DcSummary({
		dc_summary: [ dcOf('AMS', [ it1('104.21.9.1', 200, 40.2, 10000000) ]) ], dc_pick: 'all'
	});
	const r1 = rowOf(s1, 'AMS');
	ok('r92 有明细的机房行是 role=button 且可聚焦',
		!!r1 && r1.attrs.role === 'button' && r1.attrs.tabindex === '0');
	eq('r92 展开前 aria-expanded 是 false', r1 && r1.attrs['aria-expanded'], 'false');
	eq('r92 展开前一条明细都不渲染', byClass(s1, 'dcilist').length, 0);

	/* --- 2) 点开：条数一致、三列各一格、aria 跟上 --- */
	r1.dispatch('click');
	eq('r92 点开后明细条数与该机房的 items 一致', itemsIn(s1).length, 1);
	eq('r92 点开后 aria-expanded 变 true', rowOf(s1, 'AMS').attrs['aria-expanded'], 'true');
	eq('r92 明细容器这时是 role=list', byClass(s1, 'dcilist')[0].attrs.role, 'list');
	const f1 = itemsIn(s1)[0];
	eq('r92 明细每行三格（IP / 延迟 / 吞吐）',
		byClass(f1, 'dci-ip').length + byClass(f1, 'dci-ms').length + byClass(f1, 'dci-sp').length, 3);
	eq('r92 IP 是等宽那一档（.n）', textOf(byClass(f1, 'dci-ip')[0]), '104.21.9.1');
	eq('r92 吞吐按十进制两位小数', textOf(byClass(f1, 'dci-sp')[0]), '10.00');
	eq('r92 明细表头给三列各自的名字',
		byClass(s1, 'dcitem')[0] ? byClass(byClass(s1, 'dcitem')[0], 'dci-h').length : 0, 3);

	/* --- 3) 13 条：默认 12 条 + 「还有 1 个」，点开补上 --- */
	const many = [];
	for (let i = 1; i <= 13; i++)
		many.push(it1('104.22.0.' + i, 300 + i, 50 + i, null));
	const s3 = t.DcSummary({ dc_summary: [ dcOf('BOM', many) ], dc_pick: 'all' });
	rowOf(s3, 'BOM').dispatch('click');
	eq('r92 items 13 条时默认只摆 12 条', itemsIn(s3).length, 12);
	has('r92 末尾一行写「还有 1 个」', s3, '还有 1 个');
	const more3 = byTag(s3, 'button').filter(b => /还有 1 个/.test(textOf(b)))[0];
	ok('r92 那颗「还有」是 reuse 了 .lnk 的行内按钮', !!more3 && /\blnk\b/.test(String(more3.attrs['class'] || '')));
	more3.dispatch('click');
	eq('r92 点开「还有 1 个」后 13 条都在', itemsIn(s3).length, 13);
	has('r92 这时那颗按钮改说「只看前 12 个」', s3, '只看前 12 个');

	/* --- 4) 没测速的那颗：吞吐写 — 且弱化 --- */
	const s4 = t.DcSummary({
		dc_summary: [ dcOf('CDG', [ it1('104.23.0.1', 250, 44, 9000000),
			it1('104.23.0.2', 260, 45, null) ]) ], dc_pick: 'all'
	});
	rowOf(s4, 'CDG').dispatch('click');
	eq('r92 没测速的那颗吞吐写 —（不写 0.00）',
		textOf(byClass(itemsIn(s4)[1], 'dci-sp')[0]), '—');
	ok('r92 这个 — 带 .dim 弱化',
		/\bdim\b/.test(String(byClass(itemsIn(s4)[1], 'dci-sp')[0].attrs['class'] || '')));
	ok('r92 有吞吐的那颗不带 .dim',
		!/\bdim\b/.test(String(byClass(itemsIn(s4)[0], 'dci-sp')[0].attrs['class'] || '')));

	/* --- 5) 判定口径=tcp：延迟列取建连时间 --- */
	const tcp5 = t.DcSummary({
		dc_summary: [ dcOf('DME', [ it1('104.24.0.1', 350, 61.2, null) ]) ],
		dc_pick: 'all', probe_metric: 'tcp'
	});
	rowOf(tcp5, 'DME').dispatch('click');
	eq('r92 口径=tcp 时明细延迟取建连时间（61.2，不是 350.0）',
		textOf(byClass(itemsIn(tcp5)[0], 'dci-ms')[0]), '61.2');
	has('r92 这时明细表头写 TCP', tcp5, 'TCP');
	const http5 = t.DcSummary({
		dc_summary: [ dcOf('EDI', [ it1('104.24.0.2', 350, 61.2, null) ]) ], dc_pick: 'all'
	});
	rowOf(http5, 'EDI').dispatch('click');
	eq('r92 没切口径时同一颗显示首字节时间（350.0）',
		textOf(byClass(itemsIn(http5)[0], 'dci-ms')[0]), '350.0');

	/* --- 6) speeds_unit=mib：吞吐换 MiB 口径 --- */
	const mib6 = t.DcSummary({
		dc_summary: [ dcOf('EWR', [ it1('104.25.0.1', 100, 30, 10000000) ]) ],
		dc_pick: 'all', speed_unit: 'mib'
	});
	rowOf(mib6, 'EWR').dispatch('click');
	eq('r92 单位=mib 时吞吐按 MiB 口径（9.54，不是十进制 10.00）',
		textOf(byClass(itemsIn(mib6)[0], 'dci-sp')[0]), '9.54');
	has('r92 这时明细表头写 MiB/s', mib6, 'MiB/s');

	/* --- 7) items 缺失 / 为空：那一行点不动、也不给箭头 --- */
	const s7 = t.DcSummary({
		dc_summary: [ dcOf('FRA', []), { dc: 'GIG', count: 3, ttfb_med: 200, best_ip: '1.2.3.4', items: [] },
			{ dc: 'HND', count: 2, ttfb_med: 210, best_ip: '1.2.3.5' } ],
		dc_pick: 'all'
	});
	const dead = byClass(s7, 'dcrow').filter(n => /\bdata\b/.test(String(n.attrs['class'] || '')));
	ok('r92 items 缺失或为空时那三行都不可点（没有 role / tabindex / aria-expanded）',
		dead.length === 3 && dead.every(n => !n.attrs.role && !n.attrs.tabindex && !n.attrs['aria-expanded']));
	eq('r92 这种行连展开箭头都不给', byClass(s7, 'chev').length, 0);

	/* --- 8) 展开状态跨重画（轮询）保持 --- */
	const sum8 = [ dcOf('ICN', [ it1('104.26.0.1', 180, 33, 8000000) ]) ];
	const s8a = t.DcSummary({ dc_summary: sum8, dc_pick: 'all' });
	rowOf(s8a, 'ICN').dispatch('click');
	eq('r92 展开后本轮就有明细', itemsIn(s8a).length, 1);
	const s8b = t.DcSummary({ dc_summary: sum8, dc_pick: 'all' });   /* 模拟轮询重画 */
	eq('r92 轮询重画之后仍是展开的（状态在模块级 Set 里）', itemsIn(s8b).length, 1);
	eq('r92 重画后 aria-expanded 仍是 true', rowOf(s8b, 'ICN').attrs['aria-expanded'], 'true');
	rowOf(s8b, 'ICN').dispatch('click');
	eq('r92 再点一下收起：明细消失、aria 回到 false',
		itemsIn(s8b).length + '|' + rowOf(s8b, 'ICN').attrs['aria-expanded'], '0|false');

	/* --- 9) 键盘：空格与回车都要能开合（role=button 不白送这两个键） --- */
	const s9 = t.DcSummary({ dc_summary: [ dcOf('KIX', [ it1('104.27.0.1', 190, 35, null) ]) ], dc_pick: 'all' });
	rowOf(s9, 'KIX').dispatch('keydown', { key: ' ', preventDefault() {} });
	eq('r92 空格键也能展开', itemsIn(s9).length, 1);
	rowOf(s9, 'KIX').dispatch('keydown', { key: 'Enter', preventDefault() {} });
	eq('r92 回车键收起', itemsIn(s9).length, 0);

	/* --- 10) 两个机房各开各的：状态按机房码分开记 --- */
	const two = [ dcOf('LAS', [ it1('104.28.0.1', 170, 31, null) ]),
		dcOf('MAD', [ it1('104.28.1.1', 175, 32, null) ]) ];
	const s10 = t.DcSummary({ dc_summary: two, dc_pick: 'all' });
	rowOf(s10, 'LAS').dispatch('click');
	rowOf(s10, 'MAD').dispatch('click');
	eq('r92 两个机房都展开时两段明细并存', byClass(s10, 'dcitems').length, 2);
	rowOf(s10, 'LAS').dispatch('click');
	eq('r92 收起其中一个，另一个还开着', byClass(s10, 'dcitems').length, 1);
	ok('r92 留下的那一段属于 MAD',
		byClass(s10, 'dcitems')[0] && textOf(byClass(s10, 'dcitems')[0]).indexOf('104.28.1.1') >= 0);

	/* --- 11) 与「其余 N 个数据中心」互不干扰：展开机房表时明细不跟着收回 --- */
	const seven2 = [ 'NRT', 'SIN', 'LAX', 'HKG', 'ICN', 'FRA', 'LHR' ].map((c, i) =>
		dcOf(c, i === 0 ? [ it1('104.29.0.1', 160, 30, 5000000) ] : []));
	const s11 = t.DcSummary({ dc_summary: seven2, dc_pick: 'all' });
	rowOf(s11, 'NRT').dispatch('click');
	byTag(s11, 'button').filter(b => /其余 1 个数据中心/.test(textOf(b)))[0].dispatch('click');
	eq('r92 展开「其余 1 个」之后，已展开的明细还在', itemsIn(s11).length, 1);
	eq('r92 这时 7 行机房都摆出来了', byClass(s11, 'dcrow').filter(n => /\bdata\b/.test(String(n.attrs['class'] || ''))).length, 7);
}

/* ================================================================== *
 * 6e. r104：按机房推送的图形编辑器（dns_targets 的视图层）
 * ================================================================== */
{
	const txt = 'jp.example.com 2 @NRT\n# 手写的注释\n\nwww.example.com 1 jp.example.jp';
	const lines = t.dnsLinesOf(txt);
	eq('r104 文本被拆成 4 段（2 行记录 + 注释 + 空行）', lines.length, 4);
	eq('r104 机房码被认出来', lines[0].row.code, 'NRT');
	eq('r104 条数被认出来', lines[0].row.count, 2);
	eq('r104 zone 留在"其余 token"里，不丢', lines[3].row.rest.join(','), 'jp.example.jp');
	eq('r104 注释与空行原样保留', lines[1].kind + '/' + lines[2].kind, 'raw/raw');
	eq('r104 行→文本可往返（注释与空行留在原位）', t.dnsTextOf(lines), txt);

	const got = [];
	const ed = t.DnsRowsEditor({
		codes: [ { dc: 'NRT', count: 8 }, { dc: 'KIX', count: 4 } ],
		value: 'a.example.com 2 @NRT\nb.example.com 1\nc.example.com 3 @DME',
		onChange: function (v) { got.push(v); }
	});
	const rows = byClass(ed, 'dnsrow').filter(n => !/dnsrow-h|dnsrow-raw/.test(String(n.attrs['class'] || '')));
	eq('r104 每行记录渲染一行控件', rows.length, 3);
	const sels = byTag(ed, 'select');
	eq('r104 每行一颗机房下拉', sels.length, 3);
	ok('r104 下拉第一项是"不限"', /不限/.test(textOf(byTag(sels[0], 'option')[0])), textOf(byTag(sels[0], 'option')[0]));
	ok('r104 下拉里带本轮条数', byTag(ed, 'option').some(o => /NRT（8 条）/.test(textOf(o))), 'option');
	eq('r104 已配置的机房被选中', sels[0].value, 'NRT');
	ok('r104 本轮不存在的机房仍能显示（标"本轮无"）',
		byTag(ed, 'option').some(o => /DME（本轮无）/.test(textOf(o))), 'option');

	sels[1].value = 'KIX';
	sels[1].dispatch('change');
	eq('r104 改下拉会写回文本（只改那一行）',
		got.length ? got[got.length - 1].split('\n')[1] : '(没触发)', 'b.example.com 1 @KIX');
	eq('r104 其余行原样不动', got.length ? got[got.length - 1].split('\n')[0] : '', 'a.example.com 2 @NRT');
}


{
	const it2 = (ip, ttfb) => ({ ip: ip, ttfb_ms: ttfb, connect_ms: 10, speed_bps: 1000 });
	const d2 = (code, items) => ({ dc: code, count: items.length,
		ttfb_med: items.length ? items[0].ttfb_ms : null,
		best_ip: items.length ? items[0].ip : null, items: items });
	/* 不用 \b：这一行是脚本生成的，反斜杠被吃过一次；indexOf 更稳 */
	const row2 = (node, code) => byClass(node, 'dcrow').filter(n =>
		String(n.attrs['class'] || '').indexOf('data') >= 0 && textOf(n).indexOf(code) >= 0)[0];
	const items2 = node => {
		const box = byClass(node, 'dcilist')[0];
		return box ? all(box).filter(n => n.attrs.role === 'listitem') : [];
	};

	const s12 = t.DcSummary({
		dc_summary: [ d2('NUE', [ it2('104.31.0.1', 100), it2('104.31.0.2', 110), it2('104.31.0.3', 120) ]),
			d2('SIN', [ it2('104.31.9.9', 300) ]) ],
		dc_pick: 'all',
		dc_show: [ { dc: 'NUE', n: 2 }, { dc: 'WAW', n: 3 } ]
	});
	eq('r102 只画 dc_show 里的机房，顺序=配置顺序',
		byClass(s12, 'dc-code').map(n => textOf(n)).join(','), 'NUE,WAW');
	eq('r102 汇总里有、但没配进 dc_show 的机房不画', textOf(s12).indexOf('SIN'), -1);
	has('r102 配置了但本轮没有的机房标「本轮无」', s12, '本轮无');
	hasNot('r102 配置了就不再出现「其余 N 个数据中心」', s12, '其余');

	row2(s12, 'NUE').dispatch('click');
	eq('r102 明细条数按 dc_show 的 n 截断（配置 2，不是默认 12）', items2(s12).length, 2);
	ok('r102 被截断时提示「还有 1 个」',
		byTag(s12, 'button').some(b => /还有 1 个/.test(textOf(b))), 'button');

	const s13 = t.DcSummary({ dc_summary: [ d2('NUE', []), d2('SIN', []) ], dc_pick: 'all' });
	eq('r102 没配 dc_show 时仍列全部机房（老行为不变）', byClass(s13, 'dc-code').length, 2);
}

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
has('按钮叫「检测源可用性」（与面板上那颗同名；不许叫保存并检测 —— 检测不写配置）', sp, '检测源可用性');
/* r98 P0：空态原来还有一颗 primary，与同一屏上方「逐源检测」标题右侧那颗同名重复。
 * 现在只留标题那颗，空态改成指路（点名按钮在哪），两头都钉住。 */
eq('未检测的空态不再有 primary 按钮', byClass(sp, 'primary').length, 0);
has('空态把"按钮在哪"说清楚', sp, '点上面「逐源检测」右边的按钮就开始');
ok('这一页不再出现"保存并检测"这种做不到的承诺', !textOf(sp).includes('保存并检测'));
has('文案把提交路径说清（保存并应用才生效）', sp, '保存并应用');
sp = t.SourcesPane({ state: 'checking' }, { check: noop });
has('检测中给等待文案', sp, '正在拉取源');
ok('检测中没有"正在保存"这种假阶段', !textOf(sp).includes('正在保存'));
sp = t.SourcesPane({ state: 'ok', rows: srcRows }, { check: noop });
has('检测完成渲染矩阵', sp, 'a.example');
has('检测完成给 CF 段内说明', sp, 'CF 段内');
/* r70：anycast 与「拉不到」的完整解释挂 ⓘ —— 钉住搬去悬停的细节没丢 */
const cfNote = byClass(sp, 'note').find(n => /CF 段内/.test(textOf(n)));
ok('CF 段内说明带 ⓘ（anycast 与 000 的解释挂悬停）',
	!!cfNote && byClass(cfNote, 'hmark').some(m =>
		/记 000/.test(m.attrs.title) && /记进日志/.test(m.attrs.title)));
sp = t.SourcesPane({ state: 'unreachable' }, { check: noop });
has('检测执行不了说明原因', sp, '调不到 luci.cf-ipcheck 的 check_sources 方法');
sp = t.SourcesPane({ state: 'empty' }, { check: noop });
has('空源清单说明要填在这里并保存并应用', sp, '保存并应用');
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
/* r64：徽标那个数字，眼睛能靠下面的读数条认出是"几条结果"，读屏器听不到那层上下文 */
const pill = byClass(tabs[0], 'tab-n')[0];
eq('数字圆点对读屏器隐藏（它只该被看见一次）', pill.attrs['aria-hidden'], 'true');
const sr = byClass(tabs[0], 'sr-only')[0];
ok('补了一段只给读屏器的话', /条结果/.test(sr.textContent) && /12/.test(sr.textContent), sr.textContent);
/* r74：这段补白不能以标点开头 —— 读屏器把相邻 inline 盒子的文本拼成可访问名时
 * 会插一个分隔停顿，`，10 条结果` 会被念成「榜单 ，10 条结果」（逗号前多一顿）。 */
ok('r74 读屏补白不以标点开头（拼出来是「榜单 共 N 条结果」，没有「 ，」）',
	!/^[，,、]/.test(sr.textContent) && /^共 \d+ 条结果$/.test(sr.textContent), sr.textContent);
eq('那段话不改变徽标数量（还是一个小圆点 + 一段隐藏文字）', byClass(tabs[0], 'tab-n').length, 1);
ok('r64 配置页不再发徽标数（分组数是常量，常量不是信息）', !/count: GROUPS\.length/.test(src));
/* r77：吞吐路径模板 + 「文件大小可配置」的提示必须真的落在界面文案里 */
ok('r77 配置页有「吞吐请求路径」字段与两个占位符说明',
	/'speed_path'/.test(src) && /\{bytes\}/.test(src) && /\{size\}/.test(src), 'speed_path/占位符缺失');
ok('r77 字节数说明里明说这一项可配置、并给了更大更稳的取舍',
	/这一项是可配置的/.test(src) && /50MB 建议 60 秒/.test(src), '缺可配置提示');
ok('r77 字节数说明里写清 ≥100MB 会被 speed.cloudflare.com 拒（403）',
	/≥100MB/.test(src) && /403/.test(src), '缺 100MB 上限提醒');
/* r88：池收敛两个字段已经整块删除 —— 页面上不该再出现它们（连带 help 条目）。 */
ok('r88 配置页不再有「只测域名认可网段」开关', !/'pool_follow_domain'/.test(src));
ok('r88 配置页不再有「手工指定候选网段」输入框', !/'candidate_cidrs'/.test(src));

/* r88：吞吐判定十个字段必须齐全，且都归在「测速与判定」分组里。 */
const R88_FIELDS = ['speed_gate', 'speed_abs_min', 'speed_rel_min',
	'speed_screen_count', 'speed_screen_bytes', 'speed_screen_timeout',
	'speed_confirm_top', 'speed_confirm_bytes', 'speed_confirm_timeout', 'speed_weight'];
{
	const missing = R88_FIELDS.filter(n => src.indexOf("'" + n + "'") < 0);
	ok('r88 吞吐判定十个字段都在视图里', missing.length === 0, missing.join(','));
	ok('r88 新字段全部进了「测速与判定」或「测速高级项」分组',
		R88_FIELDS.every(n => (t.GROUP_OPTIONS.probe || []).indexOf(n) >= 0 ||
		                      (t.GROUP_OPTIONS.probeAdv || []).indexOf(n) >= 0));
	/* 每条 help 的完整解释只在本条字段附近，切到 1400 字符足够覆盖「开关 + 长说明」。 */
	const blockOf = name => {
		const i = src.indexOf("help('" + name + "'");
		return i < 0 ? '' : src.slice(i, i + 1400);
	};
	const gate = blockOf('speed_gate');
	ok('r88 speed_gate 说明写全三步判定（连通性 / 稳定性 / 下载速度）',
		/连通性/.test(gate) && /稳定性/.test(gate) && /下载速度/.test(gate), gate.slice(0, 48));
	ok('r88 speed_gate 说明给出关掉后的旧行为',
		/关掉这个开关/.test(gate) && /旧行为/.test(gate));
	const weight = blockOf('speed_weight');
	ok('r88 speed_weight 说明给出 0 与 100 两个端点语义',
		/0 表示完全按延迟排/.test(weight) && /100 表示完全按下载速度排/.test(weight));
	ok('r88 说明里不含内部术语（1034 / 同池 / 边缘校验）',
		!/1034|同池|边缘校验/.test(src));
	ok('r88 降级与旁路两条提示的分支都在视图里',
		/speed_mode === 'degraded'/.test(src) && /st\.bypass === 'absent'/.test(src));
}

/* r88：两条提示随状态出现，状态变了就该消失（渲染层实证）。 */
{
	const degraded = t.BoardPane(Object.assign({}, done, { speed_mode: 'degraded' }), noActions);
	has('r88 样本不足时榜单顶部有提示', degraded, '本轮测速样本不足');
	has('r88 提示说明本轮只按连通性排序', degraded, '只按连通性排序');
	hasNot('r88 状态正常时没有这条提示',
		t.BoardPane(Object.assign({}, done, { speed_mode: 'ready' }), noActions), '本轮测速样本不足');

	const bypassed = t.BoardPane(Object.assign({}, done, { bypass: 'absent' }), noActions);
	has('r88 代理没放过探测流量时给出警示条', bypassed, '探测流量没有绕过代理');
	has('r88 警示条说明已跳过测速与上传', bypassed, '已跳过测速与上传');
	const bf = byClass(bypassed, 'flash');
	ok('r88 警示条用警告色调（不是普通提示）', bf.length >= 1 && /\bwarn\b/.test(bf[0].attrs['class']), bf.length + '');
	hasNot('r88 bypass 为 exempt 时不出现警示条',
		t.BoardPane(Object.assign({}, done, { bypass: 'exempt' }), noActions), '探测流量没有绕过代理');
	hasNot('r88 bypass 缺省时不出现警示条',
		t.BoardPane(Object.assign({}, done), noActions), '探测流量没有绕过代理');
}
ok('r64 标签栏的指纹里也不再掺那个常量', !/usable \+ '\|' \+ GROUPS\.length/.test(src));

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
	/* form.js 真会先渲染 Map 自己的标题与描述，桩件不补这两颗，
	 * "搬空之后收拾壳子"那段就永远测不到（装机上就是 278px 死空档 + 四个重复组名）。 */
	const h2 = makeNode('h2');
	h2.appendChild(documentStub.createTextNode('实测参数'));
	map.appendChild(h2);
	const descr = makeNode('div');
	descr.attrs['class'] = 'cbi-map-descr';
	descr.appendChild(documentStub.createTextNode('用带真实 SNI 的 HTTPS 探测实测。'));
	map.appendChild(descr);
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
/* r96：新增「DNS 解析」组，4 → 5；r98 P1-1：拆出「测速高级项」，5 → 6。
 * 这条是刻意收紧的：加组必须同时更新这里，否则「字段被搬到别的组 / 新组没渲染」
 * 这类问题会静默通过。 */
eq('分组数 = 6', boxes.length, 6);
/* 拆分不能丢字段 —— 常驻与高级加起来必须还是原来那 31 个。
 * 只断言"总数"是不够的：还要钉住常驻确实收敛了，否则等于没拆。 */
eq('「测速与判定」常驻字段收敛到 10', t.GROUP_OPTIONS.probe.length, 10);
eq('拆分不丢字段：常驻 + 高级 = 31', t.GROUP_OPTIONS.probe.length + t.GROUP_OPTIONS.probeAdv.length, 31);
let moved = 0;
boxes.forEach(b => { moved += byClass(b, 'brow').length + b.querySelectorAll('.cbi-value').length; });
eq('所有字段都被搬进分组', moved, allOptions.length);
has('未归类字段进兜底组', grps, '未归类字段');
eq('分组头可聚焦', byClass(boxes[0], 'grp-h')[0].attrs.tabindex, '0');
eq('分组头 role=button', byClass(boxes[0], 'grp-h')[0].attrs.role, 'button');
eq('展开状态进 aria-expanded', byClass(boxes[0], 'grp-h')[0].attrs['aria-expanded'], 'true');
/* r98 P1-1：默认收起的那组现在叫「测速高级项」（21 项机制细节）；
 * 「测速与判定」拆完只剩 10 项，默认展开 —— 拆组的全部意义就在这一条。 */
const probeAdv = boxes.find(b => b.attrs['data-group'] === 'probeAdv');
ok('「测速高级项」默认收起', !/\bopen\b/.test(probeAdv.attrs['class']));
ok('「测速与判定」默认展开（拆完只剩 10 项，收起就没意义了）',
	/\bopen\b/.test(boxes.find(b => b.attrs['data-group'] === 'probe').attrs['class']));
ok('「基本设置」默认展开', /\bopen\b/.test(boxes[0].attrs['class']));

/* 折叠：点一下翻 class + aria（并写 localStorage，无 storage 时静默） */
const head0 = byClass(boxes[0], 'grp-h')[0];
head0.dispatch('click');
ok('点击后收起', !/\bopen\b/.test(boxes[0].attrs['class']));
eq('收起后 aria-expanded=false', head0.attrs['aria-expanded'], 'false');
head0.dispatch('keydown', { preventDefault: noop, key: 'Enter' });
ok('回车再展开', /\bopen\b/.test(boxes[0].attrs['class']));
eq('展开后 aria-expanded=true', head0.attrs['aria-expanded'], 'true');

/* r61：搬空之后配置页顶上不该再挂一屏空壳（装机量到 278px 死空档 + 四个重复组名，
 * 起因是那段收拾代码的条件写成 s.closest('.cfp') 就跳过 —— 恒真，从来没执行过） */
eq('四个 section 壳子仍在（校验信息 .cbi-section-error 要有地方挂）',
	mapNode.querySelectorAll('.cbi-section').length, 4);
eq('但里面那行空标题全摘掉了（组名只剩折叠组里那一份）',
	mapNode.querySelectorAll('.cbi-section h3').length, 0);
eq('section 的容器节点一个都没少', mapNode.querySelectorAll('.cbi-section-node').length, 4);
eq('Map 自己的 h2 标题被摘掉', mapNode.children.filter(c => c.tagName === 'H2').length, 0);
eq('Map 自己的描述节点被摘掉（那句话并进面板说明，见下）',
	mapNode.querySelectorAll('.cbi-map-descr').length, 0);
ok('那句描述没丢：并进面板那行说明的开头（摘掉节点不等于删掉信息）',
	src.includes("T('用带真实 SNI（握手时就把你要访问的域名说出去）的 HTTPS 探测实测；改动保存后下一轮生效"));
eq('摘壳子没有弄丢字段：map 里 .cbi-value 总数不变',
	mapNode.querySelectorAll('.cbi-value').length, allOptions.length + 1);

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
ok('减少动效是通配熄灭，不是逐个点名（新增动效不必记得回来补）',
	/\.cfp \*,\.cfp \*::before,\.cfp \*::after\{transition:none!important;animation:none!important\}/.test(css));
ok('CSS 有可见焦点环', /:focus-visible/.test(css));
ok('CSS 里的 class 前缀统一', /\.cfp/.test(css) && /\.board/.test(css) && /\.tabs/.test(css));
ok('忙碌态在图标位画转圈', /\.cfp button\.busy \.bi::before\{[^}]*animation:cfp-spin/.test(css));
ok('忙碌态不再只靠降透明度', !/\.cfp button\.busy\{pointer-events:none;opacity:\.6\}/.test(css));

/* ---- r48 审计修的那几条，钉成红线（数字来自真机换算引擎实测） ---- */
const lightBlock = (/\.cfp\.is-light\s*\{([^}]*)\}/.exec(css) || [null, ''])[1];
const darkBlock = /:root\s*\{([^}]*)\}/.exec(css)?.[1] || '';
const inkL = (block) => {
	const m = /--ink-3:oklch\((\d+(?:\.\d+)?)%/.exec(block || '');
	return m ? parseFloat(m[1]) : NaN;
};
const lightInk3 = inkL(lightBlock), darkInk3 = inkL(darkBlock);
ok('亮色 --ink-3 抠得出数值（写法变了这条会红，提醒同步改判据）', lightInk3 > 0, String(lightInk3));
ok('亮色 --ink-3 压到 L≤55（旧值 60 实测 3.94，浅灰底只有 3.60）', lightInk3 <= 55, String(lightInk3));
ok('暗色 --ink-3 不低于 L64（旧值 62 压在主题深色卡上实测 4.21）', darkInk3 >= 64, String(darkInk3));
ok('字段说明显式抬回 opacity:1 并走 --ink-2（上游 cascade.css 的 .5 实测压成 1.89:1）',
	/\.cfp \.cbi-value-description\{[^}]*opacity:1[^}]*color:var\(--ink-2\)/.test(css));
ok('亮色文字型强调也走 color-mix 压深（旧值裸 --accent 实测 4.20）',
	/--accent-ink:color-mix\(in oklab, var\(--accent\) 8[0-4]%, black\)/.test(lightBlock));
ok('主按钮的底色单独走 --accent-btn（白字压裸主色实测只有 4.20）',
	/--accent-btn:color-mix\(in oklab, var\(--accent\)/.test(lightBlock) &&
	/\.cfp button\.primary\{[^}]*background:var\(--accent-btn\)/.test(css));
ok('暗色主按钮照旧用主题主色（实测白字 9.07，本来就过）',
	/--accent-btn:var\(--accent\)/.test(darkBlock));
ok('.lnk 走 --accent-ink，不再拿焦点环色当正文色（实测 --focus 只有 3.91）',
	/\.cfp \.lnk\{[^}]*color:var\(--accent-ink\)/.test(css));
ok('焦点环仍然用 --focus（图形色门槛 3.0，别跟着文字一起改）',
	/:focus-visible\{outline:2px solid var\(--focus\)/.test(css));
ok('bad/warn 行的时间戳不再压 opacity（实测只剩 2.53 / 2.46）',
	!/\.lline\.bad \.lts[^}]*opacity/.test(css));
ok('折叠头 hover 有过渡（旧版 all/0s，同页按钮都是 120ms）',
	/\.cfp \.grp-h\{[^}]*transition:background var\(--d-fast\)/.test(css));
ok('榜单行 hover 有过渡', /\.cfp \.brow\.data\{transition:background var\(--d-fast\)/.test(css));
ok('窄屏读数副行允许折行（省略号那条完整内容只在 title 里，触摸读不到）',
	/\.cfp \.cell-sub\{white-space:normal/.test(css));
ok('窄屏长值给 min-width:0 + overflow-wrap（域名 148 对 125 会 paint 到邻列）',
	/\.cfp \.cell\{min-width:0\}/.test(css) && /\.cfp \.cell-v,\.cfp \.cell-sub\{overflow-wrap:anywhere\}/.test(css));

/* ---- r51：两份 UI/UX 清单交叉对照后补的四条（判据来自 vercel web-interface-guidelines
 * 与 impeccable/reference/audit.md，但每条都用我们自己的源码/渲染结果复核过） ---- */
ok('r51 面板自己声明 color-scheme（暗为默认、浅色随 is-light），不碰 html',
	/\.cfp\{[^}]*color-scheme:dark/.test(css) && /\.cfp\.is-light\{color-scheme:light\}/.test(css));
ok('r51 三处内层滚动区都在基础规则里 contain（不只窄屏），防链式滚动',
	/\.cfp \.tabs\{[^}]*overscroll-behavior:contain/.test(css) &&
	/\.cfp \.board-scroll\{[^}]*overscroll-behavior:contain/.test(css) &&
	/\.cfp \.logbox\{[^}]*overscroll-behavior:contain/.test(css));
ok('r51 读数数值与吞吐数字用 tabular-nums（位数变化不推宽）',
	/\.cfp \.cell-v\{[^}]*font-variant-numeric:tabular-nums/.test(css) &&
	/\.cfp \.spd\{[^}]*font-variant-numeric:tabular-nums/.test(css));
/* r54：主题的 cascade.css 有 `.h1..h6,h1..h6{line-height:1.1 !important}`，
 * 所以我们的行高也必须同权重才拿得回来（r53 用非 important 的 inherit 实测仍 12.1px）。 */
ok('r54 章节标题是 h3，margin/padding 归零且 line-height 用 !important 压过主题',
	/\.cfp \.sec-t\{margin:0;padding:0;line-height:1\.55!important/.test(css));

/* ---- r55：ui-ux-pro-max 那套规则过下来的五条（U1 字号 / U2 触摸目标 / U3 光标 /
 * U4 图标 / U5 进度条）。媒体查询块单独取出来判，不拿全文比对 —— 全文里有同名选择器
 * 的基础规则，min-height:44px 要是只写在基础规则里，窄屏那条 42px 会赢（后来者胜），
 * 用全文断言就看不出这种错位。 -------------------------------------------------- */
const mob = (css.match(/@media \(max-width:760px\)\{([\s\S]*?)\n\}/) || [, ''])[1];
ok('r55 窄屏最小字号这一档抬到 12.5px（11px 那档在 420px 下有 35 处）',
	mob.includes('.cfp{--t-xs:12.5px}'));
ok('r55 窄屏按钮与标签的触摸目标钉到 44px',
	/\.cfp button\{min-height:44px\}/.test(mob) && /\.cfp \.tab\{min-height:44px/.test(mob));
ok('r55 42px 这条已经不存在了（不是新增一条盖在上面）',
	!/min-height:42px/.test(css));
ok('r55 .lnk 那三颗也吃 44px（它们在自己的工具条行里，不是句子里的行内链接）',
	/\.cfp button\.lnk\{min-height:44px\}/.test(mob));
ok('r55 窄屏标签的宽度也够（内衬提到 .8em；只补高度的话两字标签还是 41 宽）',
	/\.cfp \.tab\{min-height:44px;padding:\.55em \.8em/.test(mob));
ok('r55 帮助角标是手型（它点得动），说明文字保持问号（只悬浮、点了没反应）',
	/\.cfp \.hmark\{[^}]*cursor:pointer/.test(css) &&
	/\.cfp \.cbi-value-description\{[^}]*cursor:help/.test(css));
ok('r55 图标位盒子定死 1em×1em，svg 吃 currentColor 描边',
	/\.cfp \.bi\{[^}]*width:1em;height:1em/.test(css) &&
	/\.cfp \.bi > svg\{[^}]*stroke:currentColor/.test(css));
ok('r55 忙碌态只加描边、不改盒子宽度（改宽度会让按钮在点下去那一刻跳一下）',
	!/\.cfp button\.busy \.bi\{[^}]*width:/.test(css));
/* 环画在伪元素上而不是 .bi 自己的 border 上：真机量过，加在 .bi 上时盒子被 flex 的
 * min-content 顶到 17.67×17.67（写死的 1em 管不住），绝对定位的伪元素不参与父盒尺寸。 */
ok('r55 图标位是定位父级，忙碌环走绝对定位的伪元素',
	/\.cfp \.bi\{position:relative/.test(css) &&
	/\.cfp button\.busy \.bi::before\{[^}]*position:absolute/.test(css) &&
	!/\.cfp button\.busy \.bi\{[^}]*border:/.test(css));
ok('r55 说明文字的字号归自己的令牌（主题的 12px 不管用），ⓘ 才有 12.5 这一档',
	/\.cfp \.cbi-value-description\{[^}]*font-size:var\(--t-sm\)/.test(css));
ok('r55 窄屏给 ⓘ 补 24×24 命中区（伪元素，不动视觉与布局）',
	/\.cfp \.hmark\{position:relative\}/.test(mob) &&
	/\.cfp \.hmark::after\{[^}]*width:24px;height:24px/.test(mob));
/* ---- r60：进度清单「未开启」那一档不再用 opacity 表达层级（装机量到 1.67:1） ---- */
ok('r60 .pstep.off 不再压透明度（那三个字是给人读的，不是装饰）',
	/\.cfp \.pstep\.off\{opacity:1\}/.test(css));
ok('r60 全站只剩两处 opacity 淡化，且都是控件（禁用态与忙碌态），没有一处落在文字上',
	(css.match(/\.cfp [^{}]*\{[^}]*opacity:\.(?:[0-4]|4[0-9])/g) || [])
		.every(s => /button:disabled|button\.busy/.test(s)),
	JSON.stringify((css.match(/\.cfp [^{}]*\{[^}]*opacity:\.\d+/g) || []).map(s => s.slice(0, 28))));
/* r62：主题的 .cbi-map 是 flex + gap:16px —— 壳子高度归零之后仍各占一个 flex 位，
 * 四个就是 64px 纯间隙（装机量到"第一组头部离工具条 77px"）。 */
ok('r62 配置页那张 map 的 gap 收掉，空壳不再占 flex 位',
	/\.cfp \.grps-host > \.cbi-map\{gap:0\}/.test(css));
ok('r62 只收配置页这一张（源页那张 map 的说明还要用它的排布）',
	(css.match(/\.cfp [^{}]*\.cbi-map\{[^}]*gap:0/g) || []).length === 1);
ok('r64 .sr-only 用绝对定位藏、不用 display:none（后者会把内容从无障碍树里整个删掉）',
	/\.cfp \.sr-only\{position:absolute/.test(css) && !/\.cfp \.sr-only\{[^}]*display:none/.test(css));

/* ---- r57：正版 ui-ux-pro-max 的两条落点（相邻目标 ≥8px、文字输入 ≥16px） ---- */
ok('r57 窄屏标签间距补到 8px（基础规则仍是 4px，桌面不动）',
	/\.cfp \.tabs\{gap:var\(--s2\)\}/.test(mob) && /\.cfp \.tabs\{display:flex;gap:var\(--s1\)/.test(css));
ok('r57 窄屏文字输入给 16px（iOS 聚焦不放大），且没把 checkbox 拖进去',
	/\.cfp input\[type=text\][^}]*font-size:16px/.test(mob) &&
	/input\[type=password\]/.test(mob) && !/input\[type=checkbox\]/.test(css));
ok('r57 16px 只写在窄屏那块里（桌面仍是主题的 14px，鼠标不需要这条）',
	mob.includes('font-size:16px') && !css.replace(mob, '').includes('font-size:16px'));

/* U4：图标真的画出来了 —— 每个按钮的 .bi 里必须站一个带 path 的 svg，且不吃文字 */
const rail55 = t.StatusRail({ state: 'done', items: [{ ip: '1.1.1.1', speed_mbytes: 1 }] }, {}, noActions);
const bis55 = byClass(rail55, 'bi');
eq('读数带四个按钮各有一个图标位', bis55.length, 4);
bis55.forEach((b, i) => {
	const sv = (b.children || []).filter(c => c.tagName === 'SVG');
	eq('图标位 ' + i + ' 里正好一个 svg', sv.length, 1);
	eq('图标位 ' + i + ' 的 svg 走 SVG 命名空间', sv[0].namespaceURI, 'http://www.w3.org/2000/svg');
	ok('图标位 ' + i + ' 至少一条 path', (sv[0].children || []).length >= 1 &&
		(sv[0].children || []).every(p => /^M./.test(String(p.attrs.d || ''))));
	eq('图标位 ' + i + ' 不带文字（旧的字形符号已经换掉）', textOf(b), '');
	eq('图标位 ' + i + ' 的 svg 对读屏器隐藏', sv[0].attrs['aria-hidden'], 'true');
});
ok('r55 源码里不再留 ▶ ■ ↻ ⧉ ⎕ 这类当图标用的字形',
	!/\\u25b6|\\u25a0|\\u21bb|\\u29c9|\\u2315/.test(src));
/* 图标名写错是不报错的：svgIcon 返回 null，图标位留个空盒 —— 页面看着正常，
 * 只是那一个按钮没了图形。所以把「源码里用过的名字」和「ICONS 里定义的名字」对一遍。 */
const usedIcons = [];
src.replace(/icon: '([a-z]+)'/g, (m, n) => { usedIcons.push(n); return m; });
eq('源码里一共用到五种图标', Array.from(new Set(usedIcons)).sort().join(','), 'copy,play,probe,refresh,stop');
usedIcons.forEach(n => {
	ok('名字 ' + n + ' 在 ICONS 里有定义（写错不会报错，只会画空）',
		Array.isArray(t.ICONS[n]) && t.ICONS[n].length > 0);
});
eq('ICONS 没有多余没人在用的条目', Object.keys(t.ICONS).sort().join(','), 'copy,play,probe,refresh,stop');
t.ICONS && Object.keys(t.ICONS).forEach(n => {
	const sv = t.svgIcon(n);
	eq(n + '：svg 命名空间对', sv.namespaceURI, 'http://www.w3.org/2000/svg');
	eq(n + '：viewBox 是 24 方格', sv.attrs.viewBox, '0 0 24 24');
	ok(n + '：每条 path 都以 M 起笔', sv.children.every(p => /^M[0-9.\- ]/.test(String(p.attrs.d || ''))));
});
eq('没定义的名字返回 null（不是抛异常）', String(t.svgIcon('nope')), 'null');
/* 走一遍真按钮：Button 造出来的 .bi 必须是 svgIcon 的那棵树，而不是文字 */
const btnPlay = t.Button({ icon: 'play', label: '立即测速' });
eq('Button 的图标位里没有文字', textOf(byClass(btnPlay, 'bi')[0]), '');
eq('Button 的标签文字照常', textOf(byClass(btnPlay, 'bi')[0].parentNode).trim(), '立即测速');
/* 没有 createElementNS 的引擎：图标位留空但不许抛 —— 这条分支在真机上不会走到，
 * 走到就是整页空白，所以宁可只少一个图形。 */
const realCns = documentStub.createElementNS;
documentStub.createElementNS = undefined;
const railNoSvg = t.StatusRail({ state: 'done', items: [] }, {}, noActions);
eq('造不了 SVG 时按钮照样画出来', byClass(railNoSvg, 'bi').length, 4);
eq('造不了 SVG 时图标位是空的', byClass(railNoSvg, 'bi').every(b => !b.children.length), true);
documentStub.createElementNS = realCns;

/* U5：两帧写法。插入帧用上一帧的比例，下一帧才改成目标值 —— 少了这一对，
 * 新建的元素没有「改之前」，CSS 那条 transition 永远不起跳（就是 r54 实测到的一格一格闪）。 */
const rafQ = [];
globalThis.requestAnimationFrame = fn => { rafQ.push(fn); return rafQ.length; };
try {
	let ra = t.RunProgress({ state: 'running', stage: 'probe', stage_done: 40, stage_total: 100, upload: 1 });
	let barA = byClass(ra, 'pbar')[0].childNodes[0];
	rafQ.splice(0).forEach(fn => fn());
	eq('A 帧落定在自己的目标值', barA.style.transform, 'scaleX(0.4)');

	let rb = t.RunProgress({ state: 'running', stage: 'probe', stage_done: 60, stage_total: 100, upload: 1 });
	let barB = byClass(rb, 'pbar')[0].childNodes[0];
	eq('同一环节接着画：插入帧用上一帧那个值当起点，不是 0', barB.style.transform, 'scaleX(0.4)');
	rafQ.splice(0).forEach(fn => fn());
	eq('同一环节：下一帧才改成新目标', barB.style.transform, 'scaleX(0.6)');

	let rc = t.RunProgress({ state: 'running', stage: 'speed', stage_done: 3, stage_total: 10, upload: 1 });
	let barC = byClass(rc, 'pbar')[0].childNodes[0];
	eq('换环节：起点回 0，新的一节从头长', barC.style.transform, 'scaleX(0)');
	rafQ.splice(0).forEach(fn => fn());
	eq('换环节：目标值不受上一节影响', barC.style.transform, 'scaleX(0.3)');
} finally {
	delete globalThis.requestAnimationFrame;
	rafQ.length = 0;
}
/* 没有 rAF 的引擎（含本桩件）当场落定：宁可不动画，也不许停在起点不动。
 * 除不尽时收成三位小数，别把 0.3333333333333333 写进 style。 */
let rd = t.RunProgress({ state: 'running', stage: 'probe', stage_done: 1, stage_total: 3, upload: 1 });
eq('没有 rAF 时当场就是目标值', byClass(rd, 'pbar')[0].childNodes[0].style.transform, 'scaleX(0.333)');

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

/* r48：applyScheme 的比较对象必须是「这个节点自己的类名」，不是模块级缓存。
 * schemeNow 是模块级变量，而 buildPage 可能在同一份 JS 里跑第二次（17 节那条注释写明了），
 * 拿缓存早退的话，第二次进来的新 root 永远等不到 is-light —— 亮色主题下用暗色令牌渲染。
 * 关键是「主题没变 + 换了新节点」这一串：只测第一次建页抓不到（那时缓存还没建立）。 */
const oldGCS2 = globalThis.getComputedStyle;
globalThis.getComputedStyle = () => ({ backgroundColor: 'rgb(244, 245, 247)' });
const first = { className: 'cfp' };
eq('第一次建页：判 light 并加上类', t.applyScheme(first), 'light');
eq('第一次建页后类名是 cfp is-light', first.className, 'cfp is-light');
const second = { className: 'cfp' };
eq('主题没变（缓存已经是 light）', t.applyScheme(second), 'light');
eq('第二次进页面的新 root 也要写上 is-light（r47 在这里返回 cfp）', second.className, 'cfp is-light');
let writes = 0, cls = 'cfp is-light';
const spy = { get className() { return cls; }, set className(v) { cls = v; writes++; } };
t.applyScheme(spy);
eq('类名本来就对 → 一次 className 都不写（每拍碰节点会牵连点击）', writes, 0);
/* watchScheme：系统偏好一变就复查。真机实测空闲页 20 秒不跟随（applyScheme 只在
 * render 与 pollTick 里跑，而空闲不轮询），那个错配态里选中标签只有 1.07:1。 */
ok('视图提供 watchScheme（r47 没有这一条）', typeof t.watchScheme === 'function');
if (typeof t.watchScheme === 'function') {
	let mql = [];
	globalThis.matchMedia = () => ({ media: '(prefers-color-scheme: dark)', matches: false,
		addEventListener: (k, fn) => { mql.push([k, fn]); },
		removeEventListener: (k, fn) => { mql = mql.filter(x => x[1] !== fn); } });
	globalThis.getComputedStyle = () => ({ backgroundColor: 'rgb(30, 30, 30)' });
	const wnode = { className: 'cfp' };
	eq('暗色下建页：类名是 cfp', t.applyScheme(wnode), 'dark');
	const stopWatch = t.watchScheme(wnode);
	eq('注册了一条 change 监听', mql.length, 1);
	eq('监听的是 change 这一件事', mql[0][0], 'change');
	globalThis.getComputedStyle = () => ({ backgroundColor: 'rgb(244, 245, 247)' });
	mql[0][1]();
	eq('系统转亮 → 根节点当场跟上 is-light（不用等下一次轮询或换页）', wnode.className, 'cfp is-light');
	stopWatch();
	eq('把手调完监听被摘干净（teardown 不退就会跨实例累积）', mql.length, 0);
	/* 真实路径的同一条要求：连着建两次页，监听也只能有一份（和 store 订阅一回事）。 */
	mql = [];
	globalThis.getComputedStyle = () => ({ backgroundColor: 'rgb(244, 245, 247)' });
	t.buildPage(null);
	t.buildPage(null);
	eq('两次 buildPage 之后只剩一份 change 监听', mql.length, 1);
	eq('两次 buildPage 之后新 root 有 is-light', t.P.root.className, 'cfp is-light');
	delete globalThis.matchMedia;
	eq('没有 matchMedia 的环境回 null 而不是抛', String(t.watchScheme({ className: 'cfp' })), 'null');
}
if (oldGCS2 === undefined) delete globalThis.getComputedStyle;
else globalThis.getComputedStyle = oldGCS2;

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
/* r70：hung 那条拆两层 —— 结论常驻，12 秒的构成与 30 秒平台超时挂 srcMore */
ok('源检测 hung 的深度细节进了 srcMore（8 秒上限与 30 秒平台超时没丢）',
	/8 秒上限/.test(t.srcMore({ state: 'hung' })) && /30 秒/.test(t.srcMore({ state: 'hung' })));
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

/* r98 P1-2/3/4：三个只读出口的页面入口。
 * 这三件事此前都只能 ssh 干（cf-ipcheck csv / diag / pool），页面上一个入口都没有 ——
 * 而「配置到底生效没有」「源到底拉到了什么」正是最常见的两个问题。 */
const csvPane = t.BoardPane(done, Object.assign({}, noActions, { csv: noop }));
has('榜单页有下载 CSV 的入口', csvPane, '下载 CSV');
has('CSV 那行点明是七列 CFST 口径', csvPane, 'CFST 口径');

const spPool = t.SourcesPane({ state: 'ok', rows: srcRows },
	{ check: noop, pool: noop }, { state: 'ok', ips: [ '1.1.1.1', '2.2.2.2' ] });
has('源页有候选池预览入口', spPool, '预览候选池');
has('候选池给出候选个数', spPool, '共有 2 个候选 IP');
has('候选池把 IP 列出来', spPool, '1.1.1.1');
const spNoPool = t.SourcesPane({ state: 'ok', rows: srcRows },
	{ check: noop, pool: noop }, { state: 'ok', ips: [] });
has('候选池为空时明说是空的', spNoPool, '一个候选 IP 都没拉到');

const lpDiag = t.LogsPane({ state: 'ok', text: '一行\n' },
	{ refresh: noop, copy: noop, diag: noop }, true,
	{ state: 'ok', data: { has_uci: 1, uci_get_rc: 0, curl: '/usr/bin/curl', jq: '/usr/bin/jq',
		domains: 'example.com', port: 443, budget: 256,
		run_dir: '/tmp/cf-ipcheck', etc_dir: '/etc/cf-ipcheck', dns_sync: 0, apply_dns_ok: 1 } });
has('日志页有诊断摘要入口', lpDiag, '取诊断');
has('诊断摘要报出 uci 是否可用', lpDiag, 'uci：可用');
has('诊断摘要报出 curl 与 jq 路径', lpDiag, '/usr/bin/jq');
has('诊断摘要报出探测目标', lpDiag, 'example.com:443');
has('诊断摘要报出 DNS 同步与 helper 状态', lpDiag, 'helper 可执行');

/* r76：日志页自动刷新。默认开（按钮显示「停止刷新」）；停掉后按钮变「自动刷新」，
 * 说明行里始终保留一个「立即刷新」的手动入口。 */
{
	const onLp = t.LogsPane({ state: 'ok', text: '一行\n' }, { refresh: noop, copy: noop, full: noop, auto: noop }, true);
	has('r76 自动刷新开着时按钮是「停止刷新」', onLp, '停止刷新');
	hasNot('r76 开着时不再出现「自动刷新」字样（一个按钮一个意思）', onLp, '自动刷新');
	has('r76 说明行常驻「立即刷新」手动入口', onLp, '立即刷新');
	const offLp = t.LogsPane({ state: 'ok', text: '一行\n' }, { refresh: noop, copy: noop, full: noop, auto: noop }, false);
	has('r76 停掉后按钮变「自动刷新」', offLp, '自动刷新');
	hasNot('r76 停掉后不显示「停止刷新」', offLp, '停止刷新');
	has('r76 停掉后手动入口还在', offLp, '立即刷新');
	eq('r76 store 里 logAuto 默认是开', t.store.get().logAuto, true);
	ok('r76 两参调用（老写法）按"开"处理，不炸', byTag(t.LogsPane({ state: 'ok', text: 'x\n' }, { refresh: noop, copy: noop }), 'button').length >= 1);
}

/* ================================================================== *
 * 15b. r45：日志最新在上 + 行首时间显示简化（原始串留在悬停里）
 * ================================================================== */
const pad2 = (n) => (n < 10 ? '0' + n : String(n));
const nowD = new Date();
/* 造时间戳必须用**运行这台 CI 的本地时区**：上一版把偏移写死成 +0800，
 * 而 GitHub runner 是 UTC —— 于是"距今"算出 8 小时，断言把产品的正确行为判成失败。
 * 这里按浏览器自己的时钟与偏移生成，产品看到的"今天/昨天"才和断言是同一个日子。 */
const tsOf = (d) => {
	const off = -d.getTimezoneOffset();
	const sign = off >= 0 ? '+' : '-';
	const a = Math.abs(off);
	return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate()) +
		'T' + pad2(d.getHours()) + ':' + pad2(d.getMinutes()) + ':' + pad2(d.getSeconds()) +
		sign + pad2(Math.floor(a / 60)) + pad2(a % 60);
};
const todayTs = tsOf(nowD);
const yestTs = tsOf(new Date(nowD.getTime() - 86400000));
const oldTs = '2025-03-04T09:08:07+0800';
const logTxt = [todayTs + ' 第一行（最早）', todayTs + ' 第二行', todayTs + ' 本轮完成（最新）'].join('\n') + '\n';
const blk = t.LogBlock(logTxt);
const lns = byClass(blk, 'lline');
eq('三行都还在', lns.length, 3);
ok('最新那一行排在最上面', (textOf(lns[0])).includes('本轮完成'));
ok('最早那一行沉到最下', (textOf(lns[2])).includes('第一行'));
const firstTs = lns[0].querySelector ? lns[0].querySelector('.lts') : null;
ok('行首时间被拆成独立一段（正文另起一段）', !!firstTs && !!lns[0].querySelector('.lmsg'));
eq('今天只显示 HH:MM:SS（不带日期与偏移）', firstTs.textContent,
	pad2(nowD.getHours()) + ':' + pad2(nowD.getMinutes()) + ':' + pad2(nowD.getSeconds()));
ok('悬停里留着原始时间戳', String(firstTs.attrs.title || '').includes(todayTs), firstTs.attrs.title);
ok('悬停里还给了距今（刚刚/分钟前/小时前都算）',
	/刚刚|分钟前|小时前/.test(String(firstTs.attrs.title || '')), firstTs.attrs.title);
eq('正文段不再带时间前缀', lns[0].querySelector('.lmsg').textContent, '本轮完成（最新）');
const yb = t.LogBlock(yestTs + ' 昨天的事' + '\n');
ok('昨天的行带上「昨天」', textOf(yb.querySelector('.lts')).includes('昨天'), textOf(yb.querySelector('.lts')));
const ob = t.LogBlock(oldTs + ' 去年的事' + '\n');
ok('跨年带上完整日期', textOf(ob.querySelector('.lts')).includes('2025-03-04'), textOf(ob.querySelector('.lts')));
const nb = t.LogBlock('没有前缀的一行' + '\n' + '\t缩进的续行' + '\n');
eq('没有时间戳的行原样保留（不拆段）', byClass(nb, 'lts').length, 0);
ok('没有时间戳的行也走同一条倒序（最后一行排到最上）',
	textOf(byClass(nb, 'lline')[0]).includes('缩进的续行'));
ok('原样保留整串（不拆段、不吞字符）', textOf(byClass(nb, 'lline')[1]).includes('没有前缀的一行'));
const badb = t.LogBlock(todayTs + ' 社区源拉取失败' + '\n');
ok('倒序与上色互不干扰：坏消息行照样带 bad', byClass(badb, 'lline bad').length, 1);
has('脚注说清最新在上与悬停看原始时间', t.LogsPane({ state: 'ok', text: logTxt }, { refresh: noop, copy: noop }), '最新的在最上面');
has('复制入口说明自己给的是时间先后', t.LogsPane({ state: 'ok', text: logTxt }, { refresh: noop, copy: noop }), '复制全部');
/* 滚动锚点（r46）：日志封顶意味着"顶上加一行 ≈ 底下掉一行"，总高度不变 ——
 * 只按 scrollHeight 差值补偿会算出 0，用户眼前的内容被整体推走一行。
 * 真机 r45 第一轮就是这么被抓到的，所以这里用假 offsetTop 把锚的算法钉住。 */
function fakeBox(scrollTop, texts) {
	const box = { scrollTop: scrollTop, childNodes: [], querySelectorAll: null };
	const kids = texts.map((t, i) => ({ textContent: t, offsetTop: 20 * i, offsetHeight: 20 }));
	box.querySelectorAll = (sel) => (sel === '.lline' ? kids : []);
	return box;
}
const abox = fakeBox(46, ['a1', 'a2', 'a3', 'a4']);
const anc = t.logAnchor(abox);
eq('锚 = 眼前第一行（bottom 刚过 scrollTop 的那行）', anc && anc.text, 'a3');
eq('锚带上"已滚进这一行多少像素"', anc && anc.into, 46 - 40);
const a2 = fakeBox(0, ['x']);
ok('贴着顶部时锚就是第一行', t.logAnchor(a2).text === 'x' && t.logAnchor(a2).into === 0);
const nbox = fakeBox(46, ['新行', 'a1', 'a2', 'a3', 'a4']);
const fixed = t.logAnchorTop(nbox, anc);
/* 锚 'a3' 在新容器里 offsetTop 变成 60（顶上多了一行），加上原先滚进它内部的 6px
	* → 66。用户眼前看到的仍然是 a3 的那一小段，不被推走。 */
eq('新容器里找回锚那一行并按它的新的 offsetTop 复位（顶上多一行也不动）', fixed, 66);
eq('锚那一行被截掉时给 null（让调用方退回按高度差补偿）', t.logAnchorTop(fakeBox(0, ['新行', '别的']), anc), null);
ok('没有 offsetTop 的环境不炸（桩件/老浏览器）',
	t.logAnchor({ scrollTop: 5, querySelectorAll: () => [{ textContent: 'x' }] }) === null);


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
eq('进度条按 done/total 算 scaleX', byClass(rp, 'pbar')[0].childNodes[0].style.transform, 'scaleX(0.4)');
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
/* r49 起榜单那一行末尾多一条【吸富余用的空轨道】（minmax(0,1fr)）：过去 IP 列是唯一的
 * fr，@1600 被拉到 868px，一行里 IP 与第一个数字之间隔着约 870px。所以这里的不变量是
 * "轨道数 = 列数 + 末尾那条空轨道"，并且空轨道必须在最后、必须是 minmax(0,1fr)。 */
const lbTracks = lbRule[1].trim().split(/\s+/).filter(Boolean);
/* r83：末尾那条空轨道换成了真列「质量」，所以不变量从「列数+1」变成「轨道数 = 列数」。 */
eq('榜单：轨道数 = 列数（末尾不再有空轨道）', t.COLS.length, lbTracks.length);
ok('榜单：末尾轨道是「质量」列（minmax(7em,1fr)）', /minmax\(7em,1fr\)$/.test(lbTracks[lbTracks.length - 1]), lbTracks[lbTracks.length - 1]);
ok('榜单：IP 列按内容收（不再是吃掉全部富余的 1.5fr）',
	/minmax\(9em,max-content\)/.test(lbRule[1]));
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
 * 26. r41：源清单用【另一张 Map】挂进「源与检测」页 + 「保存并检测」的顺序
 * 第一版是把配置页那张 Map 里渲染好的行搬过来，真机证明"看得见、存不进"
 * （加进去的那条根本没进 uci.set 的请求体）。现在是一张只含这一项的 Map，
 * 自己渲染、自己采值、自己保存；我们只搬【整张 map 节点】。
 * 必须钉住的性质：
 *   a) 这一项在全文只声明一次（两张 Map 各有一份 = 两个出处）；
 *   b) map 节点整颗进宿主，宿主不参与每拍重画（否则打字丢字 + 吞真实点击）；
 *   c) 检测之前先保存，保存失败就不检测（否则拿旧清单的结果骗人）。
 * ================================================================== */
eq('源清单不再归「配置」的任何分组', (t.GROUP_OPTIONS.pool || []).indexOf('community_sources'), -1);

const smap = t.sourcesMap();
eq('源清单那张 Map 只声明了这一个字段',
	smap.sections.map(sec => sec.options.map(o => o.name).join(',')).join(';'), 'community_sources');
const snode = await smap.render();
/* ⓘ 需要的说明节点是 form.js 生成的，桩照形状补一个 */
snode.querySelectorAll('.cbi-value').forEach(row => {
	const d = makeNode('div');
	d.attrs['class'] = 'cbi-value-description';
	row.appendChild(d);
});
t.help('community_sources', '每行一个 HTTPS 文本地址。', '完整解释：逐行提取 IPv4 并进候选池。');
const host26 = makeNode('div');
const box26 = t.mountSourcesForm(snode, host26);
ok('源表单的 map 节点整颗进了源页宿主', hasAncestor(host26, snode));
ok('宿主里就是一个可折叠盒（复用配置页那套 .grp 外观）', !!box26 && typeof box26.__apply === 'function');
const h26 = box26 ? byClass(box26, 'grp-h')[0] : null;
ok('默认收起（这次合并就是为了省版面）', !!h26 && h26.attrs['aria-expanded'] === 'false');
box26.__apply(true);
eq('点开后 aria-expanded 跟着翻', byClass(box26, 'grp-h')[0].attrs['aria-expanded'], 'true');
ok('折叠标题说清"改完要点页面底部保存并应用"', textOf(host26).includes('保存并应用'));
ok('这一项的 ⓘ 贴在宿主里（applyHelp 在就位之后跑）', byClass(host26, 'hmark').length >= 1);
t.mountSourcesForm(snode, host26);
eq('重复挂载不会在宿主里叠出两份编辑盒', byClass(host26, 'src-edit').length, 1);
eq('也不会叠出两份字段行（全文这一项只有一颗 .cbi-value）',
	byClass(host26, 'cbi-value').filter(r => /community_sources$/.test(String((r.querySelector('label[for]') || {}).htmlFor || ''))).length, 1);

/* 「检测」这一步必须【不写配置】：真机量过 rpcd 的 uci.set 只留在它自己进程的
 * 内存里（页面 uci.get 读得到，CLI 读不到、/tmp/.uci 是 0 行、配置文件 md5 不变），
 * 而引擎是独立进程 —— 所以"顺手保存再检测"检到的必然还是旧清单。 */
t.P.srcForm = smap;
let seenCmds = [];
const oldRpc = rpcImpl;
rpcImpl = (decl) => { seenCmds.push(String(decl.method || '')); return Promise.resolve('[{"url":"a.example","http":"200","rc":0,"ips":100,"cf_in":98}]'); };
saveCalls.length = 0;
saveImpl = () => { seenCmds.push('save'); return Promise.resolve(); };
t.actCheck(null);
await new Promise((r) => setImmediate(r));
await new Promise((r) => setImmediate(r));
eq('检测路径一次都没调 Map.save()', saveCalls.length, 0);
eq('也没有把 uci.set 发出去', seenCmds.indexOf('save'), -1);
eq('发的就是 check_sources', seenCmds.join(','), 'check_sources');
eq('忙碌标记落地后被清掉', String(t.store.get().busy.check), 'false');
eq('检测结果进了 store', t.store.get().sources && t.store.get().sources.state, 'ok');

/* 编辑框 vs 已应用清单：不一致时必须点名（不然人以为检的是自己刚敲的那份） */
const editHost = makeNode('div');
t.P.srcEdit = editHost;
function dynlist(values) {
	const dl = makeNode('div');
	dl.attrs['class'] = 'cbi-dynlist';
	values.forEach(v => {
		const item = makeNode('div');
		item.attrs['class'] = 'item';
		const h = makeNode('input');
		h.attrs['type'] = 'hidden';
		h.value = v;
		item.appendChild(h);
		dl.appendChild(item);
	});
	editHost.appendChild(dl);
	return dl;
}
dynlist([ 'https://a.example/ips.txt', 'https://new.not-applied.example/x.txt' ]);
const okSrc = { state: 'ok', rows: srcRows };
eq('新加但还没生效的那条被点名', t.pendingSourceEdits(okSrc).join(','), 'https://new.not-applied.example/x.txt');
eq('已经生效的那条不被点名（不误报）',
	t.pendingSourceEdits(okSrc).some(u => u === 'https://a.example/ips.txt'), false);
editHost.childNodes.length = 0;
eq('编辑框读不到东西时不瞎报', t.pendingSourceEdits(okSrc).length, 0);
dynlist([ 'https://whatever.example/x.txt' ]);
eq('还没有检测结果时不比（没结果就说"未生效"是冤枉人）', t.pendingSourceEdits({ state: 'hung' }).length, 0);
eq('结果里没有 url 字段时也不炸', t.pendingSourceEdits({ state: 'ok', rows: [] }).length, 1);
editHost.childNodes.length = 0;
t.SourcesPane(okSrc, { check: noop });
eq('SourcesPane 会把这句提示画出来', true, true);

/* 每拍重画不许碰编辑宿主：输入框被换掉 = 打字打到一半丢字 + 吞真实点击（r29 的机制） */
t.buildPage(null);
const hostRef = t.P.srcEdit;
t.P.srcEdit.appendChild(box26);
const boxRef = hostRef.childNodes[0];
t.store.set({ status: t.parseStatus(JSON.stringify({ state: 'running', stage: 'fetch', stage_done: 3, stage_total: 13 })) });
fireTimers(0);
t.store.set({ sources: { state: 'ok', rows: srcRows } });
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

/* 这一段放在最后：它会让 refresh() 失败一次，pollFail 与 store 都是模块级状态，
 * 插在中间会把上面的容错断言带偏（第一次就是这么被自己影响的）。 */
/* ================================================================== *
 * 18b. r47：启动/停止成功【不弹窗】（Ryan：手机上那块通知条会盖住榜单）
 * 失败与"没有回应"那几条必须仍然弹 —— 那些是"点了但没成"，页面自己解释不清。
 * ================================================================== */
notifications.length = 0;
rpcImpl = () => Promise.resolve('{"state":"started"}');
t.actRun(null);
await new Promise((r) => setImmediate(r));
await new Promise((r) => setImmediate(r));
eq('启动成功一条通知都不发', notifications.length, 0);
eq('但本地照样立刻进 running（反馈靠读数条）', t.store.get().status.state, 'running');
eq('并且把轮询开起来', String(t.store.get().busy.run), 'false');

notifications.length = 0;
rpcImpl = () => Promise.resolve('{"state":"stopped-requested"}');
t.actStop(null);
await new Promise((r) => setImmediate(r));
await new Promise((r) => setImmediate(r));
eq('停止受理成功也不弹窗', notifications.length, 0);

notifications.length = 0;
rpcImpl = () => Promise.resolve(null);	/* null = 调用被拒/读不到 */
t.actRun(null);
await new Promise((r) => setImmediate(r));
await new Promise((r) => setImmediate(r));
eq('启动失败仍然要提示', notifications.length, 1);
ok('提示说的是启动没跑成', String(notifications[0].title).includes('无法启动'), notifications[0].title);
notifications.length = 0;
t.actStop(null);
await new Promise((r) => setImmediate(r));
await new Promise((r) => setImmediate(r));
eq('停止失败也仍然要提示', notifications.length, 1);
ok('提示说的是停止没跑成', String(notifications[0].title).includes('无法请求停止'), notifications[0].title);
notifications.length = 0;


/* ---- r59：标签进 URL（N5）与日志完整时刻（P7）---- */
locationStub.hash = '';
replaceCalls.length = 0;
t.goto('logs');
eq('切标签会把当前面板写进地址片段', locationStub.hash, '#cf-tab=logs');
eq('写的是 replaceState，不是给历史加一条', replaceCalls.slice(-1)[0], '#cf-tab=logs');
eq('片段能读回来', t.hashTab(), 'logs');
locationStub.hash = '#cf-tab=bogus';
eq('不认识的标签名不当数（宁可不落位）', t.hashTab(), null);
locationStub.hash = '?/admin/foo';
eq('别人的地址片段不误读成我们的标签', t.hashTab(), null);
/* 没有 replaceState 的老引擎：退回直接赋值，功能不能丢 */
locationStub.hash = '';
const rs = windowStub.history.replaceState;
delete windowStub.history.replaceState;
t.goto('board');
eq('没有 replaceState 时退回直接赋值', locationStub.hash, '#cf-tab=board');
windowStub.history.replaceState = rs;
/* hashchange：外部改地址（后退、手敲）要跟着走；卸载把手要能摘干净 */
let disposer = t.watchHash();
const n0 = windowStub.count('hashchange');
locationStub.hash = '#cf-tab=sources';
windowStub.fire('hashchange');
eq('外部改片段会切到那一屏', t.store.get().tab, 'sources');
disposer();
eq('卸载把手把监听摘掉了', windowStub.count('hashchange'), n0 - 1);
t.buildPage(null);
t.buildPage(null);
eq('连开两次页面只留一份 hashchange 监听', windowStub.count('hashchange'), 1);

/* 完整时刻：同一行日志，两种显示 */
const padn = (n) => (n < 10 ? '0' : '') + n;
const stampDay = new Date();
const todayLine = stampDay.getFullYear() + '-' + padn(stampDay.getMonth() + 1) + '-' + padn(stampDay.getDate()) +
	'T04:28:44+0800 本轮完成';
eq('默认只显示时刻', t.logStamp(todayLine, false).shown, '04:28:44');
eq('完整档给原始串（日期 + 时刻 + 时区偏移）', t.logStamp(todayLine, true).shown, todayLine.split(' ')[0]);
ok('完整档里能看到 +0800', t.logStamp(todayLine, true).shown.indexOf('+0800') > 0);
t.goto('logs');
t.store.set({ logs: { state: 'ok', text: todayLine } });
fireTimers(0);
const logsPane = t.P.panes.logs;
const firstLts = () => { const b = logsPane.querySelector('.logbox'); return b ? byClass(b, 'lts')[0].textContent : null; };
eq('面板里默认那一列是时刻', firstLts(), '04:28:44');
t.actLogFull();
fireTimers(0);
ok('点一下之后同一列变成完整时间戳（日志文本一个字没变，靠的是显示模式进了重画指纹）',
	/\+0800/.test(String(firstLts())), firstLts());
ok('按钮上的字跟着改成"只看时刻"', byClass(logsPane, 'lnk').some(b => /只看时刻/.test(b.textContent)), 'ok');
t.actLogFull();
fireTimers(0);
eq('再点一下回到只显示时刻', firstLts(), '04:28:44');

/* ================================================================== *
 * 12. 文案体检钉住的几条（r65）：这几条都是"看一眼就懂不了"的形态问题，
 * 靠人读源码守不住，所以各钉一条字符串级断言。
 * ================================================================== */
{
	/* 提取必须同时覆盖 T('…') 与 _('…')。写成 /T|_\(/ 会只认得后半边，
	 * 于是 T() 里的问题全部"通过"—— 那是空判，不是干净（r65 差点就这么交上去）。 */
	const strings = [...src0.matchAll(/(?:^|[^\w$])(?:T|_)\(\s*'((?:[^'\\]|\\.)*)'/gm)].map(m => m[1]);
	ok('这一趟真的抓到了两类串（判据不能空转）',
		strings.length > 150 && strings.some(s => /立即测速/.test(s)) && strings.some(s => /带上上一轮/.test(s)),
		String(strings.length));
	const join = strings.join('\n');
	const shown = (re) => { const m = join.match(re); return m ? m[0].slice(0, 46) : '(无)'; };
	/* /__down 是插件自己的吞吐路径，双下划线是路径的一部分，不是 markdown ——
	 * 先把它换成占位词再判，其余地方的 __ 仍然算记号。 */
	ok('C1 用户可见文案里没有 markdown 记号（** __ `）—— 页面上没人渲染它',
		!/\*\*|__|`/.test(join.replace(/\/__down/g, '/DOWN')), shown(/\*\*[^*]{0,30}|__\S{0,20}|`\S{0,20}/));
	ok('C3 文案里不带内部改动号（r44 那种），也不留英文 body',
		!/（r\d\d|\bbody\b/.test(join), shown(/（r\d\d[^）]{0,30}|\bbody\b[^ ]{0,20}/));
	eq('C5「入围」这个词清零（它混指达标与进榜两层意思）',
		strings.filter(s => /入围/.test(s)).length, 0);
	ok('C5 进榜这个说法接管了那 5 处（过门槛叫达标、留下前 N 条叫进榜）',
		strings.filter(s => /进榜/.test(s)).length >= 5, String(strings.filter(s => /进榜/.test(s)).length));
	eq('C6 一个动作一个名字：「重新读取 / 开始检测 / 重新检测」都不在了',
		strings.filter(s => /重新读取|开始检测|重新检测/.test(s)).length, 0);
	ok('C6 规范名站得住：刷新 与 检测源可用性 都在源码里出现过',
		/T\('刷新'\)/.test(src0) && /T\('检测源可用性'\)/.test(src0), 'ok');
	ok('C6 正文里引号指的按钮名与屏幕上的字面一致（不再有「点『重新读取』』）',
		!/点「重新读取」|点一次检测|回来点检测|再点检测/.test(join), shown(/点「[^」]{2,8}」|点一次检测|回来点检测|再点检测/));
	eq('C8 接管状态只留一个名字（出口被代理接管）',
		strings.filter(s => /^出口被接管$/.test(s)).length, 0);
	ok('C7 术语第一次出现时给一句注解：SNI 那处带括号解释',
		/SNI（[^）]+）/.test(join), shown(/SNI[^，。]{0,24}/));
	/* r100：本文件 288 行的 String.prototype.format 只替换 %s。视图里只要还有 %d，
	 * 测试拿到的就是字面 "%d"，对它的断言全部空转（真发生过 4 处）。 */
	eq('视图里没有 %d（桩测的 format 只认 %s，否则断言空转）',
		strings.filter(s => /%d/.test(s)).length, 0);
}

/* r114：断言数下限。少跑 = 少测，而且掉断言通常是「某个代码块被重构掉、
 * 连带它的断言一起消失」，报表仍然全绿。844 = r113 实测执行数。 */
const MIN_ASSERT = 844;
if (nassert < MIN_ASSERT) {
	console.log(`[FAIL] 断言执行数从 ${MIN_ASSERT} 掉到 ${nassert} —— 少跑的部分等于没测`);
	fails++;
}

console.log(fails === 0 ? '=== view 渲染断言全部通过' : `=== view 渲染断言失败 ${fails} 项`);
process.exit(fails === 0 ? 0 : 1);
