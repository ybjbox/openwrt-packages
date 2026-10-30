(function (CFI) {
	'use strict';

	var el = CFI.dom.el;
	var F = CFI.fmt;

	var STAGE_LABEL = {
		fetch: CFI.T('拉取社区源'),
		canary: CFI.T('出口自检'),
		probe: CFI.T('探测候选'),
		verify: CFI.T('多样本验证'),
		colo: CFI.T('识别机房'),
		speed: CFI.T('测吞吐'),
		publish: CFI.T('写产物')
	};

	function srcMessage(src) {
		switch (src && src.state) {
			case 'unreachable':
				return CFI.T('调不到 luci.cf-ipcheck 的 check_sources：包没装好，或 rpcd 还拿着旧的 ACL 缓存（重启 rpcd 后重试）。');
			case 'hung':
				return CFI.T('检测没有回应：可能是某条源太慢。先看日志最后几行，再点一次。');
			case 'empty':
				return CFI.T('引擎没有返回任何源：去「设置」把源清单填上并保存。');
			case 'parse_error':
				return CFI.T('引擎输出不是合法 JSON。把日志最后几行原样贴出来排查。');
			default:
				return '';
		}
	}

	function mount(actions) {
		var bui = { logFilter: CFI.prefs.get(CFI.prefs.NS + 'logs.filter', 'all') };
		var last = { trace: '', src: '', pool: '', diag: '', logs: '', busy: '' };
		var logView = CFI.ui.LogView({ cap: 600 });
		logView.setFilter(bui.logFilter);
		logView.setFollow(CFI.prefs.getBool(CFI.prefs.NS + 'logs.follow', true));
		var pausedNote = el('p', { class: 'log-paused', hidden: true },
			CFI.T('已暂停：不再自动拉取。点「继续」恢复；下面这份是暂停前的最后一份。'));

		var traceHost = el('div', { class: 'trace' });

		var btnCheck = CFI.ui.Button({ kind: 'primary', icon: 'probe', label: CFI.T('检测源可用性'), onClick: actions.check });
		var btnPool = CFI.ui.Button({ kind: 'quiet', label: CFI.T('预览候选池'), onClick: actions.pool });
		var srcTable = CFI.ui.Table({
			cols: [
				{ h: CFI.T('源地址'), cls: 'l' }, { h: CFI.T('HTTP'), cls: 'r' },
				{ h: CFI.T('段内'), cls: 'r' }, { h: CFI.T('IP'), cls: 'r' }
			],
			caption: CFI.T('源可用性'),
			keyOf: function (r, i) { return r.url || ('#' + i); },
			rowSig: function (r) { return [ r.url, r.http, r.rc, r.ips, r.cf_in ].join(','); },
			cell: function (r) {
				var pct = r.ips ? Math.round(100 * (Number(r.cf_in) || 0) / Number(r.ips)) : null;
				return [
					el('span', { class: 'url', title: r.url || '', text: String(r.url || '') }),
					el('span', { class: 'n', text: r.http ? String(r.http) : F.DASH }),
					el('span', { class: 'n', text: pct == null ? F.DASH : pct + '%' }),
					el('span', { class: 'n', text: F.num(r.ips) })
				];
			}
		});
		/* Table.cell 返回数组时包一层 */
		var srcTableNode = (function () {
			var wrap = el('div');
			wrap.appendChild(srcTable.node);
			return wrap;
		})();
		var pendingHost = el('div', { class: 'pending' });
		var poolHost = el('div', { class: 'pool-result' });

		var btnDiag = CFI.ui.Button({ kind: 'quiet', label: CFI.T('取诊断'), onClick: actions.diag });
		var diagTable = CFI.ui.Table({
			cols: [ { h: CFI.T('项'), cls: 'l' }, { h: CFI.T('值'), cls: 'l' } ],
			caption: CFI.T('诊断快照'),
			keyOf: function (r) { return r[0]; },
			rowSig: function (r) { return String(r[1]); },
			cell: function (r) {
				return [ el('span', { class: 'mono', text: String(r[0]) }), el('span', { class: 'mono', text: String(r[1]) }) ];
			}
		});
		var diagHost = el('div');
		diagHost.appendChild(diagTable.node);
		var diagPending = el('p', { class: 'note' },
			CFI.T('还没取过。点「取诊断」拿一份当前状态快照（不改配置）。'));

		var autoBtn = CFI.ui.Button({ kind: 'link', label: CFI.T('自动刷新：开'), onClick: actions.logAuto });
		var fullBtn = CFI.ui.Button({ kind: 'link', label: CFI.T('只看时刻'), onClick: actions.logFull });
		var followBtn = CFI.ui.Button({ kind: 'link', label: CFI.T('跟随最新：开'), onClick: function () {
			var on = !CFI.prefs.getBool(CFI.prefs.NS + 'logs.follow', true);
			CFI.prefs.set(CFI.prefs.NS + 'logs.follow', on ? '1' : '0');
			logView.setFollow(on);
			followBtn.update({ label: on ? CFI.T('跟随最新：开') : CFI.T('跟随最新：关') });
		} });
		var pauseBtn = CFI.ui.Button({ kind: 'link', label: CFI.T('暂停'), onClick: function () {
			var on = !CFI.prefs.getBool(CFI.prefs.NS + 'logs.paused', false);
			CFI.prefs.set(CFI.prefs.NS + 'logs.paused', on ? '1' : '0');
			if (actions.logPause)
				actions.logPause(on);
		} });
		var refreshBtn = CFI.ui.Button({ kind: 'link', label: CFI.T('立即刷新'), onClick: actions.logs });
		var copyBtn = CFI.ui.Button({ kind: 'link', label: CFI.T('复制全部'), onClick: actions.copyLogs });
		var filterSel = el('select', { class: 'ctl small', 'aria-label': CFI.T('日志过滤') }, [
			el('option', { value: 'all', text: CFI.T('全部') }),
			el('option', { value: 'warn', text: CFI.T('提醒以上') }),
			el('option', { value: 'bad', text: CFI.T('只看错误') })
		]);
		filterSel.value = bui.logFilter;
		filterSel.addEventListener('change', function () {
			bui.logFilter = filterSel.value;
			CFI.prefs.set(CFI.prefs.NS + 'logs.filter', bui.logFilter);
			logView.setFilter(bui.logFilter);
		});

		var logDetails = el('details', { class: 'cbi-section cfp-log' });
		if (CFI.prefs.get(CFI.prefs.NS + 'logs.open', '0') === '1')
			logDetails.open = true;
		logDetails.appendChild(el('summary', {}, [
			el('h3', { text: CFI.T('日志') }),
			el('span', { class: 'cfp-hint dim', text: CFI.T('引擎写的过程记录；出问题先看这里') })
		]));
		logDetails.appendChild(el('div', { class: 'cfp-log-body' }, [
			el('div', { class: 'log-bar' }, [ autoBtn.node, fullBtn.node, pauseBtn.node, followBtn.node, refreshBtn.node, copyBtn.node, filterSel ]),
			pausedNote,
			logView.node
		]));
		logDetails.addEventListener('toggle', function () {
			CFI.prefs.set(CFI.prefs.NS + 'logs.open', logDetails.open ? '1' : '0');
			if (actions.logToggle)
				actions.logToggle(logDetails.open);
		});

		var body = el('div', { class: 'diag-body' }, [
			traceHost,
			el('section', { class: 'cbi-section' }, [
				el('div', { class: 'cfp-sec-h' }, [
					el('h3', { text: CFI.T('源与候选') }),
					el('div', { class: 'cfp-sec-a' }, [ btnCheck.node, btnPool.node ])
				]),
				pendingHost,
				srcTableNode,
				poolHost
			]),
			el('section', { class: 'cbi-section' }, [
				el('div', { class: 'cfp-sec-h' }, [
					el('h3', { text: CFI.T('诊断快照') }),
					el('div', { class: 'cfp-sec-a' }, btnDiag.node)
				]),
				diagPending,
				diagHost
			]),
			logDetails
		]);

		function paintTrace(st) {
			var fail = 0;
			var parts = [];
			if (st.counts) {
				for (var k in st.counts) {
					if (!Object.prototype.hasOwnProperty.call(st.counts, k) || k === 'none')
						continue;
					if (st.counts[k]) {
						fail += Number(st.counts[k]) || 0;
						parts.push(CFI.sem.errKindName(k) + ' ' + st.counts[k]);
					}
				}
			}
			CFI.dom.clear(traceHost);
			var tone = CFI.sem.tone(st) || 'idle';
			var stage = '';
			if (st.state === 'running' && st.stage)
				stage = (STAGE_LABEL[st.stage] || st.stage) +
					(st.stage_total ? ' ' + (st.stage_done || 0) + '/' + st.stage_total : '');
			var kids = [
				el('b', { text: CFI.sem.stateWord(st) }),
				stage ? el('span', { class: 'mono dim', text: stage }) : null,
				el('span', { class: 'dim', text: st.finished ? F.ago(st.finished) + ' · ' + F.clock(st.finished) : '' }),
				fail ? el('span', { class: 'warn', text: CFI.T('失败 %s：%s').format(String(fail), parts.join(' · ')) }) : null,
				st.intercepted == 1 ? el('span', { class: 'warn', text: CFI.T('出口被接管') }) : null
			];
			if (actions.gotoRun && (st.items || []).length)
				kids.push(CFI.ui.Button({ kind: 'link', label: CFI.T('回运行看榜单'), onClick: actions.gotoRun }).node);
			traceHost.appendChild(el('div', { class: 'trace-line t-' + tone }, kids));
		}

		function paintSources(state) {
			var src = state.sources;
			var st = state.status || {};
			CFI.dom.clear(pendingHost);
			if (!src) {
				CFI.dom.clear(pendingHost);
				pendingHost.appendChild(el('p', { class: 'note' }, CFI.T('还没检测过。点「检测源可用性」逐条实拉一次。')));
				srcTable.update({ rows: [] });
				srcTableNode.hidden = true;
				return;
			}
			if (src.state === 'ok') {
				srcTable.update({ rows: src.rows || [] });
				srcTableNode.hidden = !(src.rows || []).length;
				var pending = state.srcPending || 0;
				if (pending > 0) {
					pendingHost.appendChild(el('p', { class: 'note warn' },
						CFI.T('编辑框里有 %s 条还没生效：先保存并应用，检测读的才是新清单。').format(String(pending))));
					if (actions.gotoSrc)
						pendingHost.appendChild(CFI.ui.Button({
							kind: 'link', label: CFI.T('去改源清单'),
							onClick: actions.gotoSrc
						}).node);
				}
			} else {
				srcTable.update({ rows: [] });
				srcTableNode.hidden = true;
				pendingHost.appendChild(CFI.ui.Msg({ tone: 'warn', title: CFI.T('检测没成功'), text: srcMessage(src) }));
			}
		}

		function paintPool(state) {
			CFI.dom.clear(poolHost);
			var p = state.pool;
			if (!p) return;
			if (p.state === 'ok') {
				var ips = p.ips || [];
				poolHost.appendChild(el('p', { class: 'note' },
					CFI.T('候选池 %s 个 IP，前 12 个：').format(String(ips.length)) + ' ' + ips.slice(0, 12).join(' ')));
			} else {
				poolHost.appendChild(CFI.ui.Msg({ tone: 'warn', title: CFI.T('候选池没取到'), text: CFI.T('先确认源清单已保存，再点一次。') }));
			}
		}

		function paintDiag(state) {
			var d = state.diag;
			if (!d || d.state !== 'ok') {
				diagTable.update({ rows: [] });
				diagHost.hidden = true;
				diagPending.hidden = false;
				return;
			}
			var rows = [];
			for (var k in d.data || {})
				if (Object.prototype.hasOwnProperty.call(d.data, k))
					rows.push([ k, d.data[k] ]);
			diagTable.update({ rows: rows });
			diagHost.hidden = !rows.length;
			diagPending.hidden = rows.length > 0;
		}

		function paintLogs(state) {
			var lg = state.logs;
			autoBtn.update({ label: state.logAuto ? CFI.T('自动刷新：开') : CFI.T('自动刷新：关') });
			fullBtn.update({ label: state.logFull ? CFI.T('只看时刻') : CFI.T('显示完整时刻') });
			pauseBtn.update({ label: state.logPaused ? CFI.T('继续') : CFI.T('暂停') });
			followBtn.update({ label: CFI.prefs.getBool(CFI.prefs.NS + 'logs.follow', true)
				? CFI.T('跟随最新：开') : CFI.T('跟随最新：关') });
			pausedNote.hidden = !state.logPaused;
			if (!lg) return;
			if (lg.state === 'ok')
				logView.ingest(lg.text);
			else
				logView.notice(lg.state === 'empty'
					? CFI.T('还没有日志（重启过或还没跑过）。')
					: CFI.T('读不到日志：先确认 rpcd 正常，再点「立即刷新」。'));
		}

		function busyLabel(meta, base) {
			if (!meta) return base;
			var sec = Math.floor((Date.now() - (meta.at || Date.now())) / 1000);
			return CFI.T('%s %ss…').format(base, String(sec));
		}

		function paintBusy(state) {
			var busy = (state && state.busy) || {};
			btnCheck.update({ disabled: !!busy.check, busy: !!busy.check, label: busyLabel(busy.check, CFI.T('检测源可用性')) });
			btnPool.update({ disabled: !!busy.pool, busy: !!busy.pool, label: busyLabel(busy.pool, CFI.T('预览候选池')) });
			btnDiag.update({ disabled: !!busy.diag, busy: !!busy.diag, label: busyLabel(busy.diag, CFI.T('取诊断')) });
			refreshBtn.update({ disabled: !!busy.logs, busy: !!busy.logs });
		}

		function update(state) {
			var st = state.status || {};
			var k;
			k = CFI.store.roundKey(st);
			if (k !== last.trace) { last.trace = k; paintTrace(st); }
			k = CFI.store.diagKey(state);
			if (k !== last.src) { last.src = k; paintSources(state); }
			k = JSON.stringify(state.pool || null);
			if (k !== last.pool) { last.pool = k; paintPool(state); }
			k = JSON.stringify(state.diag || null);
			if (k !== last.diag) { last.diag = k; paintDiag(state); }
			if (!!state.logFull !== last.full) {
				last.full = !!state.logFull;
				logView.setFull(last.full);
			}
			if (!!state.logPaused !== last.paused) {
				last.paused = !!state.logPaused;
				logView.setPaused(last.paused);
			}
			k = CFI.store.logsKey(state, {
				logFilter: bui.logFilter, logPaused: state.logPaused,
				logFull: state.logFull, logAuto: state.logAuto
			});
			if (k !== last.logs) { last.logs = k; paintLogs(state); }
			k = JSON.stringify(state.busy || {}) + '|' + (state.busyTick || 0);
			if (k !== last.busy) { last.busy = k; paintBusy(state); }
		}

		function openLogs() {
			logDetails.open = true;
			CFI.prefs.set(CFI.prefs.NS + 'logs.open', '1');
			try { logView.box.scrollTop = logView.box.scrollHeight; } catch (e) {}
			try { logView.box.focus(); } catch (e2) {}
		}

		return {
			node: body, update: update, openLogs: openLogs, logBox: logView.box,
			logOpen: function () { return !!logDetails.open; }
		};
	}

	CFI.panels = CFI.panels || {};
	CFI.panels.diag = { mount: mount };
})(CFI);
