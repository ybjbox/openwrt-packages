'use strict';
'require form';
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

/* 翻译别名。LuCI 全局提供 _()，但 `_` 这个单字符在表达式里极难扫读（`T('.note')`
 * 一眼就知道是给人看的文案，`_('.note')` 不是）。整份代码只用 T()，_ 只在
 * form.Map/section/option 的声明处出现（那里是 LuCI 的固定签名，改不了）。 */
function T(s) {
	return _(s);
}

/* ==========================================================================
 * 1. 设计令牌
 * ==========================================================================
 * 所有样式都从这里取，组件里不允许出现裸数值（除 1px 发丝线与 0）。
 *
 * 配色思路 —— 工业仪表盘，暗色优先：
 *   底色不用纯黑（真实世界里没有纯黑），用带一点冷蓝的中性色，靠明度差分层
 *   而不是靠阴影（暗色下阴影几乎看不见）。浅色主题是对称的第二套，不是把
 *   暗色反相。信号色的暗色版降饱和、提明度：同样的彩度铺在深底上会刺眼。
 */
var TOKENS = {
	dark: {
		'--bg':        'oklch(19.5% 0.012 250)',
		'--panel':     'oklch(23.5% 0.012 250)',
		'--panel-2':   'oklch(26.5% 0.013 250)',
		'--ink':       'oklch(93% 0.005 250)',
		'--ink-2':     'oklch(76% 0.008 250)',
		'--ink-3':     'oklch(62% 0.010 250)',
		'--rule':      'oklch(34% 0.014 250)',
		'--rule-soft': 'oklch(29% 0.013 250)',
		'--focus':     'oklch(72% 0.14 250)',

		'--idle-fg':   'oklch(70% 0.010 250)',
		'--idle-bg':   'oklch(28% 0.012 250)',
		'--idle-bd':   'oklch(36% 0.014 250)',
		'--run-fg':    'oklch(80% 0.13 78)',
		'--run-bg':    'oklch(30% 0.045 78)',
		'--run-bd':    'oklch(44% 0.075 76)',
		'--ok-fg':     'oklch(80% 0.13 167)',
		'--ok-bg':     'oklch(29% 0.040 167)',
		'--ok-bd':     'oklch(42% 0.070 167)',
		'--warn-fg':   'oklch(82% 0.13 70)',
		'--warn-bg':   'oklch(30% 0.045 68)',
		'--warn-bd':   'oklch(44% 0.075 66)',
		'--bad-fg':    'oklch(76% 0.15 27)',
		'--bad-bg':    'oklch(29% 0.050 28)',
		'--bad-bd':    'oklch(43% 0.090 27)',

		'--accent':    'oklch(72% 0.16 52)',
		'--accent-fg': 'oklch(21% 0.030 50)',
		'--accent-bg': 'oklch(30% 0.050 52)',

		'--shadow':    '0 1px 2px oklch(0% 0 0 / 0.28)'
	},
	light: {
		'--bg':        'oklch(98.2% 0.004 250)',
		'--panel':     'oklch(100% 0 0)',
		'--panel-2':   'oklch(96.8% 0.005 250)',
		'--ink':       'oklch(24% 0.018 250)',
		'--ink-2':     'oklch(45% 0.014 250)',
		'--ink-3':     'oklch(60% 0.012 250)',
		'--rule':      'oklch(88% 0.008 250)',
		'--rule-soft': 'oklch(93% 0.006 250)',
		'--focus':     'oklch(58% 0.17 250)',

		'--idle-fg':   'oklch(52% 0.012 250)',
		'--idle-bg':   'oklch(95% 0.006 250)',
		'--idle-bd':   'oklch(87% 0.008 250)',
		'--run-fg':    'oklch(52% 0.14 75)',
		'--run-bg':    'oklch(95.5% 0.045 80)',
		'--run-bd':    'oklch(82% 0.10 78)',
		'--ok-fg':     'oklch(45% 0.11 165)',
		'--ok-bg':     'oklch(95% 0.035 168)',
		'--ok-bd':     'oklch(80% 0.075 167)',
		'--warn-fg':   'oklch(50% 0.13 62)',
		'--warn-bg':   'oklch(95.5% 0.040 68)',
		'--warn-bd':   'oklch(82% 0.090 65)',
		'--bad-fg':    'oklch(49% 0.18 26)',
		'--bad-bg':    'oklch(95.5% 0.035 28)',
		'--bad-bd':    'oklch(82% 0.090 27)',

		'--accent':    'oklch(58% 0.17 48)',
		'--accent-fg': 'oklch(100% 0 0)',
		'--accent-bg': 'oklch(96% 0.030 55)',

		'--shadow':    '0 1px 2px oklch(30% 0.02 250 / 0.07)'
	}
};

/* 尺度：4pt 基准。按用途命名（间距/半径/字阶），不按数值 —— 以后改基准时
 * 组件不用动。字阶只留五级且级差拉大，避免 13/14/15 那种糊成一片的层次。 */
var SCALE = {
	'--s1': '4px', '--s2': '8px', '--s3': '12px', '--s4': '16px',
	'--s5': '24px', '--s6': '32px', '--s7': '48px',
	'--r1': '3px', '--r2': '6px', '--r3': '10px',
	'--t-xs': '11px', '--t-sm': '12.5px', '--t-md': '14px', '--t-lg': '17px', '--t-xl': '22px',
	'--mono': 'ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, "Liberation Mono", monospace',
	'--sans': 'system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", "Noto Sans SC", sans-serif',
	/* 动效：只动 transform/opacity；缓动走指数曲线（不用 ease 那个折中值） */
	'--d-fast': '120ms', '--d-base': '220ms',
	'--e-out': 'cubic-bezier(.16,1,.3,1)',
	'--e-in-out': 'cubic-bezier(.65,0,.35,1)'
};

function vars(map) {
	var out = [];
	for (var k in map) {
		if (Object.prototype.hasOwnProperty.call(map, k))
			out.push('  ' + k + ':' + map[k] + ';');
	}
	return out.join('\n');
}

var CSS = [
	':root{',
	vars(SCALE),
	vars(TOKENS.dark),
	'}',
	'@media (prefers-color-scheme: light){',
	'  :root{',
	vars(TOKENS.light).replace(/^/gm, '  '),
	'  }',
	'}',

	/* ---- 容器与排版 ---- */
	'.cfp{color:var(--ink);font-family:var(--sans);font-size:var(--t-md);line-height:1.55;',
	'  -webkit-font-smoothing:antialiased}',
	'.cfp *{box-sizing:border-box}',
	/* 数字一律等宽 + 定宽数位：这是整页可比较性的基础 */
	'.cfp .n{font-family:var(--mono);font-variant-numeric:tabular-nums;letter-spacing:-.01em}',
	'.cfp .u{font-size:var(--t-xs);color:var(--ink-3);font-weight:400;margin-left:.15em}',
	'.cfp h3,.cfp h4{margin:0;font-weight:600;letter-spacing:.005em}',
	'.cfp p{margin:0}',

	/* 小节标题：小号 + 字距 + 大写化的视觉重量，靠一条发丝线拉开层次 */
	'.cfp .sec{display:flex;align-items:baseline;gap:var(--s2);margin:0 0 var(--s3)}',
	'.cfp .sec-t{font-size:var(--t-xs);font-weight:700;letter-spacing:.08em;text-transform:uppercase;',
	'  color:var(--ink-3);white-space:nowrap}',
	'.cfp .sec-rule{flex:1;height:1px;background:var(--rule);transform:translateY(-.25em)}',

	/* ==========================================================================
	 * 状态读数条（常驻顶部，不随标签切换）
	 * ========================================================================== */
	'.cfp .rail{display:flex;flex-wrap:wrap;align-items:center;gap:var(--s3) var(--s4);',
	'  padding:var(--s3) var(--s4);background:var(--panel);border:1px solid var(--rule);',
	'  border-radius:var(--r3);box-shadow:var(--shadow);margin-bottom:var(--s4)}',
	'.cfp .rail-id{display:flex;align-items:center;gap:var(--s3);min-width:0;flex:1 1 auto;flex-wrap:wrap}',
	'.cfp .rail-acts{display:flex;align-items:center;gap:var(--s2);flex-wrap:wrap}',

	/* 状态灯：色点 + 配色胶囊。进行中时呼吸（尊重 reduced-motion） */
	'.cfp .lamp{display:inline-flex;align-items:center;gap:.5em;padding:.3em .7em;border-radius:999px;',
	'  font-size:var(--t-sm);font-weight:600;white-space:nowrap;',
	'  color:var(--idle-fg);background:var(--idle-bg);border:1px solid var(--idle-bd)}',
	'.cfp .lamp-dot{width:.5em;height:.5em;border-radius:50%;background:currentColor;flex:0 0 auto}',
	'.cfp .lamp.t-run{color:var(--run-fg);background:var(--run-bg);border-color:var(--run-bd)}',
	'.cfp .lamp.t-ok{color:var(--ok-fg);background:var(--ok-bg);border-color:var(--ok-bd)}',
	'.cfp .lamp.t-warn{color:var(--warn-fg);background:var(--warn-bg);border-color:var(--warn-bd)}',
	'.cfp .lamp.t-bad{color:var(--bad-fg);background:var(--bad-bg);border-color:var(--bad-bd)}',
	'@media (prefers-reduced-motion: no-preference){',
	'  .cfp .lamp.t-run .lamp-dot{animation:cfp-pulse 1.5s var(--e-in-out) infinite}',
	'  @keyframes cfp-pulse{0%,100%{opacity:1;transform:scale(1)}50%{opacity:.3;transform:scale(.65)}}',
	'}',
	'.cfp .rail-note{font-size:var(--t-sm);color:var(--ink-3);min-width:0}',
	'.cfp .rail-tag{font-size:var(--t-xs);color:var(--warn-fg);background:var(--warn-bg);',
	'  border:1px solid var(--warn-bd);border-radius:var(--r1);padding:.15em .45em;white-space:nowrap;',
	'  font-weight:600}',

	/* ==========================================================================
	 * 按钮 —— 八态齐全（hover/focus-visible/active/disabled/loading）
	 * ========================================================================== */
	'.cfp button{font-family:inherit;font-size:var(--t-sm);font-weight:500;line-height:1.4;',
	'  display:inline-flex;align-items:center;gap:.4em;padding:.42em .8em;border-radius:var(--r2);',
	'  border:1px solid var(--rule);background:var(--panel-2);color:var(--ink);cursor:pointer;',
	'  transition:background var(--d-fast) var(--e-out),border-color var(--d-fast) var(--e-out),',
	'    color var(--d-fast) var(--e-out),opacity var(--d-fast) var(--e-out)}',
	'.cfp button:hover:not(:disabled){background:var(--panel);border-color:var(--ink-3)}',
	'.cfp button:focus-visible{outline:2px solid var(--focus);outline-offset:2px}',
	'.cfp button:active:not(:disabled){transform:translateY(1px)}',
	'.cfp button:disabled{opacity:.42;cursor:not-allowed}',
	'.cfp button.primary{border-color:transparent;background:var(--accent);color:var(--accent-fg);font-weight:600}',
	'.cfp button.primary:hover:not(:disabled){filter:brightness(1.07);border-color:transparent}',
	'.cfp button.ghost{background:transparent;border-color:transparent;color:var(--ink-2);padding:.42em .55em}',
	'.cfp button.ghost:hover:not(:disabled){background:var(--panel-2);border-color:transparent;color:var(--ink)}',
	'.cfp button.busy{pointer-events:none;opacity:.6}',
	'.cfp .bi{width:1em;text-align:center;font-style:normal;opacity:.75;flex:0 0 auto}',
	'.cfp button.primary .bi{opacity:1}',
	/* 纯文字链接式按钮（展开/收起、跳转） */
	'.cfp .lnk{background:none;border:0;padding:.15em .3em;color:var(--focus);font-size:var(--t-xs);',
	'  border-radius:var(--r1);cursor:pointer;min-height:0}',
	'.cfp .lnk:hover:not(:disabled){background:var(--panel-2);border-color:transparent}',

	/* ==========================================================================
	 * 标签栏
	 * ========================================================================== */
	'.cfp .tabs{display:flex;gap:var(--s1);border-bottom:1px solid var(--rule);margin-bottom:var(--s4);',
	'  overflow-x:auto;-webkit-overflow-scrolling:touch}',
	'.cfp .tab{position:relative;flex:0 0 auto;display:inline-flex;align-items:center;gap:.45em;',
	'  padding:.5em .85em;border:0;border-bottom:2px solid transparent;margin-bottom:-1px;',
	'  border-radius:0;background:none;color:var(--ink-3);font-size:var(--t-md);font-weight:500;',
	'  white-space:nowrap;cursor:pointer;',
	'  transition:color var(--d-fast) var(--e-out),border-color var(--d-fast) var(--e-out)}',
	'.cfp .tab:hover:not(.on){color:var(--ink-2);background:var(--panel-2)}',
	'.cfp .tab:focus-visible{outline:2px solid var(--focus);outline-offset:-2px}',
	'.cfp .tab.on{color:var(--ink);font-weight:600;border-bottom-color:var(--accent)}',
	'.cfp .tab-n{font-size:var(--t-xs);font-weight:600;padding:.05em .4em;border-radius:999px;',
	'  background:var(--idle-bg);border:1px solid var(--idle-bd);color:var(--ink-3)}',
	'.cfp .tab.on .tab-n{color:var(--accent);border-color:var(--accent);background:var(--accent-bg)}',
	'.cfp .pane{display:none}',
	'.cfp .pane.on{display:block}',

	/* ==========================================================================
	 * 读数带：一排「标签 / 值 / 单位」单元，靠 1px 网格线分列
	 * ========================================================================== */
	'.cfp .strip{display:grid;grid-template-columns:repeat(auto-fit,minmax(134px,1fr));',
	'  gap:1px;background:var(--rule);border:1px solid var(--rule);border-radius:var(--r2);',
	'  overflow:hidden;margin-bottom:var(--s4)}',
	'.cfp .cell{background:var(--panel);padding:var(--s3)}',
	'.cfp .cell-k{font-size:var(--t-xs);color:var(--ink-3);letter-spacing:.04em;text-transform:uppercase;',
	'  font-weight:600;white-space:nowrap}',
	'.cfp .cell-v{display:flex;align-items:baseline;gap:.1em;margin-top:var(--s1);',
	'  font-size:var(--t-lg);font-weight:600}',
	'.cfp .cell-v.warn{color:var(--warn-fg)}',
	'.cfp .cell-sub{font-size:var(--t-xs);color:var(--ink-3);margin-top:.15em;white-space:nowrap;',
	'  overflow:hidden;text-overflow:ellipsis}',

	/* ==========================================================================
	 * 榜单：CSS Grid 行（不用 table —— 要精确控制列宽、降列与粘性表头）
	 * ========================================================================== */
	'.cfp .board{border:1px solid var(--rule);border-radius:var(--r2);background:var(--panel);',
	'  overflow:hidden;margin-bottom:var(--s3)}',
	'.cfp .board-scroll{overflow:auto;max-height:min(58vh,540px)}',
	'.cfp .brow{display:grid;align-items:center;',
	'  grid-template-columns:2.4em minmax(9em,1.5fr) 3.6em 4.6em 4.6em 4.8em 5em 3.8em 5.6em;',
	'  border-bottom:1px solid var(--rule-soft);min-width:max-content}',
	'.cfp .brow:last-child{border-bottom:0}',
	'.cfp .brow.head{position:sticky;top:0;z-index:2;background:var(--panel-2);',
	'  border-bottom:1px solid var(--rule)}',
	'.cfp .brow.head .bc{font-size:var(--t-xs);font-weight:700;letter-spacing:.04em;text-transform:uppercase;',
	'  color:var(--ink-3);padding-top:var(--s2);padding-bottom:var(--s2)}',
	'.cfp .bc{padding:var(--s2) var(--s3);font-size:var(--t-sm);white-space:nowrap}',
	'.cfp .bc.r{text-align:right}',
	'.cfp .brow.data:hover{background:var(--panel-2)}',
	/* 第一名：左侧强调竖条 + 略重的字重，一眼看出「现在用这个」 */
	'.cfp .brow.top > .bc:first-child{box-shadow:inset 3px 0 0 var(--accent)}',
	'.cfp .brow.top .bc{font-weight:600}',
	'.cfp .rk{color:var(--ink-3);font-size:var(--t-xs);font-weight:600}',
	'.cfp .brow.top .rk{color:var(--accent)}',
	'.cfp .ip{font-family:var(--mono);font-size:var(--t-sm)}',
	'.cfp .code-ok{color:var(--ok-fg);font-weight:600}',
	'.cfp .code-odd{color:var(--warn-fg);font-weight:600}',
	/* 吞吐：数字旁一条迷你横条做相对比较（宽度 = 相对本轮最大值） */
	'.cfp .spd{display:inline-flex;align-items:center;justify-content:flex-end;gap:.4em;width:100%}',
	'.cfp .spd-bar{width:32px;height:3px;border-radius:2px;background:var(--idle-bd);overflow:hidden;flex:0 0 auto}',
	'.cfp .spd-fill{display:block;height:100%;background:var(--ok-fg);border-radius:2px}',
	/* 多域名时多一列 */
	'.cfp .board.multi .brow{grid-template-columns:2.4em minmax(9em,1.5fr) 3.6em 4.6em 4.6em 4.8em 5em 3.8em 5.6em minmax(7em,1fr)}',

	/* 空态：说清原因 + 给一个能解决它的按钮 */
	'.cfp .empty{display:flex;align-items:flex-start;gap:var(--s3);padding:var(--s5) var(--s4);',
	'  border:1px dashed var(--rule);border-radius:var(--r2);background:var(--panel);margin:0 0 var(--s4)}',
	'.cfp .empty-ic{flex:0 0 auto;width:20px;height:20px;border-radius:50%;',
	'  border:2px solid var(--rule);border-top-color:var(--accent);margin-top:.1em}',
	'@media (prefers-reduced-motion: no-preference){',
	'  .cfp .empty.spin .empty-ic{animation:cfp-spin 1s linear infinite}',
	'  @keyframes cfp-spin{to{transform:rotate(360deg)}}',
	'}',
	'.cfp .empty-b{flex:1 1 auto;min-width:0}',
	'.cfp .empty-t{font-size:var(--t-md);font-weight:600;margin-bottom:.15em}',
	'.cfp .empty-d{font-size:var(--t-sm);color:var(--ink-2);line-height:1.6;max-width:64ch}',
	'.cfp .empty-a{flex:0 0 auto}',

	/* 说明文字块（脚注 / 字段全解） */
	'.cfp .note{font-size:var(--t-xs);color:var(--ink-3);line-height:1.75;max-width:80ch}',
	'.cfp .note b{color:var(--ink-2);font-weight:600}',
	'.cfp abbr{text-decoration:underline dotted;text-underline-offset:2px;cursor:help}',

	/* 提示横幅（没有 toast 的那版 LuCI 全靠它） */
	'.cfp .flash{display:flex;align-items:flex-start;gap:.5em;margin-top:var(--s2);padding:.5em .75em;',
	'  border-radius:var(--r2);font-size:var(--t-sm);line-height:1.6;',
	'  color:var(--idle-fg);background:var(--idle-bg);border:1px solid var(--idle-bd)}',
	'.cfp .flash.ok{color:var(--ok-fg);background:var(--ok-bg);border-color:var(--ok-bd)}',
	'.cfp .flash.warn{color:var(--warn-fg);background:var(--warn-bg);border-color:var(--warn-bd)}',
	'.cfp .flash.bad{color:var(--bad-fg);background:var(--bad-bg);border-color:var(--bad-bd)}',
	'.cfp .flash b{font-weight:700}',

	/* ==========================================================================
	 * 参数分组（配置页）
	 * ========================================================================== */
	'.cfp .grps-bar{display:flex;align-items:center;gap:var(--s1);margin-bottom:var(--s3)}',
	'.cfp .grp{border:1px solid var(--rule);border-radius:var(--r2);margin-bottom:var(--s3);',
	'  background:var(--panel);overflow:hidden}',
	'.cfp .grp-h{display:flex;align-items:center;gap:var(--s2);padding:var(--s3) var(--s4);',
	'  cursor:pointer;user-select:none}',
	'.cfp .grp-h:hover{background:var(--panel-2)}',
	'.cfp .grp-h:focus-visible{outline:2px solid var(--focus);outline-offset:-2px}',
	'.cfp .grp-t{font-size:var(--t-md);font-weight:600;flex:1;min-width:0}',
	'.cfp .grp-x{font-size:var(--t-xs);color:var(--ink-3);font-weight:400;white-space:nowrap}',
	/* 折叠箭头：CSS 画的直角 V，不依赖字体里的 ▾ ▸（那两个字形各平台不一致） */
	'.cfp .chev{display:inline-block;width:.34em;height:.34em;flex:0 0 auto;',
	'  border-right:1.7px solid currentColor;border-bottom:1.7px solid currentColor;',
	'  transform:rotate(45deg);transform-origin:60% 60%;',
	'  transition:transform var(--d-base) var(--e-out);color:var(--ink-3)}',
	'.cfp .grp:not(.open) .chev{transform:rotate(-45deg)}',
	'.cfp .grp-b{display:none;border-top:1px solid var(--rule-soft)}',
	'.cfp .grp.open .grp-b{display:block}',
	'.cfp .sep{color:var(--rule);user-select:none}',

	/* 字段说明：一行短句 + 一个 ⓘ。完整解释挂在 title 上，点 ⓘ 就地展开。 */
	'.cfp .cbi-value-description{max-width:none;cursor:help}',
	'.cfp .hmark{display:inline-flex;align-items:center;justify-content:center;',
	'  width:1.05em;height:1.05em;margin-left:.4em;border:1px solid var(--rule);',
	'  border-radius:50%;font-size:.82em;font-style:normal;line-height:1;',
	'  color:var(--ink-3);background:var(--panel-2);cursor:help;',
	'  vertical-align:-.12em;transition:border-color var(--d-fast) var(--e-out),',
	'  color var(--d-fast) var(--e-out)}',
	'.cfp .hmark:hover{color:var(--ink);border-color:var(--ink-3)}',
	'.cfp .hmark:focus-visible{outline:2px solid var(--focus);outline-offset:1px}',
	'.cfp .hmark[aria-expanded="true"]{color:var(--ink);border-color:var(--ink-3);background:var(--panel)}',
	/* 展开体：占满一行，左侧一道强调线，跟常驻说明区分开 */
	'.cfp .hbody{margin-top:var(--s2);padding:var(--s2) var(--s3);',
	'  border-left:2px solid var(--run);background:var(--panel-2);',
	'  border-radius:0 var(--r1) var(--r1) 0;color:var(--ink-2);',
	'  font-size:var(--t-xs);line-height:1.6;white-space:normal;cursor:auto}',

	/* ==========================================================================
	 * 窄屏：标签可滑、按钮加高到好点、榜单降列
	 * ========================================================================== */
	'@media (max-width:760px){',
	'  .cfp .rail{flex-direction:column;align-items:stretch;gap:var(--s3)}',
	'  .cfp .rail-acts{justify-content:flex-start}',
	'  .cfp button{min-height:42px}',
	'  .cfp button.lnk{min-height:0}',
	'  .cfp .tab{padding:.55em .65em;font-size:var(--t-sm)}',
	'  .cfp .strip{grid-template-columns:repeat(auto-fit,minmax(104px,1fr))}',
	'  .cfp .cell-v{font-size:var(--t-md)}',
	'  .cfp .board-scroll{max-height:none}',
	'  .cfp .empty{flex-direction:column;align-items:stretch;gap:var(--s3)}',
	'  .cfp .grp-t{font-size:var(--t-sm)}',
	'}',
	'@media (prefers-reduced-motion: reduce){',
	'  .cfp .chev,.cfp .lamp-dot,.cfp button,.cfp .tab{transition:none;animation:none}',
	'  .cfp .lamp.t-run .lamp-dot,.cfp .empty.spin .empty-ic{animation:none}',
	'}'
].join('\n');

var STYLE_ID = 'cf-ipcheck-css';

/* 注入样式。stub 环境（单测）里没有真正的 document，静默跳过别把视图带崩。 */
function injectStyle() {
	try {
		if (!document || !document.createElement || !document.head)
			return;
		if (document.getElementById(STYLE_ID))
			return;
		var s = document.createElement('style');
		s.id = STYLE_ID;
		s.textContent = CSS;
		document.head.appendChild(s);
	} catch (e) {
		/* 注入失败最多是没样式，功能照走 */
	}
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
			else if (k === 'html')
				n.innerHTML = String(v);
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
function clock(iso, now) {
	var t = Date.parse(iso);
	if (!isFinite(t))
		return DASH;
	var d = new Date(t);
	var hms = pad2(d.getHours()) + ':' + pad2(d.getMinutes()) + ':' + pad2(d.getSeconds());
	var rel = ago(iso, now);
	return rel ? hms + '（' + rel + '）' : hms;
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
			return 'run';
		case 'never_run':
			return 'idle';
		case 'error':
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
			return T('测速中');
		case 'never_run':
			return T('尚未运行');
		case 'unreachable':
			return T('读取失败');
		case 'parse_error':
			return T('输出异常');
		case 'error':
			return T('本轮失败');
		default:
			return st.intercepted == 1 ? T('完成 · 读数不可信') : T('已完成');
	}
}

/* 引擎报的失败原因 → 一句人话。每条都要说清「发生了什么」+「下一步做什么」。 */
function why(reason) {
	switch (reason) {
		case 'empty_pool':
			return T('候选池是空的：社区源一条都没拉到，官方网段又关着。先到「源与检测」页检测一下，看是不是哪些源改了路径；或临时打开「Cloudflare 官方网段」。');
		case 'missing_curl':
			return T('这台机器上没有 curl。所有探测都由 curl --resolve 发起，请安装 curl 与 ca-bundle。');
		case 'missing_bin':
			return T('找不到 %s：包没装好，或者 rpcd 还拿着旧的 ACL 缓存（重启 rpcd 后重试）。').format(CMD);
		case 'sink_not_writable':
			return T('探测身份写不了丢弃响应体的目标，本轮在联网之前就中止了。这会让每条探测都以 curl rc=23 失败，看起来像「所有 IP 都不通」，其实是本地写不了。引擎每轮开始会把运行目录（默认 /tmp/cf-ipcheck）chmod 711、把 .null 放成 666，正常不该出现；反复出现就查运行目录所在分区的剩余空间，或「探测身份」是否被改成了不存在的用户。');
		case 'interrupted':
			return T('上一轮没跑完就断了（进程被杀、断电或重启），运行锁已被回收，这一条是自动判出来的。下面是上一次成功完成的榜单；直接点「立即测速」即可重来。');
		default:
			return reason
				? T('引擎报告本轮失败（reason=%s）。').format(reason)
				: T('引擎报告本轮失败，但没有给出原因。');
	}
}

/* ==========================================================================
 * 5. IPC —— 与引擎的唯一通道
 * ==========================================================================
 * expect:{stdout:''} 会让 rpc 把 stdout 直接解包成返回值，所以这里拿到的是字符串
 * 本身而不是 out.stdout。任何异常（ACL 没放开、可执行文件缺失、rpcd 超时）统一
 * 收敛成 null，交给上层按「执行不了」处理 —— 绝不和「跑完了没结果」混为一谈。
 */
var rpcExec = rpc.declare({
	object: 'file',
	method: 'exec',
	params: [ 'command', 'params' ],
	expect: { stdout: '' }
});

function runCmd(args) {
	return rpcExec(CMD, args).then(function (out) {
		return (typeof out === 'string') ? out : null;
	}, function () {
		return null;
	});
}

/* 把引擎的一串输出解析成状态对象。
 * 三种失败必须分开表达，这是整页可信度的地基：
 *   null  → 根本没执行成功     → unreachable
 *   空串  → 执行成功但没结果   → never_run（还没跑过一轮）
 *   非JSON→ 输出了但读不懂     → parse_error（附原文片段，便于贴日志排查）
 */
function parseStatus(raw) {
	if (raw === null || raw === undefined)
		return { state: 'unreachable', items: [] };
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
	tab: 'board',
	busy: {},
	flash: null
});

/* ==========================================================================
 * 7. 基础组件
 * ==========================================================================
 * 每个组件都是 (props) => Node 的纯函数：只吃数据、吐节点，不碰全局、不存引用。
 * 需要交互的地方通过 props.on* 回调传出去，由页面层决定要改哪个状态。
 */

/* 小节标题：小标签 + 一条拉满的发丝线 */
function Section(title, right) {
	return el('div', { class: 'sec' }, [
		el('span', { class: 'sec-t', text: title }),
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

/* 按钮。kind: primary | default | ghost | lnk */
function Button(p) {
	var kids = [];
	if (p.icon)
		kids.push(el('i', { class: 'bi', text: p.icon }));
	kids.push(el('span', { text: p.label }));
	var cls = '';
	if (p.kind === 'primary')
		cls = 'primary';
	else if (p.kind === 'ghost')
		cls = 'ghost';
	else if (p.kind === 'lnk')
		cls = 'lnk';
	return el('button', {
		class: cls,
		type: 'button',
		disabled: !!p.disabled,
		title: p.title || null,
		on: p.onClick ? { click: function (ev) { ev.preventDefault(); p.onClick(this); } } : null
	}, kids);
}

/* 忙碌态：按钮的 loading（禁用 + 降透明度，不换文案，避免宽度跳动） */
function setBusy(btn, on) {
	if (!btn)
		return;
	btn.disabled = !!on;
	btn.className = String(btn.className).replace(/ ?busy/g, '') + (on ? ' busy' : '');
}

/* 空态 / 加载态：一句说清为什么空，再给一个能解决它的动作 */
function EmptyBox(p) {
	var box = [
		el('i', { class: 'empty-ic' }),
		el('div', { class: 'empty-b' }, [
			el('div', { class: 'empty-t', text: p.title }),
			el('div', { class: 'empty-d', text: p.detail })
		])
	];
	if (p.action)
		box.push(el('div', { class: 'empty-a' }, p.action));
	return el('div', { class: 'empty' + (p.spin ? ' spin' : '') }, box);
}

/* 页内提示条：这版 LuCI 两个 toast API 都没有，全靠它 */
function Flash(p) {
	if (!p)
		return null;
	return el('div', { class: 'flash' + (p.tone ? ' ' + p.tone : '') }, [
		el('b', { text: p.title + (p.text ? '：' : '') }),
		p.text ? el('span', { text: p.text }) : null
	]);
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
		id.push(el('span', { class: 'rail-tag', text: T('出口被接管') }));

	var running = st.state === 'running';

	var btnRun = Button({
		kind: 'primary', icon: '\u25b6', label: T('立即测速'),
		disabled: running || busy.run,
		onClick: actions.run
	});
	var btnStop = Button({
		icon: '\u25a0', label: T('停止本轮'),
		disabled: !running || busy.stop,
		title: running ? null : T('当前没有在跑的一轮'),
		onClick: actions.stop
	});
	var btnRefresh = Button({
		icon: '\u21bb', label: T('刷新'),
		disabled: busy.refresh,
		onClick: actions.refresh
	});
	var btnCopy = Button({
		icon: '\u29c9', label: T('复制榜单 IP'),
		disabled: !(st.items && st.items.length),
		title: (st.items && st.items.length) ? null : T('榜单是空的，没有可复制的 IP'),
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
	if (st.interval != null && st.finished) {
		var next = Date.parse(st.finished);
		if (isFinite(next)) {
			var d = new Date(next + Number(st.interval) * 3600000);
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

	return el('div', { class: 'board' + (cols.length > COLS.length ? ' multi' : '') }, [
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
		sub: T('按总耗时排序保留的条数')
	}));

	/* 失败分类：只在引擎给了 counts 且确有失败时出现 */
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
				parts.push(k2 + ' ' + st.counts[k2]);
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
function BoardPane(st, actions) {
	var kids = [];

	/* 接管红条：这一轮的读数不可信，必须在最上面说清 */
	if (st.intercepted == 1) {
		kids.push(Flash({
			title: T('出口被代理接管'),
			text: T('候选 IP 没参与选路，下面这些数字测的是「本机 → 代理 → CF」的耗时。本轮已自动跳过机房与吞吐两列。'),
			tone: 'bad'
		}));
	}

	if (st.state === 'running') {
		kids.push(EmptyBox({
			spin: true,
			title: T('正在测速'),
			detail: T('这一轮还在跑，通常需要十几秒到几分钟（取决于候选数与超时）。完成后本页会自动更新。')
		}));
		return el('div', {}, kids);
	}

	/* 三种「读不到」分开说，各自给对应的下一步 */
	if (st.state === 'unreachable' || st.state === 'parse_error') {
		kids.push(EmptyBox({
			title: st.state === 'unreachable' ? T('读不到引擎的输出') : T('引擎的输出读不懂'),
			detail: st.state === 'unreachable'
				? T('无法执行 %s。多半是包没装好，或 rpcd 的 ACL 没放开 exec。').format(CMD)
				: T('拿到的不是合法 JSON，无法解析。原文片段：%s').format(String(st.raw || '').slice(0, 160)),
			action: Button({
				label: T('重新读取'), icon: '\u21bb',
				onClick: actions.refresh
			})
		}));
		return el('div', {}, kids);
	}

	if (st.state === 'error') {
		kids.push(EmptyBox({
			title: T('本轮没有跑完'),
			detail: why(st.reason),
			action: Button({
				kind: 'primary', label: T('立即测速'), icon: '\u25b6',
				onClick: actions.run
			})
		}));
		/* 即便本轮失败，上一轮的榜单往往还在，照样展示出来 */
		if (st.items && st.items.length) {
			kids.push(SummaryStrip(st));
			kids.push(Leaderboard(st.items));
		}
		return el('div', {}, kids);
	}

	if (!st.items || !st.items.length) {
		kids.push(EmptyBox({
			title: st.state === 'never_run' ? T('还没有测过') : T('这一轮没有产生榜单'),
			detail: st.state === 'never_run'
				? T('点「立即测速」跑第一轮。引擎会先拉社区源、把上一轮的入围 IP 并回候选池，再用带真实 SNI 的 HTTPS 逐个实测。')
				: T('候选池里的 IP 都没有同时过 TTFB 与总耗时两道门槛。放宽阈值（配置 → 测速与判定），或先到「源与检测」看看候选池为什么这么小。'),
			action: Button({
				kind: 'primary', label: T('立即测速'), icon: '\u25b6',
				onClick: actions.run
			})
		}));
		return el('div', {}, kids);
	}

	kids.push(SummaryStrip(st));
	kids.push(Section(T('榜单')));
	kids.push(Leaderboard(st.items));
	kids.push(el('p', { class: 'note' },
		T('按总耗时升序排列，同值再看 TTFB。列头 TCP / TLS / TTFB / 总计 单位均为毫秒；MB/s 为十进制（1 MB = 1000 KB），只对前若干个 IP 实测、仅作参考不参与排序，未测或失败显示 %s。').format(DASH)));

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
	return el('div', { class: 'board' }, [
		el('div', { class: 'board-scroll' }, [ head ].concat(body))
	]);
}

function SourcesPane(src, actions) {
	var kids = [];

	kids.push(Section(T('源清单'), Button({
		label: T('重新检测'), icon: '\u2315',
		disabled: store.get().busy && store.get().busy.check,
		onClick: actions.check
	})));

	if (!src) {
		/* 还没点过检测：说清这一页是干嘛的，并给按钮 */
		kids.push(EmptyBox({
			title: T('还没有检测过'),
			detail: T('逐条实拉社区源，列出 HTTP 状态、提取到的 IPv4 数量，以及其中落在 Cloudflare 官方网段内的比例。段内占比掉到 90% 以下，通常说明这个源换了内容。'),
			action: Button({
				kind: 'primary', label: T('开始检测'), icon: '\u2315',
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
			action: Button({ label: T('重新检测'), icon: '\u2315', onClick: actions.check })
		}));
		return el('div', {}, kids);
	}

	kids.push(SourceMatrix(src.rows));
	kids.push(el('p', { class: 'note' },
		T('「CF 段内」是判定一个源还能不能用的关键：这个源提取出的 IPv4 里，有多少落在 Cloudflare 官方网段内。占比高说明它还在提供真正的 CF anycast；掉到 90% 以下通常意味着它开始夹带别人自己的中转 / VPS 地址。拉不到的那条会标黄，引擎本轮会跳过它并记日志。')));

	return el('div', {}, kids);
}

function srcMessage(src) {
	switch (src.state) {
		case 'unreachable':
			return T('检测没跑成：无法执行 %s（包没装好、可执行位丢失，或 rpcd 的 file.exec 超时）。').format(CMD);
		case 'parse_error':
			return T('检测返回的内容不是合法 JSON。原文片段：%s').format(String(src.raw || '').slice(0, 160));
		case 'empty':
			return T('一条源都没检出：「社区优选源 URL」这一项是空的。到「配置 → 候选池来源」加上几条。');
		default:
			return T('没有可用的检测结果。');
	}
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
		if (d.count != null && d.count !== '')
			kids.push(el('span', { class: 'tab-n n', text: String(d.count) }));
		var on = d.id === current;
		var b = el('button', {
			class: 'tab' + (on ? ' on' : ''),
			type: 'button',
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

/* ==========================================================================
 * 14. 参数分组（配置页）
 * ==========================================================================
 * 引擎的 30 个 uci 选项按「你此刻想改什么」分成四组，而不是按代码顺序平铺。
 * 分组与折叠都只影响呈现：字段本身仍然是同一张 Map 里的同一批 option，
 * 保存链路完全不变。
 */
var GROUPS = [
	{ id: 'basic',  title: '基本设置',   hint: '开关与周期' },
	{ id: 'pool',   title: '候选池来源', hint: '候选从哪来' },
	{ id: 'probe',  title: '测速与判定', hint: '阈值与吞吐' },
	{ id: 'gist',   title: 'Gist 上传',  hint: '结果外发' }
];

var GROUP_OPTIONS = {
	basic: [ 'enabled', 'interval_hours', 'probe_domains', 'probe_port' ],
	pool:  [ 'use_official_ranges', 'reuse_last', 'community_sources' ],
	probe: [ 'candidate_budget', 'concurrency', 'probe_timeout', 'ttfb_limit', 'total_limit',
	         'keep_count', 'speed_probe', 'speed_count', 'speed_bytes', 'speed_timeout',
	         'speed_domain', 'colo_probe', 'colo_domain', 'canary_check', 'probe_user', 'annotate' ],
	gist:  [ 'upload_gist', 'gist_id', 'gist_file', 'gist_token', 'token_file' ]
};

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
		wrap.appendChild(el('div', { class: 'grp open' }, [
			el('div', { class: 'grp-h' }, [
				el('i', { class: 'chev' }),
				el('span', { class: 'grp-t', text: T('其它') }),
				el('span', { class: 'grp-x', text: T('未归类字段') })
			]),
			lb
		]));
	}

	/* 搬空之后把 form.js 那几个 section 壳子摘掉，避免留下一堆空标题 */
	secs.forEach(function (s) {
		if (!s.querySelector || s.querySelector('.cbi-value'))
			return;
		if (s.querySelector('.grp') || s.closest && s.closest('.cfp'))
			return;
		var host = s.querySelector('.cbi-section-node') || s;
		/* 只有当它真的空了才移除；否则保留（宁可多一个壳，不可丢字段） */
		if (!host.querySelector('.cbi-value'))
			s.style.display = 'none';
	});

	/* 字段都搬到位之后，再把完整解释贴成 ⓘ。顺序不能反：
	 * applyHelp 依赖 label[for] 在最终位置上，先贴会被搬家带走。 */
	applyHelp(wrap);

	return wrap;
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
				T('改动保存后下一轮生效；判定口径见「榜单」页说明。')),
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
var poller = null;

/* 刷新状态：同一时刻只留一个 status 请求在飞，后来的共享它的结果。
 * 两次刷新叠在一起本身不会出错（写 store 是幂等的），但会把 ubus 请求翻倍。 */
function refresh() {
	if (inflight)
		return inflight;
	store.set({ busy: Object.assign({}, store.get().busy, { refresh: true }) });
	inflight = runCmd([ 'status' ]).then(function (out) {
		inflight = null;
		var st = parseStatus(out);
		var busy = Object.assign({}, store.get().busy, { refresh: false });
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
	if (poller) {
		clearInterval(poller);
		poller = null;
	}
}

/* 测速进行中每 5 秒拉一次；结束后自停。
 * 停止条件看 store 里的 state，不看 DOM 文案 —— 文案会因为隐藏面板等原因
 * 与真实状态不同步。 */
function startPoll() {
	if (typeof setInterval !== 'function')
		return;
	stopPoll();
	poller = setInterval(function () {
		refresh().then(function (st) {
			if (!st || st.state !== 'running')
				stopPoll();
		}, function () {
			stopPoll();
		});
	}, 5000);
}

function actRun(btn) {
	setBusy(btn, true);
	store.set({ busy: Object.assign({}, store.get().busy, { run: true }) });
	runCmd([ 'run-now' ]).then(function (out) {
		store.set({ busy: Object.assign({}, store.get().busy, { run: false }) });
		if (out === null) {
			flash(T('无法启动'), T('执行 %s 失败：包没装好，或 rpcd 的 ACL 没放开 exec。').format(CMD), 'bad');
			return;
		}
		flash(T('已启动一轮测速'), String(out), 'ok');
		/* 无条件开始轮询 + 立刻拉一次：run-now 只是把后台进程甩出去，
		 * 那一轮要几毫秒后才把 running 写进状态。这里抢跑一次就可能读到上一轮的
		 * done，于是永远是「已完成」——所以先补一次 refresh 再开轮询。 */
		refresh().then(function () { startPoll(); });
	}, function () {
		store.set({ busy: Object.assign({}, store.get().busy, { run: false }) });
	});
}

function actStop(btn) {
	setBusy(btn, true);
	store.set({ busy: Object.assign({}, store.get().busy, { stop: true }) });
	runCmd([ 'stop' ]).then(function (out) {
		store.set({ busy: Object.assign({}, store.get().busy, { stop: false }) });
		if (out === null)
			flash(T('无法请求停止'), T('执行 %s 失败。').format(CMD), 'bad');
		else
			flash(T('已请求停止'), T('当前这轮收尾后不再继续探测。'), 'warn');
		refresh();
	}, function () {
		store.set({ busy: Object.assign({}, store.get().busy, { stop: false }) });
		flash(T('无法请求停止'), T('执行 %s 失败。').format(CMD), 'bad');
	});
}

function actRefresh(btn) {
	setBusy(btn, true);
	refresh().then(function () { setBusy(btn, false); },
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
	store.set({
		sources: { state: 'checking' },
		busy: Object.assign({}, store.get().busy, { check: true })
	});
	runCmd([ 'sources' ]).then(function (out) {
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

/* 页内提示：这版 LuCI 没有 toast，优先用官方的（若存在），否则写横幅 */
var flashTimer = null;

function flash(title, text, tone) {
	var used = false;
	try {
		if (ui && typeof ui.addToast === 'function') {
			ui.addToast(title, text, tone || 'info');
			used = true;
		} else if (ui && typeof ui.toast === 'function') {
			ui.toast(tone || 'info', title, text);
			used = true;
		}
	} catch (e) {
		used = false;
	}
	/* 即便有 toast 也写一次横幅：真机那版（26.249）两个 API 都不在，
	 * 而这两条分支在别的版本上会成功，横幅只是兜底，不冲突。 */
	store.set({ flash: { title: title, text: text, tone: tone === 'bad' ? 'bad' : (tone === 'warn' ? 'warn' : (tone === 'ok' ? 'ok' : '')) } });
	if (flashTimer)
		clearTimeout(flashTimer);
	if (typeof setTimeout === 'function')
		flashTimer = setTimeout(function () {
			flashTimer = null;
			store.set({ flash: null });
		}, used ? 1000 : 9000);
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
	unsub: null      /* store 订阅的退订函数（重进页面时先退再订） */
};

var TAB_DEFS = [
	{ id: 'board',   label: '榜单' },
	{ id: 'sources', label: '源与检测' },
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
function buildPage(mapnode) {
	var root = el('div', { class: 'cfp' });

	/* 读数条与提示条：各自订阅 store 重画 */
	P.rail = el('div');
	P.railReplace = function (state) {
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
		var counts = usable + '|' + GROUPS.length;
		if (P.tabs && counts === lastCounts) {
			/* 只有当前标签变了：翻 class，不重建 dom */
			goto(state.tab, false);
			return;
		}
		lastCounts = counts;
		var defs = TAB_DEFS.map(function (d) {
			if (d.id === 'board')
				return { id: d.id, label: T(d.label), count: usable || '' };
			if (d.id === 'config')
				return { id: d.id, label: T(d.label), count: GROUPS.length };
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
	var boardPane = el('div', { class: 'pane' });
	function drawBoard(state) {
		clear(boardPane);
		boardPane.appendChild(BoardPane(state.status, {
			run: actRun, stop: actStop, refresh: actRefresh, copy: actCopy, check: actCheck
		}));
	}

	/* ---- 面板 2：源与检测 ---- */
	var srcPane = el('div', { class: 'pane' });
	function drawSources(state) {
		clear(srcPane);
		srcPane.appendChild(SourcesPane(state.sources, { check: actCheck }));
	}

	/* ---- 面板 3：配置 ---- */
	var cfgPane = el('div', { class: 'pane' });
	var cfg = ConfigPane();
	cfgPane.appendChild(cfg.node);
	/* 重组后的分组要落进这个宿主（regroupForm 在 render 末尾才跑） */
	P.cfgHost = cfg.host;

	P.panes = { board: boardPane, sources: srcPane, config: cfgPane };

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
			_('关闭时后台只空转，不会消耗流量；打开后由 cron 调度，一分钟内开始下一轮。改完点保存，下一轮生效。'));

		o = s.option(form.Value, 'interval_hours', _('定时周期（小时）'), _('两轮之间的间隔。'));
		o.datatype = 'and(uinteger,min(1),max(168))';
		o.default = '6';
		o.description = help('interval_hours',
			_('两轮之间的间隔。'),
			_('范围 1~168 小时。周期越短读数越新鲜，但每轮都要拉一遍社区源并探测候选池，流量与 CPU 开销都会上去。软路由上 6 小时是个折中。'));

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
			_('HTTPS 探测的目标端口。除非你的优选用途不走 443，否则不要改 —— 改成一个非 443 端口后，很多 Cloudflare 边缘节点会直接拒绝握手，榜单会整体变空。'));

		var src = m.section(form.TypedSection, 'global', _('候选池来源'));
		src.anonymous = true;

		o = src.option(form.Flag, 'use_official_ranges', _('Cloudflare 官方网段'), _('抽稀后加进候选池。默认关。'));
		o.rmempty = false;
		o.description = help('use_official_ranges',
			_('抽稀后加进候选池。默认关。'),
			_('打开后会把 Cloudflare 官方公布的网段抽稀后并进候选池。官方网段有几百万个地址，全测不现实，所以只随机取样一部分。默认关是因为社区源通常已经把近期好用的段捞过一遍了；只有当社区源集体失效、或你想自己从头趟一遍时才有必要打开。'));

		o = src.option(form.Flag, 'reuse_last', _('带上上一轮入围 IP'), _('让榜单跨轮连续。'));
		o.rmempty = false;
		o.description = help('reuse_last',
			_('让榜单跨轮连续。'),
			_('把上一轮已经入围的 IP 并回候选池一起测。好处是榜单不会「一轮好一轮空」地跳；代价是如果一个 IP 已经劣化，它会多占一个候选名额，要再过一两轮才掉出去。'));

		o = src.option(form.DynamicList, 'community_sources', _('社区优选源 URL'), _('每行一个 HTTPS 文本地址。'));
		o.description = help('community_sources',
			_('每行一个 HTTPS 文本地址。'),
			_('这些地址返回纯文本，里面夹着一堆 IPv4；引擎逐行提取、去重后进候选池。没有格式要求，只要 IP 出现在文本里就行（HTML 注释、Markdown、纯列表都能读）。想确认某个源还在不在提供真正的 CF 地址，去「源与检测」页点一次检测，看它的「段内占比」。'));

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
			_('同时探测的 IP 数。调高能把一轮跑得更快，但每个连接都要占一个 socket 与一份内存；软路由的内存和 conntrack 表通常很紧张，超过 16 容易在测速期间把正常上网也拖慢。'));

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

		o = thr.option(form.Value, 'keep_count', _('榜单保留条数'), _('按总耗时升序取前 N。'));
		o.datatype = 'and(uinteger,min(1),max(100))';
		o.default = '10';
		o.description = help('keep_count',
			_('按总耗时升序取前 N。'),
			_('排序规则是总耗时升序，耗时相同再看 TTFB。保留条数不影响测速本身，只影响写出多少条以及页面上列多少行；留 10 条左右足够客户端做故障切换。'));

		o = thr.option(form.Flag, 'speed_probe', _('入围后再测下载速度'), _('串行拉大文件测 MB/s。'));
		o.rmempty = false;
		o.description = help('speed_probe',
			_('串行拉大文件测 MB/s。'),
			_('对已经入围的 IP 逐个（串行，不并发）拉一个较大的文件，算出吞吐。这一步很费流量，所以默认只测前若干个 IP。测出来的 MB/s 只作参考，不参与排序。'));

		o = thr.option(form.Value, 'speed_count', _('测吞吐的 IP 个数'), _('N × 单次字节数 = 每轮流量。'));
		o.datatype = 'and(uinteger,min(0),max(100))';
		o.default = '10';
		o.description = help('speed_count',
			_('N × 单次字节数 = 每轮流量。'),
			_('只对榜单前 N 个测吞吐。流量 = N × 单次下载字节数，按默认值算就是 10 × 10MB ≈ 100MB/轮。填 0 等于关掉吞吐测试（但仍保留那一列，显示为 —）。'));

		o = thr.option(form.Value, 'speed_bytes', _('单次下载字节数'), _('默认 10MB。'));
		o.datatype = 'and(uinteger,min(131072),max(104857600))';
		o.default = '10485760';
		o.description = help('speed_bytes',
			_('默认 10MB。'),
			_('每次吞吐测试下载多少字节。样本太小会被 TCP 慢启动主导，数字抖得没法比较；太大又白白烧流量。10MB 是个经验值。最小 128KB，最大 100MB。'));

		o = thr.option(form.Value, 'speed_timeout', _('单次吞吐测试超时（秒）'), _('比单 IP 超时大得多。'));
		o.datatype = 'and(uinteger,min(5),max(120))';
		o.default = '25';
		o.description = help('speed_timeout',
			_('比单 IP 超时大得多。'),
			_('吞吐测试单独用的超时。下载一个 10MB 文件本来就比一次握手慢几个数量级，所以不能复用单 IP 超时，否则每个 IP 都会被判超时。'));

		o = thr.option(form.Value, 'speed_domain', _('吞吐测试地址'), _('同样用 --resolve 钉到候选 IP。'));
		o.default = 'speed.cloudflare.com';
		o.description = help('speed_domain',
			_('同样用 --resolve 钉到候选 IP。'),
			_('用来拉大文件的域名。默认 speed.cloudflare.com，它会返回一个够大的响应体。换成自己的大文件地址也可以，但要确认它同样经由 Cloudflare，否则测的是另一条路径。'));

		o = thr.option(form.Flag, 'colo_probe', _('识别落地机房'), _('取 cdn-cgi/trace 的 colo。'));
		o.rmempty = false;
		o.description = help('colo_probe',
			_('取 cdn-cgi/trace 的 colo。'),
			_('对入围 IP 请求一次 /cdn-cgi/trace，取里面的 colo= 字段，就知道这个 IP 实际把你带到哪个 Cloudflare 机房。多花一次请求，但能一眼看出你的流量是不是绕道了。'));

		o = thr.option(form.Value, 'colo_domain', _('机房查询兜底域名'), _('取不到时换一个再试。'));
		o.default = 'www.cloudflare.com';
		o.description = help('colo_domain',
			_('取不到时换一个再试。'),
			_('如果探测域名（probe_domains）取不到 colo 字段，就换这个域名再取一次。有些被墙或改过配置的域名不会返回 trace 内容，留一个干净的兜底域名能保证机房那一列不至于整列空着。'));

		o = thr.option(form.Flag, 'canary_check', _('每轮先自检出口是否被接管'), _('拿保留地址探一次。'));
		o.rmempty = false;
		o.description = help('canary_check',
			_('拿保留地址探一次。'),
			_('每轮开始前，用 RFC 保留（不可路由）地址走一遍与真实探测完全相同的路径。正常情况下这个请求根本发不出去；如果它竟然拿到了响应，说明本机出口被透明代理接管了 —— 那么这一轮测的所有耗时其实都是「本机 → 代理 → CF」的耗时，不能用来判断 IP 好坏。检测到接管时，本页会出现红条，并且跳过机房与吞吐两列。'));

		o = thr.option(form.Value, 'probe_user', _('探测发起身份'), _('默认 nobody，别轻易改。'));
		o.default = 'nobody';
		o.description = help('probe_user',
			_('默认 nobody，别轻易改。'),
			_('探测以哪个用户身份发起。默认 nobody 是刻意的：iptables 的透明代理 mangle 链通常会豁免本机发起的连接，但那是针对 root 的豁免；换成 nobody 后走的路径更接近真实转发流量，也就更能测出真实体验。除非你非常清楚自己在做什么，否则保持默认。'));

		o = thr.option(form.Value, 'annotate', _('ip.txt 注释模板'), _('{colo} / {total} / {speed} 三个占位符。'));
		o.default = 'cf-ipcheck | {colo} | {total}ms';
		o.description = help('annotate',
			_('{colo} / {total} / {speed} 三个占位符。'),
			_('决定写出的 ip.txt 里每个 IP 后面跟的那串注释长什么样。三个占位符分别会被替换成机房、总耗时、下载速度；不写占位符就是一行纯 IP。客户端里如果对注释内容有要求（有些把注释当成标签），在这里改。'));

		var gs = m.section(form.TypedSection, 'global', _('Gist 上传'));
		gs.anonymous = true;

		o = gs.option(form.Flag, 'upload_gist', _('每轮结束后上传 ip.txt'), _('失败只记日志。'));
		o.rmempty = false;
		o.description = help('upload_gist',
			_('失败只记日志。'),
			_('每轮跑完把结果推到 GitHub Gist，方便在多台设备之间共享同一份优选清单。上传失败不会影响本地结果，只在日志里记一笔；下一轮会重试。'));

		o = gs.option(form.Value, 'gist_id', _('Gist ID'), _('先手工建一个 Gist。'));
		o.description = help('gist_id',
			_('先手工建一个 Gist。'),
			_('Gist 网址最后那串十六进制就是 ID，例如 gist.github.com/you/1a2b3c… 里的 1a2b3c…。需要先在 GitHub 上手工建一个（可以是空的私有 Gist），引擎不会替你创建。'));

		o = gs.option(form.Value, 'gist_file', _('Gist 文件名'), _('同名更新，改名会多出一份。'));
		o.default = 'cf-ip.txt';
		o.description = help('gist_file',
			_('同名更新，改名会多出一份。'),
			_('要写入 Gist 的文件名。文件已存在就更新它，不存在则新建。名字改掉不会删掉旧的那份，Gist 里会同时存在两个文件。'));

		o = gs.option(form.Value, 'gist_token', _('GitHub Token'), _('只需 gist 权限。'));
		o.password = true;
		o.description = help('gist_token',
			_('只需 gist 权限。'),
			_('经典令牌，只勾 gist 一个权限就够了，不要用全权限令牌。注意：它会随 sysupgrade 备份一起走，也会在本页以掩码形式回显 —— 如果这不是你想要的，改用下面的 Token 文件路径。'));

		o = gs.option(form.Value, 'token_file', _('Token 文件路径（备选）'), _('两处都填时以 gist_token 为准。'));
		o.default = '/etc/cf-ipcheck.token';
		o.description = help('token_file',
			_('两处都填时以 gist_token 为准。'),
			_('不想把令牌写进 UCI 配置（因为它会随备份走并回显）时，把令牌单独写在一个文件里，这里填路径。文件权限建议 600。两个位置都填了的话，以 gist_token 为准。'));

		return m.render().then(function (mapnode) {
			injectStyle();
			/* 配置页的面板先建好、表单搬进去，再重组分组 */
			var root = buildPage(mapnode);
			injectStyle();
			var wrap = regroupForm(mapnode);
			if (wrap && wrap.children && wrap.children.length && P.cfgHost) {
				clear(P.cfgHost);
				P.cfgHost.appendChild(wrap);
			}
			/* 恢复上次停留的标签；没有记录就落到榜单页 */
			var want = savedTab();
			var valid = false;
			for (var i = 0; i < TAB_DEFS.length; i++)
				if (TAB_DEFS[i].id === want)
					valid = true;
			goto(valid ? want : 'board', false);

			/* 首帧若读到的是「正在跑」，直接把轮询接上 */
			if (store.get().status.state === 'running')
				startPoll();

			return root;
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
		P.built = false;
		return true;
	}
});
