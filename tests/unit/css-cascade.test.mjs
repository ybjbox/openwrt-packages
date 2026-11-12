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

test('CSS：P3 三处可读性收口（首选徽标 / 问号间距 / 显示密码按钮）', () => {
	/* r194（审查 P3-1/2/3）：
	   ① 11px 的「首选」徽标用主色原色只有 4.20:1（浅）/ 3.36:1（暗），
	      浅色改用 --cfi-primary-strong（5.21:1），暗色在暗色块里提亮到
	      70% 主色 + 30% 白（5.46:1）；基础规则不许再写回 var(--cfi-primary)。
	   ② 768–1199 是主题的 table-cell 两列布局，控件左缘贴在标题列右缘，
	      「?」占满 18px 跑道 → 间距 0。修法是把跑道加到 26px、问号右移 8px；
	      这条必须留在 768–1199 的媒体块里，别影响 ≥1200 的 flex + gap:8。
	   ③ 密码框的「显示密码」按钮是 LuCI 核心生成的，白字 on #8898aa 只有
	      2.95:1；压深到 #64748b 后 4.76:1。 */
	const css = read();
	/* parseRules 只收属性名，这里要核对具体值，直接按块取正文。 */
	const mediaRange = (q) => {
		const at = css.indexOf(q);
		assert.ok(at >= 0, `没有找到 ${q}`);
		let i = css.indexOf('{', at), depth = 1, j = i + 1;
		while (j < css.length && depth) { if (css[j] === '{') depth++; else if (css[j] === '}') depth--; j++; }
		return [i, j];
	};
	const mediaBody = (q) => { const [i, j] = mediaRange(q); return css.slice(i + 1, j - 1); };
	const ruleBody = (text, sel) => {
		const at = text.indexOf(sel);
		if (at < 0) return '';
		const open = text.indexOf('{', at);
		if (open < 0) return '';
		return text.slice(open + 1, text.indexOf('}', open));
	};
	const [ds, de] = mediaRange('@media (prefers-color-scheme: dark)');
	const base = css.slice(0, ds) + css.slice(de);

	const leadBody = (base.match(/\.cfp\[class\] \.tbl \.lead\s*\{([^}]*)\}/g) || []).join(' ');
	assert.ok(leadBody, '没有找到首选徽标的基础规则');
	assert.match(leadBody, /color:\s*var\(--cfi-lead\)/,
		'徽标字色要走令牌，不能直接用 --cfi-primary（浅色只有 4.20:1）');
	assert.match(base, /--cfi-lead:\s*var\(--cfi-primary-strong\)/,
		'浅色令牌应是深一档的主色（5.21:1）');

	const darkBody = mediaBody('@media (prefers-color-scheme: dark)');
	assert.match(darkBody, /--cfi-lead:\s*color-mix\(in srgb, var\(--cfi-primary\) 70%, #fff\)/,
		'暗色令牌要提亮到 70% 主色 + 30% 白（5.46:1）');
	assert.ok(!/\.cfp\[class\] \.tbl \.lead\s*\{/.test(darkBody),
		'暗色块里不要再写同选择器覆盖：基础规则在源文件里排在后面，会把暗色压回去');

	const gapBody = mediaBody('@media (min-width: 768px) and (max-width: 1199px)');
	assert.match(ruleBody(gapBody, '.cfp .cbi-value > .cbi-value-title'), /padding-right:\s*26px/,
		'768–1199 的标题跑道要加到 26px，给问号让出 8px');
	assert.match(ruleBody(gapBody, '.cfp .help-q'), /right:\s*8px/,
		'问号右移 8px 才不贴控件');

	/* dns 组在宽屏也不走两列 flex，单独补一次；作用域必须限定在 data-group="dns"。
	   注意 @media (min-width:1200px) 在文件里有多块，这里直接对整份源文匹配。 */
	assert.match(css,
		/\.cfp #cfi-pane-set \.cbi-section\[data-group="dns"\] \.cbi-value > \.cbi-value-title\s*\{\s*padding-right:\s*26px/,
		'dns 组在 ≥1200 也要留 8px 跑道');
	assert.match(css,
		/\.cfp #cfi-pane-set \.cbi-section\[data-group="dns"\] \.help-q\s*\{\s*right:\s*8px/,
		'dns 组的问号在 ≥1200 也要右移 8px');

	const pwBody = ruleBody(base, '.cfp .cbi-value-field .control-group > button.cbi-button-neutral');
	assert.ok(pwBody, '没有找到「显示密码」按钮的覆盖规则');
	assert.match(pwBody, /background-color:\s*#64748b/,
		'按钮底色压深到 #64748b，白字才够 4.5:1');
});
