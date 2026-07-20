# luci-app-dhcp-comment

OpenWrt / LuCI DHCP 静态分配中文备注与活动租约增强插件。

本插件为 OpenWrt 原生 LuCI 界面补全了“中文/自定义备注 (Comment)”功能，使您不仅能在静态地址分配时为设备添加中文名称，还能在所有活动 DHCP 租约列表中同步直观地看到中文设备备注。

---

## 📌 版本适配与支持说明

| 项目 | 支持版本 / 架构要求 |
| :--- | :--- |
| **OpenWrt 版本** | OpenWrt 21.02 / 22.03 / 23.05 / 24.10 / 25.12 主线及所有衍生固件 |
| **ImmortalWrt 版本** | ImmortalWrt 全系版本（包含 23.05 / 24.10 / 25.12-nss 架构等） |
| **LuCI 架构要求** | LuCI 客户端渲染架构 (LuCI JS / Client-side UI) |
| **硬件平台** | 适用于所有硬件架构（x86_64, ARM, MIPS, Qualcomm IPQ 等全平台通用） |

---

## ✨ 核心特性

- 📝 **静态分配独立备注框**：在“网络 -> DHCP/DNS -> 静态地址分配”中提供独立的 `Comment` 输入框，不继承任何下拉选择逻辑，干净无 bug。
- 🌐 **活动租约列表同步显示**：在“网络 -> DHCP/DNS”的“活动 DHCP 租约 (IPv4 & IPv6)”表格中实时呈现设备中文备注。
- 📊 **状态概览页面同步显示**：在“状态 -> 概览”主页面的“活动 DHCP 租约”列表中同步展示中文备注。
- 🎯 **精简去重格式**：自动去重并优化主机名显示，避免原生 LuCI 域名嵌套冗长（例如美观呈现为：`小爱音箱 (MiAiSoundbox-LX06)`）。
- 🔒 **严格模式与安全插值**：采用 ES5 `var` 变量作用域与 `%s` 安全格式化插值，完美解决转义正则抹杀中文字符与语法报错问题。

---

## 🛠️ 安装与编译说明

### 1. 编译进 OpenWrt 固件

在您的 OpenWrt 源码或自定义编译脚本中添加克隆指令：

```bash
# 下载本仓库至 package 目录
git clone https://github.com/ybjbox/openwrt-packages.git package/openwrt-packages

# 更新并安装配置
make menuconfig
```

在 `menuconfig` 菜单中勾选：
```text
LuCI --->
    3. Applications --->
        <*> luci-app-dhcp-comment.......... LuCI support for DHCP comment & active lease display
```

### 2. 运行时手动覆盖安装（免编译热更新）

若您已在运行 OpenWrt 路由器，也可直接将本项目 `htdocs/` 下的文件覆盖至路由器对应路径：

- `/www/luci-static/resources/view/network/dhcp.js`
- `/www/luci-static/resources/view/status/include/40_dhcp.js`

覆盖后清理缓存即可生效：
```bash
rm -rf /tmp/luci-indexcache /tmp/luci-modulecache/* 2>/dev/null
```

---

## 📄 开源协议

本项目基于 [Apache License 2.0](../LICENSE) 开源发布。
