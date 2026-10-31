(function (CFI) {
	'use strict';

	var el = CFI.dom.el;
	var icon = CFI.dom.icon;

	/* 表头问号的悬浮说明：挂到 body 才能逃出 .tbl-scroll 的 overflow 裁剪。 */
	var tipNode = null;
	var tipAnchor = null;
	var tipSeq = 0;
	function hideTip() {
		if (tipNode && tipNode.parentNode)
			tipNode.parentNode.removeChild(tipNode);
		if (tipAnchor)
			tipAnchor.removeAttribute('aria-describedby');
		tipNode = null;
		tipAnchor = null;
		if (typeof window !== 'undefined') {
			window.removeEventListener('scroll', hideTip, true);
			window.removeEventListener('resize', hideTip, false);
		}
	}
	function showTip(anchor, text) {
		hideTip();
		tipNode = el('div', { class: 'cfp-tip', role: 'tooltip', text: text });
		document.body.appendChild(tipNode);
		tipAnchor = anchor;
		tipNode.id = 'cfp-tip-' + (++tipSeq);
		anchor.setAttribute('aria-describedby', tipNode.id);
		var r = anchor.getBoundingClientRect();
		var vw = window.innerWidth || 320;
		var w = Math.min(320, vw - 24);
		tipNode.style.width = w + 'px';
		tipNode.style.left = Math.max(12, Math.min(r.right - w, vw - w - 12)) + 'px';
		tipNode.style.top = (r.bottom + 8) + 'px';
		var h = tipNode.offsetHeight || 0;
		if (r.bottom + 8 + h > (window.innerHeight || 0) - 12)
			tipNode.style.top = Math.max(12, r.top - h - 8) + 'px';
		window.addEventListener('scroll', hideTip, true);
		window.addEventListener('resize', hideTip, false);
	}

	/* 按钮：节点只建一次，update 只改文案/禁用/忙碌 —— 真实鼠标的 down/up
	 * 落在同一颗节点上，浏览器才会合成 click。 */
	function btnClass(kind) {
		kind = kind || 'quiet';
		if (kind === 'primary')
			return 'btn primary cbi-button cbi-button-action important';
		if (kind === 'danger')
			return 'btn danger cbi-button cbi-button-negative';
		if (kind === 'link')
			return 'btn link';
		return 'btn ' + kind + ' cbi-button';
	}

	function Button(p) {
		var b = el('button', { class: btnClass(p.kind), type: 'button' });
		if (p.ariaLabel)
			b.setAttribute('aria-label', p.ariaLabel);
		var ic = p.icon ? icon(p.icon) : null;
		if (ic)
			b.appendChild(el('span', { class: 'bi' }, ic));
		var label = el('span', { class: 'btn-t', text: p.label || '' });
		b.appendChild(label);
		if (p.onClick)
			b.addEventListener('click', p.onClick);
		function update(q) {
			q = q || {};
			if (q.label != null)
				label.textContent = String(q.label);
			if (q.disabled !== undefined)
				b.disabled = !!q.disabled;
			b.className = btnClass(q.kind || p.kind || 'quiet') + (q.busy ? ' busy spinning' : '');
			b.setAttribute('aria-busy', q.busy ? 'true' : 'false');
			if (q.title !== undefined) {
				if (q.title)
					b.setAttribute('title', q.title);
				else
					b.removeAttribute('title');
			}
			if (q.hidden !== undefined)
				b.hidden = !!q.hidden;
		}
		update({ kind: p.kind, disabled: p.disabled, title: p.title });
		return { node: b, update: update };
	}

	/* 读数：值 + 单位 + 标签 + 副行；只改文本，不换节点 */
	function Readout(p) {
		var val = el('span', { class: 'ro-v n' });
		var unit = el('span', { class: 'ro-u', text: p.unit || '' });
		var lab = el('div', { class: 'ro-k', text: p.label || '' });
		var sub = el('div', { class: 'ro-s' });
		var node = el('div', { class: 'ro' + (p.primary ? ' primary' : '') + (p.wide ? ' wide' : '') }, [
			lab,
			el('div', { class: 'ro-vals' }, [ val, unit ]),
			sub
		]);
		function update(q) {
			q = q || {};
			val.textContent = q.value == null ? CFI.fmt.DASH : String(q.value);
			unit.textContent = q.unit || '';
			if (q.label != null)
				lab.textContent = String(q.label);
			sub.textContent = q.sub || '';
			node.className = 'ro' + (q.primary ? ' primary' : '') + (q.wide ? ' wide' : '') +
				(q.tone ? ' t-' + q.tone : '');
			if (q.title)
				node.setAttribute('title', q.title);
		}
		update({ value: p.value, sub: p.sub, tone: p.tone, primary: p.primary });
		return { node: node, update: update };
	}

	/* 表格：表头只建一次；tbody 按 key 复用行节点。
	 * 指针按下到抬起之间不替换行内容（否则 Chromium 不合成 click）。 */
	function Table(p) {
		var caption = el('caption', { class: 'sr-only', text: p.caption || '' });
		var thead = el('thead');
		var tbody = el('tbody');
		var table = el('table', { class: 'tbl table cbi-section-table' + (p.dense ? ' dense' : '') }, [ caption, thead, tbody ]);
		var scroll = el('div', { class: 'tbl-scroll' }, table);
		var cols = p.cols || [];
		var map = {};
		var sigs = {};
		var order = [];
		var pointerDown = 0;
		var pending = null;

		function buildHead() {
			CFI.dom.clear(thead);
			hideTip();
			var tr = el('tr', { class: 'tr table-titles' });
			cols.forEach(function (c) {
				var th = el('th', { class: 'th ' + (c.cls || ''), scope: 'col' });
				if (c.tip) {
					th.appendChild(document.createTextNode(c.h));
					var tip = el('span', {
						class: 'th-tip', text: '?', tabindex: '0', role: 'note', 'aria-label': c.tip
					});
					tip.addEventListener('mouseenter', function () { showTip(tip, c.tip); });
					tip.addEventListener('focus', function () { showTip(tip, c.tip); });
					tip.addEventListener('mouseleave', hideTip);
					tip.addEventListener('blur', hideTip);
					th.appendChild(tip);
				} else {
					th.textContent = c.h;
				}
				if (c.sortable && p.onSort) {
					th.tabIndex = 0;
					th.setAttribute('aria-sort', 'none');
					th.addEventListener('click', function () { p.onSort(c.key); });
					th.addEventListener('keydown', function (ev) {
						if (ev.key === 'Enter' || ev.key === ' ') {
							ev.preventDefault();
							p.onSort(c.key);
						}
					});
					th.__sortKey = c.key;
				}
				tr.appendChild(th);
			});
			thead.appendChild(tr);
		}

		function paintHead(sort) {
			sort = sort || {};
			var ths = thead.firstChild ? thead.firstChild.childNodes : [];
			for (var i = 0; i < ths.length; i++) {
				var key = ths[i].__sortKey;
				if (!key)
					continue;
				var dir = sort.key === key ? sort.dir : 'none';
				ths[i].setAttribute('aria-sort', dir === 'asc' ? 'ascending' : (dir === 'desc' ? 'descending' : 'none'));
				ths[i].className = (cols[i] && cols[i].cls ? cols[i].cls + ' ' : '') + 'sortable' +
					(sort.key === key ? ' s-' + dir : '');
			}
		}

		tbody.addEventListener('mousedown', function () { pointerDown = 1; });
		tbody.addEventListener('touchstart', function () { pointerDown = 1; });
		try {
			window.addEventListener('mouseup', function () {
				if (!pointerDown)
					return;
				pointerDown = 0;
				if (pending) {
					var q = pending;
					pending = null;
					apply(q);
				}
			});
			window.addEventListener('touchend', function () {
				if (!pointerDown)
					return;
				pointerDown = 0;
				if (pending) {
					var q = pending;
					pending = null;
					apply(q);
				}
			});
		} catch (e) {}

		if (p.onActivate) {
			tbody.addEventListener('click', function (ev) {
				var tr = ev.target;
				while (tr && tr !== tbody && tr.tagName !== 'TR')
					tr = tr.parentNode;
				if (tr && tr !== tbody && tr.__key != null)
					p.onActivate(tr.__key, ev);
			});
			tbody.addEventListener('keydown', function (ev) {
				if (ev.key !== 'Enter' && ev.key !== ' ')
					return;
				var tr = ev.target;
				if (tr && tr.tagName === 'TR' && tr.__key != null) {
					ev.preventDefault();
					p.onActivate(tr.__key, ev);
				}
			});
		}

		function cellNode(it, i, c) {
			return p.cell(it, i, c);
		}

		function buildRow(key, it, i) {
			var tr = el('tr', { tabindex: '0' });
			tr.__key = key;
			tr.__cells = [];
			cols.forEach(function (c) {
				var td = el('td', { class: c.cls || '', 'data-label': c.h || '' });
				CFI.dom.append(td, cellNode(it, i, c));
				tr.__cells.push(td);
				tr.appendChild(td);
			});
			return tr;
		}

		function apply(q) {
			q = q || {};
			var rows = q.rows || [];
			var keys = [];
			/* 空态占位行在每次更新前先摘掉，否则有数据时它会一直留在表尾 */
			var empties = tbody.querySelectorAll ? tbody.querySelectorAll('.empty-row') : [];
			for (var e = 0; e < empties.length; e++)
				if (empties[e].parentNode)
					empties[e].parentNode.removeChild(empties[e]);
			
			var i, key, it, tr;
			for (i = 0; i < rows.length; i++) {
				it = rows[i];
				key = String(p.keyOf(it, i));
				keys.push(key);
				var sig = String(p.rowSig ? p.rowSig(it, i) : '');
				tr = map[key];
				if (!tr) {
					tr = buildRow(key, it, i);
					map[key] = tr;
				} else if (sigs[key] !== sig) {
					/* 内容变了：先清空单元格再重建（行节点保留） */
					for (var k = 0; k < tr.__cells.length; k++)
						CFI.dom.clear(tr.__cells[k]);
					for (var c2 = 0; c2 < cols.length; c2++) {
						tr.__cells[c2].setAttribute('data-label', cols[c2].h || '');
						CFI.dom.append(tr.__cells[c2], cellNode(it, i, cols[c2]));
					}
				}
				sigs[key] = sig;
				tr.className = (i === 0 ? 'top ' : '') + (q.selected === key ? 'sel' : '');
				tr.setAttribute('aria-selected', q.selected === key ? 'true' : 'false');
			}
			/* 顺序与删除：只在需要时动 DOM */
			var same = order.length === keys.length;
			for (i = 0; same && i < keys.length; i++)
				if (order[i] !== keys[i])
					same = false;
			if (!same) {
				var cur = tbody.firstChild;
				for (i = 0; i < keys.length; i++) {
					tr = map[keys[i]];
					if (cur === tr) {
						cur = cur.nextSibling;
					} else {
						tbody.insertBefore(tr, cur);
					}
				}
				while (cur) {
					var next = cur.nextSibling;
					tbody.removeChild(cur);
					cur = next;
				}
				order = keys;
			}
			for (key in map) {
				if (!Object.prototype.hasOwnProperty.call(map, key))
					continue;
				if (keys.indexOf(key) < 0) {
					if (map[key].parentNode)
						map[key].parentNode.removeChild(map[key]);
					delete map[key];
					delete sigs[key];
				}
			}
			if (q.hidden && q.hidden.length) {
				scroll.className = 'tbl-scroll hide-' + q.hidden.join(' hide-');
			} else {
				scroll.className = 'tbl-scroll';
			}
			if (!rows.length && p.empty) {
				CFI.dom.clear(tbody);
				var td = el('td', { colspan: String(cols.length), class: 'tbl-empty' });
				td.appendChild(p.empty());
				var tr2 = el('tr', { class: 'empty-row' }, td);
				tbody.appendChild(tr2);
				order = [];
			}
		}

		function update(q) {
			if (pointerDown) {
				pending = q;
				return;
			}
			apply(q);
		}

		buildHead();
		apply({ rows: p.rows || [], sort: p.sort, selected: p.selected });
		return {
			node: scroll,
			update: update,
			paintHead: paintHead,
			focusKey: function (key) {
				var tr = map[String(key)];
				if (tr && tr.focus)
					tr.focus();
			}
		};
	}

	/* 机房分布：<details> 按机房 key 复用。旧实现每拍清空重建 —— 展开状态能
	 * 靠外部记录恢复，但真实点击落在「清空到重建」之间就不会展开（同 r29 事故）。
	 * 这里只改单元格文本，节点与 open 状态都留在 DOM 里。 */
	function DcList(p) {
		p = p || {};
		var host = el('div', { class: 'dcs' });
		var nodes = {};
		var unit = 1000000;
		var onTest = p.onTest || null;
		var tests = {};
		var busy = null;
		var blocked = false;
		var epoch = 0;

		function span(cls, text) {
			return el('span', { class: cls, text: text });
		}

		function fmtSpeed(bps) {
			if (bps == null || bps === '' || !isFinite(Number(bps)))
				return CFI.fmt.DASH;
			return (Number(bps) / unit).toFixed(2);
		}

		function speedUnit() {
			return unit === 1048576 ? ' MiB/s' : ' MB/s';
		}

		function errText(d) {
			if (d.ok === false) {
				if (d.error === 'running')
					return CFI.T('整轮还在跑，结束后再试。');
				if (d.error === 'hung')
					return CFI.T('引擎没有回应。');
				if (d.error === 'unreachable')
					return CFI.T('调不到引擎。');
				if (d.error === 'invalid_ip')
					return CFI.T('IP 不合法。');
				return CFI.T('没测到。');
			}
			if (d.err && d.err !== 'none') {
				var e = CFI.T('连不上：%s').format(CFI.sem.errKindName(d.err));
				if (d.code)
					e += ' · HTTP ' + String(d.code);
				return e;
			}
			return '';
		}

		function resultText(ip, mode) {
			var t = tests[ip] && tests[ip][mode];
			if (!t)
				return '';
			if (t.state === 'busy')
				return mode === 'speed' ? CFI.T('测速中…') : CFI.T('延迟测量中…');
			var d = t.data || {};
			var err = errText(d);
			if (err)
				return err;
			var parts = [];
			if (d.code != null)
				parts.push('HTTP ' + String(d.code));
			if (d.ttfb_ms != null)
				parts.push('首字节 ' + CFI.fmt.ms(d.ttfb_ms) + ' ms');
			if (mode === 'speed') {
				if (d.speed_bps != null && Number(d.speed_bps) > 0) {
					parts.push(fmtSpeed(d.speed_bps) + speedUnit());
					if (Number(d.speed_truncated))
						parts.push(CFI.T('截断'));
				} else {
					parts.push(CFI.T('吞吐未测到'));
				}
			}
			return (mode === 'speed' ? CFI.T('测速：') : CFI.T('延迟：')) + parts.join(' · ');
		}

		function build() {
			var d = el('details', { class: 'dc' });
			var code = el('span', { class: 'mono' });
			var n = {
				d: d, code: code,
				count: span('r mono', ''),
				med: span('r mono', ''),
				best: span('mono', '')
			};
			d.appendChild(el('summary', {}, [ code, n.count, n.med, n.best ]));
			n.inner = el('div', { class: 'dcitems' });
			d.appendChild(n.inner);
			n.ss = '';
			n.isig = '';
			n.refs = {};
			return n;
		}

		function sumSig(r) {
			return [ r.dc, r.count, r.ttfb_med, r.best_ip, r.empty ? 1 : 0 ].join('|');
		}

		function paintSummary(n, r) {
			CFI.dom.clear(n.code);
			n.code.appendChild(document.createTextNode(String(r.dc)));
			if (r.empty)
				n.code.appendChild(el('span', { class: 'tag', text: CFI.T('本轮无') }));
			n.count.textContent = CFI.fmt.num(r.count);
			n.med.textContent = CFI.fmt.ms(r.ttfb_med);
			n.best.textContent = r.best_ip ? String(r.best_ip) : CFI.fmt.DASH;
			n.d.className = 'dc' + (r.empty ? ' dim' : '');
		}

		function innerSig(r) {
			var items = r.items || [];
			var out = [ r.items_total || '', items.length ];
			for (var i = 0; i < items.length; i++) {
				var x = items[i] || {};
				out.push(x.ip, x.ttfb_ms, x.speed_bps);
			}
			return out.join(',');
		}

		function syncRef(n, ip) {
			var r = n.refs && n.refs[ip];
			if (!r)
				return;
			var dis = blocked || !!busy;
			var dRun = busy && busy.ip === ip && busy.mode === 'delay';
			var sRun = busy && busy.ip === ip && busy.mode === 'speed';
			r.delay.update({ disabled: dis, label: dRun ? CFI.T('延迟中…') : CFI.T('延迟') });
			r.speed.update({ disabled: dis, label: sRun ? CFI.T('测速中…') : CFI.T('测速') });
			r.delay.node.setAttribute('title', blocked ? CFI.T('本轮测速进行中，结束后再试') : CFI.T('只测这一次，不下载大文件'));
			r.speed.node.setAttribute('title', blocked ? CFI.T('本轮测速进行中，结束后再试') : CFI.T('会下载最多 10MB 样本'));
			var lines = [];
			var dl = resultText(ip, 'delay');
			var sl = resultText(ip, 'speed');
			if (dl)
				lines.push(dl);
			if (sl)
				lines.push(sl);
			r.res.textContent = lines.join('\n');
			r.res.hidden = !lines.length;
		}

		function syncAll() {
			for (var code in nodes) {
				if (!Object.prototype.hasOwnProperty.call(nodes, code))
					continue;
				for (var ip in nodes[code].refs) {
					if (Object.prototype.hasOwnProperty.call(nodes[code].refs, ip))
						syncRef(nodes[code], ip);
				}
			}
		}

		function startTest(ip, mode) {
			if (blocked || busy || !onTest || !ip)
				return;
			var my = epoch;
			busy = { ip: ip, mode: mode };
			tests[ip] = tests[ip] || {};
			tests[ip][mode] = { state: 'busy' };
			syncAll();
			onTest(ip, mode).then(function (d) {
				if (my !== epoch)
					return;
				tests[ip][mode] = { state: 'done', data: d || { ok: false, error: 'unreachable' } };
				busy = null;
				syncAll();
			}, function () {
				if (my !== epoch)
					return;
				tests[ip][mode] = { state: 'done', data: { ok: false, error: 'unreachable' } };
				busy = null;
				syncAll();
			});
		}

		function addItem(n, x) {
			var ip = x.ip ? String(x.ip) : '';
			var db = CFI.ui.Button({
				kind: 'link', label: CFI.T('延迟'),
				ariaLabel: CFI.T('单独测延迟 %s').format(ip),
				onClick: function () { startTest(ip, 'delay'); }
			});
			var sb = CFI.ui.Button({
				kind: 'link', label: CFI.T('测速'),
				ariaLabel: CFI.T('单独测速 %s').format(ip),
				onClick: function () { startTest(ip, 'speed'); }
			});
			var res = el('span', { class: 'dcres mono', hidden: true });
			var row = el('div', { class: 'dcitem' }, [
				span('mono', ip || CFI.fmt.DASH),
				span('r mono', CFI.fmt.ms(x.ttfb_ms)),
				span('r mono', fmtSpeed(x.speed_bps)),
				el('span', { class: 'dcacts' }, [ db.node, sb.node ]),
				res
			]);
			n.inner.appendChild(row);
			n.refs[ip] = { row: row, delay: db, speed: sb, res: res };
		}

		function paintInner(n, r) {
			CFI.dom.clear(n.inner);
			n.refs = {};
			var items = (r.items || []).filter(function (x) { return x && typeof x === 'object'; });
			if (!items.length) {
				n.inner.appendChild(el('div', { class: 'dc-note dim' }, CFI.T('本轮这个机房没有可用 IP。')));
			} else {
				items.forEach(function (x) {
					addItem(n, x);
				});
				var total = Number(r.items_total);
				if (isFinite(total) && total > items.length)
					n.inner.appendChild(el('div', { class: 'dc-note dim' },
						CFI.T('这一块共 %s 条，引擎最多给 100 条，这里显示前 %s 条。').format(String(total), String(items.length))));
			}
			for (var ip in n.refs) {
				if (Object.prototype.hasOwnProperty.call(n.refs, ip))
					syncRef(n, ip);
			}
		}

		function update(rows, u, dis) {
			if (u != null)
				unit = u;
			blocked = !!dis;
			var list = rows || [];
			var keys = [];
			var map = {};
			for (var i = 0; i < list.length; i++) {
				var r = list[i];
				if (!r)
					continue;
				var code = String(r.dc);
				keys.push(code);
				map[code] = r;
			}
			for (var code2 in nodes) {
				if (!Object.prototype.hasOwnProperty.call(nodes, code2))
					continue;
				if (keys.indexOf(code2) < 0) {
					if (nodes[code2].d.parentNode)
						nodes[code2].d.parentNode.removeChild(nodes[code2].d);
					delete nodes[code2];
				}
			}
			for (var k = 0; k < keys.length; k++) {
				var key = keys[k];
				var row = map[key];
				var n = nodes[key];
				if (!n) {
					n = build();
					nodes[key] = n;
				}
				var ss = sumSig(row);
				if (n.ss !== ss) {
					n.ss = ss;
					paintSummary(n, row);
				}
				var isig = innerSig(row);
				if (n.isig !== isig) {
					n.isig = isig;
					paintInner(n, row);
				}
			}
			/* 只调整顺序与归属，不动已存在的节点 */
			var cur = host.firstChild;
			for (var j = 0; j < keys.length; j++) {
				var node = nodes[keys[j]].d;
				if (cur === node) {
					cur = cur.nextSibling;
				} else {
					host.insertBefore(node, cur);
				}
			}
			while (cur) {
				var next = cur.nextSibling;
				host.removeChild(cur);
				cur = next;
			}
			syncAll();
		}

		function clearTests() {
			epoch++;
			tests = {};
			busy = null;
			syncAll();
		}

		return {
			node: host,
			update: update,
			clearTests: clearTests,
			openSet: function () {
				var out = [];
				for (var k in nodes)
					if (Object.prototype.hasOwnProperty.call(nodes, k) && nodes[k].d.open)
						out.push(k);
				return out;
			},
			nodeFor: function (code) { return nodes[String(code)] ? nodes[String(code)].d : null; }
		};
	}

	/* 日志：增量追加 + 滚动锚点 + 过滤/暂停。 */
	function LogView(p) {
		var box = el('div', { class: 'logbox', 'aria-live': 'off', tabindex: '0' });
		var meta = el('span', { class: 'log-meta dim' });
		var pill = el('button', { class: 'log-pill btn link', type: 'button', hidden: true });
		var cap = p && p.cap ? p.cap : 600;
		var prev = '';
		var rows = 0;
		var filter = 'all';
		var full = false;
		var stick = true;

		function nearBottom() {
			return box.scrollHeight - box.scrollTop - (box.clientHeight || 0) < 24;
		}

		function appendLine(line) {
			var st = CFI.log.stamp(line, full);
			var tone = CFI.log.tone(line);
			var row = el('div', { class: 'lline' + (tone ? ' ' + tone : '') }, [
				el('span', { class: 'lts', text: st ? st.shown : '', title: st ? st.title : '' }),
				el('span', { class: 'lmsg', text: st ? st.rest : line })
			]);
			box.appendChild(row);
			rows++;
			if (rows > cap) {
				var h = box.scrollHeight;
				while (rows > cap && box.firstChild) {
					box.removeChild(box.firstChild);
					rows--;
				}
				box.scrollTop = Math.max(0, box.scrollTop - (h - box.scrollHeight));
			}
		}

		function rebuild(text) {
			CFI.dom.clear(box);
			rows = 0;
			var lines = String(text).split(/\r?\n/);
			for (var i = 0; i < lines.length; i++) {
				if (lines[i])
					appendLine(lines[i]);
			}
		}

		function ingest(text) {
			text = String(text || '');
			var follow = nearBottom();
			if (text === prev)
				return;
			if (prev && text.indexOf(prev) === 0) {
				var tail = text.slice(prev.length).split(/\r?\n/);
				for (var i = 0; i < tail.length; i++) {
					if (tail[i])
						appendLine(tail[i]);
				}
			} else if (prev && (prev.indexOf(text) === 0 ||
					(text.length < prev.length && prev.slice(-text.length) === text))) {
				/* 日志被轮转/截断：新文本只是旧文本的一段（掐头或去尾）。 */
				rebuild(text);
				if (rows)
					appendLine(CFI.T('日志已截断：较早的内容被丢弃'));
			} else {
				rebuild(text);
			}
			prev = text;
			if (stick && nearBottom()) {
				box.scrollTop = box.scrollHeight;
			} else {
				pill.hidden = false;
				pill.textContent = CFI.T('有新日志 ↓');
			}
			meta.textContent = CFI.T('%s 行').format(String(rows));
		}

		pill.addEventListener('click', function () {
			box.scrollTop = box.scrollHeight;
			pill.hidden = true;
		});

		function setFilter(f) {
			filter = f;
			box.className = 'logbox f-' + f;
		}

		function setFull(b) {
			full = !!b;
			var text = prev;
			rebuild(text);
			if (text)
				prev = text;
		}

		function setPaused(b) {
			box.className = 'logbox f-' + filter + (b ? ' paused' : '');
		}

		function setFollow(b) {
			stick = !!b;
			if (stick) {
				box.scrollTop = box.scrollHeight;
				pill.hidden = true;
			}
		}

		function notice(text) {
			CFI.dom.clear(box);
			rows = 0;
			prev = '';
			meta.textContent = '';
			box.appendChild(el('p', { class: 'log-notice dim', text: String(text || '') }));
		}

		return {
			node: el('div', { class: 'logwrap' }, [ meta, box, pill ]),
			ingest: ingest,
			notice: notice,
			setFilter: setFilter,
			setFull: setFull,
			setPaused: setPaused,
			setFollow: setFollow,
			box: box,
			count: function () { return rows; }
		};
	}

	/* 详情弹窗：官方 ui.showModal / ui.hideModal 的薄适配。
	 * - 只有一个实例；轮询更新时只替换 body，不重复 showModal；
	 * - Esc 由官方 cancelModal 点击 .button-row 里的按钮；
	 * - 关闭后把焦点还给打开前的元素。 */
	function Modal(p) {
		var bodyHost = el('div', { class: 'cfp-modal-body' });
		var closeBtn = el('button', { class: 'btn cbi-button', type: 'button', text: CFI.T('关闭') });
		var row = el('div', { class: 'button-row' }, closeBtn);
		var root = el('div', { class: 'cfp cfp-modal' }, [ bodyHost, row ]);
		var openFlag = false;
		var lastFocus = null;
		var hasUi = typeof ui !== 'undefined' && ui && typeof ui.showModal === 'function';

		function close() {
			if (!openFlag)
				return;
			openFlag = false;
			try {
				if (hasUi && typeof ui.hideModal === 'function')
					ui.hideModal();
			} catch (e) {}
			var lf = lastFocus;
			lastFocus = null;
			if (typeof setTimeout === 'function')
				setTimeout(function () {
					try { if (lf && lf.focus) lf.focus(); } catch (e2) {}
				}, 0);
			else {
				try { if (lf && lf.focus) lf.focus(); } catch (e3) {}
			}
			if (p.onClose)
				p.onClose();
		}

		function open(title, content) {
			var wasOpen = openFlag;
			if (!wasOpen)
				lastFocus = document.activeElement;
			CFI.dom.clear(bodyHost);
			bodyHost.appendChild(content);
			if (!hasUi)
				return false;
			if (!wasOpen) {
				ui.showModal(title, root, 'cbi-modal', 'cfi-modal');
				openFlag = true;
			} else {
				var dlg = document.getElementById('modal_overlay');
				var h = dlg && dlg.querySelector ? dlg.querySelector('.modal > h4') : null;
				if (h)
					h.textContent = title || '';
			}
			return true;
		}

		function onOverlay(ev) {
			if (ev && ev.target && ev.target.id === 'modal_overlay')
				close();
		}

		closeBtn.addEventListener('click', close);
		try {
			var ov = document.getElementById('modal_overlay');
			if (ov && ov.addEventListener)
				ov.addEventListener('click', onOverlay);
		} catch (e3) {}

		return {
			node: root,
			open: open,
			close: close,
			isOpen: function () { return openFlag; },
			destroy: function () {
				close();
				try {
					var ov = document.getElementById('modal_overlay');
					if (ov && ov.removeEventListener)
						ov.removeEventListener('click', onOverlay);
				} catch (e4) {}
			}
		};
	}

	function Empty(p) {
		var node = el('div', { class: 'empty' }, [
			el('div', { class: 'empty-t', text: p.title || '' }),
			el('div', { class: 'empty-d', text: p.detail || '' })
		]);
		if (p.action)
			node.appendChild(el('div', { class: 'empty-a' }, p.action));
		return node;
	}

	function Msg(p) {
		return el('div', { class: 'msg ' + (p.tone || 'info') }, [
			el('b', { text: p.title || '' }),
			p.text ? el('span', { text: p.text }) : null
		]);
	}

	/* 进度：阶段清单 + 两帧起跳的进度条；只改节点，不重建 */
	function Progress(st) {
		var stages = [
			{ id: 'fetch', label: CFI.T('拉取社区源') },
			{ id: 'canary', label: CFI.T('出口自检') },
			{ id: 'probe', label: CFI.T('探测候选') },
			{ id: 'verify', label: CFI.T('多样本验证') },
			{ id: 'colo', label: CFI.T('识别机房') },
			{ id: 'speed', label: CFI.T('测吞吐') },
			{ id: 'publish', label: CFI.T('写产物') }
		];
		var bar = el('i', { class: 'pbar-fill' });
		var pct = el('span', { class: 'pbar-n n', text: '0%' });
		var wrap = el('div', { class: 'pbar' }, [ el('div', { class: 'pbar-track' }, bar), pct ]);
		var list = el('ol', { class: 'steps' });
		var node = el('div', { class: 'prog' }, [ wrap, list ]);
		var items = [];
		stages.forEach(function (sg) {
			var row = el('li', { class: 'step' }, [
				el('span', { class: 'step-l', text: sg.label }),
				el('span', { class: 'step-n n', text: '' })
			]);
			items.push(row);
			list.appendChild(row);
		});
		var lastPct = -1;

		function paint(s) {
			s = s || {};
			var ids = stages.map(function (x) { return x.id; });
			var cur = ids.indexOf(s.stage);
			stages.forEach(function (sg, i) {
				var state = 'todo';
				if (cur >= 0) {
					if (i < cur)
						state = 'done';
					else if (i === cur)
						state = 'now';
				}
				items[i].className = 'step ' + state;
				items[i].lastChild.textContent = i === cur ? (s.stage_done || 0) + '/' + (s.stage_total || 0) : '';
			});
			var p = 0;
			if (s.stage_total > 0)
				p = Math.round(100 * (s.stage_done || 0) / s.stage_total);
			else if (cur >= 0)
				p = Math.round(100 * cur / stages.length);
			if (p !== lastPct) {
				lastPct = p;
				pct.textContent = p + '%';
			}
			if (typeof requestAnimationFrame === 'function') {
				var prev = bar.__p == null ? 0 : bar.__p;
				bar.style.transform = 'scaleX(' + (prev / 100) + ')';
				requestAnimationFrame(function () {
					bar.__p = p;
					bar.style.transform = 'scaleX(' + (p / 100) + ')';
				});
			} else {
				bar.__p = p;
				bar.style.transform = 'scaleX(' + (p / 100) + ')';
			}
		}
		paint(st || {});
		return { node: node, update: paint };
	}

	/* 三段导航：外观用 cbi-tabmenu，键盘与 aria 由我们维护 */
	function Tabs(defs, current, onPick) {
		var bar = el('div', { class: 'cfp-tabs' });
		var list = el('ul', { class: 'cbi-tabmenu', role: 'tablist' });
		var links = [];
		var items = [];
		defs.forEach(function (d, i) {
			var a = el('a', {
				href: '#',
				id: 'cfi-zone-' + d.id,
				role: 'tab',
				'aria-selected': d.id === current ? 'true' : 'false',
				'aria-controls': 'cfi-pane-' + d.id,
				tabindex: d.id === current ? '0' : '-1',
				text: d.label
			});
			var li = el('li', { class: 'cbi-tab' + (d.id === current ? ' cbi-tab-active' : '') }, a);
			a.addEventListener('click', function (ev) {
				if (ev && ev.preventDefault)
					ev.preventDefault();
				onPick(d.id);
			});
			a.addEventListener('keydown', function (ev) {
				var n = null;
				if (ev.key === 'ArrowRight')
					n = (i + 1) % defs.length;
				else if (ev.key === 'ArrowLeft')
					n = (i + defs.length - 1) % defs.length;
				else if (ev.key === 'Home')
					n = 0;
				else if (ev.key === 'End')
					n = defs.length - 1;
				if (n == null)
					return;
				ev.preventDefault();
				onPick(defs[n].id);
				links[n].focus();
			});
			links.push(a);
			items.push(li);
			list.appendChild(li);
		});
		bar.appendChild(list);
		function select(id) {
			defs.forEach(function (d, i) {
				var on = d.id === id;
				items[i].className = 'cbi-tab' + (on ? ' cbi-tab-active' : '');
				links[i].setAttribute('aria-selected', on ? 'true' : 'false');
				links[i].setAttribute('tabindex', on ? '0' : '-1');
			});
		}
		return { node: bar, select: select };
	}

	CFI.ui = {
		Button: Button,
		Readout: Readout,
		Table: Table,
		DcList: DcList,
		LogView: LogView,
		Modal: Modal,
		Empty: Empty,
		Msg: Msg,
		Progress: Progress,
		Tabs: Tabs
	};
})(CFI);
