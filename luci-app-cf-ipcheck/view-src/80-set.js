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

	function sectionsOf(node) {
		return Array.prototype.slice.call(node.querySelectorAll('.cbi-section'));
	}

	function directH3(sec) {
		for (var n = sec.firstElementChild; n; n = n.nextElementSibling) {
			if (String(n.tagName).toUpperCase() === 'H3')
				return n;
		}
		return null;
	}

	/* 「已改动」按控件逐个记基线，不把整行拼成一个值串。
	 * 原因：DNS 编辑器是在 update() 里才 mount 进来的，晚于 render 末尾的
	 * snapshotValues —— 「记录名清单」行快照时只有 1 个控件，之后变成 16 个
	 * （5 段 DNS 子行 + 地址框），串长永远对不上，于是任何一次点击都会把它
	 * 标成「已改动」，而它的值根本没变（真机实测 NRT→NRT，select 连事件都没收到）。
	 * 改成逐控件记：新插入的控件首次见到就补记基线、不算改动，既不会误判，
	 * 用户之后真去改它仍然能被检出。 */
	function ctrlVal(c, dnsRow) {
		if (c.type === 'checkbox' || c.type === 'radio')
			return c.checked ? '1' : '0';
		var v = String(c.value == null ? '' : c.value);
		/* dns_targets 的存储形态是「分号 + 空格」单行，用户手写却常带换行；
		 * DNS 编辑器第一次回写会统一成规范形态。按解析结果归一后再比，否则
		 * 只是点开子行改回原值、格式被规范化，这一行也会一直挂着「已改动」。
		 * （r185 真机实测：5 行 124 字符 → 分号单行 128 字符，域名一个没变） */
		if (dnsRow && String(c.tagName).toUpperCase() === 'TEXTAREA' &&
			CFI.dns && CFI.dns.linesOf && CFI.dns.textOf)
			return CFI.dns.textOf(CFI.dns.linesOf(v));
		return v;
	}

	function snapRow(row) {
		var dnsRow = fieldKey(row) === 'dns_targets';
		var ctrls = row.querySelectorAll('input, select, textarea');
		for (var i = 0; i < ctrls.length; i++)
			ctrls[i].__cfiOrig = ctrlVal(ctrls[i], dnsRow);
	}

	function rowChanged(row) {
		var dnsRow = fieldKey(row) === 'dns_targets';
		var ctrls = row.querySelectorAll('input, select, textarea');
		var changed = false;
		for (var i = 0; i < ctrls.length; i++) {
			var c = ctrls[i];
			var v = ctrlVal(c, dnsRow);
			if (c.__cfiOrig === undefined) {
				c.__cfiOrig = v;
				continue;
			}
			if (c.__cfiOrig !== v)
				changed = true;
		}
		return changed;
	}

	function mount(actions) {
		var host = el('div', { class: 'set-body' });
		var mapnode = null;
		var dnsEditor = null;
		var hints = {};
		(CFI.form.GROUPS || []).forEach(function (g) {
			if (g && g.id && g.hint)
				hints[g.id] = g.hint;
		});

		/* 分组标题下显示用途提示；折叠时由 section 的 is-fold 规则一起隐藏。 */
		function addHints(node) {
			Array.prototype.slice.call(node.querySelectorAll('.cbi-section')).forEach(function (sec) {
				var hint = hints[sec.getAttribute('data-group')];
				if (!hint || sec.querySelector('.cfp-sec-hint'))
					return;
				var h = directH3(sec);
				if (h && h.parentNode)
					h.parentNode.insertBefore(el('p', { class: 'cfp-sec-hint', text: hint }), h.nextSibling);
			});
		}

		var bar = el('div', { class: 'groups-bar' }, [
			CFI.ui.Button({ kind: 'link', label: CFI.T('全部展开'), onClick: function () { setAllFold(false); } }).node,
			CFI.ui.Button({ kind: 'link', label: CFI.T('全部收起'), onClick: function () { setAllFold(true); } }).node
		]);

		/* ---- 分组折叠：状态存在 cfi3.set.fold（逗号分隔的组名） ---------- */
		var folded = {};

		function loadFolded() {
			folded = {};
			String(CFI.prefs.get(CFI.prefs.NS + 'set.fold', '') || '').split(',').forEach(function (g) {
				if (g)
					folded[g] = 1;
			});
		}

		function saveFolded() {
			var out = [];
			for (var g in folded) {
				if (Object.prototype.hasOwnProperty.call(folded, g) && folded[g])
					out.push(g);
			}
			CFI.prefs.set(CFI.prefs.NS + 'set.fold', out.join(','));
		}

		function setFold(sec, on, remember) {
			if (!sec)
				return;
			if (on)
				sec.classList.add('is-fold');
			else
				sec.classList.remove('is-fold');
			var h = directH3(sec);
			if (h)
				h.setAttribute('aria-expanded', on ? 'false' : 'true');
			if (remember) {
				var g = sec.getAttribute('data-group');
				if (g) {
					if (on)
						folded[g] = 1;
					else
						delete folded[g];
					saveFolded();
				}
			}
		}

		function enhanceSection(sec) {
			var h = directH3(sec);
			if (!h || h.__cfiFold)
				return;
			h.__cfiFold = true;
			h.classList.add('cfp-sec-toggle');
			h.setAttribute('role', 'button');
			h.setAttribute('tabindex', '0');
			h.setAttribute('aria-expanded', sec.classList.contains('is-fold') ? 'false' : 'true');
			h.appendChild(el('span', { class: 'cfp-sec-caret', 'aria-hidden': 'true' }));
			var toggle = function () {
				setFold(sec, !sec.classList.contains('is-fold'), true);
			};
			h.addEventListener('click', toggle);
			h.addEventListener('keydown', function (e) {
				if (e.key === 'Enter' || e.key === ' ' || e.keyCode === 13 || e.keyCode === 32) {
					e.preventDefault();
					toggle();
				}
			});
		}

		function setAllFold(on) {
			sectionsOf(host).forEach(function (sec) {
				if (!sec.hidden)
					setFold(sec, on, true);
			});
		}

		function expandGroup(group) {
			var sec = host.querySelector('.cbi-section[data-group="' + group + '"]');
			if (!sec)
				return false;
			sec.hidden = false;
			setFold(sec, false, true);
			if (sec.scrollIntoView)
				sec.scrollIntoView({ block: 'start' });
			return true;
		}

		function snapshotValues() {
			Array.prototype.slice.call(host.querySelectorAll('.cbi-value')).forEach(function (row) {
				row.__cfiSnap = true;
				snapRow(row);
			});
		}

		function applyChanged() {
			Array.prototype.slice.call(host.querySelectorAll('.cbi-value')).forEach(function (row) {
				if (!row.__cfiSnap)
					return;
				var changed = rowChanged(row);
				var has = /(^|\s)changed(\s|$)/.test(String(row.className));
				if (changed && !has)
					row.className = String(row.className).replace(/\s*changed\b/g, '') + ' changed';
				else if (!changed && has)
					row.className = String(row.className).replace(/\s*changed\b/g, '');
			});
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


		function render() {
			var m = CFI.form.create();
			return m.render().then(function (node) {
				mapnode = node;
				markSections(node);
				addHints(node);
				loadFolded();
				sectionsOf(node).forEach(function (sec) {
					enhanceSection(sec);
					setFold(sec, !!folded[sec.getAttribute('data-group')], false);
				});
				host.appendChild(bar);
				/* 整张 map 节点进面板：字段留在 map 子树里，CBI 才采得到值 */
				host.appendChild(node);
			CFI.form.applyHelp(node);
			CFI.form.applyDailyPreview(node);
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

		return { node: host, render: render, update: update, expandGroup: expandGroup };
	}

	/* 逐控件的「已改动」判定单独挂出来：单测要能直接喂一行控件验它，
	 * 不必把整张 CBI 表单装配起来。 */
	CFI.form = CFI.form || {};
	CFI.form.changed = { snapshot: snapRow, test: rowChanged };

	CFI.panels = CFI.panels || {};
	CFI.panels.set = { mount: mount };
})(CFI);
