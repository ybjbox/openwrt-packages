(function (CFI) {
	'use strict';

	var el = CFI.dom.el;
	var F = CFI.fmt;

	var STAGE_LABEL = {
		fetch: CFI.T('拉取社区源'),
		canary: CFI.T('出口自检'),
		probe: CFI.T('探测候选'),
		verify: CFI.T('多样本验证'),
		colo: CFI.T('识别机房'),
		speed: CFI.T('测吞吐'),
		publish: CFI.T('写产物')
	};

	function srcMessage(src) {
		switch (src && src.state) {
			case 'unreachable':
				return CFI.T('调不到 luci.cf-ipcheck 的 check_sources：包没装好，或 rpcd 还拿着旧的 ACL 缓存（重启 rpcd 后重试）。');
			case 'hung':
				return CFI.T('检测没有回应：可能是某条源太慢。先看日志最后几行，再点一次。');
			case 'empty':
				return CFI.T('引擎没有返回任何源：在下面源清单里填上并保存。');
			case 'parse_error':
				return CFI.T('引擎输出不是合法 JSON。把日志最后几行原样贴出来排查。');
			default:
				return '';
		}
	}

	function oneError(code) {
		if (code === 'hung')
			return CFI.T('检测没有回应。');
		if (code === 'unreachable')
			return CFI.T('调不到引擎。');
		if (code === 'missing_source')
			return CFI.T('这条源已不在保存的清单里，先保存再试。');
		if (code === 'bad_index')
			return CFI.T('源序号不对，先保存再试。');
		return CFI.T('没测到。');
	}

	function mount(actions) {
		var last = { trace: '', src: '', pool: '', busy: '' };
		var uiBusy = {};
		var src = {
			sec: null, dyn: null, rows: [], saved: [], synced: '',
			full: null, one: {}, busy: '', epoch: 0, dirty: false,
			attached: false, sig: ''
		};

		var traceHost = el('div', { class: 'trace' });
		var btnCheck = CFI.ui.Button({ kind: 'primary', icon: 'probe', label: CFI.T('检测全部源'), onClick: actions.check });
		var btnPool = CFI.ui.Button({ kind: 'quiet', label: CFI.T('预览候选池'), onClick: actions.pool });
		var btnAdd = CFI.ui.Button({ kind: 'link', label: CFI.T('+ 添加一行'), onClick: function () { addRow('', true); } });
		var srcHost = el('div', { class: 'srcedit' });
		var srcNote = el('div', { class: 'src-note' });
		var poolHost = el('div', { class: 'pool-result' });
		var srcCount = el('span', { class: 'cfp-sec-count' });
		var srcCard = el('section', { class: 'cbi-section cfp-src-edit', hidden: true }, [
			el('div', { class: 'cfp-sec-h' }, [
				el('h3', { text: CFI.T('源清单') }),
				srcCount,
				el('div', { class: 'cfp-sec-a' }, [ btnCheck.node, btnPool.node ])
			]),
			el('p', { class: 'note dim', text: CFI.T('每行一个 HTTPS 文本地址；改完点页面底部「保存并应用」，再检测。') }),
			srcHost,
			el('div', { class: 'srcedit-add' }, [ btnAdd.node ]),
			srcNote,
			poolHost
		]);
		var body = el('div', { class: 'diag-body' }, [ traceHost, srcCard ]);

		function currentUrls() {
			var out = [];
			src.rows.forEach(function (r) {
				if (r.url)
					out.push(r.url);
			});
			return out;
		}

		function sameList(a, b) {
			if (a.length !== b.length)
				return false;
			for (var i = 0; i < a.length; i++) {
				if (a[i] !== b[i])
					return false;
			}
			return true;
		}

		function savedIndex(url) {
			return url ? src.saved.indexOf(url) : -1;
		}

		function resultOf(url) {
			if (src.busy === url)
				return { text: CFI.T('检测中…'), tone: '' };
			var t = src.one[url];
			if (t && t.state === 'done')
				return fmtResult(t.data);
			if (src.full && src.full.state === 'ok') {
				var rows = src.full.rows || [];
				for (var i = 0; i < rows.length; i++) {
					if (rows[i] && String(rows[i].url) === url)
						return fmtResult(rows[i]);
				}
			}
			return { text: F.DASH, tone: 'dim' };
		}

		function fmtResult(r) {
			if (!r)
				return { text: F.DASH, tone: 'dim' };
			if (r.error)
				return { text: oneError(r.error), tone: 'warn' };
			var code = r.http != null ? String(r.http) : '000';
			var ips = Number(r.ips) || 0;
			var pct = ips ? Math.round(100 * (Number(r.cf_in) || 0) / ips) : null;
			var n = Number(code);
			return {
				text: 'HTTP ' + code + ' · ' + CFI.T('段内') + ' ' + (pct == null ? F.DASH : pct + '%') +
					' · ' + F.num(ips) + ' IP',
				tone: (n >= 200 && n < 400) ? 'ok' : 'warn'
			};
		}

		function paintNote() {
			CFI.dom.clear(srcNote);
			if (src.dirty) {
				srcNote.appendChild(el('p', { class: 'note warn' },
					CFI.T('源清单有改动还没生效：先点页面底部「保存并应用」，再检测。')));
				return;
			}
			if (src.full && src.full.state !== 'ok') {
				srcNote.appendChild(CFI.ui.Msg({ tone: 'warn', title: CFI.T('检测没成功'), text: srcMessage(src.full) }));
				return;
			}
			if (!src.full && !Object.keys(src.one).length) {
				srcNote.appendChild(el('p', { class: 'note' },
					CFI.T('还没检测过。点每行的「检测」，或「检测全部源」。')));
			}
		}

		function refreshRow(row) {
			var r = resultOf(row.url);
			var empty = r.text === F.DASH;
			row.res.textContent = empty ? '' : r.text;
			row.res.hidden = empty;
			row.res.className = 'src-res ' + (r.tone || 'dim');
			var idx = savedIndex(row.url);
			var dis = src.dirty || !!src.busy || !!uiBusy.check || idx < 0 || !actions.checkOne;
			row.btn.update({
				disabled: dis,
				label: src.busy === row.url ? CFI.T('检测中…') : CFI.T('检测')
			});
			row.node.className = 'srcrow' +
				(src.busy === row.url ? ' busy' : '') +
				(row.url && idx < 0 ? ' dirty' : '');
		}

		function refreshActions() {
			btnCheck.update({
				disabled: src.dirty || !!src.busy || !!uiBusy.check,
				busy: !!uiBusy.check,
				label: busyLabel(uiBusy.check, CFI.T('检测全部源'))
			});
			btnPool.update({
				disabled: !!uiBusy.pool, busy: !!uiBusy.pool,
				label: busyLabel(uiBusy.pool, CFI.T('预览候选池'))
			});
		}

		function refreshAll() {
			src.dirty = !sameList(currentUrls(), src.saved);
			srcCount.textContent = CFI.T('%s 条源').format(String(currentUrls().length));
			src.rows.forEach(refreshRow);
			refreshActions();
			paintNote();
		}

		function syncHidden() {
			if (!src.dyn)
				return;
			var urls = currentUrls();
			var sig = urls.join('\u0001');
			if (sig === src.synced)
				return;
			src.synced = sig;
			Array.prototype.slice.call(src.dyn.querySelectorAll('.item')).forEach(function (n) {
				src.dyn.removeChild(n);
			});
			urls.forEach(function (u) {
				var item = el('div', { class: 'item', tabindex: '0', draggable: 'true' });
				item.appendChild(el('span', { text: u }));
				item.appendChild(el('input', { type: 'hidden', value: u }));
				src.dyn.appendChild(item);
			});
			try {
				src.dyn.dispatchEvent(new Event('input', { bubbles: true }));
				src.dyn.dispatchEvent(new Event('change', { bubbles: true }));
			} catch (e) {}
		}

		function addRow(url, focus) {
			var input = el('input', {
				class: 'ctl src-url', type: 'text', value: url || '',
				placeholder: 'https://example.com/ips.txt',
				'aria-label': CFI.T('源地址')
			});
			var res = el('span', { class: 'src-res dim', text: '' });
			res.hidden = true;
			var row = { url: String(url || '').trim(), input: input, res: res, node: null, btn: null };
			var checkBtn = CFI.ui.Button({
				kind: 'link', label: CFI.T('检测'), ariaLabel: CFI.T('检测这一条源'),
				onClick: function () { checkRow(row); }
			});
			var delBtn = CFI.ui.Button({
				kind: 'danger', label: CFI.T('删除'), ariaLabel: CFI.T('删除这一条源'),
				onClick: function () {
					var i = src.rows.indexOf(row);
					if (i >= 0)
						src.rows.splice(i, 1);
					if (row.node && row.node.parentNode)
						row.node.parentNode.removeChild(row.node);
					syncHidden();
					refreshAll();
				}
			});
			row.btn = checkBtn;
			row.node = el('div', { class: 'srcrow' }, [
				input,
				res,
				el('span', { class: 'src-acts' }, [ checkBtn.node, delBtn.node ])
			]);
			var onEdit = function () {
				row.url = String(input.value || '').trim();
				syncHidden();
				refreshAll();
			};
			input.addEventListener('input', onEdit);
			input.addEventListener('change', onEdit);
			src.rows.push(row);
			srcHost.appendChild(row.node);
			refreshRow(row);
			if (focus)
				input.focus();
		}

		function checkRow(row) {
			if (!actions.checkOne || src.dirty || src.busy || uiBusy.check)
				return;
			var idx = savedIndex(row.url) + 1;
			if (idx < 1)
				return;
			var url = row.url;
			var my = src.epoch;
			src.busy = url;
			src.one[url] = { state: 'busy' };
			refreshAll();
			actions.checkOne(idx).then(function (data) {
				if (my !== src.epoch)
					return;
				src.busy = '';
				src.one[url] = { state: 'done', data: data || { error: 'unreachable' } };
				refreshAll();
			}, function () {
				if (my !== src.epoch)
					return;
				src.busy = '';
				src.one[url] = { state: 'done', data: { error: 'unreachable' } };
				refreshAll();
			});
		}

		function setSourceEditor(sec) {
			if (!sec)
				return;
			src.sec = sec;
			src.dyn = sec.querySelector('.cbi-dynlist');
			if (!src.dyn)
				return;
			var saved = [];
			Array.prototype.slice.call(sec.querySelectorAll('.cbi-dynlist .item input[type=hidden]')).forEach(function (x) {
				var v = String(x.value || '').trim();
				if (v)
					saved.push(v);
			});
			src.saved = saved.slice();
			src.synced = saved.join('\u0001');
			src.rows = [];
			src.one = {};
			src.busy = '';
			src.epoch++;
			CFI.dom.clear(srcHost);
			saved.forEach(function (u) { addRow(u, false); });
			if (!saved.length)
				addRow('', false);
			src.attached = true;
			srcCard.hidden = false;
			refreshAll();
		}

		function focusSources() {
			if (!src.attached)
				return;
			if (srcCard.scrollIntoView)
				srcCard.scrollIntoView({ block: 'start' });
			if (src.rows[0] && src.rows[0].input && src.rows[0].input.focus)
				src.rows[0].input.focus();
		}

		function paintTrace(st) {
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
			CFI.dom.clear(traceHost);
			var tone = CFI.sem.tone(st) || 'idle';
			var stage = '';
			if (st.state === 'running' && st.stage)
				stage = (STAGE_LABEL[st.stage] || st.stage) +
					(st.stage_total ? ' ' + (st.stage_done || 0) + '/' + st.stage_total : '');
			var kids = [
				el('b', { text: CFI.sem.stateWord(st) }),
				stage ? el('span', { class: 'mono dim', text: stage }) : null,
				el('span', { class: 'dim', text: st.finished ? F.ago(st.finished) + ' · ' + F.clock(st.finished) : '' }),
				fail ? el('span', { class: 'warn', text: CFI.T('失败 %s：%s').format(String(fail), parts.join(' · ')) }) : null,
				st.intercepted == 1 ? el('span', { class: 'warn', text: CFI.T('出口被接管') }) : null
			];
			traceHost.appendChild(el('div', { class: 'trace-line t-' + tone }, kids));
		}

		function srcSig(s) {
			if (!s)
				return '';
			var rows = s.rows || [];
			var out = [ s.state || '' ];
			for (var i = 0; i < rows.length; i++) {
				var r = rows[i] || {};
				out.push([ r.url, r.http, r.rc, r.ips, r.cf_in ].join('|'));
			}
			return out.join('#');
		}

		function paintSources(state) {
			var s = state.sources || null;
			var sig = srcSig(s);
			if (sig !== src.sig) {
				src.sig = sig;
				src.full = s;
				src.one = {};
				src.busy = '';
				src.epoch++;
			}
			refreshAll();
		}

		function paintPool(state) {
			CFI.dom.clear(poolHost);
			var p = state.pool;
			if (!p) return;
			if (p.state === 'ok') {
				var ips = p.ips || [];
				poolHost.appendChild(el('p', { class: 'note' },
					CFI.T('候选池 %s 个 IP，前 12 个：').format(String(ips.length)) + ' ' + ips.slice(0, 12).join(' ')));
			} else {
				poolHost.appendChild(CFI.ui.Msg({ tone: 'warn', title: CFI.T('候选池没取到'), text: CFI.T('先确认源清单已保存，再点一次。') }));
			}
		}

		function busyLabel(meta, base) {
			if (!meta) return base;
			var sec = Math.floor((Date.now() - (meta.at || Date.now())) / 1000);
			return CFI.T('%s %ss…').format(base, String(sec));
		}

		function paintBusy(state) {
			uiBusy = (state && state.busy) || {};
			refreshAll();
		}

		function update(state) {
			var st = state.status || {};
			var k;
			k = CFI.store.roundKey(st);
			if (k !== last.trace) { last.trace = k; paintTrace(st); }
			k = CFI.store.diagKey(state);
			if (k !== last.src) { last.src = k; paintSources(state); }
			k = JSON.stringify(state.pool || null);
			if (k !== last.pool) { last.pool = k; paintPool(state); }
			k = JSON.stringify(state.busy || {}) + '|' + (state.busyTick || 0);
			if (k !== last.busy) { last.busy = k; paintBusy(state); }
		}

		return {
			node: body, update: update,
			setSourceEditor: setSourceEditor,
			focusSources: focusSources
		};
	}

	CFI.panels = CFI.panels || {};
	CFI.panels.diag = { mount: mount };
})(CFI);
