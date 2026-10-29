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
var CFI_HASH_STOP = null;

function cfiInitialZone() {
	return CFI.nav.parseHash(window.location ? window.location.hash : '') ||
		CFI.prefs.savedZone() || 'run';
}

return view.extend({
	load: function () {
		CFI.prefs.migrate();
		return CFI.ipc.call([ 'status' ]);
	},

	render: function (raw) {
		linkStyle();
		var sh = CFI.shell.create(raw);
		CFI_SHELL = sh;
		var root = sh.build().root;
		sh.goto(cfiInitialZone(), false);

		try {
			var on = function () {
				var z = CFI.nav.parseHash(window.location.hash);
				if (z && CFI_SHELL)
					CFI_SHELL.goto(z, false);
			};
			window.addEventListener('hashchange', on);
			CFI_HASH_STOP = function () { window.removeEventListener('hashchange', on); };
		} catch (e) {}

		/* 首帧若读到的是「正在跑」，直接把轮询接上；否则主动取一次状态。 */
		if (!sh.store.get().status || sh.store.get().status.state !== 'running')
			sh.refresh(true);
		else
			sh.startPoll();

		try { window.__cfi__ = CFI; } catch (e2) {}
		return root;
	},

	teardown: function () {
		if (CFI_SHELL)
			CFI_SHELL.destroy();
		CFI_SHELL = null;
		try {
			if (CFI_HASH_STOP)
				CFI_HASH_STOP();
		} catch (e) {}
		CFI_HASH_STOP = null;
		return true;
	}
});
