(function (CFI) {
	'use strict';

	/* ---- 导航：只认 #/cfi/<zone>[/<sub>[/<arg>]] --------------------------
	 * 旧版 #cf-tab= 前缀一律不识别（2026-10-29 重设计时明确重置），
	 * 落默认区。开抽屉用 pushState（Back 即关），切区用 replaceState。 */
	var ZONES = [ 'run', 'diag', 'set' ];

	function parseRoute(hash) {
		var h = String(hash || '').replace(/^#\/?/, '');
		var parts = h.split('/').filter(function (x) { return x !== ''; });
		if (!parts.length || parts[0] !== 'cfi')
			return null;
		var zone = parts[1];
		if (ZONES.indexOf(zone) < 0)
			return null;
		return {
			zone: zone,
			sub: parts[2] || '',
			arg: parts[3] ? decodeURIComponent(parts[3]) : ''
		};
	}

	function routeHash(zone, sub, arg) {
		var h = '#/cfi/' + zone;
		if (sub)
			h += '/' + sub;
		if (arg)
			h += '/' + encodeURIComponent(arg);
		return h;
	}

	function writeRoute(zone, sub, arg, push) {
		try {
			var h = routeHash(zone, sub, arg);
			if (window.location && window.location.hash === h)
				return;
			if (push && window.history && window.history.pushState)
				window.history.pushState(null, '', h);
			else if (window.history && window.history.replaceState)
				window.history.replaceState(null, '', h);
		} catch (e) {}
	}

	/* ---- 本地偏好：新前缀 cfi3.*；旧键一律不读不删 ---------------------- */
	var NS = 'cfi3.';

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

	function getBool(key, def) {
		var v = lsGet(key, '');
		if (v === '1') return true;
		if (v === '0') return false;
		return !!def;
	}

	function savedZone() {
		var z = lsGet(NS + 'zone', '');
		return ZONES.indexOf(z) >= 0 ? z : null;
	}

	function rememberZone(zone) {
		lsSet(NS + 'zone', zone);
	}

	/* ---- dns_targets：uci 单行文本（; 分隔）⇄ 行清单 --------------------
	 * uci 的 option 值不能含换行（写进去会坏配置文件），所以存储形态是
	 * a 1; b 2 这种单行。解析同时接受分号与换行（手工编辑/环境变量），
	 * 回写统一用分号加空格 —— 往返字节不变。 */
	var DNS_LIMIT = 10;

	function dnsLinesOf(text) {
		var out = [];
		var all = String(text || '');
		if (all === '')
			return out;
		all.split(/\r?\n|;/).forEach(function (line) {
			var t = String(line).replace(/^\s+|\s+$/g, '');
			if (!t || t.charAt(0) === '#' || t.indexOf('.') < 0) {
				out.push({ kind: 'raw', text: t });
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
		}).join('; ');
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
			shown = CFI.T('昨天') + ' ' + hmss;
		else if (m[1] === String(now.getFullYear()))
			shown = m[2] + '-' + m[3] + ' ' + hmss;
		else
			shown = ymd + ' ' + hmss;
		return { shown: shown, title: ln.slice(0, m[0].length), rest: ln.slice(m[0].length).replace(/^[ \t]+/, '') };
	}

	CFI.nav = { ZONES: ZONES, parseRoute: parseRoute, routeHash: routeHash, writeRoute: writeRoute };
	CFI.prefs = {
		NS: NS, get: lsGet, set: lsSet, getBool: getBool,
		savedZone: savedZone, rememberZone: rememberZone
	};
	CFI.dns = { LIMIT: DNS_LIMIT, linesOf: dnsLinesOf, textOf: dnsTextOf };
	CFI.log = { tone: logTone, stamp: logStamp, TS_RE: LOG_TS_RE };
})(CFI);
