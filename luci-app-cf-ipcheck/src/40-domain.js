(function (CFI) {
	'use strict';

	/* ---- 导航：3 区 + 旧 hash 别名 ------------------------------------- */
	var ZONES = [ 'run', 'diag', 'set' ];
	var HASH_ALIAS = {
		board: 'run', sources: 'diag', logs: 'diag', config: 'set',
		run: 'run', diag: 'diag', set: 'set'
	};

	function parseHash(hash) {
		var m = /#cf-tab=([a-z]+)/.exec(String(hash || ''));
		if (!m)
			return null;
		return HASH_ALIAS[m[1]] || null;
	}

	function writeHash(zone) {
		try {
			if (window.history && window.history.replaceState)
				window.history.replaceState(null, '', '#cf-tab=' + zone);
		} catch (e) {}
	}

	/* ---- 本地偏好：旧键一次性迁移，旧键保留一版（回滚可用） ------------ */
	var NS = 'cfi2.';

	function lsGet(key, def) {
		try {
			var v = window.localStorage.getItem(key);
			return v == null ? def : v;
		} catch (e) {
			return def;
		}
	}

	function lsSet(key, val) {
		try { window.localStorage.setItem(key, String(val)); } catch (e) {}
	}

	function migrate() {
		if (lsGet(NS + 'migrated', '') === '1')
			return;
		var tab = lsGet('cf-ipcheck.tab', '');
		if (tab && HASH_ALIAS[tab])
			lsSet(NS + 'tab', HASH_ALIAS[tab]);
		var auto = lsGet('cf-ipcheck.logs.auto', '');
		if (auto === '0' || auto === '1')
			lsSet(NS + 'diag.auto', auto);
		try {
			var i, k;
			for (i = 0; i < window.localStorage.length; i++) {
				k = window.localStorage.key(i);
				if (k && k.indexOf('cf-ipcheck.groups.') === 0) {
					var tail = k.slice('cf-ipcheck.groups.'.length);
					lsSet(NS + 'groups.' + tail, window.localStorage.getItem(k));
				}
			}
		} catch (e2) {}
		lsSet(NS + 'migrated', '1');
	}

	function savedZone() {
		var z = lsGet(NS + 'tab', '');
		return HASH_ALIAS[z] ? HASH_ALIAS[z] : null;
	}

	function rememberZone(zone) {
		lsSet(NS + 'tab', zone);
	}

	/* ---- dns_targets：uci 单行文本 ⇄ 行清单 ---------------------------- */
	var DNS_LIMIT = 10;

	function dnsLinesOf(text) {
		var out = [];
		var all = String(text || '');
		if (all === '')
			return out;
		all.split(/\r?\n/).forEach(function (line) {
			var t = String(line).replace(/^\s+|\s+$/g, '');
			if (!t || t.charAt(0) === '#' || t.indexOf('.') < 0) {
				out.push({ kind: 'raw', text: String(line) });
				return;
			}
			var tok = t.split(/\s+/);
			var count = 1;
			if (tok[1] && /^\d+$/.test(tok[1]))
				count = Number(tok[1]);
			var code = '';
			var rest = [];
			for (var k = 1; k < tok.length; k++) {
				var x = tok[k];
				if (k === 1 && /^\d+$/.test(x))
					continue;
				if (x.charAt(0) === '@' && /^[A-Za-z]{3}$/.test(x.slice(1)))
					code = x.slice(1).toUpperCase();
				else
					rest.push(x);
			}
			out.push({ kind: 'row', row: { domain: tok[0], count: count, code: code, rest: rest } });
		});
		return out;
	}

	function dnsTextOf(lines) {
		var src = lines || [];
		while (src.length && src[src.length - 1] && src[src.length - 1].kind === 'raw' &&
			String(src[src.length - 1].text || '').trim() === '')
			src = src.slice(0, -1);
		return src.map(function (ln) {
			if (!ln || ln.kind !== 'row')
				return ln && ln.text != null ? ln.text : '';
			var r = ln.row;
			var s = r.domain + ' ' + (r.count || 1);
			if (r.code)
				s += ' @' + r.code;
			(Array.isArray(r.rest) ? r.rest : []).forEach(function (x) { s += ' ' + x; });
			return s.replace(/\s+$/, '');
		}).join('\n');
	}

	/* ---- 日志 ---------------------------------------------------------- */
	function logTone(line) {
		if (/失败|错误|中止|写不动|不是字符设备|找不到|没有 curl/.test(line))
			return 'bad';
		if (/已请求停止|被丢弃|已忽略|低于下限|超过上限|跳过/.test(line))
			return 'warn';
		return '';
	}

	var LOG_TS_RE = /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2}):(\d{2})([+-]\d{2}):?(\d{2})/;

	function logStamp(ln, full) {
		var m = LOG_TS_RE.exec(ln);
		if (!m)
			return null;
		var p = function (n) { return n < 10 ? '0' + n : String(n); };
		var now = new Date();
		var ymd = m[1] + '-' + m[2] + '-' + m[3];
		var hmss = m[4] + ':' + m[5] + ':' + m[6];
		if (full)
			return { shown: ln.slice(0, m[0].length), title: ln.slice(0, m[0].length), rest: ln.slice(m[0].length).replace(/^[ \t]+/, '') };
		var today = now.getFullYear() + '-' + p(now.getMonth() + 1) + '-' + p(now.getDate());
		var yd = new Date(now.getTime() - 86400000);
		var yesterday = yd.getFullYear() + '-' + p(yd.getMonth() + 1) + '-' + p(yd.getDate());
		var shown;
		if (ymd === today)
			shown = hmss;
		else if (ymd === yesterday)
			shown = T('昨天') + ' ' + hmss;
		else if (m[1] === String(now.getFullYear()))
			shown = m[2] + '-' + m[3] + ' ' + hmss;
		else
			shown = ymd + ' ' + hmss;
		return { shown: shown, title: ln.slice(0, m[0].length), rest: ln.slice(m[0].length).replace(/^[ \t]+/, '') };
	}

	CFI.nav = { ZONES: ZONES, alias: HASH_ALIAS, parseHash: parseHash, writeHash: writeHash };
	CFI.prefs = {
		NS: NS, get: lsGet, set: lsSet, migrate: migrate,
		savedZone: savedZone, rememberZone: rememberZone
	};
	CFI.dns = { LIMIT: DNS_LIMIT, linesOf: dnsLinesOf, textOf: dnsTextOf };
	CFI.log = { tone: logTone, stamp: logStamp, TS_RE: LOG_TS_RE };
})(CFI);
