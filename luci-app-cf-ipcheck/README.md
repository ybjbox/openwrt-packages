# luci-app-cf-ipcheck

在**路由器本机**实测 Cloudflare 边缘 IP 的可用性与质量，产出 `ip.txt` 榜单，可选自动上传到你的 Gist。

与在 GitHub Actions 上跑测速的方案有本质区别：Actions 测的是数据中心的网络，
不是你家宽带到 Cloudflare 的线路。优选 IP 只有在你自己的线路上测才有意义。

## 为什么不用 ping 判定

Cloudflare 是 anycast，同一个 IP 用 ICMP / TCP / HTTPS 测出来的延迟依次递增，
ICMP 低延迟完全不代表代理线路能用（还可能被运营商限速）。所以判定口径是：

> **可用 = 带真实 SNI 的 HTTPS 探测成功：`curl` 退出码 0 且 `200 <= http_code < 500`**

探测时用 `curl --resolve <域名>:<端口>:<候选IP>` 把域名钉到候选 IP 上，
SNI 与 Host 都是你填的节点域名，因此这一步同时验证了 TLS 握手与真实 HTTP 响应。

每个 IP 记录四段耗时：

| 指标 | 含义 | 取值来源 |
| :--- | :--- | :--- |
| `connect_ms` | TCP 三次握手 | `time_connect` |
| `tls_ms` | TLS 握手（appconnect − connect） | `time_appconnect` |
| `ttfb_ms` | 首字节 | `time_starttransfer` |
| `total_ms` | 整请求总耗时 | `time_total` |

排序：**`total` 升序，同值再看 `ttfb`**。入围后再对 `cdn-cgi/trace` 请求一次拿 `colo=`，
即该 IP 实际的落地机房（如 `LAX`/`NRT`/`HKG`）——只查入围 IP，不浪费请求。

## 候选 IP 从哪来（三路合并去重）

1. **Cloudflare 官方网段**：实时拉 `api.cloudflare.com/client/v4/ips`，把每个前缀
   按 **/24 粒度**展开取样（`/20` = 16 个候选）。
2. **社区优选源**：填任意数量的 HTTPS 文本 URL，内容里的 IP 或 CIDR 都会被提取。
3. **上一轮入围 IP**：回灌进池子，保证榜单连续，不会因为候选抖动而整批换掉。

> CIDR 展开时刻意避开网络地址：`103.160.24.0/24` 取样为 `103.160.24.102`，
> 而**不是** `.0`。`.0` 不可分配，拿它探测只会得到成片超时（这是本包 selftest 里
> 一条专门的回归用例）。

合并后去重，按 `candidate_budget` 截断，避免单轮失控。

## 安装

```bash
git clone https://github.com/ybjbox/openwrt-packages.git package/openwrt-packages
./scripts/feeds update -a && ./scripts/feeds install -a
make menuconfig   # LuCI -> Applications -> luci-app-cf-ipcheck
```

刷机后在 **服务 → Cloudflare 优选 IP 实测** 打开页面。

25.12 起官方包后端是 apk，没有 opkg，也不能手工搓 `.apk`（`ADBd` 归档 + 设备端
apk 无 `mkpkg`）。不想重编固件的话：Actions → CI → Run workflow（`sdk_arch` 填本机
`uci -q get openwrt.release.DISTRIB_ARCH` 对应的 `<arch>-<完整小版本>`），
下载 `luci-app-cf-ipcheck-*` 产物里的包文件，再：

```bash
scp luci-app-cf-ipcheck_*_all.apk root@10.0.0.1:/tmp/
ssh root@10.0.0.1 'apk add --allow-untrusted /tmp/luci-app-cf-ipcheck-*.apk'
```

包是 `PKGARCH := all`，产物在 apk 记账里是 `A:noarch`，所以哪个架构的 SDK 编出来
的都通用（与本仓库 luci-app-dhcp-comment 一致，已在真机核对）。

## 验证状态

2026-09-26 在 LibWrt 25.12.2 / qualcommax-ipq60xx（`aarch64_cortex-a53`）真机上验证：

- `selftest` 全通过；`sh -n` 通过；procd `daemon` 常驻并 `enabled=0` 时空转。
- 从浏览器登录态走 rpcd `file.exec`（受本包 ACL 约束）执行 `run-now`，
  56 秒跑完一轮：候选 256 → 达标 192 → 榜单 10，`total_ms` 873.3~945.8 升序，
  `code` 全 200，`colo` 全部落到 LAX。
- 视图 JS 在设备自带的 LuCI（form/rpc/ui/view）里编译执行，结果表按真实
  status JSON 生成 10 行 × 8 列，三个按钮的 click 处理函数均已挂上。
- SDK 构建：`x86_64-25.12.5` 与 `aarch64_cortex-a53-25.12.5` 两个镜像下
  `make package/luci-app-cf-ipcheck/compile` + `make package/index` 全绿，
  产物为 `bin/packages/<arch>/action/luci-app-cf-ipcheck-<version>-r<release>.apk`
  （首验那次是 `…-1.0.0-r1.apk`，13707 B，头 4 字节 `ADBd`，apk 记账里 `A:noarch`；
  执行位修好后 PKG_RELEASE 抬到 2，改过内容就要抬 release）。
- 该产物已在这台设备上 `apk add --allow-untrusted` 装成功（`OK: 177.2 MiB in 505 packages`）。
  第一次装的时候暴露出真缺陷：`root/etc/init.d/cf-ipcheck` 与 `root/usr/bin/cf-ipcheck`
  在仓库里是 100644，装到设备上成了 `-rw-r--r--`，procd 的 enable/start 与
  rpcd 的 `file.exec` 全都 Permission denied —— 手工 chmod 会把这个问题一直藏着。
  现已 `git update-index --chmod=+x` 修正，并由 `tests/lint.sh` 的 [6/6] 钉死。
- 修好之后重新 `apk del` + `apk add` 干净走过一遍：post-install 不再报错，
  两个可执行文件直接以 `-rwxr-xr-x` 落盘，`/etc/rc.d/S99cf-ipcheck` 由 enable 建出来，
  `/etc/init.d/cf-ipcheck status` = running，`selftest` 全通过；
  装好的 `/usr/bin/cf-ipcheck` 与 `/etc/config/cf_ipcheck` 的 md5 与仓库 blob 一致
  （init.d 与 config 在打包中不改写；`settings.js` 会被 luci.mk 压成一行，
  实测压缩版仍能正常构建页面 DOM）。

未覆盖：肉眼在普通浏览器里看整页排版（验证用的内嵌页签
`document.hidden=true` 且 `requestAnimationFrame` 不触发，LuCI 的视图引导和
CBI `Map.render()` 在这种页签里根本不会完成 —— 同环境下已装的
luci-app-dhcp-comment 一样停在「正在载入视图」，一个空的 `new form.Map()` 也不 resolve，
故与本包无关）。视图代码是拿设备自带的 `form/rpc/ui/view` 直接编译执行
`load()`/`render()` 验的（含 luci.mk 压缩后的那一份），
表头 8 列、榜单 10 行、meta 行与三个按钮的处理函数都已逐项核对。

## 配置项

| UCI 选项 | 默认 | 说明 |
| :--- | :--- | :--- |
| `enabled` | `0` | 定时实测总开关；关闭时后台只空转 60 秒一轮，打开后一分钟内开始，无需重启服务 |
| `interval_hours` | `6` | 定时周期 |
| `probe_domains` | `www.cloudflare.com` | **必填**，逗号分隔；必须是真正解析到 Cloudflare 后面的域名（节点域名 / Worker 域名） |
| `probe_port` | `443` | 探测端口 |
| `use_official_ranges` | `1` | 是否使用 CF 官方网段 |
| `reuse_last` | `1` | 是否回灌上一轮入围 IP |
| `community_sources` | 空（list） | 社区源 URL，逐个 HTTPS 抓取 |
| `candidate_budget` | `256` | 单轮候选上限 |
| `concurrency` | `8` | 并发探测数 |
| `probe_timeout` | `5` | 单 IP 超时（同时作为连接与整请求超时） |
| `ttfb_limit` | `3000` | TTFB 上限（毫秒） |
| `total_limit` | `5000` | 总耗时上限（毫秒）——两道门槛都过才算达标 |
| `keep_count` | `10` | 榜单保留条数 |
| `colo_probe` | `1` | 是否为入围 IP 查落地机房 |
| `annotate` | `cf-ipcheck \| {colo} \| {total}ms` | `ip.txt` 注释模板 |
| `upload_gist` | `0` | 每轮后是否上传 Gist |
| `gist_id` / `gist_file` | 空 / `cf-ip.txt` | Gist ID 与文件名 |
| `token_file` | `/etc/cf-ipcheck.token` | 令牌**只**从该文件读，不进 UCI 配置 |

手工设置一次探测目标：

```sh
uci set cf_ipcheck.@global[0].probe_domains='你的节点域名.com'
uci commit cf_ipcheck
/etc/init.d/cf-ipcheck restart
```

写入 Gist 令牌（只需要 `gist` 权限的经典令牌）：

```sh
printf '%s' '你的令牌' > /etc/cf-ipcheck.token
chmod 600 /etc/cf-ipcheck.token
uci set cf_ipcheck.@global[0].upload_gist='1'
uci set cf_ipcheck.@global[0].gist_id='<GistID>'
uci commit cf_ipcheck
```

## 命令行

```sh
cf-ipcheck run        # 前台跑一轮（调试用）
cf-ipcheck run-now    # 后台起一轮，立即返回
cf-ipcheck status     # 最近一轮状态 JSON
cf-ipcheck show       # 人类可读榜单
cf-ipcheck colo <IP>  # 单 IP 落地机房
cf-ipcheck stop       # 让当前这轮尽快收尾
cf-ipcheck daemon     # 常驻定时（由 /etc/init.d/cf-ipcheck 启动）
cf-ipcheck selftest   # 离线自检，不联网
```

## 产出文件

| 路径 | 内容 |
| :--- | :--- |
| `/etc/cf-ipcheck/best-ip.txt` | 榜单，每行 `IP:端口 <注释>`；上传 Gist 用的就是它 |
| `/etc/cf-ipcheck/result.json` | 结构化结果（含四段耗时与 `colo`），页面渲染它 |
| `/tmp/cf-ipcheck/status.json` | 运行时状态（`running` / `done` / `error`） |
| `/tmp/cf-ipcheck/cf-ipcheck.log` | 运行日志（`logread -e cf-ipcheck` 亦可） |

## 定时为什么用常驻进程而不是 crontab

往 `/etc/crontabs/root` 里塞条目会和别的插件（自动重启等）互相覆盖，且改完配置要
重启才生效。这里由 procd 常驻 `cf-ipcheck daemon`，每轮开始时重新读 UCI，
所以**改周期、换域名、开关都在页面上保存即生效**。

## 卸载

```sh
opkg remove luci-app-cf-ipcheck    # 25.12 用 apk remove
rm -rf /etc/cf-ipcheck /tmp/cf-ipcheck /etc/cf-ipcheck.token
```

## 依赖与许可

只依赖 `curl` 与 `ca-bundle`（`jq` 有则用于解析官方网段 JSON，没有会退化为文本提取）。
本包为独立实现，不捆绑任何第三方二进制：探测口径与候选池三路合并的思路参考了
[ChEnLeo-7/openwrt-cf-auto](https://github.com/ChEnLeo-7/openwrt-cf-auto)（MIT）的设计，但代码不是它的衍作品，
许可随 `openwrt-packages` 采用 Apache-2.0。
