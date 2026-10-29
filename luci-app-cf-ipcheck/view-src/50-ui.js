(function (CFI) {
	'use strict';

	var el = CFI.dom.el;
	var icon = CFI.dom.icon;

	/* 按钮：节点只建一次，update 只改文案/禁用/忙碌 —— 真实鼠标的 down/up
	 * 落在同一颗节点上，浏览器才会合成 click。 */
	function Button(p) {
		var b = el('button', { class: 'btn ' + (p.kind || 'quiet'), type: 'button' });
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
			b.disabled = !!q.disabled;
			b.className = 'btn ' + (q.kind || p.kind || 'quiet') + (q.busy ? ' busy' : '');
			b.setAttribute('aria-busy', q.busy ? 'true' : 'false');
			if (q.title != null)
				b.setAttribute('title', q.title);
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

	/* 表格：表头 + 行；行数变化时整表重建（表格不是点击宿主），但列头保持同一颗 */
	function Table(p) {
		var thead = el('thead');
		var tbody = el('tbody');
		var table = el('table', { class: 'tbl' + (p.dense ? ' dense' : '') }, [ thead, tbody ]);
		var scroll = el('div', { class: 'tbl-scroll' }, table);
		var cols = p.cols || [];
		function head() {
			CFI.dom.clear(thead);
			thead.appendChild(el('tr', {}, cols.map(function (c) {
				return el('th', { class: c.cls || '', text: c.h });
			})));
		}
		function update(rows) {
			CFI.dom.clear(tbody);
			(p.update || function () {})(tbody, rows || []);
		}
		head();
		update(p.rows || []);
		return { node: scroll, update: update, table: table };
	}

	/* 折叠盒：只接管交互与 aria；内容宿主由调用方给 */
	function Collapse(p) {
		var cls = 'fold' + (p.cls ? ' ' + p.cls : '');
		var body = p.body || el('div');
		var head = el('div', { class: 'fold-h', tabindex: '0', role: 'button' }, [
			el('span', { class: 'chev', 'aria-hidden': 'true' }),
			el('span', { class: 'fold-t', text: p.title || '' }),
			el('span', { class: 'fold-x', text: p.hint || '' })
		]);
		var open = !!p.defaultOpen;
		if (p.persistKey) {
			var saved = CFI.prefs.get(p.persistKey, '');
			if (saved === '0' || saved === '1')
				open = saved === '1';
		}
		var box = el('div', { class: cls + (open ? ' open' : '') }, [ head, body ]);
		if (p.group)
			box.setAttribute('data-group', p.group);
		function apply(v) {
			box.className = cls + (v ? ' open' : '');
			head.setAttribute('aria-expanded', v ? 'true' : 'false');
			if (p.persistKey)
				CFI.prefs.set(p.persistKey, v ? '1' : '0');
			if (p.onToggle)
				p.onToggle(v);
		}
		function toggle() { apply(!(box.className.indexOf('open') >= 0)); }
		head.addEventListener('click', toggle);
		head.addEventListener('keydown', function (ev) {
			var k = ev && ev.key;
			if (k === 'Enter' || k === ' ' || k === 'Spacebar') {
				ev.preventDefault();
				toggle();
			}
		});
		apply(open);
		return { node: box, apply: apply, body: body };
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

	/* 进度：阶段清单 + 两帧起跳的进度条 */
	function Progress(st) {
		var stages = [
			{ id: 'fetch', label: T('拉取社区源') },
			{ id: 'canary', label: T('出口自检') },
			{ id: 'probe', label: T('探测候选') },
			{ id: 'verify', label: T('多样本验证') },
			{ id: 'colo', label: T('识别机房') },
			{ id: 'speed', label: T('测吞吐') },
			{ id: 'publish', label: T('写产物') }
		];
		var bar = el('i', { class: 'pbar-fill' });
		var pct = el('span', { class: 'pbar-n n', text: '0%' });
		var wrap = el('div', { class: 'pbar' }, [ el('div', { class: 'pbar-track' }, bar), pct ]);
		var list = el('ol', { class: 'steps' });
		var node = el('div', { class: 'prog' }, [ wrap, list ]);
		var lastPct = -1;

		function paint(s) {
			var ids = stages.map(function (x) { return x.id; });
			var cur = ids.indexOf(s.stage);
			CFI.dom.clear(list);
			stages.forEach(function (sg, i) {
				var state = 'todo';
				if (cur < 0)
					state = 'todo';
				else if (i < cur)
					state = 'done';
				else if (i === cur)
					state = 'now';
				if (sg.id === 'publish' && s.upload && cur === ids.length - 1 && i === ids.length - 1)
					state = 'now';
				var n = i === cur ? (s.stage_done || 0) + '/' + (s.stage_total || 0) : '';
				list.appendChild(el('li', { class: 'step ' + state }, [
					el('span', { class: 'step-l', text: sg.label }),
					el('span', { class: 'step-n n', text: n })
				]));
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
			/* 两帧起跳：面板每次按指纹重建时新节点没有"改之前"，直接写终值
			 * transition 不会动（r55 的坑）。先写上一帧比例，下一帧再改目标。 */
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

	/* 分段控件：roving tabindex + 方向键；只改 class/aria，不换节点 */
	function Tabs(defs, current, onPick) {
		var bar = el('div', { class: 'zones', role: 'tablist' });
		var btns = [];
		defs.forEach(function (d, i) {
			var b = el('button', {
				class: 'zone' + (d.id === current ? ' on' : ''),
				type: 'button',
				id: 'cfi-zone-' + d.id,
				role: 'tab',
				'aria-selected': d.id === current ? 'true' : 'false',
				'aria-controls': 'cfi-pane-' + d.id,
				tabindex: d.id === current ? '0' : '-1'
			}, el('span', { text: d.label }));
			b.addEventListener('click', function () { onPick(d.id); });
			b.addEventListener('keydown', function (ev) {
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
				btns[n].focus();
			});
			btns.push(b);
			bar.appendChild(b);
		});
		function select(id) {
			defs.forEach(function (d, i) {
				var on = d.id === id;
				btns[i].className = 'zone' + (on ? ' on' : '');
				btns[i].setAttribute('aria-selected', on ? 'true' : 'false');
				btns[i].setAttribute('tabindex', on ? '0' : '-1');
			});
		}
		return { node: bar, select: select };
	}

	CFI.ui = {
		Button: Button,
		Readout: Readout,
		Table: Table,
		Collapse: Collapse,
		Empty: Empty,
		Msg: Msg,
		Progress: Progress,
		Tabs: Tabs
	};
})(CFI);
