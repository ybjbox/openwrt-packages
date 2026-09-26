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
	/* 注意：expect:{stdout:''} 已经把 stdout 拆出来了，
	 * 这里 resolve 到的就是那段字符串本身，不是 {stdout:...} 对象。
	 * 真机上验过一次：写成 res.stdout 会永远拿到 undefined，
	 * 页面于是无论测没测过都显示「尚未运行过」。
	 */
	return callExec(CMD, args).then(function (out) {
		if (typeof out !== 'string')
			return null;
		return out;
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
		// 出口被透明代理接管时，逐 IP 的数字没有意义（引擎每轮用保留地址自检）
		o.intercepted = (o.intercepted === 1 || o.intercepted === '1') ? 1 : 0;
		return o;
	} catch (e) {
		return { state: 'parse_error', items: [], raw: text };
	}
}

/* 接管警告条：这台机器上本机 443 会被 OpenClash 之类接管重拨，
 * 引擎用 RFC 5737 保留地址做 canary —— 保留地址本该连不上，
 * 一旦它回了状态码就说明 --resolve 钉的 IP 没参与选路。 */
function renderInterceptNotice() {
	return E('div', { class: 'alert danger' }, [
		E('strong', {}, _('出口被透明代理接管，本轮数字不可信：')),
		E('p', {}, _('引擎用保留地址 %s 做自检，它也拿到了 HTTP 响应 —— 说明本机发起的 443 被接管后由代理自己重新拨号，' +
			'%s 钉住的候选 IP 根本没参与选路。下面这张表量的是「本机 → 代理 → Cloudflare」，不是各候选 IP 的差异。')
			.format('203.0.113.77 / 198.51.100.77', 'curl --resolve')),
		E('p', {}, _('要拿到真实结果：给探测进程开一条绕过代理的出口（按 uid/gid 不加防火墙 mark），' +
			'或者把 cf-ipcheck 拷到没被接管的机器上跑，再用 %s 上传结果。')
			.format('--upload-gist'))
	]);
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

	var meta = _('候选 %1$s 个 · 达标 %2$s 个 · 榜单 %5$s 条 · 探测域名 %3$s · 完成于 %4$s')
		.replace('%1$s', st.pool != null ? st.pool : '—')
		.replace('%2$s', st.qualified != null ? st.qualified : (st.items || []).length)
		.replace('%5$s', st.usable != null ? st.usable : (st.items || []).length)
		.replace('%3$s', st.domains || '—')
		.replace('%4$s', st.finished || st.started || '—');

	return E('div', { class: 'cbi-section', id: 'cf-ipcheck-result' }, [
		E('div', { class: 'cbi-section-node' }, [
			st.intercepted == 1 ? renderInterceptNotice() : '',
			E('p', { class: 'small' }, meta),
			E('div', { class: 'table cbi-section-table' }, [
				E('thead', {}, [
					E('tr', { class: 'tr table-titles' },
						head.map(function (t) {
							return E('th', { class: 'th' }, t);
						}))
				]),
				tbody
			]),
			E('p', { class: 'small' }, [
				E('abbr', { title: _('Time To First Byte，首字节时间') }, _('TTFB')),
				_(' 与其他三段的含义：TCP 握手 = 与对端完成三次连接；TLS 握手 = 从连上到 TLS 协商完成（含证书校验）；' +
				  'TTFB = 发出请求到收到第一个字节的耗时，代表「对端处理 + 回程」，是四个指标里最贴近「打开页面快不快」的一个；' +
				  '总计 = 整个请求收尾。Cloudflare 是 anycast，同一个 IP 从不同线路会打到不同机房，' +
				  '所以 ICMP ping 再低也不说明代理能用 —— 只看这四段，且只看带真实 SNI 的 HTTPS 能否走通。' +
				  '排序按总计升序、同值再看 TTFB；total_limit 与 ttfb_limit 两道门槛都过才算达标。')
			])
		])
	]);
}

function refreshResult() {
	return execCfIpcheck(['status']).then(function (out) {
		var st = parseStatus(out);
		var old = document.getElementById('cf-ipcheck-result');
		var next = renderTable(st);
		if (old && old.parentNode)
			old.parentNode.replaceChild(next, old);
		/* 定时器挂在结果块外面一层，重画后要把计时器句柄搬过去，
		 * 否则 clearInterval 找的是已经被替换掉的旧节点。 */
		if (old && old.__cf_timer)
			next.__cf_timer = old.__cf_timer;
		return { node: next, state: st.state, intercepted: st.intercepted };
	});
}

function autoRefresh(node) {
	/* 测速进行中每 5 秒拉一次；结束后停掉，避免白烧 CPU 和请求。
	 * 停止条件看 status 里的 state，不看 DOM 文案 —— 早先拿
	 * 「表格里有没有『正在测速』」判断，而那段文字在 <td> 里、
	 * 查的又是 <p>，第一次刷新就会把定时器关掉。 */
	if (node && node.__cf_timer)
		clearInterval(node.__cf_timer);

	var timer = setInterval(function () {
		refreshResult().then(function (r) {
			if (r.state !== 'running') {
				clearInterval(timer);
				if (r.node)
					r.node.__cf_timer = null;
			}
		});
	}, 5000);

	if (node)
		node.__cf_timer = timer;
}

/* 源可用性检测：逐条 URL 看 HTTP 状态、提取到多少 IPv4、其中多少落在 CF 官方段内。
 * 后两列是收录标准 —— 段内占比掉下来就说明源换内容了（比如开始吐中转 IP）。 */
function renderSources(rows) {
	var head = [_('源 URL'), _('HTTP'), _('提取到 IPv4'), _('落在 CF 段内'), _('段内占比')];
	var tbody = E('tbody', {});

	if (!rows.length) {
		tbody.appendChild(E('tr', {}, [
			E('td', { colspan: String(head.length), class: 'center' }, _('没有配置社区源，或检测没返回内容'))
		]));
	}

	for (var i = 0; i < rows.length; i++) {
		var r = rows[i];
		var pct = (r.ips > 0 && r.cf_in >= 0) ? Math.round(100 * r.cf_in / r.ips) : null;
		var cls = 'left';
		if (r.http === '000' || !r.http || r.rc !== 0)
			cls = 'left warning';
		else if (pct != null && pct < 90)
			cls = 'left notice';
		tbody.appendChild(E('tr', { class: cls }, [
			E('td', { class: 'left mono' }, String(r.url || '')),
			E('td', { class: 'left' }, r.http ? String(r.http) : _('拉不到')),
			E('td', { class: 'left' }, String(r.ips != null ? r.ips : '—')),
			E('td', { class: 'left' }, r.cf_in < 0 ? '—' : String(r.cf_in)),
			E('td', { class: 'left' }, pct == null ? '—' : pct + ' %')
		]));
	}

	return E('div', { class: 'table cbi-section-table' }, [
		E('thead', {}, [E('tr', { class: 'tr table-titles' },
			head.map(function (t) { return E('th', { class: 'th' }, t); }))]),
		tbody
	]);
}

function checkSources(btn) {
	var host = document.getElementById('cf-ipcheck-sources-host');
	if (btn) {
		btn.disabled = true;
		btn.textContent = _('检测中…');
	}
	if (host)
		host.innerHTML = '<em>' + _('正在逐个拉取源并比对 Cloudflare 官方网段…') + '</em>';

	return execCfIpcheck(['check-sources']).then(function (out) {
		var rows = [];
		try {
			rows = JSON.parse(out || '[]');
		} catch (e) {
			rows = [];
		}
		if (host) {
			host.innerHTML = '';
			host.appendChild(renderSources(Array.isArray(rows) ? rows : []));
		}
		if (btn) {
			btn.disabled = false;
			btn.textContent = _('重新检测');
		}
	});
}

/* 按钮事件：Map 节点 resolve 出来后才能拿到 id，所以带重试地绑 */
function bindButtons(tableNode, st, tries) {
	var run = document.getElementById('cf-ipcheck-run');
	var stop = document.getElementById('cf-ipcheck-stop');
	var rel = document.getElementById('cf-ipcheck-refresh');
	var chk = document.getElementById('cf-ipcheck-check-sources');

	if (!run || !stop || !rel) {
		if ((tries || 0) < 40)
			setTimeout(function () { bindButtons(tableNode, st, (tries || 0) + 1); }, 50);
		return;
	}

	run.onclick = function () {
		this.disabled = true;
		var self = this;
		execCfIpcheck(['run-now']).then(function (out) {
			self.disabled = false;
			ui.toast('info', _('已启动一轮测速'), out || _('已后台运行'));
			refreshResult().then(function (r) { autoRefresh(r.node); });
		});
		return false;
	};

	stop.onclick = function () {
		execCfIpcheck(['stop']).then(function () {
			ui.toast('warning', _('已请求停止'), _('当前这轮收尾后不再继续探测'));
			refreshResult();
		});
		return false;
	};

	rel.onclick = function () {
		refreshResult();
		return false;
	};

	if (chk)
		chk.onclick = function () {
			checkSources(this);
			return false;
		};

	if (st && st.state === 'running')
		autoRefresh(tableNode);
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
						E('em', {}, (st.state === 'running' ? _('正在测速') :
							(st.state === 'never_run' ? _('从未运行') : _('空闲'))) +
							(st.intercepted == 1 ? ' · ' + _('出口被接管，数字不可信') : '')))
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
			_('逗号分隔。请填你**真正要用的那个域名**（EDT / Worker 节点域名最合适）：' +
			  '干扰是按 SNI 走的，同一个 IP 上 www.cloudflare.com 能通并不等于你的节点能通，' +
			  '反过来用节点域名测出来的榜单才是可直接应用的结果。' +
			  '域名必须架在 Cloudflare 后面（橙色云、CF 给它签了证书）；403 / 404 都算达标，' +
			  '判定只看「带真实 SNI 的 HTTPS 能否走通并拿到 HTTP 响应」，不看内容。' +
			  '探测时用 --resolve 把该域名钉到候选 IP 上，所以 SNI 与 Host 都是这个域名。'));
		o.default = 'www.cloudflare.com';

		o = s.option(form.Value, 'probe_port', _('探测端口'),
			_('一般保持 443；只有你要验非标准 HTTPS 端口时才改。'));
		o.datatype = 'port';
		o.default = '443';

		var src = m.section(form.TypedSection, 'global', _('候选池来源'));
		src.anonymous = true;

		o = src.option(form.Flag, 'use_official_ranges', _('Cloudflare 官方网段'),
			_('实时拉 api.cloudflare.com/client/v4/ips，把每个前缀按 /24 展开取样。默认关：' +
			  '官方段展开是近六千个候选，抽稀后仍会占掉大半名额，把别人已经优选好的地址挤出去。' +
			  '想扩大覆盖面（刚换线路、怀疑候选池老化）再打开，它会用剩余名额等间隔抽稀。'));
		o.rmempty = false;

		o = src.option(form.Flag, 'reuse_last', _('带上上一轮入围 IP'),
			_('把上次结果并回候选池，保证榜单连续、不会因为候选抖动而全换。'));
		o.rmempty = false;

		o = src.option(form.DynamicList, 'community_sources', _('社区优选源 URL'),
			_('每行一个 HTTPS 文本地址，IP / CIDR / IP:端口 都能提取（CIDR 按 /24 取样），' +
			  '注释、CSV 表头、IPv6 自动忽略；某个源拉不到只记日志，不影响本轮。' +
			  '默认十三条是 2026-09-27 逐个核过的：提取到的 IPv4 绝大多落在 Cloudflare 官方段内 —— ' +
			  '像 bestcf.pages.dev/random-region/mix.txt 那种 306 条全在段外的清单其实是别人的中转/VPS，' +
			  '不是 CF anycast，就没有收进来。这些列表只代表"别人线路上测出来不错"，' +
			  '在你这儿算不算好仍由本页实测说了算。名额分配：上一轮入围全保 → 社区源占剩下一半且逐源均分 → ' +
			  '官方网段抽稀填满其余。想看本轮实际会用哪些 IP，命令行跑 cf-ipcheck pool。'));

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
			_('TTFB = Time To First Byte，请求发出后收到第一个字节的耗时，代表「对端处理 + 回程」。' +
			  '它比 ping 的 RTT 更贴近实际体感：ping 只测到 ICMP 应答，而 anycast 下那个点未必是你会话真正落地的机房，' +
			  '也可能干脆不响应 ICMP；TTFB 则是这个 IP 上完整 TCP+TLS 走通之后，应用层第一次给出数据的时间。' +
			  '首字节慢通常意味着被调度到了远机房或链路拥塞，超过这个值直接判为不达标。'));
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

		o = thr.option(form.Flag, 'canary_check', _('每轮先自检出口是否被代理接管'),
			_('拿 RFC 5737 保留地址（203.0.113.77 / 198.51.100.77）按同一条探测路径试一次：' +
			  '保留地址全球不可路由，正常只会超时；一旦它返回任何 HTTP 状态码，就说明本机 443 被 ' +
			  'OpenClash 这类透明代理接管、由代理自己重新拨号，此时 --resolve 钉的候选 IP 没参与选路，' +
			  '榜单只是「本机 → 代理 → CF」的耗时。开启后本轮结果会被打标并在页面红条提示。' +
			  '每轮最多额外占用 2 次探测超时（默认 4 秒）。'));
		o.rmempty = false;

		o = thr.option(form.Value, 'probe_user', _('探测发起身份'),
			_('默认 nobody —— OpenClash 的 mangle 链第一条规则就是 meta skgid 65534 return，' +
			  '用 nobody 跑探测正好不被打 mark，量到的才是候选 IP 自己的握手；' +
			  'root 直发会被代理接管（实测同一个 IP：nobody 下 TCP 193ms，root 下 0.7ms，后者是假的）。' +
			  '家里没有透明代理、或就是想按 root 测，可以留空。需要 su 支持，改动后下一轮生效。'));
		o.default = 'nobody';

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

		o = gs.option(form.Value, 'gist_token', _('GitHub Token'),
			_('直接写进 UCI（本机默认这条路）。清单内容只是优选 IP，泄露代价低，所以按 Ryan 的要求允许写在配置里；' +
			  '代价是它会随 sysupgrade 备份走、也在本页面回显，因此请只填**只勾选了 gist 权限**的经典令牌，' +
			  '不要用有 repo/workflow 权限的。填了这里就优先用它；留空则退回下面的 token_file。'));
		o.password = true;

		o = gs.option(form.Value, 'token_file', _('Token 文件路径（备选）'),
			_('不想把令牌写进配置就留空上面的字段，改从该文件读：' +
			  '在路由器上执行 printf "%s" "你的令牌" > /etc/cf-ipcheck.token 再 chmod 600 该文件即可。' +
			  '两处都填时以上面的 gist_token 为准。'));
		o.default = '/etc/cf-ipcheck.token';

		/* ---- 拼页面：操作条 + 结果表 + 源体检 + 表单 ---- *
		 * m.render() 给的是 Promise，不是节点：不能直接塞进返回数组里。
		 * 先把 Map 节点 resolve 出来，再拼成纯节点数组返回。
		 */
		var table = renderTable(st);

		/* 源可用性检测：不自动跑（十来个源逐个拉太慢），点按钮才检测 */
		var srccard = E('div', { class: 'cbi-section', id: 'cf-ipcheck-sources-card' }, [
			E('div', { class: 'cbi-section-node' }, [
				E('div', { class: 'cbi-value' }, [
					E('label', { class: 'cbi-value-title' }, _('源可用性检测')),
					E('div', { class: 'cbi-value-field' },
						E('button', {
							id: 'cf-ipcheck-check-sources',
							class: 'cbi-button',
							type: 'button'
						}, _('检测源可用性')))
				]),
				E('div', { id: 'cf-ipcheck-sources-host' },
					E('p', { class: 'small' },
						_('逐条 URL 实拉一次，列出 HTTP 状态、提取到的 IPv4 数量，以及其中落在 Cloudflare 官方网段内的比例。' +
						  '段内占比掉到 90% 以下通常说明源改内容了（例如开始提供别人自己的中转 IP），' +
						  '拉不到的那条会标黄，引擎本轮会跳过它并记日志。')))
			])
		]);

		var nodes = [bar, table, srccard];

		return m.render().then(function (mapnode) {
			nodes.push(mapnode);
			bindButtons(table, st, 0);
			return nodes;
		});
	}
});
