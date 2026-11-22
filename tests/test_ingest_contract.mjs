/* NAV ingest JSON 契约校验：确保采集器(Go) 与 云端(Worker/TS) 对 /api/ingest 的字段定义一致。
 *
 * 背景：采集器在 openwrt-packages 仓库，云端在 ybjbox/nav（私有）仓库。两边各写一份 JSON 结构，
 * 靠人同步迟早会漏。本脚本从两边源码提取 json 字段名并比对，不一致就 fail。
 *
 * 两种运行模式：
 *  A) 基线模式（默认，无需 token）：校验 metrics.go 字段 == ingest-fields.txt 清单。
 *     改 Go 字段必须同步改清单，否则 CI 红。
 *  B) 跨仓模式（提供 --nav-source <路径> 或 NAV_HANDLERS_TS 环境变量）：
 *     额外把 nav 的 worker/handlers.ts 字段与 Go 侧比对，真正拦住"改一边忘另一边"。
 *     CI 中可配置 NAV_READ_TOKEN 拉取私有仓库的 handlers.ts 后传入。
 *
 * 用法：
 *   node tests/test_ingest_contract.mjs
 *   node tests/test_ingest_contract.mjs --nav-source /path/to/nav/worker/handlers.ts
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(here, '..');
const GO_FILE = path.join(root, 'nav-collector/src/internal/metrics/metrics.go');
const BASELINE = path.join(root, 'nav-collector/src/internal/metrics/ingest-fields.txt');

/* ---- 参数：nav 侧 handlers.ts 来源（可选）---- */
let navTsPath = process.env.NAV_HANDLERS_TS || '';
const argv = process.argv.slice(2);
for (let i = 0; i < argv.length; i++) {
	if (argv[i] === '--nav-source' && argv[i + 1]) navTsPath = argv[++i];
}

let failed = false;
function fail(msg) { console.error('[FAIL] ' + msg); failed = true; }
function ok(msg) { console.log('[PASS] ' + msg); }
const exists = (p) => { try { return !!p && fs.existsSync(p); } catch { return false; } };
const uniqSort = (a) => [...new Set(a)].sort();

/* ---- 1. 提取 Go 字段 ---- */
if (!exists(GO_FILE)) {
	fail('找不到 Go 契约文件: ' + GO_FILE);
	process.exit(1);
}
const goSrc = fs.readFileSync(GO_FILE, 'utf8');
const goFields = uniqSort([...goSrc.matchAll(/json:"([a-zA-Z_][a-zA-Z_0-9]*)/g)].map((m) => m[1]));
if (!goFields.length) fail('未能从 metrics.go 提取到任何 json 字段（正则需更新？）');
else ok('Go 侧提取到 ' + goFields.length + ' 个字段');

/* ---- 2. 基线模式：Go 字段 == ingest-fields.txt ---- */
if (exists(BASELINE)) {
	const baseline = uniqSort(fs.readFileSync(BASELINE, 'utf8').split(/\r?\n/).map((s) => s.trim()).filter(Boolean));
	const missingInBaseline = goFields.filter((f) => !baseline.includes(f));
	const staleInBaseline = baseline.filter((f) => !goFields.includes(f));
	if (missingInBaseline.length) fail('metrics.go 有字段但清单未登记（请更新 ingest-fields.txt）: ' + missingInBaseline.join(', '));
	if (staleInBaseline.length) fail('清单有字段但 metrics.go 已无（请更新 ingest-fields.txt）: ' + staleInBaseline.join(', '));
	if (!missingInBaseline.length && !staleInBaseline.length) ok('Go 源码与字段清单一致（' + baseline.length + ' 个字段）');
} else {
	fail('缺少字段清单基线: ' + BASELINE);
}

/* ---- 3. 跨仓模式：与 nav 的 handlers.ts 比对 ---- */
if (navTsPath) {
	if (!exists(navTsPath)) {
		fail('--nav-source 指定的文件不存在: ' + navTsPath);
	} else {
		const tsSrc = fs.readFileSync(navTsPath, 'utf8');
		ok('已读取 nav 侧契约文件: ' + navTsPath);
		const blockMatch = tsSrc.match(/let\s+snap\s*:\s*\{([\s\S]*?)\n\s*\}\s*;/);
		if (!blockMatch) {
			fail('未能定位 handlers.ts 中的 `let snap: { ... };` ingest 类型块（结构变了？）');
		} else {
			const tsFields = uniqSort([...blockMatch[1].matchAll(/\b([a-z][a-z_0-9]*)\??\s*:/g)].map((m) => m[1]));
			ok('TS 侧提取到 ' + tsFields.length + ' 个字段');
			const goOnly = goFields.filter((f) => !tsFields.includes(f));
			const tsOnly = tsFields.filter((f) => !goFields.includes(f));
			if (goOnly.length) fail('采集器有、云端缺失的字段（云端读不到）: ' + goOnly.join(', '));
			if (tsOnly.length) fail('云端有、采集器缺失的字段（云端读到空值）: ' + tsOnly.join(', '));
			if (!goOnly.length && !tsOnly.length) ok('跨仓 ingest 契约一致（' + goFields.length + ' 个字段全部对齐）');
		}
	}
} else {
	console.log('[提示] 未提供 nav 侧 handlers.ts，跳过跨仓比对。配置 NAV_READ_TOKEN 后可启用完整校验。');
}

/* ---- 4. 关键字段存在性（防止两边一起删了核心字段）---- */
for (const must of ['ts', 'source', 'devices', 'services', 'alerts']) {
	if (!goFields.includes(must)) fail('核心字段缺失: ' + must);
}

if (failed) {
	console.error('\n[注意] ingest 契约不一致：请同步修改 Go 源码、字段清单，以及 ybjbox/nav 的 worker/handlers.ts。');
	process.exit(1);
}
console.log('\ningest 契约校验通过。');
