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
