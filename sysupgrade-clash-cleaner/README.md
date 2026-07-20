# sysupgrade-clash-cleaner

OpenWrt 刷机升级（Sysupgrade）保留配置防卡死清理插件包。

---

## ✨ 解决痛点

在使用 OpenClash 等代理插件时，系统会自动积累几百兆的节点权重与日志大文件（`smart_weight_data.csv` 及其备份）。
在通过 Web 界面（LuCI）进行“保留配置刷机升级”时，原生 OpenWrt 会把这几百兆大文件一同打包压缩，导致路由器 CPU 满载、Web 界面超时卡死且升级无响应。

本插件在固件升级打包阶段自动过滤该大文件缓存，使备份数据保持极精简，刷机升级**秒级完成**！

---

## 🛠️ 安装与使用

```bash
# 克隆仓库至 package 目录
git clone https://github.com/ybjbox/openwrt-packages.git package/openwrt-packages

# 在 make menuconfig 中勾选即可
make menuconfig
```

---

## 📄 开源协议

[Apache License 2.0](../LICENSE)
