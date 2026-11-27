'use strict';
'require view';
'require form';
'require uci';
'require rpc';
'require ui';

/* NAV 采集器 LuCI 配置页：
 * 1) 顶部运行状态卡（进程存活 / PID / 本地 :12900 快捷入口 / 一键重启）；
 * 2) m.tabbed = true 分 6 个清晰标签页，并通过 depends('enabled', '1') 联动折叠；
 * 3) 遵循 ES5 语法，兼容 OpenWrt luci.mk JsMin 压缩。 */

var callRestart = rpc.declare({
	object: 'luci',
	method: 'setInitAction',
	params: [ 'name', 'action' ],
	expect: { result: false }
});

var callServiceList = rpc.declare({
	object: 'service',
	method: 'list',
	params: [ 'name' ],
	expect: { '': {} }
});

/* 敏感值字段：密码框且不明文回显；仅在输入新值时写回，留空不改动原值。 */
function sensitiveOption(s, key, title, desc) {
	var o = s.option(form.Value, key, title, desc);
	o.password = true;
	o.placeholder = _('留空表示不修改');
	o.cfgvalue = function() { return ''; };
	o.write = function(section_id, value) {
		if (value !== null && value !== undefined && String(value).length > 0)
			return uci.set('nav', section_id, key, value);
	};
	return o;
}

/* 解析当前服务运行状态 */
function parseRunning(svcData) {
	var nav = svcData && svcData.nav;
	var insts = nav && nav.instances;
	if (!insts)
		return { running: false, pid: null };
	var keys = Object.keys(insts);
	for (var i = 0; i < keys.length; i++) {
		var it = insts[keys[i]];
		if (it && it.running)
			return { running: true, pid: it.pid || null };
	}
	return { running: false, pid: null };
}

/* 根据 uci ui.listen 拼接局域网状态页 URL */
function buildLocalUiUrl() {
	var listen = uci.get('nav', 'ui', 'listen') || ':12900';
	var m = String(listen).match(/:(\d+)$/);
	var port = m ? m[1] : '12900';
	return 'http://' + window.location.hostname + ':' + port;
}

/* 构造顶部状态概览条 */
function renderStatusCard(svcInfo) {
	var badgeEl = E('span', {
		'style': 'display:inline-flex;align-items:center;gap:6px;padding:3px 10px;border-radius:999px;font-size:12px;font-weight:600;' +
			(svcInfo.running
				? 'background:rgba(16,185,129,0.14);color:#059669;'
				: 'background:rgba(239,68,68,0.12);color:#dc2626;')
	}, [
		E('span', {
			'style': 'width:7px;height:7px;border-radius:50%;background:' + (svcInfo.running ? '#10b981' : '#ef4444') + ';'
		}),
		svcInfo.running
			? _('运行中') + (svcInfo.pid ? ' (PID ' + svcInfo.pid + ')' : '')
			: _('未运行')
	]);

	var restartBtn = E('button', {
		'type': 'button',
		'class': 'cbi-button cbi-button-apply',
		'click': function(ev) {
			var btn = ev.currentTarget;
			btn.disabled = true;
			callRestart('nav', 'restart').then(function() {
				return new Promise(function(resolve) { setTimeout(resolve, 1200); });
			}).then(function() {
				return callServiceList('nav');
			}).then(function(nextData) {
				var st = parseRunning(nextData);
				badgeEl.style.background = st.running ? 'rgba(16,185,129,0.14)' : 'rgba(239,68,68,0.12)';
				badgeEl.style.color = st.running ? '#059669' : '#dc2626';
				badgeEl.childNodes[0].style.background = st.running ? '#10b981' : '#ef4444';
				badgeEl.childNodes[1].nodeValue = st.running
					? _('运行中') + (st.pid ? ' (PID ' + st.pid + ')' : '')
					: _('未运行');
				ui.addNotification(null, E('p', _('NAV 采集器已重启')), 'info');
			}).catch(function(err) {
				ui.addNotification(null, E('p', _('重启失败：') + (err && err.message ? err.message : err)), 'error');
			}).finally(function() {
				btn.disabled = false;
			});
		}
	}, _('重启采集器'));

	var openUiBtn = E('a', {
		'class': 'cbi-button cbi-button-action',
		'href': buildLocalUiUrl(),
		'target': '_blank',
		'rel': 'noopener noreferrer',
		'style': 'text-decoration:none;'
	}, _('打开本地监控页'));

	return E('div', {
		'class': 'cbi-section',
		'style': 'padding:14px 18px;margin-bottom:16px;display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:12px;'
	}, [
		E('div', { 'style': 'display:flex;align-items:center;gap:12px;flex-wrap:wrap;' }, [
			E('strong', { 'style': 'font-size:14px;' }, _('采集器状态')),
			badgeEl,
			E('span', { 'style': 'font-size:12px;opacity:0.75;' },
				_('采集范围：路由器系统（/proc + ubus fwx + 日志） / OpenClash / 飞牛 NAS'))
		]),
		E('div', { 'style': 'display:flex;align-items:center;gap:8px;flex-wrap:wrap;' }, [
			openUiBtn,
			restartBtn
		])
	]);
}

return view.extend({
	load: function() {
		return Promise.all([
			uci.load('nav'),
			callServiceList('nav').catch(function() { return {}; })
		]);
	},

	render: function(loaded) {
		var svcInfo = parseRunning(loaded && loaded[1]);
		var m, s, o;

		m = new form.Map('nav', _('NAV 采集器'),
			_('向个人导航云端推送路由器、OpenClash 与飞牛 NAS 状态及脱敏日志。保存并应用后自动重启生效。'));
		m.tabbed = true;

		/* ---------- 1. 云端推送 ---------- */
		s = m.section(form.NamedSection, 'main', 'main', _('云端推送'));
		s.addremove = false;
		s.anonymous = false;

		o = s.option(form.Flag, 'enabled', _('启用采集器'));
		o.rmempty = false;

		o = s.option(form.Value, 'push_url', _('推送地址'),
			_('NAV 云端摄入接口，例如 https://nav.403333.xyz/api/ingest'));
		o.datatype = 'string';
		o.rmempty = false;
		o.depends('enabled', '1');

		o = sensitiveOption(s, 'push_token', _('推送令牌'),
			_('与 Cloudflare Secret COLLECTOR_TOKEN 一致（≥16 位）；留空不修改'));
		o.depends('enabled', '1');

		o = s.option(form.Value, 'interval', _('采样间隔（秒）'),
			_('默认 60 秒；内存紧张设备可调至 120 秒'));
		o.datatype = 'range(10,3600)';
		o.default = '60';
		o.value('30', _('30 秒'));
		o.value('60', _('60 秒（推荐）'));
		o.value('120', _('120 秒'));
		o.value('300', _('300 秒'));
		o.depends('enabled', '1');

		o = s.option(form.Flag, 'checks', _('导航卡片探活'),
			_('开启后由本插件对云端下发的服务端口执行 TCP 连通性探活'));
		o.depends('enabled', '1');

		o = s.option(form.Value, 'source', _('实例标识'),
			_('云端多源分桶标识；主路由保持 router'));
		o.default = 'router';
		o.rmempty = false;
		o.depends('enabled', '1');

		/* ---------- 2. 路由器本机 ---------- */
		s = m.section(form.NamedSection, 'self', 'self', _('路由器本机'));
		s.addremove = false;

		o = s.option(form.Value, 'name', _('显示名称'),
			_('在导航监控卡片中展示的名称'));
		o.default = '主路由';

		o = s.option(form.Value, 'traffic_iface', _('WAN 流量网口'),
			_('用于统计外网上下行速率，可在 SSH 执行 ip link 查看'));
		o.default = 'eth0';
		o.value('eth0', 'eth0');
		o.value('pppoe-wan', 'pppoe-wan');
		o.value('wan', 'wan');
		o.value('br-lan', 'br-lan');

		o = s.option(form.Flag, 'fwx', _('FanchmWrt 状态增强'),
			_('通过本地 ubus fwx 读取连接数、固件/OAF 版本与联网状态'));

		/* ---------- 3. OpenClash ---------- */
		s = m.section(form.NamedSection, 'openclash', 'openclash', _('OpenClash'));
		s.addremove = false;

		o = s.option(form.Flag, 'enabled', _('启用 OpenClash 监控'),
			_('采集核心版本、代理连接数、流量及运行日志'));

		o = s.option(form.Value, 'host', _('API 主机'));
		o.default = '127.0.0.1';
		o.depends('enabled', '1');

		o = s.option(form.Value, 'api_port', _('外部控制端口'));
		o.datatype = 'port';
		o.default = '9090';
		o.depends('enabled', '1');

		o = sensitiveOption(s, 'api_secret', _('API Secret'),
			_('OpenClash「外部控制」secret；未设置可留空'));
		o.depends('enabled', '1');

		/* ---------- 4. 飞牛 NAS ---------- */
		s = m.section(form.NamedSection, 'nas', 'nas', _('飞牛 NAS'));
		s.addremove = false;

		o = s.option(form.Flag, 'enabled', _('启用 NAS 回采'),
			_('通过只读 SSH 回采飞牛 NAS 指标，无需在 NAS 上安装插件'));

		o = s.option(form.Value, 'host', _('SSH 主机与端口'),
			_('格式 主机:端口，如 192.168.100.10:22'));
		o.depends('enabled', '1');

		o = s.option(form.Value, 'user', _('SSH 用户'),
			_('建议为只读监控账号（如 monitor）'));
		o.depends('enabled', '1');

		o = s.option(form.Value, 'key_file', _('私钥文件路径'));
		o.default = '/etc/nav/nas_ed25519';
		o.depends('enabled', '1');

		o = s.option(form.Flag, 'logs', _('采集 NAS 系统日志'),
			_('独立开关：开启后通过现有 SSH 通道读取最近 150 行 journalctl / syslog 并脱敏上报，用于云端 AI 联合诊断（需只读账号具备读取权限）'));
		o.default = '0';
		o.rmempty = false;
		o.depends('enabled', '1');

		o = s.option(form.DummyValue, '_keygen_hint', _('SSH 密钥指引'));
		o.depends('enabled', '1');
		o.cfgvalue = function() {
			return _('请在路由器 SSH 执行 /etc/init.d/nav keygen 生成密钥对，并将输出的公钥添加到飞牛 NAS 的 authorized_keys');
		};

		/* ---------- 5. 告警阈值 ---------- */
		s = m.section(form.NamedSection, 'thresholds', 'thresholds', _('告警阈值'));
		s.addremove = false;

		o = s.option(form.Value, 'cpu', _('CPU 阈值（%）'));
		o.datatype = 'range(1,100)';
		o.default = '85';

		o = s.option(form.Value, 'mem', _('内存阈值（%）'));
		o.datatype = 'range(1,100)';
		o.default = '90';

		o = s.option(form.Value, 'disk', _('磁盘阈值（%）'));
		o.datatype = 'range(1,100)';
		o.default = '90';

		o = s.option(form.Value, 'temp', _('温度阈值（°C）'));
		o.datatype = 'range(1,150)';
		o.default = '65';

		o = s.option(form.Value, 'conn', _('连接数阈值'));
		o.datatype = 'uinteger';
		o.default = '30000';

		/* ---------- 6. 本地状态页 ---------- */
		s = m.section(form.NamedSection, 'ui', 'ui', _('本地状态页'));
		s.addremove = false;

		o = s.option(form.Value, 'listen', _('监听地址'),
			_('仅限局域网访问，默认 :12900；留空可关闭'));
		o.default = ':12900';

		o = sensitiveOption(s, 'password', _('访问密码'),
			_('修改 :12900 页面配置时所需密码；未设置则该页面只读，留空不修改'));

		return m.render().then(function(mapEl) {
			return E('div', {}, [
				renderStatusCard(svcInfo),
				mapEl
			]);
		});
	},

	/* 保存并应用后重启采集器，使新配置生效 */
	handleSaveApply: function(ev) {
		return this.__base__.handleSaveApply(ev).then(function() {
			return callRestart('nav', 'restart');
		});
	}
});
