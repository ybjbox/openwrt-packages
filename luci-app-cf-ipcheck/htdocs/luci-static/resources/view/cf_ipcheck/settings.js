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
 *
 * 页面状态一律以引擎给的 JSON 为准；拿不到 JSON 的三种情况（执行失败 /
 * 输出不是 JSON / 引擎自己报 error+reason）分开呈现，绝不能统一说成
 * 「本轮没有达标 IP」—— 那会把「压根没跑起来」说成「跑了但没结果」。
 */
var CMD = '/usr/bin/cf-ipcheck';

/* ---- 设计令牌与组件样式 ---------------------------------------------------
 * 为什么用 JS 注入而不是新建一个 .css：这份视图是 LuCI 按需加载的，
 * 多一个 CSS 文件就要自己管加载时序（还可能被主题自己的缓存挡在后面），
 * 而注入的 <style> 跟视图同生共死，也不会多出一条安装路径。整段只写一遍。
 *
 * 配色的取舍：全页只有一处强调色 —— Cloudflare 橙 #f6821f，只给三样东西：
 * 「立即测速」主按钮、进行中的状态胶囊、榜单第一名左侧那道竖条。其余一律用
 * 中性低透明度叠加 rgba(128,128,128,…)：这种灰在深浅两种主题上都能读，
 * 不必去猜主题自己的暗色钩子（Argon 是 @media (prefers-color-scheme: dark)
 * 切的，所以状态文字色也照这个开关各给一套）。
 *
 * 不引任何 webfont：路由器上不该有外部字体请求。数字对齐靠 tabular-nums，
 * IP 用系统等宽栈 —— 这两条就能把榜单的量感做出来，不需要额外字体。
 * 字阶 / 间距 / 圆角 / 动效全部走变量，组件里不许再出现裸数值。
 */
var CSS = [
	':root{',
	'  --cf-accent:#f6821f; --cf-accent-soft:rgba(246,130,31,.12); --cf-accent-line:rgba(246,130,31,.45);',
	'  --cf-accent-txt:#b8500b;',
	'  --cf-ok-txt:#2f7d32; --cf-ok-soft:rgba(47,125,50,.12);',
	'  --cf-warn-txt:#9a5b00; --cf-warn-soft:rgba(154,91,0,.12);',
	'  --cf-bad-txt:#c0281f; --cf-bad-soft:rgba(192,40,31,.10);',
	'  --cf-info-txt:#1a5f9c; --cf-info-soft:rgba(26,95,156,.10);',
	'  --cf-soft:rgba(128,128,128,.11); --cf-line:rgba(128,128,128,.17);',
	'  --cf-s1:4px; --cf-s2:8px; --cf-s3:12px; --cf-s4:16px; --cf-s5:24px; --cf-s6:32px;',
	'  --cf-r1:4px; --cf-r2:8px; --cf-r3:14px;',
	'  --cf-xs:12px; --cf-sm:13px; --cf-md:14px; --cf-lg:16px; --cf-xl:20px;',
	'  --cf-sh1:0 1px 2px rgba(0,0,0,.06); --cf-sh2:0 4px 14px rgba(0,0,0,.09);',
	'  --cf-dur-fast:160ms; --cf-dur:320ms; --cf-ease:cubic-bezier(.16,1,.3,1);',
	'}',
	'@media (prefers-color-scheme: dark){',
	'  :root{',
	'    --cf-accent:#fb9d4a; --cf-accent-txt:#ffb877;',
	'    --cf-ok-txt:#69c47f; --cf-warn-txt:#e2a33c;',
	'    --cf-bad-txt:#f07a72; --cf-info-txt:#79b8ee;',
	'    --cf-soft:rgba(255,255,255,.10); --cf-line:rgba(255,255,255,.16);',
	'  }',
	'}',
	/* 卡片头：状态胶囊在左、操作在右，窄屏自动改成上下两行 */
	'.cf-head{display:flex;flex-wrap:wrap;align-items:center;gap:var(--cf-s3) var(--cf-s4);justify-content:space-between}',
	'.cf-head-l{display:flex;align-items:center;gap:var(--cf-s2);flex-wrap:wrap;min-width:0}',
	'.cf-head-r{display:flex;align-items:center;gap:var(--cf-s2);flex-wrap:wrap}',
	'.cf-t{font-size:var(--cf-md);font-weight:600;letter-spacing:.01em}',
	'.cf-sub{font-size:var(--cf-xs);opacity:.72;font-style:normal}',
	/* 状态胶囊：色点 + 文案。进行态的色点会呼吸。 */
	'.cf-pill{display:inline-flex;align-items:center;gap:.45em;padding:.28em .7em;border-radius:999px;',
	'  font-size:var(--cf-xs);line-height:1.4;border:1px solid var(--cf-line);background:var(--cf-soft);white-space:nowrap}',
	'.cf-dot{width:.5em;height:.5em;border-radius:50%;background:currentColor;flex:0 0 auto}',
	'.cf-tone-idle{color:inherit;opacity:.75}',
	'.cf-tone-run{color:var(--cf-accent-txt);background:var(--cf-accent-soft);border-color:var(--cf-accent-line)}',
	'.cf-tone-ok{color:var(--cf-ok-txt);background:var(--cf-ok-soft)}',
	'.cf-tone-warn{color:var(--cf-warn-txt);background:var(--cf-warn-soft)}',
	'.cf-tone-bad{color:var(--cf-bad-txt);background:var(--cf-bad-soft)}',
	'.cf-tone-info{color:var(--cf-info-txt);background:var(--cf-info-soft)}',
	'@media (prefers-reduced-motion: no-preference){',
	'  .cf-tone-run .cf-dot{animation:cf-pulse 1.4s var(--cf-ease) infinite}',
	'  @keyframes cf-pulse{0%,100%{opacity:1;transform:scale(1)}50%{opacity:.35;transform:scale(.7)}}',
	'}',
	/* 按钮：主操作用强调色，次要按钮保持主题原样；图标是同一个几何风格 */
	'.cf-btn-row{display:flex;align-items:center;gap:var(--cf-s2);flex-wrap:wrap}',
	'.cbi-button.cf-main{background:var(--cf-accent);border-color:var(--cf-accent);color:#fff;',
	'  font-weight:600;box-shadow:var(--cf-sh1)}',
	'.cbi-button.cf-main:hover{filter:brightness(1.06)}',
	'.cbi-button[disabled]{opacity:.45;cursor:not-allowed}',
	'.cf-ico{display:inline-block;width:1em;text-align:center;font-style:normal;opacity:.8;margin-right:.35em}',
	'.cbi-button.cf-main .cf-ico{opacity:1}',
	'.cbi-button.cf-busy{position:relative;pointer-events:none;opacity:.7}',
	/* 页内提示条：没有 toast 的那版 LuCI 全靠这一条，所以做成能看见的横幅 */
	'.cf-notice{display:flex;align-items:flex-start;gap:.5em;margin-top:var(--cf-s2);padding:.5em .75em;',
	'  border-radius:var(--cf-r2);font-size:var(--cf-sm);border:1px solid var(--cf-line);background:var(--cf-soft)}',
	'.cf-notice.danger{color:var(--cf-bad-txt);background:var(--cf-bad-soft);border-color:currentColor}',
	'.cf-notice.warning{color:var(--cf-warn-txt);background:var(--cf-warn-soft);border-color:currentColor}',
	'.cf-notice.info{color:var(--cf-info-txt);background:var(--cf-info-soft);border-color:currentColor}',
	/* meta chips：原来八段信息挤在一个 <p> 里，拆成能扫读的一排 */
	'.cf-meta{display:flex;flex-wrap:wrap;gap:var(--cf-s2);margin:var(--cf-s3) 0}',
	'.cf-chip{display:inline-flex;align-items:baseline;gap:.3em;padding:.25em .6em;border-radius:var(--cf-r1);',
	'  font-size:var(--cf-xs);background:var(--cf-soft);border:1px solid var(--cf-line);white-space:nowrap}',
	'.cf-chip-k{opacity:.7}',
	'.cf-chip-v{font-weight:600;font-variant-numeric:tabular-nums}',
	'.cf-chip.warn{color:var(--cf-warn-txt);background:var(--cf-warn-soft)}',
	/* 数字：表格里所有数字列都要能竖着比，等宽数字是必须的 */
	'.cf-tablewrap{overflow-x:auto;max-width:100%;-webkit-overflow-scrolling:touch}',
	'.cf-nums{font-variant-numeric:tabular-nums}',
	'.cf-row-top > .td:first-child,.cf-row-top > td:first-child{box-shadow:inset 3px 0 0 var(--cf-accent)}',
	/* 空态：一句话说清为什么空，再给一个能立刻点下去的按钮 */
	'.cf-empty{display:flex;align-items:flex-start;gap:var(--cf-s3);padding:var(--cf-s5) var(--cf-s4);',
	'  border:1px dashed var(--cf-line);border-radius:var(--cf-r3);background:var(--cf-soft);margin:var(--cf-s3) 0}',
	'.cf-empty-ico{flex:0 0 auto;width:22px;height:22px;border-radius:50%;border:2px solid var(--cf-line);',
	'  border-top-color:var(--cf-accent);margin-top:.15em}',
	'@media (prefers-reduced-motion: no-preference){',
	'  .cf-empty.is-spin .cf-empty-ico{animation:cf-spin 1.1s linear infinite}',
	'  @keyframes cf-spin{to{transform:rotate(360deg)}}',
	'}',
	'.cf-empty-txt{flex:1 1 auto;min-width:0;font-size:var(--cf-sm);line-height:1.65}',
	'.cf-empty-act{flex:0 0 auto}',
	/* 帮助标记 / 折叠头：图标一律 CSS 画，避免 ⓘ ▾ 这些字形在各平台不一样 */
	'.cf-help-mark{display:inline-flex;align-items:center;justify-content:center;width:1.25em;height:1.25em;',
	'  margin-left:.35em;border-radius:50%;font-size:.85em;font-style:italic;font-weight:700;cursor:pointer;',
	'  border:1px solid var(--cf-line);background:var(--cf-soft);opacity:.7;transition:opacity var(--cf-dur-fast)}',
	'.cf-help-mark:hover,.cf-help-mark:focus-visible{opacity:1;outline:none;box-shadow:0 0 0 2px var(--cf-accent-soft)}',
	'.cf-help-body{display:block;margin-top:var(--cf-s2);padding:.5em .7em;border-radius:var(--cf-r2);',
	'  background:var(--cf-soft);border:1px solid var(--cf-line);font-size:var(--cf-xs);line-height:1.7;opacity:.92}',
	'.cf-fold{float:right;display:inline-flex;align-items:center;justify-content:center;',
	'  width:1.6em;height:1.6em;margin-left:.4em;border-radius:var(--cf-r1);opacity:.55}',
	'.cf-fold:hover{opacity:1;background:var(--cf-soft)}',
	'.cf-chev{display:inline-block;width:.36em;height:.36em;border-right:1.6px solid currentColor;',
	'  border-bottom:1.6px solid currentColor;transform:rotate(45deg);transform-origin:60% 60%;',
	'  transition:transform var(--cf-dur-fast) var(--cf-ease)}',
	'.cf-fold-closed .cf-chev{transform:rotate(-45deg)}',
	'.cf-foldbar{display:flex;align-items:center;gap:var(--cf-s2);margin:0 0 var(--cf-s2);font-size:var(--cf-xs)}',
	'.cf-link{cursor:pointer;color:var(--cf-info-txt);border:0;background:none;padding:.2em .35em;',
	'  border-radius:var(--cf-r1);font-size:var(--cf-xs)}',
	'.cf-link:hover{background:var(--cf-soft)}',
	'.cf-pw-toggle{background:transparent;border-color:transparent;color:inherit;opacity:.55;min-width:1.9em;padding:0 .35em}',
	'.cf-foot{font-size:var(--cf-xs);opacity:.75;line-height:1.7;margin-top:var(--cf-s2)}',
	'.cf-src-head{display:flex;align-items:center;gap:var(--cf-s2);flex-wrap:wrap;margin-bottom:var(--cf-s2)}',
	/* 顶部标签栏：一页三段（榜单 / 源与检测 / 配置），点标签换面板而不是往下滚。
	 * 下划线用强调色而不是给整个标签铺底色 —— 铺底会把一行里三个标签都染成
	 * 大色块，反而看不出哪个是当前项；1px 底边 + 3px 高亮条最省地方也最清楚。 */
	'.cf-tabs{display:flex;align-items:stretch;gap:var(--cf-s1);margin:0 0 var(--cf-s3);',
	'  border-bottom:1px solid var(--cf-line);overflow-x:auto;-webkit-overflow-scrolling:touch}',
	'.cf-tab{position:relative;flex:0 0 auto;display:inline-flex;align-items:center;gap:.45em;',
	'  padding:.55em .9em;border:0;background:none;cursor:pointer;color:inherit;opacity:.62;',
	'  font-size:var(--cf-md);font-weight:500;line-height:1.5;white-space:nowrap;',
	'  border-bottom:2px solid transparent;margin-bottom:-1px;',
	'  transition:opacity var(--cf-dur-fast) var(--cf-ease),border-color var(--cf-dur-fast) var(--cf-ease)}',
	'.cf-tab:hover{opacity:.85;background:var(--cf-soft)}',
	'.cf-tab:focus-visible{outline:none;box-shadow:inset 0 0 0 2px var(--cf-accent-soft)}',
	'.cf-tab.is-on{opacity:1;font-weight:600;border-bottom-color:var(--cf-accent)}',
	'.cf-tab-cnt{font-size:var(--cf-xs);font-weight:600;font-variant-numeric:tabular-nums;',
	'  padding:.1em .45em;border-radius:999px;background:var(--cf-soft);border:1px solid var(--cf-line);opacity:.8}',
	'.cf-tab.is-on .cf-tab-cnt{color:var(--cf-accent-txt);background:var(--cf-accent-soft);border-color:var(--cf-accent-line);opacity:1}',
	/* 面板：切换只改 display，绝不重建节点 —— 结果块刷新走的是
	 * nodes.table.parentNode.replaceChild()，节点一旦离开文档就再也换不回去。 */
	'.cf-pane{display:none}',
	'.cf-pane.is-on{display:block}',
	/* 榜单很长时不让它把整页顶下去：超出行数上限就在卡片内部滚。
	 * max-height 用 vh 而不是固定 px —— 小屏笔记本与 1080p 桌面才都合适。 */
	'.cf-box{max-height:min(62vh,560px);overflow:auto}',
	/* 窄屏：标签横排可滑，按钮撑到 44px 好按，卡片头改成上下两行 */
	'@media (max-width:720px){',
	'  .cf-head{flex-direction:column;align-items:stretch}',
	'  .cf-head-r{justify-content:flex-start}',
	'  .cbi-button{min-height:44px;padding:.5em .9em}',
	'  .cf-empty{flex-direction:column;align-items:stretch}',
	'  .cf-meta{gap:6px}',
	'  .cf-tabs{gap:0}',
	'  .cf-tab{padding:.55em .7em;font-size:var(--cf-sm)}',
	'  .cf-box{max-height:none;overflow:visible}',
	'}',
	'@media (prefers-reduced-motion: reduce){',
	'  .cf-chev,.cf-help-mark{transition:none}',
	'  .cf-tone-run .cf-dot,.cf-empty.is-spin .cf-empty-ico{animation:none}',
	'}'
].join('\n');

/* 注入样式：stub 环境里没有真正的 document，直接吃掉异常别把视图带崩 */
function injectStyle() {
	try {
		if (!document || !document.createElement || !document.head)
			return;
		if (document.getElementById('cf-ipcheck-style'))
			return;
		var el = document.createElement('style');
		el.id = 'cf-ipcheck-style';
		el.textContent = CSS;
		document.head.appendChild(el);
	} catch (e) {
		/* 注入失败最多是没样式，功能照走 */
	}
}

var callExec = rpc.declare({
	object: 'file',
	method: 'exec',
	params: [ 'command', 'params' ],
	expect: { stdout: '' }
});

/* 模块级句柄：结果块每次刷新都会整块换掉新节点，定时器不能挂在它身上 */
var nodes = { table: null, srcHost: null, srcBlock: null, status: null, notice: null,
	pill: null, pillText: null, btnRun: null, btnStop: null };
var poll = null;
var inflight = null;
/* 最近一次渲染榜单用的 items：「复制榜单 IP」是事件回调里读的，
 * 那时候手上的 st 早就出了作用域，只能靠这个模块级引用传过去。 */
var lastItems = [];

/* 字段说明的取舍：页面上只留一行短说明，完整解释挂到悬停提示里。
 * 真机量过：17 条长说明一共占 2299px，页面被拉到看不见榜单，而其中大半是一次性
 * 背景知识（为什么不用 ping、令牌为什么要收权限），不该每屏都读一遍。
 * HELP 的键是 uci option 名，applyHelp() 在 Map 渲染完之后按 label[for] 贴上去。 */
var HELP = {};

function help(key, short, full) {
	HELP[key] = full;
	return short;
}

function applyHelp(root) {
	var rows = (root && root.querySelectorAll) ? root.querySelectorAll('.cbi-value') : [];
	Array.prototype.forEach.call(rows, function (row) {
		var lab = row.querySelector('label[for]');
		var key = lab ? lab.htmlFor.split('.').pop() : '';
		var full = HELP[key];
		var desc = row.querySelector('.cbi-value-description');
		if (!full || !desc || desc.querySelector('.cf-help-mark'))
			return;
		/* label 也挂一份 title：鼠标停在字段名上就能看到解释，
		 * 但 ⓘ 只加在说明文字上 —— label 是控件的点击目标，点它会翻开关。 */
		if (lab)
			lab.setAttribute('title', full);
		attachMark(desc, full);
	});
}

/* ⓘ 的两种读法：鼠标悬停看 title，触屏/键盘点一下就地展开完整解释。
 * 展开体插在说明文字后面，再点一次收起 —— 收起时页面仍然只占一行。 */
function attachMark(el, full) {
	var mark = E('span', {
		class: 'cf-help-mark',
		tabindex: '0',
		role: 'button',
		'aria-expanded': 'false',
		title: full,
		'aria-label': _('展开完整说明')
	}, 'i');
	var body = null;

	function toggle(ev) {
		ev.preventDefault();
		ev.stopPropagation();
		if (!body) {
			body = E('div', { class: 'cf-help-body' }, full);
			el.appendChild(body);
		}
		else {
			var open = body.style.display !== 'none';
			body.style.display = open ? 'none' : '';
		}
		mark.setAttribute('aria-expanded', body.style.display === 'none' ? 'false' : 'true');
	}

	mark.addEventListener('click', toggle);
	mark.addEventListener('keydown', function (ev) {
		if (ev.key === 'Enter' || ev.key === ' ' || ev.key === 'Spacebar')
			toggle(ev);
	});
	el.setAttribute('title', full);
	el.style.cursor = 'help';
	el.appendChild(mark);
	return el;
}

function execCfIpcheck(args) {
	/* 注意：expect:{stdout:''} 已经把 stdout 拆出来了，
	 * 这里 resolve 到的就是那段字符串本身，不是 {stdout:...} 对象。
	 * 真机上验过一次：写成 res.stdout 会永远拿到 undefined，
	 * 页面于是无论测没测过都显示「尚未运行过」。
	 *
	 * 反过来也一样要紧：调用**失败**（ACL 没放开、可执行文件不在、rpcd 超时）
	 * 时不能返回空串，否则跟「跑了但没结果」长得一模一样。所以失败给 null。
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
	if (text === null || text === undefined)
		return { state: 'unreachable', items: [] };
	if (!text)
		return { state: 'never_run', items: [] };
	try {
		var o = JSON.parse(text);
		if (!Array.isArray(o.items))
			o.items = [];
		// 出口被透明代理接管时，逐 IP 的数字没有意义（引擎每轮用保留地址自检）
		o.intercepted = (o.intercepted === 1 || o.intercepted === '1') ? 1 : 0;
		return o;
	} catch (e) {
		return { state: 'parse_error', items: [], raw: String(text) };
	}
}

/* 引擎 abort_round 写进 reason 的取值都在这里给出一句人话 + 下一步怎么办 */
function reasonText(reason) {
	switch (reason) {
		case 'empty_pool':
			return _('候选池是空的：社区源一条都没拉到，官方网段又关着。' +
				'先点下面「检测源可用性」看是不是哪些源改了路径，或临时打开「Cloudflare 官方网段」。');
		case 'missing_curl':
			return _('这台机器上没有 curl：所有探测都是 curl --resolve 发起的，请安装 curl 与 ca-bundle。');
		case 'sink_not_writable':
			return _('探测身份写不了丢弃响应体的目标，本轮已在联网之前中止。' +
				'这会让每一条探测都以 curl rc=23 失败，看起来像“所有 IP 都不通”，其实是本地写不了。' +
				'引擎每轮开始都会把运行目录（默认 /tmp/cf-ipcheck）chmod 成 711、把 .null 放成 666，' +
				'所以正常情况下不该出现：反复出现就查运行目录所在分区的剩余空间，' +
				'或者「探测身份」是否被改成了一个不存在的用户。');
		case 'interrupted':
			return _('上一轮没跑完就断了（进程被杀、断电或重启），运行锁已被回收，这一条是自动判出来的。' +
				'下面显示的是上一次成功完成的榜单；直接点「立即测速」即可重来。');
		case 'missing_bin':
			return _('找不到 %s：包没装好，或者 rpcd 还拿着旧的 ACL 缓存（/etc/init.d/rpcd restart 后重试）。').format(CMD);
		default:
			return _('引擎报告本轮失败') + (reason ? '（reason=%s）'.format(reason) : '');
	}
}

/* 顶部状态栏与表格内提示共用的状态文案 */
function stateLabel(st) {
	switch (st.state) {
		case 'running':
			return _('正在测速');
		case 'never_run':
			return _('从未运行');
		case 'error':
			return _('出错') + '：' + (st.reason || '?');
		case 'unreachable':
			return _('无法连接后端');
		case 'parse_error':
			return _('输出无法解析');
		default:
			return _('空闲');
	}
}

/* 各版本 LuCI 的提示接口不一致，而且这台机器上的 26.249 两个都没有（真机验过：
 * ui.js 里搜不到任何 toast 函数）。所以除了特性探测，还必须有一条页内兜底：
 * 否则「复制榜单 IP」「已请求停止」这些反馈点了完全看不见。 */
var noticeTimer = null;

function notify(title, message, type) {
	if (typeof ui.addToast === 'function')
		return ui.addToast(title, message, type || 'info');
	if (typeof ui.toast === 'function')
		return ui.toast(type || 'info', title, message);
	if (!nodes.notice)
		return;
	nodes.notice.className = 'cf-notice small' + (type === 'error' ? ' danger' : (type === 'warning' ? ' warning' : ''));
	nodes.notice.textContent = message ? '%s — %s'.format(title, message) : String(title);
	nodes.notice.style.display = 'block';
	if (noticeTimer)
		clearTimeout(noticeTimer);
	noticeTimer = setTimeout(function () {
		nodes.notice.style.display = 'none';
	}, 8000);
}

/* 复制：navigator.clipboard 在非安全上下文或被策略挡掉时会 reject，
 * 所以留一条 execCommand 的退路；两条都不成就把文本亮出来让人自己抄。 */
function fallbackCopy(text) {
	var ta = E('textarea', { style: 'position:fixed;left:-9999px;top:0' });
	ta.value = text;
	document.body.appendChild(ta);
	ta.select();
	var ok = false;
	try {
		ok = document.execCommand('copy');
	} catch (e) {
		ok = false;
	}
	document.body.removeChild(ta);
	return ok;
}

function copyText(text) {
	return new Promise(function (resolve) {
		var settled = false;
		function done(v) {
			if (!settled) {
				settled = true;
				resolve(v);
			}
		}
		/* 没有真实用户激活时，writeText 可能既不 resolve 也不 reject（真机上就是这样
		 * 把整个调用挂住的）。给它 1.5 秒，到点就退到 execCommand，别让用户对着
		 * 一个没反应的按钮等。 */
		var timer = setTimeout(function () { done(fallbackCopy(text)); }, 1500);
		if (navigator.clipboard && navigator.clipboard.writeText) {
			navigator.clipboard.writeText(text).then(
				function () { clearTimeout(timer); done(true); },
				function () { clearTimeout(timer); done(fallbackCopy(text)); });
			return;
		}
		clearTimeout(timer);
		done(fallbackCopy(text));
	});
}

/* 单行输入框把自身值挂到 title 上：社区源 URL 那类长串在框里会被截断，
 * 没有 title 就没法确认自己填的是哪一条。密码框排除在外（不能把令牌
 * 复制到一个悬停就显示的属性里）。 */
function attachValueTips(root) {
	if (!root || !root.querySelectorAll)
		return;

	function sync(inp) {
		if (!inp || inp.type !== 'text')
			return;
		if (inp.value)
			inp.setAttribute('title', inp.value);
		else
			inp.removeAttribute('title');
	}

	Array.prototype.forEach.call(root.querySelectorAll('input[type="text"], input:not([type])'), sync);

	/* 委托一条：DynamicList 每加一行就新建一个 input，渲染时挂好的监听覆盖不到它们。 */
	root.addEventListener('input', function (ev) {
		sync(ev.target);
	}, true);
}

/* 表格内那一句：只回答「这张表为什么是空的」。
 * 失败原因的细节在上面那条 alert 里，两处不要重复同一段长文。 */
function emptyRowText(st) {
	switch (st.state) {
		case 'running':
			return _('正在测速，请稍候…（逐源进度可看 /tmp/cf-ipcheck/cf-ipcheck.log）');
		case 'never_run':
			return _('尚未运行过，点上方「立即测速」开始第一轮。');
		case 'unreachable':
			return _('无法执行 %s').format(CMD);
		case 'parse_error':
			return _('引擎输出不是合法 JSON');
		case 'error':
			return _('本轮中止（reason=%s）').format(st.reason || '?');
		default:
			return _('本轮没有达标 IP（可放宽 TTFB / 总耗时阈值，或检查探测域名是否真在 Cloudflare 后面）');
	}
}

/* 结果块顶部的提示条：只有「压根没跑出结果」与「结果不可信」才占一条 alert */
function noticeFor(st) {
	if (st.state === 'error')
		return E('div', { class: 'alert danger' }, [
			E('strong', {}, _('本轮中止：')), reasonText(st.reason)
		]);
	if (st.state === 'unreachable')
		return E('div', { class: 'alert danger' }, [
			E('strong', {}, _('后端不可用：')),
			_('拿不到任何输出。常见原因：包没装上、可执行位丢了（打包成 100644 的文件装进去就是 -rw-r--r--），' +
			  '或 rpcd 的 ACL 还没重载（%s）。').format('/etc/init.d/rpcd restart')
		]);
	if (st.state === 'parse_error')
		return E('div', { class: 'alert warning' }, [
			E('strong', {}, _('输出异常：')),
			_('%s 有输出，但不是合法 JSON。通常是引擎被改坏了或磁盘/内存不够中途截断。原文前 200 字：').format(CMD),
			E('pre', { class: 'mono' }, String(st.raw || '').slice(0, 200))
		]);
	if (st.intercepted == 1)
		return renderInterceptNotice();
	return '';
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
		E('p', {}, _('本机默认的处置是把探测降到 %s 身份发起（探测发起身份这一项）—— 透明代理的 mangle 链通常按 ' +
			'%s 豁免这个组，改完下一轮生效。真的绕不开时，就把结果上传到 Gist（见「Gist 上传」一节），' +
			'或把 %s 拷到没被接管的机器上跑一轮。')
			.format('nobody', 'meta skgid 65534 return', 'cf-ipcheck')),
		E('p', {}, _('接管期间引擎会自动跳过「落地机房」和「下载 MB/s」两列：那两个数取的是代理自己的表现，' +
			'测了也是一整列相同的假数据。'))
	]);
}

function fmtMs(v) {
	if (v == null || isNaN(v))
		return '—';
	return Number(v).toFixed(1) + ' ms';
}

/* 吞吐列：没测/测失败时引擎给 null 或 "-"，显示成 —（不是 0.00，
 * 0.00 会被读成「这个 IP 很慢」，而实情是压根没连上） */
function fmtMBps(v) {
	if (v == null || v === '' || v === '-' || isNaN(v))
		return '—';
	return Number(v).toFixed(2);
}

function pad2(n) {
	return (n < 10 ? '0' : '') + n;
}

/* 引擎给的是 UTC 的 ISO 串（2026-09-27T11:03:53Z）。原样印出来有两个毛病：跟墙上钟
 * 差一个时区（本机 UTC+8），而且没人能从时间戳看出这榜是五分钟前还是三天前的。
 * 所以转本地时分秒，再补一句相对时间。 */
function fmtTime(iso) {
	var d = iso ? new Date(iso) : null;
	if (!d || isNaN(d.getTime()))
		return iso || '—';
	var now = new Date();
	var mins = Math.round((now.getTime() - d.getTime()) / 60000);
	var rel;
	if (mins < 1)
		rel = _('刚刚');
	else if (mins < 60)
		rel = _('%s 分钟前').format(String(mins));
	else if (mins < 2880)
		rel = _('%s 小时前').format(String(Math.round(mins / 60)));
	else
		rel = _('%s 天前').format(String(Math.round(mins / 1440)));
	return pad2(d.getHours()) + ':' + pad2(d.getMinutes()) + ':' + pad2(d.getSeconds()) +
		'（' + rel + '）';
}

/* 结果比设定的周期还老时明说 —— 否则一张过时的榜很容易被当成"现在的线路状况"。 */
function staleText(st) {
	var iv = Number(st.interval);
	var d = st.finished ? new Date(st.finished) : null;
	if (st.state !== 'done' || !d || isNaN(d.getTime()) || !(iv > 0))
		return '';
	return (new Date().getTime() - d.getTime()) > iv * 3600000
		? _(' · 已超过设定的 %s 小时周期').format(String(iv)) : '';
}

/* 这一轮到底按什么配置跑的。真机上出现过"表单改成 64 没保存、跑的还是 256"，
 * 页面只报候选数看不出来；把引擎实际用的值摆出来，对不上就是一眼能看见的事。 */
function cfgText(st) {
	if (st.budget == null && st.port == null)
		return '';
	return _(' · 本轮配置：上限 %s · 端口 %s').format(
		st.budget != null ? String(st.budget) : '—',
		st.port != null ? String(st.port) : '—');
}

/* 定时实测的下一轮预期。enabled / interval 是引擎读当前配置合并进 status 的，
 * 所以刚保存下去的改动这里立刻能看到。 */
function scheduleText(st) {
	if (String(st.enabled) !== '1')
		return _(' · 定时实测：关闭');
	var iv = Number(st.interval);
	if (!(iv > 0))
		return _(' · 定时实测：开启');
	var out = _(' · 定时实测：每 %s 小时').format(String(iv));
	var d = st.finished ? new Date(st.finished) : null;
	if (d && !isNaN(d.getTime())) {
		var nx = new Date(d.getTime() + iv * 3600000);
		out += _('，下一轮约 %s:%s').format(pad2(nx.getHours()), pad2(nx.getMinutes()));
	}
	return out;
}

/* 榜单里的域名种类：多于一个才值得单独一列 */
function domainKinds(items) {
	var seen = {}, n = 0;
	for (var i = 0; i < items.length; i++) {
		var d = items[i].domain;
		if (d && !(d in seen)) { seen[d] = 1; n++; }
	}
	return n;
}

/* 失败分类：引擎按 IP 统计（不是按 ip×域名），none 是达标数、不在这里报 */
function countsText(counts) {
	if (!counts || typeof counts !== 'object')
		return '';
	var parts = [];
	for (var k in counts) {
		if (!Object.prototype.hasOwnProperty.call(counts, k) || k === 'none')
			continue;
		parts.push('%s %s'.format(k, String(counts[k])));
	}
	return parts.length ? ' · ' + _('失败分类') + '：' + parts.join(' · ') : '';
}

/* 胶囊文字 / 副行 / 按钮启停，三处都由这一个函数刷。
 * 以前只改 <em> 那一行文字，胶囊和按钮没人管，于是「停止本轮」在空闲时照样能点、
 * 点了也没任何反馈（引擎那边其实什么都没停）。按钮能不能点，必须由状态来决定。 */
function syncStatus(st) {
	var label = stateLabel(st) +
		(st.intercepted == 1 ? ' · ' + _('出口被接管，数字不可信') : '');
	if (nodes.pill) {
		nodes.pill.className = 'cf-pill cf-tone-' + stateTone(st);
		nodes.pillText.textContent = label;
	}
	if (nodes.status)
		nodes.status.textContent = String(scheduleText(st)).replace(/^\s*·\s*/, '');
	if (nodes.btnStop)
		nodes.btnStop.disabled = st.state !== 'running';
	if (nodes.btnRun)
		nodes.btnRun.disabled = st.state === 'running';
}

/* LuCI 的密码框带一个灰底实心的「∗」按钮（真机量过 32×40，rgb(136,152,170) 底 +
 * 白字），在一整片浅色表单里像个误触发的控件。功能留着（点它是显示/隐藏令牌），
 * 只把它压回普通文字按钮的分量。 */
function quietPasswordToggles(root) {
	if (!root || !root.querySelectorAll)
		return;
	var btns = root.querySelectorAll('input[type="password"] ~ button, input[type="password"] + * button');
	Array.prototype.forEach.call(btns, function (b) {
		/* 样式收进 .cf-pw-toggle，不再逐条写 inline：inline 会盖过主题自己的
		 * 按钮样式，深色主题下那条 inherit 不一定是对的。 */
		b.className = String(b.className) + ' cf-pw-toggle';
		b.setAttribute('title', _('显示 / 隐藏令牌'));
	});
}

/* 这一版 LuCI 的 form.js 里根本没有 collapsible（真机 grep 过，0 命中），
 * 所以节折叠只能在视图里自己做：给每个 section 的 h3 加一个折叠头，
 * 点标题就收起/展开它后面那块 .cbi-section-node。
 * 折叠状态按节名记在 localStorage：不记的话每次进页都要重新点开他常改的那几节。 */
var FOLD_KEY = 'cf-ipcheck.fold.';
/* 每一节的开合函数存一份，给顶部那条「全部展开 / 全部收起」用 */
var folders = [];

function makeSectionsCollapsible(root, defaults) {
	if (!root || !root.querySelectorAll)
		return;
	folders = [];
	Array.prototype.forEach.call(root.querySelectorAll('.cbi-section > h3'), function (h3) {
		if (h3.querySelector('.cf-fold'))
			return;
		var body = h3.nextElementSibling;
		if (!body || String(body.className).indexOf('cbi-section-node') < 0)
			return;
		var name = (h3.firstChild ? h3.firstChild.textContent : h3.textContent).trim();
		var stored = null;
		try {
			stored = window.localStorage.getItem(FOLD_KEY + name);
		} catch (e) {
			stored = null;
		}
		var open = stored != null ? stored === '1' : !(defaults && defaults[name]);
		var mark = E('span', {
			class: 'cf-fold',
			tabindex: '0',
			role: 'button',
		class: 'cf-fold',
		tabindex: '0',
		role: 'button',
		title: _('展开 / 收起这一节')
	}, E('i', { class: 'cf-chev' }));

	function set(v) {
		open = v;
		body.style.display = open ? '' : 'none';
		/* 箭头交给 CSS 画（.cf-chev + .cf-fold-closed 转 45°），不用 ▾ / ▸
		 * 这两个字符：不同字体下它们的基线和高低全不一样，看着像没对齐。 */
		h3.className = String(h3.className).replace(/ ?cf-fold-closed/g, '') +
			(open ? '' : ' cf-fold-closed');
		h3.setAttribute('aria-expanded', open ? 'true' : 'false');
		try {
			window.localStorage.setItem(FOLD_KEY + name, open ? '1' : '0');
		} catch (e) {}
	}

	folders.push(set);
	h3.style.cursor = 'pointer';
		h3.addEventListener('click', function () { set(!open); });
		mark.addEventListener('keydown', function (ev) {
			if (ev.key === 'Enter' || ev.key === ' ' || ev.key === 'Spacebar') {
				ev.preventDefault();
				set(!open);
			}
		});
		h3.appendChild(mark);
		set(open);
	});
}

/* ---- 顶部标签页 ---------------------------------------------------------
 * 为什么做标签而不是继续往下堆卡片：这个页面天然是三件事 —— 看结果（榜单）、
 * 查候选池为什么空（源检测）、改参数（配置）。串成一列时，想改个 TTFB 阈值
 * 得先滚过整张榜单和那张源体检表；标签把三者变成同一层的平行入口。
 *
 * 选择会存 localStorage：改完配置再回来通常还想看结果，不该每次都被弹回第一页。
 * 存的是标签 id（稳定），不是下标 —— 以后插一个标签，别人的旧记录也不会串位。
 */
var TAB_KEY = 'cf-ipcheck.tab';
/* tabDefs 里的 pane 由 render 阶段回填；activate 时只切 display。
 * tabs 存标签按钮节点，用来翻 aria-selected 与 .is-on 两处状态。 */
var tabDefs = [];
var tabs = [];

function savedTab() {
	var v = null;
	try {
		v = window.localStorage.getItem(TAB_KEY);
	} catch (e) {
		v = null;
	}
	for (var i = 0; i < tabDefs.length; i++) {
		if (tabDefs[i].id === v)
			return v;
	}
	return tabDefs.length ? tabDefs[0].id : '';
}

/* 切换标签。只碰 class / aria / display 三样，不插不删节点：
 * 结果块每 5 秒会被 replaceChild 换一份新的，若这里把面板整个拆了重建，
 * nodes.table 就会指向一个已经不在文档里的孤儿，之后 refreshResult()
 * 拿着它 replaceChild 会因为 parentNode 为空而静默失败，页面再也不更新。 */
function activateTab(id) {
	var hit = null;
	for (var i = 0; i < tabDefs.length; i++) {
		var on = tabDefs[i].id === id;
		if (on)
			hit = tabDefs[i];
		var btn = tabs[i];
		if (btn) {
			btn.className = 'cf-tab' + (on ? ' is-on' : '');
			btn.setAttribute('aria-selected', on ? 'true' : 'false');
			btn.setAttribute('tabindex', on ? '0' : '-1');
		}
		if (tabDefs[i].pane)
			tabDefs[i].pane.className = 'cf-pane' + (on ? ' is-on' : '');
	}
	if (!hit)
		return;
	try {
		window.localStorage.setItem(TAB_KEY, hit.id);
	} catch (e) {}
	/* 结果页的表格在 display:none 下经历过刷新的话，宽度是在量不到的情况下
	 * 定的（max-content 拿不到容器宽），切回来补一次重画最稳。
	 * 只在切到结果页且表格已存在时补，别的页不动，免得把 status 请求打多。 */
	if (hit.id === 'result' && nodes.table)
		refreshResult();
}

/* 建标签栏。count 是标签右侧那枚小计数（没有就不画），
 * 用现成数据算，不额外请求；它的意义只是「这个标签里有东西可以看」。 */
function renderTabs(defs) {
	tabDefs = defs;
	tabs = [];
	var bar = E('div', { class: 'cf-tabs', role: 'tablist' });
	defs.forEach(function (d) {
		var kids = [ E('span', {}, d.label) ];
		if (d.count != null && d.count !== '')
			kids.push(E('span', { class: 'cf-tab-cnt cf-nums' }, String(d.count)));
		var btn = E('button', {
			class: 'cf-tab',
			type: 'button',
			role: 'tab',
			'aria-selected': 'false',
			tabindex: '-1'
		}, kids);
		btn.onclick = function () { activateTab(d.id); return false; };
		/* 左右方向键在标签间走：不引键盘库，两条分支就够（tablist 的标准交互） */
		btn.addEventListener('keydown', function (ev) {
			var i = tabs.indexOf(btn);
			if (ev.key === 'ArrowRight' || ev.key === 'ArrowLeft') {
				ev.preventDefault();
				var n = (i + (ev.key === 'ArrowRight' ? 1 : tabs.length - 1)) % tabs.length;
				activateTab(defs[n].id);
				if (tabs[n] && tabs[n].focus)
					tabs[n].focus();
			}
		});
		tabs.push(btn);
		bar.appendChild(btn);
	});
	return bar;
}

/* 每个标签外面包一层 .cf-pane，切换时只改这一层的 class。
 * 包装节点在 render 阶段就全部建好并留在文档里（哪怕 display:none），
 * 所以内部节点的 parentNode 永远成立。 */
function paneOf(id, node) {
	var pane = E('div', { class: 'cf-pane' }, node);
	for (var i = 0; i < tabDefs.length; i++) {
		if (tabDefs[i].id === id)
			tabDefs[i].pane = pane;
	}
	return pane;
}

/* 状态 → 配色，只在这一处映射。页面上不再出现第二处 if (state==…) 判颜色：
 * 否则以后加一种状态，胶囊、按钮、提示条三处都要各改一遍，必漏一处。 */
function stateTone(st) {
	switch (st.state) {
		case 'running':
			return 'run';
		case 'never_run':
			return 'idle';
		case 'error':
		case 'unreachable':
		case 'parse_error':
			return 'bad';
		default:
			return st.intercepted == 1 ? 'warn' : 'ok';
	}
}

/* meta 行：原来八段信息挤在一个 <p> 里，扫读全靠眼睛找中间那个「·」。
 * 拆成一排 chip 之后间隔交给 CSS 的 gap —— 注意每一段的文字原样保留
 * （含「上限 256」「timeout 9」这类连续片段），viewtest 是按子串匹配这段的。 */
function metaChips(st) {
	var out = [];
	function chip(text, tone) {
		var s = String(text).replace(/^\s*·\s*/, '');
		var i = s.indexOf(' ');
		var cls = 'cf-chip' + (tone ? ' ' + tone : '');
		if (i < 0) {
			out.push(E('span', { class: cls }, s));
			return;
		}
		out.push(E('span', { class: cls }, [
			E('span', { class: 'cf-chip-k' }, s.slice(0, i + 1)),
			E('span', { class: 'cf-chip-v cf-nums' }, s.slice(i + 1))
		]));
	}
	chip(_('候选 %s 个').format(st.pool != null ? st.pool : '—'));
	chip(_('达标 %s 个').format(st.qualified != null ? st.qualified : (st.items || []).length));
	chip(_('榜单 %s 条').format(st.usable != null ? st.usable : (st.items || []).length));
	if (countsText(st.counts))
		chip(countsText(st.counts), 'warn');
	chip(_('探测域名 %s').format(st.domains || '—'));
	chip(_('完成于 %s').format(fmtTime(st.finished || st.started)));
	if (staleText(st))
		chip(staleText(st), 'warn');
	if (cfgText(st))
		chip(cfgText(st));
	return out;
}

/* 空态：原来空表只有一行字，既没说清「为什么空」也没给下一步。
 * 这里补一句原因 + 一个能直接点下去的按钮。按钮是现建的，不复用操作条上那几个
 * 节点 —— DOM 节点挂到第二个位置会从第一个位置上被摘走。 */
function renderEmpty(st) {
	var act = null;
	if (st.state === 'running') {
		act = null;
	}
	else if (st.state === 'error' && st.reason === 'empty_pool') {
		act = E('button', { class: 'cbi-button', type: 'button' }, _('检测源可用性'));
		act.onclick = function () { doCheck(this); return false; };
	}
	else if (st.state === 'unreachable' || st.state === 'parse_error') {
		act = E('button', { class: 'cbi-button', type: 'button' }, _('重新拉取状态'));
		act.onclick = function () { doRefresh(this); return false; };
	}
	else {
		act = E('button', { class: 'cbi-button cbi-button-positive cf-main', type: 'button' }, _('立即测速'));
		act.onclick = function () { doRun(this); return false; };
	}

	return E('div', { class: 'cf-empty' + (st.state === 'running' ? ' is-spin' : '') }, [
		E('i', { class: 'cf-empty-ico' }),
		E('div', { class: 'cf-empty-txt' }, emptyRowText(st)),
		act ? E('div', { class: 'cf-empty-act' }, act) : ''
	]);
}

/* 结果表：单独抽出来，按钮触发后只重画这一块，不整页闪 */
function renderTable(st) {
	var withDom = domainKinds(st.items) > 1;
	var head = [
		'#', _('IP 地址'), _('状态码'),
		_('TCP 握手'), _('TLS 握手'), _('TTFB'), _('总计'), _('落地机房'), _('下载 MB/s')
	];
	/* 数字列一律右对齐 + 等宽：左对齐时 56.9 / 807.4 / 12.67 的小数点各排在一条边上，
	 * 比较一列要逐行看；右对齐后同列位数齐，大小一眼可比。机房列也右对齐。
	 * 表格按内容收缩（不铺满卡片宽）：卡片宽 1125 而内容只要约 700，剩下的 400 多
	 * 像素只要铺满就会变成每列左侧一条说不清的空白（真机量过：SIN 与 11.22 之间
	 * 160px，改成定宽百分比后仍剩 77px）。宁可右边留白，也不要列间断层。 */
	var colCls = [
		'right', 'left mono', 'right', 'right mono', 'right mono',
		'right mono', 'right mono', 'right', 'right mono'
	];
	if (withDom) {
		head.push(_('胜出域名'));
		colCls.push('left');
	}
	lastItems = st.items || [];

	/* 空表不再画一张只有表头的空壳 —— 那看着像「加载失败」。
	 * 改成一个说清原因、并给下一步的空态块。 */
	var body;
	if (!st.items.length) {
		body = [renderEmpty(st)];
	}
	else {
		var tbody = E('tbody', {});
		for (var i = 0; i < st.items.length; i++) {
			var it = st.items[i];
			var vals = [
				String(i + 1),
				it.ip || '?',
				it.code != null ? String(it.code) : '—',
				fmtMs(it.connect_ms),
				fmtMs(it.tls_ms),
				fmtMs(it.ttfb_ms),
				fmtMs(it.total_ms),
				it.colo || '—',
				fmtMBps(it.speed_mbytes)
			];
			if (withDom)
				vals.push(it.domain || '—');
			/* 第一名左侧那道竖条：榜单按总耗时升序排，第一行就是「现在该用哪个」，
			 * 值得单独标出来，不必让人每次都从数字里比。 */
			tbody.appendChild(E('tr', { class: i === 0 ? 'cf-row-top' : '' }, vals.map(function (v, c) {
				return E('td', {
					class: colCls[c] || 'left',
					/* 与表头同一左右内边距：都是右对齐，边距不一致时表头数字和
					 * 单元格数字会错开一条缝。 */
					style: 'white-space:nowrap;padding-left:.7em;padding-right:.7em'
				}, v);
			})));
		}
		/* 外层 .cf-tablewrap 只负责窄屏横向滚动；表格本身按内容收缩。
		 * 收缩必须写 max-content 而不是 auto：真机 A/B 量过，display:table 的
		 * width:auto 在 Chrome 里是「铺满可用宽」，铺满就会把多出来的宽度摊到
		 * 每一列上，列与列之间裂出 173px 的断层（r15 就是踩的这个）。
		 * 再套一层 .cf-box 管高度：榜单满 10 行时表头 + 脚注还能留在屏幕上，
		 * 不必为了看第 10 行把脚注推出去 —— 超出的行在卡片内部滚。 */
		body = [E('div', { class: 'cf-box' }, [
			E('div', { class: 'cf-tablewrap' }, [
				E('div', { class: 'table cbi-section-table cf-nums', style: 'width:max-content;max-width:100%' }, [
					E('thead', {}, [
						E('tr', { class: 'tr table-titles' },
							head.map(function (t, c) {
								return E('th', {
									class: 'th ' + (colCls[c] || 'left'),
									style: 'white-space:nowrap;padding-left:.7em;padding-right:.7em'
								}, t);
							}))
					]),
					tbody
				])
			])
		])];
	}

	var foot = attachMark(E('p', { class: 'cf-foot' }, [
		E('abbr', { title: _('Time To First Byte，首字节时间') }, _('TTFB')),
				_(' 列 = 首字节耗时，排序看「总计」，两道门槛都过才算达标；' +
				  '「下载 MB/s」只对榜单前若干个 IP 实测、只作参考不参与排序。')
			]), _('TCP 握手 = 与对端完成三次连接；TLS 握手 = 从连上到 TLS 协商完成（含证书校验）；' +
				  'TTFB = 发出请求到收到第一个字节的耗时，代表「对端处理 + 回程」，是这几个指标里最贴近「打开页面快不快」的一个；' +
				  '总计 = 整个请求收尾。Cloudflare 是 anycast，同一个 IP 从不同线路会打到不同机房，' +
				  '所以 ICMP ping 再低也不说明代理能用 —— 只看这几段、且只看带真实 SNI 的 HTTPS 能否走通。' +
				  '排序按总计升序、同值再看 TTFB；total_limit 与 ttfb_limit 两道门槛都过才算达标。' +
				  '多域名时每个 IP 只留表现最好那次（连带那个域名），所以达标数不会超过候选池。' +
				  '「下载 MB/s」是榜单出来后只对前若干个 IP 串行拉一次大文件测出来的吞吐（十进制 MB/s，1 MB = 1000 KB）—— ' +
				  '延迟接近的 IP 吞吐可以差几十倍，但单次测量抖动大，所以只拿来参考、不参与排序；没测或测失败显示 —。'));

	/* 拼的时候用 concat 摊平：LuCI 的 E() 只遍历一层子节点，塞个数组进去
	 * 会直接拿数组去 appendChild 抛异常。 */
	return E('div', { class: 'cbi-section', id: 'cf-ipcheck-result' }, [
		E('div', { class: 'cbi-section-node' }, [
			noticeFor(st),
			E('div', { class: 'cf-meta' }, metaChips(st))
		].concat(body).concat([foot]))
	]);
}

function refreshResult() {
	/* 同一时刻只留一个 status 请求在飞，后来的直接共享它的结果：
	 * 两次刷新叠在一起会把 nodes.table 指向一个已经被替换掉的孤儿节点，
	 * 之后 replaceChild 找不到 parentNode，页面上那张表就再也不更新了。 */
	if (inflight)
		return inflight;

	inflight = execCfIpcheck(['status']).then(function (out) {
		inflight = null;
		var st = parseStatus(out);
		var next = renderTable(st);
		var old = nodes.table;
		if (old && old.parentNode)
			old.parentNode.replaceChild(next, old);
		nodes.table = next;
		/* 状态行也得跟着改：以前只换表格，点了「立即测速」之后表格里写着
		 * 「正在测速」，上面那行还停在「空闲」，两处互相打脸。 */
		syncStatus(st);
		return { node: next, state: st.state, intercepted: st.intercepted };
	}, function () {
		inflight = null;
		return { node: nodes.table, state: 'unknown' };
	});

	return inflight;
}

function stopPoll() {
	if (poll) {
		clearInterval(poll);
		poll = null;
	}
}

function startPoll() {
	/* 测速进行中每 5 秒拉一次；结束后停掉，避免白烧 CPU 和请求。
	 * 停止条件看 status 里的 state，不看 DOM 文案 —— 早先拿
	 * 「表格里有没有『正在测速』」判断，而那段文字在 <td> 里、
	 * 查的又是 <p>，第一次刷新就会把定时器关掉。
	 * 句柄放模块级：结果块每次刷新都被 replaceChild 换掉，挂在节点上
	 * 会把计时器丢在旧节点里，之后再也关不掉（离开页面就泄漏）。 */
	stopPoll();
	poll = setInterval(function () {
		refreshResult().then(function (r) {
			if (r.state !== 'running')
				stopPoll();
		}, function () {
			stopPoll();
		});
	}, 5000);
}

/* 按钮动作单独成函数：操作条上的按钮和空态里的按钮要调同一段逻辑，
 * 而 DOM 节点塞进第二个位置就会从第一个位置上被摘走，所以不能复用同一个节点，
 * 只能复用同一段代码。 */
function busy(btn, on) {
	if (!btn)
		return;
	btn.disabled = !!on;
	btn.className = String(btn.className).replace(/ ?cf-busy/g, '') + (on ? ' cf-busy' : '');
}

function doRun(btn) {
	busy(btn, true);
	return execCfIpcheck(['run-now']).then(function (out) {
		busy(btn, false);
		if (out === null) {
			notify(_('无法启动'), _('执行 %s 失败：包没装好，或 rpcd 的 ACL 没放开 exec。').format(CMD), 'error');
			return;
		}
		notify(_('已启动一轮测速'), out);
		/* 无条件开始轮询，不看这一次读到的 state：run-now 只是把后台进程
		 * 甩出去，那一轮要几毫秒后才把 "running" 写进 status.json，
		 * 这里抢跑一次就可能读到上一轮的 "done"，于是永远没人启动轮询。 */
		refreshResult().then(function () { startPoll(); });
	}, function () {
		busy(btn, false);
	});
}

function doStop(btn) {
	busy(btn, true);
	return execCfIpcheck(['stop']).then(function (out) {
		busy(btn, false);
		if (out === null)
			notify(_('无法请求停止'), _('执行 %s 失败。').format(CMD), 'error');
		else
			notify(_('已请求停止'), _('当前这轮收尾后不再继续探测'), 'warning');
		refreshResult();
	}, function () {
		busy(btn, false);
		notify(_('无法请求停止'), _('执行 %s 失败。').format(CMD), 'error');
	});
}

function doRefresh(btn) {
	busy(btn, true);
	return refreshResult().then(function () { busy(btn, false); },
		function () { busy(btn, false); });
}

function doCopy() {
	var ips = [];
	for (var i = 0; i < lastItems.length; i++) {
		if (lastItems[i].ip)
			ips.push(String(lastItems[i].ip));
	}
	if (!ips.length) {
		notify(_('没有可复制的 IP'), _('当前榜单是空的；先跑一轮，或放宽 TTFB / 总耗时门槛。'), 'warning');
		return;
	}
	copyText(ips.join('\n')).then(function (ok) {
		if (ok)
			notify(_('已复制 %s 个 IP').format(String(ips.length)), _('一行一个，可直接粘进客户端。'), 'info');
		else
			notify(_('复制失败'), _('浏览器不让写剪贴板；榜单里的 IP 请手工复制。'), 'warning');
	});
}

/* 源可用性检测：逐条 URL 看 HTTP 状态、提取到多少 IPv4、其中多少落在 CF 官方段内。
 * 后两列是收录标准 —— 段内占比掉下来就说明源换内容了（比如开始吐中转 IP）。 */
function renderSources(rows, why) {
	var head = [_('源 URL'), _('HTTP'), _('提取到 IPv4'), _('落在 CF 段内'), _('段内占比')];
	var tbody = E('tbody', {});

	if (!rows.length) {
		tbody.appendChild(E('tr', {}, [
			E('td', { colspan: String(head.length), class: 'center' },
				why || _('没有配置社区源'))
		]));
	}

	for (var i = 0; i < rows.length; i++) {
		var r = rows[i];
		var pct = (r.ips > 0 && r.cf_in >= 0) ? Math.round(100 * r.cf_in / r.ips) : null;
		var cls = 'left';
		if (r.url && String(r.url).charAt(0) === '#')
			cls = 'left danger';
		else if (r.http === '000' || !r.http || r.rc !== 0)
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

	/* 源 URL 很长，窄屏必然溢出：外层给一个横向滚动容器，别把整页撑宽。 */
	return E('div', { class: 'cf-tablewrap' }, [
		E('div', { class: 'table cbi-section-table cf-nums' }, [
			E('thead', {}, [E('tr', { class: 'tr table-titles' },
				head.map(function (t) { return E('th', { class: 'th' }, t); }))]),
			tbody
		])
	]);
}

function doCheck(btn) {
	/* 检测结果画在「源与检测」标签里：从榜单空态点过来时得先把人送过去，
	 * 否则点了按钮什么也看不见（结果落在另一个隐藏面板里）。 */
	activateTab('sources');
	var host = nodes.srcHost;
	if (btn)
		busy(btn, true);
	/* 加载态用节点而不是 innerHTML：原来那段是把文案拼进 HTML 字符串，
	 * 源 URL 里万一有 & 之类的字符就得自己转义；而且它跟空态、错误态长得
	 * 完全不一样，三种状态在页面上像是三个组件拼出来的。 */
	if (host) {
		host.innerHTML = '';
		host.appendChild(E('div', { class: 'cf-empty is-spin' }, [
			E('i', { class: 'cf-empty-ico' }),
			E('div', { class: 'cf-empty-txt' },
				_('正在逐个拉取源并比对 Cloudflare 官方网段（最多十几秒）…'))
		]));
	}

	function done(out) {
		var kids = [];
		var rows = null;

		/* 三种「没有表格」的情况要分开说：执行失败、输出不是 JSON、源列表是空的。
		 * 一律写成「没有配置社区源」会把前两种掩盖成用户的配置问题。 */
		if (out === null) {
			kids.push(E('p', { class: 'small danger' },
				_('检测没跑成：无法执行 %s（包没装好、可执行位丢失，或 rpcd 的 file.exec 超时）。').format(CMD)));
		} else {
			try {
				rows = JSON.parse(out);
			} catch (e) {
				rows = null;
			}
			if (rows === null) {
				kids.push(E('p', { class: 'small danger' }, _('检测返回的内容不是合法 JSON。原文前 200 字：')));
				kids.push(E('pre', { class: 'mono' }, String(out).slice(0, 200)));
			} else if (!Array.isArray(rows) || !rows.length) {
				kids.push(E('p', { class: 'small danger' },
					_('一条源都没检出：「社区优选源 URL」这一项是空的。')));
			} else {
				kids.push(renderSources(rows));
			}
		}

		if (host) {
			host.innerHTML = '';
			for (var i = 0; i < kids.length; i++)
				host.appendChild(kids[i]);
		}
		if (btn) {
			busy(btn, false);
			btn.textContent = _('重新检测');
		}
	}

	return execCfIpcheck(['check-sources']).then(done, function () {
		done(null);
	});
}

return view.extend({
	title: _('Cloudflare 优选 IP 实测'),

	load: function () {
		return execCfIpcheck(['status']);
	},

	render: function (raw) {
		var st = parseStatus(raw);

		/* ---- 按钮：先建节点、直接挂事件，再拼进操作条 ----
		 * 不走 getElementById + 重试那一套：这个视图的节点是 render() 返回之后
		 * 才进 DOM 的，靠 id 找就得赌时机（原先是 40 次 × 50ms）。拿着节点引用
		 * 绑事件跟 DOM 挂载时机彻底解耦，结果块重画也影响不到它们。
		 *
		 * 图标是同一套几何字符（▶ ■ ↻ ⧉），走 .cf-ico 统一宽高与透明度 ——
		 * 不引图标库，LuCI 自己也没有图标体系，加了反而跟主题不搭。 */
		var btnRun = E('button', {
			id: 'cf-ipcheck-run',
			class: 'cbi-button cbi-button-positive cf-main',
			type: 'button'
		}, [E('i', { class: 'cf-ico' }, '▶'), _('立即测速')]);

		var btnStop = E('button', {
			id: 'cf-ipcheck-stop',
			class: 'cbi-button',
			type: 'button'
		}, [E('i', { class: 'cf-ico' }, '■'), _('停止本轮')]);

		var btnRefresh = E('button', {
			id: 'cf-ipcheck-refresh',
			class: 'cbi-button',
			type: 'button'
		}, [E('i', { class: 'cf-ico' }, '↻'), _('刷新')]);

		var btnCopy = E('button', {
			id: 'cf-ipcheck-copy',
			class: 'cbi-button',
			type: 'button'
		}, [E('i', { class: 'cf-ico' }, '⧉'), _('复制榜单 IP')]);

		var btnCheck = E('button', {
			id: 'cf-ipcheck-check-sources',
			class: 'cbi-button',
			type: 'button'
		}, [E('i', { class: 'cf-ico' }, '⌕'), _('检测源可用性')]);

		nodes.btnRun = btnRun;
		nodes.btnStop = btnStop;

		btnRun.onclick = function () { doRun(this); return false; };
		btnStop.onclick = function () { doStop(this); return false; };
		btnRefresh.onclick = function () { doRefresh(this); return false; };
		btnCopy.onclick = function () { doCopy(); return false; };
		btnCheck.onclick = function () { doCheck(this); return false; };

		/* ---- 顶部状态卡 ----
		 * 原来是「状态 / 操作 / 提示」三行 cbi-value，拿表单行伪装成工具栏：
		 * 三个标签占了左边一整列宽，纵向还平白多出两行；「提示」那行为了不跳版
		 * 只能常驻一个空占位。改成一行：左边状态胶囊 + 副信息，右边按钮组，
		 * 提示条按需出现（没有 toast 的那版 LuCI 全靠它）。 */
		nodes.pillText = E('span', {}, stateLabel(st) +
			(st.intercepted == 1 ? ' · ' + _('出口被接管，数字不可信') : ''));
		nodes.pill = E('span', { class: 'cf-pill cf-tone-' + stateTone(st) }, [
			E('i', { class: 'cf-dot' }), nodes.pillText
		]);
		nodes.status = E('em', { class: 'cf-sub' },
			String(scheduleText(st)).replace(/^\s*·\s*/, ''));
		nodes.notice = E('div', {
			class: 'cf-notice small',
			style: 'display:none'
		});

		var bar = E('div', { class: 'cbi-section', id: 'cf-ipcheck-actions' }, [
			E('div', { class: 'cbi-section-node' }, [
				E('div', { class: 'cf-head' }, [
					E('div', { class: 'cf-head-l' }, [
						E('span', { class: 'cf-t' }, _('Cloudflare 优选 IP 实测')),
						nodes.pill,
						nodes.status
					]),
					E('div', { class: 'cf-head-r cf-btn-row' }, [
						btnRun, btnStop, btnRefresh, btnCopy
					])
				]),
				nodes.notice
			])
		]);

		syncStatus(st);

		/* ---- 配置表单 ----
		 * Map 标题在标签版里不该再写「配置」：标签栏上就是这两个字，
		 * 一屏内同名标题出现两次。这里换成一句说明这一页是干什么的。 */
		var m = new form.Map('cf_ipcheck',
			_('实测参数'),
			_('改动保存后下一轮生效；判定口径见「榜单」页脚注。'));

		var s = m.section(form.TypedSection, 'global', _('基本设置'));
		s.anonymous = true;

		var o;

		o = s.option(form.Flag, 'enabled', _('启用定时实测'),
			help('enabled',
				_('关闭时后台只空转；打开后一分钟内开始下一轮。'),
				_('关闭时后台进程只空转不测速；打开后一分钟内开始下一轮，无需重启服务。')));
		o.rmempty = false;

		o = s.option(form.Value, 'interval_hours', _('定时周期（小时）'),
			help('interval_hours',
				_('两轮之间的间隔。'),
				_('一轮完整测速的间隔。候选池越大、超时越长，单轮耗时越久。')));
		o.datatype = 'and(uinteger,min(1),max(168))';
		o.default = '6';

		o = s.option(form.Value, 'probe_domains', _('探测域名'),
			help('probe_domains',
				_('逗号分隔；填你真正要用的那个域名，且它必须架在 Cloudflare 后面。'),
				_('逗号分隔。请填你**真正要用的那个域名**（EDT / Worker 节点域名最合适）：' +
				  '干扰是按 SNI 走的，同一个 IP 上 www.cloudflare.com 能通并不等于你的节点能通，' +
				  '反过来用节点域名测出来的榜单才是可直接应用的结果。' +
				  '域名必须架在 Cloudflare 后面（橙色云、CF 给它签了证书）；403 / 404 都算达标，' +
				  '判定只看「带真实 SNI 的 HTTPS 能否走通并拿到 HTTP 响应」，不看内容。' +
				  '探测时用 --resolve 把该域名钉到候选 IP 上，所以 SNI 与 Host 都是这个域名。' +
				  '填多个域名时，每个 IP 只保留它表现最好的那一次，榜单仍是一 IP 一行。' +
				  '条目一律按逗号切并整条校验主机名：写成 https://xx 或中间带空格的会被引擎丢掉并记日志，' +
				  '不会被切成假域名去探。')));
		o.default = 'www.cloudflare.com';

		o = s.option(form.Value, 'probe_port', _('探测端口'),
			help('probe_port',
				_('一般保持 443。'),
				_('一般保持 443；只有你要验非标准 HTTPS 端口时才改。')));
		o.datatype = 'port';
		o.default = '443';

		var src = m.section(form.TypedSection, 'global', _('候选池来源'));
		src.anonymous = true;

		o = src.option(form.Flag, 'use_official_ranges', _('Cloudflare 官方网段'),
			help('use_official_ranges',
				_('把官方网段抽稀后加进候选池。默认关。'),
				_('实时拉 api.cloudflare.com/client/v4/ips，把每个前缀按 /24 展开取样。默认关：' +
				  '官方段展开是近六千个候选，抽稀后仍会占掉大半名额，把别人已经优选好的地址挤出去。' +
				  '想扩大覆盖面（刚换线路、怀疑候选池老化）再打开，它会用剩余名额等间隔抽稀。' +
				  '比 /12 更宽的段会被丢掉（一条 0.0.0.0/0 就能把路由器撑爆）。')));
		o.rmempty = false;

		o = src.option(form.Flag, 'reuse_last', _('带上上一轮入围 IP'),
			help('reuse_last',
				_('把上次结果并回候选池，榜单才连续。'),
				_('把上次结果并回候选池，保证榜单连续、不会因为候选抖动而全换。')));
		o.rmempty = false;

		o = src.option(form.DynamicList, 'community_sources', _('社区优选源 URL'),
			help('community_sources',
				_('每行一个 HTTPS 文本地址，从中提取 IP；默认十三条已逐个核过段内占比。'),
				_('每行一个 HTTPS 文本地址，IP / CIDR / IP:端口 都能提取（CIDR 按 /24 取样），' +
				  '注释、CSV 表头、IPv6 自动忽略；某个源拉不到只记日志，不影响本轮。' +
				  '默认十三条是 2026-09-27 逐个核过的：提取到的 IPv4 绝大多落在 Cloudflare 官方段内 —— ' +
				  '像 bestcf.pages.dev/random-region/mix.txt 那种 306 条全在段外的清单其实是别人的中转/VPS，' +
				  '不是 CF anycast，就没有收进来。这些列表只代表"别人线路上测出来不错"，' +
				  '在你这儿算不算好仍由本页实测说了算。名额分配：上一轮入围全保 → 社区源占剩下一半且逐源均分 → ' +
				  '官方网段抽稀填满其余。想看本轮实际会用哪些 IP，命令行跑 cf-ipcheck pool。' +
				  '只接受 https 的单条地址：http 清单在链路上就能被人改包，带空格或非 URL 的行会被忽略并记日志。')));

		var thr = m.section(form.TypedSection, 'global', _('测速与判定'));
		thr.anonymous = true;

		o = thr.option(form.Value, 'candidate_budget', _('单轮候选上限'),
			help('candidate_budget',
				_('去重后一轮最多探测多少个 IP。'),
				_('去重后最多探测多少个 IP。太大了会拉长单轮时间，也更容易触发运营商限速。')));
		o.datatype = 'and(uinteger,min(8),max(4096))';
		o.default = '256';

		o = thr.option(form.Value, 'concurrency', _('并发探测数'),
			help('concurrency',
				_('同时探测的 IP 数；软路由上 8~16 比较稳。'),
				_('同时探测的 IP 数。软路由上 8~16 比较稳。')));
		o.datatype = 'and(uinteger,min(1),max(64))';
		o.default = '8';

		o = thr.option(form.Value, 'probe_timeout', _('单 IP 超时（秒）'),
			help('probe_timeout',
				_('同时作为 TCP 连接超时与整请求超时。'),
				_('同时作为 TCP 连接超时与整请求超时。')));
		o.datatype = 'and(uinteger,min(1),max(30))';
		o.default = '5';

		o = thr.option(form.Value, 'ttfb_limit', _('TTFB 上限（毫秒）'),
			help('ttfb_limit',
				_('首字节超过这个值判为不达标。'),
				_('TTFB = Time To First Byte，请求发出后收到第一个字节的耗时，代表「对端处理 + 回程」。' +
				  '它比 ping 的 RTT 更贴近实际体感：ping 只测到 ICMP 应答，而 anycast 下那个点未必是你会话真正落地的机房，' +
				  '也可能干脆不响应 ICMP；TTFB 则是这个 IP 上完整 TCP+TLS 走通之后，应用层第一次给出数据的时间。' +
				  '首字节慢通常意味着被调度到了远机房或链路拥塞，超过这个值直接判为不达标。')));
		o.datatype = 'and(uinteger,min(100),max(600000))';
		o.default = '3000';

		o = thr.option(form.Value, 'total_limit', _('总耗时上限（毫秒）'),
			help('total_limit',
				_('第二道门槛，与 TTFB 同时满足才算可用。'),
				_('第二个门槛，与 TTFB 同时满足才算可用。')));
		o.datatype = 'and(uinteger,min(200),max(600000))';
		o.default = '5000';

		o = thr.option(form.Value, 'keep_count', _('榜单保留条数'),
			help('keep_count',
				_('排序按总耗时升序，同值再看 TTFB。'),
				_('排序按总耗时升序，同值再看 TTFB。')));
		o.datatype = 'and(uinteger,min(1),max(100))';
		o.default = '10';

		o = thr.option(form.Flag, 'speed_probe', _('入围后再测下载速度'),
			help('speed_probe',
				_('只对榜单前若干个 IP 串行拉大文件，测出 MB/s（十进制）。'),
				_('延迟榜出来后，只对榜单前 speed_count 个 IP 串行拉一次大文件测 MB/s（十进制，1 MB = 1000 KB，与测速网站同口径）。' +
				  '值得测：真机里三个 total 接近的 IP 吞吐差到 50 倍（10.6 / 3.57 / 0.19 MB/s）。' +
				  '代价是流量，默认 10 × 10MB ≈ 每轮 100MB；不测就关掉，那一列显示 —。' +
				  '出口被接管那一轮会自动不测（测的是代理自己的速度）。')));
		o.rmempty = false;

		o = thr.option(form.Value, 'speed_count', _('测吞吐的 IP 个数'),
			help('speed_count',
				_('只对榜单前 N 个测；N × 单次字节数就是每轮流量。'),
				_('只对榜单前 N 个测。这一项决定流量，N × speed_bytes 就是每轮的下载量。')));
		o.datatype = 'and(uinteger,min(0),max(100))';
		o.default = '10';

		o = thr.option(form.Value, 'speed_bytes', _('单次下载字节数'),
			help('speed_bytes',
				_('默认 10MB；样本太小会被 TCP 慢启动主导，数字抖。'),
				_('默认 10MB（10485760 字节）。别调太小：1MB 样本主要落在 TCP 慢启动上，' +
				  '真机同一个 IP 两次测出 0.56 与 0.20 MB/s，差 2.8 倍，排名会乱跳。')));
		o.datatype = 'and(uinteger,min(131072),max(104857600))';
		o.default = '10485760';

		o = thr.option(form.Value, 'speed_timeout', _('单次吞吐测试超时（秒）'),
			help('speed_timeout',
				_('吞吐测试单独用的超时，比单 IP 超时大得多。'),
				_('要单独给一个大一点超时：跨境拉 10MB 常在几秒到几十秒，' +
				  '复用「单 IP 超时」会把所有测量都截断掉。超时/失败的那一格显示 —，不会记成 0。')));
		o.datatype = 'and(uinteger,min(5),max(120))';
		o.default = '25';

		o = thr.option(form.Value, 'speed_domain', _('吞吐测试地址'),
			help('speed_domain',
				_('拉大文件的域名，同样用 --resolve 钉到候选 IP 上。'),
				_('默认用 Cloudflare 自己的 speed.cloudflare.com/__down?bytes=N。' +
				  '它同样是用 --resolve 钉到候选 IP 上访问的，所以测的是那个 IP 的吞吐；' +
				  '换成你自己域名下的大文件也行（前提是该文件真在 CF 后面）。')));
		o.default = 'speed.cloudflare.com';

		o = thr.option(form.Flag, 'colo_probe', _('识别落地机房'),
			help('colo_probe',
				_('对入围 IP 取 cdn-cgi/trace 的 colo= 字段。'),
				_('只对入围 IP 请求 cdn-cgi/trace 取 colo= 字段，多一次请求，用来确认 IP 实际打到哪个机房。')));
		o.rmempty = false;

		o = thr.option(form.Value, 'colo_domain', _('机房查询兜底域名'),
			help('colo_domain',
				_('探测域名取不到 colo 时，换这个域名再取一次。'),
				_('/cdn-cgi/trace 要先用探测域名试；取不到（EDT / Worker 类节点域名常把这个路径拦成 403）' +
				  '就改用这里的域名 + 同一个候选 IP 再取一次，否则「落地机房」整列和注释里的 {colo} 都会变成 n/a。' +
				  '填一个确定架在 Cloudflare 后面、且不会拦截该路径的域名即可，一般不用改。')));
		o.default = 'www.cloudflare.com';

		o = thr.option(form.Flag, 'canary_check', _('每轮先自检出口是否被代理接管'),
			help('canary_check',
				_('用不可路由的保留地址走一遍同样的探测路径，返回了响应就说明被接管。'),
				_('拿 RFC 5737 保留地址（203.0.113.77 / 198.51.100.77）按同一条探测路径试一次：' +
				  '保留地址全球不可路由，正常只会超时；一旦它返回任何 HTTP 状态码，就说明本机 443 被 ' +
				  'OpenClash 这类透明代理接管、由代理自己重新拨号，此时 --resolve 钉的候选 IP 没参与选路，' +
				  '榜单只是「本机 → 代理 → CF」的耗时。开启后本轮结果会被打标：页面红条提示，' +
				  '并且跳过「落地机房」与「下载 MB/s」两列。每轮最多额外占用 2 次探测超时（默认 4 秒）。')));
		o.rmempty = false;

		o = thr.option(form.Value, 'probe_user', _('探测发起身份'),
			help('probe_user',
				_('默认 nobody —— 透明代理的 mangle 链正好豁免它，root 直发会被接管。'),
				_('默认 nobody —— OpenClash 的 mangle 链第一条规则就是 meta skgid 65534 return，' +
				  '用 nobody 跑探测正好不被打 mark，量到的才是候选 IP 自己的握手；' +
				  'root 直发会被代理接管（实测同一个 IP：nobody 下 TCP 193ms，root 下 0.7ms，后者是假的）。' +
				  '家里没有透明代理、或就想按 root 测，把这里填成 none —— 注意不能留空或删掉这一项：' +
				  'uci 分不清「显式留空」和「没有这一项」，空值会被当成没设置、从而又落回 nobody。' +
				  '需要 su 支持，改动后下一轮生效。')));
		o.default = 'nobody';

		o = thr.option(form.Value, 'annotate', _('ip.txt 注释模板'),
			help('annotate',
				_('{colo} / {total} / {speed} 三个占位符，决定每个 IP 后面那串字。'),
				_('决定 %s（以及上传到 Gist 的那份）里每个 IP 后面那串字。整行格式固定是「IP:端口 注释」，' +
				  '注释会被去掉首尾空格；只填一个空格就等于「只要 IP:端口、不要注释」' +
				  '（这一项整个清空会被当成没设置，从而回到下面的默认模板 —— uci 分不清「显式留空」和「没这项」）。' +
				  '三个占位符：' +
				  '{colo} = 这个 IP 的落地机房代码，取自 cdn-cgi/trace 返回的 colo=（如 LAX / NRT / FRA），' +
				  '用来看同一批入围里哪些其实落到了不同机房；先用探测域名取，取不到再用「机房查询兜底域名」试一次，' +
				  '两处都取不到、或者本轮出口被接管才是 n/a。' +
				  '{total} = 这个 IP 的总耗时毫秒，就是排序用的那个数（保留一位小数）；' +
				  '把它记在文件里，是为了过几天换线路再测时能对比出差异 —— 此刻达标不代表下次还达标。' +
				  '{speed} = 实测下载速度 MB/s（十进制；只对榜单前若干个 IP 测，没测到或关掉速度实测时是 -）。' +
				  '其余字符（含 & 和中文）原样输出，同一占位符可以写多次。' +
				  '默认模板渲染出来是：104.16.202.102:443 cf-ipcheck | LAX | 887.4ms')
				.format('/etc/cf-ipcheck/best-ip.txt')));
		o.default = 'cf-ipcheck | {colo} | {total}ms';

		var gs = m.section(form.TypedSection, 'global', _('Gist 上传'));
		gs.anonymous = true;

		o = gs.option(form.Flag, 'upload_gist', _('每轮结束后上传 ip.txt'),
			help('upload_gist',
				_('失败只记日志，不影响本地结果。'),
				_('失败只记日志，不影响本地结果。')));
		o.rmempty = false;

		o = gs.option(form.Value, 'gist_id', _('Gist ID'),
			help('gist_id',
				_('Gist 网址里那串十六进制 ID；需要先手工建一个 Gist。'),
				_('Gist 网址里那串十六进制 ID。需要先手工建一个 Gist。')));

		o = gs.option(form.Value, 'gist_file', _('Gist 文件名'),
			help('gist_file',
				_('同名文件被更新，名字不一致会在 Gist 里多出一份。'),
				_('例如 cf-ip.txt —— PATCH 更新的是同名文件，名字不一致会在 Gist 里新增一份。')));
		o.default = 'cf-ip.txt';

		o = gs.option(form.Value, 'gist_token', _('GitHub Token'),
			help('gist_token',
				_('只填**只勾选了 gist 权限**的经典令牌；它会随 sysupgrade 备份走并在本页回显。'),
				_('直接写进 UCI（本机默认这条路）。清单内容只是优选 IP，泄露代价低，所以按 Ryan 的要求允许写在配置里；' +
				  '代价是它会随 sysupgrade 备份走、也在本页面回显，因此请只填**只勾选了 gist 权限**的经典令牌，' +
				  '不要用有 repo/workflow 权限的。填了这里就优先用它；留空则退回下面的 token_file。')));
		o.password = true;

		o = gs.option(form.Value, 'token_file', _('Token 文件路径（备选）'),
			help('token_file',
				_('令牌不写进配置时改从这里读；两处都填时以 gist_token 为准。'),
				_('不想把令牌写进配置就留空上面的字段，改从该文件读：' +
				  '在路由器上执行 printf "%s" "你的令牌" > /etc/cf-ipcheck.token 再 chmod 600 该文件即可。' +
				  '两处都填时以上面的 gist_token 为准。')));
		o.default = '/etc/cf-ipcheck.token';

		/* ---- 拼页面：固定头部（状态卡）+ 标签栏 + 三个面板 ---- *
		 * m.render() 给的是 Promise，不是节点：不能直接塞进返回数组里。
		 * 先把 Map 节点 resolve 出来，再拼成纯节点数组返回。
		 *
		 * 状态卡与那排按钮留在标签栏之上、不参与切换：它们管的是「本轮测速」，
		 * 而三个标签都可能要起测（源页发现池空、配置页改完参数想立刻验），
		 * 把它们复制进每个面板既不必要又会撞 id。
		 */
		nodes.table = renderTable(st);

		/* 源可用性检测：不自动跑（十来个源逐个拉太慢），点按钮才检测 */
		nodes.srcHost = E('div', { id: 'cf-ipcheck-sources-host' },
			attachMark(E('p', { class: 'cf-foot' },
				_('逐条实拉，列出 HTTP 状态、提取到的 IPv4 数与落在 CF 官方段内的比例。')),
				_('逐条 URL 实拉一次，列出 HTTP 状态、提取到的 IPv4 数量，以及其中落在 Cloudflare 官方网段内的比例。' +
				  '段内占比掉到 90% 以下通常说明源改内容了（例如开始提供别人自己的中转 IP），' +
				  '拉不到的那条会标黄，引擎本轮会跳过它并记日志。')));

		/* 源检测独占一个标签：它是「榜单为什么空」的答案，而 empty_pool 时
		 * 引擎给的唯一一条下一步就是「去检测源」。
		 * 卡里不再写一遍「源可用性检测」—— 标签栏上已经写了；改成一句
		 * 说清「点了会发生什么」的短句，比重复标题有用。 */
		nodes.srcBlock = E('div', { class: 'cbi-section', id: 'cf-ipcheck-sources' }, [
			E('div', { class: 'cbi-section-node' }, [
				E('div', { class: 'cf-src-head' }, [
					E('span', { class: 'cf-sub' },
						_('逐条实拉社区源，核对它们是否还在吐 Cloudflare 段内的地址。')),
					btnCheck
				]),
				nodes.srcHost
			])
		]);

		/* 表单顶部那条「全部展开 / 全部收起」：四节里有三节默认收着，
		 * 要改「测速与判定」里的阈值就得先找到是哪一节、再点开它。
		 * 开合函数由 makeSectionsCollapsible 收集在 folders 里。 */
		var btnAll = E('button', { class: 'cf-link', type: 'button' }, _('全部展开'));
		var btnNone = E('button', { class: 'cf-link', type: 'button' }, _('全部收起'));
		btnAll.onclick = function () {
			folders.forEach(function (f) { f(true); });
			return false;
		};
		btnNone.onclick = function () {
			folders.forEach(function (f) { f(false); });
			return false;
		};
		var foldbar = E('div', { class: 'cf-foldbar' }, [
			btnAll, E('span', { style: 'opacity:.4' }, '·'), btnNone
		]);

		/* 配置面板：说明行 + 全部展开/收起 + 表单本体。表单节点要等
		 * m.render() 回来才知道，所以先占一个空壳，resolve 之后再塞进去。 */
		var cfgHost = E('div', { class: 'cf-cfg-host' }, foldbar);

		/* 标签定义。计数只挑「有内容才显示」的两处：榜单条数（看结果时最想知道
		 * 的有几条）与配置节数（让人知道下面有东西可改）。源那块是手动触发的，
		 * 没有天然计数，就不硬凑一个。 */
		var usable = (st.usable != null ? st.usable : (st.items || []).length);
		var tabsEl = renderTabs([
			{ id: 'result', label: _('榜单'), count: usable ? usable : '' },
			{ id: 'sources', label: _('源与检测'), count: '' },
			{ id: 'config', label: _('配置'), count: 4 }
		]);

		var page = [
			bar,
			tabsEl,
			paneOf('result', nodes.table),
			paneOf('sources', nodes.srcBlock),
			paneOf('config', cfgHost)
		];

		return m.render().then(function (mapnode) {
			injectStyle();
			applyHelp(mapnode);
			attachValueTips(mapnode);
			quietPasswordToggles(mapnode);
			/* 默认收起这三节：字段最多、又不是每次进来都要改的；基本设置留着展开。
			 * 键是节标题原文（_(x) 对同一条目是恒等，所以跟 DOM 里的文字对得上）。 */
			makeSectionsCollapsible(mapnode, {
				'候选池来源': 1,
				'测速与判定': 1,
				'Gist 上传': 1
			});
			cfgHost.appendChild(mapnode);
			/* 标签栏与面板都进 DOM 之后再点亮：activateTab 要改 .cf-tab 的
			 * class 与 aria，节点还没挂上去时改虽然也生效，但那一下切回结果的
			 * refreshResult() 会因为表格量不到宽度而不准。 */
			activateTab(savedTab());
			if (st.state === 'running')
				startPoll();
			return page;
		});
	},

	teardown: function () {
		/* 离开页面时关掉轮询：定时器句柄是模块级的，不关就会一直背着
		 * 已卸载的 DOM 节点，并且每 5 秒打一次 ubus。 */
		stopPoll();
		return true;
	}
});
