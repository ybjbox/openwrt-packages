'use strict';
'require form';
'require view';

return view.extend({
	render: function() {
		var m, s, o;

		m = new form.Map('dhcp_comment', _('DHCP 中文备注增强'),
			_('在 OpenWrt 系统各组件（DHCP 租约表、Bandix 流量监控、AppFilter 及 OPAssistant 手机 App）中无缝联动显示设备自定义中文备注。'));

		s = m.section(form.TypedSection, 'global', _('基本设置'));
		s.anonymous = true;

		o = s.option(form.Flag, 'enabled', _('启用主服务'),
			_('开启或关闭全局 DHCP 中文备注增强联动服务。'));
		o.default = o.enabled;
		o.rmempty = false;

		o = s.option(form.Flag, 'enable_dhcp_leases', _('继承至 DHCP/概览 租约表'),
			_('在“网络 -> DHCP/DNS”与“状态 -> 概览”的已分配租约表格中，无缝替换呈现中文设备备注。'));
		o.default = o.enabled;
		o.rmempty = false;

		o = s.option(form.Flag, 'enable_bandix', _('继承至 Bandix 流量监控'),
			_('在“状态/服务 -> Bandix 流量监控”的设备列表与卡片中呈现中文设备备注。'));
		o.default = o.enabled;
		o.rmempty = false;

		o = s.option(form.Flag, 'enable_appfilter', _('继承至 AppFilter 应用过滤'),
			_('在“服务 -> 应用过滤”网页端用户列表中呈现中文设备备注。'));
		o.default = o.enabled;
		o.rmempty = false;

		o = s.option(form.Flag, 'enable_opassistant', _('同步至 OPAssistant 手机 App'),
			_('将全屋设备中文备注全自动同步镜像给 OPAssistant 手机端 App。'));
		o.default = o.enabled;
		o.rmempty = false;

		return m.render();
	}
});
