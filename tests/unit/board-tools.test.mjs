/* r203：榜单工具栏去搜索框 + 列菜单对齐。
 *
 * 两件事都要钉住：
 *   1. 搜索框整条链路都拆干净（元素、bui.q、过滤分支、样式），否则会留下
 *      「点一次只看此机房就再也清不掉」这种半截状态 —— 那个功能原来正是把
 *      机房名塞进搜索值来实现的。
 *   2. 列菜单的对齐不是靠调 margin 调出来的：复选框的偏移来自 Argon 给
 *      input[type=checkbox] 的 position:relative + top/left（按 16px 正文算的），
 *      菜单里字号 12px 就会把方框推出 label；「列」是 summary，吃不到表单控件的
 *      40px 高度。两条都得从根上覆盖，不能靠微调数值。 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..', '..');
const js = fs.readFileSync(path.join(root, 'luci-app-cf-ipcheck', 'view-src', '60-run.js'), 'utf8');
const css = fs.readFileSync(path.join(root, 'luci-app-cf-ipcheck', 'view-src', 'style', '00-app.css'), 'utf8');

test('r203 搜索框：元素、状态、过滤分支全部拆掉', () => {
	assert.ok(!/type:\s*'search'/.test(js), '不该再有搜索输入框');
	assert.ok(!/placeholder:[^,]*搜 IP/.test(js), '不该再有搜索框占位文案');
	assert.ok(!/CFI\.T\('搜 IP/.test(js), '不该再有搜索框的可译文案');
	assert.ok(!/bui\.q\b/.test(js), 'bui.q 必须彻底移除，否则会留半截过滤状态');
	assert.ok(!/input\.ctl\[type="search"\]/.test(css), '搜索框的专属样式要一起清掉');
});

test('r203 工具栏只剩排序/筛选/列三件', () => {
	const at = js.indexOf("class: 'right board-tools'");
	assert.ok(at > 0, '没找到 board-tools');
	const line = js.slice(at, js.indexOf(')', js.indexOf('[', at)) + 1);
	assert.match(line, /sortSel, filterSel, colMenu/, '工具栏应为 [sortSel, filterSel, colMenu]');
	assert.ok(!/search/.test(line), '工具栏里不该还有 search');
});

test('r203 只看此机房改挂筛选下拉的动态项', () => {
	/* 抽屉按钮不能再写 search.value */
	const at = js.indexOf("CFI.T('只看此机房')");
	assert.ok(at > 0, '没找到「只看此机房」');
	const seg = js.slice(at, at + 220);
	assert.match(seg, /setColoFilter\(String\(it\.colo/, '按钮应调用 setColoFilter');
	assert.ok(!/search\.value/.test(seg), '不该再往搜索框里塞值');

	/* 动态项：插一条 value=colo，清空时移除 */
	const fn = js.slice(js.indexOf('function setColoFilter'), js.indexOf("filterSel.addEventListener('change'"));
	assert.match(fn, /el\('option', \{ value: 'colo' \}\)/, '要插一条 value=colo 的临时选项');
	assert.match(fn, /removeChild\(coloOpt\)/, '清空时要把临时选项收回，否则下拉越用越长');
	assert.match(fn, /bui\.filter === 'colo'/, '清空时要把筛选退回全部');

	/* 过滤分支按机房等值比较 */
	assert.match(js, /bui\.filter === 'colo' && String\(it\.colo \|\| ''\) !== bui\.colo/, '要按机房等值过滤');
});

test('r203 colo 不落盘：偏好里存着 colo 要退回 all', () => {
	assert.match(js, /if \(bui\.filter === 'colo'\)\s*\n\s*bui\.filter = 'all';/, '加载时要兜住持久化的 colo');
	assert.ok(!/board\.filter', bui\.filter\)[\s\S]{0,40}colo/.test(js), '不要把 colo 写进偏好');
});

test('真实在跑的规则：列菜单复选框偏移归零但不丢定位基准', () => {
	const cb = css.indexOf('.cfp .cols-menu .chk input[type="checkbox"]');
	assert.ok(cb > 0, '缺少复选框重置规则');
	const body = css.slice(css.indexOf('{', cb) + 1, css.indexOf('}', cb));
	/* r228：Argon 的 top/left 偏移要归零，但**不能**用 position: static ——
	   方框(::before)与勾(::after)都是 absolute，靠 input 当定位基准；static 会让
	   三行的方框一起叠到 .cols-menu 左上角，只有最上面一个可见。 */
	assert.match(body, /position:\s*relative/, '要用 relative 保住 ::before 的定位基准');
	assert.doesNotMatch(body, /position:\s*static/, 'position: static 会让三行方框叠到菜单左上角');
	assert.match(body, /top:\s*0/, 'Argon 的 6.4px 下移要归零');
	assert.match(body, /left:\s*0/, 'Argon 的 -3.2px 左移要归零');
	assert.match(body, /flex:\s*0 0 auto/, '别被 flex 压缩，否则方框变形');

	assert.match(css, /\.cfp \.cfp-board \.board-tools > \.cols \{ display: flex; align-self: stretch; \}/,
		'列按钮要跟行高走（与窄屏那套一致）');
	assert.match(css, /\.cfp \.cfp-board \.board-tools > \.cols > summary \{ height: 100%/,
		'summary 要撑满 details');

	/* 行高留出可点面积：26px 起，别回到 16px 的纯文字行 */
	const chk = css.indexOf('.cfp .cols-menu .chk {');
	const chkBody = css.slice(css.indexOf('{', chk) + 1, css.indexOf('}', chk));
	assert.match(chkBody, /min-height:\s*26px/, '每行要留够点击高度');
});
