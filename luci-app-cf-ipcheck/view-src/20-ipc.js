(function (CFI) {
	'use strict';

	/* 与引擎的唯一通道：rpcd 的 ucode 插件（luci.cf-ipcheck）。
	 * 每个方法回 { ok, text }，text 是引擎原样输出；解析只在这一层做。 */
	var RPC_OBJECT = 'luci.cf-ipcheck';

	var RPC_METHODS = {
		status: rpc.declare({ object: RPC_OBJECT, method: 'status' }),
		logs: rpc.declare({ object: RPC_OBJECT, method: 'logs' }),
		'run-now': rpc.declare({ object: RPC_OBJECT, method: 'run' }),
		stop: rpc.declare({ object: RPC_OBJECT, method: 'stop' }),
		'check-sources': rpc.declare({ object: RPC_OBJECT, method: 'check_sources' }),
		'check-source': rpc.declare({ object: RPC_OBJECT, method: 'check_source', params: [ 'index' ] }),
		'dns-sync': rpc.declare({ object: RPC_OBJECT, method: 'dns_sync' }),
		csv: rpc.declare({ object: RPC_OBJECT, method: 'csv' }),
		diag: rpc.declare({ object: RPC_OBJECT, method: 'diag' }),
		pool: rpc.declare({ object: RPC_OBJECT, method: 'pool' }),
		'test-ip': rpc.declare({ object: RPC_OBJECT, method: 'test_ip', params: [ 'ip', 'mode' ] })
	};

	/* 三种结果各说各的事：字符串 = 成功（空串是跑完没结果）、null = 被拒、
	 * HUNG = 等太久没回。挂住不能收敛成 null，否则会去查「包没装好」白费劲。 */
	var HUNG = { hung: true };

	var CMD_LIMIT = {
		status: 8000,
		status_running: 20000,
		'run-now': 10000,
		stop: 8000,
		'check-sources': 45000,
		/* 单源：最多 8 秒探测 + 段表 4 秒。 */
		'check-source': 15000,
		'dns-sync': 30000,
		csv: 8000,
		diag: 8000,
		pool: 45000,
		/* 单测：探测最长 30 秒 + 前置一次探测；留 45 秒。 */
		'test-ip': 45000,
		/* logs 必须小于 status：LuCI 会把同一拍的 rpc 并进一个 POST，
		 * 一次慢日志会把 status 一起拖成「没有回应」。 */
		logs: 6000
	};

	function call(args, ms) {
		var fn = RPC_METHODS[args && args[0]];
		var p = fn ? fn.apply(null, (args || []).slice(1)).then(function (obj) {
			return (obj && obj.ok !== false && typeof obj.text === 'string') ? obj.text : null;
		}, function () {
			return null;
		}) : Promise.resolve(null);
		if (typeof setTimeout !== 'function')
			return p;
		var limit = ms || CMD_LIMIT[args && args[0]] || 8000;
		return new Promise(function (res) {
			var timer = setTimeout(function () { res(HUNG); }, limit);
			p.then(function (out) {
				if (typeof clearTimeout === 'function')
					clearTimeout(timer);
				res(out);
			});
		});
	}

	function parseStatus(raw) {
		if (raw === null || raw === undefined)
			return { state: 'unreachable', items: [] };
		if (raw === HUNG)
			return { state: 'unreachable', reason: 'hung', items: [] };
		if (!raw)
			return { state: 'never_run', items: [] };
		try {
			var o = JSON.parse(raw);
			if (!Array.isArray(o.items))
				o.items = [];
			o.intercepted = (o.intercepted === 1 || o.intercepted === '1') ? 1 : 0;
			return o;
		} catch (e) {
			return { state: 'parse_error', items: [], raw: String(raw) };
		}
	}

	function parseSources(raw) {
		if (raw === null || raw === undefined)
			return { state: 'unreachable' };
		if (raw === HUNG)
			return { state: 'hung' };
		if (!raw)
			return { state: 'empty' };
		try {
			var rows = JSON.parse(raw);
			if (!Array.isArray(rows))
				return { state: 'parse_error', raw: String(raw) };
			if (!rows.length)
				return { state: 'empty' };
			return { state: 'ok', rows: rows };
		} catch (e) {
			return { state: 'parse_error', raw: String(raw) };
		}
	}

	function parseLog(raw) {
		if (raw === null || raw === undefined)
			return { state: 'unreachable' };
		if (raw === HUNG)
			return { state: 'hung' };
		if (!String(raw).replace(/[\r\n\s]/g, ''))
			return { state: 'empty' };
		return { state: 'ok', text: String(raw) };
	}

	CFI.ipc = {
		OBJECT: RPC_OBJECT,
		METHODS: RPC_METHODS,
		HUNG: HUNG,
		LIMIT: CMD_LIMIT,
		call: call,
		parseStatus: parseStatus,
		parseSources: parseSources,
		parseLog: parseLog
	};
})(CFI);
