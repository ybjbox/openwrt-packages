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

## 候选 IP 从哪来（三路合并 + 名额分配）

1. **Cloudflare 官方网段**：实时拉 `api.cloudflare.com/client/v4/ips`，把每个前缀
   按 **/24 粒度**展开取样（`/20` = 16 个候选）。现网 15 条 IPv4 前缀展开后是
   **5956 个**候选，远超预算。
2. **社区优选源**（`community_sources`，默认九条，2026-09-27 逐个核过）：

   「落在 CF 官方段内」这一列是拿 `api.cloudflare.com/client/v4/ips` 现算出来的，
   不满 100% 的要么是混了 IPv6/杂项，要么根本不是 CF anycast。

   | 源 | 提取到 IPv4 | 落在 CF 官方段内 | 形态 |
   | :--- | ---: | ---: | :--- |
   | `bestcf.pages.dev/entryip/50.txt` | 50 | 47（94%） | `IP:443#CF Anycast Entry IP` |
   | `bestcf.pages.dev/cfyes/ipv4.txt` | 12 | 12（100%） | `IP:443#CFYes 优选` |
   | `bestcf.pages.dev/wetest/ipv4.txt` | 17 | 17（100%） | `IP:443#WeTest 优选` |
   | `bestcf.pages.dev/ircf/ipv4.txt` | 10 | 10（100%） | `IP:443#IRCF 优选` |
   | `bestcf.pages.dev/nirevil/ipv4.txt` | 37 | 35（95%） | `IP:443#NiREvil 优选` |
   | `ymyuuu/IPDB` `BestCF/bestcfv4.txt` | 10 | 10（100%） | 纯 IPv4 |
   | `hubbylei/bestcf` `bestcf.txt` | 10 | 10（100%） | 纯 IPv4 |
   | `gslege/CloudflareIP` `All.txt` | 100 | 100（100%） | `IP#地区` |
   | `XIU2/CloudflareSpeedTest/ip.txt` | 25 个前缀 | 25（100%） | CIDR（按 /24 取样） |

   **别往这里加"现成的大份优选清单"**：`bestcf.pages.dev/random-region/mix.txt`（306 条）、
   `mix2.txt`（515 条）、`cf.junzhen.qzz.io/best_ips*.txt`、`svip-s/cloudflare_ip` 的
   `best_ips.txt` / `full_ips.txt`，实测**一条都不在 Cloudflare 官方段内**
   （例：`108.61.242.146` 是 Vultr，`43.129.x`/`118.25.x` 是腾讯云）—— 那是别人搭的
   中转/入场机器，不是 CF anycast，进候选池只会白占名额。
   （`svip-s` 那条是我 09-26 没核段内占比就加进去的，这次移除。）

   `entryip/50.txt` 值得单独说一句：它就是 CF 各段的**入口 IP 代表清单**（50 条），
   相当于把官方网段铺出来的近六千个 /24 采样压成 50 个。所以本包现在默认
   `use_official_ranges=0` —— 平时只吃这类清单，不再大基数扫；想扩大覆盖面时
   临时打开，官方段会用剩余名额等间隔抽稀补满。

   `IP:port` 里的端口会被丢掉（探测端口统一用 `probe_port`），注释、CSV 表头、
   IPv6 一律忽略；某个源挂了只记日志，不影响本轮。`cf-ipcheck pool` 可以直接看
   本轮实际会用哪些候选，`logread -e cf-ipcheck` 会打出每个源的贡献数。
3. **上一轮入围 IP**：回灌进池子，保证榜单连续，不会因为候选抖动而整批换掉。

**名额怎么分**（`candidate_budget`，默认 256）：上一轮入围全保 → 社区源最多占剩下的
一半，并且**逐源均分**（每个源约 `预算/2/源数` 个，小榜单则全取）→ 官方网段用抽稀
填满其余。逐源均分是必要的：XIU2 那份按 /24 展开就是近六千条，合并后一起抽稀会把
两份各 10 条的实测精选榜挤成 0 个名额。

早先的实现是 `sort -u | head -n 预算`，按字符串序截断 —— 于是池子永远只在
`103./104.` 开头那一段里，`141./162./172./188./198.` 与所有社区源一条都进不来。
现在改为在有序表上等间隔抽稀（`_sample` 有 selftest 断言，含"必须保留最大端"这条，
专门用来抓退回 `head` 的改动）。

> ⚠️ **在跑 OpenClash 透明代理的路由器上，逐 IP 探测量不出 IP 的差异。**
> 本机发起的 tcp 会被 clash 接管后由它自己重新拨号，`--resolve` 钉住的地址
> 根本不参与选路。实测证据：把 `www.cloudflare.com` 钉到保留地址
> `203.0.113.77`（RFC 5737，全球不可路由）仍然返回 `HTTP 200`、
> `time_connect` 只有 0.0008s，而 `/tmp/openclash.log` 里能看到这条连接
> （`[TCP] dial 直接连接 (match RuleSet/Private)`）。
> 而且 **换端口没用**：同一台机器上 443 / 8443 / 2053 / 8080 / 53 / 9 六个端口
> 探测同一个保留地址，全部返回 200 —— 接管规则覆盖的是所有 tcp。
> 也就是说榜单里那些 800~900ms 是「本机 → clash → CF」的耗时，不是候选 IP 的耗时。
>
> **本包自带的处置**（两条，都默认开着）：
>
> 1. `canary_check`：每轮先拿两个保留地址按同一条路径试一次。保留地址上没有服务，
>    正常只会超时（curl 给出 `000`）；一旦它返回任何三位状态码，就证明钉 IP 没生效，
>    本轮 `result.json`/`status.json` 带 `"intercepted":1`，页面顶部红条 + 状态栏标注。
>    命令行可单独跑：`cf-ipcheck canary` → `{"intercepted":1}`。
>    判定只会单向出错：不可能有真实服务器住在保留地址上，所以不会误报"被接管"。
> 2. `probe_user`（默认 `nobody`）—— 这才是让数字变真实的那一步。OpenClash 打 mark
>    的链（`table inet fw4` 里的 `openclash_mangle_output` / `openclash_mangle`）
>    **第一条规则就是 `meta skgid 65534 … return`**，而 nobody 的 gid 正是 65534，
>    所以把探测降到 nobody 身份（`su -s /bin/sh nobody -c 'curl …'`）就天然绕过接管，
>    **不需要改 OpenClash 任何配置**。实测同一个 `104.16.202.102`：
>
>    | 发起身份 | TCP 握手 | 含义 |
>    | :--- | ---: | :--- |
>    | root（被接管） | 0.0007 s | 假：那是本机到 clash 的时间 |
>    | nobody（绕过） | 0.193 s | 真：跨境 RTT 量级 |
>
>    绕过之后拿 5 个社区"优选 IP"实测：3 个直接超时，存活的两个 total 分别
>    4154.8 ms / 6670.3 ms，`达标 1/5`（另一个被 `total_limit` 砍掉）——
>    而被接管时是 `达标 256/256`、connect 清一色 0.000x。**"全部达标"本身就是故障证据**，
>    所以 `candidate_budget`、`total_limit` 这些门槛在绕过之后才有意义。
>
>    留空 `probe_user` 就退回 root 直发（会被接管，但 canary 会把那轮标成不可信）。
>    没有透明代理的机器上，`su` 到 nobody 也一样能正常出网，不必改。
>
> 另一种完全不碰路由器的做法：把 `root/usr/bin/cf-ipcheck` 拷到没被接管的机器上跑，
> 再把 `best-ip.txt` 拿回来。


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
- 从浏览器登录态走 rpcd `file.exec`（受本包 ACL 约束）执行 `run-now`，一轮 56 秒跑完，
  管道（触发→探测→排序→落盘→回读→渲染）全程通。
  **但那一轮的数字本身是无效的**：候选 256 → 达标 256/192、`connect` 清一色 0.000x 秒，
  后来查明是本机 443 被 OpenClash 接管（见上面的 ⚠️）。这条记在这里是为了提醒：
  "全部达标 + 握手亚毫秒"就是被接管的特征，不是线路好。
- 出口自检与绕过在真机上双向验过：`probe_user` 设 root → `{"intercepted":1}`，
  设 nobody → `{"intercepted":0}`；同一个 `104.16.202.102` root 下 connect 0.0007s、
  nobody 下 0.193s。nobody 下跑 5 个社区优选 IP：3 个超时、存活两个
  total 4154.8 / 6670.3 ms、`达标 1/5` —— 门槛开始真正起作用。
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
| `use_official_ranges` | `0` | 是否把官方网段也铺进池子（默认关，避免近六千个 /24 采样挤掉社区优选） |
| `reuse_last` | `1` | 是否回灌上一轮入围 IP |
| `community_sources` | 九条（见上） | 社区源 URL（list），逐个 HTTPS 抓取；池子一半名额按源均分 |
| `candidate_budget` | `256` | 单轮候选上限 |
| `concurrency` | `8` | 并发探测数 |
| `probe_timeout` | `5` | 单 IP 超时（同时作为连接与整请求超时） |
| `ttfb_limit` | `3000` | TTFB 上限（毫秒） |
| `total_limit` | `5000` | 总耗时上限（毫秒）——两道门槛都过才算达标 |
| `keep_count` | `10` | 榜单保留条数 |
| `colo_probe` | `1` | 是否为入围 IP 查落地机房 |
| `canary_check` | `1` | 每轮先用保留地址自检出口有没有被透明代理接管，接管则打标 |
| `probe_user` | `nobody` | 探测发起身份；nobody 的 gid 65534 正好被 OpenClash 的 mark 链豁免，留空则退回 root（会被接管） |
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
cf-ipcheck pool       # 只打印本轮会用的候选 IP（联网取源、不测速）
cf-ipcheck canary     # 只跑一次出口接管自检：{"intercepted":0|1}
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
