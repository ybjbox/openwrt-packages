# AGENTS.md —— 给任何 AI 工具的工程约定

本仓库里 `luci-app-cf-ipcheck` 是一个体量不小的 OpenWrt LuCI 插件。
下面这些约束不是风格偏好，违反了会**静默地**把东西弄坏。

## 动手前先读

**[`luci-app-cf-ipcheck/接手指南.md`](./luci-app-cf-ipcheck/接手指南.md)** —— 完整接手材料：
模块地图、硬边界、29 条踩坑清单（症状→根因→修法）、真机操作手册、
测试不变量、当前进度与待办。**不要凭直觉改这个包。**

设计调性（用户画像 / 文案语气 / 视觉方向）见 [`.impeccable.md`](./.impeccable.md)。

## 五条最关键的

1. **运行时只装一个 `settings.js`，但源码不写在那里面。**
   源码在 `luci-app-cf-ipcheck/view-src/`，按 `manifest.txt` 顺序由
   `sh tools/build-view.sh` 拼成 `htdocs/.../settings.js` 与 `settings.css`。
   **产物永远不手改**；改完源码必须重新构建，`--check` 会校验产物与源逐字节一致。
   ⚠️ 源目录不能叫 `src/`：luci.mk 看到包内 `src/` 会把它当编译型源码包，多调一次
   `Build/Install/Default` 并复制空的 `PKG_INSTALL_DIR`，构建直接失败（2026-10-29 踩过）。
   运行时仍是单文件（uhttpd 每多一个 JS 就多一次请求）。

2. **前端没有一处语义所有权。** 所有功能语义在 `root/usr/bin/cf-ipcheck` 里定义
   （uci 键名、判定链路、JSON 键、状态枚举），视图只是把它画出来。**先改引擎，再改页面。**

3. **契约是四方的**：引擎子命令 → ucode 插件方法 → ACL 条目 → 视图 `RPC_METHODS`。
   少改一处 `tests/lint.sh` 的 red-line-12 直接红。

4. **只装 CI 产物做验证。** 手工 `cp + chmod` 会藏住 git mode、行尾这类打包缺陷。

5. **插件不写路由器的任何配置文件。** 唯一对外副作用是往 Cloudflare 写 DNS 记录，
   且只碰带 `comment=cf-ipcheck` 标记的（自己建的）记录。

## 改完必须跑（仓库根）

```sh
sh tools/build-view.sh --check   # 产物与源一致（改完源码先跑 build）
sh tests/lint.sh                 # 期望：all lint checks passed
node --test tests/unit/*.test.mjs  # 纯逻辑：六态/格式化/dns 往返/hash 迁移/指纹
node tests/contract.mjs          # 引擎↔ucode↔ACL↔uci↔字段表↔产物 156 条
node tests/smoke.mjs             # 最小 DOM 里跑一遍 render
```

`tests/viewtest.mjs` 是 r120 及以前的旧桩测，**CI 已不再运行它**，只作行为参考。

引擎的离线回归（`tests/test_cf_ipcheck.sh` 与 `cf-ipcheck selftest`）在 Windows 开发机上
会挂住（busybox 语义差异），**由 CI 覆盖**。别把本地超时当成回归。

## 出包

- `push` 到 main 只触发 **lint + 视图桩测 + 引擎回归**；
  **SDK 构建要手动派发** `workflow_dispatch`（命令见接手指南 §4.2）。
- `PKG_RELEASE`（Makefile）与 `VIEW_BUILD`（视图顶部）**必须同时改**，lint 核对两者相等。
- 产物下载**必须带重试**。一次 SDK 构建 3~13 分钟，攒一批改动再构建。

## 提交前

```sh
git update-index --chmod=+x luci-app-cf-ipcheck/root/usr/libexec/cf-ipcheck/apply-dns.sh
git ls-files -s luci-app-cf-ipcheck/root/usr/libexec/cf-ipcheck/apply-dns.sh   # 要看到 100755
```

本机 `core.filemode=false`，直接 `git add` 会丢执行位（真踩过：手工能装、CI 包不行）。

## 写代码时的硬约束

- **ES5 写法**（`var` / `function`）：`luci.mk` 的 `JsMin` 是字符级压缩器，不认模板字符串。
- **不加 `po/`**：`i18n-scan.pl` 对 `.js` 只认 `_()` / `N_()`，不认自定义包装 `T()`，
  加了会造成"半翻译"（页面主体永远中文）。
- **吞吐单位固定十进制 MB/s**（`speed_mbytes`），lint 里 `speed_mbps` / `speed_mibs` 出现即红。
- **新增断言要做反向验证**：把对应的代码改坏，确认测试真的会红，否则断言可能空转。
- **前端出包后过一道关卡**：把设备上已安装的压缩版取回来做语法检查
  （jsmin 可能压坏新写法，本地测试发现不了）。
