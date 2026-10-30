(function (CFI) {
	'use strict';

	var el = CFI.dom.el;

	function keyOfRow(row) {
		if (row.getAttribute) {
			var d = row.getAttribute('data-name');
			if (d)
				return d;
		}
		var lab = row.querySelector('label[for]');
		if (lab && lab.htmlFor)
			return String(lab.htmlFor).split('.').pop();
		return '';
	}

	function regroup(mapnode) {
		var rows = Array.prototype.slice.call(mapnode.querySelectorAll('.cbi-value'));
		var by = {};
		rows.forEach(function (r) {
			var k = keyOfRow(r);
			if (k)
				by[k] = r;
		});
		var used = [];
		var wrap = el('div', { class: 'groups' });
		var boxes = [];

		CFI.form.GROUPS.forEach(function (g) {
			var body = el('div', { class: 'fold-b' });
			(CFI.form.OPTIONS[g.id] || []).forEach(function (k) {
				if (by[k]) {
					body.appendChild(by[k]);
					used.push(by[k]);
				}
			});
			if (!body.firstChild)
				return;
			var c = CFI.ui.Collapse({
				cls: 'grp',
				group: g.id,
				title: CFI.T(g.title),
				hint: CFI.T(g.hint),
				body: body,
				defaultOpen: g.id !== 'probeAdv',
				persistKey: CFI.prefs.NS + 'folds.' + g.id
			});
			boxes.push(c);
			wrap.appendChild(c.node);
		});

		var left = rows.filter(function (r) { return used.indexOf(r) < 0; });
		if (left.length) {
			var lb = el('div', { class: 'fold-b' });
			left.forEach(function (r) { lb.appendChild(r); });
			var lc = CFI.ui.Collapse({ cls: 'grp', group: 'other', title: CFI.T('其它'), hint: CFI.T('未归类字段'), body: lb, defaultOpen: true });
			boxes.push(lc);
			wrap.appendChild(lc.node);
		}

		/* 搬空后的 section 壳只摘标题，容器留给 .cbi-section-error 挂错 */
		Array.prototype.slice.call(mapnode.querySelectorAll('.cbi-section')).forEach(function (s) {
			if (s.querySelector('.cbi-value'))
				return;
			var h = s.querySelector('h3');
			if (h && h.parentNode === s)
				s.removeChild(h);
		});
		Array.prototype.slice.call(mapnode.children || []).forEach(function (n) {
			if (n.tagName === 'H2' || String(n.className || '').indexOf('cbi-map-descr') >= 0)
				mapnode.removeChild(n);
		});
		if (mapnode.appendChild)
			mapnode.appendChild(wrap);
		return { wrap: wrap, boxes: boxes };
	}

	function mount(actions) {
		var host = el('div', { class: 'set-body' });
		var boxes = [];
		var mapnode = null;
		var dnsEditor = null;

		var search = el('input', { class: 'ctl search', type: 'search', placeholder: CFI.T('搜字段 / 值'), 'aria-label': CFI.T('搜索设置项') });
		var onlyChanged = el('label', { class: 'chk' }, [
			el('input', { type: 'checkbox' }),
			el('span', { text: CFI.T('只看已改') })
		]);
		onlyChanged.firstChild.addEventListener('change', applyFilter);
		search.addEventListener('input', applyFilter);
		var bar = el('div', { class: 'groups-bar' }, [
			search,
			onlyChanged,
			el('span', { class: 'bar-gap' }),
			CFI.ui.Button({ kind: 'link', label: CFI.T('全部展开'), onClick: function () { applyAll(true); } }).node,
			CFI.ui.Button({ kind: 'link', label: CFI.T('全部收起'), onClick: function () { applyAll(false); } }).node,
			CFI.ui.Button({ kind: 'link', label: CFI.T('去诊断检测'), onClick: actions.gotoDiag }).node
		]);

		function applyAll(open) {
			boxes.forEach(function (b) { b.apply(open); });
		}

		function applyFilter() {
			var q = String(search.value || '').toLowerCase();
			var changedOnly = onlyChanged.firstChild.checked;
			Array.prototype.slice.call(host.querySelectorAll('.cbi-value')).forEach(function (row) {
				var txt = String(row.textContent || '').toLowerCase();
				var ok = (!q || txt.indexOf(q) >= 0) &&
					(!changedOnly || row.className.indexOf('changed') >= 0);
				row.hidden = !ok;
			});
			/* 过滤后整组没有可见字段就收起整组；清空搜索时整组回来 */
			Array.prototype.slice.call(host.querySelectorAll('.fold.grp')).forEach(function (g) {
				var any = Array.prototype.slice.call(g.querySelectorAll('.cbi-value')).some(function (r) {
					return !r.hidden;
				});
				g.hidden = !any;
			});
		}

		function rowValues(row) {
			var out = [];
			var ctrls = row.querySelectorAll('input, select, textarea');
			for (var i = 0; i < ctrls.length; i++) {
				var c = ctrls[i];
				if (c.type === 'checkbox' || c.type === 'radio')
					out.push(c.checked ? '1' : '0');
				else
					out.push(String(c.value == null ? '' : c.value));
			}
			return out.join('\u0001');
		}

		function snapshotValues() {
			Array.prototype.slice.call(host.querySelectorAll('.cbi-value')).forEach(function (row) {
				row.__orig = rowValues(row);
			});
		}

		/* CBI 自己会在 change 里重绘字段行，直接往 className 上加标记会被冲掉。
		 * 这里保留每行原始值，事件后下一拍重算：改回原值时标记自动消失。 */
		function applyChanged() {
			Array.prototype.slice.call(host.querySelectorAll('.cbi-value')).forEach(function (row) {
				if (row.__orig == null)
					return;
				var changed = rowValues(row) !== row.__orig;
				var has = String(row.className).indexOf('changed') >= 0;
				if (changed && !has)
					row.className = String(row.className).replace(/\s*changed\b/g, '') + ' changed';
				else if (!changed && has)
					row.className = String(row.className).replace(/\s*changed\b/g, '');
			});
			if (onlyChanged.firstChild.checked)
				applyFilter();
		}

		function markChanged() {
			var run = function () {
				applyChanged();
				countPending();
			};
			if (typeof setTimeout === 'function')
				setTimeout(run, 0);
			else
				run();
		}

		function countPending() {
			if (!mapnode || !actions.getSources || !actions.setSrcPending)
				return;
			var rows = actions.getSources() || [];
			var n = CFI.form.sources.pending(host, rows).length;
			actions.setSrcPending(n);
		}

		/* 诊断区的「还有 N 条未生效」跳过来时：展开源清单分组并聚焦输入框 */
		function openSources() {
			var fold = host.querySelector('.fold[data-group="sources"]');
			if (!fold)
				return false;
			if (String(fold.className).indexOf('open') < 0) {
				var h = fold.querySelector('.fold-h');
				if (h && h.click)
					h.click();
			}
			var inp = fold.querySelector('.cbi-value[data-name="community_sources"] input[type=text]');
			if (inp && inp.focus)
				inp.focus();
			return true;
		}

		function render() {
			var m = CFI.form.create();
			return m.render().then(function(node) {
				mapnode = node;
				var g = regroup(node);
				boxes = g.boxes;
				host.appendChild(bar);
				/* 整张 map 节点进面板：字段留在 map 子树里，CBI 才采得到值 */
				host.appendChild(node);
				CFI.form.applyHelp(g.wrap);

				var skinSel = el('select', { class: 'ctl', 'aria-label': CFI.T('皮肤') }, [
					el('option', { value: 'auto', text: CFI.T('自动（跟随宿主）') }),
					el('option', { value: 'paper', text: CFI.T('纸') }),
					el('option', { value: 'night', text: CFI.T('夜（蓝图）') })
				]);
				skinSel.value = CFI.prefs.get(CFI.prefs.NS + 'skin', 'auto');
				skinSel.addEventListener('change', function () {
					if (actions.setSkin)
						actions.setSkin(skinSel.value);
				});
				host.appendChild(el('section', { class: 'sec' }, [
					el('div', { class: 'sec-h' }, el('h2', { class: 'sec-t', text: CFI.T('外观') })),
					el('div', { class: 'appearance' }, [
						el('span', { class: 'appearance-label', text: CFI.T('皮肤') }),
						skinSel,
						el('span', { class: 'note', text: CFI.T('自动跟随宿主背景亮度。榜单列显隐在「运行 → 列」里切。') })
					])
				]));

				snapshotValues();
				/* 捕获阶段：CBI 自己的字段监听可能在目标处 stopPropagation，
				 * 冒泡就收不到 —— 脏标记会永远不出现。 */
				host.addEventListener('input', markChanged, true);
				host.addEventListener('change', markChanged, true);
				host.addEventListener('keyup', markChanged, true);

				host.addEventListener('click', markChanged, true);
				countPending();
				return host;
			});
		}

		function update(state) {
			if (!mapnode)
				return;
			var st = state.status || {};
			if (!dnsEditor)
				dnsEditor = CFI.form.dns.mount(mapnode, st.dc_summary || []);
			else if (dnsEditor.setCodes)
				dnsEditor.setCodes(st.dc_summary || []);
		}

		return { node: host, render: render, update: update, openSources: openSources };
	}

	CFI.panels = CFI.panels || {};
	CFI.panels.set = { mount: mount, regroup: regroup };
})(CFI);
