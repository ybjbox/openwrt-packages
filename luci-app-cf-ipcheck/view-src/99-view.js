var CSS_PATH = 'view/cf_ipcheck/settings.css';

function linkStyle() {
	try {
		if (!document || !document.createElement || !document.head)
			return;
		var href = (typeof L !== 'undefined' && L && typeof L.resource === 'function') ?
			L.resource(CSS_PATH) : ('/luci-static/resources/' + CSS_PATH);
		href += '?v=' + VIEW_BUILD;
		for (var n = document.head.firstChild; n; n = n.nextSibling) {
			if (String(n.tagName).toUpperCase() === 'LINK' && n.getAttribute && n.getAttribute('href') === href)
				return;
		}
		document.head.appendChild(CFI.dom.el('link', { rel: 'stylesheet', href: href }));
	} catch (e) {}
}

var CFI_SHELL = null;
var CFI_ROUTE_SYNC = null;

return view.extend({
	load: function () {
		/* 首帧只取一次状态；render 直接用这份结果，不再二次请求。 */
		return CFI.ipc.call([ 'status' ]);
	},

	render: function (raw) {
		linkStyle();
		var sh = CFI.shell.create(raw);
		CFI_SHELL = sh;
		var root = sh.build().root;

		var startHash = String(window.location ? window.location.hash : '');
		var r = CFI.nav.parseRoute(startHash);
		if (r) {
			sh.goto(r.zone, r.sub, r.arg, false);
		} else {
			/* 旧 hash（#cf-tab=…）不再识别：显式落「运行」，不迁移、不提示。
			 * 只有空 hash 才回到上次的区。 */
			var z0 = startHash ? 'run' : (CFI.prefs.savedZone() || 'run');
			sh.goto(z0, '', '', false);
			CFI.nav.writeRoute(z0, '', '', false);
		}
		var lastHash = '';

		/* hashchange 与 popstate 会为同一次 Back 各触发一次：用 lastHash 去重。 */
		var sync = function () {
			var h = String(window.location ? window.location.hash : '');
			if (h === lastHash)
				return;
			lastHash = h;
			var cur = CFI.nav.parseRoute(h);
			if (!cur) {
				if (CFI_SHELL) {
					var z = h ? 'run' : (CFI.prefs.savedZone() || 'run');
					CFI_SHELL.goto(z, '', '', false);
					CFI.nav.writeRoute(z, '', '', false);
					lastHash = String(window.location.hash);
				}
				return;
			}
			if (CFI_SHELL)
				CFI_SHELL.goto(cur.zone, cur.sub, cur.arg, false);
		};
		lastHash = String(window.location ? window.location.hash : '');

		try {
			window.addEventListener('hashchange', sync);
			window.addEventListener('popstate', sync);
			CFI_ROUTE_SYNC = function () {
				window.removeEventListener('hashchange', sync);
				window.removeEventListener('popstate', sync);
			};
		} catch (e) {}

		if (sh.store.get().status && sh.store.get().status.state === 'running')
			sh.startPoll();

		try { window.__cfi__ = CFI; } catch (e2) {}
		return root;
	},

	teardown: function () {
		if (CFI_SHELL)
			CFI_SHELL.destroy();
		CFI_SHELL = null;
		try {
			if (CFI_ROUTE_SYNC)
				CFI_ROUTE_SYNC();
		} catch (e) {}
		CFI_ROUTE_SYNC = null;
		return true;
	}
});
