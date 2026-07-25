# sysupgrade-clash-cleaner

OpenWrt / LibWrt 刷机升级（Sysupgrade）“保留配置”防卡死清理插件包。

---

## 📌 版本适配说明

| 项目 | 支持版本 / 架构要求 |
| :--- | :--- |
| **OpenWrt / ImmortalWrt / LibWrt** | 19.07 / 21.02 / 22.03 / 23.05 / 24.10 / 25.12 全系官方与衍生固件（opkg 与 apk 包管理均适配） |
| **适配场景** | 包含 OpenClash 且启用了 **Smart 内核（智能权重内核）** 的环境 |

---

## ✨ 解决痛点

在使用 OpenClash 并开启 **Smart 内核（智能权重选择内核）** 时，内核会在后台持续学习并生成节点延迟与权重的数据库缓存文件 `/etc/openclash/smart_weight_data`（长时间运行后可增长到几百兆 MB）。

该文件被登记为 OpenClash 的 conffile，同时也会被 `/lib/upgrade/keep.d/luci-app-openclash`（内容为 `/etc/openclash/`）整体纳入备份，因此在“保留配置刷机升级”时会被打进 `sysupgrade.tgz`。升级后还原这份超大缓存会让路由器 CPU 100% 满载、Web（LuCI）界面超时卡死。

本插件在固件升级**备份阶段**就把 `smart_weight_data` 以及它的备份副本 `smart_weight_data_bak`（同样是几百兆的大文件）从备份列表中剔除，使备份包恢复极小体积，刷机升级**秒级完成**。

---

## 🛠️ 实现原理（治本，非热修补系统二进制）

本插件**不修改** `/sbin/sysupgrade`（新固件会覆盖它，补丁会丢）。

`/sbin/sysupgrade` 在运行时会通过 `include /lib/upgrade` 加载该目录下的**所有** `*.sh` 脚本，并把备份列表的构建函数名收集到 `$sysupgrade_init_conffiles` 钩子变量中，最终由 `run_hooks "$CONFFILES" $sysupgrade_init_conffiles` 逐个调用（每个函数拿到备份列表文件路径）。

本插件随包安装一个 drop-in 钩子文件：

```text
/lib/upgrade/zzz-sysupgrade-clash-cleaner.sh
```

它在被 source 时：
1. 定义 `filter_clash_smart_weight()`，用 BusyBox 安全的 `#` 分隔符执行
   `sed -i '\#/etc/openclash/smart_weight_data#d' ...` 把目标行（含 `smart_weight_data`、`smart_weight_data_bak`、apk 的 `path<空格>sha256` 形态）从备份列表中删除；
2. 把自身函数名追加进 `$sysupgrade_init_conffiles`（幂等），从而在每个升级备份流程末尾被调用。

因为该文件是**包自带、随包安装到 overlay** 的，所以在“保留配置升级”后依然存活、持续生效；失败会经 `logger` 记日志，不会用 `|| true` 掩盖。

---

## 📦 安装与编译说明

在您的 OpenWrt / ImmortalWrt / LibWrt 源码根目录下：

```bash
# 将本仓库作为 feed 加入，或把 openwrt-packages 放到 package/ 目录
git clone https://github.com/ybjbox/openwrt-packages.git package/openwrt-packages

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
