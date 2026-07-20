# athena-custom

雅典娜（IPQ6018）路由器专属默认初始化配置插件包。

---

## ✨ 包含的功能

- 🌐 **默认 IP 与主机名设置**：自适应默认 IP (`10.0.0.1`) 与系统主机名 (`Athena`)。
- 📶 **无线频段优化**：2.4G 自动锁 11 信道 20MHz 频宽；双 5G 同名自动无缝漫游。
- 🔒 **IPv6 与防火墙配置**：默认优化 IPv6 禁用与单栈配置。
- ⚡ **Web & Nginx 性能提升**：适配 QuickFile 文件管理器；解除 uWSGI 进程 1000MB 虚拟内存限制。
- 🚀 **APK 国内极速源**：自动适配南京大学镜像源（NJU Mirror）。

---

## 🔒 隐私安全说明与变量设置

本插件采用**代码与私密凭据分离（Environment Variable Injection）**的开源规范：
代码中仅包含安全的变量读取逻辑（如 `$MY_WIFI_PASSWORD`），绝对没有任何明文个人密码或拨号凭据。所有的敏感隐私由 GitHub Actions Secrets 在编译期动态注入。

### 🔑 1. GitHub Secrets 环境变量列表

在您的 GitHub 主仓库（如 `openwrt-ci-roc`）页面中，前往：
`Settings -> Secrets and variables -> Actions -> Repository secrets`

可按需添加以下环境变量：

| 变量名称 | 说明 | 示例 |
| :--- | :--- | :--- |
| `MY_PPPOE_USERNAME` | 宽带 PPPoE 拨号账号 | `057188888888` |
| `MY_PPPOE_PASSWORD` | 宽带 PPPoE 拨号密码 | `12345678` |
| `MY_WIFI_SSID_2G` | 2.4G Wi-Fi 名称 | `Athena-2G` |
| `MY_WIFI_SSID_5G` | 5G Wi-Fi 名称（双 5G 同名自动漫游） | `Athena-5G` |
| `MY_WIFI_PASSWORD` | Wi-Fi 无线连接密码 | `88888888` |
| `MY_ADMIN_PASSWORD` | 路由器 root 管理员密码 | `admin123` |

### 🛠️ 2. 编译脚本注入示例

在您的编译脚本（如 `scripts/Roc-script.sh`）中添加变量替换逻辑：

```bash
# 克隆仓库
git clone https://github.com/ybjbox/openwrt-packages package/openwrt-packages

# 动态注入 GitHub Secrets 敏感变量至 athena-custom 插件包中
athena_settings="package/openwrt-packages/athena-custom/files/etc/uci-defaults/99-athena-custom-settings"
if [ -f "$athena_settings" ]; then
    sed -i "s/\${MY_PPPOE_USERNAME}/${MY_PPPOE_USERNAME:-}/g" "$athena_settings"
    sed -i "s/\${MY_PPPOE_PASSWORD}/${MY_PPPOE_PASSWORD:-}/g" "$athena_settings"
    sed -i "s/\${MY_WIFI_SSID_2G}/${MY_WIFI_SSID_2G:-}/g" "$athena_settings"
    sed -i "s/\${MY_WIFI_SSID_5G}/${MY_WIFI_SSID_5G:-}/g" "$athena_settings"
    sed -i "s/\${MY_WIFI_PASSWORD}/${MY_WIFI_PASSWORD:-}/g" "$athena_settings"
    sed -i "s/\${MY_ADMIN_PASSWORD}/${MY_ADMIN_PASSWORD:-}/g" "$athena_settings"
fi
```

---

## 📄 开源协议

本项目基于 [Apache License 2.0](../LICENSE) 开源发布。
