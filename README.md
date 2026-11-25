# ybjbox's OpenWrt Packages Repository

个人自定义 OpenWrt / LuCI 插件与增强包合集仓库。

---

## 📦 包含插件列表与适配说明

| 插件名称 | 说明 | 适配 OpenWrt 版本 | 状态 |
| :--- | :--- | :--- | :---: |
| [**luci-app-cf-ipcheck**](./luci-app-cf-ipcheck) | 在本机实测 Cloudflare 边界 IP 的可用性与四段耗时，产出 ip.txt，可写 Cloudflare DNS / 上传 Gist；设置已精简为 33 项（高级 12 / 常驻 20） | OpenWrt / ImmortalWrt 23.05 ~ 25.12 (LuCI JS) | 🟢 r177 已真机验证（LibWrt 25.12.2 / aarch64_cortex-a53） |

---

---

## 🚀 使用方法

在您的 OpenWrt / ImmortalWrt 源码根目录下执行：

```bash
# 克隆本仓库到 package 目录
git clone https://github.com/ybjbox/openwrt-packages.git package/openwrt-packages

# 更新并安装 Feeds
./scripts/feeds update -a
./scripts/feeds install -a
```

之后在 `make menuconfig` 中即可勾选所需插件。

---

## 🧪 开发与测试

改完 `luci-app-cf-ipcheck` 请跑一遍这几项（都在仓库根目录执行）：

```bash
# 1) 视图产物与源一致（改过 view-src 先跑 build）
sh tools/build-view.sh --check

# 2) 静态红线（POSIX sh 语法 / 跨包重复路径 / 视图陷阱 / 执行位 / JSON 契约 / 子命令名）
sh tests/lint.sh

# 3) 视图纯逻辑 + 组件：30 条
node --test tests/unit/*.test.mjs

# 4) 对外契约：144 条（含 33 个设置字段）
node tests/contract.mjs

# 5) 最小 DOM 冒烟
node tests/smoke.mjs
```

`cf-ipcheck selftest` 与 `tests/test_cf_ipcheck.sh` 在 Windows 开发机上会因 BusyBox
语义差异挂住，**由 CI 的 engine job 覆盖**，不要把它们当本地必跑项。
CI 的 view job 会跑 `build --check`、unit、contract；SDK 构建要手动 dispatch，
并且当前用 `aarch64_cortex-a53-25.12.2`（25.12.5 的 244MB SDK 下载会卡）。

---

## 📄 开源协议

[Apache License 2.0](LICENSE)
