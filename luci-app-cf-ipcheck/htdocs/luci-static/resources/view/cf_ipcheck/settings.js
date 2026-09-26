'use strict';
'require form';
'require rpc';
'require ui';
'require view';

/*
 * 与后端的通道只有一条：rpcd 的 file.exec 调用 /usr/bin/cf-ipcheck。
 * 为什么不用 fs.read 读状态文件 —— 那样要额外授意 file.read，且各版本
 * 返回字段（data/buf）不一致；让脚本自己把 JSON 打到 stdout 更稳。
 * ACL 已在 root/usr/share/rpcd/acl.d/ 里放开了这个可执行文件的 exec。
 */
var CMD = '/usr/bin/cf-ipcheck';

var callExec = rpc.declare({
	object: 'file',
	method: 'exec',
	params: [ 'command', 'params' ],
	expect: { stdout: '' }
});

function execCfIpcheck(args) {
	return callExec(CMD, args).then(function (res) {
		if (res == null || typeof res.stdout !== 'string')
			return null;
		return res.stdout;
	}, function () {
		return null;
	});
}

function parseStatus(text) {
	if (!text)
		return { state: 'unknown', items: [] };
	try {
		var o = JSON.parse(text);
		if (!Array.isArray(o.items))
			o.items = [];
		return o;
	} catch (e) {
		return { state: 'parse_error', items: [], raw: text };
	}
}

function fmtMs(v) {
	if (v == null || isNaN(v))
		return '—';
	return Number(v).toFixed(1) + ' ms';
}

/* 结果表：单独抽出来，按钮触发后只重画这一块，不整页闪 */
function renderTable(st) {
	var head = [
		'#', _('IP 地址'), _('状态码'),
		_('TCP 握手'), _('TLS 握手'), _('TTFB'), _('总计'), _('落地机房')
	];

	var tbody = E('tbody', {});

	if (!st.items.length) {
		tbody.appendChild(E('tr', {}, [
			E('td', { colspan: String(head.length), class: 'center' },
				st.state === 'running'
					? _('正在测速，请稍候…')
					: (st.state === 'never_run'
						? _('尚未运行过，点上方「立即测速」开始第一轮。')
						: _('本轮没有达标 IP（可放宽 TTFB/总耗时阈值，或检查探测域名）')))
		]));
	} else {
		for (var i = 0; i < st.items.length; i++) {
			var it = st.items[i];
			tbody.appendChild(E('tr', {}, [
				E('td', { class: 'left' }, String(i + 1)),
				E('td', { class: 'left mono' }, it.ip || '?'),
				E('td', { class: 'left' }, it.code != null ? String(it.code) : '—'),
				E('td', { class: 'left' }, fmtMs(it.connect_ms)),
				E('td', { class: 'left' }, fmtMs(it.tls_ms)),
				E('td', { class: 'left' }, fmtMs(it.ttfb_ms)),
				E('td', { class: 'left' }, fmtMs(it.total_ms)),
				E('td', { class: 'left' }, it.colo || '—')
			]));
		}
	}

	var meta = _('候选 %1$s 个 · 达标 %2$s 个 · 探测域名 %3$s · 完成于 %4$s')
		.replace('%1$s', st.pool != null ? st.pool : '—')
		.replace('%2$s', st.usable != null ? st.usable : (st.items || []).length)
		.replace('%3$s', st.domains || '—')
		.replace('%4$s', st.finished || st.started || '—');

	return E('div', { class: 'cbi-section', id: 'cf-ipcheck-result' }, [
		E('div', { class: 'cbi-section-node' }, [
			E('p', { class: 'small' }, meta),
			E('div', { class: 'table cbi-section-table' }, [
				E('thead', {}, [
					E('tr', { class: 'tr table-titles' },
						head.map(function (t) {
							return E('th', { class: 'th' }, t);
						}))
				]),
				tbody
			])
		])
	]);
}

function refreshResult() {
	return execCfIpcheck(['status']).then(function (out) {
		var old = document.getElementById('cf-ipcheck-result');
		var next = renderTable(parseStatus(out));
		if (old && old.parentNode)
			old.parentNode.replaceChild(next, old);
		return next;
	});
}

function autoRefresh(node) {
		/* 测速进行中每 5 秒拉一次；结束后停掉，避免白烧 CPU 和请求 */
	if (node && node.__cf_timer)
		clearInterval(node.__cf_timer);

	var timer = setInterval(function () {
		refreshResult().then(function (n) {
			var p = n && n.querySelector('p');
			if (p && !/正在测速/.test(p.textContent))
				clearInterval(timer);
		});
	}, 5000);

	if (node)
		node.__cf_timer = timer;
}

return view.extend({
	title: _('Cloudflare 优选 IP 实测'),

	load: function () {
		return execCfIpcheck(['status']);
	},

	render: function (raw) {
		var st = parseStatus(raw);

		/* ---- 顶部操作条 ---- */
		var bar = E('div', { class: 'cbi-section', id: 'cf-ipcheck-actions' }, [
			E('div', { class: 'cbi-section-node' }, [
				E('div', { class: 'cbi-value' }, [
					E('label', { class: 'cbi-value-title' }, _('状态')),
					E('div', { class: 'cbi-value-field' },
						E('em', {}, st.state === 'running' ? _('正在测速') :
							(st.state === 'never_run' ? _('从未运行') : _('空闲'))))
				]),
				E('div', { class: 'cbi-value' }, [
					E('label', { class: 'cbi-value-title' }, _('操作')),
					E('div', { class: 'cbi-value-field' }, [
						E('button', {
							id: 'cf-ipcheck-run',
							class: 'cbi-button cbi-button-positive',
							type: 'button'
						}, _('立即测速')),
						' ',
						E('button', {
							id: 'cf-ipcheck-stop',
							class: 'cbi-button',
							type: 'button'
						}, _('停止本轮')),
						' ',
						E('button', {
							id: 'cf-ipcheck-refresh',
							class: 'cbi-button',
							type: 'button'
						}, _('刷新'))
					])
				])
			])
		]);

		/* ---- 配置表单 ---- */
		var m = new form.Map('cf_ipcheck',
			_('Cloudflare 优选 IP 实测'),
			_('在你自己的线路上实测 Cloudflare 边缘 IP：判定口径是「带真实 SNI 的 HTTPS 探测成功（HTTP 2xx/3xx）」，' +
			  '而不是 ping —— Cloudflare 是 anycast，ICMP 延迟低不代表代理线路能用。'));

		var s = m.section(form.TypedSection, 'global', _('基本设置'));
		s.anonymous = true;

		var o;

		o = s.option(form.Flag, 'enabled', _('启用定时实测'),
			_('关闭时后台进程只空转不测速；打开后一分钟内开始下一轮，无需重启服务。'));
		o.rmempty = false;

		o = s.option(form.Value, 'interval_hours', _('定时周期（小时）'),
			_('一轮完整测速的间隔。候选池越大、超时越长，单轮耗时越久。'));
		o.datatype = 'and(uinteger,min(1))';
		o.default = '6';

		o = s.option(form.Value, 'probe_domains', _('探测域名'),
			_('逗号分隔。必须填写真正解析到 Cloudflare 后面的域名（如节点域名或 Worker 域名）；' +
			  '探测时用 --resolve 把它钉到候选 IP 上，所以 SNI 与 Host 都是这个域名。'));
		o.default = 'www.cloudflare.com';

		o = s.option(form.Value, 'probe_port', _('探测端口'),
			_('一般保持 443；只有你要验非标准 HTTPS 端口时才改。'));
		o.datatype = 'port';
		o.default = '443';

		var src = m.section(form.TypedSection, 'global', _('候选池来源'));
		src.anonymous = true;

		o = src.option(form.Flag, 'use_official_ranges', _('Cloudflare 官方网段'),
			_('实时拉取 api.cloudflare.com/client/v4/ips，把每个前缀按 /24 展开取样，' +
			  '避免上千 IP 全扫。'));
		o.rmempty = false;

		o = src.option(form.Flag, 'reuse_last', _('带上上一轮入围 IP'),
			_('把上次结果并回候选池，保证榜单连续、不会因为候选抖动而全换。'));
		o.rmempty = false;

		o = src.option(form.DynamicList, 'community_sources', _('社区优选源 URL'),
			_('每行一个 HTTPS 文本地址，内容里的 IP 或 CIDR 都会被提取（CIDR 按 /24 展开）。' +
			  '留空即不使用。'));

		var thr = m.section(form.TypedSection, 'global', _('测速与判定'));
		thr.anonymous = true;

		o = thr.option(form.Value, 'candidate_budget', _('单轮候选上限'),
			_('去重后最多探测多少个 IP。太大了会拉长单轮时间，也更容易触发运营商限速。'));
		o.datatype = 'and(uinteger,min(8),max(4096))';
		o.default = '256';

		o = thr.option(form.Value, 'concurrency', _('并发探测数'),
			_('同时探测的 IP 数。软路由上 8~16 比较稳。'));
		o.datatype = 'and(uinteger,min(1),max(64))';
		o.default = '8';

		o = thr.option(form.Value, 'probe_timeout', _('单 IP 超时（秒）'),
			_('同时作为 TCP 连接超时与整请求超时。'));
		o.datatype = 'and(uinteger,min(1),max(30))';
		o.default = '5';

		o = thr.option(form.Value, 'ttfb_limit', _('TTFB 上限（毫秒）'),
			_('超过这个值直接判为不达标 —— 首字节慢通常意味着被调度到了远机房或拥塞。'));
		o.datatype = 'and(uinteger,min(100))';
		o.default = '3000';

		o = thr.option(form.Value, 'total_limit', _('总耗时上限（毫秒）'),
			_('第二个门槛，与 TTFB 同时满足才算可用。'));
		o.datatype = 'and(uinteger,min(200))';
		o.default = '5000';

		o = thr.option(form.Value, 'keep_count', _('榜单保留条数'),
			_('排序按总耗时升序，同值再看 TTFB。'));
		o.datatype = 'and(uinteger,min(1),max(100))';
		o.default = '10';

		o = thr.option(form.Flag, 'colo_probe', _('识别落地机房'),
			_('只对入围 IP 请求 cdn-cgi/trace 取 colo= 字段，多一次请求，用来确认 IP 实际打到哪个机房。'));
		o.rmempty = false;

		o = thr.option(form.Value, 'annotate', _('ip.txt 注释模板'),
			_('写在每个 IP 后面的说明，可用占位符 {colo} 与 {total}；留空则只输出 IP 与端口。'));
		o.default = 'cf-ipcheck | {colo} | {total}ms';

		var gs = m.section(form.TypedSection, 'global', _('Gist 上传'));
		gs.anonymous = true;

		o = gs.option(form.Flag, 'upload_gist', _('每轮结束后上传 ip.txt'),
			_('失败只记日志，不影响本地结果。'));
		o.rmempty = false;

		o = gs.option(form.Value, 'gist_id', _('Gist ID'),
			_('Gist 网址里那串十六进制 ID。需要先手工建一个 Gist。'));

		o = gs.option(form.Value, 'gist_file', _('Gist 文件名'),
			_('例如 cf-ip.txt —— PATCH 更新的是同名文件，名字不一致会在 Gist 里新增一份。'));
		o.default = 'cf-ip.txt';

		o = gs.option(form.Value, 'token_file', _('Token 文件路径'),
			_('令牌只从这个文件读，不写进 UCI 配置，避免备份或截图时泄露。' +
			  '在路由器上执行 printf "%s" "你的令牌" > /etc/cf-ipcheck.token 再 chmod 600 该文件即可' +
			  '（用只需要 gist 权限的经典令牌）。'));
		o.default = '/etc/cf-ipcheck.token';

		/* ---- 拼页面：操作条 + 结果表 + 表单 ---- */
		var table = renderTable(st);
		var nodes = [bar, table, m.render()];

		/* 按钮事件：DOM 就绪后再绑 */
		setTimeout(function () {
			var run = document.getElementById('cf-ipcheck-run');
			var stop = document.getElementById('cf-ipcheck-stop');
			var rel = document.getElementById('cf-ipcheck-refresh');

		if (run)
			run.onclick = function () {
				this.disabled = true;
				var self = this;
				execCfIpcheck(['run-now']).then(function (out) {
					self.disabled = false;
					ui.toast('info', _('已启动一轮测速'), out || _('已后台运行'));
					refreshResult().then(autoRefresh);
				});
				return false;
			};

		if (stop)
			stop.onclick = function () {
				execCfIpcheck(['stop']).then(function () {
					ui.toast('warning', _('已请求停止'), _('当前这轮收尾后不再继续探测'));
					refreshResult();
				});
				return false;
			};

		if (rel)
			rel.onclick = function () {
				refreshResult();
				return false;
			};

		if (st.state === 'running')
			autoRefresh(table);
		}, 50);

		return nodes;
	}
});
