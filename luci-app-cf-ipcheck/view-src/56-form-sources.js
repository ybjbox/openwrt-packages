(function (CFI) {
	'use strict';

	/* 源清单现在是主 CBI Map 里的普通 DynamicList（group=sources）。
	 * 全页只有一张 Map —— 两张 Map 会各自刷一次共享的 uci 变更，
	 * 清空文本字段时第二次 delete 会 404（r136 真机复现）。
	 * 这里只保留「编辑框里有 N 条还没生效」的比对。 */
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

	CFI.form.sources = { pending: pendingSourceEdits };
})(CFI);
