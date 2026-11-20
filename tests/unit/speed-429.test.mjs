/* r223：端点限流（HTTP 429）必须可见（只读静态断言，不碰设备）。
 *
 * 事故背景（2026-11-20 真机）：speed.cloudflare.com 按**来源 IP** 限流，4 分钟内
 * 26 次 10 MiB 下载即触发，两个不同候选 IP 同时被拒、冷却 >18 分钟。而当时：
 *   1. speed_reject.tsv 把 429 记成 not_file（与「这个 IP 回了错误页」同类），
 *   2. 轮次日志只说「服务端回的不是文件」，
 *   3. 单 IP 测速日志打的是延迟探测的「HTTP 200 / 吞吐未测到」，
 *   4. status 里完全没有这个信息。
 * 结果：吞吐整列为空，人只能去猜 IP/链路。这四条各钉一条断言。
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..', '..');
const pkg = path.join(root, 'luci-app-cf-ipcheck');
const engine = fs.readFileSync(path.join(pkg, 'root', 'usr', 'bin', 'cf-ipcheck'), 'utf8');

function body(name) {
	const i = engine.indexOf(name + '() {');
	assert.notEqual(i, -1, `切不出 ${name}()`);
	return engine.slice(i, engine.indexOf('\n}\n', i));
}

test('r223 speed_of：429 单独记成 rate_limit，不再混进 not_file', () => {
	const sp = body('speed_of');
	assert.match(sp, /\[ "\$sp_code" = 429 \] && sp_why=rate_limit/, '429 没有单独的拒绝原因');
	/* 顺序守卫：429 的分支必须排在 generic 默认值之后，否则会被覆盖成 not_file。
	 * 反过来也不行 —— 若 429 写在最前面，后面 too_small/no_response 会把它改掉。 */
	const i429 = sp.indexOf('sp_why=rate_limit');
	const iDef = sp.indexOf('sp_why=not_file');
	assert.ok(iDef !== -1 && i429 > iDef, 'rate_limit 必须写在默认值之后（否则被覆盖）');
});

test('r223 轮次日志：限流单独报，并不再被算成「回的不是文件」', () => {
	const wo = body('write_outputs');
	assert.match(wo, /\$4 == "rate_limit"/, '没有统计 rate_limit');
	assert.match(wo, /端点限流：本轮/, '没有单独一行端点限流日志');
	/* 那条「服务端回的不是文件」的统计必须排除 rate_limit，否则同一次限流被报两遍、
	 * 而且指向了错误的排查方向。 */
	const rejLine = wo.split('\n').find((l) => l.includes('rej_n=$(awk') ) || '';
	assert.match(rejLine, /\$4 != "rate_limit"/, 'rej_n 仍把限流算成「回的不是文件」');
});

test('r223 status：带出 speed_429（页面据此提示）', () => {
	const wo = body('write_outputs');
	assert.match(wo, /"speed_429":%s/, 'result.json 没有 speed_429 字段');
	assert.match(wo, /"\$\{rl_n:-0\}"/, 'speed_429 的实参没接上 rl_n');
});

test('r223 单 IP 测速：429 时日志写清原因，不再只说「吞吐未测到」', () => {
	const t = body('test_one_ip');
	assert.match(t, /端点限流 429/, '单 IP 日志没有把 429 说出来');
	assert.match(t, /吞吐未测到\$trewhy/, '日志串没接上原因变量');
});

test('r223 视图：诊断页读 speed_429 并纳入重画指纹', () => {
	const view = fs.readFileSync(path.join(pkg, 'view-src', '70-diag.js'), 'utf8');
	assert.match(view, /st\.speed_429/, '诊断页没有读 speed_429');
	assert.match(view, /HTTP 429/, '诊断页没有 429 的说明文案');
});
