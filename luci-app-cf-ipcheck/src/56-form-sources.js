(function (CFI) {
	'use strict';

	var el = CFI.dom.el;

	/* 源清单：一张只装这一项的 Map。整张 map 节点挂进设置区宿主 —— 搬单行会
	 * 「看得见、存不进」（r41 真机实测）。全文只能有这一处 DynamicList。 */
	function sourcesMap() {
		var ms = new form.Map('cf_ipcheck', null, null);
		var s = ms.section(form.TypedSection, 'global', null);
		s.anonymous = true;
		var o = s.option(form.DynamicList, 'community_sources', _('社区优选源 URL'), _('每行一个 HTTPS 文本地址；改完点页面底部「保存并应用」。'));
		o.description = CFI.form.help('community_sources',
			_('每行一个 HTTPS 文本地址；改完点页面底部「保存并应用」。'),
			_('这些地址返回纯文本，里面夹着一堆 IPv4；引擎逐行提取、去重后进候选池，没有格式要求。改完必须点页面底部的「保存并应用」才会写进配置文件 —— LuCI 的「保存」只把改动留在 rpcd 进程内存里，引擎读不到。'));
		return ms;
	}

	/* 编辑框里还没生效的条：检测结果里没有、编辑框里有的那些。只在已有结果时比，
	 * 没结果时拿"编辑框非空"当"未应用"是冤枉人。 */
	function pendingSourceEdits(host, rows) {
		if (!host || !host.querySelectorAll || !rows || !rows.length)
			return [];
		var edited = [];
		try {
			var hiddens = host.querySelectorAll('input[type="hidden"]');
			for (var i = 0; i < hiddens.length; i++) {
				if (hiddens[i] && hiddens[i].value)
					edited.push(String(hiddens[i].value));
			}
		} catch (e) {
			return [];
		}
		if (!edited.length)
			return [];
		var checked = {};
		rows.forEach(function (r) { if (r && r.url) checked[String(r.url)] = 1; });
		return edited.filter(function (u) { return !checked[u]; });
	}

	function mountSourcesForm(mapnode, host, openKey) {
		if (!mapnode || !host || !host.appendChild)
			return null;
		CFI.dom.clear(host);
		var body = el('div', { class: 'fold-b' }, [ mapnode ]);
		var c = CFI.ui.Collapse({
			cls: 'srcedit',
			title: T('源清单'),
			hint: T('每行一个 HTTPS 地址；改完点页面底部「保存并应用」才生效'),
			body: body,
			defaultOpen: false,
			persistKey: openKey
		});
		host.appendChild(c.node);
		CFI.form.applyHelp(host);
		return c.node;
	}

	CFI.form.sources = {
		map: sourcesMap,
		pending: pendingSourceEdits,
		mount: mountSourcesForm
	};
})(CFI);
