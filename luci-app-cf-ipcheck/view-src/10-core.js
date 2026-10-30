(function (CFI) {
	'use strict';

	/* ---- DOM ---------------------------------------------------------- */
	function append(node, kids) {
		if (kids === null || kids === undefined || kids === false)
			return;
		if (Array.isArray(kids)) {
			for (var i = 0; i < kids.length; i++)
				append(node, kids[i]);
			return;
		}
		if (typeof kids === 'string' || typeof kids === 'number')
			node.appendChild(document.createTextNode(String(kids)));
		else if (kids)
			node.appendChild(kids);
	}

	function el(tag, props, kids) {
		var n = document.createElement(tag);
		if (props) {
			for (var k in props) {
				if (!Object.prototype.hasOwnProperty.call(props, k))
					continue;
				var v = props[k];
				if (v === null || v === undefined || v === false)
					continue;
				if (k === 'class')
					n.className = String(v);
				else if (k === 'text')
					n.textContent = String(v);
				else if (k === 'style') {
					if (typeof v === 'string')
						n.setAttribute('style', v);
					else
						for (var sk in v)
							if (Object.prototype.hasOwnProperty.call(v, sk))
								n.style[sk] = v[sk];
				}
				else if (k === 'on') {
					for (var ev in v)
						if (Object.prototype.hasOwnProperty.call(v, ev))
							n.addEventListener(ev, v[ev]);
				}
				else if (k === 'data') {
					for (var dk in v)
						if (Object.prototype.hasOwnProperty.call(v, dk))
							n.setAttribute('data-' + dk, String(v[dk]));
				}
				else if (k === 'aria') {
					for (var ak in v)
						if (Object.prototype.hasOwnProperty.call(v, ak))
							n.setAttribute('aria-' + ak, String(v[ak]));
				}
				else if (k === 'value')
					n.value = v;
				else if (k === 'disabled' || k === 'checked' || k === 'hidden')
					n[k] = !!v;
				else
					n.setAttribute(k, String(v));
			}
		}
		append(n, kids);
		return n;
	}

	function clear(node) {
		if (!node)
			return;
		while (node.firstChild)
			node.removeChild(node.firstChild);
	}

	var SVG_NS = 'http://www.w3.org/2000/svg';
	var ICONS = {
		play: [ 'M6 4.5l13 7.5-13 7.5z' ],
		stop: [ 'M6 6h12v12H6z' ],
		refresh: [ 'M19 12a8 8 0 1 1-2.34-5.66L19 8', 'M19 3.5V8h-4.5' ],
		copy: [ 'M9 9h12v12H9z', 'M15 4.5A2.5 2.5 0 0 0 12.5 2h-8A2.5 2.5 0 0 0 2 4.5v8A2.5 2.5 0 0 0 4.5 15' ],
		probe: [ 'M18 11a8 8 0 1 1-16 0 8 8 0 1 1 16 0z', 'M20 20l-4.4-4.4' ]
	};

	function icon(name) {
		var ds = ICONS[name];
		if (!ds || !document.createElementNS)
			return null;
		var s = document.createElementNS(SVG_NS, 'svg');
		s.setAttribute('viewBox', '0 0 24 24');
		s.setAttribute('aria-hidden', 'true');
		s.setAttribute('focusable', 'false');
		for (var i = 0; i < ds.length; i++) {
			var p = document.createElementNS(SVG_NS, 'path');
			p.setAttribute('d', ds[i]);
			s.appendChild(p);
		}
		return s;
	}

	/* ---- 格式化 -------------------------------------------------------- */
	var DASH = '\u2014';

	function num(v, digits) {
		if (v === null || v === undefined || v === '')
			return DASH;
		var x = Number(v);
		if (!isFinite(x))
			return DASH;
		return x.toFixed(digits == null ? 0 : digits);
	}

	function ms(v) {
		if (v === null || v === undefined || !isFinite(Number(v)))
			return DASH;
		return Number(v).toFixed(1);
	}

	function mbps(v) {
		if (v === null || v === undefined || !isFinite(Number(v)) || Number(v) <= 0)
			return DASH;
		return Number(v).toFixed(2);
	}

	function fieldNum(rec, keys) {
		if (!rec)
			return null;
		for (var i = 0; i < keys.length; i++) {
			var v = rec[keys[i]];
			if (v === null || v === undefined || v === '')
				continue;
			if (isFinite(Number(v)))
				return Number(v);
		}
		return null;
	}

	function speedOf(rec, unit) {
		return fieldNum(rec, unit === 'mib' ? [ 'speed_mib' ] : [ 'speed_mbytes' ]);
	}

	function pad2(n) {
		return (n < 10 ? '0' : '') + n;
	}

	function ago(iso, now) {
		var t = Date.parse(iso);
		if (!isFinite(t))
			return '';
		var diff = Math.floor(((now || Date.now()) - t) / 1000);
		if (diff < 0)
			diff = 0;
		if (diff < 60)
			return T('刚刚');
		if (diff < 3600)
			return T('%s 分钟前').format(Math.floor(diff / 60));
		if (diff < 86400)
			return T('%s 小时前').format(Math.floor(diff / 3600));
		return T('%s 天前').format(Math.floor(diff / 86400));
	}

	function clock(iso) {
		var t = Date.parse(iso);
		if (!isFinite(t))
			return DASH;
		var d = new Date(t);
		return pad2(d.getHours()) + ':' + pad2(d.getMinutes()) + ':' + pad2(d.getSeconds());
	}

	function bytes(n) {
		var x = Number(n);
		if (!isFinite(x) || x <= 0)
			return DASH;
		return (x / 1048576).toFixed(2) + 'MB';
	}

	/* ---- 状态 → 信号与文案 --------------------------------------------- */
	function tone(st) {
		switch (st.state) {
			case 'running':
				return st.staleFor ? 'warn' : 'run';
			case 'never_run':
				return 'idle';
			case 'error':
				if (st.reason === 'stopped' || st.reason === 'no_results')
					return 'warn';
				return 'bad';
			case 'unreachable':
			case 'parse_error':
				return 'bad';
			default:
				if (st.intercepted == 1)
					return 'warn';
				if (Array.isArray(st.items) && !st.items.length)
					return 'warn';
				return 'ok';
		}
	}

	function stateWord(st) {
		switch (st.state) {
			case 'running':
				return st.staleFor ? T('测速中 · 读数滞留') : T('测速中');
			case 'never_run':
				return T('尚未运行');
			case 'unreachable':
				return st.reason === 'hung' ? T('没有回应') : T('读取失败');
			case 'parse_error':
				return T('输出异常');
			case 'error':
				if (st.reason === 'stopped')
					return T('已停止');
				if (st.reason === 'no_results')
					return T('跑完 · 无达标');
				return T('本轮失败');
			default:
				return st.intercepted == 1 ? T('完成 · 读数不可信') : T('已完成');
		}
	}

	function why(reason) {
		switch (reason) {
			case 'unreachable':
				return T('调不到引擎：状态接口没有回应。先点「刷新」重试；还是不行就重启 rpcd（或确认包已装好、ACL 已刷新）。');
			case 'hung':
				return T('引擎没有回应：最后一次状态读取超时。进程可能卡住或在重启中；先看「日志」，必要时重启 rpcd。');
			case 'parse_error':
				return T('引擎回了话，但内容不是可用的状态（JSON 解析失败）。把「日志」最后几行原样贴出来排查。');
			case 'empty_pool':
				return T('候选池是空的：社区源一条都没拉到，官方网段又关着。去「诊断」补源并检测，或临时打开「Cloudflare 官方网段」。');
			case 'missing_curl':
				return T('这台机器上没有 curl。所有探测都由它发起，请安装 curl 与 ca-bundle。');
			case 'missing_bin':
				return T('找不到 %s：包没装好，或 rpcd 拿着旧的 ACL 缓存（重启 rpcd 后重试）。').format(CMD);
			case 'sink_not_writable':
				return T('探测身份写不了运行目录里的丢弃目标，本轮在联网之前就中止了。查运行目录所在分区剩余空间，或「探测身份」是否被改成了不存在的用户。');
			case 'interrupted':
				return T('上一轮没跑完就断了（进程被杀、断电或重启），锁已回收。下面是上一次成功完成的榜单；点「立即测速」即可重来。');
			case 'stopped':
				return T('这一轮是按你点的「停止」停的，不是故障。下面这份榜单还是上一次跑完的那份。');
			case 'no_results':
				return T('这一轮跑完了，但没有一条 IP 达标。先去「日志」看最后几行：那行「分类」会说是全超时还是别的原因。');
			case '':
			case null:
			case undefined:
				return T('这一轮没有跑完，引擎也没留下原因码。先去「日志」看最后几行，再重试一轮。');
			default:
				return T('这一轮没有跑完。引擎留下的原因码是 %s —— 这一页还没登记过它。先看「日志」，确认没问题再重试一轮。').format(reason);
		}
	}

	function errKindName(code) {
		switch (String(code)) {
			case 'none': return T('无响应');
			case 'http': return T('HTTP 错');
			case 'dns': return T('域名解析失败');
			case 'connect': return T('连接失败');
			case 'timeout': return T('超时');
			case 'tls': return T('TLS 失败');
			case 'invalid_ip': return T('地址不合法');
			case 'stopped': return T('已停止');
			default: return String(code);
		}
	}

	CFI.dom = { el: el, append: append, clear: clear, icon: icon };
	CFI.fmt = {
		DASH: DASH, num: num, ms: ms, mbps: mbps, fieldNum: fieldNum,
		speedOf: speedOf, pad2: pad2, ago: ago, clock: clock, bytes: bytes
	};
	CFI.sem = {
		tone: tone, stateWord: stateWord, why: why, errKindName: errKindName
	};
})(CFI);
