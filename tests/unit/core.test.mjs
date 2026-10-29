/* 新前端的纯逻辑单测：不碰 DOM，只验证契约与语义。
 * 加载方式：把构建产物当 LuCI 模块体执行一次，只认 window.__cfi__ 这一个句柄。 */
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(here, '..', '..');
const VIEW = path.join(root, 'luci-app-cf-ipcheck', 'htdocs', 'luci-static',
	'resources', 'view', 'cf_ipcheck', 'settings.js');

function load() {
	const src = fs.readFileSync(VIEW, 'utf8');
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
		addEventListener: () => {},
		removeEventListener: () => {}
	};
	const node = () => ({
		appendChild() {}, setAttribute() {}, removeChild() {}, addEventListener() {},
		style: {}, childNodes: [], firstChild: null, className: '', textContent: ''
	});
	const formStub = {
		Map: function (cfg, title, desc) {
			this.sections = [];
			this.section = function (type, name) {
				return {
					anonymous: false,
					option: function (t, key, title, short) {
						return { name: key, type: t, title: title, short: short, description: short,
							value: function () {} };
					}
				};
			};
			this.render = function () { return Promise.resolve(node()); };
		},
		TypedSection: 'typed', Flag: 'flag', Value: 'value',
		ListValue: 'list', TextValue: 'text', DynamicList: 'dyn'
	};
	const rpcStub = { declare: () => () => Promise.resolve({ ok: true, text: '' }) };
	const pollStub = { add() {}, remove() {}, start() {}, stop() {} };
	const viewStub = { extend: (o) => o };
	const fn = new Function('form', 'rpc', 'ui', 'poll', 'view', 'E', '_', 'L',
		'window', 'document', 'setTimeout', 'clearTimeout', 'navigator', src);
	fn(formStub, rpcStub, {}, pollStub, viewStub, node, (s) => s, {},
		windowStub, { head: null, createElement: node, createElementNS: node },
		setTimeout, clearTimeout, {});
	return windowStub.__cfi__;
}

const CFI = load();

test('构建版本与包版本一致', () => {
	assert.equal(CFI.build, 'r130');
});

test('IPC：9 个方法与超时预算', () => {
	assert.deepEqual(Object.keys(CFI.ipc.METHODS).sort(), [
		'check-sources', 'csv', 'diag', 'dns-sync', 'logs', 'pool', 'run-now', 'status', 'stop'
	]);
	assert.equal(CFI.ipc.OBJECT, 'luci.cf-ipcheck');
	assert.ok(CFI.ipc.LIMIT.logs < CFI.ipc.LIMIT.status, 'logs 必须小于 status');
	assert.equal(CFI.ipc.LIMIT['check-sources'], 45000);
	assert.equal(CFI.ipc.LIMIT['dns-sync'], 30000);
});

test('三态解析：执行不了 / 没跑过 / 读不懂 / 挂住 必须分开', () => {
	assert.equal(CFI.ipc.parseStatus(null).state, 'unreachable');
	assert.equal(CFI.ipc.parseStatus('').state, 'never_run');
	assert.equal(CFI.ipc.parseStatus('garbage').state, 'parse_error');
	assert.equal(CFI.ipc.parseStatus(CFI.ipc.HUNG).reason, 'hung');
	const ok = CFI.ipc.parseStatus('{"state":"done","intercepted":"1"}');
	assert.equal(ok.state, 'done');
	assert.equal(ok.intercepted, 1);
	assert.deepEqual(ok.items, []);
});

test('源检测与日志的四种/五种“空”不混', () => {
	assert.equal(CFI.ipc.parseSources(null).state, 'unreachable');
	assert.equal(CFI.ipc.parseSources(CFI.ipc.HUNG).state, 'hung');
	assert.equal(CFI.ipc.parseSources('').state, 'empty');
	assert.equal(CFI.ipc.parseSources('[]').state, 'empty');
	assert.equal(CFI.ipc.parseSources('<html>').state, 'parse_error');
	assert.equal(CFI.ipc.parseSources('[{"url":"x"}]').state, 'ok');
	assert.equal(CFI.ipc.parseLog(CFI.ipc.HUNG).state, 'hung');
	assert.equal(CFI.ipc.parseLog('  \n ').state, 'empty');
	assert.equal(CFI.ipc.parseLog('2026-10-29T10:00:00+0800 x').state, 'ok');
});

test('格式化：没数就是 —，0 不当缺失', () => {
	assert.equal(CFI.fmt.num(null), '\u2014');
	assert.equal(CFI.fmt.num(0), '0');
	assert.equal(CFI.fmt.ms(null), '\u2014');
	assert.equal(CFI.fmt.ms(0), '0.0');
	assert.equal(CFI.fmt.mbps(0), '\u2014');
	assert.equal(CFI.fmt.mbps(10.64), '10.64');
	assert.equal(CFI.fmt.clock('nope'), '\u2014');
});

test('六态语义：灯色与状态词分开，停止不当成故障', () => {
	assert.equal(CFI.sem.tone({ state: 'running' }), 'run');
	assert.equal(CFI.sem.tone({ state: 'running', staleFor: 5 }), 'warn');
	assert.equal(CFI.sem.tone({ state: 'error', reason: 'stopped' }), 'warn');
	assert.equal(CFI.sem.tone({ state: 'error', reason: 'interrupted' }), 'bad');
	assert.equal(CFI.sem.stateWord({ state: 'error', reason: 'no_results' }), '跑完 · 无达标');
	assert.match(CFI.sem.why('empty_pool'), /候选池是空的/);
});

test('dns_targets 文本往返：注释、怪行、尾随空行都原样', () => {
	const text = '# 头部注释\njp.example.com 3 @NRT\nnot-a-domain\nus.example.com 1\n\n';
	const lines = CFI.dns.linesOf(text);
	assert.equal(lines[0].kind, 'raw');
	assert.equal(lines[1].row.domain, 'jp.example.com');
	assert.equal(lines[1].row.count, 3);
	assert.equal(lines[1].row.code, 'NRT');
	assert.equal(lines[2].kind, 'raw');
	const back = CFI.dns.textOf(lines);
	assert.ok(back.indexOf('# 头部注释') === 0);
	assert.ok(back.indexOf('jp.example.com 3 @NRT') > 0);
	assert.ok(back.indexOf('not-a-domain') > 0);
	assert.ok(!/\n\n$/.test(back), '末尾空行不回写');
	assert.equal(CFI.dns.textOf(CFI.dns.linesOf('')), '');
});

test('hash：新三区直通，旧四标签全部有别名', () => {
	assert.equal(CFI.nav.parseHash('#cf-tab=board'), 'run');
	assert.equal(CFI.nav.parseHash('#cf-tab=sources'), 'diag');
	assert.equal(CFI.nav.parseHash('#cf-tab=logs'), 'diag');
	assert.equal(CFI.nav.parseHash('#cf-tab=config'), 'set');
	assert.equal(CFI.nav.parseHash('#cf-tab=nope'), null);
	assert.equal(CFI.nav.parseHash(''), null);
});

test('存储迁移：旧键映射到 cfi2.*，旧键保留', () => {
	const ls = CFI.prefs;
	// 用独立命名空间验证：直接写旧键再迁移
	ls.set('cf-ipcheck.tab', 'config');
	ls.set('cf-ipcheck.logs.auto', '0');
	ls.set('cf-ipcheck.groups.probe', '0');
	ls.set('cfi2.migrated', '');
	ls.migrate();
	assert.equal(ls.get('cfi2.tab', ''), 'set');
	assert.equal(ls.get('cfi2.diag.auto', ''), '0');
	assert.equal(ls.get('cfi2.groups.probe', ''), '0');
	assert.equal(ls.get('cf-ipcheck.tab', ''), 'config', '旧键要保留一版供回滚');
});

test('store：run 指纹覆盖进度与机房，rail 指纹只认有无滞留', () => {
	const s = CFI.store.create({});
	assert.equal(typeof s.get, 'function');
	s.patch({ a: 1 });
	assert.equal(s.get().a, 1);
	const k1 = CFI.store.runKey({ state: 'running', stage: 'probe', stage_done: 1, stage_total: 3, items: [] });
	const k2 = CFI.store.runKey({ state: 'running', stage: 'probe', stage_done: 2, stage_total: 3, items: [] });
	assert.notEqual(k1, k2);
	const r1 = CFI.store.railKey({ state: 'running', items: [], staleFor: 3 }, {});
	const r2 = CFI.store.railKey({ state: 'running', items: [], staleFor: 9 }, {});
	assert.equal(r1, r2, '秒数不进指纹，避免每拍重建读数条');
});

test('字段表：53 个字段 + dc_show 归组，短句与分组双向可查', () => {
	const groups = CFI.form.OPTIONS;
	let n = 0;
	Object.keys(groups).forEach((g) => { n += groups[g].length; });
	assert.equal(n, 53);
	assert.ok(groups.probe.indexOf('dc_show') >= 0);
	assert.equal(groups.probeAdv.length, 21);
	const map = CFI.form.create();
	assert.ok(map, 'create() 应返回 Map 实例');
});
