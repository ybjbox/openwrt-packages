(function (CFI) {
	'use strict';

	var el = CFI.dom.el;
	var F = CFI.fmt;

	function srcMessage(src) {
		switch (src.state) {
			case 'unreachable':
				return T('调不到 luci.cf-ipcheck 的 check_sources 方法：包没装好，或 rpcd 还拿着旧的 ACL 缓存（重启 rpcd 后重试）。');
			case 'hung':
				return T('检测没有回应：可能是某条源太慢。先看日志最后几行，再点一次。');
			case 'empty':
				return T('引擎没有返回任何源：先去「设置」把源清单填上并保存。');
			case 'parse_error':
				return T('引擎输出不是合法 JSON。把日志最后几行原样贴出来排查。');
			default:
				return '';
		}
	}

	function srcRowsTable(rows) {
		var t = CFI.ui.Table({
			cols: [
				{ h: T('源地址'), cls: 'l' },
				{ h: T('HTTP'), cls: 'r' },
				{ h: T('段内'), cls: 'r' },
				{ h: T('IP'), cls: 'r' }
			],
			update: function (tbody, data) {
				data.forEach(function (r) {
					var pct = r.ips ? Math.round(100 * (Number(r.cf_in) || 0) / Number(r.ips)) : null;
					tbody.appendChild(el('tr', {}, [
						el('td', { class: 'l url', title: r.url || '' }, String(r.url || '')),
						el('td', { class: 'r mono' }, r.http ? String(r.http) : F.DASH),
						el('td', { class: 'r mono' }, pct == null ? F.DASH : pct + '%'),
						el('td', { class: 'r mono' }, F.num(r.ips))
					]));
				});
			}
		});
		t.update(rows || []);
		return t.node;
	}

	function mount(actions) {
		var srcHost = el('div', { class: 'src-result' });
		var pendingHost = el('div', { class: 'pending' });
		var poolHost = el('div', { class: 'pool-result' });
		var diagHost = el('div', { class: 'diag-result' });
		var logHost = el('div', { class: 'logbox' });
		var logMeta = el('span', { class: 'log-meta dim' });
		var autoBtn = CFI.ui.Button({ kind: 'link', label: T('自动刷新：开'), onClick: actions.logAuto });
		var fullBtn = CFI.ui.Button({ kind: 'link', label: T('只看时刻'), onClick: actions.logFull });
		var copyBtn = CFI.ui.Button({ kind: 'link', label: T('复制全部'), onClick: actions.copyLogs });
		var refreshBtn = CFI.ui.Button({ kind: 'link', label: T('立即刷新'), onClick: actions.logs });
		var lastLogKey = '';

		var logFold = CFI.ui.Collapse({
			title: T('日志'),
			hint: T('引擎写的过程记录；出问题先看这里'),
			defaultOpen: false,
			persistKey: CFI.prefs.NS + 'logs.open',
			body: el('div', { class: 'fold-b' }, [
				el('div', { class: 'log-bar' }, [ autoBtn.node, fullBtn.node, refreshBtn.node, copyBtn.node, logMeta ]),
				logHost
			])
		});

		var body = el('div', { class: 'diag-body' }, [
			el('section', { class: 'sec' }, [
				el('div', { class: 'sec-h' }, [
					el('h2', { class: 'sec-t', text: T('源与候选') }),
					el('div', { class: 'sec-a' }, [
						CFI.ui.Button({ kind: 'primary', label: T('检测源可用性'), onClick: actions.check }).node,
						CFI.ui.Button({ kind: 'quiet', label: T('预览候选池'), onClick: actions.pool }).node
					])
				]),
				pendingHost,
				srcHost,
				poolHost
			]),
			el('section', { class: 'sec' }, [
				el('div', { class: 'sec-h' }, [
					el('h2', { class: 'sec-t', text: T('诊断快照') }),
					el('div', { class: 'sec-a' }, CFI.ui.Button({ kind: 'quiet', label: T('取诊断'), onClick: actions.diag }).node)
				]),
				diagHost
			]),
			logFold.node
		]);

		function paintSources(state) {
			var src = state.sources;
			CFI.dom.clear(srcHost);
			CFI.dom.clear(pendingHost);
			if (!src) {
				srcHost.appendChild(el('p', { class: 'note' }, T('还没检测过。点「检测源可用性」逐条实拉一次，看哪条断了。')));
				return;
			}
			if (src.state === 'ok') {
				srcHost.appendChild(srcRowsTable(src.rows));
				var pending = CFI.form.sources.pending(state.srcEdit, src.rows);
				if (pending.length)
					pendingHost.appendChild(el('p', { class: 'note warn' }, T('编辑框里有 %s 条还没生效（要先保存并应用）：').format(String(pending.length)) + pending.join('、')));
			} else {
				srcHost.appendChild(CFI.ui.Msg({ tone: 'warn', title: T('检测没成功'), text: srcMessage(src) }));
			}
		}

		function paintPool(state) {
			CFI.dom.clear(poolHost);
			var p = state.pool;
			if (!p)
				return;
			if (p.state === 'ok') {
				var ips = p.ips || [];
				poolHost.appendChild(el('p', { class: 'note' }, T('候选池 %s 个 IP，前 12 个：').format(String(ips.length)) + ' ' + ips.slice(0, 12).join(' ')));
			} else {
				poolHost.appendChild(CFI.ui.Msg({ tone: 'warn', title: T('候选池没取到'), text: T('先确认源清单已保存，再点一次。') }));
			}
		}

		function paintDiag(state) {
			CFI.dom.clear(diagHost);
			var d = state.diag;
			if (!d)
				return;
			if (d.state !== 'ok') {
				diagHost.appendChild(CFI.ui.Msg({ tone: 'warn', title: T('诊断没取到'), text: T('引擎没有返回诊断信息。') }));
				return;
			}
			var rows = [];
			var data = d.data || {};
			for (var k in data) {
				if (Object.prototype.hasOwnProperty.call(data, k))
					rows.push([ k, data[k] ]);
			}
			var t = CFI.ui.Table({
				cols: [ { h: T('项'), cls: 'l' }, { h: T('值'), cls: 'l' } ],
				update: function (tbody, list) {
					list.forEach(function (r) {
						tbody.appendChild(el('tr', {}, [
							el('td', { class: 'mono' }, String(r[0])),
							el('td', { class: 'mono' }, String(r[1]))
						]));
					});
				}
			});
			t.update(rows);
			diagHost.appendChild(t.node);
		}

		function paintLogs(state) {
			var lg = state.logs;
			autoBtn.update({ label: state.logAuto ? T('自动刷新：开') : T('自动刷新：关') });
			fullBtn.update({ label: state.logFull ? T('只看时刻') : T('显示完整时刻') });
			if (!lg) {
				logMeta.textContent = '';
				return;
			}
			if (lg.state !== 'ok') {
				CFI.dom.clear(logHost);
				logHost.appendChild(el('p', { class: 'dim' }, lg.state === 'empty' ? T('还没有日志（重启过或还没跑过）。') : T('读不到日志：先确认 rpcd 正常，再点「立即刷新」。')));
				return;
			}
			var key = (state.logFull ? '1' : '0') + ':' + lg.text.length + ':' + lg.text.slice(-60);
			if (key === lastLogKey)
				return;
			lastLogKey = key;
			var lines = String(lg.text).split(/\r?\n/);
			CFI.dom.clear(logHost);
			/* 倒序：最新在上；每行时间戳与正文分开，坏消息整行染色 */
			for (var i = lines.length - 1; i >= 0; i--) {
				var ln = lines[i];
				if (!ln)
					continue;
				var st = CFI.log.stamp(ln, state.logFull);
				var tone = CFI.log.tone(ln);
				logHost.appendChild(el('div', { class: 'lline' + (tone ? ' ' + tone : '') }, [
					el('span', { class: 'lts', text: st ? st.shown : '' , title: st ? st.title : '' }),
					el('span', { class: 'lmsg', text: st ? st.rest : ln })
				]));
			}
			logMeta.textContent = T('%s 行').format(String(lines.length));
		}

		function update(state) {
			paintSources(state);
			paintPool(state);
			paintDiag(state);
			paintLogs(state);
		}

		return { node: body, update: update, logHost: logHost };
	}

	CFI.panels = CFI.panels || {};
	CFI.panels.diag = { mount: mount };
})(CFI);
