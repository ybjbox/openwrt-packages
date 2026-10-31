(function (CFI) {
	'use strict';

	var el = CFI.dom.el;

	/* 日志独立标签页：工具栏 + 增量日志。自动刷新只在停在「日志」页时开。 */
	function mount(actions) {
		var bui = { logFilter: CFI.prefs.get(CFI.prefs.NS + 'logs.filter', 'all') };
		var last = { logs: '', full: null, paused: null, busy: '' };
		var painted = false;
		var logView = CFI.ui.LogView({ cap: 600 });
		logView.setFilter(bui.logFilter);
		logView.setFollow(CFI.prefs.getBool(CFI.prefs.NS + 'logs.follow', true));
		var pausedNote = el('p', { class: 'log-paused', hidden: true },
			CFI.T('已暂停：不再自动拉取。点「继续」恢复；下面这份是暂停前的最后一份。'));

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

		var body = el('article', { class: 'card cfp-logs' }, [
			el('div', { class: 'card-h' }, [
				el('h2', { text: CFI.T('日志') }),
				el('span', { class: 'sub', text: CFI.T('引擎写的过程记录；出问题先看这里') })
			]),
			el('div', { class: 'log-bar' }, [
				autoBtn.node, fullBtn.node, pauseBtn.node, followBtn.node, refreshBtn.node, copyBtn.node, filterSel
			]),
			pausedNote,
			logView.node
		]);

		function paintLogs(state) {
			var lg = state.logs;
			autoBtn.update({ label: state.logAuto ? CFI.T('自动刷新：开') : CFI.T('自动刷新：关') });
			fullBtn.update({ label: state.logFull ? CFI.T('只看时刻') : CFI.T('显示完整时刻') });
			pauseBtn.update({ label: state.logPaused ? CFI.T('继续') : CFI.T('暂停') });
			pausedNote.hidden = !state.logPaused;
			if (!lg) return;
			if (lg.state === 'ok') {
				logView.ingest(lg.text);
				/* 首次上屏：日志比一屏长时回到最上面（最新一行） */
				if (!painted) {
					painted = true;
					reveal();
				}
			} else
				logView.notice(lg.state === 'empty'
					? CFI.T('还没有日志（重启过或还没跑过）。')
					: CFI.T('读不到日志：先确认 rpcd 正常，再点「立即刷新」。'));
		}

		function reveal() {
			if (CFI.prefs.getBool(CFI.prefs.NS + 'logs.follow', true))
				logView.setFollow(true);
		}

		function update(state) {
			if (!!state.logFull !== last.full) {
				last.full = !!state.logFull;
				logView.setFull(last.full);
			}
			if (!!state.logPaused !== last.paused) {
				last.paused = !!state.logPaused;
				logView.setPaused(last.paused);
			}
			var k = CFI.store.logsKey(state, {
				logFilter: bui.logFilter, logPaused: state.logPaused,
				logFull: state.logFull, logAuto: state.logAuto
			});
			if (k !== last.logs) { last.logs = k; paintLogs(state); }
			var kb = !!((state.busy || {}).logs);
			if (kb !== last.busy) {
				last.busy = kb;
				refreshBtn.update({ disabled: kb, busy: kb });
			}
		}

		return { node: body, update: update, reveal: reveal };
	}

	CFI.panels = CFI.panels || {};
	CFI.panels.logs = { mount: mount };
})(CFI);
