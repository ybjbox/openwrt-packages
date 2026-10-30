(function (CFI) {
	'use strict';

	var el = CFI.dom.el;

	function fieldKey(row) {
		if (!row || !row.getAttribute)
			return '';
		var d = row.getAttribute('data-name');
		if (d)
			return d;
		var lab = row.querySelector && row.querySelector('label[for]');
		if (lab && lab.htmlFor)
			return String(lab.htmlFor).split('.').pop();
		return '';
	}

	function groupOfKey(key) {
		var opts = CFI.form.OPTIONS || {};
		for (var g in opts) {
			if (Object.prototype.hasOwnProperty.call(opts, g) && opts[g].indexOf(key) >= 0)
				return g;
		}
		return 'other';
	}

	/* 原生 section 顺序与 GROUPS 一致时，按首个字段把组名挂到 section 上，
	 * 供 #/cfi/set/<group> 与「去改源清单」定位。 */
	function markSections(mapnode) {
		Array.prototype.slice.call(mapnode.querySelectorAll('.cbi-section')).forEach(function (sec) {
			var row = sec.querySelector('.cbi-value[data-name]');
			var key = row ? row.getAttribute('data-name') : '';
			sec.setAttribute('data-group', groupOfKey(key));
		});
	}

	function mount(actions) {
		var host = el('div', { class: 'set-body' });
		var mapnode = null;
		var dnsEditor = null;

		var search = el('input', {
			class: 'ctl search', type: 'search',
			placeholder: CFI.T('搜字段 / 值'), 'aria-label': CFI.T('搜索设置项')
		});
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
			CFI.ui.Button({ kind: 'link', label: CFI.T('去诊断检测'), onClick: actions.gotoDiag }).node
		]);

		function applyFilter() {
			var q = String(search.value || '').toLowerCase();
			var changedOnly = onlyChanged.firstChild.checked;
			Array.prototype.slice.call(host.querySelectorAll('.cbi-value')).forEach(function (row) {
				var txt = String(row.textContent || '').toLowerCase();
				var ok = (!q || txt.indexOf(q) >= 0) &&
					(!changedOnly || row.className.indexOf('changed') >= 0);
				row.hidden = !ok;
			});
			Array.prototype.slice.call(host.querySelectorAll('.cbi-section')).forEach(function (sec) {
				var any = Array.prototype.slice.call(sec.querySelectorAll('.cbi-value')).some(function (r) {
					return !r.hidden;
				});
				sec.hidden = !any;
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

		function openSources() {
			var sec = host.querySelector('.cbi-section[data-group="sources"]');
			if (!sec)
				return false;
			if (sec.scrollIntoView)
				sec.scrollIntoView({ block: 'start' });
			var inp = sec.querySelector('.cbi-value[data-name="community_sources"] input[type=text]');
			if (inp && inp.focus)
				inp.focus();
			return true;
		}

		function render() {
			var m = CFI.form.create();
			return m.render().then(function (node) {
				mapnode = node;
				markSections(node);
				host.appendChild(bar);
				/* 整张 map 节点进面板：字段留在 map 子树里，CBI 才采得到值 */
				host.appendChild(node);
				CFI.form.applyHelp(node);
				snapshotValues();
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
	CFI.panels.set = { mount: mount };
})(CFI);
