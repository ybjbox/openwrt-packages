(function (CFI) {
	'use strict';

	var el = CFI.dom.el;
	var F = CFI.fmt;

	function boardCols(st) {
		var cols = [
			{ key: 'rk', h: '#', cls: 'r' },
			{ key: 'ip', h: 'IP', cls: 'l' },
			{ key: 'code', h: 'HTTP', cls: 'r' },
			{ key: 'tcp', h: 'TCP', cls: 'r c-tcp' },
			{ key: 'tls', h: 'TLS', cls: 'r c-tls' },
			{ key: 'ttfb', h: st.probe_metric === 'tcp' ? 'TCP' : 'TTFB', cls: 'r' },
			{ key: 'total', h: '总计', cls: 'r c-total' },
			{ key: 'colo', h: '机房', cls: 'r' },
			{ key: 'spd', h: st.speed_unit === 'mib' ? 'MiB/s' : 'MB/s', cls: 'r' },
			{ key: 'q', h: '质量', cls: 'l c-q' }
		];
		var kinds = {};
		var n = 0;
		(st.items || []).forEach(function (it) {
			if (it && it.domain && !kinds[it.domain]) { kinds[it.domain] = 1; n++; }
		});
		if (n > 1)
			cols.splice(4, 0, { key: 'domain', h: '胜出域名', cls: 'l' });
		return cols;
	}

	function quality(it) {
		var bits = [];
		if (it.loss != null && isFinite(Number(it.loss)) && Number(it.loss) > 0)
			bits.push(T('丢包 %s%').format(String(Math.round(Number(it.loss) * 100))));
		if (it.jitter_ms != null && isFinite(Number(it.jitter_ms)) && Number(it.jitter_ms) > 100)
			bits.push(T('抖动 %s').format(F.ms(it.jitter_ms)));
		if (it.ray_ok === 0)
			bits.push(T('未验到 CF-RAY'));
		return bits.join(' · ');
	}

	function cell(it, i, c, st, maxSpeed) {
		if (c.key === 'rk')
			return el('td', { class: 'r' }, el('span', { class: 'rk', text: String(i + 1) }));
		if (c.key === 'ip')
			return el('td', { class: 'mono' }, el('span', { text: it.ip || '?' }));
		if (c.key === 'code') {
			var ok = it.code != null && it.code >= 200 && it.code < 300;
			return el('td', { class: 'r' }, el('span', { class: ok ? 'ok' : 'warn', text: it.code != null ? String(it.code) : F.DASH }));
		}
		if (c.key === 'tcp')
			return el('td', { class: 'r mono c-tcp' }, F.ms(it.connect_ms));
		if (c.key === 'tls')
			return el('td', { class: 'r mono c-tls' }, F.ms(it.tls_ms));
		if (c.key === 'total')
			return el('td', { class: 'r mono c-total' }, F.ms(it.total_ms));
		if (c.key === 'ttfb') {
			var node = el('span', { class: 'mono', text: F.ms(st.probe_metric === 'tcp' && it.connect_ms != null ? it.connect_ms : it.ttfb_ms) });
			if (st.probe_metric !== 'tcp' && it.net_ttfb_ms != null && isFinite(Number(it.net_ttfb_ms)))
				return el('td', { class: 'r' }, [ node, el('span', { class: 'sub mono', text: T('净 %s').format(F.ms(it.net_ttfb_ms)) }) ]);
			return el('td', { class: 'r' }, node);
		}
		if (c.key === 'colo')
			return el('td', { class: 'r mono' }, it.colo || F.DASH);
		if (c.key === 'domain')
			return el('td', { class: 'l dim' }, it.domain || F.DASH);
		if (c.key === 'spd') {
			var v = F.speedOf(it, st.speed_unit === 'mib' ? 'mib' : 'mb');
			var txt = F.mbps(v);
			if (v > 0 && maxSpeed > 0) {
				var pct = Math.max(4, Math.round(100 * v / maxSpeed));
				return el('td', { class: 'r' }, el('span', { class: 'spd' }, [
					el('span', { class: 'spd-bar' }, el('i', { class: 'spd-fill', style: { width: pct + '%' } })),
					el('span', { class: 'mono', text: txt })
				]));
			}
			return el('td', { class: 'r mono' }, txt);
		}
		var q = quality(it);
		return el('td', { class: 'l c-q' }, el('span', { class: q ? 'warn' : 'dim', text: q || F.DASH }));
	}

	function summary(st) {
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
		var cells = [
			CFI.ui.Readout({ label: T('候选池'), value: F.num(st.pool), sub: T('本轮去重后参与探测的 IP 数') }),
			CFI.ui.Readout({ label: T('达标'), value: F.num(st.qualified), primary: true, sub: T('TTFB 与总耗时两道门槛都过') }),
			CFI.ui.Readout({ label: T('榜单'), value: F.num(st.usable != null ? st.usable : (st.items || []).length), sub: T('按 TTFB 排序保留的条数') })
		];
		if (fail > 0)
			cells.push(CFI.ui.Readout({ label: T('未达标'), value: F.num(fail), tone: 'warn', sub: parts.join(' · ') }));
		if (st.domains)
			cells.push(CFI.ui.Readout({ label: T('探测域名'), value: String(st.domains), wide: true }));
		if (st.finished || st.started)
			cells.push(CFI.ui.Readout({
				label: T('完成于'), value: F.ago(st.finished || st.started),
				sub: F.clock(st.finished || st.started),
				tone: st.state === 'running' ? null : (st.staleFor ? 'warn' : null)
			}));
		return el('div', { class: 'readouts' }, cells.map(function (c) { return c.node; }));
	}

	function dcTable(st) {
		var rows = st.dc_summary || [];
		if (!rows.length)
			return null;
		var show = st.dc_show || null;
		var list = [];
		if (show && show.length) {
			var by = {};
			rows.forEach(function (r) { if (r && r.dc) by[String(r.dc)] = r; });
			show.forEach(function (s) {
				var code = s && s.dc ? String(s.dc) : '';
				if (!code)
					return;
				list.push(by[code] || { dc: code, count: 0, ttfb_med: null, best_ip: null, empty: true, items: [] });
			});
		} else {
			list = rows.slice(0, 6);
		}
		var unit = st.speed_unit === 'mib' ? 1048576 : 1000000;
		var sec = el('section', { class: 'sec' }, [
			el('h2', { class: 'sec-t', text: T('机房分布') })
		]);
		var box = el('div', { class: 'dcs' });
		list.forEach(function (r) {
			var items = (r.items || []).filter(function (x) { return x && typeof x === 'object'; });
			var cap = 12;
			if (st.dc_show) {
				for (var i = 0; i < st.dc_show.length; i++) {
					if (st.dc_show[i] && String(st.dc_show[i].dc) === String(r.dc) && Number(st.dc_show[i].n) > 0)
						cap = Number(st.dc_show[i].n);
				}
			}
			var detail = null;
			if (items.length) {
				var inner = el('div', { class: 'dcitems' });
				items.slice(0, cap).forEach(function (d) {
					var spd = d.speed_bps == null || d.speed_bps === '' ? null : Number(d.speed_bps) / unit;
					inner.appendChild(el('div', { class: 'dcitem' }, [
						el('span', { class: 'mono', text: d.ip ? String(d.ip) : F.DASH }),
						el('span', { class: 'r mono', text: F.ms(d.ttfb_ms) }),
						el('span', { class: 'r mono', text: spd == null ? F.DASH : spd.toFixed(2) })
					]));
				});
				var total = Number(r.items_total);
				if (items.length > cap || (isFinite(total) && total > items.length))
					inner.appendChild(el('div', { class: 'dc-note dim' },
						T('这一块共 %s 条，这里列前 %s 条').format(String(items.length), String(Math.min(cap, items.length)))));
				detail = inner;
			}
			var sum = el('summary', {}, [
				el('span', { class: 'mono' }, [ String(r.dc), r.empty ? el('span', { class: 'tag', text: T('本轮无') }) : null ]),
				el('span', { class: 'r mono', text: F.num(r.count) }),
				el('span', { class: 'r mono', text: F.ms(r.ttfb_med) }),
				el('span', { class: 'mono', text: r.best_ip ? String(r.best_ip) : F.DASH })
			]);
			var d = el('details', { class: 'dc' + (r.empty ? ' dim' : '') }, [ sum ]);
			if (detail)
				d.appendChild(detail);
			box.appendChild(d);
		});
		sec.appendChild(box);
		return sec;
	}

	function mount(actions) {
		var body = el('div', { class: 'run-body' });
		var progress = null;

		function update(state) {
			var st = state.status || {};
			CFI.dom.clear(body);

			if (st.state === 'running') {
				if (!progress)
					progress = CFI.ui.Progress(st);
				else
					progress.update(st);
				body.appendChild(progress.node);
			}

			if (st.state === 'never_run') {
				body.appendChild(CFI.ui.Empty({
					title: T('还没有跑过一轮'),
					detail: T('点「立即测速」跑一轮。跑完会在这里给出按 TTFB 排序的可用 IP；打开「定时实测」后才会自己按周期跑。'),
					action: CFI.ui.Button({ kind: 'quiet', label: T('去设置打开定时实测'), onClick: actions.gotoSet }).node
				}));
			} else if (st.state === 'error' || st.state === 'unreachable' || st.state === 'parse_error') {
				body.appendChild(CFI.ui.Empty({
					title: CFI.sem.stateWord(st),
					detail: CFI.sem.why(st.reason),
					action: CFI.ui.Button({ kind: 'quiet', label: T('去诊断看日志'), onClick: actions.gotoDiag }).node
				}));
			}

			if (st.state !== 'never_run' && (st.pool != null || st.qualified != null))
				body.appendChild(summary(st));

			var items = (st.items || []).slice();
			if (items.length) {
				var maxSpeed = 0;
				items.forEach(function (it) {
					var s = F.speedOf(it, st.speed_unit === 'mib' ? 'mib' : 'mb');
					if (s != null && s > maxSpeed)
						maxSpeed = s;
				});
				var cols = boardCols(st);
				var t = CFI.ui.Table({
					cols: cols,
					update: function (tbody, data) {
						data.forEach(function (it, i) {
							tbody.appendChild(el('tr', { class: i === 0 ? 'top' : '' },
								cols.map(function (c) { return cell(it, i, c, st, maxSpeed); })));
						});
					}
				});
				t.update(items);
				body.appendChild(el('section', { class: 'sec' }, [
					el('h2', { class: 'sec-t', text: T('榜单') }),
					t.node
				]));
			}

			var dc = dcTable(st);
			if (dc)
				body.appendChild(dc);

			var foot = el('div', { class: 'run-foot' }, [
				CFI.ui.Button({ kind: 'quiet', label: T('复制榜单 IP'), disabled: !items.length || st.state === 'running', onClick: actions.copy }).node,
				CFI.ui.Button({ kind: 'quiet', label: T('下载 CSV'), onClick: actions.csv }).node,
				CFI.ui.Button({ kind: 'quiet', label: T('立即写一次 DNS'), onClick: actions.dns }).node
			]);
			body.appendChild(foot);
		}

		return { node: body, update: update };
	}

	CFI.panels = CFI.panels || {};
	CFI.panels.run = { mount: mount };
})(CFI);
