# nav-collector — NAV 采集器（唯一真源）

本目录是 NAV 采集器代码的**唯一真源**，采集器仅以 OpenWrt 插件形态部署在路由器上（唯一采集端）：

| 形态 | 入口 | 用途 |
|---|---|---|
| OpenWrt 插件 | `Makefile` + `files/` + `src/` | 编译进 FanchmWrt 固件（固件 builder 通过 feed 引用本仓库） |
| 独立 ipk | 本目录 + OpenWrt SDK | `make package/nav-collector/compile` |

## 目录
- `src/`：完整 Go module（cmd/collector + internal 探针/告警/通知/推送/UI），`go.mod` 模块名 `nav/collector`
- `files/`：UCI 默认配置 `config`、procd 脚本 `nav.init`、LuCI 配置页三件套（`nav-menu.json`/`nav.acl`/`luci-nav.js`）
- `Makefile`：OpenWrt 包定义（依赖 `luci-base` + packages feed 的 golang；`GO_PKG_INSTALL_ALL:=1` 因 `//go:embed page.html`）

> NAS 指标由路由器插件经 SSH 只读回采（NAS 零安装），不需要也不提供 NAS Docker 形态。

## 配置
- UCI：`/etc/config/nav`（路由器的 `uci` 或 LuCI 后台「服务 → NAV 采集器」）
- 本地配置页：`http://<路由器IP>:12900/`（仅 LAN，需设置 `nav.ui.password`）
- 推送地址正式值：`https://nav.403333.xyz/api/ingest`

## 契约（ingest JSON，两仓库必须一致）
采集器经 `POST /api/ingest` 推送快照，JSON 结构由 `src/internal/metrics/metrics.go` 定义，
必须与云端 `ybjbox/nav` 的 `worker/handlers.ts` 中 `let snap` 类型保持一致。

**改字段必须同步三处，漏一处 CI 会拦：**
1. `src/internal/metrics/metrics.go` —— Go 结构体（json tag）
2. `src/internal/metrics/ingest-fields.txt` —— 字段清单基线（由脚本校验与 Go 一致）
3. `ybjbox/nav` 仓库的 `worker/handlers.ts` —— 云端读取类型

**自动校验**：
- 本仓库 CI 的 `view-test` job 跑 `tests/test_ingest_contract.mjs`，校验 Go 源码 ↔ 清单一致（无需额外配置）。
- 另设 `ingest-contract-crossrepo` job 做真正的跨仓比对（Go ↔ 云端 handlers.ts）：需在仓库 Secrets 配置
  `NAV_READ_TOKEN`（一个能读取私有仓库 `ybjbox/nav` 的 PAT，仅需 repo 读权限）。未配置时该 job 跳过，不影响其他检查。
- 本地也可手动跑：`node tests/test_ingest_contract.mjs --nav-source <nav仓库>/worker/handlers.ts`

## 构建
```sh
# Go 静态检查与编译
cd src && go build ./... && go vet ./...
# OpenWrt 包（在固件树或 SDK 中）
make package/nav-collector/compile V=s
```
