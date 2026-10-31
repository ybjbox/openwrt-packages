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
	assert.equal(CFI.build, 'r167');
});

test('机房码：常见机场码有中文名，未知码不编造', () => {
	assert.equal(CFI.colo.name('NRT'), '东京');
	assert.equal(CFI.colo.name('kix'), '大阪');
	assert.equal(CFI.colo.name('LAX'), '洛杉矶');
	assert.equal(CFI.colo.name('ZZZ'), '');
	assert.equal(CFI.colo.name(''), '');
});

test('IPC：11 个方法与超时预算', () => {
	assert.deepEqual(Object.keys(CFI.ipc.METHODS).sort(), [
		'check-source', 'check-sources', 'csv', 'diag', 'dns-sync', 'logs', 'pool', 'run-now', 'status', 'stop', 'test-ip'
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
	/* unreachable 不是「跑了一半停住」：状态词与解释必须同向 */
	assert.equal(CFI.sem.stateWord({ state: 'unreachable', reason: 'hung' }), '没有回应');
	assert.equal(CFI.sem.stateWord({ state: 'unreachable' }), '读取失败');
	assert.match(CFI.sem.why('hung'), /没有回应/);
	assert.match(CFI.sem.why('unreachable'), /调不到引擎/);
	assert.ok(!/中途停了/.test(CFI.sem.why('hung')));
	assert.ok(!/中途停了/.test(CFI.sem.why('unreachable')));
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

test('dns_targets 存储形态：分号单行往返字节不变，换行输入规范成单行', () => {
	const s = 'jp.example.com 3 @NRT; # 注释; not-a-domain; us.example.com 1 example.com';
	const lines = CFI.dns.linesOf(s);
	assert.equal(lines.length, 4);
	assert.equal(lines[1].kind, 'raw');
	assert.equal(CFI.dns.textOf(lines), s);
	assert.equal(CFI.dns.textOf(CFI.dns.linesOf('a.example.com 1\nb.example.com 2')),
		'a.example.com 1; b.example.com 2');
});

test('hash：#/cfi/<zone> 直通，旧 #cf-tab= 一律不识别', () => {
	assert.equal(CFI.nav.parseRoute('#/cfi/run').zone, 'run');
	assert.equal(CFI.nav.parseRoute('#/cfi/logs').zone, 'logs');
	assert.equal(CFI.nav.parseRoute('#/cfi/diag/logs').sub, 'logs');
	assert.equal(CFI.nav.parseRoute('#/cfi/run/ip/1.1.1.1').arg, '1.1.1.1');
	assert.equal(CFI.nav.parseRoute('#/cfi/set/dns').sub, 'dns');
	assert.equal(CFI.nav.parseRoute('#cf-tab=board'), null);
	assert.equal(CFI.nav.parseRoute('#cf-tab=config'), null);
	assert.equal(CFI.nav.parseRoute('#/cfi/nope'), null);
	assert.equal(CFI.nav.parseRoute(''), null);
	assert.equal(CFI.nav.routeHash('run', 'ip', '1.1.1.1'), '#/cfi/run/ip/1.1.1.1');
});

test('存储：旧键零读写，新键只在 cfi3.* 前缀下', () => {
	const ls = CFI.prefs;
	assert.equal(ls.NS, 'cfi3.');
	ls.set('cf-ipcheck.tab', 'config');
	ls.set('cfi2.tab', 'diag');
	assert.equal(ls.savedZone(), null, '旧键不能被当成当前区');
	ls.set('cfi3.zone', 'set');
	assert.equal(ls.savedZone(), 'set');
	ls.set('cfi3.zone', 'logs');
	assert.equal(ls.savedZone(), 'logs');
	ls.set('cfi3.zone', 'nope');
	assert.equal(ls.savedZone(), null, '未知区回落');
});

test('store：切片订阅只在选择器结果变化时重画，tx 只通知一轮', () => {
	const s = CFI.store.create({ a: 1, b: 1 });
	let paints = 0;
	let seen = null;
	s.select((st) => String(st.a), (st) => { paints++; seen = st.a; });
	assert.equal(paints, 1, '订阅时先画一次');
	s.patch({ a: 1 });
	assert.equal(paints, 1, '同值不重画');
	s.patch({ a: 2 });
	assert.equal(paints, 2, '单字段 patch 只画一次');
	assert.equal(seen, 2);
	paints = 0;
	s.tx(function () {
		s.patch({ a: 3 });
		s.patch({ a: 4 });
		s.patch({ b: 2 });
	});
	assert.equal(paints, 1, '事务内多次 patch 只画一次');
	paints = 0;
	s.destroy();
	s.patch({ a: 9 });
	assert.equal(paints, 0, 'destroy 后迟到写入不再通知');
});

test('store：header 指纹按 10 秒桶聚合滞留秒数，按钮不会每秒重建', () => {
	const a = CFI.store.headerKey({ state: 'running', items: [], staleFor: 3 }, {});
	const b = CFI.store.headerKey({ state: 'running', items: [], staleFor: 9 }, {});
	assert.equal(a, b, '同一桶内不重画');
	const c = CFI.store.headerKey({ state: 'running', items: [], staleFor: 12 }, {});
	assert.notEqual(a, c, '跨桶要重画');
	const d = CFI.store.headerKey({ state: 'running', items: [], staleFor: 3 }, { run: { at: 1 } });
	assert.notEqual(a, d, 'busy 位必须进指纹');
});

test('store：run 指纹覆盖进度与机房', () => {
	const s = CFI.store.create({});
	assert.equal(typeof s.get, 'function');
	s.patch({ a: 1 });
	assert.equal(s.get().a, 1);
	const k1 = CFI.store.runKey({ state: 'running', stage: 'probe', stage_done: 1, stage_total: 3, items: [] });
	const k2 = CFI.store.runKey({ state: 'running', stage: 'probe', stage_done: 2, stage_total: 3, items: [] });
	assert.notEqual(k1, k2);
	const k3 = CFI.store.runKey({ state: 'done', items: [], dc_summary: [{ dc: 'NRT' }] });
	const k4 = CFI.store.runKey({ state: 'done', items: [], dc_summary: [{ dc: 'SIN' }] });
	assert.notEqual(k3, k4, '机房分布变了必须重画');
});

test('字段表：54 个字段 + dc_show 归组，短句与分组双向可查', () => {
	const groups = CFI.form.OPTIONS;
	let n = 0;
	Object.keys(groups).forEach((g) => { n += groups[g].length; });
	assert.equal(n, 54);
	assert.ok(groups.probe.indexOf('dc_show') >= 0);
	assert.equal(groups.probeAdv.length, 21);
	const map = CFI.form.create();
	assert.ok(map, 'create() 应返回 Map 实例');
});
