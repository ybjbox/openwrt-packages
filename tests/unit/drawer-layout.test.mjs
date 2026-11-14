/* r201：IP 详情弹窗的排版（两列读数 / 动作按钮 / 时序块）。
 *
 * 真机量到的原状：12 个字段单列排在 760px 的弹窗里，dd 宽 625px 而内容只用了一半；
 * h4 与内容之间多出 40px（弹窗根节点也挂着 .cfp，吃到了页面容器的 padding-top）；
 * 三个动作按钮零间距（act0.right == act1.x，边框直接贴住）。
 */
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(here, '..', '..');
const css = fs.readFileSync(
	path.join(root, 'luci-app-cf-ipcheck', 'view-src', 'style', '00-app.css'), 'utf8');
const run = fs.readFileSync(
	path.join(root, 'luci-app-cf-ipcheck', 'view-src', '60-run.js'), 'utf8');

const rule = (sel) => {
	/* 必须按行首定位：'.cfp .kv dd {' 也是 '.cfp .kv dt, .cfp .kv dd {' 的后半段，
	   用 indexOf 会先命中那条合并规则，取到的是 dt 的声明。 */
	const at = css.indexOf('\n' + sel + ' {');
	assert.ok(at >= 0, '没有找到规则 ' + sel);
	return css.slice(css.indexOf('{', at) + 1, css.indexOf('}', at));
};

test('r201 弹窗：取消从 .cfp 继承来的 40px 上内边距', () => {
	/* .cfp { padding-top: 40px } 是给页头留白的，弹窗根节点同样带 .cfp。
	   修法必须用 .cfp-modal[class]（0,2,0）压过 .cfp（0,1,0），别改成同权重。 */
	assert.match(rule('.cfp-modal[class]'), /padding-top:\s*0/, '弹窗不该继承页面的上内边距');
	/* 页面容器那条要留着，否则页头顶到浏览器边。.cfp { 在源文件里出现两次
	   （变量块和卡片块），用 [^}]* 限定在同一块内，只会命中带内边距的那条。 */
	assert.match(css, /\.cfp \{[^}]*padding-top:\s*40px/, '页面容器的上内边距别跟着一起删');
});

test('r201 读数：左右两栏，行内细线，且线不被列间距切断', () => {
	const k2 = rule('.cfp .kv2');
	assert.match(k2, /grid-template-columns:\s*1fr 1fr/, '两栏');
	assert.ok(!/column-gap/.test(k2) || !/\bgap:\s*[^;]*[1-9]/.test(k2), '两栏之间不该有横向 gap');

	const kv = rule('.cfp .kv');
	/* dd 用 padding-left 隔开而不是 column-gap —— grid 的 column-gap 会把
	   dt 与 dd 各自的下划线切断，中间留 12px 缺口。 */
	assert.match(kv, /gap:\s*0/, '行内不能再有列间距');
	assert.match(kv, /grid-template-columns:\s*max-content/, '标签列按内容宽度，别再写死 6.5em');
	assert.match(rule('.cfp .kv dd'), /padding-left:\s*12px/, '标签与值的距离靠 dd 内边距');
	assert.match(rule('.cfp .kv dt, .cfp .kv dd'), /border-bottom:\s*1px solid/, '每行一条细线');
});

test('r201 读数：窄屏退回单列，且两栏接缝补回分隔线', () => {
	const at = css.indexOf('@media (max-width: 767px)');
	assert.ok(at >= 0, '没有找到 767 断点');
	const tail = css.slice(at);
	assert.match(tail, /\.cfp \.kv2\s*\{\s*grid-template-columns:\s*1fr/, '窄屏单列');
	/* 拆成两个 dl 之后，第一个 dl 的最后一行在单列里就是中间行，
	   不补线的话第 6 项和第 7 项会粘成一行。 */
	assert.match(tail, /\.kv:first-child dt:last-of-type[\s\S]{0,120}border-bottom:\s*1px solid/,
		'单列时两栏接缝要补线');
});

test('r201 弹窗：动作按钮有间距并右对齐，窄屏等分', () => {
	const da = rule('.cfp .drawer-a');
	assert.match(da, /display:\s*flex/);
	assert.match(da, /gap:\s*8px/, '三个按钮原来零间距');
	assert.match(da, /justify-content:\s*flex-end/, '整组靠右，与「关闭」形成一列');
	const at = css.indexOf('@media (max-width: 767px)');
	assert.match(css.slice(at), /\.cfp \.drawer-a \.btn\s*\{[^}]*flex:\s*1 1 auto/, '窄屏等分整行');
});

test('r201 时序块：与读数之间加分隔，图例流式排列', () => {
	const tb = rule('.cfp .tblock');
	assert.match(tb, /border-top:\s*1px solid/, '时序块要与上面的读数分开');
	assert.match(tb, /padding-top:\s*14px/);
	assert.match(rule('.cfp .tleg'), /display:\s*flex/, '图例改流式，别用 1fr 1fr 留半行空白');
	/* 中文没有大小写，uppercase 是空操作；letter-spacing 只会把汉字拉开 */
	const tt = rule('.cfp .tscale-t');
	assert.ok(!/text-transform/.test(tt), '中文标题不需要 uppercase');
	assert.ok(!/letter-spacing/.test(tt), '别给汉字加字距');
});

test('r201 渲染：字段按原顺序前后切成两个 dl', () => {
	assert.match(run, /el\('div', \{ class: 'kv2' \}\)/, '外层容器');
	assert.match(run, /var half = Math\.ceil\(rows\.length \/ 2\)/, '均分，加字段不用改数');
	assert.match(run, /rows\.slice\(from, from \+ half\)/, '按原顺序切，窄屏单列才不会错位');
	/* 两个 dl 里各 6 组，DOM 上共 4 个 dt/dd 一组 */
	assert.match(run, /kv2\.appendChild\(list\)/);
});
