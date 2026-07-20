# sysupgrade-clash-cleaner

OpenWrt 刷机升级（Sysupgrade）保留配置防卡死清理插件包。

---

## 📌 版本适配说明

| 项目 | 支持版本 / 架构要求 |
| :--- | :--- |
| **OpenWrt 版本** | OpenWrt 19.07 / 21.02 / 22.03 / 23.05 / 24.10 / 25.12 全系官方与衍生固件 |
| **ImmortalWrt 版本** | 所有 ImmortalWrt 版本通用 |
| **适配场景** | 包含 OpenClash 且启用了 **Smart 内核（智能权重内核）** 的环境 |

---

## ✨ 解决痛点

在使用 OpenClash 插件并开启 **Smart 内核（智能权重选择内核）** 时，内核会在后台持续学习并生成节点延迟与权重的数据库（`smart_weight_data.csv` 及其历史备份文件）。

长时间运行后，该权重缓存文件可能会增长到几百兆（MB）。在通过 Web 界面（LuCI）进行“保留配置刷机升级”时，原生 OpenWrt 的备份规则会默认把这几百兆的 Smart 内核数据一同打包压缩，导致路由器 CPU 100% 满载、Web 界面超时卡死且刷机提示无响应。

本插件自动在固件升级打包阶段剔除 Smart 内核的 `smart_weight_data` 大文件缓存，使备份包恢复极小体积，刷机升级**秒级完成**！

---

## 🛠️ 安装与编译说明

在您的 OpenWrt / ImmortalWrt 源码根目录下：

```bash
# 克隆本仓库至 package 目录
git clone https://github.com/ybjbox/openwrt-packages.git package/openwrt-packages

# 在 make menuconfig 中勾选
make menuconfig
```

勾选位置：
```text
Utilities --->
    <*> sysupgrade-clash-cleaner.......... Filter large OpenClash Smart kernel cache during sysupgrade
```

---

## 📄 开源协议

[Apache License 2.0](../LICENSE)
