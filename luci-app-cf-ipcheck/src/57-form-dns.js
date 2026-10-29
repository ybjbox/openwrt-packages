(function (CFI) {
	'use strict';

	var el = CFI.dom.el;
	var D = CFI.dns;

	/* 图形编辑器只是 dns_targets 文本框的一层视图：行从文本解析、改动写回文本，
	 * 存储格式与保存链路一个字没动。注释与解析不了的怪行原样保留。 */
	function DnsRowsEditor(p) {
		var wrap = el('div', { class: 'dnsrows' });
		var lines = D.linesOf(p.value);
		var codes = p.codes || [];

		function emit() {
			if (p.onChange)
				p.onChange(D.textOf(lines));
		}

		function paint() {
			CFI.dom.clear(wrap);
			wrap.appendChild(el('div', { class: 'dnsrow dnsrow-h', 'aria-hidden': 'true' }, [
				el('span', { text: T('机房') }),
				el('span', { text: T('记录名') }),
				el('span', { text: T('条数') }),
				el('span', { text: '' })
			]));
			lines.forEach(function (ln, idx) {
				if (!ln || ln.kind !== 'row') {
					wrap.appendChild(el('div', { class: 'dnsrow dnsrow-raw' },
						el('span', { class: 'dim', text: String((ln && ln.text) || '') })));
					return;
				}
				var r = ln.row;
				var sel = el('select', { class: 'dnsrow-code' });
				sel.appendChild(el('option', { value: '', text: T('不限（全局前 N）') }));
				codes.forEach(function (c) {
					sel.appendChild(el('option', {
						value: String(c.dc),
						text: c.count != null && c.count !== '' ? String(c.dc) + T('（%s 条）').format(String(c.count)) : String(c.dc)
					}));
				});
				var known = false;
				for (var ci = 0; ci < codes.length; ci++) {
					if (String(codes[ci].dc) === r.code) { known = true; break; }
				}
				if (r.code && !known)
					sel.appendChild(el('option', { value: r.code, text: r.code + T('（本轮无）') }));
				sel.value = r.code || '';
				sel.addEventListener('change', function () { r.code = sel.value; emit(); });

				var dom = el('input', { type: 'text', class: 'dnsrow-dom', value: r.domain, placeholder: 'jp.example.com' });
				dom.addEventListener('input', function () { r.domain = dom.value; emit(); });

				var cnt = el('input', {
					type: 'number', class: 'dnsrow-n', min: '1', max: String(D.LIMIT),
					value: String(r.count || 1)
				});
				cnt.addEventListener('input', function () {
					var v = Number(cnt.value);
					r.count = (isFinite(v) && v >= 1) ? Math.min(D.LIMIT, Math.floor(v)) : 1;
					emit();
				});

				var del = CFI.ui.Button({
					kind: 'link', label: T('删除'),
					onClick: function () {
						lines.splice(idx, 1);
						emit();
						paint();
					}
				});

				wrap.appendChild(el('div', { class: 'dnsrow' }, [ sel, dom, cnt, del.node ]));
			});
			wrap.appendChild(el('div', { class: 'dnsrows-add' }, CFI.ui.Button({
				kind: 'link', label: T('+ 添加一行'),
				onClick: function () {
					lines.push({ kind: 'row', row: { domain: '', count: 1, code: '', rest: [] } });
					emit();
					paint();
				}
			}).node));
		}

		paint();
		return wrap;
	}

	/* 挂到 dns_targets 字段：插在 CBI frame 外面（frame 里会让 getValue 读到编辑器
	 * 本身，保存变成 uci delete —— r107 真机事故），失败安静退回纯文本框。 */
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
				 * 标记改动；只发 input 时它认为没改过，保存按钮会说「没有待应用的更改」。 */
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
			el('p', { class: 'note' }, T('一行一个机房；同一个记录名写多行（不同机房）会自动合并。zone 按记录名自动推导，一般不用填。')),
			ed
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
