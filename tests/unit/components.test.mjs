/* 组件级单测：用一个够用的 DOM 桩验证三类 r131 缺陷的修复点。
 *   1) 表格按 key 复用 <tr>：轮询重画不许换掉鼠标正按下/停在上面那行；
 *   2) 日志只追加：文本是上一版的超集时不重建已有行；
 *   3) 抽屉焦点：打开抢焦点、关闭归还、轮询刷新不夺焦。 */
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(here, '..', '..');
const VIEW = path.join(root, 'luci-app-cf-ipcheck', 'htdocs', 'luci-static',
	'resources', 'view', 'cf_ipcheck', 'settings.js');

/* LuCI 的 _() 返回带 format 的字符串；这里用原型补上同一语义。 */
String.prototype.format = function () {
	const a = arguments;
	let i = 0;
	return String(this).replace(/%s/g, () => String(a[i++]));
};

/* ---- 极简 DOM ---------------------------------------------------------- */
function makeEl(tag) {
	const n = {
		tagName: String(tag).toUpperCase(),
		childNodes: [], attrs: {}, style: {}, className: '',
		hidden: false, disabled: false, value: '', tabIndex: -1,
		scrollTop: 0, scrollHeight: 0, clientHeight: 0,
		parentNode: null, _text: '', handlers: {},
		appendChild(c) {
			if (!c) return c;
			c.parentNode = this;
			this.childNodes.push(c);
			this._text = '';
			return c;
		},
		removeChild(c) {
			const i = this.childNodes.indexOf(c);
			if (i >= 0) this.childNodes.splice(i, 1);
			c.parentNode = null;
			return c;
		},
		insertBefore(c, ref) {
			/* 真 DOM 里 insertBefore 一颗已在树上的节点是「移动」，不是复制 */
			if (c.parentNode) c.parentNode.removeChild(c);
			const i = ref ? this.childNodes.indexOf(ref) : -1;
			c.parentNode = this;
			this.childNodes.splice(i < 0 ? this.childNodes.length : i, 0, c);
			this._text = '';
			return c;
		},
		setAttribute(k, v) { this.attrs[k] = String(v); },
		getAttribute(k) { return Object.prototype.hasOwnProperty.call(this.attrs, k) ? this.attrs[k] : null; },
		removeAttribute(k) { delete this.attrs[k]; },
		addEventListener(type, fn) { (this.handlers[type] = this.handlers[type] || []).push(fn); },
		removeEventListener(type, fn) {
			const a = this.handlers[type] || [];
			const i = a.indexOf(fn);
			if (i >= 0) a.splice(i, 1);
		},
		dispatchEvent(ev) { (this.handlers[ev.type] || []).forEach((f) => f.call(this, ev)); },
		focus() { documentStub.activeElement = this; },
		querySelectorAll(sel) {
			/* 支持逗号分隔的「.class / 标签名」组合：80-set.js 的已改动判定要按
			   'input, select, textarea' 取一行里的全部控件。 */
			const parts = String(sel).split(',').map((s) => s.trim()).filter(Boolean);
			const hit = (node) => parts.some((p) => {
				if (p.charAt(0) === '.')
					return String(node.className || '').split(/\s+/).indexOf(p.slice(1)) >= 0;
				return String(node.tagName || '').toLowerCase() === p.toLowerCase();
			});
			const out = [];
			const walk = (node) => {
				node.childNodes.forEach((c) => {
					if (hit(c)) out.push(c);
					walk(c);
				});
			};
			walk(this);
			return out;
		},
		querySelector(sel) { return this.querySelectorAll(sel)[0] || null; },
		getBoundingClientRect() { return { left: 0, top: 0, right: 0, bottom: 0, width: 0, height: 0 }; }
	};
	Object.defineProperty(n, 'firstChild', { get() { return this.childNodes[0] || null; } });
	Object.defineProperty(n, 'lastChild', { get() { return this.childNodes[this.childNodes.length - 1] || null; } });
	Object.defineProperty(n, 'nextSibling', {
		get() {
			const p = this.parentNode;
			if (!p) return null;
			return p.childNodes[p.childNodes.indexOf(this) + 1] || null;
		}
	});
	Object.defineProperty(n, 'textContent', {
		get() {
			if (this._text) return this._text;
			return this.childNodes.map((c) => c.textContent).join('');
		},
		set(v) { this._text = String(v); this.childNodes = []; }
	});
	Object.defineProperty(n, 'classList', {
		get() {
			const self = this;
			const parts = () => String(self.className || '').split(/\s+/).filter(Boolean);
			return {
				add(c) { if (parts().indexOf(c) < 0) self.className = (parts().concat(c)).join(' '); },
				remove(c) { self.className = parts().filter((x) => x !== c).join(' '); },
				contains(c) { return parts().indexOf(c) >= 0; }
			};
		}
	});
	return n;
}

const mem = new Map();
const documentStub = {
	activeElement: null,
	head: makeEl('head'),
	body: makeEl('body'),
	createElement: makeEl,
	createElementNS: makeEl,
	createTextNode: (t) => {
		const n = makeEl('#text');
		n._text = String(t);
		return n;
	},
	addEventListener() {},
	removeEventListener() {}
};
const windowStub = {
	localStorage: {
		getItem: (k) => (mem.has(k) ? mem.get(k) : null),
		setItem: (k, v) => mem.set(k, String(v)),
		removeItem: (k) => mem.delete(k)
	},
	location: { hash: '' },
	history: { replaceState: (a, b, h) => { windowStub.location.hash = h; } },
	addEventListener() {},
	removeEventListener() {}
};
const formStub = {
	Map: function () {
		this.section = () => ({ option: () => ({ name: '', value() {} }) });
		this.render = () => Promise.resolve(makeEl('div'));
	},
	TypedSection: 'typed', Flag: 'flag', Value: 'value',
	ListValue: 'list', TextValue: 'text', DynamicList: 'dyn'
};
const pollStub = { add() {}, remove() {}, start() {}, stop() {} };
const src = fs.readFileSync(VIEW, 'utf8');
const fn = new Function('form', 'rpc', 'ui', 'poll', 'view', 'E', '_', 'L',
	'window', 'document', 'setTimeout', 'clearTimeout', 'navigator', src);
fn(formStub, { declare: () => () => Promise.resolve({ ok: true, text: '' }) }, {}, pollStub,
	{ extend: (o) => o }, makeEl, (s) => s, {},
	windowStub, documentStub, setTimeout, clearTimeout, {});
const CFI = windowStub.__cfi__;

function tableParts(table) {
	const scroll = table.node;
	const tbl = scroll.childNodes[0];
	const tbody = tbl.childNodes[2];
	return { scroll, tbl, tbody };
}

/* ---- 1. 表格 keyed reconcile ------------------------------------------ */
test('表格：同 key 同内容不换行节点，只重建真正变化的那一行', () => {
	const rows = [ { ip: '1.1.1.1', ms: 10 }, { ip: '2.2.2.2', ms: 20 } ];
	const t = CFI.ui.Table({
		cols: [ { key: 'ip', h: 'IP' }, { key: 'ms', h: 'ms' } ],
		keyOf: (r) => r.ip,
		rowSig: (r) => r.ip + ':' + r.ms,
		cell: (r, i, c) => CFI.dom.el('span', { text: String(r[c.key]) })
	});
	t.update({ rows });
	const { tbody } = tableParts(t);
	const a1 = tbody.childNodes[0];
	const b1 = tbody.childNodes[1];
	assert.equal(tbody.childNodes.length, 2);

	t.update({ rows: [ { ip: '1.1.1.1', ms: 10 }, { ip: '2.2.2.2', ms: 20 } ] });
	assert.equal(tbody.childNodes[0], a1, '同内容必须复用同一颗 <tr>');
	assert.equal(tbody.childNodes[1], b1);

	t.update({ rows: [ { ip: '1.1.1.1', ms: 10 }, { ip: '2.2.2.2', ms: 21 } ] });
	assert.equal(tbody.childNodes[0], a1, '未变的行不许被换掉（否则会吞掉鼠标点击）');
	assert.equal(tbody.childNodes[1], b1, '变了的行也复用行节点，只重建单元格');

	t.update({ rows: [ { ip: '2.2.2.2', ms: 21 }, { ip: '1.1.1.1', ms: 10 } ] });
	assert.equal(tbody.childNodes[0], b1, '排序只调整顺序');
	assert.equal(tbody.childNodes[1], a1);
});

test('表头：排序后仍保留 th 类与排序态（Argon 的 .th 规则依赖它）', () => {
	const t = CFI.ui.Table({
		cols: [ { key: 'ip', h: 'IP', sortable: true, cls: 'l' } ],
		keyOf: (r) => r.ip,
		rowSig: (r) => r.ip,
		cell: (r) => CFI.dom.el('span', { text: r.ip }),
		onSort: () => {}
	});
	t.update({ rows: [] });
	t.paintHead({ key: 'ip', dir: 'asc' });
	const { tbl } = tableParts(t);
	const th = tbl.childNodes[1].childNodes[0].childNodes[0];
	assert.match(th.className, /\bth\b/, 'th 类被 paintHead 洗掉会让表头掉回主题的另一套样式');
	assert.match(th.className, /\bsortable\b/);
	assert.match(th.className, /\bs-asc\b/);
	assert.equal(th.getAttribute('aria-sort'), 'ascending');
});

test('表格：空态占位行在有数据后被摘掉', () => {	const t = CFI.ui.Table({
		cols: [ { key: 'ip', h: 'IP' } ],
		keyOf: (r) => r.ip,
		rowSig: (r) => r.ip,
		cell: (r) => CFI.dom.el('span', { text: r.ip }),
		empty: () => CFI.ui.Empty({ title: '空', detail: '' })
	});
	t.update({ rows: [] });
	const { tbody } = tableParts(t);
	assert.equal(tbody.childNodes.length, 1);
	assert.ok(tbody.childNodes[0].className.indexOf('empty-row') >= 0);
	t.update({ rows: [ { ip: '1.1.1.1' } ] });
	assert.equal(tbody.childNodes.length, 1);
	assert.ok(tbody.childNodes[0].className.indexOf('empty-row') < 0, '空态行必须消失');
});

/* ---- 2. 日志增量 ------------------------------------------------------- */
test('日志：最新在上；文本是上一版的超集时只前插，已有行节点不变', () => {
	const lv = CFI.ui.LogView({ cap: 600 });
	lv.ingest('a\nb');
	assert.match(lv.box.childNodes[0].textContent, /b/, '最新一行在最上面');
	assert.match(lv.box.childNodes[1].textContent, /a/);
	const first = lv.box.childNodes[0];
	const second = lv.box.childNodes[1];
	assert.equal(lv.box.childNodes.length, 2);

	lv.ingest('a\nb\nc\nd');
	assert.equal(lv.box.childNodes.length, 4);
	assert.match(lv.box.childNodes[0].textContent, /d/);
	assert.match(lv.box.childNodes[1].textContent, /c/);
	assert.equal(lv.box.childNodes[2], first, '旧行不许重建（往下翻时会被弹走）');
	assert.equal(lv.box.childNodes[3], second);
	assert.equal(lv.count(), 4);
});

test('日志：被截断时重建并打一条分隔说明', () => {
	const lv = CFI.ui.LogView({ cap: 600 });
	lv.ingest('a\nb\nc');
	lv.ingest('b\nc');
	assert.equal(lv.count(), 3, '两行 + 一条截断说明');
	assert.match(lv.box.childNodes[0].textContent, /c/);
	assert.match(lv.box.childNodes[1].textContent, /b/);
	assert.match(lv.box.childNodes[2].textContent, /截断/);
});

test('日志：错误态用 notice 占位，之后来的正常文本能恢复', () => {
	const lv = CFI.ui.LogView({ cap: 600 });
	lv.notice('读不到日志');
	assert.match(lv.box.textContent, /读不到日志/);
	lv.ingest('x\ny');
	assert.equal(lv.count(), 2);
	assert.doesNotMatch(lv.box.textContent, /读不到日志/);
});

/* ---- 3. 详情弹窗适配器 ------------------------------------------------ */
test('弹窗：没有官方 ui.showModal 时安全降级，不抛错', () => {
	const m = CFI.ui.Modal({ onClose: () => {} });
	assert.equal(typeof m.open, 'function');
	assert.equal(m.open('1.1.1.1', CFI.dom.el('div', { text: 'x' })), false);
	assert.equal(m.isOpen(), false);
	m.close();
	m.destroy();
});

/* ---- 4. DNS 机房下拉：候选后到也要能用 -------------------------------- */
test('DNS 编辑器：首帧没有 dc_summary 也能挂载，候选到达后原地补选项', () => {
	let text = 'jp.example.com 1 @NRT';
	const ed = CFI.form.dns.RowsEditor({
		value: 'jp.example.com 1 @NRT',
		codes: [],
		onChange: (t) => { text = t; }
	});
	const sel = ed.node.querySelectorAll('.dnsrow-code')[0];
	assert.ok(sel, '应渲染出机房下拉');
	assert.equal(sel.value, 'NRT');
	assert.equal(sel.childNodes.length, 2, '只有「不限」+ 当前值占位两项');

	ed.setCodes([ { dc: 'NRT', count: 2 }, { dc: 'SIN', count: 1 } ]);
	const texts = sel.childNodes.map((o) => o.value);
	assert.deepEqual(texts, [ '', 'NRT', 'SIN' ], '候选到达后补进选项，且不重建正在编辑的行');
	assert.equal(sel.value, 'NRT', '已选机房保持');
	assert.equal(text, 'jp.example.com 1 @NRT', '补选项不触发写值');
});

/* ---- 5. 列显隐 --------------------------------------------------------- */
test('表格：列显隐只切容器 class，单元格带 data-label（移动端卡片用）', () => {
	const t = CFI.ui.Table({
		cols: [ { key: 'ip', h: 'IP' }, { key: 'tcp', h: 'TCP', cls: 'r c-tcp' } ],
		keyOf: (r) => r.ip, rowSig: (r) => r.ip,
		cell: (r, i, c) => CFI.dom.el('span', { text: r[c.key] })
	});
	const { scroll, tbody } = tableParts(t);
	t.update({ rows: [ { ip: '1.1.1.1', tcp: 12 } ], hidden: [ 'tcp' ] });
	assert.match(scroll.className, /hide-tcp/);
	assert.equal(tbody.childNodes[0].childNodes[1].getAttribute('data-label'), 'TCP');
	t.update({ rows: [ { ip: '1.1.1.1', tcp: 12 } ], hidden: [] });
	assert.doesNotMatch(scroll.className, /hide-tcp/);
});

/* ---- 6. 机房分布 keyed 差分 ------------------------------------------- */
test('机房分布：节点与展开状态跨拍保留，只更新读数', () => {
	const dc = CFI.ui.DcList();
	const rows = [
		{ dc: 'NRT', count: 8, ttfb_med: 272.5, best_ip: '1.1.1.1', items_total: 8,
			items: [ { ip: '1.1.1.1', ttfb_ms: 272.5, speed_bps: 9800000 } ], cap: 12 },
		{ dc: 'SIN', count: 4, ttfb_med: 300, best_ip: '2.2.2.2', items_total: 4,
			items: [ { ip: '2.2.2.2', ttfb_ms: 300, speed_bps: 1000000 } ], cap: 12 }
	];
	dc.update(rows, 1000000);
	const nrt = dc.nodeFor('NRT');
	assert.ok(nrt, '应渲染 NRT');
	assert.equal(dc.node.childNodes.length, 2);
	nrt.open = true;

	rows[0].ttfb_med = 280.1;
	dc.update(rows, 1000000);
	assert.equal(dc.nodeFor('NRT'), nrt, '同一机房必须复用 <details>');
	assert.equal(nrt.open, true, '展开状态留在节点上');
	assert.match(nrt.textContent, /280\.1/);
	assert.match(nrt.textContent, /9\.80/, '吞吐按十进制 MB/s 显示');

	rows.push({ dc: 'LAX', count: 1, ttfb_med: 400, best_ip: '3.3.3.3', items: [], cap: 12 });
	dc.update(rows, 1000000);
	assert.equal(dc.node.childNodes.length, 3);
	assert.equal(dc.node.childNodes[2], dc.nodeFor('LAX'));

	dc.update([ rows[1], rows[2] ], 1000000);
	assert.equal(dc.nodeFor('NRT'), null, '消失的机房要摘掉');
	assert.equal(dc.node.childNodes.length, 2);

	dc.update([], 1000000);
	assert.equal(dc.node.childNodes.length, 0);
});

/* ---- 7. 日志上限与跟随 ------------------------------------------------ */
test('日志：850 行进 DOM 只保留 600 行，最早的行被摘掉', () => {
	const lv = CFI.ui.LogView({ cap: 600 });
	let txt = '';
	for (let i = 0; i < 850; i++) txt += 'l' + i + '\n';
	lv.ingest(txt);
	assert.equal(lv.count(), 600);
	assert.equal(lv.box.childNodes.length, 600);
	assert.match(lv.box.childNodes[0].textContent, /l849/, '最新的在最上面');
	assert.match(lv.box.childNodes[599].textContent, /l250/, '应保留最后 600 行');
});

test('日志：关闭跟随后不自动回顶；重新打开立刻回到最新', () => {
	const lv = CFI.ui.LogView({ cap: 600 });
	lv.box.scrollHeight = 1000;
	lv.box.clientHeight = 100;
	lv.box.scrollTop = 900;
	lv.setFollow(false);
	lv.ingest('a\nb');
	assert.equal(lv.box.scrollTop, 900, '关跟随后滚动位置不动');
	lv.setFollow(true);
	assert.equal(lv.box.scrollTop, 0, '开跟随立刻回到最上面');
});

test('日志：往回翻时新行前插，滚动位置跟着补，并提示有新日志', () => {
	const lv = CFI.ui.LogView({ cap: 600 });
	lv.ingest('a\nb');
	Object.defineProperty(lv.box, 'scrollHeight', {
		get() { return lv.box.childNodes.length * 20; }
	});
	lv.box.scrollTop = 100;
	lv.ingest('a\nb\nc');
	assert.match(lv.box.childNodes[0].textContent, /c/);
	assert.equal(lv.box.scrollTop, 120, '插在上方的高度补回，眼前内容不动');
	const pill = lv.node.querySelectorAll('.log-pill')[0];
	assert.equal(pill.hidden, false);
	assert.match(pill.textContent, /有新日志/);
	assert.match(pill.textContent, /↑/);
});

/* ---- 8. 悬浮说明：机房码等节点复用同一个提示层 ------------------------ */
test('悬浮说明：挂到任意节点，函数取文字，移出即移除', () => {
	const n = CFI.dom.el('span', { text: 'NRT' });
	CFI.ui.attachTip(n, () => '东京');
	n.dispatchEvent({ type: 'mouseenter' });
	const tip = documentStub.body.querySelectorAll('.cfp-tip')[0];
	assert.ok(tip, '应把提示层挂到 body');
	assert.equal(tip.textContent, '东京');
	assert.equal(n.getAttribute('aria-describedby'), tip.id);
	n.dispatchEvent({ type: 'mouseleave' });
	assert.equal(documentStub.body.querySelectorAll('.cfp-tip').length, 0);
	assert.equal(n.getAttribute('aria-describedby'), null);
});

/* ---- 9. DNS 行级脏标记与还原 ------------------------------------------ */
test('DNS 编辑器：改一行只标这一行，还原后回到原文', () => {
	const ed = CFI.form.dns.RowsEditor({
		value: 'jp.example.com 3 @NRT\nus.example.com 1',
		codes: [ { dc: 'NRT', count: 1 } ]
	});
	const rows = ed.node.querySelectorAll('.dnsrow');
	assert.equal(rows.length, 3, '表头 + 两行');
	assert.doesNotMatch(rows[1].className, /dirty/);

	const cnt = ed.node.querySelectorAll('.dnsrow-n')[0];
	cnt.value = '5';
	cnt.dispatchEvent({ type: 'input' });
	assert.match(ed.node.querySelectorAll('.dnsrow')[1].className, /dirty/, '改过的行标脏');
	assert.doesNotMatch(ed.node.querySelectorAll('.dnsrow')[2].className, /dirty/, '没改的行不标');
	assert.equal(ed.isDirty(), true);

	const add = ed.node.querySelectorAll('.dnsrows-add')[0];
	const btn = add.querySelectorAll('.btn')[1];
	assert.equal(btn.hidden, false, '脏了才出现「还原」');
	btn.dispatchEvent({ type: 'click' });
	assert.equal(ed.isDirty(), false);
	assert.equal(ed.node.querySelectorAll('.dnsrow-n')[0].value, '3');
	assert.doesNotMatch(ed.node.querySelectorAll('.dnsrow')[1].className, /dirty/);
	assert.equal(add.querySelectorAll('.btn')[1].hidden, true);
});

/* ---- 9. 设置页功能备注：默认收起，点 ? 与完整解释一起展开 ---------------- */
/* 短句是 CBI 生成的裸文本，不能搬进 .cbi-value-field（r107 取值事故）。
 * 这里验证：短句留在原处、容器带收起标记、? 是唯一入口、点开后两段一起出现。 */
test('设置说明：默认收起短句，点 ? 后短句与完整解释一起出现', () => {
	/* HELP 表由 form.create() 在真机渲染时填充；这个沙箱只加载模块体，
	 * 所以先注入一条，让 applyHelp 认得这个字段（同一个对象引用）。 */
	const fullText = '关闭时后台只空转，不消耗流量。';
	CFI.form.HELP.enabled = fullText;
	const shortText = '关掉后不再自动跑。';
	const desc = makeEl('div');
	desc.className = 'cbi-value-description';
	desc.appendChild(documentStub.createTextNode(shortText));

	const label = makeEl('label');
	label.htmlFor = 'cbid.cf_ipcheck.global.enabled';
	const row = {
		querySelector(sel) {
			if (sel === 'label[for]')
				return label;
			if (sel === '.cbi-value-description')
				return desc;
			return null;
		},
		getAttribute() { return null; }
	};
	const rootStub = { querySelectorAll(sel) { return sel === '.cbi-value' ? [ row ] : []; } };

	CFI.form.applyHelp(rootStub);

	assert.equal(desc.getAttribute('data-cfi-help'), '1', '容器带收起标记');
	assert.equal(desc.getAttribute('data-cfi-open'), '0', '默认不展开');
	assert.equal(desc.childNodes[0].textContent, shortText, '短句仍在原处，没有搬 DOM');
	const q = label.childNodes.filter((n) => n.className === 'help-q')[0];
	const body = desc.childNodes.filter((n) => n.className === 'help-body')[0];
	assert.ok(q, '? 挂在字段标题旁，不再孤零零占说明行');
	assert.equal(desc.childNodes.filter((n) => n.className === 'help-q').length, 0,
		'说明行里不能再有 ?（否则又多一条 22px 空行）');
	assert.ok(body, '完整解释仍在说明行里');
	assert.equal(body.hidden, true, '默认不显示完整解释');
	assert.equal(q.getAttribute('aria-expanded'), 'false');
	assert.equal(q.getAttribute('aria-controls'), body.getAttribute('id'), '按钮指向展开体');
	assert.ok(q.getAttribute('title'), '按钮自带悬停提示');

	const click = () => q.dispatchEvent({ type: 'click', preventDefault() {} });
	click();
	assert.equal(desc.getAttribute('data-cfi-open'), '1', '点开后短句恢复显示');
	assert.equal(body.hidden, false, '点开后完整解释一起出现');
	assert.equal(q.getAttribute('aria-expanded'), 'true');
	click();
	assert.equal(desc.getAttribute('data-cfi-open'), '0', '再点一次收起');
	assert.equal(body.hidden, true);
	assert.equal(q.getAttribute('aria-expanded'), 'false');

	const n = desc.childNodes.length + label.childNodes.length;
	CFI.form.applyHelp(rootStub);
	assert.equal(desc.childNodes.length + label.childNodes.length, n, '重复渲染不重复挂按钮');

	/* r182：label[for] 会把点击转发给关联控件。真机实测点「启用定时实测」的 ?
	   会把开关从开切成关（checked true→false），所以必须在 label 的捕获阶段拦下：
	   preventDefault 阻止激活，stopPropagation 让按钮收不到这次点击，
	   再手动展开一次补回来。三种只拦按钮自身的写法都在真机上验过、无效。 */
	const guard = (label.handlers.click || [])[0];
	assert.ok(guard, 'label 上必须挂点击拦截，否则点 ? 会连带改控件');
	let prevented = false, stopped = false;
	desc.setAttribute('data-cfi-open', '0');
	body.hidden = true;
	guard.call(label, {
		target: q,
		preventDefault() { prevented = true; },
		stopPropagation() { stopped = true; }
	});
	assert.equal(prevented, true, '拦截要阻止 label 激活控件');
	assert.equal(stopped, true, '拦截要挡住按钮自己的 click，避免展开两次');
	assert.equal(desc.getAttribute('data-cfi-open'), '1', '拦截之后说明仍要打开');
	assert.equal(body.hidden, false);
	assert.equal(q.getAttribute('aria-expanded'), 'true');

	/* 点其它位置（不是 ?）不能拦：否则标题点击聚焦、复选框切换全废 */
	let p2 = false;
	guard.call(label, { target: label, preventDefault() { p2 = true; }, stopPropagation() {} });
	assert.equal(p2, false, '点标题本身不能拦，label 的原生行为要保留');
});

test('设置说明：多个字段时每个 ? 只操作自己的说明（var 闭包隔离）', () => {
	/* r182 首版把监听器写成直接引用循环变量 btn/body/desc，而它们是 var（函数作用域），
	   结果所有监听器都闭包到**最后一个**字段：真机上 24 个可见 ? 里 8 个既不展开、
	   也拦不住 label 转发（点一下就把同字段的开关改了）。单个字段的桩测不出这个问题，
	   这里用两行把它锁住。 */
	CFI.form.HELP.__iso1 = '解释一';
	CFI.form.HELP.__iso2 = '解释二';
	function mkRow(key) {
		const d = makeEl('div');
		d.className = 'cbi-value-description';
		d.appendChild(documentStub.createTextNode('短句' + key));
		const l = makeEl('label');
		l.htmlFor = 'cbid.cf_ipcheck.global.' + key;
		const row = {
			querySelector(sel) {
				if (sel === 'label[for]')
					return l;
				if (sel === '.cbi-value-description')
					return d;
				return null;
			},
			getAttribute() { return null; }
		};
		return { d, l, row };
	}
	const a = mkRow('__iso1');
	const b = mkRow('__iso2');
	CFI.form.applyHelp({
		querySelectorAll(sel) { return sel === '.cbi-value' ? [ a.row, b.row ] : []; }
	});

	const qa = a.l.childNodes.filter((n) => n.className === 'help-q')[0];
	const qb = b.l.childNodes.filter((n) => n.className === 'help-q')[0];
	assert.ok(qa && qb, '两个字段各挂一个 ?');

	qa.dispatchEvent({ type: 'click', preventDefault() {} });
	assert.equal(a.d.getAttribute('data-cfi-open'), '1', '第一个字段的 ? 展开自己的说明');
	assert.equal(b.d.getAttribute('data-cfi-open'), '0', '不能顺手把最后一个字段的说明打开');
	assert.equal(qa.getAttribute('aria-expanded'), 'true');
	assert.equal(qb.getAttribute('aria-expanded'), 'false', '其他字段的按钮状态不受影响');

	qa.dispatchEvent({ type: 'click', preventDefault() {} });
	assert.equal(a.d.getAttribute('data-cfi-open'), '0', '再点收起');

	/* label 捕获也要认自己的按钮：拿另一个字段的按钮过来，必须放行 */
	let pd = false, sp = false;
	const guardA = (a.l.handlers.click || [])[0];
	assert.ok(guardA, '第一行的 label 也要挂拦截（不能只有最后一行有）');
	guardA.call(a.l, { target: qb, preventDefault() { pd = true; }, stopPropagation() { sp = true; } });
	assert.equal(pd, false, '别的字段的按钮经过本行 label 时不能拦');
	assert.equal(sp, false);

	/* 源码层面再钉一次：参数必须由 IIFE 固化，不能直接引用循环变量 */
	const js = fs.readFileSync(path.join(root, 'luci-app-cf-ipcheck', 'htdocs', 'luci-static',
		'resources', 'view', 'cf_ipcheck', 'settings.js'), 'utf8');
	assert.match(js, /addEventListener\('click', \(function \(b, box, d\)/,
		'监听器必须用 IIFE 固化参数，直接引用 var 会让所有 ? 都指向最后一个字段');
});

test('设置说明：CSS 默认整行隐藏说明、展开态恢复、改动标记不拉长柱、? 不掉行', () => {
	const cssPath = path.join(root, 'luci-app-cf-ipcheck', 'htdocs', 'luci-static',
		'resources', 'view', 'cf_ipcheck', 'settings.css');
	const css = fs.readFileSync(cssPath, 'utf8');
	assert.match(css, /#view\s+\.cfp\s+\.cbi-value-description\[data-cfi-help\]:not\(\[data-cfi-open="1"\]\)\s*\{[^}]*max-height:\s*0[^}]*overflow:\s*hidden/,
		'默认态说明不占位（零高度塌陷 + 裁切）');
	assert.match(css, /\.cbi-value-description\[data-cfi-help\]\[data-cfi-open="1"\]\s*\{[^}]*display:\s*block/,
		'展开态恢复整行');
	assert.match(css, /\.cbi-value\.changed\s*\{\s*box-shadow:\s*none/,
		'已改动字段不再用整行 inset 边框拉成长柱');
	assert.match(css, /\.cbi-value\.changed\s*>\s*\.cbi-value-title::before/,
		'改动标记改为标题旁的短竖线');
	assert.ok(css.indexOf('data-cfi-help') >= 0, 'CSS 与 JS 用同一套属性名');
	assert.doesNotMatch(css, /font-size:\s*0;\s*line-height:\s*0/,
		'不再用 font-size:0 藏字（会留下孤零零的小问号）');
	/* 两列布局标签列只有 180~192px，长标题换行会把跟着文字流的 ? 挤到第二行。
	   所以 ? 必须绝对定位、标题必须留出跑道；窄屏 44px 热区要同步放宽。 */
	assert.match(css, /\.cbi-value\s*>\s*\.cbi-value-title\s*\{[^}]*padding-right:\s*26px/,
		'标题右侧给 ? 留 26px 固定跑道');
	assert.match(css, /\.help-q\s*\{[^}]*position:\s*absolute;\s*right:\s*0/,
		'? 绝对定位到标题右上角，不参与文字换行');
	/* r182：44px 是触控热区指标，不是视觉尺寸。圆圈本体收到 20px，用 ::after 把
	   热区补回 44px，并回到行内紧跟标题文字。不能再退回「圆圈本体 44px + 50px 跑道」——
	   420 下标签左对齐、文字只有 84px 宽，44px 的圆圈离文字 60px，看起来不属于任何字段。 */
	assert.match(css, /\.help-q\s*\{[^}]*width:\s*20px[^}]*height:\s*20px/,
		'窄屏圆圈视觉尺寸 20px');
	assert.match(css, /\.help-q::after\s*\{[^}]*inset:\s*-12px/,
		'窄屏用 ::after 把热区补回 44px');
	assert.doesNotMatch(css, /padding-right:\s*50px/,
		'窄屏不再留 50px 跑道（问号已回到行内）');
	assert.doesNotMatch(css, /\.help-q\s*\{[^}]*width:\s*44px/,
		'圆圈本体不再长成 44px');
	/* r182：Argon 的 cascade.css v2.4.7 在 ≤600 给 .cbi-value-description 打了
	   display:block 的强制优先声明。只提特异性压不住（实测 767 是 0/33 隐藏、
	   600 和 420 却是 33/33 全露出），而构建期禁强制优先（CssTidy 合并后不可控），
	   所以不跟 display 对抗：显式 block，两边都是 block，再压成零高度。 */
	assert.match(css, /#view\s+\.cfp\s+\.cbi-value-description\[data-cfi-help\]:not\(\[data-cfi-open="1"\]\)\s*\{[^}]*padding-top:\s*0/,
		'padding 必须归零：它不计入 max-height，留着仍会剩 12px 空隙');
	assert.match(css, /\.cbi-value-description\[data-cfi-help\]\[data-cfi-open="1"\]\s*\{[^}]*max-height:\s*none/,
		'展开态要解除高度限制');
	assert.doesNotMatch(css, /!important/,
		'样式表里不许出现强制优先声明（构建期合并选择器后行为不可控）');
	/* r182：桌面端那条 58px 纯主色空带要隐藏，但 ≤767 时它是移动端导航栏
	   （汉堡 + 站点名），隐藏会让侧栏菜单打不开 —— 所以只能写一次、只限桌面。 */
	assert.match(css, /header\.bg-primary\s*\{\s*display:\s*none/,
		'桌面端隐藏空色带');
	assert.equal((css.match(/header\.bg-primary/g) || []).length, 1,
		'空色带只写一次：≤767 那条 header 是导航栏，不能被一起隐藏');
});

test('设置说明：7 处与引擎实现冲突的旧说法已清除、且已写成正确说法', () => {
	const src = fs.readFileSync(path.join(root, 'luci-app-cf-ipcheck', 'view-src',
		'55-form-schema.js'), 'utf8');
	/* 2026-11-09 文案审查：这些句子曾与 cf-ipcheck / apply-dns.sh 的实际行为相反，
	   改文案时不能把旧说法抄回来。证据见接手指南 §9 与当日工作日志。 */
	const banned = [
		'不参与排序',                 /* speed_probe：吞吐按权重参与排名 */
		'排序规则是首字节时间升序',   /* keep_count：加权分降序才是第一键 */
		'榜单会是空的',               /* dc_pick：无对应机房时退回不过滤 */
		'跳过机房与吞吐两列',         /* canary_check：两列仍在，速度列显示 — */
		'填 1 表示「自动」',          /* dns_ttl：填 1 实际写入 ttl=1 */
		'一行一个机房',               /* dns_targets：每行是一条记录规则 */
		'N × 单次字节数 = 每轮流量',  /* speed_count：该值不控制测速循环 */
		'只对榜单前 N 个测吞吐',      /* 同上 */
		'用带真实 SNI 的 HTTPS'       /* 页首：SNI 是不必要的专业术语 */
	];
	banned.forEach((s) => assert.ok(!src.includes(s), '旧说法不能回来：' + s));

	const fixed = [
		'会按「速度在排名里的权重」参与排名',
		'排名会同时考虑网页响应速度和下载速度',
		'会自动改回不限制，不会给出空结果',
		'本轮不再测下载速度',
		'填 1 就是缓存 1 秒，不是「自动」',
		'每行填一条记录：域名、条数',
		'实际会先粗测约 20 个地址',
		'用真实网站域名，通过 HTTPS 连接逐个实测'
	];
	fixed.forEach((s) => assert.ok(src.includes(s), '修正后的说法必须存在：' + s));
});

/* ---- 4. 「已改动」按控件逐个记基线 ------------------------------------ */
test('已改动：后插入的控件不算改动，改原有控件才算', () => {
	const row = makeEl('div');
	row.className = 'cbi-value';
	const ta = makeEl('textarea');
	ta.value = 'nrt.example.com';
	row.appendChild(ta);

	const ch = CFI.form.changed;
	assert.ok(ch && ch.snapshot && ch.test, '80-set 要把逐控件判定挂到 CFI.form.changed');

	ch.snapshot(row);

	/* DNS 编辑器在 update() 里才 mount：这一行从 1 个控件长到 16 个。
	   旧写法把整行拼成一个值串，串长永远对不上，任何点击都判成已改动。 */
	const added = [];
	for (let i = 0; i < 15; i++) {
		const c = makeEl(i % 3 === 0 ? 'select' : 'input');
		c.value = i % 3 === 0 ? 'NRT' : 'x' + i;
		row.appendChild(c);
		added.push(c);
	}
	assert.equal(ch.test(row), false, '新插入的控件首次见到只补基线，不算改动');

	ta.value = 'other.example.com';
	assert.equal(ch.test(row), true, '改原有控件仍然要检出');

	ta.value = 'nrt.example.com';
	assert.equal(ch.test(row), false, '改回原值就不再标记');

	added[0].value = 'SIN';
	assert.equal(ch.test(row), true, '新控件补完基线后，用户改它仍能检出');

	added[0].value = 'NRT';
	assert.equal(ch.test(row), false, '新控件改回也不再标记');
});

test('已改动：复选框按勾选状态比较，不按 value 字符串', () => {
	const row = makeEl('div');
	row.className = 'cbi-value';
	const cb = makeEl('input');
	cb.type = 'checkbox';
	cb.checked = true;
	cb.value = 'on';
	row.appendChild(cb);

	const ch = CFI.form.changed;
	ch.snapshot(row);
	assert.equal(ch.test(row), false, '初始不标改动');

	cb.checked = false;
	assert.equal(ch.test(row), true, '取消勾选要检出');
});

test('已改动：dns_targets 的换行与分号单行算同一份清单', () => {
	/* r184 装机后实测：手写的 5 行清单（124 字符）被 DNS 编辑器第一次回写
	   规范成「分号 + 空格」单行（128 字符），域名一个没变，行上却一直挂
	   changed，改回原值也不消。按解析结果归一后再比就能消除这种假差异。 */
	const row = makeEl('div');
	row.className = 'cbi-value';
	row.setAttribute('data-name', 'dns_targets');
	const ta = makeEl('textarea');
	ta.value = 'a.example.com 1 @NRT\nb.example.com 2 @KIX';
	row.appendChild(ta);

	const ch = CFI.form.changed;
	ch.snapshot(row);
	assert.equal(ch.test(row), false, '初始不标改动');

	ta.value = 'a.example.com 1 @NRT; b.example.com 2 @KIX';
	assert.equal(ch.test(row), false, '格式规范化（换行→分号）不算改动');

	ta.value = 'a.example.com 1 @NRT; c.example.com 2 @KIX';
	assert.equal(ch.test(row), true, '真改域名仍然要检出');

	ta.value = 'a.example.com 1 @NRT\nb.example.com 2 @KIX';
	assert.equal(ch.test(row), false, '改回原值（哪怕格式不同）不再标记');
});
