/* CSS 层叠卫生检查（r191 起）。
 *
 * 背景：构建期 CssTidy 会做两件事 —— ① 同一个选择器的多条规则合并成一条，只留
 * **最后一次**的值；② 把 @media 块整体挪到文件末尾。所以产物里的层叠顺序和源文件
 * 里写的顺序**不是一回事**：源文件里「后面那条会覆盖前面那条」在产物里经常反过来。
 *
 * 推论：不能按源文件顺序判断哪条声明是死的。r191 一开始就是这么判的，删掉了移动端
 * Tab 的 44px 与机房首列的 max-content，真机 390px 下立刻变形，只能撤回。
 *
 * 这里只锁一条**在任何顺序下都成立**的规则：同一个（媒体条件 + 选择器）里，
 * 同一个属性不许出现两次。这种重复无论怎么排序都是多余的，改一处漏一处。
 */
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(here, '..', '..');
const CSS = path.join(root, 'luci-app-cf-ipcheck', 'view-src', 'style', '00-app.css');

const read = () => fs.readFileSync(CSS, 'utf8').replace(/\/\*[\s\S]*?\*\//g, ' ');

/* 递归解析：返回 [{ media, sel, props[] }]。@media 的媒体条件参与分组键。 */
function parseRules(css) {
	const rules = [];
	(function walk(lo, hi, media) {
		let i = lo;
		while (i < hi) {
			const j = css.indexOf('{', i);
			if (j < 0 || j >= hi) break;
			const selRaw = css.slice(i, j).trim();
			let depth = 1;
			let k = j + 1;
			while (k < hi && depth) {
				const c = css[k];
				if (c === '{') depth++;
				else if (c === '}') depth--;
				k++;
			}
			const bodyLo = j + 1;
			const bodyHi = k - 1;
			if (selRaw.startsWith('@media')) {
				walk(bodyLo, bodyHi, selRaw.replace(/\s+/g, ' ').trim());
			}
			else if (!selRaw.startsWith('@')) {
				const props = css.slice(bodyLo, bodyHi).split(';')
					.map((d) => (d.match(/^\s*([a-zA-Z-]+)\s*:/) || [])[1])
					.filter(Boolean)
					.map((p) => p.toLowerCase());
				rules.push({
					media,
					sel: selRaw.replace(/\s+/g, ' ').replace(/\s*,\s*/g, ', ').trim(),
					props
				});
			}
			i = k;
		}
	})(0, css.length, '');
	return rules;
}

test('CSS：同一（媒体条件 + 选择器）里没有重复属性', () => {
	const groups = new Map();
	for (const r of parseRules(read())) {
		const key = `${r.media}||${r.sel}`;
		if (!groups.has(key)) groups.set(key, []);
		groups.get(key).push(...r.props);
	}
	const bad = [];
	for (const [key, props] of groups) {
		const seen = new Set();
		const dup = new Set();
		for (const p of props) {
			if (seen.has(p)) dup.add(p);
			seen.add(p);
		}
		if (dup.size) {
			const [media, sel] = key.split('||');
			bad.push(`${media ? media + '  ' : '顶层  '}${sel} → ${[...dup].join(', ')}`);
		}
	}
	assert.deepEqual(bad, [],
		'下列规则在同一媒体条件下重复声明了同一属性；CssTidy 会合并成一条，'
		+ '写两遍只会造成「改一处漏一处」：\n  ' + bad.join('\n  '));
});

test('CSS：移动端 Tab 与机房列宽留在媒体块里，不被顶层规则顶掉', () => {
	/* 这两条在源文件里排在顶层同类规则**前面**，看着像死声明；但产物里 @media 块
	   会被挪到末尾，实际生效的正是它们。r191 误删过一次，这里锁住。 */
	const rules = parseRules(read());
	const mobile = rules.filter((r) => r.media === '@media (max-width: 767px)');
	const tab = mobile.find((r) => r.sel === '.cfp-tabs .cbi-tab > a');
	assert.ok(tab, '移动端仍有一条 .cfp-tabs .cbi-tab > a 规则');
	assert.match(tab.props.join(' '), /min-height/,
		'移动端 Tab 必须显式给 min-height，否则掉回顶层的 39px');

	const dc = mobile.find((r) => r.sel === '.cfp .dc > summary');
	assert.ok(dc, '移动端仍有一条 .cfp .dc > summary 规则');
	assert.match(dc.props.join(' '), /grid-template-columns/,
		'移动端机房首列要 max-content，允许按机房名长度撑开');
});

test('CSS：展开态说明文字顶回 opacity，次文色只稀释一次', () => {
	/* r192（审查 P1-1）：Argon 的 cascade.css 给 .cbi-value-description 挂了
	   opacity:.5，插件只改 color 不改透明度时，13px 说明被对折成
	   2.81:1（浅）/ 3.62:1（暗）。修法是显式 opacity:1 + 次文色（5.41 / 6.28）。
	   次文色 --cfi-muted 本身是 color-mix(… 74%, transparent)，带 α0.74；
	   子元素如果再用一次就会叠成 α0.55（12px 正文掉到约 3.0:1），所以
	   .help-body 必须继承父级颜色，不能自己再写 var(--cfi-muted)。 */
	const css = read();
	const open = css.match(
		/\.cfp \.cbi-value-description\[data-cfi-help\]\[data-cfi-open="1"\]\s*\{([^}]*)\}/
	);
	assert.ok(open, '没有找到展开态规则');
	assert.match(open[1], /opacity:\s*1\s*;/,
		'展开态必须显式 opacity:1，否则被主题的 .5 对折');
	assert.match(open[1], /color:\s*var\(--cfi-muted\)/,
		'展开态用次文色，与同页分组提示同一视觉重量');

	const body = css.match(/\.cfp \.help-body\s*\{([^}]*)\}/);
	assert.ok(body, '没有找到 .help-body 规则');
	assert.match(body[1], /color:\s*inherit/,
		'.help-body 要继承父级颜色，二次套 --cfi-muted 会把 α 叠成 0.55');
});

test('CSS：暗色复选框在边框内侧补一圈内阴影', () => {
	/* r193（审查 P2-1）：暗色下未勾选复选框只有 #3c3c3c 描边（1.28:1），
	   主题把 border-color 写死并带强制优先，插件改不动边框 —— 只能在边框内侧
	   用内阴影补一圈（实测 rgb(132,132,132) on #2b2b2e = 3.77:1）。
	   这条测试守三件事：规则在暗色块里、用的是 box-shadow 而不是 border、
	   且不去碰 outline（那是焦点指示的通道，抢了会把键盘焦点吃掉）。 */
	const rules = parseRules(read());
	const dark = rules.filter((r) => r.media === '@media (prefers-color-scheme: dark)');
	const hit = dark.find((r) => /input\[type=checkbox\]/.test(r.sel));
	assert.ok(hit, '暗色块里应有一条复选框描边规则');
	assert.ok(hit.props.includes('box-shadow'),
		'用内阴影补环：border-color 被主题的强制优先锁死');
	assert.ok(!hit.props.includes('outline'),
		'不要动 outline：键盘焦点靠它，插件的选择器会盖掉主题的焦点样式');
});
