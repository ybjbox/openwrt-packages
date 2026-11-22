'use strict';
'require view';
'require form';
'require uci';
'require rpc';

/* NAV 采集器 LuCI 配置页：直接读写 /etc/config/nav，与插件自带 :12900 配置页互通。
 * 保存并应用后通过 luci.setInitAction 重启采集器（luci-base 默认向 admin 开放）。
 * 敏感字段（push_token / api_secret / ui.password）不以明文回显，留空表示不修改。 */

var callRestart = rpc.declare({
	object: 'luci',
	method: 'setInitAction',
	params: [ 'name', 'action' ],
	expect: { result: false }
});

/* 敏感值字段：显示空占位、密码输入；仅在用户填入新值时写回，留空则不改动原值。 */
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

return view.extend({
	load: function() {
		return uci.load('nav');
	},

	render: function() {
		var m, s, o;

		m = new form.Map('nav', _('NAV 采集器'),
			_('路由器采集器配置：推送到 NAV 云端、监控目标与告警阈值。保存并应用后自动重启采集器；与 :12900 配置页互通。'));

		/* ---------- 推送 ---------- */
		s = m.section(form.NamedSection, 'main', _('云端推送'));
		s.addremove = false;
		s.anonymous = false;

		o = s.option(form.Flag, 'enabled', _('启用采集器'));

		o = s.option(form.Value, 'push_url', _('推送地址'),
			_('NAV 云端摄入接口，正式地址 https://nav.403333.xyz/api/ingest'));
		o.datatype = 'string';
		o.rmempty = false;

		o = sensitiveOption(s, 'push_token', _('推送令牌'),
			_('与云端 COLLECTOR_TOKEN 一致（≥16 位）；留空不修改'));

		o = s.option(form.Value, 'source', _('实例标识'),
			_('云端多源分桶用；路由器侧固定 router'));
		o.rmempty = false;

		o = s.option(form.Value, 'interval', _('采样间隔'), _('秒；内存吃紧可调至 120'));
		o.datatype = 'range(10,3600)';
		o.default = '60';

		o = s.option(form.Flag, 'checks', _('导航卡片探活'),
			_('由本插件对导航卡片执行 TCP 探活'));

		/* ---------- OpenClash ---------- */
		s = m.section(form.NamedSection, 'openclash', _('OpenClash 监控'));
		s.addremove = false;

		o = s.option(form.Flag, 'enabled', _('启用 OpenClash 监控'));

		o = s.option(form.Value, 'host', _('API 主机'));
		o.default = '127.0.0.1';

		o = s.option(form.Value, 'api_port', _('外部控制端口'));
		o.datatype = 'port';
		o.default = '9090';

		o = sensitiveOption(s, 'api_secret', _('API Secret'),
			_('OpenClash「外部控制」secret；留空不修改'));

		/* ---------- NAS 回采 ---------- */
		s = m.section(form.NamedSection, 'nas', _('NAS 回采'));
		s.addremove = false;

		o = s.option(form.Flag, 'enabled', _('启用 NAS 回采'));

		o = s.option(form.Value, 'host', _('SSH 主机'), _('格式 主机:端口，如 192.168.100.10:22'));

		o = s.option(form.Value, 'user', _('SSH 用户'), _('受限只读账号'));

		o = s.option(form.DummyValue, '_keygen_hint', _('回采密钥'));
		o.cfgvalue = function() {
			return _('密钥对请在 SSH 执行 /etc/init.d/nav keygen 生成，公钥加入 NAS 的 authorized_keys');
		};

		/* ---------- 告警阈值 ---------- */
		s = m.section(form.NamedSection, 'thresholds', _('告警阈值'));
		s.addremove = false;

		o = s.option(form.Value, 'cpu', _('CPU %'));       o.datatype = 'range(1,100)';
		o = s.option(form.Value, 'mem', _('内存 %'));      o.datatype = 'range(1,100)';
		o = s.option(form.Value, 'disk', _('磁盘 %'));     o.datatype = 'range(1,100)';
		o = s.option(form.Value, 'temp', _('温度 °C'));    o.datatype = 'range(1,150)';
		o = s.option(form.Value, 'conn', _('连接数'));     o.datatype = 'uinteger';

		/* ---------- 本地配置页 ---------- */
		s = m.section(form.NamedSection, 'ui', _('本地配置页'));
		s.addremove = false;

		o = s.option(form.Value, 'listen', _('监听地址'), _('仅局域网可达，默认 :12900'));

		o = sensitiveOption(s, 'password', _('访问密码'),
			_('修改 :12900 配置页所需密码；留空不修改，未设置则该页只读'));

		return m.render();
	},

	/* 保存并应用后重启采集器，使新配置生效 */
	handleSaveApply: function(ev) {
		return this.__base__.handleSaveApply(ev).then(function() {
			return callRestart('nav', 'restart');
		});
	}
});
