(function (CFI) {
	'use strict';

	/* 极简 store：一份状态、谁关心谁订阅。set 不原地改，也不会在组件不可见时
	 * 静默失败 —— r120 之前的 replaceChild 式重画就栽在这上面。 */
	function create(init) {
		var state = init || {};
		var subs = [];

		function get() {
			return state;
		}

		function patch(p) {
			if (!p)
				return;
			var changed = false;
			for (var k in p) {
				if (!Object.prototype.hasOwnProperty.call(p, k))
					continue;
				state[k] = p[k];
				changed = true;
			}
			if (!changed)
				return;
			var list = subs.slice();
			for (var i = 0; i < list.length; i++) {
				try { list[i](state); } catch (e) {}
			}
		}

		function subscribe(fn) {
			subs.push(fn);
			return function () {
				var i = subs.indexOf(fn);
				if (i >= 0)
					subs.splice(i, 1);
			};
		}

		return { get: get, patch: patch, subscribe: subscribe };
	}

	/* 重画指纹：只比较「看得见」的字段。交互宿主（按钮/输入框）永远不因指纹变化
	 * 被换掉，否则真实鼠标的 down/up 落在两颗节点上，浏览器不合成 click。 */
	function railKey(st, busy) {
		busy = busy || {};
		return [ st.state, st.reason, st.intercepted, (st.items || []).length, st.finished,
			!!busy.run, !!busy.stop, !!busy.refresh, st.enabled, st.interval,
			!!st.staleFor ].join('|');
	}

	/* 运行区读取的每一个状态字段都必须在这里 —— 漏一个，那块就冻在第一帧
	 * （r32：进度停在 1/13 三十秒）。staleFor 按 10 秒一档，避免每拍重建。 */
	function runKey(st) {
		return [ st.state, st.reason, st.finished, st.started, st.intercepted,
			(st.items || []).length, JSON.stringify(st.items), JSON.stringify(st.counts),
			st.stage, st.stage_done, st.stage_total, st.upload,
			st.enabled, st.interval, st.next_run, st.pool, st.qualified, st.usable,
			st.domains, st.speed_mode, st.bypass, st.probe_metric, st.speed_unit,
			JSON.stringify(st.dc_summary), st.dc_pick, st.dc_show,
			Math.floor((st.staleFor || 0) / 10), st.gaveUp ? 1 : 0 ].join('|');
	}

	CFI.store = { create: create, railKey: railKey, runKey: runKey };
})(CFI);
