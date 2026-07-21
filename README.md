# ybjbox's OpenWrt Packages Repository

个人自定义 OpenWrt / LuCI 插件与增强包合集仓库。

---

## 📦 包含插件列表与适配说明

| 插件名称 | 说明 | 适配 OpenWrt 版本 | 状态 |
| :--- | :--- | :--- | :---: |
| [**luci-app-dhcp-comment**](./luci-app-dhcp-comment) | LuCI DHCP 静态地址分配中文备注与活动租约列表显示增强 | OpenWrt 21.02 ~ 25.12 / ImmortalWrt (LuCI JS) | 🟢 已稳定 |
| [**athena-custom**](./athena-custom) | 雅典娜（IPQ6018）路由器专属默认初始化配置与性能优化包 | OpenWrt 23.05 ~ 25.12 / ImmortalWrt (qualcommax) | 🟢 已稳定 |
| [**sysupgrade-clash-cleaner**](./sysupgrade-clash-cleaner) | 固件保留配置升级时自动清理 OpenClash Smart 内核大文件缓存 | 所有 OpenWrt / ImmortalWrt 全系版本 | 🟢 已稳定 |

---

### 🔍 插件详细功能与特性

#### 1. `luci-app-dhcp-comment`
- **中文备注关联**：支持在静态 DHCP 分配中添加单行中文 Comment，并自动在活动 DHCP 租约列表中同步呈现。
- **原生界面保真**：采用开机差量切入模式（In-place Patching），100% 保留固件原生的所有页面样式、Tab 选项与高级设置。
- **智能设备兼容**：自动放宽前端 Hostname 校验，兼容米家、云米等智能家居设备默认带下划线 `_` 的主机名（如 `viomi-waterheater-e4_miap8647`）。
- **异常死角防护**：修补了原生 OpenWrt 在恢复旧备份时读取 DUID `ip6addrs[0]` 抛出 `Cannot read properties of undefined` 的崩溃 Bug。

#### 2. `athena-custom`
- **出厂预设**：LAN IP 默认设为 `10.0.0.1`、主机名 `Athena`、关闭 IPv6。
- **无线优化**：双 5G 共享 SSID 自动无缝漫游，2.4G 锁定 channel 11 20MHz 提高智能家居连接稳定性。
- **体验增强**：适配 QuickFile 文件管理器 Nginx 监听、解除 uWSGI 进程内存上限、默认替换软件源为南京大学镜像源。
- **Secrets 注入**：支持在编译期由 CI/CD Secrets 动态替换 PPPoE 账号密码、Wi-Fi 名称密码与后台 root 密码。

#### 3. `sysupgrade-clash-cleaner`
- **升级防卡死**：在 OpenWrt 系统保留配置升级（Sysupgrade）时，自动清理 OpenClash 包含大量历史数据的缓存大文件（如 `smart_weight_data.csv`），防止系统升级后 Web 界面响应超时挂起。

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

## 📄 开源协议

[Apache License 2.0](LICENSE)
