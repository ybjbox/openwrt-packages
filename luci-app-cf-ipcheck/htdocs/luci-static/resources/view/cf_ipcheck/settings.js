'use strict';
'require form';
'require poll';
'require rpc';
'require ui';
'require view';

/*
 * luci-app-cf-ipcheck —— 读数面板（重写版）
 *
 * 设计定位：一块网络设备的仪表读数面。这个页面存在的唯一理由是「把引擎测出来的
 * 数如实、可扫读地摆出来」。所以整份代码围绕三条约束组织：
 *
 *   1) 数字是主角。所有数字列等宽 + tabular-nums + 右对齐，让同列能竖着比。
 *   2) 颜色只报状态。五个语义色（idle/run/ok/warn/bad）都有明确的触发条件，
 *      不参与任何装饰 —— 一旦某种颜色不代表某个条件，它就不该出现。
 *   3) 状态说了算。一切以引擎给的那份 JSON 为准；拿不到 JSON 的三种情形
 *      （执行不了 / 输出不是 JSON / 引擎自己报 error）必须分开说，绝不能把
 *      「压根没跑起来」讲成「跑了但没有结果」—— 那是在骗人。
 *
 * 与后端的接口只有一条：rpcd 的 file.exec 调 /usr/bin/cf-ipcheck。
 * 为什么不让前端直接读状态文件：那要多授一个 file.read，而且各版本 LuCI 返回
 * 字段（data / buf）不一致；让脚本自己把 JSON 打到 stdout 是最稳的一条路。
 */

var CMD = '/usr/bin/cf-ipcheck';

/* 视图版本号。装机后你要能一眼看出浏览器里跑的到底是哪一版 —— uhttpd 只发
 * ETag/Last-Modified，没有 Cache-Control，浏览器完全可能拿缓存那份不重新验证；
 * 「点了没反应」这类问题第一条要排除的就是这个。
 * tests/lint.sh 会核对它和 Makefile 里的 PKG_RELEASE 是否同一个数，防止各说一套。 */
var VIEW_BUILD = 'r70';

/* 翻译别名。LuCI 全局提供 _()，但 `_` 这个单字符在表达式里极难扫读（`T('.note')`
 * 一眼就知道是给人看的文案，`_('.note')` 不是）。整份代码只用 T()，_ 只在
 * form.Map/section/option 的声明处出现（那里是 LuCI 的固定签名，改不了）。 */
function T(s) {
	return _(s);
}

/* ==========================================================================
 * 1. 样式挂载与明暗判定
 * ==========================================================================
 * 样式表是 htdocs/luci-static/resources/view/cf_ipcheck/settings.css，用 <link> 挂，
 * 不在 JS 里拼 CSS 字符串 —— 这是树内做法（luci-app-qosify 的 overview.js、mwan3
 * 都这样）：构建期能压缩、浏览器能单独缓存、视图 JS 少背 16KB。
 *
 * 明暗判定为什么不交给 @media (prefers-color-scheme)：本机跑的是 Argon，它的深色模式
 * 由 uci 的 argon.@global[0].mode 决定（normal=跟随系统，dark/light=强制）。强制模式下
 * 媒体查询跟的是**操作系统**的偏好，和页面真实明暗会打架 —— 表现就是整站暗、我们这块
 * 亮。所以直接量主题真正渲染出来的底色：读 body（拿不到再看 #maincontainer /
 * #maincontent），算相对亮度。实测 Argon 亮色 body 是 rgb(244,245,247)、暗色是
 * rgb(30,30,30)，中间切一刀足够稳。判定结果缓存起来，轮询时复查一次（改系统偏好时
 * Argon 会自己换，不用重开页面）。
 */
var CSS_PATH = 'view/cf_ipcheck/settings.css';
var schemeNow = null;

function linkStyle() {
	try {
		if (!document || !document.createElement || !document.head)
			return;
		var href = (typeof L !== 'undefined' && L && typeof L.resource === 'function') ?
			L.resource(CSS_PATH) : ('/luci-static/resources/' + CSS_PATH);
		for (var n = document.head.firstChild; n; n = n.nextSibling) {
			if (String(n.tagName).toUpperCase() === 'LINK' && n.getAttribute && n.getAttribute('href') === href)
				return;
		}
		document.head.appendChild(el('link', { rel: 'stylesheet', href: href }));
	} catch (e) {
		/* 挂不上最多是没样式，功能照走 */
	}
}

/* 一串 CSS 颜色 -> 0..1 的相对亮度；认不出来或全透明就回 null，让调用方往上找。
 * oklch 的 L 分量本身就是感知亮度（0..1），直接当判据够用，不必换算成 sRGB。 */
function luminanceOf(color) {
	var c = String(color == null ? '' : color).trim();
	var m = /^oklch\(\s*([\d.]+)(%?)/.exec(c);
	if (m)
		return m[2] === '%' ? Number(m[1]) / 100 : Number(m[1]);
	m = /^rgba?\(([^)]+)\)/.exec(c);
	if (m) {
		var p = m[1].match(/[\d.]+/g);
		if (!p || p.length < 3)
			return null;
		if (p.length > 3 && Number(p[3]) === 0)
			return null;
		return linLum(Number(p[0]), Number(p[1]), Number(p[2]));
	}
	m = /^#([0-9a-f]{3,8})$/i.exec(c);
	if (m) {
		var h = m[1];
		if (h.length === 3)
			h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
		return linLum(parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16));
	}
	return null;
}

function linLum(r, g, b) {
	var f = function (k) {
		k = k / 255;
		return k <= 0.03928 ? k / 12.92 : Math.pow((k + 0.055) / 1.055, 2.4);
	};
	return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
}

function bgLuminance() {
	var nodes = [];
	try {
		nodes = [document.body, document.getElementById('maincontainer'),
			document.getElementById('maincontent'), document.documentElement];
	} catch (e) {
		return null;
	}
	for (var i = 0; i < nodes.length; i++) {
		if (!nodes[i] || typeof getComputedStyle !== 'function')
			continue;
		try {
			var v = luminanceOf(getComputedStyle(nodes[i]).backgroundColor);
			if (v != null)
				return v;
		} catch (e) {
			/* 拿不到就试下一个宿主节点 */
		}
	}
	return null;
}

function detectScheme() {
	var v = bgLuminance();
	if (v == null) {
		/* 量不到底色（不是浏览器环境，或主题把背景挂在我们没看到的节点上）：
		 * 退到媒体查询；再判不出来就默认暗色 —— CSS 的 :root 本来就是暗色那套，
		 * 判不出时「不加类」比「加错类」更不容易闪一下错颜色。 */
		try {
			if (typeof matchMedia === 'function' && matchMedia('(prefers-color-scheme: light)').matches)
				return 'light';
		} catch (e) {
			/* 没有 matchMedia 就走下面的默认 */
		}
		return 'dark';
	}
	return v < 0.35 ? 'dark' : 'light';
}

/* 把判定结果落到根节点的类上（CSS 里那套浅色令牌挂在 .cfp.is-light 下）。
 * 比较的对象是**这个节点自己的类名**，不是模块级缓存：buildPage 可能在同一份 JS 里
 * 跑第二次（下面 17 节那条注释写明了），而 `schemeNow` 是模块级的 —— 拿缓存做早退，
 * 第二次进来的新 root（class 只有 "cfp"）就永远等不到 is-light，
 * 表现是「亮色主题下这块用暗色令牌渲染」。r48 实测过这条路径。
 * 仍然只在类名真的不对时才写 className：每拍都碰节点会牵连点击行为。 */
function applyScheme(node) {
	var want = detectScheme();
	var cls = 'cfp' + (want === 'light' ? ' is-light' : '');
	schemeNow = want;
	if (node && node.className != null && node.className !== cls)
		node.className = cls;
	return want;
}

/* 系统偏好一变就复查一次明暗（r48）。为什么不能只靠 pollTick 里那一次：空闲不轮询，
 * 而真机实测「把系统切暗」之后我们这块 20 秒内一次都没跟上（每 2 秒采一次，
 * .cfp 一直是 is-light 而主题底色已经是 rgb(30,30,30)），那个错配态里选中标签只有
 * 1.07:1、字段标题被主题刷成 rgb(204,204,204) 压在我们的白卡上 1.61:1。
 * 换页重新 render 会自动纠正，但长时间停在页面上不能等下一次导航。
 * change 事件到达时主题自己的样式重算未必已经落地，所以立刻判一次、下一帧再补一次。
 * 回一个卸载把手给 teardown 用：监听器挂在 matchMedia 上，不摘就横跨页面实例累积。 */
function watchScheme(node) {
	var mq;
	try {
		if (typeof matchMedia !== 'function')
			return null;
		mq = matchMedia('(prefers-color-scheme: dark)');
	} catch (e) {
		return null;
	}
	if (!mq || typeof mq.addEventListener !== 'function')
		return null;
	function recheck() {
		applyScheme(node);
		try {
			if (typeof requestAnimationFrame === 'function')
				requestAnimationFrame(function () { applyScheme(node); });
		} catch (e) {
			/* 没有 rAF 就只认立刻这一次 */
		}
	}
	mq.addEventListener('change', recheck);
	return function () {
		if (mq.removeEventListener)
			mq.removeEventListener('change', recheck);
	};
}

/* ==========================================================================
 * 2. el() —— 元素工厂
 * ==========================================================================
 * 为什么不用 LuCI 自带的 E()：它只遍历一层子节点，子节点里再放数组就会拿数组去
 * appendChild 直接抛异常。这个页面到处是 map() 出来的行，全靠拍平才不至于到处
 * 写 concat。这里自己递归摊平：el('div', {}, [a, b, [c, d]]) 成立。
 */
function el(tag, props, kids) {
	var n = document.createElement(tag);
	if (props) {
		for (var k in props) {
			if (!Object.prototype.hasOwnProperty.call(props, k))
				continue;
			var v = props[k];
			if (v === null || v === undefined || v === false)
				continue;
			if (k === 'class')
				n.className = String(v);
			else if (k === 'text')
				n.textContent = String(v);
			else if (k === 'style') {
				if (typeof v === 'string')
					n.setAttribute('style', v);
				else
					for (var sk in v)
						if (Object.prototype.hasOwnProperty.call(v, sk))
							n.style[sk] = v[sk];
			}
			else if (k === 'on') {
				for (var ev in v)
					if (Object.prototype.hasOwnProperty.call(v, ev))
						n.addEventListener(ev, v[ev]);
			}
			else if (k === 'data') {
				for (var dk in v)
					if (Object.prototype.hasOwnProperty.call(v, dk))
						n.setAttribute('data-' + dk, String(v[dk]));
			}
			else if (k === 'aria') {
				for (var ak in v)
					if (Object.prototype.hasOwnProperty.call(v, ak))
						n.setAttribute('aria-' + ak, String(v[ak]));
			}
			else if (k === 'value')
				n.value = v;
			else if (k === 'disabled' || k === 'checked' || k === 'hidden')
				n[k] = !!v;
			else
				n.setAttribute(k, String(v));
		}
	}
	append(n, kids);
	return n;
}

/* 递归挂子节点：字符串/数字当文本，数组摊平，null/false 跳过 */
function append(node, kids) {
	if (kids === null || kids === undefined || kids === false)
		return;
	if (Array.isArray(kids)) {
		for (var i = 0; i < kids.length; i++)
			append(node, kids[i]);
		return;
	}
	if (typeof kids === 'string' || typeof kids === 'number')
		node.appendChild(document.createTextNode(String(kids)));
	else if (kids)
		node.appendChild(kids);
}

/* 清空一个节点（重画用） */
function clear(node) {
	if (!node)
		return;
	while (node.firstChild)
		node.removeChild(node.firstChild);
}

/* 图标：内联 SVG，不引图标库也不做字体图标（项目边界是零新依赖）。
 * 必须走 createElementNS —— document.createElement('svg') 造出来的是
 * HTMLUnknownElement，浏览器只画一个空盒子，页面上一片空白、控制台不报错。
 * 24×24 viewBox、只描边不填充，粗细与圆角由 CSS 的 .bi > svg 统一定（见样式表）。
 * aria-hidden：按钮文字已经写了「立即测速」，图形再让读屏器念成「播放」就是重复。 */
var SVG_NS = 'http://www.w3.org/2000/svg';
var ICONS = {
	play: ['M6 4.5l13 7.5-13 7.5z'],
	stop: ['M6 6h12v12H6z'],
	refresh: ['M19 12a8 8 0 1 1-2.34-5.66L19 8', 'M19 3.5V8h-4.5'],
	copy: ['M9 9h12v12H9z', 'M15 4.5A2.5 2.5 0 0 0 12.5 2h-8A2.5 2.5 0 0 0 2 4.5v8A2.5 2.5 0 0 0 4.5 15'],
	probe: ['M18 11a8 8 0 1 1-16 0 8 8 0 1 1 16 0z', 'M20 20l-4.4-4.4']
};

function svgIcon(name) {
	var ds = ICONS[name];
	if (!ds || !document.createElementNS)
		return null;
	var s = document.createElementNS(SVG_NS, 'svg');
	s.setAttribute('viewBox', '0 0 24 24');
	s.setAttribute('aria-hidden', 'true');
	s.setAttribute('focusable', 'false');
	for (var i = 0; i < ds.length; i++) {
		var p = document.createElementNS(SVG_NS, 'path');
		p.setAttribute('d', ds[i]);
		s.appendChild(p);
	}
	return s;
}

/* ==========================================================================
 * 3. 格式化层
 * ==========================================================================
 * 全部纯函数，输入引擎原始值、输出可直接上屏的字符串。集中在这里的好处：
 * 「没有值该显示成什么」只定义一次 —— 数字列一律 —，绝不拿 0 或 NaN 冒充读数。
 */
var DASH = '\u2014';

function num(v, digits) {
	if (v === null || v === undefined || v === '')
		return DASH;
	var x = Number(v);
	if (!isFinite(x))
		return DASH;
	return x.toFixed(digits == null ? 0 : digits);
}

function ms(v) {
	if (v === null || v === undefined || !isFinite(Number(v)))
		return DASH;
	return Number(v).toFixed(1);
}

/* 吞吐：十进制 MB/s（与测速网站同口径）。<=0 与缺失一律 —，不记成 0。 */
function mbps(v) {
	if (v === null || v === undefined || !isFinite(Number(v)) || Number(v) <= 0)
		return DASH;
	return Number(v).toFixed(2);
}

function pad2(n) {
	return (n < 10 ? '0' : '') + n;
}

/* 相对时间：比绝对时间更能回答「这个读数还新鲜吗」 */
function ago(iso, now) {
	var t = Date.parse(iso);
	if (!isFinite(t))
		return '';
	var diff = Math.floor(((now || Date.now()) - t) / 1000);
	if (diff < 0)
		diff = 0;
	if (diff < 60)
		return T('刚刚');
	if (diff < 3600)
		return T('%s 分钟前').format(Math.floor(diff / 60));
	if (diff < 86400)
		return T('%s 小时前').format(Math.floor(diff / 3600));
	return T('%s 天前').format(Math.floor(diff / 86400));
}

/* 绝对时间用本地时分秒，不印 ISO 串 —— ISO 的 T/Z 对人不友好 */
/* 只给本地时分秒。以前这里还顺手带一个「（5 小时前）」—— 可它全页只有一个调用点：
 * 读数条「完成于」那一格，而那一格的大字读数本身就是 ago()，于是同一句话在同一格里
 * 出现两遍（大字号「5 小时前」+ 小字「08:51:23（5 小时前）」）。
 * 距今这层信息归大字读数，这一行只负责"到底是几点"。 */
function clock(iso) {
	var t = Date.parse(iso);
	if (!isFinite(t))
		return DASH;
	var d = new Date(t);
	return pad2(d.getHours()) + ':' + pad2(d.getMinutes()) + ':' + pad2(d.getSeconds());
}

/* ==========================================================================
 * 4. 状态 → 信号
 * ==========================================================================
 * 全页面唯一一处把 state 翻成语义色与文案的地方。以后引擎加一种状态，只改这里，
 * 不去满页面找第二个 if (state === ...)。
 */
function tone(st) {
	switch (st.state) {
		case 'running':
			/* 读数滞留（连着几次没拿到路由器的返回）就降成 warn：这一轮还在跑，
			 * 但页面手上的数字已经不是最新的了，颜色得说实话。 */
			return st.staleFor ? 'warn' : 'run';
		case 'never_run':
			return 'idle';
		case 'error':
			/* 用户自己叫停的、和跑完但零达标的，都不是"坏了"：灯退一档到 warn。
			 * 但也不能给 ok —— 这一轮确实没拿到新结果。 */
			if (st.reason === 'stopped' || st.reason === 'no_results')
				return 'warn';
			return 'bad';
		case 'unreachable':
		case 'parse_error':
			return 'bad';
		default:
			/* 跑完了。出口被接管、或这一轮一条都没留下，都降级成 warn ——
			 * 「完成了」和「完成了但没结果」不是一回事，灯的颜色必须分开。 */
			if (st.intercepted == 1)
				return 'warn';
			if (Array.isArray(st.items) && !st.items.length)
				return 'warn';
			return 'ok';
	}
}

function stateWord(st) {
	switch (st.state) {
		case 'running':
			/* 还在跑，但读数不是最新的了 —— 一句话说完，别让人以为页面卡死 */
			return st.staleFor ? T('测速中 · 读数滞留') : T('测速中');
		case 'never_run':
			return T('尚未运行');
		case 'unreachable':
			return st.reason === 'hung' ? T('没有回应') : T('读取失败');
		case 'parse_error':
			return T('输出异常');
		case 'error':
			/* 灯上那几个字是和 why() 里同名的三条配对的：自己按的停止不能写成"失败" */
			if (st.reason === 'stopped')
				return T('已停止');
			if (st.reason === 'no_results')
				return T('跑完 · 无达标');
			return T('本轮失败');
		default:
			return st.intercepted == 1 ? T('完成 · 读数不可信') : T('已完成');
	}
}

/* 引擎报的失败原因 → 一句人话。每条都要说清「发生了什么」+「下一步做什么」。
 * r70：错误态也拆两层 —— why() 只回常驻页面的「一句结论」，深度排查细节
 * （引擎内部怎么自愈、平台侧超时是多少）记在 WHY_MORE 里，由 EmptyBox 的 ⓘ
 * 悬停/点击就地展开。赋值放在 case 里而不是模块级：与 help() 同一套路，
 * 且模块级求值会让 _() 在桩件就位之前跑。 */
var WHY_MORE = {};
function whyMore(reason) {
	return WHY_MORE[reason] || '';
}

function why(reason) {
	switch (reason) {
		case 'empty_pool':
			return T('候选池是空的：社区源一条都没拉到，官方网段又关着。到「源与检测」页补几条源（补完要「保存并应用」才生效），再点一次「检测源可用性」，看是不是哪些源改了路径；或临时打开「Cloudflare 官方网段」。');
		case 'missing_curl':
			return T('这台机器上没有 curl（路由器上负责发请求的那个命令行工具）。所有探测都由它发起，请安装 curl 与 ca-bundle（根证书包）。');
		case 'missing_bin':
			return T('找不到 %s：包没装好，或者 rpcd 还拿着旧的 ACL 缓存（重启 rpcd 后重试）。').format(CMD);
		case 'sink_not_writable':
			WHY_MORE.sink_not_writable = T('引擎每轮开始会把运行目录（默认 /tmp/cf-ipcheck）chmod 711、把 .null 放成 666，所以正常不该出现这一条；它出现通常意味着运行目录所在分区满了，或有别的进程改过了那儿的权限。');
			return T('探测身份写不了丢弃响应体的目标，本轮在联网之前就中止了：每条探测都会以 curl rc=23 失败，看着像「所有 IP 都不通」，其实是本地写不了。反复出现就查运行目录所在分区的剩余空间，或「探测身份」是否被改成了不存在的用户。');
		case 'interrupted':
			return T('上一轮没跑完就断了（进程被杀、断电或重启），运行锁已被回收，这一条是自动判出来的。下面是上一次成功完成的榜单；直接点「立即测速」即可重来。');
		case 'stopped':
			/* 和 interrupted 分开说是必要的：这条是用户自己在页面上按了「停止本轮」，
			 * 说成"断了/失败"等于把一次正常操作报成事故。 */
			return T('这一轮是按你点的「停止本轮」停的，不是故障：剩下的探测直接标成已停止，也没有结果需要发布。下面这份榜单还是上一次跑完的那份；要重来直接点「立即测速」。');
		case 'no_results':
			/* 跑完了但一条都没达标 —— 既不是中断，也不能算完成 */
			return T('这一轮跑完了，但没有一条 IP 达标（全部超时，或比门限慢）。下面这份榜单还是上一次跑完的那份。先到「日志」页看最后几行：那行「分类」会说是全超时还是别的原因。');
		default:
			/* 走到这里说明引擎报了个页面没登记过的原因码。别把英文码当整句话甩给用户：
			 * 一是翻译不出来，二是用户不知道该干什么。所以先说人话、再指着「日志」页
			 * （那里是引擎自己写的过程记录，比这个码信息量大），最后给重试动作。 */
			return reason
				? T('本轮中途停了。引擎留下的原因码是 %s —— 这一页还没登记过它，所以翻不出人话。先看「日志」页最后几行（那是引擎自己写的过程记录，通常能看出停在哪一步），确认没问题再点「立即测速」重试一轮；反复出现就把那几行原样贴出来问。').format(reason)
				: T('本轮中途停了，引擎没有留下原因。先看「日志」页最后几行，那里通常有中止前的过程记录；确认配置没问题就点「立即测速」重试一轮。');
	}
}

/* ==========================================================================
 * 5. IPC —— 与引擎的唯一通道
 * ==========================================================================
 * 通道是 rpcd 的 ucode 插件（包内 root/usr/share/rpcd/ucode/luci.cf-ipcheck，
 * 注册成 ubus 对象 luci.cf-ipcheck）。早先这里是 `file.exec` + ACL 放行
 * 「用任意参数执行 /usr/bin/cf-ipcheck」—— 能跑什么由请求方说了算；现在收窄成
 * 五个具名方法，每个都不带参数，能做什么由插件里那张表说了算。树内带逻辑的应用
 * （upnp / ddns / wol / mosdns）都是这个路子，file.exec 留给固定的一次性命令。
 *
 * 每个方法回 `{ ok, text }`，text 就是引擎那一份原样输出 —— **解析只在这一层做**：
 * 引擎输出的字段契约属于引擎（status.json / result.json 的键），在 ucode 里再抄
 * 一份就等于同一份契约有两个出处，正是 lint red-line-6 防的那类漂移。
 *
 * 三种结果各说各的事，绝不混为一谈：
 *   字符串 → 调用成功（空串是「跑完了但没结果」，上层按 never_run 处理）
 *   null   → 调用被拒（ACL 没放开、rpcd 没这个对象、缺 rpcd-mod-ucode、
 *            或插件没加载 —— 装/升级后要 rpcd reload，luci.mk 的 postinst 会做）
 *   HUNG   → 等太久没回（uhttpd/rpcd 挂住，或这台电脑到路由器的路被劫持）
 * 挂住单独成一态而不是收敛成 null：照 null 去查「包没装好」是白费劲，真相是没回应。
 */
var RPC_OBJECT = 'luci.cf-ipcheck';

var RPC_METHODS = {
	status: rpc.declare({ object: RPC_OBJECT, method: 'status' }),
	logs: rpc.declare({ object: RPC_OBJECT, method: 'logs' }),
	'run-now': rpc.declare({ object: RPC_OBJECT, method: 'run' }),
	stop: rpc.declare({ object: RPC_OBJECT, method: 'stop' }),
	'check-sources': rpc.declare({ object: RPC_OBJECT, method: 'check_sources' })
};

var HUNG = { hung: true };

/* 等待上限按命令给：status 只是读一个本地文件，8 秒都嫌宽；check-sources 要引擎
 * 逐条联网实拉，给到 45 秒（引擎自己把最坏耗时压在 30 秒内，理由见下面那条注释）。 */
var CMD_LIMIT = {
	status: 8000,
	/* 一轮跑着的时候把 status 放宽到 20 秒。为什么分开给：这时页面在持续轮询，
	 * 一次慢返回该被当成「这一拍没赶上」，不该当成「路由器死了」。请求有 inflight
	 * 去重，等久一点也不会把请求堆起来。
	 * 慢不在引擎：真机整轮实测 92 次采样，status 最慢 0.48 秒（probe 阶段 8 个
	 * 并发 curl、load 0.89 时量的），logs 同样 0.48 秒 —— 8 秒上限对引擎极宽裕，
	 * 会超时的是这台电脑到路由器的那段路（本机代理/TUN 接管、无线抖动）。 */
	status_running: 20000,
	'run-now': 10000,
	stop: 8000,
	/* 逐条实拉确实慢，但上限不能随口给大数：rpcd 对外部执行有平台级超时
	 * （真机 /etc/config/rpcd 的 option timeout 30，rpcd 源码里可调到最大 600，
	 * file.exec 和 ucode 方法共用同一个 rpc_exec_timeout），到点它就把命令掐了并回一个
	 * 响应，所以客户端等再久也等不到「更完整的结果」。
	 * 引擎那边已经把最坏耗时压进 30 秒（段表 4 秒 + 一批 8 秒），这里给 45 秒
	 * 只是给这条连接留出抖动余量，不是指望它跑一分钟。 */
	'check-sources': 45000,
	/* 读日志只是 tail 一个本地文件（真机实测最慢 0.48 秒），6 秒已经很宽裕。
	 * 这里必须**小于** status 的上限：LuCI 的 rpc 层会把同一拍发出的调用并进一个
	 * POST（真机抓到过：一个请求体里同时带 logs 与 status），响应要等两条都跑完
	 * 才回来 —— logs 的上限若比 status 大，一次慢日志就会把 status 一起拖成「没有
	 * 回应」，页面白挨一刀。桩测里钉着这条大小关系。 */
	logs: 6000
};

function runCmd(args, ms) {
	var fn = RPC_METHODS[args && args[0]];
	/* 认不出的子命令一律按「调用被拒」处理：宁可是 null 让页面说清读不到，
	 * 也不要悄悄发一个不存在的 ubus 方法出去。 */
	var call = fn ? fn().then(function (obj) {
		/* ok:false 是「压根没执行成」（popen 起不来），跟「跑完了但没输出」是两回事。
		 * 早先这里只看 text 是不是字符串，于是插件失败回落的空串被当成 never_run，
		 * run-now 还会报绿色的「已启动一轮测速」—— 假成功。 */
		return (obj && obj.ok !== false && typeof obj.text === 'string') ? obj.text : null;
	}, function () {
		return null;
	}) : Promise.resolve(null);
	/* 没有定时器的环境（单测桩）不加超时，保持同步语义 */
	if (typeof setTimeout !== 'function')
		return call;
	var limit = ms || CMD_LIMIT[args && args[0]] || 8000;
	return new Promise(function (res) {
		var timer = setTimeout(function () { res(HUNG); }, limit);
		call.then(function (out) {
			if (typeof clearTimeout === 'function')
				clearTimeout(timer);
			res(out);
		});
	});
}

/* 引擎在已有轮次时对 run-now 回 {"state":"running"}，不能一律说「已启动」 */
function isRunningReply(out) {
	return /"state"\s*:\s*"running"/.test(String(out));
}

/* 把引擎的一串输出解析成状态对象。
 * 四种失败必须分开表达，这是整页可信度的地基：
 *   null  → 根本没执行成功     → unreachable
 *   HUNG  → 等太久没回         → unreachable + reason=hung（文案完全不同）
 *   空串  → 执行成功但没结果   → never_run（还没跑过一轮）
 *   非JSON→ 输出了但读不懂     → parse_error（附原文片段，便于贴日志排查）
 */
function parseStatus(raw) {
	if (raw === null || raw === undefined)
		return { state: 'unreachable', items: [] };
	if (raw === HUNG)
		return { state: 'unreachable', reason: 'hung', items: [] };
	if (!raw)
		return { state: 'never_run', items: [] };
	try {
		var o = JSON.parse(raw);
		if (!Array.isArray(o.items))
			o.items = [];
		o.intercepted = (o.intercepted === 1 || o.intercepted === '1') ? 1 : 0;
		return o;
	} catch (e) {
		return { state: 'parse_error', items: [], raw: String(raw) };
	}
}

/* 检测源：引擎的 `sources` 子命令返回一个数组 [{url,http,rc,ips,cf_in}]。
 * 同样把「没跑成 / 不是 JSON / 空列表」分开表达。 */
function parseSources(raw) {
	if (raw === null || raw === undefined)
		return { state: 'unreachable' };
	if (raw === HUNG)
		return { state: 'hung' };
	if (!raw)
		return { state: 'empty' };
	try {
		var rows = JSON.parse(raw);
		if (!Array.isArray(rows))
			return { state: 'parse_error', raw: String(raw) };
		if (!rows.length)
			return { state: 'empty' };
		return { state: 'ok', rows: rows };
	} catch (e) {
		return { state: 'parse_error', raw: String(raw) };
	}
}

/* 引擎的 logs 子命令回的是纯文本（不是 JSON），所以这里只有四种情况：
 * 没执行成 / 没回应 / 空文件 / 有内容。空文件要说「还没有日志」，
 * 不能和「读不到」混成一谈 —— 前者是重启过或还没跑过，后者是链路问题。 */
function parseLog(raw) {
	if (raw === null || raw === undefined)
		return { state: 'unreachable' };
	if (raw === HUNG)
		return { state: 'hung' };
	if (!String(raw).replace(/[\r\n\s]/g, ''))
		return { state: 'empty' };
	return { state: 'ok', text: String(raw) };
}

/* ==========================================================================
 * 6. store —— 单一状态容器
 * ==========================================================================
 * 为什么不再让各块自己去改 DOM：旧版刷新结果时是 node.parentNode.replaceChild()，
 * 一旦某块被标签隐藏或已经被换掉，replaceChild 就静默失败、页面从此不再更新。
 * 这里改成：状态只有一份，谁关心谁订阅；状态一变，订阅者各自重画自己那一块。
 * 组件不需要知道自己在哪个面板里、可不可见 —— 重画是幂等的。
 */
function createStore(initial) {
	var state = initial || {};
	var subs = [];
	var notifyTimer = null;

	function get() {
		return state;
	}

	/* 打补丁 + 通知。合并是浅合并：顶层键各管各的，够用且不易出错。
	 * 通知异步合帧：一次操作里连打几个补丁只重画一遍。 */
	function set(patch) {
		for (var k in patch) {
			if (Object.prototype.hasOwnProperty.call(patch, k))
				state[k] = patch[k];
		}
		schedule();
		return state;
	}

	function schedule() {
		if (notifyTimer)
			return;
		var fire = function () {
			notifyTimer = null;
			for (var i = 0; i < subs.length; i++) {
				try {
					subs[i](state);
				} catch (e) {
					/* 一个订阅者出错不该拖垮其余订阅者 */
				}
			}
		};
		/* 没有 setTimeout 的环境（单测）里同步通知 */
		if (typeof setTimeout !== 'function') {
			fire();
			return;
		}
		notifyTimer = setTimeout(fire, 0);
	}

	/* 订阅：立刻用当前状态调一次，省得调用方自己再画一遍首帧。
	 * 返回退订函数。 */
	function subscribe(fn) {
		subs.push(fn);
		try {
			fn(state);
		} catch (e) {}
		return function () {
			var i = subs.indexOf(fn);
			if (i >= 0)
				subs.splice(i, 1);
		};
	}

	return {
		get: get,
		set: set,
		subscribe: subscribe,
		/* 只给单测用：订阅者数量。用来钉住「重复组装页面不累积订阅」这条。 */
		count: function () { return subs.length; }
	};
}

/* 全局状态。字段：
 *   status   —— parseStatus 的结果（引擎那份 JSON）
 *   sources  —— parseSources 的结果，null 表示还没检测过
 *   tab      —— 当前标签 id
 *   busy     —— {run/stop/refresh/check: bool}，用来把按钮置成 loading
 *   flash    —— {title, text, tone} | null，页内提示（这版 LuCI 没有 toast）
 */
var store = createStore({
	status: { state: 'never_run', items: [] },
	sources: null,
	logs: null,
	tab: 'board',
	busy: {},
	flash: null,
	logFull: false
});

/* ==========================================================================
 * 7. 基础组件
 * ==========================================================================
 * 每个组件都是 (props) => Node 的纯函数：只吃数据、吐节点，不碰全局、不存引用。
 * 需要交互的地方通过 props.on* 回调传出去，由页面层决定要改哪个状态。
 */

/* 小节标题：小标签 + 一条拉满的发丝线 */
function Section(title, right) {
	/* h3 而不是 span：读屏器靠标题跳章节，过去整块面板里一个标题级元素都没有。
	 * 层级上 LuCI 给页面 h1/h2，我们面板内的分区落 h3 正好接得上。
	 * 分组头（.grp-h）故意不跟着改：那是 role=button 的控件，套标题会让 AT 听到
	 * 「标题+按钮」双重语义，反而更难用。 */
	return el('div', { class: 'sec' }, [
		el('h3', { class: 'sec-t', text: title }),
		el('span', { class: 'sec-rule' }),
		right || null
	]);
}

/* ---- 字段说明：页面上只留一行，完整解释挂悬停 / 点击展开 ----------------
 * 真机量过：把 17 条长说明全摊在页面上会占两千多像素，榜单被挤到看不见，
 * 而其中大半是一次性背景知识（为什么探测身份是 nobody、令牌为什么要收权限），
 * 不该每屏都读一遍。
 *
 * 实现上用「函数返回短句 + 存全局表 + 事后贴 ⓘ」而不是建一个组件：因为
 * form.Value 的第三个参数必须是字符串，没法塞节点。所以短句照旧由 help()
 * 返回，完整解释记在 HELP 里，等 Map 渲染完、字段搬进分组之后再按
 * label[for] 的选项名贴上去。
 */
var HELP = {};

function help(key, short, full) {
	HELP[key] = full;
	return short;
}

/* 把所有已声明字段的完整解释贴到对应的 .cbi-value-description 上。
 * 必须等表单迁进新面板之后再调 —— 早调的话字段还在 form.js 原生的 section 里，
 * 节点会被后续搬家一起带走，ⓘ 也白贴。 */
function applyHelp(root) {
	if (!root || !root.querySelectorAll)
		return;
	var rows = root.querySelectorAll('.cbi-value');
	Array.prototype.forEach.call(rows, function (row) {
		var lab = row.querySelector('label[for]');
		/* 选项名取 label[for] 的最后一段：form.js 生成的 id 是
		 * "widget.cf_ipcheck.<option>"，也见过 "cbid.cf_ipcheck.<option>"。 */
		var key = lab && lab.htmlFor ? String(lab.htmlFor).split('.').pop() : '';
		var full = HELP[key];
		var desc = row.querySelector('.cbi-value-description');
		if (!full || !desc || desc.querySelector('.hmark'))
			return;
		/* label 也带一份 title：停在字段名上就能看解释。
		 * ⓘ 只加在说明文字上 —— label 是控件的点击目标，点它应该翻开关而不是展开。 */
		if (lab)
			lab.setAttribute('title', full);
		desc.appendChild(HelpMark(full));
		desc.setAttribute('title', full);
	});
}

/* ⓘ 标记：鼠标悬停读 title，触屏 / 键盘点一下就地在说明下方展开完整解释。
 * 再点一次收起 —— 收起后这一行的高度仍与原来一致，不推动下面的字段。 */
function HelpMark(full) {
	var body = null;
	var mark = el('span', {
		class: 'hmark',
		tabindex: '0',
		role: 'button',
		'aria-expanded': 'false',
		'aria-label': T('展开完整说明'),
		title: full
	}, el('i', { text: 'i' }));

	function toggle(ev) {
		if (ev && ev.preventDefault)
			ev.preventDefault();
		if (ev && ev.stopPropagation)
			ev.stopPropagation();
		if (!body) {
			body = el('div', { class: 'hbody', text: full });
			mark.parentNode.appendChild(body);
		} else {
			var open = body.hidden !== true;
			body.hidden = open;
		}
		mark.setAttribute('aria-expanded', body.hidden ? 'false' : 'true');
	}

	mark.addEventListener('click', toggle);
	mark.addEventListener('keydown', function (ev) {
		if (ev.key === 'Enter' || ev.key === ' ' || ev.key === 'Spacebar')
			toggle(ev);
	});
	return mark;
}

/* 「调不到引擎」的排查话术，几条命令共用一句。以前每条各写一遍「ACL 没放开 exec」，
 * 换成 ucode 插件之后成因变了（对象没注册 / 缺 rpcd-mod-ucode / 装完没 reload），
 * 集中一处写才不会改漏。 */
function whyNoReply(what, method) {
	return T('%s：调不到 %s 的 %s 方法。按可能性排：本包没装好或 /usr/bin/cf-ipcheck 的可执行位丢了；' +
		'缺 rpcd-mod-ucode（本包已声明依赖）；装完或升级后 rpcd 没 reload（luci.mk 的 postinst 会自动做，' +
		'手工排查可以跑一次 /etc/init.d/rpcd reload）；或 rpcd 的 ACL 没放开这个对象。')
		.format(what, RPC_OBJECT, method);
}

/* 引擎的失败分类码 → 给人看的说法。键照 probe_one 与文档头部那份集合列全；
 * 认不出的原样带出（用在 SummaryStrip 的未达标那一格）。
 * 每个名字都过 T()：这份代码的规矩是用户可见串不写裸字面量，否则 i18n 的提取
 * 会整个漏掉它们。 */
function errKindName(k) {
	var s = String(k);
	switch (s) {
		case 'timeout': return T('超时');
		case 'tls': return T('握手失败');
		case 'connect': return T('连不上');
		case 'dns': return T('解析失败');
		case 'http': return T('返回错误');
		case 'stopped': return T('已叫停');
		case 'invalid_ip': return T('地址无效');
	}
	if (s.indexOf('transport_') === 0)
		return T('传输出错 %s').format(s.slice(10));
	return s;
}

/* 读数单元：标签 / 值 / 单位 / 副行 */
function Readout(p) {
	var v = [
		el('span', { class: 'n', text: p.value })
	];
	if (p.unit)
		v.push(el('span', { class: 'u', text: p.unit }));

	var cell = [
		el('div', { class: 'cell-k', text: p.label }),
		el('div', { class: 'cell-v' + (p.tone ? ' ' + p.tone : '') }, v)
	];
	if (p.sub)
		cell.push(el('div', { class: 'cell-sub', text: p.sub, title: p.sub }));
	return el('div', { class: 'cell' }, cell);
}

/* 读数带：一排读数单元，靠 1px 网格线分列 */
function ReadoutStrip(cells) {
	return el('div', { class: 'strip' }, cells);
}

/* 按钮。kind: primary | default | ghost | lnk；icon: ICONS 里的名字 */
function Button(p) {
	var kids = [];
	if (p.icon)
		kids.push(el('i', { class: 'bi' }, svgIcon(p.icon)));
	kids.push(el('span', { text: p.label }));
	var cls = '';
	if (p.kind === 'primary')
		cls = 'primary';
	else if (p.kind === 'ghost')
		cls = 'ghost';
	else if (p.kind === 'lnk')
		cls = 'lnk';
	return el('button', {
		class: cls + (p.busy ? ' busy' : ''),
		type: 'button',
		disabled: !!p.disabled,
		'aria-busy': p.busy ? 'true' : null,
		title: p.title || null,
		on: p.onClick ? { click: function (ev) { ev.preventDefault(); p.onClick(this); } } : null
	}, kids);
}

/* 忙碌态：禁用 + 图标位转圈。不换文案（避免宽度跳动），但要让人看得出这一下点下去了 */
function setBusy(btn, on) {
	if (!btn)
		return;
	btn.disabled = !!on;
	btn.className = String(btn.className).replace(/ ?busy/g, '') + (on ? ' busy' : '');
	if (btn.setAttribute)
		btn.setAttribute('aria-busy', on ? 'true' : 'false');
}

/* 空态 / 加载态：一句说清为什么空，再给一个能解决它的动作。
 * p.more：错误/异常状态的深度排查细节。常驻的只有「一句结论」，背景知识
 * （引擎内部怎么自愈、平台侧超时多少）挂 ⓘ 悬停/点击就地展开 —— 与表单
 * 字段同一套机制（HelpMark），r70 起错误三态也走这条。 */
function EmptyBox(p) {
	var box = [
		el('i', { class: 'empty-ic' }),
		el('div', { class: 'empty-b' }, [
			el('div', { class: 'empty-t', text: p.title }),
			el('div', { class: 'empty-d' }, [ p.detail, p.more ? HelpMark(p.more) : null ])
		])
	];
	if (p.action)
		box.push(el('div', { class: 'empty-a' }, p.action));
	return el('div', { class: 'empty' + (p.spin ? ' spin' : '') }, box);
}

/* 页内提示条：这版 LuCI 两个 toast API 都没有，全靠它。
 * p.more 同 EmptyBox：结论留页面上，深度细节挂 ⓘ。 */
function Flash(p) {
	if (!p)
		return null;
	var kids = [
		el('b', { text: p.title + (p.text ? '：' : '') }),
		p.text ? el('span', { text: p.text }) : null
	];
	if (p.more)
		kids.push(HelpMark(p.more));
	return el('div', { class: 'flash' + (p.tone ? ' ' + p.tone : '') }, kids);
}

/* ==========================================================================
 * 8. 状态读数条（StatusRail）—— 常驻顶部，不随标签切换
 * ==========================================================================
 * 这一条管的是「本轮测速」这件事，而三个标签都可能要起测（源页发现池空、
 * 配置页改完想立刻验），所以它不能属于任何一个面板。
 */
function StatusRail(st, busy, actions) {
	var toneName = tone(st);
	var lampText = stateWord(st);

	var id = [
		el('span', { class: 'lamp t-' + toneName }, [
			el('i', { class: 'lamp-dot' }),
			el('span', { text: lampText })
		])
	];

	/* 副信息：什么时候跑完的 + 定时状态 */
	var sched = scheduleLine(st);
	if (sched)
		id.push(el('span', { class: 'rail-note', text: sched }));
	if (st.intercepted == 1)
		id.push(el('span', { class: 'rail-tag', text: T('出口被代理接管') }));
	/* 版本号常驻在这里：不用翻页脚、不用开控制台就能报给我「我看到的是 r 几」 */
	id.push(el('span', { class: 'build', title: T('浏览器里正在跑的视图版本'), text: VIEW_BUILD }));

	var running = st.state === 'running';

	var btnRun = Button({
		kind: 'primary', icon: 'play', label: T('立即测速'),
		disabled: running || busy.run, busy: busy.run,
		onClick: actions.run
	});
	var btnStop = Button({
		icon: 'stop', label: T('停止本轮'),
		disabled: !running || busy.stop, busy: busy.stop,
		title: running ? T('点了不弹窗：这一轮会在收尾时停止，进度与日志里能看到')
			: T('当前没有在跑的一轮'),
		onClick: actions.stop
	});
	var btnRefresh = Button({
		icon: 'refresh', label: T('刷新'),
		disabled: busy.refresh, busy: busy.refresh,
		onClick: actions.refresh
	});
	var copyable = !!(st.items && st.items.length) && st.state !== 'running';
	var btnCopy = Button({
		icon: 'copy', label: T('复制榜单 IP'),
		disabled: !copyable,
		/* 跑着的时候手上那份 items 是**上一轮**的（这一轮还没出榜单），
		 * 让它可点就等于悄悄把人没看见的东西复制到剪贴板里去了。 */
		title: st.state === 'running' ? T('这一轮还在跑，等它结束再复制这一轮的榜单')
			: ((st.items && st.items.length) ? null : T('榜单是空的，没有可复制的 IP')),
		onClick: actions.copy
	});

	return el('div', { class: 'rail' }, [
		el('div', { class: 'rail-id' }, id),
		el('div', { class: 'rail-acts' }, [ btnRun, btnStop, btnRefresh, btnCopy ])
	]);
}

/* 调度文案：关掉时明说关闭；开着时报周期与下一轮 */
function scheduleLine(st) {
	if (st.enabled == null)
		return '';
	if (Number(st.enabled) === 0)
		return T('定时实测：关闭');
	var s = T('定时实测：每 %s 小时').format(st.interval != null ? st.interval : '?');
	if (st.interval != null) {
		/* 优先用引擎给的 next_run：它是引擎拿**守门自己读的** lastrun 算出来的，
		 * 两边不可能再各说一套。以前这里自己按 started + 周期算，而零结果收尾那一轮
		 * 为了不把上一轮榜单丢掉，状态里带的是上一轮的 started —— 真机上量到的后果是
		 * 页面说「下一轮约 04:50」而引擎 07:45 才放行，早了将近三个钟头。
		 * 老引擎没有这个键（或 lastrun 读不到 ⇒ 引擎干脆不给）才退回 started 那套算法。
		 * r41 那条"别用 finished"的道理在这里仍然成立：守门算余量用的是起轮时刻。 */
		var at = NaN;
		if (st.next_run != null && isFinite(Number(st.next_run)))
			at = Number(st.next_run) * 1000;
		else {
			var base = Date.parse(st.started || st.finished);
			if (isFinite(base))
				at = base + Number(st.interval) * 3600000;
		}
		if (isFinite(at)) {
			var d = new Date(at);
			s += T('，下一轮约 %s').format(pad2(d.getHours()) + ':' + pad2(d.getMinutes()));
		}
	}
	return s;
}

/* 结果是否已经超过设定周期：过了就该提示「这个读数不新鲜了」 */
function stale(st, now) {
	if (st.state === 'running' || !st.finished || st.interval == null)
		return false;
	var t = Date.parse(st.finished);
	if (!isFinite(t))
		return false;
	return ((now || Date.now()) - t) > Number(st.interval) * 3600000;
}

/* ==========================================================================
 * 9. 榜单（Leaderboard）
 * ==========================================================================
 * 列定义集中在一处：顺序、表头、对齐、取哪个字段 —— 加一列只改这张表。
 * 数字列全部 r（右对齐），因为它们要竖着比；文字列（IP / 域名）左对齐。
 */
var COLS = [
	{ key: 'rk',    h: '#',           cls: 'r', get: function (it, i) { return String(i + 1); } },
	{ key: 'ip',    h: 'IP',          cls: 'l', get: function (it) { return it.ip || '?'; }, mono: true },
	{ key: 'code',  h: 'HTTP',        cls: 'r', get: function (it) { return it.code != null ? String(it.code) : DASH; } },
	{ key: 'tcp',   h: 'TCP',         cls: 'r', get: function (it) { return ms(it.connect_ms); } },
	{ key: 'tls',   h: 'TLS',         cls: 'r', get: function (it) { return ms(it.tls_ms); } },
	{ key: 'ttfb',  h: 'TTFB',        cls: 'r', get: function (it) { return ms(it.ttfb_ms); } },
	{ key: 'total', h: '总计',        cls: 'r', get: function (it) { return ms(it.total_ms); } },
	{ key: 'colo',  h: '机房',        cls: 'r', get: function (it) { return it.colo || DASH; } },
	{ key: 'spd',   h: 'MB/s',        cls: 'r', get: function (it) { return mbps(it.speed_mbytes); } }
];
var COL_DOMAIN = { key: 'domain', h: '胜出域名', cls: 'l', get: function (it) { return it.domain || DASH; } };

/* 有几种不同的「胜出域名」？只有多于一种时那一列才值得占地方 */
function domainKinds(items) {
	var seen = {};
	var n = 0;
	for (var i = 0; i < (items || []).length; i++) {
		var d = items[i] && items[i].domain;
		if (d && !seen[d]) {
			seen[d] = 1;
			n++;
		}
	}
	return n;
}

/* 表头行 */
function boardHead(cols) {
	return el('div', { class: 'brow head', role: 'row' },
		cols.map(function (c) {
			return el('div', { class: 'bc ' + c.cls, role: 'columnheader', text: c.h });
		}));
}

/* 数据行。第一名左侧加一道强调竖条；吞吐列带一条相对最小值/最大值的迷你横条。 */
function boardRow(it, i, cols, maxSpeed) {
	var cells = cols.map(function (c) {
		/* 状态码：2xx 用 ok 色，其余（403/404 也算达标）用 warn 色 */
		if (c.key === 'code') {
			var code = it.code;
			var cls = (code != null && code >= 200 && code < 300) ? 'code-ok' : 'code-odd';
			return el('div', { class: 'bc ' + c.cls, role: 'cell' },
				el('span', { class: 'n ' + cls, text: c.get(it, i) }));
		}
		/* 吞吐：数字 + 迷你条（条宽 = 相对本轮最大值，一眼看出快慢悬殊） */
		if (c.key === 'spd') {
			var v = it.speed_mbytes;
			var txt = mbps(v);
			if (v > 0 && maxSpeed > 0) {
				var pct = Math.max(4, Math.round(100 * Number(v) / maxSpeed));
				return el('div', { class: 'bc ' + c.cls, role: 'cell' },
					el('span', { class: 'spd' }, [
						el('span', { class: 'spd-bar' },
							el('i', { class: 'spd-fill', style: { width: pct + '%' } })),
						el('span', { class: 'n', text: txt })
					]));
			}
			return el('div', { class: 'bc ' + c.cls, role: 'cell' },
				el('span', { class: 'n', text: txt }));
		}
		/* 名次用弱色小字，不当读数 */
		if (c.key === 'rk')
			return el('div', { class: 'bc ' + c.cls, role: 'cell' },
				el('span', { class: 'rk n', text: c.get(it, i) }));

		var node = el('span', { class: 'n' + (c.mono ? ' ip' : ''), text: c.get(it, i) });
		return el('div', { class: 'bc ' + c.cls, role: 'cell' }, node);
	});
	return el('div', {
		class: 'brow data' + (i === 0 ? ' top' : ''),
		role: 'row'
	}, cells);
}

function Leaderboard(items) {
	if (!items || !items.length)
		return null;

	var cols = COLS.slice();
	if (domainKinds(items) > 1)
		cols.push(COL_DOMAIN);

	var maxSpeed = 0;
	for (var i = 0; i < items.length; i++) {
		var s = Number(items[i] && items[i].speed_mbytes);
		if (isFinite(s) && s > maxSpeed)
			maxSpeed = s;
	}

	var rows = [ boardHead(cols) ];
	for (var j = 0; j < items.length; j++)
		rows.push(boardRow(items[j], j, cols, maxSpeed));

	return el('div', { class: 'board' + (cols.length > COLS.length ? ' multi' : ''), role: 'table' }, [
		el('div', { class: 'board-scroll' }, rows)
	]);
}

/* ==========================================================================
 * 10. 汇总读数带
 * ==========================================================================
 * 把引擎给的几个计数摊成一排读数。这里只呈现引擎真给了的数：它没给就不画那一格，
 * 不拿 items.length 去假装「候选池」——这两件事的语义完全不同。
 */
function SummaryStrip(st) {
	var cells = [];

	cells.push(Readout({
		label: T('候选池'), value: num(st.pool),
		sub: T('本轮去重后参与探测的 IP 数')
	}));
	cells.push(Readout({
		label: T('达标'), value: num(st.qualified),
		sub: T('TTFB 与总耗时两道门槛都过')
	}));
	cells.push(Readout({
		label: T('榜单'), value: num(st.usable != null ? st.usable : (st.items || []).length),
		sub: T('按 TTFB 排序保留的条数')
	}));

	/* 失败分类：只在引擎给了 counts 且确有失败时出现。
	 * 键是引擎的码，给人看要换成中文；认不出来的一律原样带出，宁可露一个陌生码
	 * 也别编一句看着笃定的假话（真机就露过一次 `00`，那是一次并发写坏的记录）。 */
	var none = st.counts && st.counts.none != null;
	var failed = 0;
	if (st.counts) {
		for (var k in st.counts) {
			if (Object.prototype.hasOwnProperty.call(st.counts, k) && k !== 'none')
				failed += Number(st.counts[k]) || 0;
		}
	}
	if (st.counts && failed > 0) {
		var parts = [];
		for (var k2 in st.counts) {
			if (Object.prototype.hasOwnProperty.call(st.counts, k2) && k2 !== 'none' && st.counts[k2])
				parts.push(errKindName(k2) + ' ' + st.counts[k2]);
		}
		cells.push(Readout({
			label: T('未达标'), value: num(failed), tone: 'warn',
			sub: parts.join(' · ')
		}));
	}

	if (st.domains)
		cells.push(Readout({ label: T('探测域名'), value: String(st.domains) }));

	if (st.finished || st.started)
		cells.push(Readout({
			label: T('完成于'), value: ago(st.finished || st.started),
			sub: clock(st.finished || st.started),
			tone: stale(st) ? 'warn' : null
		}));

	return ReadoutStrip(cells);
}

/* ==========================================================================
 * 11. 榜单面板
 * ========================================================================== */
/* ==========================================================================
 * 11a. 运行进度
 * ==========================================================================
 * 顺序就是引擎 do_run 的真实顺序（先建候选池，再做出口自检），不是按名字排的。
 * 进度只在这一轮正在跑时出现；引擎没给 stage（旧状态、或重启后读到的残影）就
 * 老实退回一句「正在测速」，不画半截清单、也不把 0/0 当成进度。
 */
var STAGES = [
	{ id: 'fetch',  label: '拉取社区源' },
	{ id: 'canary', label: '出口接管自检' },
	{ id: 'probe',  label: '并发探测' },
	{ id: 'rank',   label: '合并与排序' },
	{ id: 'colo',   label: '查落地机房' },
	{ id: 'speed',  label: '实测下载吞吐' },
	{ id: 'upload', label: '上传 Gist' }
];

function stageIndex(id) {
	for (var i = 0; i < STAGES.length; i++)
		if (STAGES[i].id === id)
			return i;
	return -1;
}

function stageCountText(done, total) {
	if (!(total > 0))
		return '';
	return String(done) + '/' + String(total);
}

/* 进度条：宽度改成 transform:scaleX（.pbar b 已满宽，靠 .pbar 的 overflow:hidden 裁）。
 * 为什么要多写一帧：榜单面板每 3 秒按指纹整体重画，这个 b 是刚插进 DOM 的新元素，
 * 浏览器手上没有它的「改之前长什么样」，于是 CSS 里那条 transition 永远不起跳 ——
 * 上一版实测到的「进度条一格一格闪」就是这个。先按上一帧的值插入，下一帧再改成目标值，
 * 中间这一跳才有起点可插值。没有 rAF（老引擎、桩测）就当场落定，宁可不动也不能不动画。
 * 起点只在同一个环节里沿用：换环节时从 0 长出来，那一节本来就是新的一根。 */
var progPrev = { id: '', frac: 0 };

function ProgBar(stageId, frac) {
	var bar = el('b');
	bar.style.transform = 'scaleX(' + (progPrev.id === stageId ? progPrev.frac : 0) + ')';
	progPrev = { id: stageId, frac: frac };
	if (typeof requestAnimationFrame !== 'function') {
		bar.style.transform = 'scaleX(' + frac + ')';
		return bar;
	}
	requestAnimationFrame(function () {
		bar.style.transform = 'scaleX(' + frac + ')';
	});
	return bar;
}

function RunProgress(st) {
	var cur = stageIndex(st.stage);
	var head = T('正在测速');
	var kids = [];

	if (cur < 0) {
		return EmptyBox({
			spin: true,
			title: head,
			detail: T('这一轮还在跑，完成后本页会自动更新。（还没读到环节进度：第一次读取一到，下面的清单就会补上）')
		});
	}

	var doneN = Number(st.stage_done) || 0;
	var totalN = Number(st.stage_total) || 0;
	var progFrac = totalN > 0 ? Math.min(1, Math.round(doneN * 1000 / totalN) / 1000) : 0;
	var curText = stageCountText(doneN, totalN);
	if (curText)
		head += ' · ' + STAGES[cur].label + ' ' + curText;

	var steps = STAGES.map(function (sg, i) {
		var state = 'todo', note = '';
		if (i < cur || (i === cur && totalN > 0 && doneN >= totalN))
			state = 'done';
		else if (i === cur)
			state = 'now';
		/* 上传这一环节只有开了才走；没开就别让它一直挂着「待做」骗人 */
		if (sg.id === 'upload' && Number(st.upload) !== 1)
			state = 'off';
		if (state === 'now')
			note = curText;
		else if (state === 'done')
			note = sg.id === 'upload' ? '' : stageCountText(totalN, totalN);
		else if (state === 'off')
			note = T('未开启');
		var row = [
			el('i', { class: 'pm', text: state === 'done' ? '✓' : (state === 'now' ? '●' : (state === 'off' ? '—' : '○')) }),
			el('span', { class: 'pl', text: T(sg.label) }),
			el('span', { class: 'pn', text: note })
		];
		if (state === 'now' && totalN > 0)
			row.push(el('span', { class: 'pbar' }, ProgBar(sg.id, progFrac)));
		return el('li', { class: 'pstep ' + state }, row);
	});

	kids.push(el('div', { class: 'prog-h', 'aria-live': 'polite' }, el('span', { class: 'prog-t', text: head })));
	kids.push(el('ol', { class: 'psteps' }, steps));
	kids.push(el('p', { class: 'note' },
		T('探测是「攒够一批一起等」，所以那一条会跳着走而不是平滑递增；这一轮的真实过程记录在「日志」页，切过去就能看到，不用点任何按钮。')));
	return el('div', { class: 'prog' }, kids);
}

/* 榜单本体：读数条 + 小标题 + 表格 + 列头说明。
 * r49 抽出来共用：过去只有「正常完成」那条分支会带这段脚注，于是本轮失败或读不到
 * 但仍展示上一轮榜单时，同样这 9 列一个字都不解释 —— 而那一刻恰恰最需要看懂列头。
 * 脚注里为什么不用 <abbr> 虚线悬浮（树内插件的做法）：悬浮在触屏上拿不到
 * （本插件实测过 556 处 title 在手机上读不到），而这些是每轮都要看的列头，结论写成明文。
 * r70 起拆两层：一句结论常驻页面，六列的完整定义（TCP/TLS/TTFB/总计/机房/MB/s）
 * 挂 ⓘ —— 那是 HelpMark，触屏/键盘点一下就地展开，不是只能悬浮的 <abbr>。 */
function BoardTable(st, kids) {
	kids.push(SummaryStrip(st));
	kids.push(Section(T('榜单')));
	kids.push(Leaderboard(st.items));
	kids.push(el('p', { class: 'note' }, [
		T('按 TTFB 升序排列，同值再看总耗时；四个时间列都是毫秒。TTFB（首字节耗时）是主排序依据；机房列是 Cloudflare 节点城市三字码；MB/s 为十进制、只作参考不参与排序，未测或失败显示 %s。').format(DASH),
		HelpMark(T('四个时间列从浅到深：TCP=能否连上这个 IP；TLS=在它上面能否完成加密握手；TTFB（首字节耗时）=握手加上传请求到收到第一个字节；总计=整段响应收完，含下载内容，会随文件大小变化。排序看的是 TTFB，因为它与内容大小无关。机房=这个 IP 实际把你带到的 Cloudflare 节点城市三字码（如 SIN 新加坡、NRT 东京）。MB/s 为十进制（1 MB = 1000 KB），只对前若干个 IP 实测、仅作参考不参与排序，未测或失败显示 %s。').format(DASH))
	]));
	return kids;
}

function BoardPane(st, actions) {
	var kids = [];

	/* 接管红条：这一轮的读数不可信，必须在最上面说清 */
	if (st.intercepted == 1) {
		kids.push(Flash({
			title: T('出口被代理接管'),
			/* 光说"数字不可信"不够 —— 用户下一步要问的是"那我怎么让它可信"。
			 * 接管来自路由器上的透明代理，所以指向代理侧的直连/绕过名单，
			 * 本插件不替你改任何代理配置（配置面最小是这插件的边界）。
			 * r70：结论常驻，探测域名的默认值与边界声明挂 ⓘ。 */
			text: T('候选 IP 没参与选路，下面这些数字测的是「本机 → 代理 → CF」的耗时，不能用来判断 IP 好坏；本轮已自动跳过机房与吞吐两列。要拿到真值：在路由器那侧的透明代理里把探测域名和 Cloudflare 网段列入直连/绕过名单，或临时停一下代理，再点「立即测速」重跑一轮。'),
			more: T('探测域名默认 www.cloudflare.com（在「探测域名」里改）。本插件不替你改代理配置 —— 配置面最小是这插件的边界。'),
			tone: 'bad'
		}));
	}

	if (st.state === 'running') {
		/* 读数滞留横幅：连着几次没拿到返回时，下面那份进度还停在上一帧。
		 * 这时候最要命的是让人以为「页面又卡死了、得按 F5」，所以把实情和
		 * 「不用你动手」两件事都写出来。 */
		if (st.staleFor) {
			kids.push(Flash({
				title: T('读数停在 %s 秒前').format(st.staleFor),
				text: T('路由器暂时没回话，但这一轮还在跑；页面会在后台继续重试，不需要刷新。下面的环节进度是最后一次读到的那一帧。'),
				tone: 'warn'
			}));
		}
		kids.push(RunProgress(st));
		return el('div', {}, kids);
	}

	/* 三种「读不到」分开说，各自给对应的下一步 */
	if (st.state === 'unreachable' || st.state === 'parse_error') {
		var hung = st.reason === 'hung';
		kids.push(EmptyBox({
			title: hung ? T('路由器没有回应')
				: (st.state === 'unreachable' ? T('读不到引擎的输出') : T('引擎的输出读不懂')),
			detail: hung
				? T('连着几次都没等到 %s 的返回，这通常不是插件的问题。先确认这台电脑能打开路由器后台（本机代理/TUN 接管会把到 10.0.0.0/8 的流量吞掉），再看 LuCI 会话是不是已经过期。页面仍在后台每隔一会儿重试，恢复了会自己跟上；等不及就点「刷新」。').format(CMD)
				: (st.state === 'unreachable'
					? whyNoReply(T('读不到引擎的输出'), 'status')
					: T('拿到的不是引擎该回的那种格式，读不懂。原文片段：%s —— 先核对右上角版本号与装上的包版本是否一致（不一致就是浏览器还在吃旧的视图缓存，强刷一次），再点「刷新」。').format(String(st.raw || '').slice(0, 160))),
			action: Button({
				label: T('刷新'), icon: 'refresh',
				onClick: actions.refresh
			})
		}));
		/* 读不到不等于没有：上一轮的榜单还在手上就照样端出来。别因为一次链路
		 * 抖动就把用户正在看的十行数字抹成白板 —— r32 就是这么干的，一次 status
		 * 超时之后整页只剩「路由器没有回应」，非按 F5 不可。 */
		if (st.items && st.items.length)
			BoardTable(st, kids);
		return el('div', {}, kids);
	}

	if (st.state === 'error') {
		kids.push(EmptyBox({
			title: T('本轮没有跑完'),
			detail: why(st.reason),
			more: whyMore(st.reason),
			action: Button({
				kind: 'primary', label: T('立即测速'), icon: 'play',
				onClick: actions.run
			})
		}));
		/* 即便本轮失败，上一轮的榜单往往还在，照样展示出来（连列头说明一起，
		 * 见 BoardTable：失败的那一刻最需要看得懂这些列） */
		if (st.items && st.items.length)
			BoardTable(st, kids);
		return el('div', {}, kids);
	}

	if (!st.items || !st.items.length) {
		kids.push(EmptyBox({
			title: st.state === 'never_run' ? T('还没有测过') : T('这一轮没有产生榜单'),
			detail: st.state === 'never_run'
				? T('点「立即测速」跑第一轮。引擎会先拉社区源、把上一轮进榜的那几条 IP 并回候选池，再用带真实 SNI 的 HTTPS 逐个实测。')
				: T('候选池里的 IP 都没有同时过 TTFB 与总耗时两道门槛。放宽阈值（配置 → 测速与判定），或先到「源与检测」看看候选池为什么这么小。'),
			action: Button({
				kind: 'primary', label: T('立即测速'), icon: 'play',
				onClick: actions.run
			})
		}));
		return el('div', {}, kids);
	}

	BoardTable(st, kids);
	return el('div', {}, kids);
}
/* ==========================================================================
 * 12. 源检测面板
 * ========================================================================== */
var SRC_COLS = [
	{ h: '源 URL', cls: 'l' },
	{ h: 'HTTP',   cls: 'r' },
	{ h: '提取 IPv4', cls: 'r' },
	{ h: 'CF 段内',   cls: 'r' },
	{ h: '段内占比',  cls: 'r' }
];

function SourceRow(r) {
	var marks = [];
	var ips = (r.ips != null && r.ips !== '') ? Number(r.ips) : null;
	var cf = (r.cf_in != null && Number(r.cf_in) >= 0) ? Number(r.cf_in) : null;
	var pct = (ips && ips > 0 && cf != null) ? Math.round(100 * cf / ips) : null;

	/* 一行可能有三种毛病，优先级从高到低：拉不到 > 段内占比过低 > 正常 */
	var bad = (r.http === '000' || !r.http || Number(r.rc) !== 0);
	var lowCover = (pct != null && pct < 90);

	var ipCell = el('div', { class: 'bc r' },
		el('span', { class: 'n', text: ips == null ? DASH : String(ips) }));
	var cfCell = el('div', { class: 'bc r' },
		el('span', { class: 'n', text: cf == null ? DASH : String(cf) }));

	/* 段内占比：低于 90% 意味着这个源大概在吐别人自己的中转 IP */
	var pctCell = el('div', { class: 'bc r' },
		el('span', {
			class: 'n' + (lowCover ? ' code-odd' : (pct != null ? ' code-ok' : '')),
			text: pct == null ? DASH : pct + '%'
		}));

	var httpCell = el('div', { class: 'bc r' },
		el('span', {
			class: 'n ' + (bad ? 'code-odd' : 'code-ok'),
			/* curl 把「连不上、被拒、超时」都报成 000，那不是 HTTP 状态码，
			 * 印出来只会让人以为源返回了三个零。 */
			text: (!r.http || r.http === '000') ? T('拉不到') : String(r.http)
		}));

	return el('div', { class: 'brow data' }, [
		el('div', { class: 'bc l' },
			el('span', { class: 'ip', text: String(r.url || '?'), title: String(r.url || '') })),
		httpCell, ipCell, cfCell, pctCell
	]);
}

function SourceMatrix(rows) {
	var head = el('div', { class: 'brow head', role: 'row' },
		SRC_COLS.map(function (c) {
			return el('div', { class: 'bc ' + c.cls, role: 'columnheader', text: c.h });
		}));
	var body = rows.map(SourceRow);
	/* role=table 不能省：行是 role=row、格是 columnheader/cell，
	 * 没有 table 祖先的话屏幕阅读器会把这棵树当噪声。 */
	return el('div', { class: 'board src', role: 'table' }, [
		el('div', { class: 'board-scroll' }, [ head ].concat(body))
	]);
}

/* 编辑框里那些"还没生效"的条：检测结果里没有它们的行，就说明它们没在配置里。
 * 只在已经有结果（state=ok）时才比 —— 没结果时拿"编辑框非空"当"未应用"是冤枉人。
 * 读的是编辑框里那批 hidden input（LuCI 的 DynamicList 就是靠它们采值），
 * 我们只读不写，也不换掉任何节点。 */
function pendingSourceEdits(src) {
	if (!src || src.state !== 'ok' || !P.srcEdit || !P.srcEdit.querySelectorAll)
		return [];
	var edited = [];
	try {
		var hiddens = P.srcEdit.querySelectorAll('input[type="hidden"]');
		Array.prototype.forEach.call(hiddens, function (i) {
			if (i && i.value)
				edited.push(String(i.value));
		});
	} catch (e) {
		return [];
	}
	if (!edited.length)
		return [];
	var checked = {};
	(src.rows || []).forEach(function (r) { if (r && r.url) checked[String(r.url)] = 1; });
	return edited.filter(function (u) { return !checked[u]; });
}

function SourcesPane(src, actions) {
	var kids = [];

	kids.push(Section(T('逐源检测'), Button({
		label: T('检测源可用性'), icon: 'probe',
		disabled: store.get().busy && store.get().busy.check,
		busy: store.get().busy && store.get().busy.check,
		title: T('逐条实拉「已经生效」的那份清单。上面编辑框里改过的内容，要先点页面底部的「保存并应用」才会生效。'),
		onClick: actions.check
	})));

	kids.push(el('p', { class: 'note' },
		T('这一步只读、不写：检测拉的是配置文件里那份清单。你在上面编辑框里的改动要点页面底部的「保存并应用」才生效 —— 本插件有周期守门，应用只会重载服务，不会顺手起一轮。')));

	/* 两条路不一致时必须说出来，别让人以为检的是自己刚敲的那份。
	 * 判据是实打实的集合差：编辑框里的条 vs 结果表里的条。 */
	var pend = pendingSourceEdits(src);
	if (pend.length)
		kids.push(el('p', { class: 'note warn' },
			T('编辑框里有 %d 条还没生效（结果里没有它们）：%s —— 要检它们请先「保存并应用」再点一次「检测源可用性」。')
				.format(pend.length, pend.slice(0, 3).join('、') + (pend.length > 3 ? ' …' : ''))));

	if (!src) {
		/* 还没点过检测：说清这一页是干嘛的，并给按钮 */
		kids.push(EmptyBox({
			title: T('还没有检测过'),
			detail: T('「检测源可用性」逐条实拉配置里那份社区源清单，列出 HTTP 状态、提取到的 IPv4 数量，以及其中落在 Cloudflare 官方网段内的比例。段内占比掉到 90% 以下，通常说明这个源换了内容。'),
			action: Button({
				kind: 'primary', label: T('检测源可用性'), icon: 'probe',
				onClick: actions.check
			})
		}));
		return el('div', {}, kids);
	}

	if (src.state === 'checking') {
		kids.push(EmptyBox({
			spin: true,
			title: T('正在拉取源'),
			detail: T('逐个 URL 实拉一次并比对 Cloudflare 官方网段，十来个源通常十几秒。')
		}));
		return el('div', {}, kids);
	}

	if (src.state !== 'ok') {
		kids.push(EmptyBox({
			title: T('检测没有结果'),
			detail: srcMessage(src),
			more: srcMore(src),
			action: Button({ label: T('检测源可用性'), icon: 'probe', onClick: actions.check })
		}));
		return el('div', {}, kids);
	}

	kids.push(SourceMatrix(src.rows));
	/* r70：结论常驻，anycast 与「拉不到」的完整解释挂 ⓘ */
	kids.push(el('p', { class: 'note' }, [
		T('「CF 段内」= 这个源提取出的 IPv4 里有多少落在 Cloudflare 官方网段内，是判定一个源还能不能用的关键：占比高说明它还在提供真正的 CF anycast，掉到 90% 以下通常意味着开始夹带别人自己的中转 / VPS 地址。'),
		HelpMark(T('CF anycast 指同一个 IP 在全球多个节点同时广播，你连到的自然是最近的那个。HTTP 列写「拉不到」表示这条压根没取到（连不上、被拒、超时都算，引擎内部一律记 000，那不是源返回的状态码），这一条会被跳过并记进日志。'))
	]));

	return el('div', {}, kids);
}

/* srcMessage 的完整版：与 whyMore() 同一套路（r70）—— 结论常驻，深度细节挂 ⓘ。 */
var SRC_MORE = {};
function srcMore(src) {
	return SRC_MORE[src && src.state] || '';
}

function srcMessage(src) {
	switch (src.state) {
		case 'unreachable':
			return whyNoReply(T('检测没跑成'), 'check_sources');
		case 'hung':
			SRC_MORE.hung = T('引擎这一项最坏约 12 秒（每条源 8 秒上限、13 条一批并发），比这更慢通常是这台电脑到路由器的路有问题。另外，平台侧 rpcd 的 exec 超时是 30 秒，真超了页面会报「输出读不懂」而不是这一句。');
			return T('检测没有回应：路由器 %s 秒内没返回。先确认浏览器能打开路由器其它页面（本机代理/TUN 会把到 10.0.0.0/8 的流量吞掉），再点一次「检测源可用性」；反复如此就 ssh 跑 %s check-sources 看它卡在哪条上。').format(Math.round(CMD_LIMIT['check-sources'] / 1000), CMD);
		case 'parse_error':
			return T('检测回的内容读不懂（引擎本该回一段固定格式的结果）。原文片段：%s —— 先确认装上的引擎和页面是同一版（本页右上角的版本号应与包版本一致），再点一次「检测源可用性」；仍然读不懂就 ssh 跑 %s check-sources 看它到底吐了什么。').format(String(src.raw || '').slice(0, 160), CMD);
		case 'empty':
			return T('一条源都没检出：配置里的「社区优选源 URL」是空的。在上面展开「源清单」填几条 HTTPS 地址，点页面底部「保存并应用」，再回来点「检测源可用性」。');
		default:
			return T('还没有检测结果。点上面的「检测源可用性」跑一次 —— 它只读配置文件里那份清单，不会改动任何设置。');
	}
}

/* ==========================================================================
 * 12b. 引擎日志
 * ==========================================================================
 * 日志在 /tmp/cf-ipcheck/cf-ipcheck.log（tmpfs，重启就清零），由引擎按
 * log_max_kb 封顶。页面只干两件事：把最近这一截拿出来，以及一眼能看出哪几行
 * 是坏消息。每一行都走 textContent，绝不拼 innerHTML —— 日志里会混进外部源
 * 返回的 URL 和 curl 的原文，那些都不是可以自己解析的输入。
 */
function logTone(line) {
	if (/失败|错误|中止|写不动|不是字符设备|找不到|没有 curl/.test(line))
		return 'bad';
	/* 「超过上限」是引擎在说它自己把旧日志截了，属于提醒不是故障 */
	if (/已请求停止|被丢弃|已忽略|低于下限|超过上限|跳过/.test(line))
		return 'warn';
	return '';
}

/* 引擎每行都以 `2026-10-14T05:16:29+0800 ` 开头（r25 起是路由器本地时间 + 偏移）。
 * 整串贴在每条前面既占地方又难扫读，所以显示时拆成两段：
 *   - 今天 → `05:16:29`；昨天 → `昨天 05:16:29`；今年更早 → `10-13 05:16:29`；跨年 → 带年份
 *   - 原始那一串完整留在 title 里（悬停可见），一行信息都不丢
 * 只解析、不换算时区：日志串本身已经是路由器本地时间，再过一遍 Date 的本地化
 * 反而会把电脑不在 +0800 时的显示搞成另一种时刻（title 里给的是原始串，可核对）。 */
var LOG_TS_RE = /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2}):(\d{2})([+-]\d{2}):?(\d{2})/;

function logStamp(ln, full) {
	var m = LOG_TS_RE.exec(ln);
	if (!m)
		return null;
	var pad = function (n) { return n < 10 ? '0' + n : String(n); };
	var now = new Date();
	var ymd = m[1] + '-' + m[2] + '-' + m[3];
	var hmss = m[4] + ':' + m[5] + ':' + m[6];
	/* 「完整时刻」那一档：整行原样给出（2026-10-16T04:28:44+0800），不再靠悬浮。
	 * 悬浮这条路径在手机上等于没有 —— 这一列本来就是给人核对"到底几点"的。 */
	if (full)
		return { shown: ln.slice(0, m[0].length), title: ln.slice(0, m[0].length), rest: ln.slice(m[0].length).replace(/^[ \t]+/, '') };
	var today = now.getFullYear() + '-' + pad(now.getMonth() + 1) + '-' + pad(now.getDate());
	var yd = new Date(now.getTime() - 86400000);
	var yesterday = yd.getFullYear() + '-' + pad(yd.getMonth() + 1) + '-' + pad(yd.getDate());
	var shown;
	if (ymd === today)
		shown = hmss;
	else if (ymd === yesterday)
		shown = T('昨天') + ' ' + hmss;
	else if (m[1] === String(now.getFullYear()))
		shown = m[2] + '-' + m[3] + ' ' + hmss;
	else
		shown = ymd + ' ' + hmss;
	/* 悬停里给原始串 + 距今多久。距今只在重画时算一次，所以不会每秒自己跳
	 * （logsKeyOf 只在内容变化时重画，这是刻意的：常跳动的相对时间会晃眼）。 */
	var title = ln.slice(0, m[0].length);
	var ts = Date.parse(ymd + 'T' + hmss + m[7] + ':' + m[8]);
	if (isFinite(ts)) {
		var mins = Math.floor((now.getTime() - ts) / 60000);
		if (mins < 0)
			mins = 0;
		title += ' · ' + (mins < 1 ? T('刚刚') :
			(mins < 60 ? T('%d 分钟前').format(mins) :
				(mins < 1440 ? T('%d 小时前').format(Math.floor(mins / 60)) :
					T('%d 天前').format(Math.floor(mins / 1440)))));
	}
	return { shown: shown, title: title, rest: ln.slice(m[0].length).replace(/^[ \t]+/, '') };
}

function LogBlock(text, full) {
	var lines = String(text).split('\n');
	while (lines.length && !lines[lines.length - 1])
		lines.pop();
	/* 最新在最上面（r45）：日志是"刚才发生了什么"，一屏里最该先看到的是最后一行，
	 * 原来那种"读完要滚到底"的顺序每次都得先跳到底部。复制按钮那份仍是时间先后。 */
	var out = [];
	for (var i = lines.length - 1; i >= 0; i--)
		out.push(lines[i]);
	return el('div', { class: 'logbox', role: 'log', 'aria-live': 'off' },
		out.map(function (ln) {
			var t = logTone(ln);
			var st = logStamp(ln, full);
			if (!st)
				return el('div', { class: t ? 'lline ' + t : 'lline', text: ln });
			return el('div', { class: t ? 'lline ' + t : 'lline' }, [
				el('span', { class: 'lts', title: st.title, text: st.shown }),
				el('span', { class: 'lmsg', text: st.rest })
			]);
		}));
}

function logMessage(lg) {
	switch (lg.state) {
		case 'unreachable':
			return whyNoReply(T('读不到日志'), 'logs');
		case 'hung':
			return T('读取没有回应：路由器在 %s 秒内没返回。先确认这台电脑能正常打开路由器后台。').format(Math.round(CMD_LIMIT.logs / 1000));
		case 'empty':
			return T('日志文件还是空的。引擎每轮开始就会往里写（取源、候选池、达标数、吞吐），跑一轮再回来看看。');
		default:
			return T('没有可显示的日志。日志存在路由器的内存盘里，重启就清零 —— 先点「立即测速」跑一轮，或点「刷新」再试一次。');
	}
}

/* 滚动锚点：记住"眼前第一行是哪一行 + 已经往下滚进它多少像素"。
 * 用文本认行而不是用行号 —— 日志每次都是整块重画，行号会变，而文本在
 * 这一截里足够区分（同一秒同一句的重复行概率极低，真撞上了也只是偏一行）。
 * 拿不到 offsetTop（老浏览器/桩件环境）就返回 null，让调用方退回旧补偿。 */
function logAnchor(box) {
	if (!box || !box.querySelectorAll)
		return null;
	var lines = box.querySelectorAll('.lline');
	if (!lines || !lines.length)
		return null;
	var top = box.scrollTop || 0;
	for (var i = 0; i < lines.length; i++) {
		var el2 = lines[i];
		var ot = el2.offsetTop;
		var oh = el2.offsetHeight;
		if (typeof ot !== 'number' || typeof oh !== 'number' || !isFinite(ot) || !isFinite(oh))
			return null;
		if (ot + oh > top + 4)
			return { text: (el2.textContent || '').trim(), into: top - ot };
	}
	return null;
}

/* 在新容器里找回锚那一行，返回应当设的 scrollTop；找不到给 null */
function logAnchorTop(box, anchor) {
	if (!box || !box.querySelectorAll || !anchor || !anchor.text)
		return null;
	var lines = box.querySelectorAll('.lline');
	if (!lines || !lines.length)
		return null;
	for (var i = 0; i < lines.length; i++) {
		if ((lines[i].textContent || '').trim() !== anchor.text)
			continue;
		var ot = lines[i].offsetTop;
		if (typeof ot !== 'number' || !isFinite(ot))
			return null;
		var v = ot + anchor.into;
		return v < 0 ? 0 : v;
	}
	return null;
}

function LogsPane(lg, actions) {
	var kids = [];
	var busy = store.get().busy && store.get().busy.logs;

	kids.push(Section(T('引擎日志'), Button({
		label: lg ? T('刷新') : T('读取日志'), icon: 'refresh',
		disabled: busy, busy: busy,
		onClick: actions.refresh
	})));

	if (!lg) {
		/* 页面一打开就自己发起了一次读取，所以这里绝大多数情况是「正在读」那一支；
		 * 只有 rpc 一次都没成功过（或链路整个不通）才会停在引导态 */
		if (busy) {
			kids.push(EmptyBox({
				spin: true,
				title: T('正在读取日志'),
				detail: T('引擎在 /tmp/cf-ipcheck/cf-ipcheck.log 里的过程记录，取最近这一段。')
			}));
		} else {
			kids.push(EmptyBox({
				title: T('还没读到日志'),
				detail: T('这里显示引擎自己写的过程记录：逐条源取到什么、候选池多大、哪些 IP 达标、吞吐实测结果，以及每一轮的失败原因。日志写在路由器的 /tmp/cf-ipcheck/cf-ipcheck.log 里，那是内存盘，重启就清零。'),
				action: Button({
					kind: 'primary', label: T('读取日志'), icon: 'refresh',
					onClick: actions.refresh
				})
			}));
		}
		return el('div', {}, kids);
	}

	if (lg.state !== 'ok') {
		var titles = {
			empty: T('还没有日志'),
			hung: T('读取日志没有回应'),
			unreachable: T('读不到日志')
		};
		kids.push(EmptyBox({
			title: titles[lg.state] || titles.unreachable,
			detail: logMessage(lg),
			action: Button({ label: T('刷新'), icon: 'refresh', onClick: actions.refresh })
		}));
		return el('div', {}, kids);
	}

	var full = !!(store.get() && store.get().logFull);
	kids.push(LogBlock(lg.text, full));
	kids.push(el('div', { class: 'note' }, [
		el('span', { text: full
			? T('最新的在最上面。行首现在是完整原始时间戳（路由器自己的本地时间并带时区偏移，国内是 +0800，不是 UTC）。只给最近这一段（最多约 60 KB）；日志总量按「配置 → 基本设置 → 日志体积上限」封顶，超限会丢掉较早的内容并在这里留一行说明。要切回只显示时刻，点旁边那个「只看时刻」。')
			: T('最新的在最上面。行首时间只显示时刻（今天的显示 HH:MM:SS，昨天与更早带上日期），鼠标停在上面能看到原始时间戳与距今多久 —— 手机上悬浮不出来，就用旁边那个「显示完整时刻」。只给最近这一段（最多约 60 KB）；日志总量按「配置 → 基本设置 → 日志体积上限」封顶，超限会丢掉较早的内容并在这里留一行说明。') }),
		Button({ kind: 'lnk', label: full ? T('只看时刻') : T('显示完整时刻'), title: T('行首时间在「只有时刻」和「完整原始时间戳（带时区）」之间切换。按钮上的字说的是点下去之后会变成什么。'), onClick: actions.full }),
		Button({ kind: 'lnk', label: T('复制全部'), title: T('按时间先后复制原始日志（与页面上的倒序显示相反），方便直接粘给别人看。'), onClick: actions.copy })
	]));
	return el('div', {}, kids);
}

/* ==========================================================================
 * 13. 标签栏
 * ==========================================================================
 * 三个面板一直在文档里（隐藏的只是 display），切换只改 class / aria。
 * 这一条是刻意的：状态变了要靠订阅者重画，若面板被拆掉重建，隐藏时发生的变化
 * 就得在切换时补画一遍，容易漏。留在文档里则「隐藏期间发生的变化」在切回来时
 * 已经是新的了 —— 订阅是幂等的。
 */
var TAB_KEY = 'cf-ipcheck.tab';

function TabBar(defs, current, onPick) {
	var bar = el('div', { class: 'tabs', role: 'tablist' });
	defs.forEach(function (d, i) {
		var kids = [ el('span', { text: d.label }) ];
		if (d.count != null && d.count !== '') {
			/* 小圆点里那个数字，光看"榜单 10"不知道 10 是什么 —— 眼睛能靠上下文猜
			 * （下面读数条就写着「榜单 / 10 / 按 TTFB 排序保留的条数」），读屏器没有这个
			 * 上下文，它听到的只是"榜单 10"。所以图形那份藏起来（aria-hidden），
			 * 另外补一段只有读屏器读得到的话。用内容而不是 aria-label：
			 * 贴 aria-label 会把可见名整个盖掉，语音控制的人喊"榜单"就可能对不上。 */
			kids.push(el('span', { class: 'tab-n n', 'aria-hidden': 'true', text: String(d.count) }));
			kids.push(el('span', { class: 'sr-only', text: T('，%s 条结果').format(String(d.count)) }));
		}
		var on = d.id === current;
		var b = el('button', {
			class: 'tab' + (on ? ' on' : ''),
			type: 'button',
			/* tabpanel 靠这两条和标签配对；面板那边也各有一个 id。 */
			id: 'cfp-tab-' + d.id,
			'aria-controls': 'cfp-pane-' + d.id,
			role: 'tab',
			'aria-selected': on ? 'true' : 'false',
			tabindex: on ? '0' : '-1',
			on: {
				click: function () { onPick(d.id); },
				/* 左右方向键在标签间走（tablist 的标准交互）。
				 * Home/End 跳首尾，跟 ARIA 惯例一致。 */
				keydown: function (ev) {
					var n = null;
					if (ev.key === 'ArrowRight')
						n = (i + 1) % defs.length;
					else if (ev.key === 'ArrowLeft')
						n = (i + defs.length - 1) % defs.length;
					else if (ev.key === 'Home')
						n = 0;
					else if (ev.key === 'End')
						n = defs.length - 1;
					if (n == null)
						return;
					ev.preventDefault();
					onPick(defs[n].id);
					var nb = bar.children[n];
					if (nb && nb.focus)
						nb.focus();
				}
			}
		}, kids);
		bar.appendChild(b);
	});
	if (onPick)
		bar.setAttribute('data-current', current);
	return bar;
}

function savedTab() {
	try {
		return window.localStorage.getItem(TAB_KEY);
	} catch (e) {
		return null;
	}
}

function rememberTab(id) {
	try {
		window.localStorage.setItem(TAB_KEY, id);
	} catch (e) {}
}

/* ---- 当前标签写进 URL 的片段（N5）----
 * 为什么用 location.hash 而不是查询串：装机实测过两件事 ——
 *   1) luci.js 里 0 处引用 location.hash、也没有 hashchange/popstate 监听，
 *      dispatcher 只看 pathname，所以这一段不与路由打架；写进去不触发导航、
 *      刷新也不会被改写；
 *   2) 表单脏了（有未应用更改、window.onbeforeunload 是 LuCI 挂着的）之后再写
 *      hash，不弹"离开页面"确认、不产生 dialog、页面照常 —— 因为改片段不是
 *      一次文档卸载。
 * 用 replaceState 而不是直接赋值：赋值会在浏览器历史里每切一个标签留一条记录，
 * 用户按"后退"会在四个标签间来回走半天退不出页面；replaceState 只把地址
 * 变成"当前这一屏"，分享/收藏/刷新都能回到同一个面板。
 * 老引擎没有 history.replaceState 时退回赋值（能用，只是会留历史）。 */
function hashTab() {
	var m = /^#cf-tab=([a-z]+)/.exec(String(window.location.hash || ''));
	if (!m)
		return null;
	for (var i = 0; i < TAB_DEFS.length; i++)
		if (TAB_DEFS[i].id === m[1])
			return m[1];
	return null;
}

function writeHashTab(id) {
	var want = '#cf-tab=' + id;
	if (String(window.location.hash || '') === want)
		return;
	try {
		if (window.history && window.history.replaceState)
			window.history.replaceState(null, '', want);
		else
			window.location.hash = want;
	} catch (e) {
		/* 隐私模式或 file: 之类受限环境下 replaceState 会抛 —— 少一段地址不算事 */
	}
}

function watchHash() {
	var on = function () {
		var id = hashTab();
		/* 只有"外部改的、而且和眼前这个不同"才跟着走。自己写的那一次因为
		 * writeHashTab 先比过相等，不会重复；后退/手改地址栏则走这里。 */
		if (id && id !== store.get().tab)
			goto(id, true);
	};
	try {
		window.addEventListener('hashchange', on);
	} catch (e) {
		return null;
	}
	return function () {
		try {
			window.removeEventListener('hashchange', on);
		} catch (e2) {}
	};
}

/* ==========================================================================
 * 14. 参数分组（配置页）
 * ==========================================================================
 * 引擎的 30 个 uci 选项按「你此刻想改什么」分成四组，而不是按代码顺序平铺。
 * 分组与折叠都只影响呈现：字段本身仍然是同一张 Map 里的同一批 option，
 * 保存链路完全不变。
 */
var GROUPS = [
	{ id: 'basic',  title: '基本设置',   hint: '开关、周期与日志' },
	{ id: 'pool',   title: '候选池来源', hint: '候选从哪来；源清单在「源与检测」页编辑' },
	{ id: 'probe',  title: '测速与判定', hint: '阈值与吞吐' },
	{ id: 'gist',   title: 'Gist 上传',  hint: '结果外发' }
];

var GROUP_OPTIONS = {
	basic: [ 'enabled', 'interval_hours', 'probe_domains', 'probe_port', 'log_max_kb' ],
	pool:  [ 'use_official_ranges', 'reuse_last' ],
	probe: [ 'candidate_budget', 'concurrency', 'probe_timeout', 'ttfb_limit', 'total_limit',
	         'keep_count', 'speed_probe', 'speed_count', 'speed_bytes', 'speed_timeout',
	         'speed_domain', 'colo_probe', 'colo_domain', 'canary_check', 'probe_user', 'annotate' ],
	gist:  [ 'upload_gist', 'gist_id', 'gist_file', 'gist_token', 'token_file' ]
};

/* 注：community_sources 不在上面任何一组 —— 它根本不在配置页那张 Map 里声明，
 * 而是由 sourcesMap() 单开一张 Map 渲染到「源与检测」页（见 6b 的真机取证注释）。 */

var GROUPS_KEY = 'cf-ipcheck.groups.';

/* 把 LuCI 渲染好的表单按 option 归组：读每个 .cbi-value 里 label 的 for 属性
 * （形如 cbid.cf_ipcheck.<section>.<option>），取末段拿到 option 名。
 * 表单结构是 form.js 生成的，这里只搬运、不重建 —— 重建会丢事件绑定与校验。 */
function regroupForm(mapnode) {
	if (!mapnode || !mapnode.querySelector)
		return null;
	var rows = Array.prototype.slice.call(mapnode.querySelectorAll('.cbi-value'));
	if (!rows.length)
		return null;

	var byOption = {};
	rows.forEach(function (row) {
		var lab = row.querySelector('label[for]');
		if (!lab)
			return;
		var key = String(lab.htmlFor || '').split('.').pop();
		if (key)
			byOption[key] = row;
	});

	/* form.js 生成的那几个 <section>：字段搬空之后要整体摘掉，否则配置页会留下
	 * 一串空标题。先记下来，最后统一处理。 */
	var secs = Array.prototype.slice.call(mapnode.querySelectorAll('.cbi-section'));
	var used = [];
	var groups = [];

	GROUPS.forEach(function (g) {
		var held = [];
		GROUP_OPTIONS[g.id].forEach(function (opt) {
			var row = byOption[opt];
			if (!row)
				return;
			/* 往上找到它属于哪个 section 的 node 容器再摘，避免跨节搬运 */
			held.push(row);
		});
		groups.push({ def: g, rows: held });
	});

	/* 把行按组搬进新容器；原本的 section 壳子在全部搬完后统一移除 */
	var wrap = el('div', { class: 'grps' });
	var leftovers = [];

	groups.forEach(function (g) {
		var openKey = GROUPS_KEY + g.def.id;
		var open = true;
		try {
			var saved = window.localStorage.getItem(openKey);
			if (saved != null)
				open = saved === '1';
		} catch (e) {}
		/* 「测速与判定」字段最多，默认收起；其余默认展开 */
		if (g.def.id === 'probe' && (function () {
			try { return window.localStorage.getItem(openKey) == null; } catch (e2) { return true; }
		})())
			open = false;

		var body = el('div', { class: 'grp-b' });
		g.rows.forEach(function (r) {
			body.appendChild(r);
			used.push(r);
		});
		if (!g.rows.length)
			return;

		var head = el('div', {
			class: 'grp-h',
			tabindex: '0',
			role: 'button',
			'aria-expanded': open ? 'true' : 'false'
		}, [
			el('i', { class: 'chev' }),
			el('span', { class: 'grp-t', text: T(g.def.title) }),
			el('span', { class: 'grp-x', text: T(g.def.hint) })
		]);

		var box = el('div', { class: 'grp' + (open ? ' open' : '') }, [ head, body ]);

		function apply(v) {
			box.className = 'grp' + (v ? ' open' : '');
			head.setAttribute('aria-expanded', v ? 'true' : 'false');
			try { window.localStorage.setItem(openKey, v ? '1' : '0'); } catch (e3) {}
		}
		head.addEventListener('click', function () {
			apply(!(box.className.indexOf('open') >= 0));
		});
		head.addEventListener('keydown', function (ev) {
			if (ev.key === 'Enter' || ev.key === ' ' || ev.key === 'Spacebar') {
				ev.preventDefault();
				apply(!(box.className.indexOf('open') >= 0));
			}
		});

		box.setAttribute('data-group', g.def.id);
		/* 把开合函数交给调用方收集，给顶部「全部展开 / 收起」用 */
		box.__apply = apply;
		wrap.appendChild(box);
	});

	/* 认不出归属的行（以后加了新 option 就会落到这里）单独兜一组，
	 * 保证「一个字段都不会因为重组而消失」。 */
	rows.forEach(function (r) {
		if (used.indexOf(r) < 0)
			leftovers.push(r);
	});
	if (leftovers.length) {
		var lb = el('div', { class: 'grp-b' });
		leftovers.forEach(function (r) { lb.appendChild(r); });
		/* 这一组以前既没有 tabindex/role，也没交 __apply —— 于是顶部
		 * 「全部展开 / 收起」从来不管它，键盘也进不去。现在和其他组一样对待。 */
		var lhead = el('div', { class: 'grp-h', tabindex: '0', role: 'button', 'aria-expanded': 'true' }, [
			el('i', { class: 'chev' }),
			el('span', { class: 'grp-t', text: T('其它') }),
			el('span', { class: 'grp-x', text: T('未归类字段') })
		]);
		var lbox = el('div', { class: 'grp open' }, [ lhead, lb ]);
		function lapply(v) {
			lbox.className = 'grp' + (v ? ' open' : '');
			lhead.setAttribute('aria-expanded', v ? 'true' : 'false');
		}
		lbox.__apply = lapply;
		lhead.addEventListener('click', function () { lapply(!(lbox.className.indexOf('open') >= 0)); });
		lhead.addEventListener('keydown', function (ev) {
			if (ev.key === 'Enter' || ev.key === ' ' || ev.key === 'Spacebar') {
				ev.preventDefault();
				lapply(!(lbox.className.indexOf('open') >= 0));
			}
		});
		wrap.appendChild(lbox);
	}

	/* 搬空之后把 form.js 留下的壳子收拾干净。
	 * 这一段以前写的是"在 .cfp 里的就跳过" —— 可我们所有 section 本来就在 .cfp 里，
	 * 条件恒真，等于这段从来没跑过：装机量到配置页顶上一直挂着 H2 54px + 描述 20px +
	 * 四个 section 各 51px = **278px 死空档**，而且四个组名还在下面的折叠组里又重复一遍。
	 * 现在只摘"搬家后剩下的那行标题"，section 节点本身留着 —— LuCI 的段级校验信息
	 * （.cbi-section-error）要往那儿挂，连壳一起删会把报错删掉（宁可留一个 0 高的容器）。 */
	secs.forEach(function (s) {
		if (!s.querySelector || s.querySelector('.cbi-value'))
			return;
		var h = s.querySelector('h3');
		if (h && h.parentNode === s)
			s.removeChild(h);
	});

	/* Map 自己的标题与描述也摘掉：这一屏已经有自己的小标题行（.sec-t「参数」）和下面
	 * 那行说明，再挂一个 h2 就是给同一屏起两个名字（「实测参数」和「参数」）。
	 * 那句描述不丢 —— 并进我们那行说明的开头，读一遍就够。
	 * 只动这张 map 的直接子节点：源页那张 Map 的 .cbi-map-descr 是有用的，不在这儿。 */
	Array.prototype.slice.call(mapnode.children || []).forEach(function (n) {
		if (n.tagName === 'H2' || String(n.className || '').indexOf('cbi-map-descr') >= 0)
			mapnode.removeChild(n);
	});

	/* 字段都搬到位之后，再把完整解释贴成 ⓘ。顺序不能反：
	 * applyHelp 依赖 label[for] 在最终位置上，先贴会被搬家带走。 */
	applyHelp(wrap);

	/* 落点必须还在 map 节点【里面】：map 靠这棵子树采字段值，把它搬出去就等于
	 * 「改了任何一项都提示没有待应用的更改」，页面上存不下任何配置。
	 * （r18 重写时把这一步交给调用方做，调用方 clear 掉了宿主节点 —— r25 才发现。） */
	if (mapnode.appendChild)
		mapnode.appendChild(wrap);
	return wrap;
}

/* ==========================================================================
 * 6b. 源清单的编辑：一张【只装这一项的 Map】挂在「源与检测」页里
 * ==========================================================================
 * r41 第一版是把配置页那张 Map 里渲染好的 .cbi-value 整行搬来 —— 真机证明这条路不通：
 * 搬过来那一行里的 DynamicList 是空的（items=0），点保存时 uci.set 的请求体里
 * 根本没有 community_sources（r41 真机抓包：4 条 ubus 请求，uci.set 的 values 只有
 * enabled/use_official_ranges/… 那些，加进去的探针 URL 没进去，delta 里也查不到）。
 * 原因是 CBI 的 option 把自己渲染到哪棵子树记在内部，行被搬走之后 LuCI 后续填值
 * 的对象已经不是页上这一颗了 —— 于是"看得见、存不进"。
 * 现在改成正经做法：给这一项单开一张 form.Map（同一份 uci config、同一个 section），
 * 由它自己渲染、自己采值；我们只搬【整张 map 节点】进源页的宿主，而"搬整张 map
 * 节点不坏存值"这条是 r26 真机 A/B 验过的（配置页那张 map 本身也是搬进面板宿主的）。
 * 全文只有这一份 DynamicList，不可能出现两个出处。
 *
 * r43 再定一件事：这一页的【检测按钮不写配置】。理由是真机量出来的 ——
 * LuCI 的 Map.save() → rpcd 的 uci.set 把改动留在 rpcd 进程内存里（页面自己 uci.get
 * 读得到，CLI 读不到、/tmp/.uci 0 行、配置文件 md5 不变），而引擎是独立进程，
 * 只看配置文件 + 文件 delta。所以"顺手保存再检测"检到的一定是旧清单。
 * 提交路径就是页面底部那颗标准的「保存并应用」（apply 才落盘）；两条路不一致时
 * 由 pendingSourceEdits() 明说哪几条还没生效。
 */
var SRC_EDIT_OPEN_KEY = GROUPS_KEY + 'srcedit';

/* 源清单专用表单：一张 map、一个匿名 section、一条 DynamicList。 */
function sourcesMap() {
	var ms = new form.Map('cf_ipcheck', null, null);
	var s = ms.section(form.TypedSection, 'global', null);
	s.anonymous = true;
	var o = s.option(form.DynamicList, 'community_sources', _('社区优选源 URL'), _('每行一个 HTTPS 文本地址；改完点页面底部「保存并应用」。'));
	o.description = help('community_sources',
		_('每行一个 HTTPS 文本地址；改完点页面底部「保存并应用」。'),
		_('这些地址返回纯文本，里面夹着一堆 IPv4；引擎逐行提取、去重后进候选池。没有格式要求，只要 IP 出现在文本里就行（HTML 注释、Markdown、纯列表都能读）。改完必须点页面底部的「保存并应用」才会写进配置文件 —— 只有写进配置文件，引擎和这一页的检测才看得见（LuCI 的「保存」把改动留在 rpcd 进程内存里，引擎读不到，这一条是真机量出来的）。要确认某个源还在不在提供真正的 CF 地址，就点下面的检测看它的「段内占比」—— 掉到 90% 以下通常说明它换了内容。'));
	return ms;
}

/* 把渲染好的源表单塞进可折叠宿主（宿主在源面板里、不参与每拍重画，
 * 否则输入框会在用户按下与松开之间被换掉 = 打字丢字 + 吞真实点击，见 r29）。 */
function mountSourcesForm(mapnode, srcEdit) {
	if (!mapnode || !srcEdit || !srcEdit.appendChild)
		return null;
	clear(srcEdit);
	var openKey = SRC_EDIT_OPEN_KEY;
	var open = false;
	try {
		open = window.localStorage.getItem(openKey) === '1';
	} catch (e) {}

	var body = el('div', { class: 'grp-b' }, [ mapnode ]);
	var head = el('div', {
		class: 'grp-h', tabindex: '0', role: 'button',
		'aria-expanded': open ? 'true' : 'false'
	}, [
		el('i', { class: 'chev' }),
		el('span', { class: 'grp-t', text: T('源清单') }),
		el('span', { class: 'grp-x', text: T('每行一个 HTTPS 地址；改完点页面底部「保存并应用」才生效') })
	]);
	var box = el('div', { class: 'grp src-edit' + (open ? ' open' : '') }, [ head, body ]);

	function apply(v) {
		box.className = 'grp src-edit' + (v ? ' open' : '');
		head.setAttribute('aria-expanded', v ? 'true' : 'false');
		try { window.localStorage.setItem(openKey, v ? '1' : '0'); } catch (e2) {}
	}
	/* 交给调用方（和配置页的组同一个约定），桩测与以后的「全部展开」都按这个口调 */
	box.__apply = apply;
	head.addEventListener('click', function () { apply(!(box.className.indexOf('open') >= 0)); });
	head.addEventListener('keydown', function (ev) {
		if (ev.key === 'Enter' || ev.key === ' ' || ev.key === 'Spacebar') {
			ev.preventDefault();
			apply(!(box.className.indexOf('open') >= 0));
		}
	});
	srcEdit.appendChild(box);
	/* 完整解释贴成 ⓘ：这一步必须在节点就位之后（applyHelp 按 label[for] 认字段） */
	applyHelp(srcEdit);
	return box;
}

/* 配置面板外壳：说明 + 全部展开/收起 + 表单本体（异步由 Map 渲染好后塞进来） */
function ConfigPane() {
	var btnAll = Button({ kind: 'lnk', label: T('全部展开') });
	var btnNone = Button({ kind: 'lnk', label: T('全部收起') });
	var host = el('div', { class: 'grps-host' });

	function each(fn) {
		var boxes = host.querySelectorAll ? host.querySelectorAll('.grp') : [];
		Array.prototype.forEach.call(boxes, function (b) {
			if (b.__apply)
				fn(b.__apply);
		});
	}
	btnAll.onclick = function () { each(function (f) { f(true); }); };
	btnNone.onclick = function () { each(function (f) { f(false); }); };

	return {
		node: el('div', {}, [
			el('p', { class: 'note', style: { marginBottom: 'var(--s3)' } },
				T('用带真实 SNI（握手时就把你要访问的域名说出去）的 HTTPS 探测实测；改动保存后下一轮生效，判定口径见「榜单」页说明。')),
			Section(T('参数')),
			el('div', { class: 'grps-bar' }, [
				btnAll, el('span', { class: 'sep', text: '·' }), btnNone
			]),
			host
		]),
		host: host
	};
}

/* ==========================================================================
 * 15. 动作 —— 按钮点下去之后发生什么
 * ==========================================================================
 * 每个动作只做两件事：调引擎、把结果写回 store。DOM 的事一概不碰
 * （重画由订阅者负责），所以同一个动作从状态条、空态、面板里点效果完全一致。
 */
var inflight = null;

/* 轮询交给官方的 L.poll（luci.js 里的单例）：
 * 它用**一个**全局 1 秒步进器按各自的秒数派活，并且给每个登记项配了重入守卫
 * （上一回 promise 没落地就不会再调它），还跟框架的暂停/恢复打通 —— 弹出
 * 「应用设置」那个对话框期间框架会 poll.stop()，我们自写 setInterval 时是照打的。
 * 早先这里是自己 setInterval + 一个模块级 poller，行为等价但属于重复造轮子。 */
var pollOn = false;
var pollSec = 0;

/* 一次读不到不等于路由器死了。下面这组数决定「读不到」时页面怎么办：
 * 保住上一帧读数、放慢节奏继续轮询，连着失败到 FAIL_GIVEUP 才承认「没有回应」。
 * 为什么不能一次就翻脸：r32 及之前，一次 status 超时会把 store.status 覆盖成
 * unreachable 并顺手 stopPoll —— 榜单被抹成白板、整页只剩「路由器没有回应」、
 * 此后不再轮询，非按 F5 不可；而引擎那一轮其实好端端在跑（真机抓到的现象）。
 * 引擎侧无辜：整轮 92 次采样里 status 最慢 0.48 秒（probe 阶段 8 个并发 curl 时），
 * 会超过 8 秒上限的是这台电脑到路由器的那段路（本机代理/TUN 接管、无线抖动）。 */
var pollFail = 0;
var lastGoodAt = 0;
var POLL_SEC = 3;
var POLL_SLOW_SEC = 10;
var FAIL_STALE = 2;	/* 连着 2 次没读到：挂「读数滞留」横幅，节奏放慢 */
var FAIL_GIVEUP = 4;	/* 连着 4 次没读到（约一分钟）：才说「路由器没有回应」 */

/* L.poll 的间隔单位是**秒**，且同一个函数身份重复 add 会被忽略，
 * 所以改节奏必须 remove 再 add。 */
function pollGapSec() {
	return pollFail >= FAIL_STALE ? POLL_SLOW_SEC : POLL_SEC;
}

/* 没读到时的状态怎么算。返回的永远是「上一帧读数 + 一句老实话」，
 * 绝不返回一个把榜单抹空的空壳 —— 除非手上本来就没东西可保。
 * gaveUp 之后 staleFor 归零且不再变，指纹就不会一直变、面板不会反复重建
 * （重建会换掉「刷新」按钮节点，真实鼠标的点击有概率被吞掉）。 */
function afterMiss(prev, hung, manual) {
	/* 用户亲手点一次「刷新」失败不该往「连着几次没读到」里记账：
	 * 那是人在试探，不是链路在抖。不分开的话，多点四下就自己判了认输。 */
	if (!manual)
		pollFail++;
	var worth = prev.state === 'running' || !!(prev.items && prev.items.length);
	if (!worth || pollFail >= FAIL_GIVEUP) {
		if (worth)
			flash(T('读取状态没有回应'),
				T('连着 %s 次都没等到路由器返回。最后一次读到的榜单还在下面，页面每 %s 秒仍会自动重试一次，恢复了会自己跟上。').format(pollFail, POLL_SLOW_SEC),
				'bad', 1);
		return Object.assign({}, prev, {
			state: 'unreachable',
			reason: hung ? 'hung' : null,
			staleFor: null,
			gaveUp: 1
		});
	}
	if (pollFail >= FAIL_STALE) {
		var secs = lastGoodAt ? Math.max(1, Math.round((Date.now() - lastGoodAt) / 1000)) : 1;
		flash(T('读取状态没有回应'),
			T('页面停在 %s 秒前的读数上，后台继续重试，不用刷新页面。').format(secs), 'warn', 1);
		return Object.assign({}, prev, { staleFor: secs });
	}
	/* 只丢了一拍：什么都不改，也不弹提示（下一拍大概率就回来了，弹一句反而吓人） */
	return Object.assign({}, prev);
}

/* 刷新状态：同一时刻只留一个 status 请求在飞，后来的共享它的结果。
 * 两次刷新叠在一起本身不会出错（写 store 是幂等的），但会把 ubus 请求翻倍。
 * 共享的前提是 inflight 一定会复位 —— runCmd 现在保证 settle（成功/被拒/超时三态），
 * 不会再出现一次 rpc 永不返回、之后所有刷新都拿到同一个死 promise 的情况。 */
function refresh(manual) {
	if (inflight)
		return inflight;
	var wasRunning = (store.get().status || {}).state === 'running';
	/* busy.refresh 只在**用户亲手点刷新**时置。轮询每一拍都翻它的话，
	 * railKeyOf 里的 !!busy.refresh 会让读数条每拍重建两次 —— 重建换掉按钮节点，
	 * 而 mousedown/mouseup 落在两颗节点上 Chromium 就不合成 click（r29 立的规矩）。
	 * 真机打标实测过：轮询中每 2 秒采一次，按钮/灯/日志框十次里全都不是同一颗。 */
	if (manual)
		store.set({ busy: Object.assign({}, store.get().busy, { refresh: true }) });
	/* 上限按「我们是否还在等这一轮」给，不按本地状态：认输之后本地状态被写成
	 * unreachable，若因此退回 8 秒上限，慢链路上就会一直判超时（自我强化）。 */
	inflight = runCmd([ 'status' ], (wasRunning || pollOn) ? CMD_LIMIT.status_running : 0).then(function (out) {
		inflight = null;
		var busy = Object.assign({}, store.get().busy, { refresh: false });
		if (out === HUNG || out === null || out === undefined) {
			/* 这里重新读一次 store 而不是用发请求前那份：等返回的这几秒里
			 * actRun 可能已经把本地状态置成 running 了，用旧的会把它盖回去。 */
			var miss = afterMiss(store.get().status || {}, out === HUNG, !!manual);
			store.set({ status: miss, busy: busy });
			/* 关键：不停轮询。慢节奏心跳让页面在路由器恢复后自己跟上，
			 * 而不是停在错误态等人按 F5。 */
			startPoll();
			return miss;
		}
		pollFail = 0;
		lastGoodAt = Date.now();
		var st = parseStatus(out);
		store.set({ status: st, busy: busy });
		if (st.state === 'running')
			startPoll();
		else
			stopPoll();
		return st;
	}, function () {
		inflight = null;
		store.set({ busy: Object.assign({}, store.get().busy, { refresh: false }) });
		return store.get().status;
	});
	return inflight;
}

function stopPoll() {
	if (!pollOn)
		return;
	pollOn = false;
	pollSec = 0;
	poll.remove(pollTick);
}

/* 测速进行中每 3 秒拉一次；读不到就放慢到 10 秒，读到真结果后自己停。
 * 为什么从 5 秒收到 3 秒：一轮实测约 140 秒（取源 45 / 探测 52 / 机房+吞吐 44），
 * 5 秒只能跳 28 下，进度条看着像卡住；一次 status 只是读文件加两次 fork，代价可忽略。 */
function pollTick() {
	/* L.poll 是 `e.r = false; Promise.resolve(fn()).finally(...)` —— 抛在返回之前
	 * 就永远没有 finally，这一项从此不再被调用，而我们的 pollOn 还是 true，
	 * startPoll 会早退不重登记：表现就是页面再也不刷新（r32 那个症状的另一种成因）。 */
	try {
	/* 测速期间把日志也一起带上：这一轮正在进行到哪一步，不该要人点一下才看到。
	 * 轮询的生死全交给 refresh() 判：这里绝不能再「看到不是 running 就停机」——
	 * 一次读不到就把心跳掐死，页面就永远回不来了（r32 的病根之一）。 */
	logsRefresh();
	/* 顺手复查一次明暗：改系统偏好或主题模式时 Argon 会当场换色，
	 * 我们得跟着换，不然就出现「整站变暗、这块还亮着」。 */
	applyScheme(P.root);
	/* 必须把 refresh 的 promise 交回去：L.poll 的重入守卫是
	 * `Promise.resolve(fn()).finally(...)` 判的，返回 undefined 就等于让那个守卫
	 * 空转 —— 它以为这一拍瞬间就完成了，下一照发，慢响应时请求会叠起来。 */
		return refresh();
	} catch (e) {
		return Promise.resolve();
	}
}

function startPoll() {
	var want = pollGapSec();
	if (pollOn && want === pollSec)
		return;	/* 已经是这个节奏，别动登记 */
	if (pollOn)
		poll.remove(pollTick);
	poll.add(pollTick, want);
	/* 必须显式 start：luci.js 的 add() 只在「已经起过表又停了」的情况下才顺手起，
	 * 首次登记时 this.tick 还是 undefined，它就只是把条目塞进队列 —— 表不转。
	 * 我们这次真机上是被框架别处的 poll.start() 带起来的，那不该是依赖。
	 * start() 对已在跑的表是幂等的（active 就返回 false）。 */
	poll.start();
	pollOn = true;
	pollSec = want;
}

function actRun(btn) {
	setBusy(btn, true);
	store.set({ busy: Object.assign({}, store.get().busy, { run: true }) });
	runCmd([ 'run-now' ]).then(function (out) {
		setBusy(btn, false);
		store.set({ busy: Object.assign({}, store.get().busy, { run: false }) });
		if (out === HUNG) {
			/* 挂住不等于没启动：run-now 是把后台进程甩出去，那一轮很可能已经在跑了，
			 * 只是这条连接没回来。和成功路径同一套做法：本地先置 running、直接开轮询，
			 * 让页面自己追上真实状态（而不是立刻 refresh 把旧状态读回来覆盖掉）。 */
			flash(T('启动命令没有回应'), T('%s 秒内没等到返回。这一轮可能已经开始了，状态会自动跟进；一直不更新就先确认这台电脑能打开路由器后台。').format(Math.round(CMD_LIMIT['run-now'] / 1000)), 'warn');
			store.set({
				status: Object.assign({}, store.get().status, {
					state: 'running',
					started: new Date().toISOString()
				})
			});
			startPoll();
			return;
		}
		if (out === null) {
			flash(T('无法启动'), whyNoReply(T('启动命令没跑成'), 'run'), 'bad');
			return;
		}
		/* 启动成功【不弹窗】（r47，Ryan 提的）：手机端那块通知条会整个盖住榜单，
		 * 而读数条本来就立刻翻成「测速中」、停止按钮亮起、进度清单开始走 —— 弹窗
		 * 只是把同一件事用遮挡的方式再说一遍。原来那句还把引擎的原始 JSON
		 * （{"state":"started"}）当正文显示出来，更难看了。
		 * 失败/没有回应那几条提示保留：那些是"点了但没成"，页面自己解释不清。 */
		/* 先把本地状态置成 running：run-now 返回「已启动」只是命令被受理，
		 * 引擎要过几毫秒才把 running 写进 status.json。
		 * 注意：这里绝不能立刻 refresh —— r30 把 run-now 的响应管道修成 0 秒后，
		 * 紧随其后的 refresh 会抢在引擎写状态之前读到上一轮的 done，把本地 running
		 * 覆盖回去，页面又停在「已完成」+ 不轮询（真机抓到的第二个竞态）。
		 * 正确做法：本地先 running（读数条立刻「测速中」、停止按钮立即可用），
		 * 直接开 3 秒轮询，第一轮轮询自然会拿到引擎的真实状态并校准。 */
		store.set({
			status: Object.assign({}, store.get().status, {
				state: 'running',
				started: new Date().toISOString()
			}),
			busy: Object.assign({}, store.get().busy, { run: false })
		});
		startPoll();
	}, function () {
		setBusy(btn, false);
		store.set({ busy: Object.assign({}, store.get().busy, { run: false }) });
	});
}

function actStop(btn) {
	setBusy(btn, true);
	store.set({ busy: Object.assign({}, store.get().busy, { stop: true }) });
	runCmd([ 'stop' ]).then(function (out) {
		setBusy(btn, false);
		store.set({ busy: Object.assign({}, store.get().busy, { stop: false }) });
		if (out === HUNG)
			flash(T('停止命令没有回应'), T('%s 秒内没等到返回。停止信号可能已经写进去了，本轮收尾后自停。').format(Math.round(CMD_LIMIT.stop / 1000)), 'warn');
		else if (out === null)
			flash(T('无法请求停止'), whyNoReply(T('停止命令没跑成'), 'stop'), 'bad');
		/* 受理成功【不弹窗】（r47）：停止是"这一轮收尾时停"，读数条会一直显示
		 * 「测速中」直到真的停下来，日志页顶上也会出现「已请求停止」那一行 —— 比弹窗更实在。 */
		refresh();
	}, function () {
		setBusy(btn, false);
		store.set({ busy: Object.assign({}, store.get().busy, { stop: false }) });
		flash(T('无法请求停止'), whyNoReply(T('停止命令没跑成'), 'stop'), 'bad');
	});
}

function actRefresh(btn) {
	setBusy(btn, true);
	refresh(true).then(function () { setBusy(btn, false); },
		function () { setBusy(btn, false); });
}

function actCopy() {
	var items = store.get().status.items || [];
	var ips = items
		.map(function (it) { return it && it.ip ? String(it.ip) : null; })
		.filter(function (x) { return !!x; });
	if (!ips.length) {
		flash(T('没有可复制的 IP'), T('当前榜单是空的；先跑一轮，或放宽 TTFB / 总耗时门槛。'), 'warn');
		return;
	}
	copyText(ips.join('\n')).then(function (ok) {
		if (ok)
			flash(T('已复制 %s 个 IP').format(ips.length), T('一行一个，可直接粘进客户端。'), 'ok');
		else
			flash(T('复制失败'), T('浏览器不让写剪贴板；榜单里的 IP 请手工复制。'), 'warn');
	});
}

function actCheck(btn) {
	/* 检测结果画在「源与检测」面板里：从榜单空态点进来时得先把人送过去，
	 * 否则结果落在另一个隐藏面板里，看着像点了没反应。 */
	gotoTab('sources');
	setBusy(btn, true);
	/* 这一步【只读不写】。为什么不在这里顺手保存（r42 试过，真机量死了）：
	 * LuCI 的 Map.save() 走 rpcd 的 uci.set，而 rpcd 把改动留在【自己进程的内存】里 ——
	 * 页面自己再 uci.get 读得到（返回 visible-test），但 CLI 读不到、
	 * /tmp/.uci/cf_ipcheck 是 0 行、配置文件 md5 不变。引擎是独立进程，
	 * 只能读配置文件 + 文件 delta，所以"保存后立刻检测"检到的仍是旧的那份。
	 * 要生效只有一条路：页面底部标准的「保存并应用」（apply 才落盘 + 触发 reload）。
	 * 这一页因此改为：编辑区 + 只读检测 并排，并在两者不一致时明说（pendingSourceEdits）。 */
	store.set({
		sources: { state: 'checking' },
		busy: Object.assign({}, store.get().busy, { check: true })
	});
	runCmd([ 'check-sources' ]).then(function (out) {
		store.set({
			sources: parseSources(out),
			busy: Object.assign({}, store.get().busy, { check: false })
		});
	}, function () {
		store.set({
			sources: { state: 'unreachable' },
			busy: Object.assign({}, store.get().busy, { check: false })
		});
	});
}

/* 取日志。主动展示：进页面取一次，测速期间跟着轮询一起更新，
 * 不用人先点一下「读取日志」才看得到东西。 */
function logsRefresh() {
	var st = store.get();
	if (st.busy && st.busy.logs)
		return Promise.resolve(st.logs);   /* 已经有一次在飞，别叠 */
	store.set({ busy: Object.assign({}, st.busy, { logs: true }) });
	return runCmd([ 'logs' ]).then(function (out) {
		var off = Object.assign({}, store.get().busy, { logs: false });
		/* 一次读不到不要把已经拿到的日志抹掉：日志面板是主动展示的，用户可能正在读，
		 * 抹成「读取日志没有回应」等于把他手上的东西抢走（和状态那边同一个道理）。
		 * 下一拍会再试；真连着读不到，状态那边的横幅已经把话说清了。 */
		if ((out === HUNG || out === null || out === undefined) &&
				(store.get().logs || {}).state === 'ok') {
			store.set({ busy: off });
			return store.get().logs;
		}
		var lg = parseLog(out);
		store.set({
			logs: lg,
			busy: off
		});
		return lg;
	}, function () {
		store.set({ busy: Object.assign({}, store.get().busy, { logs: false }) });
		return store.get().logs;
	});
}

function actLogs(btn) {
	/* 和源检测同一个道理：结果画在「日志」页里，从别的页点进来要先送过去，
	 * 不然画在一个看不见的面板上，又是一次「点了没反应」。 */
	gotoTab('logs');
	setBusy(btn, true);
	logsRefresh().then(function () {
		setBusy(btn, false);
	});
}

function actLogFull() {
	/* 只是换一种显示，不重新读日志：日志文本还在 store 里，翻一下标记就重画
	 * （logsKeyOf 把这个标记并进了指纹，所以 drawLogs 不会因"内容没变"而跳过）。 */
	store.set({ logFull: !store.get().logFull });
}

function actCopyLogs(btn) {
	var lg = store.get().logs;
	if (!lg || lg.state !== 'ok' || !lg.text) {
		flash(T('没有可复制的日志'), T('日志还是空的；先跑一轮，或点「读取日志」。'), 'warn');
		return;
	}
	copyText(lg.text).then(function (ok) {
		if (ok)
			flash(T('已复制日志'), T('最近 %s 行，可直接粘进终端输出贴给别人看。').format(
				lg.text.split('\n').filter(function (x) { return !!x; }).length), 'ok');
		else
			flash(T('复制失败'), T('浏览器不让写剪贴板；日志内容请手工选中复制。'), 'warn');
	});
}

/* 页内提示。两条通道按「这句话是一次性事件还是一直成立的状态」分：
 *   一次性事件（点了按钮、复制成功、命令被拒）→ 官方的限时通知条
 *     `ui.addTimeLimitedNotification(title, node, ms, ...classes)`，它渲染成主题化的
 *     `.alert-message`、带关闭按钮、自己消失，样式跟着 Argon/bootstrap 走；
 *   持续状态（读数滞留、这一轮失败）→ 页内横幅，因为它要跟着 store 原地改写，
 *     而通知条是一次性的、不会随状态变化更新，两条并排还会互相盖掉。
 * ⚠️ 这里早先试的是 `ui.addToast` / `ui.toast` —— 官方 LuCI（master / 25.12 / 24.10 /
 * 19.07 全查过）**没有**这两个方法，只有厂商分支才有；真机 ui.js 里 grep 命中 0，
 * 而 addTimeLimitedNotification 命中 2。也就是说那两条分支永远不会成立，
 * 页面一直靠兜底横幅在说话。lint 的 red-line-10 现在钉住「视图只许调用官方存在的
 * ui.* 方法」，防止再照着别的发行版的例子写一个不存在的 API。 */
var flashTimer = null;

function flash(title, text, tone, sticky) {
	var banner = {
		title: title, text: text,
		tone: tone === 'bad' ? 'bad' : (tone === 'warn' ? 'warn' : (tone === 'ok' ? 'ok' : ''))
	};
	if (!sticky && ui && typeof ui.addTimeLimitedNotification === 'function') {
		try {
			ui.addTimeLimitedNotification(title, el('span', { text: text }), 6000,
				tone === 'bad' ? 'danger' : (tone === 'warn' ? 'warning' : (tone === 'ok' ? 'success' : 'info')));
			return;
		} catch (e) {
			/* 官方 API 在个别版本上签名不一致（老版是 showNotification 四参），
			 * 抛了就退回页内横幅 —— 提示绝不能因为通道挑不上就整个不见。 */
		}
	}
	store.set({ flash: banner });
	if (flashTimer)
		clearTimeout(flashTimer);
	if (typeof setTimeout === 'function')
		flashTimer = setTimeout(function () {
			flashTimer = null;
			store.set({ flash: null });
		}, 9000);
}

/* 复制：优先 navigator.clipboard，退回 execCommand（老 LuCI 与 http 下前者常不可用） */
function copyText(text) {
	try {
		if (navigator && navigator.clipboard && navigator.clipboard.writeText &&
			window.isSecureContext !== false)
			return navigator.clipboard.writeText(text).then(function () { return true; },
				function () { return legacyCopy(text); });
	} catch (e) {}
	return Promise.resolve(legacyCopy(text));
}

function legacyCopy(text) {
	try {
		var ta = document.createElement('textarea');
		ta.value = text;
		ta.setAttribute('readonly', 'readonly');
		ta.style.position = 'fixed';
		ta.style.top = '-1000px';
		ta.style.opacity = '0';
		document.body.appendChild(ta);
		ta.select();
		var ok = document.execCommand && document.execCommand('copy');
		document.body.removeChild(ta);
		return !!ok;
	} catch (e) {
		return false;
	}
}





/* ==========================================================================
 * 16. 标签控制器
 * ==========================================================================
 * 面板节点在整页生命周期里只建一次；切标签只翻 class / aria。
 * 页面级引用放在这里（而不是各组件里），因为订阅回调与动作都要用到它们。
 */
var P = {
	rail: null,      /* 状态读数条容器 */
	flash: null,     /* 提示条容器 */
	tabs: null,      /* 标签栏容器 */
	panes: {},       /* id -> 面板节点 */
	built: false,    /* 页面是否已经建好（订阅回调依赖它） */
	unsub: null,     /* store 订阅的退订函数（重进页面时先退再订） */
	mapnode: null,   /* LuCI 表单本体（m.render() 给的那个 div） */
	form: null,      /* 配置页那张 Map（其余 32 个字段） */
	srcForm: null,   /* 源清单专用 Map（只含 community_sources），渲染进源页宿主 */
	srcEdit: null,   /* 源清单表单的固定宿主（在「源与检测」页，不参与每拍重画） */
	srcRes: null,    /* 检测结果宿主：drawSources 只清这一块 */
	stopSchemeWatch: null, /* 明暗监听的卸载把手（teardown 里必须调，否则跨页面实例累积） */
	hashStop: null       /* hashchange 监听的卸载把手，同上 */
};

var TAB_DEFS = [
	{ id: 'board',   label: '榜单' },
	{ id: 'sources', label: '源与检测' },
	{ id: 'logs',    label: '日志' },
	{ id: 'config',  label: '配置' }
];

function goto(id, persist) {
	/* 目标面板必须存在，否则保持当前不动（防止拼装时序里点到还没建好的面板） */
	var valid = false;
	for (var i = 0; i < TAB_DEFS.length; i++)
		if (TAB_DEFS[i].id === id)
			valid = true;
	if (!valid)
		return;
	for (var j = 0; j < TAB_DEFS.length; j++) {
		var d = TAB_DEFS[j];
		var on = d.id === id;
		var pane = P.panes[d.id];
		if (pane)
			pane.className = 'pane' + (on ? ' on' : '');
		var btn = P.tabs && P.tabs.children ? P.tabs.children[j] : null;
		if (btn) {
			btn.className = 'tab' + (on ? ' on' : '');
			btn.setAttribute('aria-selected', on ? 'true' : 'false');
			btn.setAttribute('tabindex', on ? '0' : '-1');
		}
	}
	store.set({ tab: id });
	if (persist !== false)
		rememberTab(id);
	writeHashTab(id);
}

/* 供动作层调用（actCheck 要把人送到源面板） */
function gotoTab(id) {
	goto(id, true);
}

/* ==========================================================================
 * 17. 页面拼装
 * ==========================================================================
 * 结构：
 *   .cfp
 *     ├ 状态读数条（常驻）
 *     ├ 提示条（按需出现）
 *     ├ 标签栏
 *     └ 三个面板（榜单 / 源与检测 / 配置）—— 一直在文档里，只是 display 切换
 */
/* 读数条/榜单的重画指纹。单独成函数是为了能在桩测里钉住这条不变量：
 * 同一份状态必须给出同一个指纹，指纹相同就绝不重建 —— 重建会换掉按钮节点，
 * 而真实鼠标的 mousedown 与 mouseup 之间节点被换掉，Chromium 就不合成 click，
 * 表现就是「点了没反应」（r28 真机抓到：down/up 都发生了，click 没发生）。 */
function railKeyOf(st, busy) {
	busy = busy || {};
	/* staleFor 只取「有没有」进指纹：灯色和状态词要跟着翻一次，但秒数每秒都在变，
	 * 把秒数放进去就等于持续重建读数条 —— 而重建会换掉按钮节点，真实鼠标的
	 * mousedown 与 mouseup 之间节点被换掉，Chromium 就不合成 click（r28 抓到的吞点）。 */
	return [ st.state, st.reason, st.intercepted, (st.items || []).length, st.finished,
		!!busy.run, !!busy.stop, !!busy.refresh, st.enabled, st.interval,
		!!st.staleFor ].join('|');
}

function boardKeyOf(st) {
	return [ st.state, st.reason, st.finished, st.intercepted, (st.items || []).length,
		JSON.stringify(st.items), JSON.stringify(st.counts),
		/* 环节进度是一轮里唯一一直在变的东西。漏了它，榜单面板就冻在第一次画出来的
		 * 那一帧：r32 真机实测进度停在「拉取社区源 1/13」30 秒不动，而同一时刻引擎
		 * 已经跑到 12/13 —— 看着就像「点了没反应 / 页面卡住」。 */
		st.stage, st.stage_done, st.stage_total, st.upload,
		/* SummaryStrip 读这几样，指纹里没有它们就等于允许面板停在旧数字上：
		 * 改了「定时周期」后那格「完成于」的滞留告警永远不会刷新。 */
		st.interval, st.started, st.pool, st.qualified, st.usable, st.domains,
		/* 滞留秒数按 10 秒一档进指纹：横幅能更新，又不会每拍都重建面板；
		 * 认输之后 staleFor 是 null，指纹彻底稳定，「刷新」按钮不会被反复换掉。 */
		Math.floor((st.staleFor || 0) / 10), st.gaveUp ? 1 : 0 ].join('|');
}

function buildPage(mapnode) {
	var root = el('div', { class: 'cfp' });
	/* 新的一次进页面，容错计数从零开始：否则上一次会话里攒下的失败会让这一页
	 * 一打开就处在「快认输」的状态上。 */
	pollFail = 0;
	lastGoodAt = 0;
	/* 建好就立刻判一次明暗：浅色那套令牌挂在 .cfp.is-light 上，
	 * 类名晚一步加就会先闪一下暗底（首帧就在用户眼前）。 */
	P.root = root;
	applyScheme(root);
	/* 先退上一份再登记：buildPage 可能在同一份 JS 里跑第二次（见 17 节那条注释），
	 * 不退就会每进一次页面多挂一个监听，而旧回调还攥着上一份 root 节点。 */
	if (P.stopSchemeWatch)
		P.stopSchemeWatch();
	P.stopSchemeWatch = watchScheme(root);
	/* 标签 <-> 地址：先摘上一份再挂，理由和明暗监听一样（store 与 window 都是跨实例的） */
	if (P.hashStop)
		P.hashStop();
	P.hashStop = watchHash();

	/* 读数条与提示条：各自订阅 store 重画 */
	P.rail = el('div');
	/* 读数条只在这几样真变了才重建：整条重画会换掉按钮节点，而真实鼠标点击
	 * 的 mousedown 与 mouseup 之间只要节点被换掉，Chromium 就不会再合成 click
	 * —— 表现就是「点了没反应」（真机抓到的：pointerdown→mousedown→mouseup 之后
	 * click 根本没发生）。空闲时日志自动刷新会改 busy，若每次都重建，
	 * 用户的点击有相当概率落进重建窗口被吞掉。 */
	P.railKey = '';
	P.railReplace = function (state) {
		var key = railKeyOf(state.status, state.busy);
		if (key === P.railKey)
			return;
		P.railKey = key;
		clear(P.rail);
		P.rail.appendChild(StatusRail(state.status, state.busy, {
			run: actRun, stop: actStop, refresh: actRefresh, copy: actCopy
		}));
	};

	P.flash = el('div');
	P.flashReplace = function (state) {
		clear(P.flash);
		var f = Flash(state.flash);
		if (f)
			P.flash.appendChild(f);
	};

	/* 标签栏：订阅的是 tab 与 status（徽标要显示榜单条数），只在数字真变了时才重建，
	 * 否则每次刷新都会把焦点从标签上踢掉，键盘用户没法连着按方向键。 */
	var lastCounts = '';
	P.tabsReplace = function (state) {
		var items = state.status.items || [];
		var usable = state.status.usable != null ? state.status.usable : items.length;
		/* 指纹里只留在真正会变的数：以前还掺了 GROUPS.length，可那是个常量
		 * （配置页的分组数写在代码里），它让"标签栏徽标"这个功能看起来在报什么，
		 * 其实那一颗圆点永远是 4。 */
		var counts = String(usable);
		if (P.tabs && counts === lastCounts) {
			/* 只有当前标签变了：翻 class，不重建 dom */
			goto(state.tab, false);
			return;
		}
		lastCounts = counts;
		var defs = TAB_DEFS.map(function (d) {
			/* 只有「榜单」带数：它是这一轮真留下的条数，人在日志页/源页时不用切回来
			 * 就能知道有没有结果、多少条；0 条时它整个不显示，不会拿个 0 骗人。
			 * 「配置」那个数（分组数）删了 —— 常量不是信息。 */
			if (d.id === 'board')
				return { id: d.id, label: T(d.label), count: usable || '' };
			return { id: d.id, label: T(d.label) };
		});
		var fresh = TabBar(defs, state.tab, function (id) { goto(id, true); });
		if (P.tabs && P.tabs.parentNode)
			P.tabs.parentNode.replaceChild(fresh, P.tabs);
		else
			P.tabsHost.appendChild(fresh);
		P.tabs = fresh;
	};

	/* ---- 面板 1：榜单 ---- */
	var boardPane = el('div', { class: 'pane', id: 'cfp-pane-board', role: 'tabpanel', tabindex: '0',
		'aria-labelledby': 'cfp-tab-board' });
	var boardKey = '';
	function drawBoard(state) {
		var key = boardKeyOf(state.status);
		if (key === boardKey)
			return;
		boardKey = key;
		clear(boardPane);
		boardPane.appendChild(BoardPane(state.status, {
			run: actRun, stop: actStop, refresh: actRefresh, copy: actCopy, check: actCheck
		}));
	}

	/* ---- 面板 2：源与检测（编辑 + 检测同一屏，r41 合并）---- */
	var srcPane = el('div', { class: 'pane', id: 'cfp-pane-sources', role: 'tabpanel', tabindex: '0',
		'aria-labelledby': 'cfp-tab-sources' });
	/* 编辑区是固定宿主：源清单那一行被搬进这里，之后**每拍重画都不碰它**。
	 * 必须如此 —— 输入框若在用户按下与松开之间被换掉，Chromium 就不合成 click
	 * （r29 的吞点），而且打字打到一半节点没了。 */
	P.srcEdit = el('div', { class: 'src-edit-host' });
	P.srcRes = el('div', { class: 'src-res' });
	srcPane.appendChild(P.srcEdit);
	srcPane.appendChild(P.srcRes);
	var lastSources = null;
	var lastCheck = null;
	var sourcesDrawn = false;
	function drawSources(state) {
		/* 和读数条同一套防吞点逻辑：没变就不重建，别在用户按下按钮时换节点。
		 * 只动 P.srcRes —— 编辑区在另一个容器里，不参与这一步。 */
		var checking = !!(state.busy && state.busy.check);
		if (sourcesDrawn && state.sources === lastSources && checking === lastCheck)
			return;
		sourcesDrawn = true;
		lastSources = state.sources;
		lastCheck = checking;
		clear(P.srcRes);
		P.srcRes.appendChild(SourcesPane(state.sources, { check: actCheck }));
	}

	/* ---- 面板 3：日志 ---- */
	var logsPane = el('div', { class: 'pane', id: 'cfp-pane-logs', role: 'tabpanel', tabindex: '0',
		'aria-labelledby': 'cfp-tab-logs' });
	/* 日志现在是主动刷新的（进页面取一次、测速中每轮询一次再取），所以两件事都得处理：
	 *   1) 内容和忙碌标记都没变就别动 DOM，别每 5 秒白白重画一次；
	 *   2) 真有新内容进来时保住阅读位置 —— 原本贴着底就跟着新行继续贴底（像 tail -f），
	 *      在中间看着的就不弹回顶部。 */
	var lastLogsKey = null;
	var logsDrawn = false;
	function logsKeyOf(lg, full) {
		if (!lg)
			return 'none';
		if (lg.state !== 'ok')
			return lg.state;
		/* 显示模式并进指纹：不这么做的话点「显示完整时刻」时日志文本一个字没变，
		 * drawLogs 会认为"没变化"直接跳过 —— 按钮就变成点了没反应的那一类。 */
		return 'ok:' + (full ? 'F' : 'T') + ':' + lg.text.length + ':' + lg.text.slice(-60);
	}
	function drawLogs(state) {
		var key = logsKeyOf(state.logs, state.logFull);
		if (logsDrawn && key === lastLogsKey)
			return;
		/* 面板不在眼前就别重画。两个理由：一是白重画（看不见，日志一屏上千个节点）；
		 * 二是隐藏时 scrollTop/clientHeight 都读成 0，「贴底就跟着贴底」的判断会恒真，
		 * 把用户之前读到的位置冲掉。这里**不**更新 lastLogsKey，所以切回这一页时
		 * store 一变就会再进来画一次。 */
		if (String(logsPane.className).indexOf('on') < 0)
			return;
		var box = logsPane.querySelector ? logsPane.querySelector('.logbox') : null;
		var keepTop = 0;
		var oldH = 0;
		var atTop = false;
		var anchor = null;
		if (box) {
			keepTop = box.scrollTop;
			oldH = box.scrollHeight;
			/* r45 起最新在【最上面】，所以"跟着新行走"= 贴在顶部，而不是贴底。
			 * 判据留 4px 容差：缩放/取整会让 scrollTop 永远差那么一两像素。 */
			atTop = box.scrollTop <= 4;
			/* 不在顶部时记下"眼前第一行是哪一行、往下一点点"—— 这是唯一可靠的锚。
			 * 光按 scrollHeight 差值补偿不够：日志是封顶的（只给最近这一段），
			 * 顶上多一行往往意味着底下少一行，总高度不变、差值算出 0，
			 * 结果用户眼前的内容被整体推走一行（真机 r45 第一轮就被这样抓到）。 */
			anchor = logAnchor(box);
		}
		logsDrawn = true;
		lastLogsKey = key;
		clear(logsPane);
		logsPane.appendChild(LogsPane(state.logs, { refresh: actLogs, copy: actCopyLogs, full: actLogFull }));
		var fresh = logsPane.querySelector ? logsPane.querySelector('.logbox') : null;
		if (fresh) {
			var top = null;
			if (atTop)
				top = 0;
			else if (anchor)
				top = logAnchorTop(fresh, anchor);
			if (top === null)
				/* 锚那一行已经掉出保留窗口（或被封顶截掉）：退回到按高度差补偿 */
				top = keepTop + Math.max(0, fresh.scrollHeight - oldH);
			fresh.scrollTop = top;
		}
	}

	/* ---- 面板 4：配置 ---- */
	var cfgPane = el('div', { class: 'pane', id: 'cfp-pane-config', role: 'tabpanel', tabindex: '0',
		'aria-labelledby': 'cfp-tab-config' });
	var cfg = ConfigPane();
	cfgPane.appendChild(cfg.node);

	P.panes = { board: boardPane, sources: srcPane, logs: logsPane, config: cfgPane };

	/* 表单本体搬进配置面板：LuCI 的 Map 节点这一步才拿到 */
	if (mapnode)
		cfg.host.appendChild(mapnode);

	/* 标签栏宿主：TabBar 由订阅回调建好后塞进来（它要读 store 里的 tab 与计数） */
	P.tabsHost = el('div');

	root.appendChild(P.rail);
	root.appendChild(P.flash);
	root.appendChild(P.tabsHost);
	root.appendChild(boardPane);
	root.appendChild(srcPane);
	root.appendChild(logsPane);
	root.appendChild(cfgPane);

	/* 订阅：状态一变，四块各自重画。订阅回调里只读 store，不互相调用，
	 * 所以重画顺序不影响结果。
	 *
	 * 退订必须先做：store 是模块级单例，而 buildPage 可能在同一份 JS 里被跑第二次
	 * （LuCI 在部分导航路径下不重新加载脚本）。不先退订的话每进一次页面就多一份
	 * 订阅，重画次数翻倍、并且旧回调还在往已经脱离文档的旧节点上画。 */
	if (P.unsub)
		P.unsub();
	P.unsub = store.subscribe(function (state) {
		P.railReplace(state);
		P.flashReplace(state);
		P.tabsReplace(state);
		drawBoard(state);
		drawSources(state);
		drawLogs(state);
	});

	P.built = true;
	return root;
}

/* ==========================================================================
 * 18. 视图入口
 * ========================================================================== */
return view.extend({
	title: _('Cloudflare 优选 IP 实测'),

	load: function () {
		return runCmd([ 'status' ]);
	},

	render: function (raw) {
		/* 首帧状态直接来自 load()，省掉一次往返 */
		store.set({ status: parseStatus(raw) });

		/* 配置表单：只声明字段与校验，呈现（分组、折叠）交给 regroupForm 搬运。
		 * 标题不再写「配置」——标签栏上已经有那两个字，同屏出现两次是噪音。
		 *
		 * 文案分两层：页面上只留一句不超过 30 字的「这个字段是什么」，完整背景
		 * （量过的阈值、踩过的坑、为什么默认关）全部挂到 help() 的悬停里。
		 * 真机量过：所有长说明摊在页面上会占两千多像素，把榜单挤到看不见。 */
		var m = new form.Map('cf_ipcheck', _('实测参数'),
			_('用带真实 SNI 的 HTTPS 探测实测。'));

		var s = m.section(form.TypedSection, 'global', _('基本设置'));
		s.anonymous = true;

		var o;

		o = s.option(form.Flag, 'enabled', _('启用定时实测'), _('关掉后不再自动跑。'));
		o.rmempty = false;
		o.description = help('enabled',
			_('关掉后不再自动跑。'),
			_('关闭时后台只空转，不消耗流量。打开后按上面的定时周期循环：距上一轮「起轮」满一个周期就开始下一轮，所以从关翻到开时若上一轮还在周期内，不会立刻重跑 —— 现在就想测就点「立即测速」。改完点保存就生效，不需要重启服务。'));

		o = s.option(form.Value, 'interval_hours', _('定时周期（小时）'), _('两轮之间的间隔。'));
		o.datatype = 'and(uinteger,min(1),max(168))';
		o.default = '6';
		o.description = help('interval_hours',
			_('两轮之间的间隔。'),
			_('范围 1~168 小时，从上一轮「起轮」的时刻开始算（不是从它结束算），所以一轮跑多久不会把下一轮越推越远。周期越短读数越新鲜，但每轮都要拉一遍社区源并探测候选池，流量与 CPU 开销都会上去 —— 真机一轮约 105MB（10 × 10.49MB），软路由上 6 小时是个折中。手动点「立即测速」同样会把下一轮顺延一个周期。'));

		o = s.option(form.Value, 'probe_domains', _('探测域名'), _('逗号分隔，须经 Cloudflare。'));
		o.default = 'www.cloudflare.com';
		o.description = help('probe_domains',
			_('逗号分隔，须经 Cloudflare。'),
			_('填你真正要用的那个域名，并且它必须架在 Cloudflare 后面 —— 探测靠 --resolve 把这个域名钉到候选 IP 上，拿到的 TTFB 才是你会实际体验到的值。可以填多个，用英文逗号分隔；引擎会逐个试，并记下每个 IP 胜出的是哪个域名（榜单在多于一种时才会多出「胜出域名」列）。'));

		o = s.option(form.Value, 'probe_port', _('探测端口'), _('一般保持 443。'));
		o.datatype = 'port';
		o.default = '443';
		o.description = help('probe_port',
			_('一般保持 443。'),
			_('HTTPS 探测的目标端口。除非你的优选用途不走 443，否则不要改 —— 改成一个非 443 端口后，很多 Cloudflare 边缘节点会直接拒绝握手，榜单会整体变空。这个端口只用于探测，不写进产物：ip.txt 与 Gist 都是一行一个纯 IP（可带 # 注释；端口在 result.json 的 port 字段里）。'));

		o = s.option(form.Value, 'log_max_kb', _('日志体积上限（KB）'), _('引擎日志的封顶大小。'));
		o.datatype = 'and(uinteger,min(16),max(65536))';
		o.default = '512';
		o.description = help('log_max_kb',
			_('引擎日志的封顶大小。'),
			_('日志写在 /tmp/cf-ipcheck/cf-ipcheck.log，而 /tmp 是 tmpfs —— 不封顶等于慢慢吃内存，能长到多大只取决于多久重启一次。超过这个大小，引擎只保留最近的一半，并在日志里明说「较早的内容被丢弃」，不会悄悄截掉让人以为日志本来就这么短。下限 16 KB 是有意的：再小就装不下一轮的取源与吞吐记录，等于出问题时查不到东西。这一项不决定日志能留多久，重启后本来就会清零。'));

		var src = m.section(form.TypedSection, 'global', _('候选池来源'));
		src.anonymous = true;

		o = src.option(form.Flag, 'use_official_ranges', _('Cloudflare 官方网段'), _('抽稀后加进候选池。默认关。'));
		o.rmempty = false;
		o.description = help('use_official_ranges',
			_('抽稀后加进候选池。默认关。'),
			_('打开后会把 Cloudflare 官方公布的网段抽稀后并进候选池。官方网段有几百万个地址，全测不现实，所以只随机取样一部分。默认关是因为社区源通常已经把近期好用的段捞过一遍了；只有当社区源集体失效、或你想自己从头趟一遍时才有必要打开。'));

		o = src.option(form.Flag, 'reuse_last', _('带上上一轮进榜的 IP'), _('让榜单跨轮连续。'));
		o.rmempty = false;
		o.description = help('reuse_last',
			_('让榜单跨轮连续。'),
			_('把上一轮进榜的那几条 IP 并回候选池一起测。好处是榜单不会「一轮好一轮空」地跳；代价是如果一个 IP 已经劣化，它会多占一个候选名额，要再过一两轮才掉出去。'));

		/* community_sources 不在这里声明 —— 它由 sourcesMap() 单开一张 Map，
		 * 渲染进「源与检测」页的宿主（原因与真机取证见 6b 的注释）。
		 * 这一节剩下的两个开关仍是候选池的一部分。 */

		var thr = m.section(form.TypedSection, 'global', _('测速与判定'));
		thr.anonymous = true;

		o = thr.option(form.Value, 'candidate_budget', _('单轮候选上限'), _('去重后最多测多少个。'));
		o.datatype = 'and(uinteger,min(8),max(4096))';
		o.default = '256';
		o.description = help('candidate_budget',
			_('去重后最多测多少个。'),
			_('一轮里最多探测多少个候选 IP（去重之后）。这个数乘上并发数、乘上单 IP 超时，决定了最坏情况下这一轮要跑多久。256 配合并发 8 与超时 5 秒，最坏约 160 秒。'));

		o = thr.option(form.Value, 'concurrency', _('并发探测数'), _('软路由上 8~16 比较稳。'));
		o.datatype = 'and(uinteger,min(1),max(64))';
		o.default = '8';
		o.description = help('concurrency',
			_('软路由上 8~16 比较稳。'),
			_('同时探测的 IP 数。调高能把一轮跑得更快，但每个连接都要占一个 socket 与一份内存；软路由的内存和连接跟踪表（conntrack）通常很紧张，超过 16 容易在测速期间把正常上网也拖慢。'));

		o = thr.option(form.Value, 'probe_timeout', _('单 IP 超时（秒）'), _('连接与整请求共用。'));
		o.datatype = 'and(uinteger,min(1),max(30))';
		o.default = '5';
		o.description = help('probe_timeout',
			_('连接与整请求共用。'),
			_('同时作为 TCP 连接超时与整个请求的超时。设得太短会把网络抖动误判成不达标；设得太长则一轮里只要有几个坏 IP，整体耗时就明显拉长。'));

		o = thr.option(form.Value, 'ttfb_limit', _('TTFB 上限（毫秒）'), _('首字节超了就淘汰。'));
		o.datatype = 'and(uinteger,min(100),max(600000))';
		o.default = '3000';
		o.description = help('ttfb_limit',
			_('首字节超了就淘汰。'),
			_('第一道门槛：首字节时间超过这个值就判为不达标。TTFB 反映的是「服务器反应过来」的速度，最接近网页首屏的感受，所以拿它当主门槛。默认 3000ms 是个宽松值，想只留精品可以压到 800~1000。'));

		o = thr.option(form.Value, 'total_limit', _('总耗时上限（毫秒）'), _('第二道门槛。'));
		o.datatype = 'and(uinteger,min(200),max(600000))';
		o.default = '5000';
		o.description = help('total_limit',
			_('第二道门槛。'),
			_('必须与 TTFB 同时满足才算可用。它管的是整个请求从头到尾的时间，能挡掉那些「响应快但传得慢」的节点。两道门槛是「与」的关系，任一超限就淘汰。'));

		o = thr.option(form.Value, 'keep_count', _('榜单保留条数'), _('按 TTFB 升序取前 N。'));
		o.datatype = 'and(uinteger,min(1),max(100))';
		o.default = '10';
		o.description = help('keep_count',
			_('按 TTFB 升序取前 N。'),
			_('排序规则是 TTFB 升序，同值再看总耗时。为什么不看总耗时：它含响应体下载时间，一次偶发 403 的错误页几乎没有正文，按总耗时排会白赚约 500 毫秒抢到榜首。保留条数不影响测速本身，只影响写出多少条以及页面上列多少行；留 10 条左右足够客户端做故障切换。'));

		o = thr.option(form.Flag, 'speed_probe', _('进榜后再测下载速度'), _('串行拉大文件测 MB/s。'));
		o.rmempty = false;
		o.description = help('speed_probe',
			_('串行拉大文件测 MB/s。'),
			_('对进榜的那几条 IP 逐个（串行，不并发）拉一个较大的文件，算出吞吐。这一步很费流量，所以默认只测前若干个 IP。测出来的 MB/s 只作参考，不参与排序。'));

		o = thr.option(form.Value, 'speed_count', _('测吞吐的 IP 个数'), _('N × 单次字节数 = 每轮流量。'));
		o.datatype = 'and(uinteger,min(0),max(100))';
		o.default = '10';
		o.description = help('speed_count',
			_('N × 单次字节数 = 每轮流量。'),
			_('只对榜单前 N 个测吞吐。流量 = N × 单次下载字节数，按默认值算就是 10 × 10485760 字节 ≈ 104.86MB/轮。填 0 等于关掉吞吐测试（但仍保留那一列，显示为 —）。'));

		o = thr.option(form.Value, 'speed_bytes', _('单次下载字节数'), _('默认 10485760 字节（10.49MB）。'));
		o.datatype = 'and(uinteger,min(131072),max(104857600))';
		o.default = '10485760';
		o.description = help('speed_bytes',
			_('默认 10485760 字节（10.49MB）。'),
			_('每次吞吐测试下载多少字节。样本太小，测到的全是刚起步那段爬坡（TCP 慢启动），数字抖得没法比较；太大又白白烧流量。10485760 字节（10.49MB）是个经验值。最小 131072 字节（约 131.07KB），最大 104857600 字节（约 104.86MB）。'));

		o = thr.option(form.Value, 'speed_timeout', _('单次吞吐测试超时（秒）'), _('比单 IP 超时大得多。'));
		o.datatype = 'and(uinteger,min(5),max(120))';
		o.default = '25';
		o.description = help('speed_timeout',
			_('比单 IP 超时大得多。'),
			_('吞吐测试单独用的超时。下载一个 10.49MB（10485760 字节）文件本来就比一次握手慢几个数量级，所以不能复用单 IP 超时，否则每个 IP 都会被判超时。'));

		o = thr.option(form.Value, 'speed_domain', _('吞吐测试地址'), _('同样用 --resolve 钉到候选 IP。'));
		o.default = 'speed.cloudflare.com';
		o.description = help('speed_domain',
			_('同样用 --resolve 钉到候选 IP。'),
			_('用来拉大文件的域名。默认 speed.cloudflare.com，它会返回一个够大的响应体。换成自己的大文件地址也可以，但要确认它同样经由 Cloudflare，否则测的是另一条路径。'));

		o = thr.option(form.Flag, 'colo_probe', _('识别落地机房'), _('取 cdn-cgi/trace 的 colo。'));
		o.rmempty = false;
		o.description = help('colo_probe',
			_('取 cdn-cgi/trace 的 colo。'),
			_('对进榜的那几条 IP 请求一次 /cdn-cgi/trace，取里面的 colo= 字段，就知道这个 IP 实际把你带到哪个 Cloudflare 机房。多花一次请求，但能一眼看出你的流量是不是绕道了。'));

		o = thr.option(form.Value, 'colo_domain', _('机房查询兜底域名'), _('取不到时换一个再试。'));
		o.default = 'www.cloudflare.com';
		o.description = help('colo_domain',
			_('取不到时换一个再试。'),
			_('如果探测域名（probe_domains）取不到 colo 字段，就换这个域名再取一次。有些被墙或改过配置的域名不会返回 trace 内容，留一个干净的兜底域名能保证机房那一列不至于整列空着。'));

		o = thr.option(form.Flag, 'canary_check', _('每轮先自检出口是否被接管'), _('拿保留地址探一次。'));
		o.rmempty = false;
		o.description = help('canary_check',
			_('拿保留地址探一次。'),
			_('每轮开始前，用 RFC 保留（不可路由）地址走一遍与真实探测完全相同的路径。正常情况下这个请求根本发不出去；如果它竟然拿到了响应，说明本机出口被透明代理接管了 —— 那么这一轮测的所有耗时其实都是「本机 → 代理 → CF」的耗时，不能用来判断 IP 好坏。检测到接管时，本页会出现红条，并且跳过机房与吞吐两列。想让它不再报接管：在代理客户端里把探测域名和 Cloudflare 网段设为直连/绕过（本插件不替你改代理），或临时停掉透明代理再跑一轮。'));

		o = thr.option(form.Value, 'probe_user', _('探测发起身份'), _('默认 nobody，别轻易改。'));
		o.default = 'nobody';
		o.description = help('probe_user',
			_('默认 nobody，别轻易改。'),
			_('探测以哪个用户身份发起。默认 nobody 是刻意的：透明代理通常放行了本机 root 发起的连接（iptables mangle 链里的那条例外），那种流量根本没走代理；换成 nobody 后走的路线和真实转发流量一致，测出来的才是你的实际体验。除非你非常清楚自己在做什么，否则保持默认。'));

		o = thr.option(form.Value, 'annotate', _('ip.txt 注释模板'), _('{colo} / {total} / {speed} 三个占位符。'));
		o.default = 'cf-ipcheck | {colo} | {total}ms';
		o.description = help('annotate',
			_('{colo} / {total} / {speed} 三个占位符。'),
			_('决定写出的 ip.txt 里每个 IP 后面跟的那串注释长什么样。三个占位符分别会被替换成机房、总耗时、下载速度。IP 与注释之间那个 # 由引擎自动补上（模板里不用写，写了会变成两个），客户端才认得出后半段是注释；注释填成空就是一行纯 IP，连 # 都不留。客户端里如果对注释内容有要求（有些把注释当成标签），在这里改。'));

		var gs = m.section(form.TypedSection, 'global', _('Gist 上传'));
		gs.anonymous = true;

		o = gs.option(form.Flag, 'upload_gist', _('每轮结束后上传 ip.txt'), _('失败只记日志。'));
		o.rmempty = false;
		o.description = help('upload_gist',
			_('失败只记日志。'),
			_('每轮跑完把结果推到 GitHub Gist，方便在多台设备之间共享同一份优选清单。上传失败不会影响本地结果，只在日志里记一笔；下一轮会重试。上传成功后，日志里会跟着写一行「稳定链接」—— 那种不随更新变化的地址，可以直接复制去别的工具订阅（GitHub 接口本身给的链接每版都带一个变化的版本号，不适合长期订阅）。'));

		o = gs.option(form.Value, 'gist_id', _('Gist ID'), _('先手工建一个 Gist。'));
		o.description = help('gist_id',
			_('先手工建一个 Gist。'),
			_('Gist 就是 GitHub 上的一段可共享文本，可以设成私有；引擎把结果写进你指定的那一个，别的设备再从它拉同一份清单。网址最后那串字符就是 ID，例如 gist.github.com/you/1a2b3c… 里的 1a2b3c…。需要先在 GitHub 上手工建一个（空的私有 Gist 就行），引擎不会替你创建。'));

		o = gs.option(form.Value, 'gist_file', _('Gist 文件名'), _('同名更新，改名会多出一份。'));
		o.default = 'cf-ip.txt';
		o.description = help('gist_file',
			_('同名更新，改名会多出一份。'),
			_('要写入 Gist 的文件名。文件已存在就更新它，不存在则新建。名字改掉不会删掉旧的那份，Gist 里会同时存在两个文件。'));

		o = gs.option(form.Value, 'gist_token', _('GitHub Token'), _('只需 gist 权限。'));
		o.password = true;
		o.description = help('gist_token',
			_('只需 gist 权限。'),
			_('令牌是 GitHub 账号的访问凭证，在「设置 → 开发者设置 → Fine-grained tokens / Personal access tokens」里生成，只勾 gist 一个权限就够，不要用全权限令牌。填在这里它会以掩码回显，并随 sysupgrade 备份一起走 —— 不想让它进配置文件的话，改用下面的 Token 文件路径。'));

		o = gs.option(form.Value, 'token_file', _('Token 文件路径（备选）'), _('两处都填时以 gist_token 为准。'));
		o.default = '/etc/cf-ipcheck.token';
		o.description = help('token_file',
			_('两处都填时以 gist_token 为准。'),
			_('不想把令牌写进 UCI 配置（因为它会随备份走并回显）时，把令牌单独写在一个文件里，这里填路径。文件权限建议 600。两个位置都填了的话，以 gist_token 为准。'));

		return m.render().then(function (mapnode) {
			linkStyle();
			P.form = m;
			P.mapnode = mapnode;
			/* 配置页的面板先建好、表单搬进去，再重组分组 */
			var root = buildPage(mapnode);
			/* 落点由 regroupForm 自己保证（分组必须留在 map 节点里面，见该函数末注释） */
			regroupForm(mapnode);
			/* 源清单是另一张【只含 community_sources】的 Map，渲染进源页的宿主。
			 * 顺序不能颠倒：宿主是 buildPage 时才创建的。 */
			var ms = sourcesMap();
			P.srcForm = ms;
			return ms.render().then(function (srcNode) {
				mountSourcesForm(srcNode, P.srcEdit);
			}, function () {
				/* 这张 Map 渲染失败不能把整页带走：源页留一句实话，
				 * 其余面板照常（检测仍然能检配置文件里已有的源）。
				 * r70：结论常驻，rpcd reload 那条排查挂 ⓘ。 */
				clear(P.srcEdit);
				P.srcEdit.appendChild(el('p', { class: 'note' }, [
					T('源清单的编辑表单没能加载：下面仍然可以检测配置文件里已有的源；要增删源，可以先改 /etc/config/cf_ipcheck 里的 community_sources，再刷新本页。'),
					HelpMark(T('刷新后还是不行，多半是路由器的后台服务 rpcd 还拿着旧的表单缓存 —— 在路由器上执行 /etc/init.d/rpcd reload，然后再刷新本页。检测只读配置文件，编辑表单加载失败不影响检测已有的源。'))
				]));
			}).then(function () {
				/* 恢复上次停留的标签；没有记录就落到榜单页 */
				/* 地址里那段优先：从分享链接/收藏进来要落在链接指的那一屏；
				 * 没有片段才退回上次停留的那个（localStorage）。 */
				var want = hashTab() || savedTab();
				var valid = false;
				for (var i = 0; i < TAB_DEFS.length; i++)
					if (TAB_DEFS[i].id === want)
						valid = true;
				goto(valid ? want : 'board', false);

				/* 首帧若读到的是「正在跑」，直接把轮询接上 */
				if (store.get().status.state === 'running')
					startPoll();

				/* 日志主动取一次：打开页面就能看到最近发生了什么，
				 * 不必先到「日志」页点一下「读取日志」 */
				logsRefresh();

				return root;
			});
		});
	},

	teardown: function () {
		/* 离开页面必须停轮询：句柄是模块级的，不停会一直背着已卸载的 DOM，
		 * 并且每 5 秒打一次 ubus。 */
		stopPoll();
		if (flashTimer) {
			clearTimeout(flashTimer);
			flashTimer = null;
		}
		/* 退订同理：不退的话下次进页面订阅会叠加。 */
		if (P.unsub) {
			P.unsub();
			P.unsub = null;
		}
		/* 明暗监听也挂在模块外的对象上（matchMedia），不摘就会跨页面实例累积，
		 * 而且旧回调还攥着上一份 root 节点。 */
		if (P.stopSchemeWatch) {
			P.stopSchemeWatch();
			P.stopSchemeWatch = null;
		}
		/* hashchange 挂在 window 上，同样是跨页面实例的：不摘就会每进一次页面多一个
		 * 监听，一次后退触发好几次 goto。 */
		if (P.hashStop) {
			P.hashStop();
			P.hashStop = null;
		}
		/* 表单把手与源页宿主一起清掉：teardown 之后 DOM 已经不在文档里，
		 * 留着旧 Map 实例会让下次进页面时把值写到一份废弃的表单上。 */
		P.form = null;
		P.srcForm = null;
		P.mapnode = null;
		P.srcEdit = null;
		P.srcRes = null;
		P.built = false;
		return true;
	}
});
