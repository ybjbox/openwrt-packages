(function (CFI) {
	'use strict';

	var el = CFI.dom.el;

	function keyOfRow(row) {
		var lab = row.querySelector('label[for]');
		if (lab && lab.htmlFor) {
			var k = String(lab.htmlFor).split('.').pop();
			if (k)
				return k;
		}
		return row.getAttribute ? (row.getAttribute('data-name') || '') : '';
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
				title: T(g.title),
				hint: T(g.hint),
				body: body,
				defaultOpen: g.id !== 'probeAdv',
				persistKey: CFI.prefs.NS + 'groups.' + g.id
			});
			boxes.push(c);
			wrap.appendChild(c.node);
		});

		var left = rows.filter(function (r) { return used.indexOf(r) < 0; });
		if (left.length) {
			var lb = el('div', { class: 'fold-b' });
			left.forEach(function (r) { lb.appendChild(r); });
			var lc = CFI.ui.Collapse({ cls: 'grp', title: T('其它'), hint: T('未归类字段'), body: lb, defaultOpen: true });
			boxes.push(lc);
			wrap.appendChild(lc.node);
		}

		/* 搬空后的 section 壳只摘标题，容器留着给 .cbi-section-error 挂错。 */
		var secs = Array.prototype.slice.call(mapnode.querySelectorAll('.cbi-section'));
		secs.forEach(function (s) {
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
		var bar = el('div', { class: 'groups-bar' }, [
			CFI.ui.Button({ kind: 'link', label: T('全部展开'), onClick: function () { applyAll(true); } }).node,
			CFI.ui.Button({ kind: 'link', label: T('全部收起'), onClick: function () { applyAll(false); } }).node
		]);
		var boxes = [];
		var mapnode = null;

		function applyAll(open) {
			boxes.forEach(function (b) { b.apply(open); });
		}

		function render() {
			var m = CFI.form.create();
			return m.render().then(function(node) {
				mapnode = node;
				var g = regroup(node);
				boxes = g.boxes;
				host.appendChild(bar);
				/* 整张 map 节点进面板：字段必须留在 map 子树里，CBI 才采得到值
				 * （r18/r25 的教训：把 wrap 单独搬走等于「改了没保存」）。 */
				host.appendChild(node);
				CFI.form.applyHelp(g.wrap);

				var srcMap = CFI.form.sources.map();
				return srcMap.render().then(function(srcNode) {
					var srcHost = el('div', { class: 'src-edit-host' });
					host.appendChild(el('section', { class: 'sec' }, [
						el('div', { class: 'sec-h' }, [
							el('h2', { class: 'sec-t', text: T('源清单') }),
							el('div', { class: 'sec-a' }, CFI.ui.Button({ kind: 'quiet', label: T('去诊断检测'), onClick: actions.gotoDiag }).node)
						]),
						srcHost
					]));
					CFI.form.sources.mount(srcNode, srcHost, CFI.prefs.NS + 'groups.srcedit');
					host.__srcHost = srcHost;
					return host;
				});
			});
		}

		function update(state) {
			if (!mapnode)
				return;
			/* DNS 编辑器要本轮机房码；拿不到就让它退回纯文本框，不阻塞。 */
			var st = state.status || {};
			CFI.form.dns.mount(mapnode, st.dc_summary || []);
		}

		return { node: host, render: render, update: update };
	}

	CFI.panels = CFI.panels || {};
	CFI.panels.set = { mount: mount, regroup: regroup };
})(CFI);
