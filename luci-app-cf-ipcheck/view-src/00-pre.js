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

var VIEW_BUILD = 'r227';
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

/* 主题明暗：FanchmWrt 等主题完全不响应 prefers-color-scheme，但浏览器/系统的
 * 暗色偏好仍会让本文件末尾的暗色块生效，于是出现「浅页面 + 黑卡片 + 深灰字」。
 * 这里按页面**实际背景亮度**判断，只有页面真的是深色时才让暗色块生效；
 * 页面是浅色但系统偏好暗色时，给 html 加 cfp-force-light，由 CSS 把变量改回浅色。
 * ES5：JsMin 会字符级压缩，别用箭头函数/模板字符串。 */
CFI.theme = (function () {
	function bgLum() {
		var el = document.body;
		var bg = '';
		while (el) {
			bg = '';
			try { bg = getComputedStyle(el).backgroundColor || ''; } catch (e) {}
			if (bg && bg !== 'rgba(0, 0, 0, 0)' && bg !== 'transparent')
				break;
			el = el.parentElement;
		}
		var m = /rgba?\(\s*(\d+)[,\s]+(\d+)[,\s]+(\d+)/.exec(bg);
		if (!m)
			return 1;
		return (0.2126 * (+m[1]) + 0.7152 * (+m[2]) + 0.0722 * (+m[3])) / 255;
	}
	function sync() {
		var dark = false;
		try {
			dark = !!(window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches);
		} catch (e) {}
		var force = dark && bgLum() > 0.5;
		try {
			document.documentElement.classList.toggle('cfp-force-light', force);
		} catch (e2) {}
	}
	return { sync: sync, bgLum: bgLum };
})();
