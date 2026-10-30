(function (CFI) {
	'use strict';

	var el = CFI.dom.el;
	var F = CFI.fmt;

	/* 运行区：卡片式读数 + 可排序/筛选的榜单 + 行详情抽屉 + 机房分布。
	 * 所有交互宿主（工具栏、按钮、表格容器）只建一次，之后只做 update。 */
	function colsOf(st) {
		var cols = [
			{ key: 'rk', h: '#', cls: 'r' },
			{ key: 'ip', h: 'IP', cls: 'l' },
			{ key: 'code', h: 'HTTP', cls: 'r' },
			{ key: 'tcp', h: 'TCP', cls: 'r c-tcp' },
			{ key: 'tls', h: 'TLS', cls: 'r c-tls' },
			{ key: 'ttfb', h: st.probe_metric === 'tcp' ? 'TCP' : 'TTFB', cls: 'r', sortable: true },
			{ key: 'total', h: '总计', cls: 'r c-total' },
			{ key: 'colo', h: '机房', cls: 'r c-colo', sortable: true },
			{ key: 'spd', h: st.speed_unit === 'mib' ? 'MiB/s' : 'MB/s', cls: 'r', sortable: true },
			{ key: 'q', h: '质量', cls: 'l c-q' }
		];
		var domains = {};
		var n = 0;
		(st.items || []).forEach(function (it) {
			if (it && it.domain && !domains[it.domain]) { domains[it.domain] = 1; n++; }
		});
		if (n > 1)
			cols.splice(4, 0, { key: 'domain', h: '胜出域名', cls: 'l c-domain' });
		return cols;
	}

	function quality(it) {
		var bits = [];
		if (it.loss != null && isFinite(Number(it.loss)) && Number(it.loss) > 0)
			bits.push(CFI.T('丢包 %s%').format(String(Math.round(Number(it.loss) * 100))));
		if (it.jitter_ms != null && isFinite(Number(it.jitter_ms)) && Number(it.jitter_ms) > 100)
			bits.push(CFI.T('抖动 %s').format(F.ms(it.jitter_ms)));
		if (it.ray_ok === 0)
			bits.push(CFI.T('未验到 CF-RAY'));
		return bits.join(' · ');
	}

	function mount(actions, drawer) {
		var bui = {
			sort: JSON.parse(CFI.prefs.get(CFI.prefs.NS + 'board.sort', '') || 'null') || { key: 'ttfb', dir: 'asc' },
			filter: CFI.prefs.get(CFI.prefs.NS + 'board.filter', 'all'),
			q: '',
			sel: null
		};
		var last = { round: '', stage: '', board: '', dc: '', foot: '' };
		var lastItems = [];
		var lastSt = {};
		var snap = null;

		var OPT_COLS = [
			{ key: 'tcp', label: CFI.T('TCP 建连') },
			{ key: 'tls', label: CFI.T('TLS') },
			{ key: 'total', label: CFI.T('总耗时') },
			{ key: 'colo', label: CFI.T('机房') },
			{ key: 'q', label: CFI.T('质量') },
			{ key: 'domain', label: CFI.T('胜出域名') }
		];
		var hiddenCols = (function () {
			var v = [];
			try {
				v = JSON.parse(CFI.prefs.get(CFI.prefs.NS + 'board.cols', '[]') || '[]');
			} catch (e) {
				v = [];
			}
			if (!Array.isArray(v))
				return [];
			return v.filter(function (k) {
				for (var i = 0; i < OPT_COLS.length; i++)
					if (OPT_COLS[i].key === k)
						return true;
				return false;
			});
		})();

		/* ---- 骨架 ---------------------------------------------------- */
		var bannerHost = el('div', { class: 'run-banner' });
		var progressHost = el('div', { class: 'run-progress', hidden: true });
		var progress = null;

		var roPool = CFI.ui.Readout({ label: CFI.T('候选池'), value: F.DASH });
		var roQual = CFI.ui.Readout({ label: CFI.T('达标'), value: F.DASH, primary: true });
		var roBoard = CFI.ui.Readout({ label: CFI.T('榜单'), value: F.DASH });
		var roFail = CFI.ui.Readout({ label: CFI.T('未达标'), value: F.DASH, tone: 'warn' });
		var roDom = CFI.ui.Readout({ label: CFI.T('探测域名'), value: F.DASH, wide: true });
		var roDone = CFI.ui.Readout({ label: CFI.T('完成于'), value: F.DASH });
		var strip = el('div', { class: 'readouts' }, [
			roPool.node, roQual.node, roBoard.node, roFail.node, roDom.node, roDone.node
		]);
		var ruler = el('div', { class: 'ruler', 'aria-hidden': 'true' });

		var sortSel = el('select', { class: 'ctl', 'aria-label': CFI.T('排序') }, [
			el('option', { value: 'ttfb', text: CFI.T('按 TTFB') }),
			el('option', { value: 'spd', text: CFI.T('按速度') }),
			el('option', { value: 'colo', text: CFI.T('按机房') })
		]);
		sortSel.value = bui.sort.key;
		sortSel.addEventListener('change', function () {
			bui.sort = { key: sortSel.value, dir: 'asc' };
			CFI.prefs.set(CFI.prefs.NS + 'board.sort', JSON.stringify(bui.sort));
			paintBoard(true);
		});
		var filterSel = el('select', { class: 'ctl', 'aria-label': CFI.T('筛选') }, [
			el('option', { value: 'all', text: CFI.T('全部') }),
			el('option', { value: 'speed', text: CFI.T('有吞吐') }),
			el('option', { value: 'issue', text: CFI.T('有质量问题') })
		]);
		filterSel.value = bui.filter;
		filterSel.addEventListener('change', function () {
			bui.filter = filterSel.value;
			CFI.prefs.set(CFI.prefs.NS + 'board.filter', bui.filter);
			paintBoard(true);
		});
		var search = el('input', { class: 'ctl', type: 'search', placeholder: CFI.T('搜 IP / 域名'), 'aria-label': CFI.T('搜 IP 或域名') });
		search.addEventListener('input', function () { bui.q = String(search.value || '').trim(); paintBoard(true); });

		/* 列显隐：只切换容器 class，不改表头/单元格结构 */
		var colMenu = el('details', { class: 'cols' });
		colMenu.appendChild(el('summary', { class: 'ctl', text: CFI.T('列') }));
		var colList = el('div', { class: 'cols-menu' });
		OPT_COLS.forEach(function (c) {
			var cb = el('input', { type: 'checkbox', value: c.key });
			cb.checked = hiddenCols.indexOf(c.key) < 0;
			cb.addEventListener('change', function () {
				var i = hiddenCols.indexOf(c.key);
				if (cb.checked && i >= 0)
					hiddenCols.splice(i, 1);
				else if (!cb.checked && i < 0)
					hiddenCols.push(c.key);
				CFI.prefs.set(CFI.prefs.NS + 'board.cols', JSON.stringify(hiddenCols));
				paintBoard(true);
			});
			colList.appendChild(el('label', { class: 'chk' }, [ cb, el('span', { text: c.label }) ]));
		});
		colMenu.appendChild(colList);

		var table;
		function makeTable() {
			var st = lastSt;
			var cols = colsOf(st);
			table = CFI.ui.Table({
				cols: cols,
				caption: CFI.T('榜单：按 TTFB 排序的可用 IP'),
				keyOf: function (it, i) { return it.ip || ('#' + i); },
				rowSig: function (it) { return CFI.store.rowSig(it) + '|' + bui.sort.key + bui.sort.dir + bui.filter + bui.q; },
				cell: function (it, i, c) { return cellOf(it, i, c, lastSt); },
				sort: bui.sort,
				onSort: function (k) {
					if (bui.sort.key === k)
						bui.sort.dir = bui.sort.dir === 'asc' ? 'desc' : 'asc';
					else
						bui.sort = { key: k, dir: 'asc' };
					sortSel.value = k;
					CFI.prefs.set(CFI.prefs.NS + 'board.sort', JSON.stringify(bui.sort));
					paintBoard(true);
				},
				onActivate: function (key) { openDrawer(key); },
				empty: function () { return CFI.ui.Empty({ title: CFI.T('没有达标 IP'), detail: CFI.T('这一轮没有可用的结果；去「诊断」看日志最后几行。') }); }
			});
			CFI.dom.clear(boardWrap);
			boardWrap.appendChild(table.node);
		}

		var boardWrap = el('div', { class: 'board-wrap' });
		var boardSec = el('section', { class: 'sec', hidden: true }, [
			el('div', { class: 'sec-h' }, [
				el('h2', { class: 'sec-t', text: CFI.T('榜单') }),
				el('div', { class: 'board-tools' }, [ sortSel, filterSel, search, colMenu ])
			]),
			boardWrap
		]);

		var dcList = CFI.ui.DcList();
		var dcSec = el('section', { class: 'sec', hidden: true }, [
			el('h2', { class: 'sec-t', text: CFI.T('机房分布') }),
			dcList.node
		]);

		var btnCopy = CFI.ui.Button({ kind: 'quiet', icon: 'copy', label: CFI.T('复制榜单 IP'), onClick: actions.copy });
		var btnCsv = CFI.ui.Button({ kind: 'quiet', label: CFI.T('下载 CSV'), onClick: actions.csv });
		var btnDns = CFI.ui.Button({ kind: 'quiet', label: CFI.T('立即写一次 DNS'), onClick: actions.dns });
		var foot = el('div', { class: 'run-foot' }, [ btnCopy.node, btnCsv.node, btnDns.node ]);

		var body = el('div', { class: 'run-body' }, [ bannerHost, progressHost, strip, ruler, boardSec, dcSec, foot ]);

		/* ---- 行与单元格 ---------------------------------------------- */
		function maxSpeedOf(items) {
			var m = 0;
			items.forEach(function (it) {
				var s = F.speedOf(it, lastSt.speed_unit === 'mib' ? 'mib' : 'mb');
				if (s != null && s > m) m = s;
			});
			return m;
		}
		var maxSpeed = 0;

		function cellOf(it, i, c, st) {
			if (c.key === 'rk')
				return el('span', { class: 'rk n', text: String(i + 1) });
			if (c.key === 'ip')
				return el('span', { class: 'ip mono', text: it.ip || '?' });
			if (c.key === 'code') {
				var ok = it.code != null && it.code >= 200 && it.code < 300;
				return el('span', { class: (ok ? 'ok' : 'warn') + ' n', text: it.code != null ? String(it.code) : F.DASH });
			}
			if (c.key === 'tcp') return el('span', { class: 'n', text: F.ms(it.connect_ms) });
			if (c.key === 'tls') return el('span', { class: 'n', text: F.ms(it.tls_ms) });
			if (c.key === 'total') return el('span', { class: 'n', text: F.ms(it.total_ms) });
			if (c.key === 'colo') return el('span', { class: 'n', text: it.colo || F.DASH });
			if (c.key === 'domain') return el('span', { class: 'dim', text: it.domain || F.DASH });
			if (c.key === 'ttfb') {
				var v = st.probe_metric === 'tcp' && it.connect_ms != null ? it.connect_ms : it.ttfb_ms;
				var kids = [ el('span', { class: 'n', text: F.ms(v) }) ];
				if (st.probe_metric !== 'tcp' && it.net_ttfb_ms != null && isFinite(Number(it.net_ttfb_ms)))
					kids.push(el('span', { class: 'sub n', text: CFI.T('净 %s').format(F.ms(it.net_ttfb_ms)) }));
				return el('span', {}, kids);
			}
			if (c.key === 'spd') {
				var sp = F.speedOf(it, st.speed_unit === 'mib' ? 'mib' : 'mb');
				var txt = F.mbps(sp);
				if (sp > 0 && maxSpeed > 0) {
					var pct = Math.max(4, Math.round(100 * sp / maxSpeed));
					return el('span', { class: 'spd' }, [
						el('span', { class: 'spd-bar', 'aria-hidden': 'true' }, el('i', { class: 'spd-fill', style: { width: pct + '%' } })),
						el('span', { class: 'n', text: txt })
					]);
				}
				return el('span', { class: 'n' }, txt);
			}
			var q = quality(it);
			return el('span', { class: q ? 'warn' : 'dim', text: q || F.DASH });
		}

		function sortedFiltered(items) {
			var out = (items || []).filter(function (it) {
				if (bui.filter === 'speed') {
					var s = F.speedOf(it, lastSt.speed_unit === 'mib' ? 'mib' : 'mb');
					if (!(s > 0)) return false;
				}
				if (bui.filter === 'issue' && !quality(it)) return false;
				if (bui.q) {
					var hay = String(it.ip || '') + ' ' + String(it.domain || '') + ' ' + String(it.colo || '');
					if (hay.toLowerCase().indexOf(bui.q.toLowerCase()) < 0) return false;
				}
				return true;
			});
			var key = bui.sort.key, dir = bui.sort.dir === 'desc' ? -1 : 1;
			out.sort(function (a, b) {
				var x, y;
				if (key === 'spd') {
					x = F.speedOf(a, lastSt.speed_unit === 'mib' ? 'mib' : 'mb') || 0;
					y = F.speedOf(b, lastSt.speed_unit === 'mib' ? 'mib' : 'mb') || 0;
				} else if (key === 'colo') {
					x = String(a.colo || '');
					y = String(b.colo || '');
					return x < y ? -dir : (x > y ? dir : 0);
				} else {
					x = Number(a.ttfb_ms != null ? a.ttfb_ms : 1e9);
					y = Number(b.ttfb_ms != null ? b.ttfb_ms : 1e9);
				}
				return (x - y) * dir;
			});
			return out;
		}

		var lastCols = '';
		function colsSig(st) {
			var n = 0;
			var seen = {};
			(st.items || []).forEach(function (it) {
				if (it && it.domain && !seen[it.domain]) { seen[it.domain] = 1; n++; }
			});
			return [ st.probe_metric || '', st.speed_unit || '', n > 1 ? 'd' : '' ].join('|');
		}
		function paintBoard(force) {
			var rows = sortedFiltered(lastItems);
			maxSpeed = maxSpeedOf(rows);
			var cs = colsSig(lastSt);
			if (!table || cs !== lastCols) {
				makeTable();
				lastCols = cs;
			}
			table.update({ rows: rows, sort: bui.sort, selected: bui.sel, hidden: hiddenCols });
			if (table.paintHead)
				table.paintHead(bui.sort);
		}

		/* ---- 抽屉 ---------------------------------------------------- */
		function rankOf(ip) {
			for (var i = 0; i < lastItems.length; i++)
				if (String(lastItems[i].ip) === String(ip))
					return i + 1;
			return null;
		}

		/* 时序刻度：建连 / TLS / 等待首字节 / 传输，按总耗时占比 */
		function timingBlock(it) {
			var c = Number(it.connect_ms);
			var t = Number(it.tls_ms);
			var f = Number(it.ttfb_ms);
			var tot = Number(it.total_ms);
			var seg = [];
			function push(cls, v, label) {
				if (isFinite(v) && v > 0)
					seg.push({ cls: cls, v: v, label: label });
			}
			if (isFinite(c)) push('s-connect', c, CFI.T('建连'));
			if (isFinite(t) && isFinite(c)) push('s-tls', t - c, CFI.T('TLS'));
			if (isFinite(f) && isFinite(t)) push('s-wait', f - t, CFI.T('等待'));
			if (isFinite(tot) && isFinite(f)) push('s-xfer', tot - f, CFI.T('传输'));
			var sum = 0;
			seg.forEach(function (s) { sum += s.v; });
			if (!seg.length || sum <= 0)
				return null;
			var bar = el('div', { class: 'tscale', 'aria-hidden': 'true' });
			var leg = el('div', { class: 'tleg' });
			seg.forEach(function (s) {
				bar.appendChild(el('i', { class: s.cls, style: { width: (100 * s.v / sum).toFixed(1) + '%' } }));
				leg.appendChild(el('span', { class: 'tleg-i' }, [
					el('i', { class: 'sw ' + s.cls, 'aria-hidden': 'true' }),
					el('span', { text: s.label + ' ' + F.ms(s.v) + ' ms' })
				]));
			});
			return el('div', { class: 'tblock' }, [
				el('div', { class: 'tscale-t', text: CFI.T('时序（按总耗时占比）') }),
				bar,
				leg
			]);
		}

		function drawerContent(it, st) {
			if (!it)
				return el('p', { class: 'dim', text: CFI.T('这条 IP 已不在本轮榜单。') });
			var unit = st.speed_unit === 'mib' ? ' MiB/s' : ' MB/s';
			var rows = [
				[ CFI.T('名次'), rankOf(it.ip) ? String(rankOf(it.ip)) : F.DASH ],
				[ CFI.T('HTTP'), it.code != null ? String(it.code) : F.DASH ],
				[ CFI.T('TCP 建连'), F.ms(it.connect_ms) + ' ms' ],
				[ CFI.T('TLS'), F.ms(it.tls_ms) + ' ms' ],
				[ CFI.T('TTFB'), F.ms(it.ttfb_ms) + ' ms' ],
				[ CFI.T('总耗时'), F.ms(it.total_ms) + ' ms' ],
				[ CFI.T('机房'), it.colo || F.DASH ],
				[ CFI.T('胜出域名'), it.domain || F.DASH ],
				[ CFI.T('吞吐'), F.mbps(F.speedOf(it, st.speed_unit === 'mib' ? 'mib' : 'mb')) + unit ],
				[ CFI.T('丢包'), it.loss != null && isFinite(Number(it.loss)) ? (Number(it.loss) * 100).toFixed(1) + '%' : F.DASH ],
				[ CFI.T('抖动'), F.ms(it.jitter_ms) + ' ms' ],
				[ 'CF-RAY', it.ray_ok == null ? F.DASH : (Number(it.ray_ok) ? CFI.T('已验到') : CFI.T('未验到')) ]
			];
			var list = el('dl', { class: 'kv' });
			rows.forEach(function (r) {
				list.appendChild(el('dt', { text: r[0] }));
				list.appendChild(el('dd', { class: 'n', text: r[1] }));
			});
			var kids = [ list ];
			var tb = timingBlock(it);
			if (tb)
				kids.push(tb);
			kids.push(el('div', { class: 'drawer-a' }, [
				CFI.ui.Button({ kind: 'primary', label: CFI.T('复制此 IP'), onClick: function () { actions.copyText(String(it.ip || '')); } }).node,
				CFI.ui.Button({ kind: 'quiet', label: CFI.T('复制为产物行'), onClick: function () { actions.copyText(CFI.T('%s# %s').format(String(it.ip || ''), String(it.colo || ''))); } }).node,
				CFI.ui.Button({ kind: 'quiet', label: CFI.T('只看此机房'), onClick: function () { bui.filter = 'all'; filterSel.value = 'all'; bui.q = String(it.colo || ''); search.value = bui.q; paintBoard(true); } }).node
			]));
			return el('div', {}, kids);
		}

		function drawerBody(it, stale) {
			var kids = [];
			if (stale)
				kids.push(el('p', { class: 'note warn' },
					CFI.T('这条 IP 已不在本轮榜单，下面是打开时的读数。')));
			kids.push(drawerContent(it, lastSt));
			return el('div', {}, kids);
		}

		function itemOf(ip) {
			for (var i = 0; i < lastItems.length; i++)
				if (String(lastItems[i].ip) === String(ip))
					return lastItems[i];
			return null;
		}

		function openDrawer(ip, silent) {
			bui.sel = ip;
			var it = itemOf(ip);
			if (it)
				snap = it;
			drawer.open(String(ip), drawerBody(it || snap || { ip: ip }, !it));
			table.update({ rows: sortedFiltered(lastItems), sort: bui.sort, selected: bui.sel, hidden: hiddenCols });
			if (!silent && actions.onSelect)
				actions.onSelect(ip);
		}

		function closeDrawer() {
			if (drawer.isOpen())
				drawer.close();
		}

		/* 抽屉关闭（Esc / 遮罩 / Back / 切区）后由外壳回调：清选中，不碰路由 */
		function onDrawerClosed() {
			bui.sel = null;
			if (table)
				table.update({ rows: sortedFiltered(lastItems), sort: bui.sort, selected: null, hidden: hiddenCols });
		}

		/* ---- 状态 ---------------------------------------------------- */
		function paintRound(st) {
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
			roPool.update({ value: F.num(st.pool), sub: CFI.T('本轮去重后参与探测的 IP 数') });
			roQual.update({ value: F.num(st.qualified), sub: CFI.T('TTFB 与总耗时两道门槛都过') });
			roBoard.update({ value: F.num(st.usable != null ? st.usable : (st.items || []).length), sub: CFI.T('按 TTFB 排序保留的条数') });
			roFail.node.hidden = !(fail > 0);
			if (fail > 0)
				roFail.update({ value: F.num(fail), sub: parts.join(' · ') });
			roDom.node.hidden = !st.domains;
			if (st.domains)
				roDom.update({ value: String(st.domains) });
			roDone.node.hidden = !(st.finished || st.started);
			if (st.finished || st.started)
				roDone.update({
					value: F.ago(st.finished || st.started),
					sub: F.clock(st.finished || st.started),
					tone: st.state === 'running' ? null : (st.staleFor ? 'warn' : null)
				});
		}

		function paintBanner(st) {
			CFI.dom.clear(bannerHost);
			if (st.state === 'never_run') {
				bannerHost.appendChild(CFI.ui.Empty({
					title: CFI.T('还没有跑过一轮'),
					detail: CFI.T('点「立即测速」跑一轮。打开「定时实测」后才会自己按周期跑。'),
					action: CFI.ui.Button({ kind: 'link', label: CFI.T('去设置打开定时实测'), onClick: actions.gotoSet }).node
				}));
			} else if (st.state === 'error' || st.state === 'unreachable' || st.state === 'parse_error') {
				var reason = st.reason;
				if (!reason && (st.state === 'unreachable' || st.state === 'parse_error'))
					reason = st.state;
				bannerHost.appendChild(CFI.ui.Empty({
					title: CFI.sem.stateWord(st),
					detail: CFI.sem.why(reason),
					action: CFI.ui.Button({ kind: 'link', label: CFI.T('去诊断看日志'), onClick: actions.gotoDiag }).node
				}));
			} else if (st.intercepted == 1) {
				bannerHost.appendChild(CFI.ui.Msg({
					tone: 'warn', title: CFI.T('出口被代理接管'),
					text: CFI.T('这一轮的读数不代表直连质量；关掉代理或改用直连再跑。')
				}));
			}
		}

		function paintDc(st) {
			var rows = st.dc_summary || [];
			dcSec.hidden = !rows.length;
			if (!rows.length) {
				dcList.update([]);
				return;
			}
			var show = st.dc_show || null;
			var list = [];
			if (show && show.length) {
				var by = {};
				rows.forEach(function (r) { if (r && r.dc) by[String(r.dc)] = r; });
				show.forEach(function (s) {
					var code = s && s.dc ? String(s.dc) : '';
					if (!code) return;
					list.push(by[code] || { dc: code, count: 0, ttfb_med: null, best_ip: null, empty: true, items: [] });
				});
			} else {
				list = rows.slice(0, 6);
			}
			list.forEach(function (r) {
				var code = String(r.dc);
				var cap = 12;
				if (st.dc_show) {
					for (var i = 0; i < st.dc_show.length; i++)
						if (st.dc_show[i] && String(st.dc_show[i].dc) === code && Number(st.dc_show[i].n) > 0)
							cap = Number(st.dc_show[i].n);
				}
				r.cap = cap;
			});
			dcList.update(list, st.speed_unit === 'mib' ? 1048576 : 1000000);
		}

		function paintFoot(st, busy) {
			busy = busy || {};
			var running = st.state === 'running';
			btnCopy.update({ disabled: !(lastItems.length) || running });
			btnCsv.update({ disabled: !!busy.csv });
			btnDns.update({ disabled: !!busy.dns, busy: !!busy.dns });
		}

		function update(state) {
			var st = state.status || {};
			var busy = state.busy || {};
			lastSt = st;
			lastItems = st.items || [];

			var k = CFI.store.roundKey(st);
			if (k !== last.round) {
				last.round = k;
				paintRound(st);
				paintBanner(st);
			}
			var ks = CFI.store.stageKey(st);
			if (ks !== last.stage) {
				last.stage = ks;
				progressHost.hidden = st.state !== 'running';
				if (st.state === 'running') {
					if (!progress) {
						progress = CFI.ui.Progress(st);
						progressHost.appendChild(progress.node);
					} else {
						progress.update(st);
					}
				}
			}
			var kb = CFI.store.boardKey(st);
			if (kb !== last.board) {
				last.board = kb;
				boardSec.hidden = !lastItems.length;
				paintBoard(true);
				if (bui.sel && drawer.isOpen && drawer.isOpen()) {
					var cur = itemOf(bui.sel);
					if (cur)
						snap = cur;
					drawer.open(String(bui.sel), drawerBody(cur || snap || { ip: bui.sel }, !cur));
				}
			}
			var kd = CFI.store.dcKey(st);
			if (kd !== last.dc) {
				last.dc = kd;
				paintDc(st);
			}
			var kf = CFI.store.footKey(st, busy);
			if (kf !== last.foot) {
				last.foot = kf;
				paintFoot(st, busy);
			}
		}

		update({ status: { items: [] }, busy: {} });
		return {
			node: body,
			update: update,
			select: function (ip) {
				if (ip)
					openDrawer(ip, true);
				else
					closeDrawer();
			},
			onDrawerClosed: onDrawerClosed
		};
	}

	CFI.panels = CFI.panels || {};
	CFI.panels.run = { mount: mount };
})(CFI);
