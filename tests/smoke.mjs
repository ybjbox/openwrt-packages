/* 渲染冒烟：用最小 DOM 桩把 view.render() 跑一遍，确认三区外壳能装配出来。
 * 不验证样式与真实 CBI，只保证不会一进页面就抛错。 */
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(here, '..');
const VIEW = path.join(root, 'luci-app-cf-ipcheck', 'htdocs', 'luci-static',
	'resources', 'view', 'cf_ipcheck', 'settings.js');

function makeEl(tag) {
	const n = {
		tagName: String(tag).toUpperCase(),
		childNodes: [], attrs: {}, style: {}, className: '', textContent: '',
		appendChild(c) { this.childNodes.push(c); c.parentNode = this; this.firstChild = this.childNodes[0]; return c; },
		removeChild(c) { const i = this.childNodes.indexOf(c); if (i >= 0) this.childNodes.splice(i, 1); this.firstChild = this.childNodes[0] || null; return c; },
		insertBefore(c, ref) { const i = this.childNodes.indexOf(ref); this.childNodes.splice(i < 0 ? this.childNodes.length : i, 0, c); this.firstChild = this.childNodes[0]; return c; },
		setAttribute(k, v) { this.attrs[k] = String(v); },
		getAttribute(k) { return this.attrs[k] == null ? null : this.attrs[k]; },
		addEventListener() {},
		removeEventListener() {},
		querySelector() { return null; },
		querySelectorAll() { return []; },
		focus() {},
		get classList() { return { add: () => {}, remove: () => {} }; }
	};
	Object.defineProperty(n, 'firstChild', { writable: true, value: null });
	return n;
}

const mem = new Map();
const windowStub = {
	localStorage: {
		getItem: (k) => (mem.has(k) ? mem.get(k) : null),
		setItem: (k, v) => mem.set(k, String(v)),
		removeItem: (k) => mem.delete(k),
		get length() { return mem.size; },
		key: (i) => Array.from(mem.keys())[i] || null
	},
	location: { hash: '' },
	history: { replaceState: (a, b, h) => { windowStub.location.hash = h; } },
	addEventListener() {}, removeEventListener() {}
};
const documentStub = {
	head: makeEl('head'),
	body: makeEl('body'),
	createElement: makeEl,
	createElementNS: makeEl,
	createTextNode: (t) => ({ nodeType: 3, textContent: String(t) }),
	addEventListener() {},
	removeEventListener() {}
};

const mapNode = makeEl('div');
const formStub = {
	Map: function () {
		this.section = () => ({ option: () => ({ name: '', value() {} }) });
		this.render = () => Promise.resolve(mapNode);
	},
	TypedSection: 'typed', Flag: 'flag', Value: 'value',
	ListValue: 'list', TextValue: 'text', DynamicList: 'dyn'
};
const statusJson = JSON.stringify({
	state: 'done', items: [ { ip: '1.1.1.1', code: 200, ttfb_ms: 12.3, total_ms: 30, colo: 'NRT', speed_mbytes: 9.8 } ],
	pool: 10, qualified: 1, usable: 1, counts: { none: 9, timeout: 2 },
	dc_summary: [ { dc: 'NRT', count: 1, ttfb_med: 12.3, best_ip: '1.1.1.1', items: [ { ip: '1.1.1.1', ttfb_ms: 12.3, speed_bps: 9800000 } ] } ],
	dc_pick: 'all', probe_metric: 'http', speed_unit: 'mb', enabled: 0, interval: 6
});
const rpcStub = { declare: () => () => Promise.resolve({ ok: true, text: statusJson }) };
const pollStub = { add() {}, remove() {}, start() {}, stop() {} };
let viewDef = null;
const viewStub = { extend: (o) => { viewDef = o; return o; } };

const src = fs.readFileSync(VIEW, 'utf8');
const fn = new Function('form', 'rpc', 'ui', 'poll', 'view', 'E', '_', 'L',
	'window', 'document', 'setTimeout', 'clearTimeout', 'navigator', src);
fn(formStub, rpcStub, {}, pollStub, viewStub, makeEl, (s) => s, {},
	windowStub, documentStub, setTimeout, clearTimeout, {});

assert.ok(viewDef && typeof viewDef.render === 'function', 'view.extend 应返回 render');
const node = viewDef.render(statusJson);
assert.ok(node && node.className && node.className.indexOf('cfp') >= 0, '根节点应是 .cfp');
const panes = node.childNodes.filter((c) => String(c.className || '').indexOf('pane') >= 0);
assert.equal(panes.length, 4, '应有 4 个区');
const tabs = node.childNodes.filter((c) => String(c.className || '').indexOf('cfp-tabs') >= 0);
assert.equal(tabs.length, 1, '应有分段导航');
const tabList = tabs[0].childNodes[0];
assert.equal(tabList && tabList.childNodes.length, 4, '导航应有四段');
console.log('[PASS] render 冒烟：.cfp + 分段导航 + 4 区');
