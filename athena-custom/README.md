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

## 🔒 隐私安全说明

本插件采用**代码与私密凭据分离（Environment Variable Injection）**的规范：
代码中仅包含安全的变量读取逻辑（如 `$MY_WIFI_PASSWORD`），绝对没有任何明文个人密码或拨号凭据。所有的敏感隐私由 GitHub Actions Secrets 在编译期动态注入。
