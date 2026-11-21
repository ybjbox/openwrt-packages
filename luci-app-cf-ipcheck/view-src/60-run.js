(function (CFI) {
	'use strict';

	var el = CFI.dom.el;
	var F = CFI.fmt;
	var QUALITY_NOTE = CFI.T('质量只列异常：抖动 = 同一 IP 多次测得的首字节耗时最大差（ms，>100 才标）；速度波动 = 精测三遍首末两次的吞吐相对差（>25% 才标）；丢包 = 没打通的样本占比；未验到 CF-RAY = 没拿到机房标记；— = 没发现异常。');

	/* 每个可排序列「刚切进来」时朝哪个方向走。
	 * 首字节、机房是越小 / 越靠前越好，走 asc；吞吐正相反 —— 越大越好，
	 * 走 asc 会把最慢的顶到第一行（r201 那版就是这样，看着像榜单反了）。
	 * 用户仍可在表头再点一下翻转，方向会连同键一起存进偏好。 */
	var SORT_DEF = { ttfb: 'asc', spd: 'desc', colo: 'asc' };
	function sortDefDir(key) { return SORT_DEF[key] || 'asc'; }

	/* 运行区：卡片式读数 + 可排序/筛选的榜单 + 行详情抽屉 + 机房分布。
	 * 所有交互宿主（工具栏、按钮、表格容器）只建一次，之后只做 update。 */
	function colsOf(st) {
		return [
			{ key: 'rk', h: '#', cls: 'r' },
			{ key: 'ip', h: 'IP', cls: 'l' },
			{ key: 'colo', h: '机房', cls: 'l c-colo', sortable: true },
			{ key: 'code', h: 'HTTP', cls: 'r' },
			{ key: 'ttfb', h: st.probe_metric === 'tcp' ? 'TCP' : '首字节', cls: 'r c-ttfb', sortable: true },
			{ key: 'spd', h: st.speed_unit === 'mib' ? 'MiB/s' : 'MB/s', cls: 'r c-spd', sortable: true },
			{ key: 'q', h: '质量', cls: 'l c-q', tip: QUALITY_NOTE }
		];
	}

	function quality(it) {
		var bits = [];
		if (it.loss != null && isFinite(Number(it.loss)) && Number(it.loss) > 0)
			bits.push(CFI.T('丢包 %s%').format(String(Math.round(Number(it.loss) * 100))));
		if (it.jitter_ms != null && isFinite(Number(it.jitter_ms)) && Number(it.jitter_ms) > 100)
			bits.push(CFI.T('抖动 %s ms').format(F.ms(it.jitter_ms)));
		/* r221：精测多遍的吞吐相对差（r225 起取首末两次）。≤25% 不标（正常波动），超过才进「质量」列。 */
		if (it.speed_spread != null && isFinite(Number(it.speed_spread)) && Number(it.speed_spread) > 0.25)
			bits.push(CFI.T('速度波动 %s%').format(String(Math.round(Number(it.speed_spread) * 100))));
		if (it.ray_ok === 0)
			bits.push(CFI.T('未验到 CF-RAY'));
		return bits.join(' · ');
	}

	function scheduleLine(st) {
		if (st.enabled == null)
			return '';
		if (Number(st.enabled) === 0)
			return CFI.T('定时实测：关闭');
		var s;
		if (st.daily_times)
			s = CFI.T('定时实测：每天 %s').format(String(st.daily_times).replace(/,/g, ' / '));
		else
			s = CFI.T('定时实测：每 %s 小时').format(st.interval != null ? st.interval : '?');
		if (st.next_run != null && isFinite(Number(st.next_run))) {
			var d = new Date(Number(st.next_run) * 1000);
			s += CFI.T('，下一轮约 %s').format(F.pad2(d.getMonth() + 1) + '-' + F.pad2(d.getDate())
				+ ' ' + F.pad2(d.getHours()) + ':' + F.pad2(d.getMinutes()));
		}
		return s;
	}

	function mount(actions, drawer) {
		var bui = {
			/* 键名带 2：老版本把「按速度 + 升序」写进过 board.sort，直接读会继续
			 * 端出最慢的排第一。换新键一次性作废那次错误默认，用户自己翻转过
			 * 的方向重新选一次即可（这块上线才一天，代价可以忽略）。 */
			sort: JSON.parse(CFI.prefs.get(CFI.prefs.NS + 'board.sort2', '') || 'null') || { key: 'ttfb', dir: 'asc' },
			filter: CFI.prefs.get(CFI.prefs.NS + 'board.filter', 'all'),
			/* r203：原来这里还有个 q（搜 IP / 域名）。榜单只有十来行，搜索框既占地方
			 * 又要额外维护一份过滤状态，用户明确说不用 —— 去掉。只留下「只看某机房」
			 * 需要的 colo（配合筛选下拉里的动态项）。 */
			colo: '',
			sel: null
		};
		/* colo 不落盘（它是「只看某机房」的临时态），所以偏好里若存着 colo 就退回全部，
		 * 否则刷新后会拿空 colo 去比对、一条都不剩。 */
		if (bui.filter === 'colo')
			bui.filter = 'all';
		var last = { round: '', stage: '', board: '', dc: '', foot: '', recent: '', drawer: '' };
		var lastItems = [];
		var lastSt = {};
		var snap = null;

		var OPT_COLS = [
			{ key: 'colo', label: CFI.T('机房') },
			{ key: 'spd', label: CFI.T('吞吐') },
			{ key: 'q', label: CFI.T('质量') }
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
		/* r198：进度条下面的实时流水。数据来自 status.recent（引擎并进来的
		 * 日志尾部 8 行），不新增 RPC、不额外轮询，跟着 3 秒一次的 status 走。 */
		var recentElapsed = el('span', { class: 'n', text: '' });
		var recentList = el('div', { class: 'run-recent-list' });
		var recentHost = el('div', { class: 'run-recent', hidden: true }, [
			el('div', { class: 'run-recent-h' }, [
				el('span', { text: CFI.T('测速过程 · 最近 8 条') }), recentElapsed
			]),
			recentList
		]);

		function elapsedText(started) {
			if (!started) return '';
			var t = Date.parse(started);
			if (!isFinite(t)) return '';
			var s = Math.max(0, Math.floor((Date.now() - t) / 1000));
			var mm = Math.floor(s / 60), ss = s % 60;
			return CFI.T('已运行 %s:%s').format(
				(mm < 10 ? '0' : '') + mm, (ss < 10 ? '0' : '') + ss);
		}

		function statNode(label, warn) {
			var v = el('b', { class: 'n', text: F.DASH });
			var node = el('div', { class: 'stat' + (warn ? ' warn' : '') }, [
				el('span', { text: label }), v
			]);
			return { node: node, set: function (x) { v.textContent = x; }, hide: function (h) { node.hidden = !!h; } };
		}
		var stPool = statNode(CFI.T('候选池'));
		var stQual = statNode(CFI.T('达标'));
		var stBoard = statNode(CFI.T('榜单'));
		var stFail = statNode(CFI.T('未达标'), true);
		var statGrid = el('div', { class: 'stat-grid' }, [
			stPool.node, stQual.node, stBoard.node, stFail.node
		]);
		var sumSub = el('span', { class: 'sub' });
		var sumDomain = el('span');
		var sumDuration = el('span');
		var summaryCard = el('article', { class: 'card' }, [
			el('div', { class: 'card-h' }, [ el('h2', { text: CFI.T('本轮概况') }), sumSub ]),
			statGrid,
			el('div', { class: 'footnote' }, [ sumDomain, sumDuration ])
		]);

		var sortSel = el('select', { class: 'ctl', 'aria-label': CFI.T('排序') }, [
			el('option', { value: 'ttfb', text: CFI.T('按首字节') }),
			el('option', { value: 'spd', text: CFI.T('按速度') }),
			el('option', { value: 'colo', text: CFI.T('按机房') })
		]);
		sortSel.value = bui.sort.key;
		sortSel.addEventListener('change', function () {
			/* 下拉只给列名、不给方向，所以每次都回到该列的默认方向（速度=降序）。 */
			bui.sort = { key: sortSel.value, dir: sortDefDir(sortSel.value) };
			CFI.prefs.set(CFI.prefs.NS + 'board.sort2', JSON.stringify(bui.sort));
			paintBoard(true);
		});
		var filterSel = el('select', { class: 'ctl', 'aria-label': CFI.T('筛选') }, [
			el('option', { value: 'all', text: CFI.T('全部') }),
			el('option', { value: 'speed', text: CFI.T('有吞吐') }),
			el('option', { value: 'issue', text: CFI.T('有质量问题') })
		]);
		filterSel.value = bui.filter;
		/* 「只看此机房」用的动态项：选中时插一条 option，切走就收回，列表不会越用越长。
		 * 原来这个过滤是靠搜索框承载的（把机房名塞进搜索值），搜索框去掉后改挂在这里，
		 * 状态在筛选下拉里看得见，清掉就是选「全部」。 */
		var coloOpt = null;
		function setColoFilter(colo) {
			colo = String(colo || '');
			if (!colo) {
				bui.colo = '';
				if (coloOpt) {
					filterSel.removeChild(coloOpt);
					coloOpt = null;
				}
				if (bui.filter === 'colo') {
					bui.filter = 'all';
					filterSel.value = 'all';
				}
				return;
			}
			if (!coloOpt) {
				coloOpt = el('option', { value: 'colo' });
				filterSel.appendChild(coloOpt);
			}
			coloOpt.text = CFI.T('只看 %s').format(colo);
			bui.colo = colo;
			bui.filter = 'colo';
			filterSel.value = 'colo';
		}
		filterSel.addEventListener('change', function () {
			bui.filter = filterSel.value;
			if (bui.filter !== 'colo')
				setColoFilter('');
			CFI.prefs.set(CFI.prefs.NS + 'board.filter', bui.filter);
			paintBoard(true);
		});

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
			/* r209：colsSig 变化（指标 / 单位 / 多域名）会整表重建，旧表那两个
			 * window 监听器必须先摘掉再换，否则每次换口径都多留一对闭包。 */
			if (table && table.destroy)
				table.destroy();
			table = CFI.ui.Table({
				cols: cols,
				/* 原来是「按首字节排序的可用 IP」，但用户能切成按速度 / 按机房，
				 * caption 只在重建表时生成、不会跟着变，索性写中性表述。 */
				caption: CFI.T('榜单：本轮达标的可用 IP 与实测读数'),
				keyOf: function (it, i) { return it.ip || ('#' + i); },
				rowSig: function (it) { return CFI.store.rowSig(it) + '|' + bui.sort.key + bui.sort.dir + bui.filter + bui.colo; },
				cell: function (it, i, c) { return cellOf(it, i, c, lastSt); },
				sort: bui.sort,
				onSort: function (k) {
					if (bui.sort.key === k)
						bui.sort.dir = bui.sort.dir === 'asc' ? 'desc' : 'asc';
					else
						bui.sort = { key: k, dir: sortDefDir(k) };
					sortSel.value = k;
					CFI.prefs.set(CFI.prefs.NS + 'board.sort2', JSON.stringify(bui.sort));
					paintBoard(true);
				},
				onActivate: function (key) { openDrawer(key); },
				empty: function () { return CFI.ui.Empty({ title: CFI.T('没有达标 IP'), detail: CFI.T('这一轮没有可用的结果；去「日志」看最后几行。') }); }
			});
			CFI.dom.clear(boardWrap);
			boardWrap.appendChild(table.node);
		}

		var boardWrap = el('div', { class: 'board-wrap' });
		var boardSub = el('span', { class: 'sub' });
		var boardSec = el('article', { class: 'card cfp-board', hidden: true }, [
			el('div', { class: 'card-h' }, [
				el('h2', { text: CFI.T('榜单') }), boardSub,
				el('div', { class: 'right board-tools' }, [ sortSel, filterSel, colMenu ])
			]),
			progressHost,
			recentHost,
			boardWrap
		]);

		var dcList = CFI.ui.DcList({ onTest: actions.testIp });
		var dcHead = el('div', { class: 'dc-head' }, [
			el('span', { text: CFI.T('机房') }),
			el('span', { class: 'r', text: CFI.T('可用') }),
			el('span', { class: 'r', text: CFI.T('首字节中位') }),
			el('span', { text: CFI.T('最佳 IP') }),
			el('span', { class: 'r', text: CFI.T('操作') })
		]);
		var dcSec = el('article', { class: 'card cfp-dc', hidden: true }, [
			el('div', { class: 'card-h' }, [ el('h2', { text: CFI.T('机房分布') }), el('span', { class: 'sub', text: CFI.T('按首字节中位值 · 点行展开可单测') }) ]),
			dcHead,
			dcList.node
		]);

		var btnCopy = CFI.ui.Button({ kind: 'quiet', icon: 'copy', label: CFI.T('复制榜单 IP'), onClick: actions.copy });
		var btnCsv = CFI.ui.Button({ kind: 'quiet', label: CFI.T('下载 CSV'), onClick: actions.csv });
		var btnDns = CFI.ui.Button({ kind: 'quiet', label: CFI.T('立即写一次 DNS'), onClick: actions.dns });
		var actionsCard = el('article', { class: 'card' }, [
			el('div', { class: 'card-h' }, [ el('h2', { text: CFI.T('动作') }) ]),
			el('div', { class: 'action-list' }, [ btnCopy.node, btnCsv.node, btnDns.node ])
		]);

		var body = el('div', { class: 'run-body' }, [
			bannerHost,
			el('div', { class: 'cfp-main' }, [
				el('div', { class: 'cfp-main-col' }, [ boardSec, dcSec ]),
				el('aside', { class: 'cfp-side' }, [ summaryCard, actionsCard ])
			])
		]);

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

	/* r209：榜单能按速度/机房排序、也能只看某机房，但「首选」是引擎给出的
	 * 本轮第一名，不该跟着用户的排序跑到任意一行去。表格的 # 列是当前视图
	 * 行号；抽屉里的「引擎名次」是另一个口径，两者标签必须说清楚。 */
	function leadIp(st) {
		var items = st && st.items ? st.items : [];
		return items.length ? String(items[0].ip || '') : '';
	}
	function engineRank(items, ip) {
		for (var i = 0; i < items.length; i++)
			if (String(items[i].ip) === String(ip))
				return i + 1;
		return null;
	}

	function cellOf(it, i, c, st) {
		if (c.key === 'rk')
			return el('span', { class: 'rk n', text: String(i + 1) });
		if (c.key === 'ip') {
			var ipKids = [ el('span', { text: it.ip || '?' }) ];
			if (it.ip && String(it.ip) === leadIp(st))
				ipKids.push(el('span', { class: 'lead', text: CFI.T('首选') }));
			return el('span', { class: 'ip mono' }, ipKids);
		}
			if (c.key === 'code') {
				var ok = it.code != null && it.code >= 200 && it.code < 300;
				return el('span', { class: (ok ? 'ok' : 'warn') + ' n', text: it.code != null ? String(it.code) : F.DASH });
			}
			if (c.key === 'tcp') return el('span', { class: 'n', text: F.ms(it.connect_ms) });
			if (c.key === 'tls') return el('span', { class: 'n', text: F.ms(it.tls_ms) });
			if (c.key === 'total') return el('span', { class: 'n', text: F.ms(it.total_ms) });
			if (c.key === 'colo') {
				var colo = it.colo ? String(it.colo) : '';
				var kids = [ el('span', { class: 'n', text: colo || F.DASH }) ];
				var cn = CFI.colo.name(colo);
				if (cn)
					kids.push(el('span', { class: 'colo-name', text: cn }));
				return el('span', { class: 'colocell' }, kids);
			}
			if (c.key === 'domain') return el('span', { class: 'dim', text: it.domain || F.DASH });
			if (c.key === 'ttfb') {
				var v = metricOf(it, st);
				var nv = Number(v);
				/* 颜色是粗分档，不是准入门槛：HTTP 300/500ms，TCP 80/150ms。
				 * 准入门槛仍由引擎的 ttfb_limit / total_limit 决定。 */
				var okAt = st.probe_metric === 'tcp' ? 80 : 300;
				var warnAt = st.probe_metric === 'tcp' ? 150 : 500;
				var tone = !isFinite(nv) || nv <= 0 ? '' :
					(nv <= okAt ? ' ok' : (nv <= warnAt ? ' warn' : ' bad'));
				var kids = [ el('span', { class: 'n' + tone, text: F.ms(v) }) ];
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
			return el('span', { class: q ? 'q' : 'q none', text: q || F.DASH, title: QUALITY_NOTE });
		}

		/* 「首字节 / TCP」这一列到底看哪个数（r205）：probe_metric=tcp 时列里显示的
		 * 是 connect_ms（表头也写着 TCP），可排序一直拿 ttfb_ms —— 切了指标之后，
		 * 列里看着升序、实际按另一列排，名次和数字对不上。渲染与排序共用这一个
		 * 函数，两边不可能再各说一套。 */
		function metricOf(it, st) {
			if (!it) return null;
			if (st && st.probe_metric === 'tcp' && it.connect_ms != null) return it.connect_ms;
			return it.ttfb_ms;
		}
		function metricMs(it, st) {
			var v = metricOf(it, st);
			if (v == null || v === '') return 1e9;
			var n = Number(v);
			return isFinite(n) ? n : 1e9;
		}

		function sortedFiltered(items) {
			var out = (items || []).filter(function (it) {
				if (bui.filter === 'speed') {
					var s = F.speedOf(it, lastSt.speed_unit === 'mib' ? 'mib' : 'mb');
					if (!(s > 0)) return false;
				}
				if (bui.filter === 'issue' && !quality(it)) return false;
				if (bui.filter === 'colo' && String(it.colo || '') !== bui.colo) return false;
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
					x = metricMs(a, lastSt);
					y = metricMs(b, lastSt);
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
			return engineRank(lastItems, ip);
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
			/* r232：样本数区分三种情况，别再一律说「只测到一遍」——
			   spread 为空且 samples 为 0，说明这颗只跑了粗筛（压根没进精测），
			   说成「测了但只成一遍」是在暗示链路不稳，方向刚好相反。 */
			var smp = Number(it.speed_samples) || 0;
			var spreadTxt = F.DASH;
			if (it.speed_spread != null && isFinite(Number(it.speed_spread)))
				spreadTxt = Math.round(Number(it.speed_spread) * 100) + '%';
			else if (smp === 0 && it.speed_bps != null)
				spreadTxt = CFI.T('仅粗测（未进精测）');
			else if (smp === 1)
				spreadTxt = CFI.T('精测仅成 1 遍');
			else if (smp >= 2)
				spreadTxt = CFI.T('精测 %s 遍').format(smp);
			var rows = [
				[ CFI.T('引擎名次'), rankOf(it.ip) ? String(rankOf(it.ip)) : F.DASH ],
				[ CFI.T('HTTP'), it.code != null ? String(it.code) : F.DASH ],
				[ CFI.T('TCP 建连'), F.ms(it.connect_ms) + ' ms' ],
				[ CFI.T('TLS'), F.ms(it.tls_ms) + ' ms' ],
				[ CFI.T('首字节耗时'), F.ms(it.ttfb_ms) + ' ms' ],
				[ CFI.T('总耗时'), F.ms(it.total_ms) + ' ms' ],
				[ CFI.T('机房'), it.colo || F.DASH, it.colo ? CFI.colo.name(it.colo) : '' ],
				[ CFI.T('胜出域名'), it.domain || F.DASH ],
				[ CFI.T('吞吐'), F.mbps(F.speedOf(it, st.speed_unit === 'mib' ? 'mib' : 'mb')) + unit ],
				[ CFI.T('吞吐波动'), spreadTxt ],
				[ CFI.T('丢包'), it.loss != null && isFinite(Number(it.loss)) ? (Number(it.loss) * 100).toFixed(1) + '%' : F.DASH ],
				[ CFI.T('抖动'), F.ms(it.jitter_ms) + ' ms' ],
				[ 'CF-RAY', it.ray_ok == null ? F.DASH : (Number(it.ray_ok) ? CFI.T('已验到') : CFI.T('未验到')) ]
			];
			/* r201：拆成左右两栏（各占一半）。12 项单列时弹窗右侧整片空着，
			   拆开按原顺序前后切，窄屏 CSS 退回单列仍是原顺序，不会错位。 */
			var kv2 = el('div', { class: 'kv2' });
			var half = Math.ceil(rows.length / 2);
			[0, half].forEach(function (from) {
				var list = el('dl', { class: 'kv' });
				rows.slice(from, from + half).forEach(function (r) {
					list.appendChild(el('dt', { text: r[0] }));
					var dd = el('dd', { class: 'n' }, [ el('span', { text: r[1] }), r[2] ? el('span', { class: 'colo-name', text: r[2] }) : null ]);
					list.appendChild(dd);
				});
				kv2.appendChild(list);
			});
			var kids = [ kv2 ];
			var tb = timingBlock(it);
			if (tb)
				kids.push(tb);
			kids.push(el('div', { class: 'drawer-a' }, [
				CFI.ui.Button({ kind: 'primary', label: CFI.T('复制此 IP'), onClick: function () { actions.copyText(String(it.ip || '')); } }).node,
				CFI.ui.Button({ kind: 'quiet', label: CFI.T('复制为产物行'), onClick: function () { actions.copyText(CFI.T('%s# %s').format(String(it.ip || ''), String(it.colo || ''))); } }).node,
				CFI.ui.Button({ kind: 'quiet', label: CFI.T('只看此机房'), onClick: function () { setColoFilter(String(it.colo || '')); paintBoard(true); } }).node
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

		/* r233：抽屉内容签名。轮询每 3 秒跑一次，boardKey 变化就会重开抽屉——
		   如果用户正好按在「复制此 IP」上，down/up 落在两个不同节点，浏览器
		   不会合成 click（正是 Table 注释里花大力气避开的那类事故）。签名
		   不变就跳过重建；轮次刚结束、读数真正变化时才会换节点。 */
		function drawerSig(it) {
			return it ? JSON.stringify(it) : 'gone';
		}

		function openDrawer(ip, silent) {
			bui.sel = ip;
			var it = itemOf(ip);
			if (it)
				snap = it;
			last.drawer = String(ip) + '|' + drawerSig(it) + '|' + drawerSig(it ? null : snap);
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
			var ip = bui.sel;
			bui.sel = null;
			if (table) {
				table.update({ rows: sortedFiltered(lastItems), sort: bui.sort, selected: null, hidden: hiddenCols });
				if (ip && table.focusKey && typeof setTimeout === 'function')
					setTimeout(function () { table.focusKey(ip); }, 0);
				else if (ip && table.focusKey)
					table.focusKey(ip);
			}
		}

		/* ---- 状态 ---------------------------------------------------- */
		function paintRound(st) {
			/* 新一轮开始/结束：上一次单测结果不再属于当前榜单 */
			if (dcList && dcList.clearTests)
				dcList.clearTests();
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
			stPool.set(F.num(st.pool));
			stQual.set(F.num(st.qualified));
			/* r230：usable 只数「会进 best-ip.txt / CSV 的行」，补足行（below_gate=1）
			   不算 —— 否则页面说 10 条可用、用户下载 CSV 只有 9 行。补足数单独由
			   below_gate 给出，下面在副标题里标注，免得信息反而丢了。
			   旧引擎的 status 没有这个语义，回退成 items 减补足数。 */
			var bgN = Number(st.below_gate) || 0;
			var useN = st.usable != null
				? (Number(st.usable) || 0)
				: Math.max(0, (st.items || []).length - bgN);
			stBoard.set(F.num(useN));
			stFail.hide(!(fail > 0));
			if (fail > 0)
				stFail.set(F.num(fail));
			sumSub.textContent = st.finished ? F.clock(st.finished) : (st.started ? F.clock(st.started) : '');
			sumDomain.textContent = st.domains ? (CFI.T('探测域名 %s').format(String(st.domains))) : '';
			var t0 = Date.parse(st.started), t1 = Date.parse(st.finished);
			sumDuration.textContent = isFinite(t0) && isFinite(t1) && t1 >= t0
				? CFI.T('耗时 %s s').format(String(Math.round((t1 - t0) / 1000))) : '';
			boardSub.textContent = st.state === 'running'
				? CFI.T('测速中')
				: (useN ? CFI.T('%s 条可用').format(String(useN)) : '') +
					(bgN > 0 ? CFI.T('，另有 %s 条补足（只进详情）').format(String(bgN)) : '') +
					/* r233：引擎 published=false 时 best-ip.txt / CSV 保持上一轮内容，
					   result.json 却是本轮的 —— 两份产物不一致必须让用户看见，
					   不然他会以为下载到的清单就是刚测完的这批。 */
					(st.published === false && st.state === 'done'
						? CFI.T('；本轮无可发布 IP，best-ip.txt 仍是上一轮') : '');
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
					action: CFI.ui.Button({ kind: 'link', label: CFI.T('去看日志'), onClick: actions.gotoLogs }).node
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
				dcList.update([], null, st.state === 'running');
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
			dcList.update(list, st.speed_unit === 'mib' ? 1048576 : 1000000, st.state === 'running');
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
			var runningEmpty = st.state === 'running' && !lastItems.length;

			/* 运行中没有结果时只显示进度，不把“没有达标 IP”当成结论。 */
			boardWrap.hidden = runningEmpty;
			boardSec.hidden = !lastItems.length && st.state !== 'running' && st.state !== 'done';

			var k = CFI.store.roundKey(st);
			if (k !== last.round) {
				last.round = k;
				paintRound(st);
				paintBanner(st);
				/* 新一轮换一个进度实例：上一轮的 100% 不能靠单调钳位带进来。 */
				if (progress) {
					CFI.dom.clear(progressHost);
					progress = null;
				}
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
			/* r198：只在 running 时显示流水；内容没变就不重绘，避免每 3 秒
			 * 把整个列表换掉（滚动位置/选中态都会丢）。耗时文本单独更新。 */
			recentHost.hidden = st.state !== 'running';
			if (st.state === 'running') {
				var arr = st.recent || [];
				var rk = arr.join('|');
				if (rk !== last.recent) {
					last.recent = rk;
					CFI.dom.clear(recentList);
					for (var ri = 0; ri < arr.length; ri++)
						recentList.appendChild(el('div',
							{ class: 'run-recent-line', text: String(arr[ri]) }));
				}
				recentElapsed.textContent = elapsedText(st.started);
			} else {
				last.recent = '';
			}
			var kb = CFI.store.boardKey(st);
			if (kb !== last.board) {
				last.board = kb;
				paintBoard(true);
				if (bui.sel && drawer.isOpen && drawer.isOpen()) {
					var cur = itemOf(bui.sel);
					if (cur)
						snap = cur;
					var dk = String(bui.sel) + '|' + drawerSig(cur) + '|' + drawerSig(cur ? null : snap);
					if (dk !== last.drawer) {
						last.drawer = dk;
						drawer.open(String(bui.sel), drawerBody(cur || snap || { ip: bui.sel }, !cur));
					}
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
			/* r209：外壳 teardown 时把表格的 window 监听器摘掉 */
			destroy: function () { if (table && table.destroy) table.destroy(); },
			onDrawerClosed: onDrawerClosed
		};
	}

	CFI.panels = CFI.panels || {};
	CFI.panels.run = { mount: mount };
})(CFI);
