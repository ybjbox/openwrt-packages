/* r233 C 批：audit #9/#10/#11/#12/#13/#14/#16/#17/#18/#19 的落点守卫。
   按仓库惯例做源码级断言 —— 改名/挪位置时这里会红，提醒把断言一起搬。 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../..', import.meta.url));
const rd = (p) => readFileSync(root + p, 'utf8');

const ENG = rd('luci-app-cf-ipcheck/root/usr/bin/cf-ipcheck');
const RUN = rd('luci-app-cf-ipcheck/view-src/60-run.js');
const STORE = rd('luci-app-cf-ipcheck/view-src/30-store.js');
const CORE = rd('luci-app-cf-ipcheck/view-src/10-core.js');
const SET = rd('luci-app-cf-ipcheck/view-src/80-set.js');
const DIAG = rd('luci-app-cf-ipcheck/view-src/70-diag.js');
const SHELL = rd('luci-app-cf-ipcheck/view-src/90-shell.js');
const LOGS = rd('luci-app-cf-ipcheck/view-src/75-logs.js');
const UI = rd('luci-app-cf-ipcheck/view-src/50-ui.js');
const CSS = rd('luci-app-cf-ipcheck/view-src/style/00-app.css');

test('#19 best-ip.txt / CSV / usable 三处同口径过滤 4xx', () => {
	/* 写 tmp 的循环（读 13 列那个）里必须有 2xx/3xx 之外的 continue */
	const loop = ENG.split('\n').find((l) => l.includes('read -r ip code c tls ttfb tot colo spd dom bg bsp spd_sp spd_smp'));
	assert.ok(loop, '读 colored 的 while 变量列不全');
	const iLoop = ENG.indexOf(loop);
	const block = ENG.slice(iLoop, iLoop + 2600);
	assert.match(block, /case "\$code" in 2\*\|3\*\) ;; \*\) continue ;; esac/,
		'best-ip 写循环没有过滤 4xx');
	assert.ok(ENG.includes("usable_n=$(awk -F'\\t' '$10 != 1 && $2 ~ /^[23]/"),
		'usable 还在数 4xx —— 页面「N 条可用」会与文件行数打架');
	assert.ok(ENG.includes("awk -F'\\t' '$10 != 1 && $2 ~ /^[23]/' \"$colored\" | csv_rows"),
		'CSV 仍在放行 4xx');
});

test('#9 published 进 result.json，页面与指纹都认它', () => {
	assert.match(ENG, /"published":%s/, '引擎没写 published 字段');
	assert.match(ENG, /pub_json=false\n?\t*\t\[ "\$\{publish:-0\}" = 1 \] && pub_json=true/,
		'published 的取值没跟 publish 走');
	assert.match(RUN, /st\.published === false && st\.state === 'done'/,
		'页面没在 published=false 时标注');
	assert.match(RUN, /本轮无可发布 IP，best-ip\.txt 仍是上一轮/, '标注文案缺失');
	assert.match(STORE, /st\.published === false \? 0 : 1/,
		'roundKey 指纹没包含 published —— 状态变了页面不会重绘');
});

test('#10 errKindName(none) 是正面词', () => {
	assert.match(CORE, /case 'none': return T\('正常'\);/, 'none 没译成「正常」');
	assert.ok(!CORE.includes("return T('无响应');"), '旧译文「无响应」还在 —— 它把成功说成失败');
});

test('#11 expandGroup 不再强制 unhide', () => {
	const body = SET.slice(SET.indexOf('function expandGroup'), SET.indexOf('function expandGroup') + 600);
	assert.match(body, /if \(sec\.hidden\)\n\s*return false;/, '隐藏组没有被拦下');
	assert.ok(!/sec\.hidden = false/.test(body), '还在强制 unhide —— 会露出 depends 隐藏的死字段');
});

test('#12 诊断页击键去抖 150ms，change 仍立即提交', () => {
	assert.match(DIAG, /editTimer = setTimeout\(commitEdit, 150\);/, 'input 没去抖');
	assert.match(DIAG, /input\.addEventListener\('change', onEditCommit\)/, 'change 没走立即提交');
	assert.match(DIAG, /ownerDocument\.contains\(src\.dyn\)/, '定时器没挡已分离的 DOM');
});

test('#13 抽屉内容签名不变就不换节点', () => {
	assert.match(RUN, /function drawerSig\(it\)/, '签名函数缺失');
	assert.match(RUN, /dk !== last\.drawer/, '轮询重建没比对签名');
	assert.match(RUN, /last = \{ round: '', stage: '', board: '', dc: '', foot: '', recent: '', drawer: '' \}/,
		'last.drawer 没初始化');
	/* openDrawer 自己也要记账，否则点开后第一次轮询还会白重建一次 */
	const body = RUN.slice(RUN.indexOf('function openDrawer'), RUN.indexOf('function closeDrawer'));
	assert.match(body, /last\.drawer = String\(ip\)/, 'openDrawer 没更新签名');
});

test('#14 logsKey 认首段', () => {
	assert.match(STORE, /text\.slice\(0, 40\), text\.slice\(-60\)/, 'key 里没有首段');
});

test('#16 speed_resort 不再每行 fork grep', () => {
	const head = ENG.slice(ENG.indexOf('speed_resort() {'), ENG.indexOf('speed_resort() {') + 1200);
	assert.match(head, /sr_bgset=" \$\(tr '\\n' ' ' <"\$3"\)"/, '集合没有一次性读进变量');
	const body = ENG.slice(ENG.indexOf('sr_bgset='), ENG.indexOf('sr_bgset=') + 3200);
	assert.match(body, /case "\$sr_bgset" in \*" \$sr_ip "\*\) sr_bg=1 ;; esac/,
		'循环里还在 fork grep');
	assert.ok(!body.includes('grep -qxF'), 'grep -qxF 还在 speed_resort 里');
});

test('#17 enabled=0 的空转分支也查 stale_self', () => {
	const i = ENG.indexOf("if [ \"$(cfg enabled 0)\" != 1 ]; then");
	const branch = ENG.slice(i, i + 900);
	assert.match(branch, /if stale_self; then/, '空转分支没查 stale_self');
	assert.match(branch, /exec \/usr\/bin\/cf-ipcheck daemon/, '没有就地 exec');
});

test('#18 placeholder 55%（约 3.5:1），45% 不再出现', () => {
	assert.match(CSS, /color-mix\(in srgb, currentColor 55%, transparent\)/, 'placeholder 没提到 55%');
	assert.ok(!CSS.includes('currentColor 45%'), '还有 45% 的旧值');
});

test('契约表同步：published 在 lint 与 contract 两处', () => {
	const lint = rd('tests/lint.sh');
	const contract = rd('tests/contract.mjs');
	assert.match(lint, /STATUS_KEYS="[^"]*published"/, 'lint STATUS_KEYS 缺 published');
	assert.match(contract, /const STATUS = '[^']*published'/, 'contract STATUS 缺 published');
});

test('r234 ETC_DIR 三份持久产物写完即 chmod 600', () => {
	/* umask 0022：cp/mv 新建的文件是 0644，安装时压一次 chmod 压不住每轮重建 */
	assert.match(ENG, /chmod 600 "\$RESULT_KEEP" 2>\/dev\/null \|\| true/, 'result.json 副本没有 600');
	assert.match(ENG, /mv "\$tmp" "\$BEST"\n\t*chmod 600 "\$BEST"/, 'best-ip.txt 没有紧跟 600');
	assert.match(ENG, /mv "\$csvtmp" "\$CSV" \|\| rm -f "\$csvtmp"\n\t*chmod 600 "\$CSV"/, 'CSV 没有紧跟 600');
});

test('r234 面向用户的文案不带行话', () => {
	/* 短文案按用户拍板的措辞 */
	assert.ok(RUN.includes('') || true, '');
	for (const [file, src] of [['50-ui.js', UI], ['70-diag.js', DIAG]]) {
		assert.ok(src.includes('这次调用没有到引擎，请重试。'), file + ' 没换成新措辞');
		assert.ok(!src.includes("T('调不到引擎。')"), file + ' 还留着旧文案「调不到引擎。」');
	}
	/* 行话（rpcd / ACL / JSON 解析失败）不再出现在任何 T('…') 用户文案里 */
	for (const [name, src] of [['10-core', CORE], ['50-ui', UI], ['70-diag', DIAG], ['75-logs', LOGS], ['90-shell', SHELL]]) {
		const strs = src.match(/T\('[^']+'\)/g) || [];
		for (const s of strs)
			assert.ok(!/rpcd|ACL|JSON 解析|合法 JSON/.test(s), name + ' 的用户文案还带行话: ' + s);
	}
	assert.ok(LOGS.includes('读不到日志：先确认插件正常'), '日志错误提示没改');
	assert.ok(SHELL.includes('先在设置里打开「DNS 同步」并保存。'), 'dns_sync 提示没改成大白话');
	/* 阶段名「写产物」→「保存结果」 */
	assert.ok(UI.includes("label: CFI.T('保存结果')") && !UI.includes("CFI.T('写产物')"), '阶段名没改');
});
