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
			logs: null,
			logFull: false,
			logAuto: CFI.prefs.get(CFI.prefs.NS + 'logs.auto', '1') !== '0',
			logPaused: CFI.prefs.getBool(CFI.prefs.NS + 'logs.paused', false),
			srcPending: 0
		});
		var inflight = null;
		var epoch = 0;
		var applied = 0;
		var misses = 0;
		var lastGood = 0;
		var pollOn = false;
		var pollSec = 0;
		var logOn = false;
		var busyTick = false;
		var shell = null;
		var closed = false;

		/* ---- 状态读取 -------------------------------------------------- */
		function afterMiss(prev, hung, manual) {
			if (!manual)
				misses++;
			var now = Date.now();
			if (misses >= FAIL_GIVEUP) {
				var secs = lastGood ? Math.max(1, Math.round((now - lastGood) / 1000)) : null;
				return Object.assign({}, prev, {
					state: 'unreachable', reason: hung ? 'hung' : null,
					staleFor: secs, gaveUp: 1
				});
			}
			if (misses >= FAIL_STALE) {
				var s = lastGood ? Math.max(1, Math.round((now - lastGood) / 1000)) : 1;
				return Object.assign({}, prev, { staleFor: s });
			}
			return Object.assign({}, prev);
		}

		function refresh(manual) {
			if (closed)
				return Promise.resolve(null);
			if (inflight)
				return inflight;
			var wasRunning = (store.get().status || {}).state === 'running';
			if (manual)
				store.setBusy('refresh', true);
			var my = ++epoch;
			inflight = CFI.ipc.call([ 'status' ], wasRunning || pollOn ? CFI.ipc.LIMIT.status_running : 0).then(function (out) {
				inflight = null;
				if (closed)
					return store.get().status;
				if (out === CFI.ipc.HUNG || out === null || out === undefined) {
					var miss = afterMiss(store.get().status || {}, out === CFI.ipc.HUNG, !!manual);
					store.tx(function () {
						store.patch({ status: miss });
						store.setBusy('refresh', false);
					});
					startPoll();
					return miss;
				}
				if (my < applied)
					return store.get().status;
				applied = my;
				misses = 0;
				lastGood = Date.now();
				var st = CFI.ipc.parseStatus(out);
				store.tx(function () {
					store.patch({ status: st });
					store.setBusy('refresh', false);
				});
				if (st.state === 'running')
					startPoll();
				else
					stopPoll();
				return st;
			}, function () {
				inflight = null;
				if (!closed)
					store.setBusy('refresh', false);
				return store.get().status;
			});
			return inflight;
		}

		function pollTick() {
			try {
				if (shouldPollLogs())
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
			if (closed)
				return;
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

		function shouldPollLogs() {
			return !!store.get().logAuto && !store.get().logPaused && store.get().tab === 'logs';
		}

		function logTick() {
			if (closed || !shouldPollLogs())
				return Promise.resolve();
			return logsRefresh();
		}

		function startLogPoll() {
			if (logOn || closed)
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

		/* 长时间任务（检测/候选池/诊断/DNS）在按钮上显示已等秒数：
		 * 用 L.poll 每秒敲一下 store，不用 setInterval（lint 红线）。 */
		function syncBusyTicker() {
			var b = store.get().busy || {};
			var need = !!(b.check || b.pool || b.dns);
			if (need && !busyTick) {
				poll.add(busyPulse, 1);
				poll.start();
				busyTick = true;
			} else if (!need && busyTick) {
				busyTick = false;
				poll.remove(busyPulse);
			}
		}

		function busyPulse() {
			if (closed)
				return;
			store.patch({ busyTick: Date.now() });
		}

		/* ---- 动作 ------------------------------------------------------ */
		/* 统一忙碌语义：置位（含开始时间）→ 跑 promise → settle 清除。
		 * 每个动作都在调用点写死方法名（lint 红线 8 按字面量核对引擎分派表）。 */
		function act(key, limit, thunk, okFn, failFn) {
			store.setBusy(key, true, { at: Date.now(), limit: limit || 0 });
			syncBusyTicker();
			return thunk().then(function (out) {
				if (closed) return out;
				store.setBusy(key, false);
				syncBusyTicker();
				if (okFn) okFn(out);
				return out;
			}, function (e) {
				if (!closed) {
					store.setBusy(key, false);
					syncBusyTicker();
				}
				if (failFn) failFn(e);
				return null;
			});
		}

		function actRun() {
			store.setBusy('run', true);
			CFI.ipc.call([ 'run-now' ]).then(function (out) {
				if (closed) return;
				store.setBusy('run', false);
				if (out === null) {
					flash('bad', CFI.T('无法启动'), CFI.sem.why('missing_bin'));
					return;
				}
				/* 挂住不等于没启动：本地先置 running，直接轮询，让页面追上真实状态 */
				store.patch({ status: Object.assign({}, store.get().status, {
					state: 'running', started: new Date().toISOString()
				}) });
				startPoll();
			}, function () {
				if (!closed) store.setBusy('run', false);
			});
		}

		function actStop() {
			act('stop', CFI.ipc.LIMIT.stop, function () { return CFI.ipc.call([ 'stop' ]); }, function () { refresh(); });
		}

		function actCheck() {
			act('check', CFI.ipc.LIMIT['check-sources'], function () { return CFI.ipc.call([ 'check-sources' ]); }, function (out) {
				store.patch({ sources: CFI.ipc.parseSources(out) });
			}, function () {
				store.patch({ sources: { state: 'unreachable' } });
			});
		}

		function actCheckOne(index) {
			var n = Number(index);
			if (!isFinite(n) || n < 1)
				return Promise.resolve({ error: 'bad_index' });
			/* ubus 把 index 声明成字符串：递 number 会在 rpcd 入口直接 Invalid argument。 */
			return CFI.ipc.call([ 'check-source', String(n) ]).then(function (out) {
				if (out === CFI.ipc.HUNG)
					return { error: 'hung' };
				if (out === null || out === undefined)
					return { error: 'unreachable' };
				try {
					var o = JSON.parse(out);
					return (o && typeof o === 'object') ? o : { error: 'parse_error' };
				} catch (e) {
					return { error: 'parse_error' };
				}
			}, function () {
				return { error: 'unreachable' };
			});
		}

		function actPool() {
			act('pool', CFI.ipc.LIMIT.pool, function () { return CFI.ipc.call([ 'pool' ]); }, function (out) {
				var ips = [];
				if (typeof out === 'string')
					ips = out.split(/\r?\n/).filter(function (x) { return x && x.indexOf('.') > 0; });
				store.patch({ pool: out == null ? { state: 'unreachable' } : { state: 'ok', ips: ips } });
			}, function () {
				store.patch({ pool: { state: 'unreachable' } });
			});
		}

		/* 单 IP 复测：页面只拿结果，不碰 store；整轮在跑时直接拒绝，
		 * 避免两路同时抢带宽把结果测歪（引擎侧也会再挡一次）。 */
		function actTestIp(ip, mode) {
			var okIp = /^\d{1,3}(\.\d{1,3}){3}$/.test(String(ip || ''));
			if (!okIp || (mode !== 'delay' && mode !== 'speed'))
				return Promise.resolve({ ok: false, error: 'invalid_ip' });
			if ((store.get().status || {}).state === 'running')
				return Promise.resolve({ ok: false, error: 'running' });
			return CFI.ipc.call([ 'test-ip', ip, mode ]).then(function (out) {
				if (out === CFI.ipc.HUNG)
					return { ok: false, error: 'hung' };
				if (out === null || out === undefined)
					return { ok: false, error: 'unreachable' };
				try {
					var o = JSON.parse(out);
					return (o && typeof o === 'object') ? o : { ok: false, error: 'parse_error' };
				} catch (e) {
					return { ok: false, error: 'parse_error' };
				}
			}, function () {
				return { ok: false, error: 'unreachable' };
			});
		}

		function logsRefresh() {
			if (closed || store.get().busy.logs)
				return Promise.resolve(null);
			store.setBusy('logs', true);
			return CFI.ipc.call([ 'logs' ]).then(function (out) {
				if (closed) return null;
				var lg = CFI.ipc.parseLog(out);
				store.tx(function () {
					store.patch({ logs: lg });
					store.setBusy('logs', false);
				});
				return lg;
			}, function () {
				if (!closed) {
					store.tx(function () {
						store.patch({ logs: { state: 'unreachable' } });
						store.setBusy('logs', false);
					});
				}
				return null;
			});
		}

		function actDns() {
			act('dns', CFI.ipc.LIMIT['dns-sync'], function () { return CFI.ipc.call([ 'dns-sync' ]); }, function (out) {
				var ok = false, msg = '';
				try { var o = JSON.parse(out); ok = !!o.ok; msg = String(o.msg || ''); } catch (e) {}
				flash(ok ? 'ok' : 'warn', ok ? CFI.T('DNS 已更新') : CFI.T('DNS 没有写成'), msg || CFI.T('看「日志」里的最后一行。'));
			}, function () {
				flash('bad', CFI.T('写 DNS 没有回应'), CFI.T('先确认 dns_sync 打开且已经保存。'));
			});
		}

		function actCsv() {
			store.setBusy('csv', true);
			CFI.ipc.call([ 'csv' ]).then(function (out) {
				store.setBusy('csv', false);
				if (typeof out !== 'string' || !out) {
					flash('warn', CFI.T('还没有可以下载的结果'), CFI.T('先跑完一轮再下载。'));
					return;
				}
				try {
					var blob = new Blob([ out ], { type: 'text/csv;charset=utf-8' });
					var a = el('a', { href: URL.createObjectURL(blob), download: 'cf-ipcheck.csv' });
					document.body.appendChild(a);
					a.click();
					document.body.removeChild(a);
				} catch (e) {
					flash('bad', CFI.T('下载失败'), String(e.message || e));
				}
			}, function () {
				if (!closed) store.setBusy('csv', false);
				flash('bad', CFI.T('下载失败'), CFI.T('调不到引擎的 csv 子命令。'));
			});
		}

		function copyText(text) {
			if (!text)
				return;
			if (navigator.clipboard && navigator.clipboard.writeText) {
				navigator.clipboard.writeText(text).then(function () {
					flash('ok', CFI.T('已复制'), CFI.T('%s 行已在剪贴板里。').format(String(String(text).split('\n').length)));
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
				flash('ok', CFI.T('已复制'), '');
			} catch (e) {
				flash('bad', CFI.T('复制失败'), CFI.T('浏览器不允许脚本写剪贴板，换一个浏览器或手动选中。'));
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
			try {
				if (typeof ui !== 'undefined' && ui && typeof ui.addTimeLimitedNotification === 'function') {
					var kids = text ? [ el('p', { text: text }) ] : [];
					ui.addTimeLimitedNotification(title, kids, 6000);
					return;
				}
			} catch (e) {}
			var box = el('div', { class: 'flash ' + tone }, [
				el('b', { text: title }), text ? el('span', { text: text }) : null,
				el('button', { class: 'flash-x', type: 'button', text: '×', 'aria-label': CFI.T('关闭提示'), on: { click: function () {
					if (box.parentNode) box.parentNode.removeChild(box);
				} } })
			]);
			var host = shell && shell.flashHost;
			if (!host)
				return;
			host.appendChild(box);
			if (typeof setTimeout === 'function')
				setTimeout(function () {
					if (box.parentNode) box.parentNode.removeChild(box);
				}, 8000);
		}

		/* ---- 外壳 ------------------------------------------------------ */
		function scheduleLine(st) {
			if (st.enabled == null)
				return '';
			if (Number(st.enabled) === 0)
				return CFI.T('定时实测：关闭');
			var s = CFI.T('定时实测：每 %s 小时').format(st.interval != null ? st.interval : '?');
			if (st.next_run != null && isFinite(Number(st.next_run))) {
				var d = new Date(Number(st.next_run) * 1000);
				s += CFI.T('，下一轮约 %s').format(F.pad2(d.getHours()) + ':' + F.pad2(d.getMinutes()));
			}
			return s;
		}

		function build() {
			var root = el('div', { class: 'cfp' });
			var btnRun = CFI.ui.Button({ kind: 'primary', icon: 'play', label: CFI.T('立即测速'), onClick: actRun });
			var btnStop = CFI.ui.Button({ kind: 'danger', icon: 'stop', label: CFI.T('停止'), hidden: true, onClick: actStop });
			var btnRefresh = CFI.ui.Button({ kind: 'quiet', icon: 'refresh', label: CFI.T('刷新'), onClick: function () { refresh(true); } });

			var headWord = el('span', { class: 'cfp-chip-t' });
			var headChip = el('span', { class: 'cfp-chip' }, [ el('i', { class: 'dot', 'aria-hidden': 'true' }), headWord ]);
			var headSub = el('p', { class: 'cfp-sub' });
			var head = el('header', { class: 'cfp-head' }, [
				el('div', { class: 'cfp-title' }, [
					el('h1', { text: CFI.T('Cloudflare IP 优选') }),
					headSub
				]),
				el('div', { class: 'cfp-head-acts' }, [
					headChip,
					btnRefresh.node, btnRun.node, btnStop.node
				])
			]);
			var flashHost = el('div', { class: 'flashes', role: 'status', 'aria-live': 'polite' });
			var tabs = CFI.ui.Tabs([
				{ id: 'run', label: CFI.T('运行') },
				{ id: 'diag', label: CFI.T('诊断') },
				{ id: 'logs', label: CFI.T('日志') },
				{ id: 'set', label: CFI.T('设置') }
			], 'run', function (z) { goto(z); });

			var drawer = CFI.ui.Modal({ onClose: function () {
				if (runPane && runPane.onDrawerClosed)
					runPane.onDrawerClosed();
				if (store.get().tab)
					CFI.nav.writeRoute(store.get().tab, '', '', false);
			} });

			var runPane = CFI.panels.run.mount({
				gotoDiag: function () { goto('diag'); },
				gotoLogs: function () { goto('logs'); },
				gotoSet: function () { goto('set'); },
				run: actRun,
				stop: actStop,
				refresh: function () { refresh(true); },
				copy: actCopy, csv: actCsv, dns: actDns, copyText: copyText,
				testIp: actTestIp,
				onSelect: function (ip) {
					if (ip)
						CFI.nav.writeRoute('run', 'ip', ip, true);
					else
						CFI.nav.writeRoute(store.get().tab || 'run', '', '', false);
				}
			}, drawer);
			var diagPane = CFI.panels.diag.mount({
				check: actCheck, checkOne: actCheckOne, pool: actPool,
				gotoRun: function () { goto('run'); }
			});
			var logsPane = CFI.panels.logs.mount({
				logs: logsRefresh,
				copyLogs: actCopyLogs,
				logAuto: function () {
					var on = !store.get().logAuto;
					store.patch({ logAuto: on });
					CFI.prefs.set(CFI.prefs.NS + 'logs.auto', on ? '1' : '0');
					if (on && shouldPollLogs())
						startLogPoll();
					else
						stopLogPoll();
				},
				logFull: function () { store.patch({ logFull: !store.get().logFull }); },
				logPause: function (on) {
					store.patch({ logPaused: !!on });
					if (shouldPollLogs())
						startLogPoll();
					else
						stopLogPoll();
				}
			});
			var setPane = CFI.panels.set.mount({
				getSources: function () {
					var s = store.get().sources;
					return s && s.state === 'ok' ? s.rows : [];
				},
				setSrcPending: function (n) {
					if (n !== store.get().srcPending)
						store.patch({ srcPending: n });
				}
			});

			var panes = {
				run: el('section', { class: 'pane on', id: 'cfi-pane-run', role: 'tabpanel', 'aria-labelledby': 'cfi-zone-run' }, runPane.node),
				diag: el('section', { class: 'pane', id: 'cfi-pane-diag', role: 'tabpanel', 'aria-labelledby': 'cfi-zone-diag' }, diagPane.node),
				logs: el('section', { class: 'pane', id: 'cfi-pane-logs', role: 'tabpanel', 'aria-labelledby': 'cfi-zone-logs' }, logsPane.node),
				set: el('section', { class: 'pane', id: 'cfi-pane-set', role: 'tabpanel', 'aria-labelledby': 'cfi-zone-set' }, setPane.node)
			};

			root.appendChild(head);
			root.appendChild(flashHost);
			root.appendChild(tabs.node);
			root.appendChild(panes.run);
			root.appendChild(panes.diag);
			root.appendChild(panes.logs);
			root.appendChild(panes.set);

			shell = {
				root: root, flashHost: flashHost, tabs: tabs, panes: panes,
				drawer: drawer, diagPane: diagPane, logsPane: logsPane, setPane: setPane, runPane: runPane
			};

			store.select(function (s) {
				return CFI.store.headerKey((s.status || {}), s.busy || {});
			}, function (s) {
				var st = s.status || {}, busy = s.busy || {};
				headWord.textContent = CFI.sem.stateWord(st);
				headChip.className = 'cfp-chip t-' + CFI.sem.tone(st);
				var line = scheduleLine(st);
				if (st.finished || st.started)
					line += (line ? ' · ' : '') + CFI.T('上次 %s %s').format(F.ago(st.finished || st.started), F.clock(st.finished || st.started));
				headSub.textContent = line;
				var running = st.state === 'running';
				btnRun.node.hidden = running;
				btnStop.node.hidden = !running;
				btnRun.update({ disabled: !!busy.run, busy: !!busy.run });
				btnStop.update({ disabled: !!busy.stop, busy: !!busy.stop });
				btnRefresh.update({ disabled: !!busy.refresh, busy: !!busy.refresh });
			});

			store.select(function (s) {
				var st = s.status || {};
				return [ CFI.store.roundKey(st), CFI.store.stageKey(st),
					CFI.store.boardKey(st), CFI.store.dcKey(st),
					CFI.store.footKey(st, s.busy || {}) ].join('##');
			}, function (s) { runPane.update(s); });

			store.select(function (s) {
				var st = s.status || {};
				return [ CFI.store.diagKey(s), CFI.store.roundKey(st),
					JSON.stringify(s.pool || null),
					JSON.stringify(s.busy || {}), s.busyTick || 0, Math.floor(Date.now() / 5000) ].join('##');
			}, function (s) { diagPane.update(s); });

			store.select(function (s) {
				return [ CFI.store.logsKey(s, {
						logFull: s.logFull, logPaused: s.logPaused, logAuto: s.logAuto
					}), (s.busy || {}).logs ? 1 : 0 ].join('##');
			}, function (s) { logsPane.update(s); });

			store.select(function (s) { return CFI.store.setKey(s); }, function (s) { setPane.update(s); });

			/* 配置表单异步渲染；失败不吞：整页仍可用，只报一句。 */
			try {
				setPane.render().then(function () {
					/* 订阅回调在挂载前就跑了（mapnode 还是 null）：渲染完补一次 update，
					 * 否则 DNS 编辑器与「未生效条数」永远不会出现。 */
					setPane.update(store.get());
					/* 源清单编辑搬到诊断页：CBI 源 section 留在设置 Map 里（保存链路不变），
					 * 只隐藏 DOM，并把隐藏字段交给诊断页的自定义编辑器同步。 */
					var srcSec = shell.panes.set.querySelector('.cbi-section[data-group="sources"]');
					if (srcSec) {
						srcSec.classList.add('cfp-src-off');
						shell.diagPane.setSourceEditor(srcSec);
					}
					scrollSetGroup();
					store.patch({});
				}, function () {
					flash('bad', CFI.T('配置表单没渲染出来'), CFI.T('页面其它部分仍可用；先看「日志」里的记录。'));
				});
			} catch (e) {
				flash('bad', CFI.T('配置表单没渲染出来'), String(e.message || e));
			}

			return shell;
		}

		var pendingGroup = '';

		function scrollSetGroup() {
			if (!pendingGroup || !shell || store.get().tab !== 'set')
				return;
			if (shell.setPane && shell.setPane.expandGroup && shell.setPane.expandGroup(pendingGroup))
				return;
			var box = shell.panes.set.querySelector('.cbi-section[data-group="' + pendingGroup + '"]');
			if (box && box.scrollIntoView)
				box.scrollIntoView({ block: 'start' });
		}

		function goto(zone, sub, arg, persist) {
			/* 旧深链 #/cfi/diag/logs → 独立日志页 */
			if (zone === 'diag' && sub === 'logs') {
				zone = 'logs';
				sub = '';
			}
			var z = CFI.nav.ZONES.indexOf(zone) >= 0 ? zone : 'run';
			var switched = store.get().tab !== z;
			store.patch({ tab: z });
			if (shell) {
				CFI.nav.ZONES.forEach(function (id) {
					shell.panes[id].className = 'pane' + (id === z ? ' on' : '');
				});
				shell.tabs.select(z);
				if (shell.drawer && shell.drawer.isOpen())
					shell.drawer.close();
			}
			if (switched) {
				/* Argon 的滚动容器不一定是 window：把祖先链上的 scrollTop 一起归零 */
				try {
					window.scrollTo(0, 0);
					var n = shell && shell.root;
					while (n) {
						if (n.scrollTop)
							n.scrollTop = 0;
						n = n.parentNode;
					}
				} catch (e) {}
			}
			if (persist !== false) {
				CFI.nav.writeRoute(z, sub || '', arg || '', false);
				CFI.prefs.rememberZone(z);
			}
			if (z === 'logs') {
				/* 首次进来日志还没取过：立刻拉一次，不等 4 秒后的轮询 */
				if (!store.get().logs)
					logsRefresh();
				if (shell && shell.logsPane && shell.logsPane.reveal)
					shell.logsPane.reveal();
				if (shouldPollLogs())
					startLogPoll();
				else
					stopLogPoll();
			} else {
				stopLogPoll();
			}
			if (z === 'set') {
				pendingGroup = sub || '';
				scrollSetGroup();
			} else {
				pendingGroup = '';
			}
			/* 深链 #/cfi/run/ip/<ip>：开抽屉，但不改写 URL */
			if (z === 'run' && sub === 'ip' && arg && shell && shell.runPane.select)
				shell.runPane.select(arg);
		}

		function destroy() {
			closed = true;
			stopPoll();
			stopLogPoll();
			if (busyTick) {
				busyTick = false;
				poll.remove(busyPulse);
			}
			if (shell && shell.drawer)
				shell.drawer.destroy();
			store.destroy();
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
			flash: flash,
			consts: { POLL_SEC: POLL_SEC, POLL_SLOW: POLL_SLOW, LOG_SEC: LOG_SEC }
		};
	}

	CFI.shell = { create: create, consts: { POLL_SEC: POLL_SEC, POLL_SLOW: POLL_SLOW, LOG_SEC: LOG_SEC } };
})(CFI);
