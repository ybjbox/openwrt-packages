(function (CFI) {
	'use strict';

	/* store：一份状态 + 按切片订阅。
	 * 旧实现只有一个订阅者（整个页面），任何 patch 都整页重画 —— 按钮被换掉，
	 * 真实鼠标的 down/up 落在两颗节点之间就不合成 click。现在订阅时给一个
	 * 选择器，选择器返回的字符串没变就不调用；patch 在一次事务里只通知一轮。 */
	function create(init) {
		var state = init || {};
		var subs = [];
		var depth = 0;
		var alive = 1;

		function get() {
			return state;
		}

		function notify() {
			if (!alive || depth)
				return;
			var list = subs.slice();
			for (var i = 0; i < list.length; i++) {
				var s = list[i];
				if (!alive)
					return;
				var key;
				try {
					key = s.sel ? String(s.sel(state)) : '';
				} catch (e) {
					key = '';
				}
				if (key === s.last)
					continue;
				s.last = key;
				try { s.fn(state); } catch (e2) {}
			}
		}

		function patch(p) {
			if (!alive || !p)
				return;
			for (var k in p) {
				if (Object.prototype.hasOwnProperty.call(p, k))
					state[k] = p[k];
			}
			notify();
		}

		/* 事务：多次 patch 只触发一轮通知（一个动作的「置 busy + 写结果 + 清 busy」） */
		function tx(fn) {
			depth++;
			try {
				fn();
			} finally {
				depth--;
				if (!depth)
					notify();
			}
		}

		function select(sel, fn) {
			var s = { sel: sel, fn: fn, last: null };
			subs.push(s);
			try {
				s.last = String(sel(state));
				fn(state);
			} catch (e) {}
			return function () {
				var i = subs.indexOf(s);
				if (i >= 0)
					subs.splice(i, 1);
			};
		}

		function setBusy(key, on, meta) {
			var b = Object.assign({}, state.busy || {});
			if (on)
				b[key] = meta && typeof meta === 'object' ? meta : { at: Date.now() };
			else
				delete b[key];
			patch({ busy: b });
		}

		function getBusy(key) {
			return (state.busy || {})[key] || null;
		}

		function destroy() {
			alive = 0;
			subs = [];
		}

		return {
			get: get, patch: patch, tx: tx, select: select,
			setBusy: setBusy, getBusy: getBusy, destroy: destroy
		};
	}

	/* ---- 切片选择器 ---------------------------------------------------- */
	/* header：状态带与三颗常驻按钮只认这些字段；滞留秒数按 10 秒桶进 key，
	 * 否则每秒都会重建按钮（又是吞点击）。 */
	function headerKey(st, busy) {
		st = st || {};
		busy = busy || {};
		var it = (st.items || [])[0];
		return [ st.state, st.reason, st.intercepted, st.finished, st.started,
			st.enabled, st.interval, st.next_run, st.port,
			Math.floor((st.staleFor || 0) / 10),
			it && it.ip ? it.ip : '',
			busy.run ? 1 : 0, busy.stop ? 1 : 0, busy.refresh ? 1 : 0 ].join('|');
	}

	/* 榜单行签名：只取会显示在行上的字段，避免 JSON.stringify 整个对象。
	 * （旧 runKey 里的 JSON.stringify(items) 在 100 行时每拍都要序列化一遍。） */
	function rowSig(it) {
		if (!it)
			return '';
		return [ it.ip, it.code, it.ttfb_ms, it.total_ms, it.connect_ms, it.tls_ms,
			it.colo, it.domain, it.speed_mbytes, it.speed_mib, it.loss, it.jitter_ms,
			it.ray_ok, it.net_ttfb_ms ].join(',');
	}

	function itemsSig(items) {
		var out = [];
		for (var i = 0; i < (items || []).length; i++)
			out.push(rowSig(items[i]));
		return out.join(';');
	}

	function roundKey(st) {
		st = st || {};
		return [ st.state, st.reason, st.intercepted, st.pool, st.qualified, st.usable,
			JSON.stringify(st.counts || {}), st.started, st.finished, st.domains,
			Math.floor((st.staleFor || 0) / 10) ].join('|');
	}

	function stageKey(st) {
		st = st || {};
		return [ st.stage, st.stage_done, st.stage_total, st.upload, st.state ].join('|');
	}

	function boardKey(st) {
		st = st || {};
		return [ itemsSig(st.items), st.speed_unit, st.probe_metric, st.state ].join('|');
	}

	function dcKey(st) {
		st = st || {};
		return [ JSON.stringify(st.dc_summary || []), st.dc_show || [], st.dc_pick ].join('|');
	}

	function footKey(st, busy) {
		st = st || {};
		busy = busy || {};
		return [ (st.items || []).length, st.state, busy.copy ? 1 : 0, busy.csv ? 1 : 0,
			busy.dns ? 1 : 0 ].join('|');
	}

	function diagKey(st) {
		return [ JSON.stringify(st.sources || null), st.srcPending || 0 ].join('|');
	}

	function logsKey(st, opts) {
		var lg = st.logs || {};
		var text = lg.state === 'ok' ? String(lg.text || '') : '';
		opts = opts || {};
		return [ lg.state || '', text.length, text.slice(-60),
			opts.logFilter || 'all', opts.logPaused ? 1 : 0, opts.logFull ? 1 : 0,
			opts.logAuto ? 1 : 0 ].join('|');
	}

	function setKey(st) {
		return JSON.stringify((st.status || {}).dc_summary || []);
	}

	/* 兼容旧名字：lint red-line-9 按函数体核对运行区读取的每个字段都在指纹里。
	 * 真正的订阅用上面那几个更细的 key；这个聚合函数保留为契约说明。 */
	function runKey(st) {
		st = st || {};
		return [ st.state, st.reason, st.finished, st.started, st.intercepted,
			(st.items || []).length, JSON.stringify(st.items), JSON.stringify(st.counts),
			st.stage, st.stage_done, st.stage_total, st.upload,
			st.enabled, st.interval, st.next_run, st.pool, st.qualified, st.usable,
			st.domains, st.speed_mode, st.bypass, st.probe_metric, st.speed_unit,
			JSON.stringify(st.dc_summary), st.dc_pick, st.dc_show,
			Math.floor((st.staleFor || 0) / 10), st.gaveUp ? 1 : 0 ].join('|');
	}

	CFI.store = {
		create: create,
		headerKey: headerKey,
		roundKey: roundKey,
		stageKey: stageKey,
		boardKey: boardKey,
		dcKey: dcKey,
		footKey: footKey,
		diagKey: diagKey,
		logsKey: logsKey,
		setKey: setKey,
		rowSig: rowSig,
		runKey: runKey
	};
})(CFI);
