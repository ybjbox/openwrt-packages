/* r232：speed_samples 要说真话（只读静态断言，不碰设备）。
 *
 * 事故背景：result.json 的 speed_samples 一直是倒推出来的 ——
 *   smp = ($11 == "") ? 0 : (($12 == "") ? 1 : 2)
 * 也就是「有 bps 就算 1 个样本，有 spread 就算 2 个」。而 r225 起精测跑**三遍**，
 * speed_merge 早就算出真实样本数（第 5 列，0..3），只是没人把它写进 colored.tsv。
 * 于是三遍全测的 IP 在 JSON 里报 2，与日志「精测三遍」、页面权重说明三处对不上；
 * 更麻烦的是「两个有效样本」和「三个有效样本」在数据上分不开，排查稳定性时
 * 没法判断 spread 是首末还是首中末。
 *
 * 这一批：samples 从 speed_merge 一路透传到 colored.tsv 第 13 列 → JSON，
 * 顺带把「只有粗筛」的 samples 记成 1（它确实只有一个样本，显示「只测到一遍」）。
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..', '..');
const pkg = path.join(root, 'luci-app-cf-ipcheck');
const engine = fs.readFileSync(path.join(pkg, 'root', 'usr', 'bin', 'cf-ipcheck'), 'utf8');
const form = fs.readFileSync(path.join(pkg, 'view-src', '55-form-schema.js'), 'utf8');
const defaults = fs.readFileSync(path.join(pkg, 'root', 'etc', 'config', 'cf_ipcheck'), 'utf8');

function body(name) {
	const i = engine.indexOf(name + '() {');
	assert.notEqual(i, -1, `切不出 ${name}()`);
	return engine.slice(i, engine.indexOf('\n}\n', i));
}

test('r232 speed_merge：只有粗筛的记录 samples 记 0（没进精测）', () => {
	const sm = body('speed_merge');
	/* 第二个循环（只有 screen 记录的 IP）里 samples 必须是 0：这一列说的是
	 * 「精测跑成了几遍」，粗筛那一个样本不算 —— 它不是精测。 */
	const tail = sm.slice(sm.lastIndexOf('for (ip in sc)'));
	assert.match(tail, /printf "%s\\t%d\\t%d\\t\\t0\\n", ip, sc\[ip\], str\[ip\]/,
		'只有粗筛时 samples 不再记 0 —— 「仅粗测」与「精测只成一遍」就分不开了');
	/* confirm 分支的 samples 仍是有效样本计数（cnt 只数 bps>0 的遍） */
	assert.match(sm, /samples = cnt/, 'samples 不再是有效样本计数');
});

test('r232 抽屉：spread 为空时按 samples 分「仅粗测 / 精测只成 1 遍」', () => {
	const run = fs.readFileSync(path.join(pkg, 'view-src', '60-run.js'), 'utf8');
	assert.match(run, /var smp = Number\(it\.speed_samples\) \|\| 0;/, '抽屉没取 samples');
	assert.match(run, /else if \(smp === 0 && it\.speed_bps != null\)/, '缺「仅粗测」分支');
	assert.match(run, /CFI\.T\('仅粗测（未进精测）'\)/, '「仅粗测」文案没写');
	assert.match(run, /else if \(smp === 1\)/, '缺「精测只成一遍」分支');
	assert.ok(run.indexOf("CFI.T('只测到一遍')") === -1, '旧的「只测到一遍」还在（会把只粗筛说成测了没成）');
});

test('r232 write_outputs：samples.map 跨轮清空，且与 spread.map 一次写出', () => {
	const wo = body('write_outputs');
	assert.match(wo, /: >"\$RUN_DIR\/samples\.map"/, 'samples.map 没在开轮时清空 —— 本轮没测速会读到上一轮的样本数');
	/* 两个 map 由同一条 awk 写出（别为并列多 fork 一次） */
	const line = wo.split('\n').find((l) => l.includes('samples.map" \'') || l.includes('-v mp='));
	assert.ok(line, '没找到写 samples.map 的那条 awk');
	assert.match(wo, /-v sp="\$RUN_DIR\/spread\.map" -v mp="\$RUN_DIR\/samples\.map"/, 'spread/samples 没合并成一次 awk');
	/* colored.tsv 从 12 列变 13 列：格式串与参数行一起看，别只改一处 */
	const fmt = wo.split('\n').find((l) => l.includes("printf '%s\\t"));
	assert.ok(fmt, '没找到写 colored.tsv 的格式串');
	assert.match(fmt, /(?:%s\\t){12}%s\\n/, 'colored.tsv 的格式串不是 13 列');
	const args = wo.split('\n').find((l) => l.includes('"$ip" "$code" "$c" "$tls"'));
	assert.ok(args, '没找到写 colored.tsv 的参数行');
	assert.match(args, /"\$ip" "\$code" "\$c" "\$tls" "\$ttfb" "\$tot" "\$colo" "\$spd" "\$dom" "\$bg" "\$bsp" "\$spd_sp" "\$spd_smp"/,
		'colored.tsv 的参数顺序变了');
	assert.match(wo, /colored\.tsv 的 13 列/, '列序注释还停在 12 列');
	/* 读 colored 的 while 必须把变量列全：read 会把多余字段并进最后一个变量。
	 * 注意 write_outputs 里还有两个读 qualified.tsv / ranked.tsv 的 8 列 read，
	 * 别用 "read -r ip code c tls" 去找 —— 会命中最先出现的那个。 */
	const rd = wo.split('\n').find((l) => l.includes('dom bg bsp spd_sp spd_smp; do'));
	assert.ok(rd, '没找到读 colored.tsv 的 13 列 while');
});

test('r232 result.json：speed_samples 读第 13 列，不再按 spread 倒推', () => {
	assert.match(engine, /smp = \(\$13 == ""\) \? \(\(\$11 == ""\) \? 0 : 1\) : \$13 \+ 0/, 'JSON 还在倒推样本数');
	assert.ok(!/smp = \(\$11 == ""\) \? 0 : \(\(\$12 == ""\) \? 1 : 2\)/.test(engine), '旧的「有 spread 就是 2」还在');
	/* 上限守卫：samples 语义是 0..3，脏数据不许原样进 JSON */
	assert.match(engine, /if \(smp > 3\) smp = 3/, '缺 samples 上限守卫');
});

test('r232 引擎有 _speedmerge 离线入口（samples 口径可单独驱动）', () => {
	assert.match(engine, /_speedmerge\) speed_merge /, '缺 _speedmerge 子命令，samples 口径只能整轮跑才验得到');
});

test('r232 流量文案：按默认设置 180MB，不再是过期的 105MB', () => {
	assert.match(form, /var ROUND_TRAFFIC_MB = 180;/, '缺每轮流量常量');
	assert.match(form, /secs\.length \* ROUND_TRAFFIC_MB/, '每日流量预览没走常量');
	assert.ok(!/\*\s*105\b/.test(form), '每日预览还乘着旧常数 105');
	assert.ok(form.indexOf('约 105MB') === -1, '帮助文本还写着约 105MB');
	/* 帮助文本要写清构成，否则用户改了两个字节数就不知道这数怎么来的 */
	assert.match(form, /按默认设置约 180MB（粗测 20 个 4MB \+ 精测 3 个各 10MB 测 3 遍）/, '帮助文本没写清流量构成');
});

test('r232 配置模板：精测是「三遍」，不是 r225 之前的两遍', () => {
	assert.ok(defaults.indexOf('复测**两遍**') === -1, 'config 模板还写着精测两遍');
	assert.match(defaults, /复测\*\*三遍\*\*/, 'config 模板没写三遍');
	assert.match(defaults, /流量是 N × 字节 × 3/, '流量公式还是 ×2');
});
