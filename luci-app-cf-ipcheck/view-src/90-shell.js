(function (CFI) {
	'use strict';

	var el = CFI.dom.el;
	var F = CFI.fmt;

	/* 轮询：全仓唯一入口。L.poll 首次 add 不启表，必须显式 start；
	 * 回调必须把 promise 交回去，否则重入守卫空转。 */
	var POLL_SEC = 3;
	var POLL_SLOW = 10;
	var LOG_SEC = 4;
	var FAIL_STALE = 2;
	var FAIL_GIVEUP = 4;

	function create(initialRaw) {
		var store = CFI.store.create({
			status: CFI.ipc.parseStatus(initialRaw),
			tab: 'run',
			busy: {},
			sources: null,
			pool: null,
			diag: null,
			logs: null,
			logFull: false,
			logAuto: CFI.prefs.get(CFI.prefs.NS + 'diag.auto', '1') !== '0',
			srcEdit: null
		});
		var inflight = null;
		var epoch = 0;
		var applied = 0;
		var misses = 0;
		var lastGood = 0;
		var pollOn = false;
		var pollSec = 0;
		var logOn = false;
		var shell = null;

		/* ---- 状态读取 -------------------------------------------------- */
		function afterMiss(prev, hung, manual) {
			if (!manual)
				misses++;
			var now = Date.now();
			if (misses >= FAIL_GIVEUP) {
				var secs = lastGood ? Math.max(1, Math.round((now - lastGood) / 1000)) : null;
				return Object.assign({}, prev, {
					state: 'unreachable',
					reason: hung ? 'hung' : null,
					staleFor: secs,
					gaveUp: 1
				});
			}
			if (misses >= FAIL_STALE) {
				var s = lastGood ? Math.max(1, Math.round((now - lastGood) / 1000)) : 1;
				return Object.assign({}, prev, { staleFor: s });
			}
			return Object.assign({}, prev);
		}

		function refresh(manual) {
			if (inflight)
				return inflight;
			var wasRunning = (store.get().status || {}).state === 'running';
			if (manual)
				setBusy('refresh', true);
			var my = ++epoch;
			inflight = CFI.ipc.call([ 'status' ], wasRunning || pollOn ? CFI.ipc.LIMIT.status_running : 0).then(function (out) {
				inflight = null;
				var busy = Object.assign({}, store.get().busy);
				delete busy.refresh;
				if (out === CFI.ipc.HUNG || out === null || out === undefined) {
					var miss = afterMiss(store.get().status || {}, out === CFI.ipc.HUNG, !!manual);
					store.patch({ status: miss, busy: busy });
					startPoll();
					return miss;
				}
				if (my < applied)
					return store.get().status;
				applied = my;
				misses = 0;
				lastGood = Date.now();
				var st = CFI.ipc.parseStatus(out);
				store.patch({ status: st, busy: busy });
				if (st.state === 'running')
					startPoll();
				else
					stopPoll();
				return st;
			}, function () {
				inflight = null;
				setBusy('refresh', false);
				return store.get().status;
			});
			return inflight;
		}

		function pollTick() {
			try {
				if (store.get().tab === 'diag' && logAutoOn())
					logsRefresh();
				return refresh();
			} catch (e) {
				return Promise.resolve();
			}
		}

		function gapSec() {
			return misses >= FAIL_STALE ? POLL_SLOW : POLL_SEC;
		}

		function startPoll() {
			var want = gapSec();
			if (pollOn && want === pollSec)
				return;
			if (pollOn)
				poll.remove(pollTick);
			poll.add(pollTick, want);
			poll.start();
			pollOn = true;
			pollSec = want;
		}

		function stopPoll() {
			if (!pollOn)
				return;
			pollOn = false;
			pollSec = 0;
			poll.remove(pollTick);
		}

		function logAutoOn() {
			return !!store.get().logAuto;
		}

		function logTick() {
			if (store.get().tab !== 'diag' || !logAutoOn() || pollOn)
				return Promise.resolve();
			return logsRefresh();
		}

		function startLogPoll() {
			if (logOn)
				return;
			poll.add(logTick, LOG_SEC);
			poll.start();
			logOn = true;
		}

		function stopLogPoll() {
			if (!logOn)
				return;
			logOn = false;
			poll.remove(logTick);
		}

		/* ---- 忙碌 ------------------------------------------------------ */
		function setBusy(key, on) {
			var b = Object.assign({}, store.get().busy);
			if (on)
				b[key] = true;
			else
				delete b[key];
			store.patch({ busy: b });
		}

		/* ---- 动作 ------------------------------------------------------ */
		function actRun(btn) {
			if (btn)
				btn.disabled = true;
			setBusy('run', true);
			CFI.ipc.call([ 'run-now' ]).then(function (out) {
				setBusy('run', false);
				if (btn)
					btn.disabled = false;
				if (out === null) {
					flash('bad', T('无法启动'), CFI.sem.why('missing_bin'));
					return;
				}
				/* 挂住不等于没启动：本地先置 running、直接开轮询，让页面追上真实状态。 */
				store.patch({ status: Object.assign({}, store.get().status, {
					state: 'running', started: new Date().toISOString()
				}) });
				startPoll();
			}, function () {
				setBusy('run', false);
				if (btn)
					btn.disabled = false;
			});
		}

		function actStop(btn) {
			if (btn)
				btn.disabled = true;
			setBusy('stop', true);
			CFI.ipc.call([ 'stop' ]).then(function () {
				setBusy('stop', false);
				refresh();
			}, function () {
				setBusy('stop', false);
				if (btn)
					btn.disabled = false;
			});
		}

		function actCheck() {
			setBusy('check', true);
			CFI.ipc.call([ 'check-sources' ]).then(function (out) {
				setBusy('check', false);
				store.patch({ sources: CFI.ipc.parseSources(out) });
			}, function () {
				setBusy('check', false);
				store.patch({ sources: { state: 'unreachable' } });
			});
		}

		function actPool() {
			setBusy('pool', true);
			CFI.ipc.call([ 'pool' ]).then(function (out) {
				setBusy('pool', false);
				var ips = [];
				if (typeof out === 'string')
					ips = out.split(/\r?\n/).filter(function (x) { return x && x.indexOf('.') > 0; });
				store.patch({ pool: out == null ? { state: 'unreachable' } : { state: 'ok', ips: ips } });
			}, function () {
				setBusy('pool', false);
				store.patch({ pool: { state: 'unreachable' } });
			});
		}

		function actDiag() {
			setBusy('diag', true);
			CFI.ipc.call([ 'diag' ]).then(function (out) {
				setBusy('diag', false);
				var data = null;
				if (typeof out === 'string') {
					try { data = JSON.parse(out); } catch (e) { data = null; }
				}
				store.patch({ diag: data ? { state: 'ok', data: data } : { state: 'parse_error' } });
			}, function () {
				setBusy('diag', false);
				store.patch({ diag: { state: 'unreachable' } });
			});
		}

		function logsRefresh() {
			if (store.get().busy.logs)
				return Promise.resolve(null);
			setBusy('logs', true);
			return CFI.ipc.call([ 'logs' ]).then(function (out) {
				setBusy('logs', false);
				var lg = CFI.ipc.parseLog(out);
				store.patch({ logs: lg });
				return lg;
			}, function () {
				setBusy('logs', false);
				store.patch({ logs: { state: 'unreachable' } });
				return null;
			});
		}

		function actCsv() {
			CFI.ipc.call([ 'csv' ]).then(function (out) {
				if (typeof out !== 'string' || !out) {
					flash('warn', T('还没有可以下载的结果'), T('先跑完一轮再下载。'));
					return;
				}
				try {
					var blob = new Blob([ out ], { type: 'text/csv;charset=utf-8' });
					var a = el('a', { href: URL.createObjectURL(blob), download: 'cf-ipcheck.csv' });
					document.body.appendChild(a);
					a.click();
					document.body.removeChild(a);
				} catch (e) {
					flash('bad', T('下载失败'), String(e.message || e));
				}
			}, function () {
				flash('bad', T('下载失败'), T('调不到引擎的 csv 子命令。'));
			});
		}

		function actDns() {
			setBusy('dns', true);
			CFI.ipc.call([ 'dns-sync' ]).then(function (out) {
				setBusy('dns', false);
				var ok = false, msg = '';
				try {
					var o = JSON.parse(out);
					ok = !!o.ok;
					msg = String(o.msg || '');
				} catch (e) {}
				flash(ok ? 'ok' : 'warn', ok ? T('DNS 已更新') : T('DNS 没有写成'), msg || T('看「诊断」里的日志最后一行。'));
			}, function () {
				setBusy('dns', false);
				flash('bad', T('写 DNS 没有回应'), T('先确认 dns_sync 打开且已经保存。'));
			});
		}

		function copyText(text) {
			if (navigator.clipboard && navigator.clipboard.writeText) {
				navigator.clipboard.writeText(text).then(function () {
					flash('ok', T('已复制'), T('%s 条 IP 已在剪贴板里。').format(String(String(text).split('\n').length)));
				}, function () { legacyCopy(text); });
				return;
			}
			legacyCopy(text);
		}

		function legacyCopy(text) {
			try {
				var ta = el('textarea', { value: text });
				ta.style.position = 'fixed';
				ta.style.opacity = '0';
				document.body.appendChild(ta);
				ta.select();
				document.execCommand('copy');
				document.body.removeChild(ta);
				flash('ok', T('已复制'), '');
			} catch (e) {
				flash('bad', T('复制失败'), T('浏览器不允许脚本写剪贴板，换一个浏览器或手动选中。'));
			}
		}

		function actCopy() {
			var st = store.get().status || {};
			var ips = (st.items || []).map(function (it) { return it.ip; }).filter(Boolean);
			copyText(ips.join('\n'));
		}

		function actCopyLogs() {
			var lg = store.get().logs;
			copyText(lg && lg.state === 'ok' ? lg.text : '');
		}

		function flash(tone, title, text) {
			var box = el('div', { class: 'flash ' + tone }, [
				el('b', { text: title }), text ? el('span', { text: text }) : null,
				el('button', { class: 'flash-x', type: 'button', text: '×', on: { click: function () {
					if (box.parentNode)
						box.parentNode.removeChild(box);
				} } })
			]);
			var host = shell && shell.flashHost;
			if (!host)
				return;
			host.appendChild(box);
			if (typeof setTimeout === 'function')
				setTimeout(function () {
					if (box.parentNode)
						box.parentNode.removeChild(box);
				}, 8000);
		}

		/* ---- 外壳 ------------------------------------------------------ */
		function scheduleLine(st) {
			if (st.enabled == null)
				return '';
			if (Number(st.enabled) === 0)
				return T('定时实测：关闭');
			var s = T('定时实测：每 %s 小时').format(st.interval != null ? st.interval : '?');
			if (st.next_run != null && isFinite(Number(st.next_run))) {
				var d = new Date(Number(st.next_run) * 1000);
				s += T('，下一轮约 %s').format(F.pad2(d.getHours()) + ':' + F.pad2(d.getMinutes()));
			}
			return s;
		}

		function currentIp(st) {
			var it = (st.items || [])[0];
			return it && it.ip ? String(it.ip) : F.DASH;
		}

		function build() {
			var root = el('div', { class: 'cfp' });
			var lampT = el('span', { class: 'lamp-t' });
			var lamp = el('span', { class: 'lamp' }, [ el('i', { class: 'dot', 'aria-hidden': 'true' }), lampT ]);
			var ip = el('span', { class: 'rail-ip mono', text: F.DASH });
			var sched = el('span', { class: 'rail-note' });
			var buildTag = el('span', { class: 'build mono', text: VIEW_BUILD });
			var btnRun = CFI.ui.Button({ kind: 'primary', icon: 'play', label: T('立即测速'), onClick: function () { actRun(btnRun.node); } });
			var btnStop = CFI.ui.Button({ kind: 'danger', icon: 'stop', label: T('停止'), hidden: true, onClick: function () { actStop(btnStop.node); } });
			var btnRefresh = CFI.ui.Button({ kind: 'quiet', icon: 'refresh', label: T('刷新'), onClick: function () { refresh(true); } });
			var rail = el('header', { class: 'rail' }, [
				el('div', { class: 'rail-main' }, [ lamp, ip, sched ]),
				el('div', { class: 'rail-acts' }, [ btnRun.node, btnStop.node, btnRefresh.node, buildTag ])
			]);

			var flashHost = el('div', { class: 'flashes', role: 'status' });
			var tabs = CFI.ui.Tabs([
				{ id: 'run', label: T('运行') },
				{ id: 'diag', label: T('诊断') },
				{ id: 'set', label: T('设置') }
			], 'run', function (z) { goto(z); });

			var runPane = CFI.panels.run.mount({
				gotoDiag: function () { goto('diag'); },
				gotoSet: function () { goto('set'); },
				copy: actCopy, csv: actCsv, dns: actDns
			});
			var diagPane = CFI.panels.diag.mount({
				check: actCheck, pool: actPool, diag: actDiag,
				logs: logsRefresh, logAuto: function () {
					var on = !store.get().logAuto;
					store.patch({ logAuto: on });
					CFI.prefs.set(CFI.prefs.NS + 'diag.auto', on ? '1' : '0');
					if (on && store.get().tab === 'diag')
						startLogPoll();
					else
						stopLogPoll();
				},
				logFull: function () { store.patch({ logFull: !store.get().logFull }); },
				copyLogs: actCopyLogs
			});
			var setPane = CFI.panels.set.mount({
				gotoDiag: function () { goto('diag'); }
			});

			var panes = {
				run: el('section', { class: 'pane on', id: 'cfi-pane-run', role: 'tabpanel', 'aria-labelledby': 'cfi-zone-run' }, runPane.node),
				diag: el('section', { class: 'pane', id: 'cfi-pane-diag', role: 'tabpanel', 'aria-labelledby': 'cfi-zone-diag' }, diagPane.node),
				set: el('section', { class: 'pane', id: 'cfi-pane-set', role: 'tabpanel', 'aria-labelledby': 'cfi-zone-set' }, setPane.node)
			};

			root.appendChild(rail);
			root.appendChild(flashHost);
			root.appendChild(tabs.node);
			root.appendChild(panes.run);
			root.appendChild(panes.diag);
			root.appendChild(panes.set);

			shell = { root: root, flashHost: flashHost, tabs: tabs, panes: panes };

			function paint(state) {
				var st = state.status || {};
				var busy = state.busy || {};
				var tone = CFI.sem.tone(st);
				lamp.className = 'lamp t-' + tone;
				lampT.textContent = CFI.sem.stateWord(st);
				ip.textContent = currentIp(st);
				sched.textContent = scheduleLine(st);
				var running = st.state === 'running';
				btnRun.node.hidden = running;
				btnStop.node.hidden = !running;
				btnRun.update({ disabled: !!busy.run });
				btnStop.update({ disabled: !!busy.stop });
				btnRefresh.update({ disabled: !!busy.refresh, busy: !!busy.refresh });
				runPane.update(state);
				diagPane.update(state);
				setPane.update(state);
			}

			store.subscribe(paint);
			paint(store.get());

			/* 配置表单异步渲染；失败不吞：整页仍可用，只报一句。 */
			try {
				setPane.render().then(function () {
					store.patch({});
				}, function () {
					flash('bad', T('配置表单没渲染出来'), T('页面其它部分仍可用；先看「诊断」里的日志。'));
				});
			} catch (e) {
				flash('bad', T('配置表单没渲染出来'), String(e.message || e));
			}

			return shell;
		}

		function goto(zone, persist) {
			var z = CFI.nav.alias[zone] || 'run';
			store.patch({ tab: z });
			if (shell) {
				CFI.nav.ZONES.forEach(function (id) {
					var on = id === z;
					shell.panes[id].className = 'pane' + (on ? ' on' : '');
				});
				shell.tabs.select(z);
			}
			if (persist !== false) {
				CFI.nav.writeHash(z);
				CFI.prefs.rememberZone(z);
			}
			if (z === 'diag' && store.get().logAuto)
				startLogPoll();
			else
				stopLogPoll();
		}

		function destroy() {
			stopPoll();
			stopLogPoll();
			inflight = null;
			shell = null;
		}

		return {
			store: store,
			refresh: refresh,
			startPoll: startPoll,
			stopPoll: stopPoll,
			logsRefresh: logsRefresh,
			goto: goto,
			destroy: destroy,
			build: build,
			actRun: actRun,
			actStop: actStop,
			actCheck: actCheck,
			actPool: actPool,
			actDiag: actDiag,
			flash: flash
		};
	}

	CFI.shell = { create: create, consts: { POLL_SEC: POLL_SEC, POLL_SLOW: POLL_SLOW, LOG_SEC: LOG_SEC } };
})(CFI);
