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
function clsOf(sel) {
	return sel.charAt(0) === '.' ? sel.slice(1) : '';
}

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
			const want = clsOf(String(sel).trim());
			const out = [];
			const walk = (node) => {
				node.childNodes.forEach((c) => {
					if (want && String(c.className || '').split(/\s+/).indexOf(want) >= 0) out.push(c);
					walk(c);
				});
			};
			walk(this);
			return out;
		},
		querySelector(sel) { return this.querySelectorAll(sel)[0] || null; }
	};
	Object.defineProperty(n, 'firstChild', { get() { return this.childNodes[0] || null; } });
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
test('日志：文本是上一版的超集时只追加，已有行节点不变', () => {
	const lv = CFI.ui.LogView({ cap: 600 });
	lv.ingest('a\nb');
	const first = lv.box.childNodes[0];
	const second = lv.box.childNodes[1];
	assert.equal(lv.box.childNodes.length, 2);

	lv.ingest('a\nb\nc\nd');
	assert.equal(lv.box.childNodes.length, 4);
	assert.equal(lv.box.childNodes[0], first, '旧行不许重建（往回翻时会被弹回顶部）');
	assert.equal(lv.box.childNodes[1], second);
	assert.equal(lv.count(), 4);
});

test('日志：被截断时重建并打一条分隔说明', () => {
	const lv = CFI.ui.LogView({ cap: 600 });
	lv.ingest('a\nb\nc');
	lv.ingest('b\nc');
	assert.equal(lv.count(), 3, '两行 + 一条截断说明');
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

/* ---- 3. 抽屉焦点 ------------------------------------------------------- */
test('抽屉：打开抢焦点、轮询刷新不夺焦、关闭归还并回调', () => {
	let closed = 0;
	const d = CFI.ui.Drawer({ onClose: () => { closed++; } });
	const opener = makeEl('button');
	documentStub.activeElement = opener;

	d.open('1.1.1.1', CFI.dom.el('div', { text: 'x' }));
	assert.ok(d.isOpen());
	assert.equal(documentStub.body.className.indexOf('cfi-drawer-open') >= 0, true, '锁 body 滚动');
	assert.notEqual(documentStub.activeElement, opener, '打开时焦点进抽屉');
	const panel = d.node.childNodes[1];
	assert.equal(panel.getAttribute('aria-modal'), 'true');

	const inside = makeEl('button');
	documentStub.activeElement = inside;
	d.open('1.1.1.1', CFI.dom.el('div', { text: 'y' }));
	assert.equal(documentStub.activeElement, inside, '轮询只更新读数，不许把焦点抢回抽屉');

	d.close();
	assert.equal(closed, 1);
	assert.equal(documentStub.activeElement, opener, '关闭后焦点回原行');
	assert.equal(d.node.className.indexOf('open'), -1);
});

test('抽屉：重复 close 不重复回调', () => {
	let closed = 0;
	const d = CFI.ui.Drawer({ onClose: () => { closed++; } });
	d.open('x', CFI.dom.el('div'));
	d.close();
	d.close();
	assert.equal(closed, 1);
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
	assert.match(lv.box.childNodes[0].textContent, /l250/, '应保留最后 600 行');
	assert.match(lv.box.childNodes[599].textContent, /l849/);
});

test('日志：关闭跟随后不自动贴底；重新打开立刻回到底部', () => {
	const lv = CFI.ui.LogView({ cap: 600 });
	lv.box.scrollHeight = 1000;
	lv.box.clientHeight = 100;
	lv.box.scrollTop = 900;
	lv.setFollow(false);
	lv.ingest('a\nb');
	assert.equal(lv.box.scrollTop, 900, '关跟随后滚动位置不动');
	lv.setFollow(true);
	assert.equal(lv.box.scrollTop, 1000, '开跟随立刻贴底');
});

/* ---- 8. DNS 行级脏标记与还原 ------------------------------------------ */
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
