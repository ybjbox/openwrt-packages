'use strict';
'require form';
'require poll';
'require rpc';
'require ui';
'require view';
'require uci';

/* ==========================================================================
 * luci-app-cf-ipcheck 前端（r130 重写）
 * ==========================================================================
 * 三个区：运行 / 诊断 / 设置。所有对外契约（ubus 方法、uci 键、JSON 键、
 * dns_targets 文本格式、六态语义）与 r120 完全一致；变的只是内部结构与呈现。
 *
 * 文件按 manifest.txt 的顺序拼成运行时单个 settings.js。依赖方向：
 * 编号小的不得调用编号大的；面板不直接碰 IPC，只能经 store 的动作层。
 */

var VIEW_BUILD = 'r156';
var CMD = '/usr/bin/cf-ipcheck';

var CFI = {
	build: VIEW_BUILD
};

/* 单一测试句柄：单测在沙箱里加载本文件后只认这一个对象，
 * 不再像旧版那样往源码里插钩子导出几十个私有名字。 */
try {
	if (typeof window !== 'undefined')
		window.__cfi__ = CFI;
} catch (e) {}

/* 翻译别名：整份代码只用 T()，_() 只出现在 form.Map/section/option 的声明处。 */
function T(s) {
	return _(s);
}
CFI.T = T;
