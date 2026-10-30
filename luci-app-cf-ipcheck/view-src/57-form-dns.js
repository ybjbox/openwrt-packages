(function (CFI) {
	'use strict';

	var el = CFI.dom.el;
	var D = CFI.dns;

	/* 图形编辑器只是 dns_targets 文本框的一层视图：行从文本解析、改动写回文本。
	 * 注释与怪行原样保留；机房候选可以后到（首次挂载时可能还没测过）。 */
	function DnsRowsEditor(p) {
		var wrap = el('div', { class: 'dnsrows' });
		var lines = D.linesOf(p.value);
		var codes = p.codes || [];
		var base = D.textOf(lines);
		var baseLines = (function () {
			var out = [];
			D.linesOf(base).forEach(function (ln) { out.push(D.textOf([ ln ])); });
			return out;
		})();
		var inputs = [];
		var resetBtn = null;

		function lineText(ln) {
			return D.textOf([ ln ]);
		}

		function rowDirty(ln) {
			return baseLines.indexOf(lineText(ln)) < 0;
		}

		function emit() {
			if (p.onChange)
				p.onChange(D.textOf(lines));
			refreshDirty();
		}

		function refreshDirty() {
			var dirty = D.textOf(lines) !== base;
			wrap.className = 'dnsrows' + (dirty ? ' dirty' : '');
			if (resetBtn)
				resetBtn.node.hidden = !dirty;
			/* 只更新已有行上的脏标记，不重建行（否则正在输入的光标会丢） */
			Array.prototype.slice.call(wrap.querySelectorAll('.dnsrow')).forEach(function (row) {
				if (!row.__line)
					return;
				var d = rowDirty(row.__line);
				row.className = 'dnsrow' + (String(row.className).indexOf('dnsrow-raw') >= 0 ? ' dnsrow-raw' : '') + (d ? ' dirty' : '');
			});
		}

		function reset() {
			lines = D.linesOf(base);
			emit();
			paint();
		}

		function optionList(sel, current) {
			CFI.dom.clear(sel);
			sel.appendChild(el('option', { value: '', text: CFI.T('不限（全局前 N）') }));
			codes.forEach(function (c) {
				sel.appendChild(el('option', {
					value: String(c.dc),
					text: c.count != null && c.count !== '' ? String(c.dc) + CFI.T('（%s 条）').format(String(c.count)) : String(c.dc)
				}));
			});
			var known = false;
			for (var i = 0; i < codes.length; i++)
				if (String(codes[i].dc) === current) { known = true; break; }
			if (current && !known)
				sel.appendChild(el('option', { value: current, text: current + CFI.T('（本轮无）') }));
			sel.value = current || '';
		}

		function setCodes(list) {
			codes = list || [];
			for (var i = 0; i < inputs.length; i++) {
				var sel = inputs[i].sel;
				optionList(sel, sel.value);
			}
		}

		function paint() {
			CFI.dom.clear(wrap);
			inputs = [];
			wrap.appendChild(el('div', { class: 'dnsrow dnsrow-h', 'aria-hidden': 'true' }, [
				el('span', { text: CFI.T('机房') }),
				el('span', { text: CFI.T('记录名') }),
				el('span', { text: CFI.T('条数') }),
				el('span', { text: '' })
			]));
			lines.forEach(function (ln, idx) {
				if (!ln || ln.kind !== 'row') {
					var rawEl = el('div', { class: 'dnsrow dnsrow-raw' + (rowDirty(ln) ? ' dirty' : '') },
						el('span', { class: 'dim mono', text: String((ln && ln.text) || '') }));
					rawEl.__line = ln;
					wrap.appendChild(rawEl);
					return;
				}
				var r = ln.row;
				var sel = el('select', { class: 'dnsrow-code', 'aria-label': CFI.T('机房') });
				optionList(sel, r.code);
				sel.addEventListener('change', function () { r.code = sel.value; emit(); });

				var dom = el('input', { type: 'text', class: 'dnsrow-dom', value: r.domain, placeholder: 'jp.example.com', 'aria-label': CFI.T('记录名') });
				dom.addEventListener('input', function () { r.domain = dom.value; emit(); });

				var cnt = el('input', {
					type: 'number', class: 'dnsrow-n', min: '1', max: String(D.LIMIT),
					value: String(r.count || 1), 'aria-label': CFI.T('条数')
				});
				cnt.addEventListener('input', function () {
					var v = Number(cnt.value);
					r.count = (isFinite(v) && v >= 1) ? Math.min(D.LIMIT, Math.floor(v)) : 1;
					emit();
				});

				var del = CFI.ui.Button({
					kind: 'link', label: CFI.T('删除'), ariaLabel: CFI.T('删除第 %s 行').format(String(idx + 1)),
					onClick: function () {
						lines.splice(idx, 1);
						emit();
						paint();
					}
				});

				inputs.push({ sel: sel, dom: dom, cnt: cnt });
				var rowEl = el('div', { class: 'dnsrow' + (rowDirty(ln) ? ' dirty' : '') }, [ sel, dom, cnt, del.node ]);
				rowEl.__line = ln;
				wrap.appendChild(rowEl);
			});
			resetBtn = CFI.ui.Button({
				kind: 'link', label: CFI.T('还原'), ariaLabel: CFI.T('还原 DNS 记录清单'),
				onClick: reset
			});
			wrap.appendChild(el('div', { class: 'dnsrows-add' }, [
				CFI.ui.Button({
					kind: 'link', label: CFI.T('+ 添加一行'),
					onClick: function () {
						lines.push({ kind: 'row', row: { domain: '', count: 1, code: '', rest: [] } });
						emit();
						paint();
						var last = inputs[inputs.length - 1];
						if (last && last.dom.focus)
							last.dom.focus();
					}
				}).node,
				resetBtn.node
			]));
			refreshDirty();
		}

		paint();
		return {
			node: wrap,
			setCodes: setCodes,
			isDirty: function () { return D.textOf(lines) !== base; },
			reset: reset
		};
	}

	/* 挂到 dns_targets 字段：插在 CBI frame 外面（frame 里会让 getValue 读到编辑器
	 * 本身，保存变成 uci delete —— r107 真机事故）。失败安静退回纯文本框。 */
	function mountDnsEditor(mapnode, dcRows) {
		if (!mapnode || !mapnode.querySelector)
			return null;
		var box = mapnode.querySelector('.cbi-value[data-name="dns_targets"]');
		if (!box || box.__dnsEditor)
			return null;
		var ta = box.querySelector('textarea');
		if (!ta)
			return null;
		var codes = [];
		(dcRows || []).forEach(function (r) {
			if (r && r.dc)
				codes.push({ dc: String(r.dc), count: r.count });
		});
		var ed = DnsRowsEditor({
			codes: codes,
			value: ta.value,
			onChange: function (text) {
				if (ta.value === text)
					return;
				ta.value = text;
				/* 三个事件都要发：这个 CBI 文本域在 keyup/blur 上更新值、在 change 上
				 * 标记改动；只发 input 时它认为没改过。 */
				[ 'input', 'keyup', 'change' ].forEach(function (type) {
					var ev;
					try {
						ev = new Event(type, { bubbles: true });
					} catch (e) {
						ev = document.createEvent('HTMLEvents');
						ev.initEvent(type, true, false);
					}
					ta.dispatchEvent(ev);
				});
			}
		});
		var host = el('div', { class: 'dnsrows-host' }, [
			el('p', { class: 'note' }, CFI.T('一行一个机房；同一个记录名写多行（不同机房）会自动合并。zone 按记录名自动推导，一般不用填。')),
			ed.node
		]);
		try {
			var frame = ta.parentNode || box;
			var outer = (frame && frame.parentNode) || frame;
			outer.insertBefore(host, frame);
		} catch (e2) {
			return null;
		}
		box.__dnsEditor = true;
		return ed;
	}

	CFI.form.dns = { RowsEditor: DnsRowsEditor, mount: mountDnsEditor };
})(CFI);
