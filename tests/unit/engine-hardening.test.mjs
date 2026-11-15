/* r204：安全与正确性加固（只读静态断言，不碰设备）。
 *
 * 这一批改动全是"没有新功能、但错了会咬人"的类型，靠页面看不出来，所以每条
 * 都钉一个可静态判的形状：
 *   1. probe_port ≠ 443 时 URL 必须带端口 —— curl 的 --resolve 是 host:port 精确
 *      匹配，URL 不带端口就按 443 查表，查不到就退回真实 DNS。三处调用
 *      （probe_cmd / trace_colo / canary_check）要一起改，漏一处就静默失效。
 *   2. speed_path 拼出来的 URL 必须被单引号包住再进 `su -c` 的命令串，否则路径里
 *      一个 & 就把命令截断，吞吐整列「未测到」。
 *   3. 凭证不进 argv、配置与日志不能是 0644。
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..', '..');
const pkg = path.join(root, 'luci-app-cf-ipcheck');
const engine = fs.readFileSync(path.join(pkg, 'root', 'usr', 'bin', 'cf-ipcheck'), 'utf8');
const applyDns = fs.readFileSync(path.join(pkg, 'root', 'usr', 'libexec', 'cf-ipcheck', 'apply-dns.sh'), 'utf8');
const initd = fs.readFileSync(path.join(pkg, 'root', 'etc', 'init.d', 'cf-ipcheck'), 'utf8');
const defaults = fs.readFileSync(path.join(pkg, 'root', 'etc', 'uci-defaults', '90-cf-ipcheck'), 'utf8');

test('r204 probe_port：URL 侧统一走 hostport()', () => {
	assert.match(engine, /^hostport\(\) \{/m, '缺 hostport() 辅助函数');
	/* probe_cmd：URL 的主机名部分必须是 $hp，不能再是裸 $2 */
	const pc = engine.slice(engine.indexOf('probe_cmd() {'), engine.indexOf('\n}\n', engine.indexOf('probe_cmd() {')));
	assert.match(pc, /hp=\$\(hostport "\$2" "\$C_PORT"\)/, 'probe_cmd 没算 hp');
	assert.match(pc, /https:\/\/%s%s/, 'probe_cmd 的 URL 形状变了');
	assert.ok(!/https:\/\/%s%s[^"]*"\$2"/.test(pc), 'probe_cmd 的 URL 又用回裸域名了');
	/* trace_colo：/cdn-cgi/trace 那条 */
	const tc = engine.slice(engine.indexOf('trace_colo() {'), engine.indexOf('\n}\n', engine.indexOf('trace_colo() {')));
	assert.match(tc, /https:\/\/\$\(hostport "\$d" "\$C_PORT"\)\/cdn-cgi\/trace/, 'trace_colo 的 URL 没带端口');
	/* canary：判定「出口被接管」的那条，错了会让每轮都跳过测速/DNS */
	const cc = engine.slice(engine.indexOf('canary_check() {'), engine.indexOf('\n}\n', engine.indexOf('canary_check() {')));
	assert.match(cc, /hp=\$\(hostport "\$dom" "\$C_PORT"\)/, 'canary 没算 hp');
	assert.ok(!/https:\/\/\$dom\//.test(cc), 'canary 的 URL 不许再用裸域名（--resolve 不命中会误判被接管）');
});

test('r204 speed_path：URL 进命令串前要过 shq()', () => {
	assert.match(engine, /^shq\(\) \{/m, '缺 shq() 辅助函数');
	assert.match(engine, /sed "s\/'\/'\\\\\\\\''\/g"/, 'shq 的转义写法变了，先看它还能不能把 a\'b 拼对');
	/* 唯一调用点必须包着 shq，且不能再是裸的 $(speed_url ...) */
	const line = engine.split('\n').find((l) => l.includes('speed_url "$C_SPEEDPATH"'));
	assert.ok(line, '没找到测速命令那一行');
	assert.match(line, /--resolve \$C_SPEEDDOM:\$C_PORT:\$sp_ip \$\(shq "\$\(speed_url/, '测速 URL 没被 shq 包住（& 会截断命令）');
});

test('r204 凭证：DNS 令牌不进 curl argv', () => {
	assert.ok(!/-H "Authorization: Bearer \$TOKEN"/.test(applyDns), '还留着把令牌放 argv 的 -H 写法');
	assert.match(applyDns, /auth_cfg \| "\$CURL" -sS -K -/, '没走 --config - 从 stdin 传头');
	/* dry-run 计划里打码是允许的，但只允许打码形态 */
	assert.ok(!/Bearer \$TOKEN[^"]*\\n/.test(applyDns.replace(/header = "Authorization: Bearer %s"/g, '')));
});

test('r204 配置与日志：600 是唯一屏障', () => {
	assert.match(initd, /chmod 600 \/etc\/config\/cf_ipcheck/, 'init.d 没有压配置权限');
	assert.match(defaults, /chmod 600 \/etc\/config\/cf_ipcheck/, 'uci-defaults 没有压配置权限');
	assert.match(engine, /: >>"\$LOG" 2>\/dev\/null \|\| true\nchmod 600 "\$LOG"/, '引擎没在启动时把日志压成 600');
	assert.match(applyDns, /chmod 600 "\$LOG"/, 'apply-dns 没把共用的日志压成 600');
});

test('r204 diag 的 uci 输出要打码', () => {
	const diag = engine.slice(engine.indexOf('do_diag() {'), engine.indexOf('\n}\n', engine.indexOf('do_diag() {')));
	assert.match(diag, /gist_token=.*\*\*\*/, 'gist_token 没打码');
	assert.match(diag, /dns_token=.*\*\*\*/, 'dns_token 没打码');
});
