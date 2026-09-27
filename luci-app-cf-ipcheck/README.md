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

## 探测域名该怎么选、怎么搭

**必须是真正架在 Cloudflare 后面的名字**：CF 给它签了证书、且任何请求都能给出
HTTP 响应。403 / 404 都算「可用」（判定只看 2xx/3xx/4xx）—— 我们要的是
「这个 IP 上能不能完成 TLS 并拿到 CF 的回应」，不是页面内容。

三条实测对照（同一批候选 IP，路由器上跑）：

| 填的探测域名 | 结果 | 说明 |
| :--- | :--- | :--- |
| 你自己的 EDT/Worker 节点域名 | 6/6 达标（返回 403） | **首选**，见下 |
| `www.cloudflare.com` | 5/6 达标 | 能用，但测的是 CF 官网那条路 |
| 另一个同样解析到 CF 的域名 | 0/6，全部 `tls` 失败 | 名字没在 CF 上正确代理，就不能当探测域名 |

为什么首选**你真正要用的节点域名**：干扰是按 SNI 走的。同一个 IP 上
`cloudflare.com` 的 SNI 能通，不等于你节点的 SNI 能通；用别人的域名测出来的榜单，
套到你节点上可能一片连不上。反过来说，`probe_domains` 就是你的可用性测试的目标本身。

想专门要一个不暴露节点的探测域名，两种 0 成本搭法：

```text
A. Cloudflare Worker（1 分钟）
   Dashboard → Workers & Pages → Create → 空白模板，代码就：
     export default { fetch: () => new Response('ok', { status: 200 }) }
   部署后拿到 https://<名字>.<你的子域>.workers.dev，直接填进 probe_domains。
   更建议再给它绑一个你自己域名的 Custom domain（在下面这个 zone 里加一条
   proxied 记录 → Route 到这个 Worker），因为 workers.dev 在中国大陆的
   路由质量与你节点不同，拿它测出来的优选 IP 可能对节点并不适用。

B. Cloudflare Pages：建个空项目即可，任意路径都返回 200，同样在 CF 后面。
```

填之前先花 10 秒自验（挑一个已知 CF 段内 IP 钉一下，看状态码和证书）：

```sh
# 1) 域名是否解析到 Cloudflare 段（DoH 查询，看返回是否 172.64/104.16/141.101… 等）
curl -s "https://cloudflare-dns.com/dns-query?name=你的域名&type=A" -H 'accept: application/dns-json'
# 2) 钉到某个 CF IP 试一次：能拿到状态码就说明 TLS 与 SNI 都对，可以用
curl -4 -o /dev/null -sS --connect-timeout 5 --max-time 8 \
  --resolve 你的域名:443:104.16.123.96 https://你的域名/ \
  -w 'code=%{http_code} connect=%{time_connect}\n'
```

填进插件后，跑一轮看失败分类：整批 `tls` 就说明这个域名在这些 IP 上没有效证书
（代理没开、或证书不含这个名字）；整批 `timeout` 通常是端口/线路问题；
`intercepted:1` 则是本机出口被代理接管（见下面「出口接管自检」）。


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
2. **社区优选源**（`community_sources`，默认十三条，2026-09-27 逐个核过）：

   「段内」列是拿 `api.cloudflare.com/client/v4/ips` 现算的（路由器上 13 条并发 4 秒跑完）。
   `bestcf.pages.dev/*` 是别人的**聚合镜像**（缓存各家清单），右边写明了对应的**原始出处**；
   其余八条本身就是作者自己的 GitHub 仓库地址。

   | 源（默认就用这些 URL） | 提取到 IPv4 | 段内 | 原始出处 |
   | :--- | ---: | ---: | :--- |
   | `bestcf.pages.dev/entryip/50.txt` | 50 | 47（94%） | CF 各段入口代表清单，原始即 bestcf 站 |
   | `bestcf.pages.dev/cfyes/ipv4.txt` | 12 | 12 | 原始 `https://addressesapi.090227.xyz/CloudFlareYes`（实测会超时，故用镜像） |
   | `bestcf.pages.dev/wetest/ipv4.txt` | 17 | 17 | 原始 `https://www.wetest.vip/page/cloudfront/address_v4.html`（HTML，同样能提取） |
   | `bestcf.pages.dev/ircf/ipv4.txt` | 10 | 10 | 站内未标原始出处 |
   | `bestcf.pages.dev/nirevil/ipv4.txt` | 37 | 35（95%） | 站内未标原始出处 |
   | `raw.githubusercontent.com/ymyuuu/IPDB/main/BestCF/bestcfv4.txt` | 10 | 10 | 原始仓库 ymyuuu/IPDB |
   | `raw.githubusercontent.com/hubbylei/bestcf/main/bestcf.txt` | 10 | 10 | 原始仓库 hubbylei/bestcf |
   | `raw.githubusercontent.com/gslege/CloudflareIP/main/All.txt` | 100 | 100 | 原始仓库 gslege/CloudflareIP |
   | `raw.githubusercontent.com/LancelotRar/best-cf-ips/refs/heads/main/best-cf-ip-collected.txt` | 77 | 75（97%） | 原始仓库（各家采集聚合） |
   | `raw.githubusercontent.com/joname1/BestCFip/refs/heads/main/ipv4.txt` | 91 | 90（99%） | 原始仓库 joname1/BestCFip |
   | `raw.githubusercontent.com/Senflare/Senflare-IP/refs/heads/main/IPlist-Pro.txt` | 27 | 27 | 原始仓库 Senflare/Senflare-IP |
   | `raw.githubusercontent.com/einsitang/my-fast-cf-ip/refs/heads/master/fastips.txt` | 20 | 20 | 原始仓库 einsitang/my-fast-cf-ip |
   | `raw.githubusercontent.com/XIU2/CloudflareSpeedTest/master/ip.txt` | 25 段 | 25 | 原始仓库 XIU2/CloudflareSpeedTest |

   默认 13 条合并去重后池子约 114~190 个候选（`use_official_ranges=0` 时）。
   配置文件里每条 URL 上方都有一行注释写明它的段内占比与原始出处。

   **源可用性检测**：页面上「候选池来源」下方有「检测源可用性」按钮，点对了才跑
   （不在页面加载时自动跑，避免白拉十几遍网）。它逐条列出 HTTP 状态、提取到的 IPv4
   数、落在 CF 段内的数量与占比；拉不到的行用表格警示色（`warning`）、段内占比低于
   90% 的用提示色（`notice`）标出来。
   命令行等价物：

   ```sh
   cf-ipcheck check-sources
   # [{"url":"https://bestcf.pages.dev/entryip/50.txt","http":"200","rc":0,"ips":50,"cf_in":47}, …]
   ```

   13 条源按 4 个一批并发，真机实测 4 秒跑完（串行要一分多钟，页面上会转圈到怀疑人生）。
   某条源改路径或者开始吐非 CF 的中转 IP，这里第一时间看得出来。

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
>    `probe_user` 填 `none` 就退回 root 直发（会被接管，但 canary 会把那轮标成不可信）。
>    必须是 `none` 这个哨兵值而不是留空：uci 分不清「显式留空」和「没有这一项」，
>    空值取回来是 rc=1，会又落回默认的 `nobody`。
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
  现已 `git update-index --chmod=+x` 修正，并由 `tests/lint.sh` 的 [6/7] 钉死。
- 修好之后重新 `apk del` + `apk add` 干净走过一遍：post-install 不再报错，
  两个可执行文件直接以 `-rwxr-xr-x` 落盘，`/etc/rc.d/S99cf-ipcheck` 由 enable 建出来，
  `/etc/init.d/cf-ipcheck status` = running，`selftest` 全通过；
  装好的 `/usr/bin/cf-ipcheck` 与 `/etc/config/cf_ipcheck` 的 md5 与仓库 blob 一致
  （init.d 与 config 在打包中不改写；`settings.js` 会被 luci.mk 压成一行，
  实测压缩版仍能正常构建页面 DOM）。

- 视图代码是拿设备自带的 `form/rpc/ui/view` 直接编译执行 `load()`/`render()` 验的
  （含 luci.mk 压缩后的那一份），表头 8 列、榜单行数、meta 行与按钮处理函数逐项核对。
- 2026-09-27 另有一台设备的坑值得记：那台机器上 `/dev/null` 不是字符设备，而是落在
  512K tmpfs 里的普通文件，`curl -o /dev/null` 遇到大响应就短写失败（`rc=23`
  `Failure writing output to destination`），表现是**“域名越正常越测不通”**的假象。
  引擎现在会检测 `[ -c /dev/null ]`，不是字符设备就改用运行目录里的 `.null`
  （建好并 `chmod 666`，因为探测是以 `probe_user` 的身份跑的，替代文件必须让那个用户写得动），
  同时在日志里提示。换域名对比一验就通：`www.cloudflare.com` 5/6 达标、
  节点域名 6/6 达标、另一个未正确代理的域名 0/6 全 `tls` 失败。
- 2026-09-27 增量验：`check-sources` 在真机上 13 条源并发 4 秒出结果，BusyBox awk 算出的
  段内数与 GNU awk 在 Windows 上算的逐条一致；视图在 `intercepted=0/1` 两种状态下分别
  渲染出 4 个具体节点、红条有无、状态栏文案都对得上，且没有出现 `[object …]` 之类的
  字符串拼接残留。

- 2026-09-27 这批修复（锁判活 + status 自愈 + 按 IP 合并 + 失败分类 + MiB/s + 多域名列 +
  数值配置容错）的验证到哪一步：
  - 引擎 `selftest` 从 46 项扩到 **65 项**，在 Windows 的 bash + GNU awk 5.4 下全绿；
    BusyBox ash 那一遍由 CI 的 `lint-and-busybox` job 跑（本机没有 busybox），**这一遍还没跑过**。
  - 新缺陷全是新断言抓出来的，四条都值得记：`cut -d' ' -f2` 在找不到分隔符时会把
    **整行**吐出来（旧格式锁的“时间戳”变成 pid 本身，活锁被误判为陈旧）；
    锁里的 pid 必须用 `$(exec sh -c 'echo $PPID')` 取，加个 `|| true` 就会记成命令替换的
    临时进程（表现是重复起两轮）；`_aggregate` 的断言一度按 colored.tsv 的列序写了 `$9`，
    而探测 TSV 的域名是第 8 列。
  - 视图改成用 Node + LuCI 桩（`E/_/rpc/form/view`）跑真实渲染函数断言：列数 9/10、
    `unreachable`/`parse_error`/`error+reason` 三种失败各有各的文案、`counts` 进 meta、
    `null` 吞吐显示 `—`，16 条全绿。它只验渲染逻辑，**不验**设备自带 form/rpc 的组合。
  - `tests/lint.sh` 新增 [7/7]「引擎 ↔ 页面 JSON 契约」：三张键表正反双向核对 + 禁止
    已废弃的 `speed_mbps`。反向样例验过（只改页面那一侧的 `speed_mibs` 会出两条 FAIL、
    退出码 1），不是只会在绿灯时好看的检查。
  - **还没做**：新版引擎在真机 busybox 上跑一轮（锁/自愈/MiB/s 列/多域名列）、
    apk 重新构建（按 Ryan 的话：等他说了再构建）。
- 2026-09-27 第二批（网段缓存 / JSON 消毒 / 配置夹取 / 域名与源清洗 / 切片睡眠 / ACL 收最小授权）：
  `selftest` 82 项全绿，并且**故意拿脏配置在真 curl 下跑了一轮** —— `probe_domains` 里塞
  `https://bad.example` 与 `oops .com`、源列表里塞一条 `http://`、`candidate_budget=6`、
  `interval_hours=999`：日志逐条说明了"丢掉几条、夹到几"，结果 JSON 仍合法（`node` 解析过），
  `domains` 字段是清洗后的值。缓存命中用诱饵验过 —— 把 `cf-nets.txt` 换成两个 TEST-NET 段后
  `cf-ipcheck pool` 就只吐 `203.0.113.102 / 192.0.2.102`，证明它确实不再打官方接口。
  这一批里唯一由测试暴露出来的新缺陷是缓存写失败：写重定向失败属于 shell 级错误、会把整轮带走，
  所以那段写盘挪进了子 shell。

未覆盖：肉眼在普通浏览器里看整页排版。验证用的内嵌页签 `document.hidden=true` 且
`requestAnimationFrame` 不触发，LuCI 的视图引导和 CBI `Map.render()` 在这种页签里根本不会
完成 —— 同环境下已装的 luci-app-dhcp-comment 一样停在「正在载入视图」，一个空的
`new form.Map()` 也不 resolve，故与本包无关。视图代码是拿设备自带的
`form/rpc/ui/view` 直接编译执行 `load()`/`render()` 验的（含 luci.mk 压缩后的那一份）。

## 配置项

| UCI 选项 | 默认 | 说明 |
| :--- | :--- | :--- |
| `enabled` | `0` | 定时实测总开关；关闭时后台只空转 60 秒一轮，打开后一分钟内开始，无需重启服务 |
| `interval_hours` | `6` | 定时周期 |
| `probe_domains` | `www.cloudflare.com` | **必填**，逗号分隔；必须是真正解析到 Cloudflare 后面的域名（节点域名 / Worker 域名） |
| `probe_port` | `443` | 探测端口 |
| `use_official_ranges` | `0` | 是否把官方网段也铺进池子（默认关，避免近六千个 /24 采样挤掉社区优选） |
| `reuse_last` | `1` | 是否回灌上一轮入围 IP |
| `community_sources` | 十三条（见上） | 社区源 URL（list），逐个 HTTPS 抓取；池子一半名额按源均分 |
| `candidate_budget` | `256` | 单轮候选上限 |
| `concurrency` | `8` | 并发探测数 |
| `probe_timeout` | `5` | 单 IP 超时（同时作为连接与整请求超时） |
| `ttfb_limit` | `3000` | TTFB 上限（毫秒） |
| `total_limit` | `5000` | 总耗时上限（毫秒）——两道门槛都过才算达标 |
| `keep_count` | `10` | 榜单保留条数 |
| `colo_probe` | `1` | 是否为入围 IP 查落地机房 |
| `speed_probe` | `1` | 榜单出来后是否再测下载吞吐（关掉即零流量） |
| `speed_count` | `10` | 只对榜单前 N 个 IP 测吞吐，决定每轮流量 = N × `speed_bytes` |
| `speed_bytes` | `10485760` | 单次拉多少字节；小于 4MB 时样本主要在看 TCP 慢启动，抖得厉害 |
| `speed_timeout` | `25` | 单次吞吐测试超时（秒），与 `probe_timeout` 分开 |
| `speed_domain` | `speed.cloudflare.com` | 吞吐测试地址（同样 `--resolve` 钉到候选 IP 上访问） |
| `colo_domain` | `www.cloudflare.com` | 探测域名自己取不到 `colo=` 时的兜底域名（EDT/Worker 常把 `/cdn-cgi/trace` 拦成 403） |
| `canary_check` | `1` | 每轮先用保留地址自检出口有没有被透明代理接管，接管则打标 |
| `probe_user` | `nobody` | 探测发起身份；nobody 的 gid 65534 正好被 OpenClash 的 mark 链豁免。要退回 root 直发就填 `none`（留空会被当成没设置，又落回 `nobody`） |
| `annotate` | `cf-ipcheck \| {colo} \| {total}ms` | `best-ip.txt` 每行注释模板，见「产出文件」里的占位符说明 |
| `upload_gist` | `0` | 每轮后是否上传 Gist |
| `gist_id` / `gist_file` | 空 / `cf-ip.txt` | Gist ID 与文件名 |
| `gist_token` | 空 | 令牌直接写进 UCI（**本机默认走这条**）；填了它就优先用它 |
| `token_file` | `/etc/cf-ipcheck.token` | 备选：`gist_token` 留空时从该文件读 |

手工设置一次探测目标：

```sh
uci set cf_ipcheck.@global[0].probe_domains='你的节点域名.com'
uci commit cf_ipcheck
/etc/init.d/cf-ipcheck restart
```

配置 Gist 上传（令牌直接写进 UCI，页面上也有对应字段，输入框是掩码显示）：

```sh
uci set cf_ipcheck.@global[0].upload_gist='1'
uci set cf_ipcheck.@global[0].gist_id='<GistID>'
uci set cf_ipcheck.@global[0].gist_token='<只勾选 gist 权限的经典令牌>'
uci commit cf_ipcheck
```

写在配置里的代价说清楚：令牌会随 sysupgrade 备份一起走、`uci show cf_ipcheck` 和
这个页面都能直接看到，所以**只放 gist 权限的令牌**，别塞有 repo/workflow 权限的。
不想承担这个代价就留空 `gist_token`，改用文件（`token_file` 指向的路径，两条路并存，
`gist_token` 优先）：

```sh
printf '%s' '你的令牌' > /etc/cf-ipcheck.token
chmod 600 /etc/cf-ipcheck.token
```

## 命令行

```sh
cf-ipcheck run        # 前台跑一轮（调试用）
cf-ipcheck run-now    # 后台起一轮，立即返回
cf-ipcheck status     # 最近一轮状态 JSON
cf-ipcheck show       # 人类可读榜单
cf-ipcheck pool       # 只打印本轮会用的候选 IP（联网取源、不测速）
cf-ipcheck canary     # 只跑一次出口接管自检：{"intercepted":0|1}
cf-ipcheck check-sources  # 逐个源体检：HTTP / 提取到的 IPv4 数 / 落在 CF 段内的数量
cf-ipcheck colo <IP>  # 单 IP 落地机房
cf-ipcheck stop       # 让当前这轮尽快收尾
cf-ipcheck daemon     # 常驻定时（由 /etc/init.d/cf-ipcheck 启动）
cf-ipcheck selftest   # 离线自检，不联网
```

## 产出文件

| 路径 | 内容 |
| :--- | :--- |
| `/etc/cf-ipcheck/best-ip.txt` | 榜单（在 flash 上，重启后仍在），每行 `IP:端口 <注释>`；上传 Gist 用的就是它 |
| `/etc/cf-ipcheck/result.json` | 整轮结果的**持久副本**：`/tmp` 是易失的，重启后页面靠它把上一次结果读回来 |
| `/tmp/cf-ipcheck/result.json` | 同一份内容，本轮完成时写出 |
| `/tmp/cf-ipcheck/status.json` | 运行时状态：`running` / `done` / `error`（带 `reason`）/ `never_run` |
| `/tmp/cf-ipcheck/{probed,aggregated,qualified,ranked,colored}.tsv` | 本轮原始（ip×域名）/ 按 IP 合并后 / 达标 / 排序 / 加了 colo+吞吐的结果，排查“为什么某条没上榜”时看这里 |
| `/tmp/cf-ipcheck/lock` | 运行锁，内容是 `<pid> <启动秒>`（判活用 `kill -0`，超过 6 小时无条件回收） |
| `/etc/cf-ipcheck/cf-nets.txt` | Cloudflare 官方网段的 6 小时缓存：第 1 行 `#<写入秒>`，第 2 行空格分隔的 CIDR |
| `/tmp/cf-ipcheck/cf-ipcheck.log` | 运行日志（`logread -e cf-ipcheck` 亦可） |

`colored.tsv` 的列序是 `ip code connect tls ttfb total colo speed domain`（吞吐单位
MiB/s，未测是 `-`），第 8、9 列分别进 `result.json` 的 `speed_mibs` 与 `domain`。

### 一轮的收尾与自愈

这几条都是被真机场景逼出来的，改引擎时别顺手删掉：

- **同一 IP 只留一行**：探测是 `IP × 探测域名` 的笛卡尔积（不同域名走不同 CF 前置机，
  同一 IP 能差几倍），但榜单语义是「哪个 IP 好用」。`aggregate_per_ip()` 先按 IP 合并
  （有成功就取 `total` 最小那次并连带它的域名，全失败留第一条失败记录）。不合并的话
  同一个 IP 会在榜单里出现 N 遍、`keep_count` 的名额被重复项吃光、`qualified` 还会超过候选池。
- **失败分类 `counts`**：在合并**之后**统计（`none:41, timeout:9, dns:3`），所以每个 IP 只计一次。
  页面 meta 行只报失败类，`none` 就是达标数、不重复报。
- **锁必须判活**：只看文件在不在，一轮被 OOM/断电打断过之后服务就永久停摆
  （每轮都以为“还有实例在跑”）。`lock_live` 用 `kill -0` + 6 小时上限回收陈旧锁；
  锁里的 pid 是 `$(exec sh -c 'echo $PPID')` 取的 —— `run-now` 走的是 `( do_run & )`，
  用 `$$` 会记下立刻退出的父进程；少了 `exec` 又会记成命令替换的临时进程（selftest 里两条都钉了）。
- **`status` 会自愈**：`running` 而锁主已不在 → 改写成 `error/interrupted`（或直接给上一次
  `/etc` 里的结果）；`/tmp` 被清 → 从 `/etc/cf-ipcheck/result.json` 恢复，不会谎称“从未运行过”。
- **本轮不可信时不查机房、不测吞吐**：`intercepted=1` 时那两列取的是代理自己的表现，
  花两轮请求也只会得到一整列相同的假数。
- **数值配置走 `cfg_num` + `cfg_range`**：认不出「一整串都是数字」就退回默认值，超出范围就夹住，
  两种都记一行日志。脏值会让后面的 `$(( ))` 在非交互 shell 里**直接把进程打死**（表现为“按了
  没反应”），而 `speed_bytes`/`candidate_budget` 这类项一旦填飞就是几十 GB 流量或几万次探测 ——
  页面的 `datatype` 挡得住从页面改，挡不住 `uci set` 手改和 sysupgrade 带回来的旧值，
  所以引擎侧必须自己再夹一遍（上限与页面 datatype 一致）。
- **进 JSON 的字符串先消毒**：`colo` 是从远端响应里 `sed` 出来的（在有透明代理的机器上它
  甚至是代理给的），域名与源 URL 是用户手填的 —— 一个引号就能把整份 `result.json` 打成
  前端读不出的 `parse_error`。`json_word()`（机房代码/主机名，只留 `[A-Za-z0-9._-]`）与
  `json_str()`（自由文本，反斜杠与引号一起转，转义写法同 `json_escape_file`）。
- **探测域名与源列表先清洗再用**：`normalize_hosts()` 只按逗号切、整条校验主机名（统一小写、
  去重、允许 FQDN 末尾的点），所以 `"a. com"` 会整条丢掉 —— 早先 `tr ',' ' '` 会把它切成
  `"a."` 与 `"com"` 两个"看着合法"的假域名，白烧一轮还像线路故障。社区源同理只吃
  `https://` 的单行地址（http 清单在链路上就能被人改包），丢了几条记进日志。
- **官方网段缓存 6 小时**（`/etc/cf-ipcheck/cf-nets.txt`）：候选池与「源可用性检测」都要这份
  段表而它半天变不了一次；不缓存时"点一下检测"最坏要阻塞 20+16 秒，会顶穿 rpcd 对
  `file.exec` 的超时（页面表现成"检测失败"，而实际是结果被掐在半路）。拉不到就退回过期缓存
  并记日志；缓存写不下去也不会拖死本轮（写重定向失败是 shell 级错误，故放子 shell 里做）。
- **`daemon` 按 60 秒一片睡**：每片重读配置，改 `interval_hours` 或关总开关一分钟内生效，
  不依赖 uci 的 reload 触发是否真把 procd 实例拉起来。
- **ACL 只放开 `/usr/bin/cf-ipcheck` 的 `exec`**：早先还顺带授意了 4 条 `file.read`
  （status/result/best-ip），而页面从头到尾只走 `file.exec` —— 白要权限。
- **`/etc/config/cf_ipcheck` 里的注释会在页面上改任何一项后消失**：uci 写回时不保留注释。
  仓库里那份是文档（含每条源的出处与段内占比），改过配置想找回说明就看仓库版本。

### 下载速度实测（只对入围 IP）

延迟/耗时四段解决的是「通不通、快不快到能开始传数据」，解决不了「能跑多少」。
真机实测：三个 `total` 只差十几毫秒的 IP，拉 10MB 的吞吐是
**10.6 / 3.57 / 0.19 MB/s**（差的这三个 total 都在同一量级里），差 50 倍；
另一个 IP 连接就要 1.2 秒、10MB 直接拉不完。所以吞吐是独立的信号，值得测。
（这几个数是当时按 MB/s 记的原始记录；引擎现在统一按 **MiB/s** 报，除以 1.048576 即可换算，
比例关系不变。）

但姿势有讲究：

- **只对榜单前 `speed_count`（默认 10）个测**，不对整池测。默认 10 × 10MB ≈ **每轮 100MB 流量**，
  按 6 小时一轮是 400MB/天；不想要就把 `speed_probe` 关掉，那一列显示 `—`，零开销。
- **串行测**，绝不并发。并发一起拉会互抢带宽，几个数全被压平，排名反而失真。
- **样本别太小**：1MB 主要落在 TCP 慢启动上，同一 IP 两次实测 0.56 与 0.20 MB/s（差 2.8 倍）。
  默认 10MB 就是为了让单次数字稳定到能比较。
- **单独超时** `speed_timeout`（默认 25 秒）。复用 5 秒的 `probe_timeout` 会把所有吞吐测量都截断成 0。
- **只展示、不参与排序**（`{speed}` 可以写进注释模板，但排序仍按 `total`→`ttfb`）：
  吞吐的抖动比延迟大，让它主导榜单会来回跳。

测的是 `speed.cloudflare.com/__down?bytes=N`，同样用 `--resolve` 钉在候选 IP 上访问，
所以量到的是那个 IP 的吞吐；换成你自己域名下的大文件也可以（`speed_domain`）。
结果落在 `colored.tsv` 第 8 列、`result.json` 的 `speed_mibs`（没测到是 `null`，
界面上是 `—`），以及 `best-ip.txt` 的 `{speed}` 占位符（没测到是 `-`）。
**测不出来时是 `-` 而不是 `0.00`**：0.00 会被读成「这个 IP 很慢」，而实情是压根没连上，
两者处置完全不同；curl 非 0 退出（半路超时也是）一律记 `-`，哪怕它照样吐了个 `speed_download`。

### `annotate` 注释模板的三个占位符


整行格式固定为 `IP:端口 注释`，模板只决定“注释”那一段；注释会先去掉首尾空格，
所以**只填一个空格 = 只要 `IP:端口`、不要注释**。注意别把这一项整个清空：
uci 分不清“显式留空”和“没这一项”（实测 `uci -q get` 对空值返回 rc=1），
清空等于回到默认模板。

| 占位符 | 取值来源 | 用途 |
| :--- | :--- | :--- |
| `{colo}` | 入围 IP 请求 `https://<探测域名>/cdn-cgi/trace` 返回的 `colo=`；取不到就用 `colo_domain`（默认 `www.cloudflare.com`）再试一次 | 落地机房代码（LAX / NRT / FRA…）。同一批入围里哪些其实落到不同机房，一眼看得出来。EDT / Worker 类节点域名通常把 `/cdn-cgi/trace` 拦成 403，所以这层兜底是必须的，否则整列都是 `n/a`；关掉 `colo_probe` 也会是 `n/a` |
| `{total}` | curl 的 `%{time_total}`（毫秒，保留一位小数，也就是排序用的那个数） | 把“当初测到多少”记在文件里，换线路或过几天再测时能对比出差异；此刻达标不代表下次还达标 |
| `{speed}` | `speed_of()` 拉 `speed_domain` 的 `__down?bytes=speed_bytes` 得到的 `%{speed_download}`，换算成 MiB/s（两位小数） | 吞吐。**只对榜单前 `speed_count` 个 IP 有值**，其余（关掉吞吐测试、或本轮出口被接管时）是 `-` |

默认模板 `cf-ipcheck | {colo} | {total}ms` 渲染出来：

```text
104.16.202.102:443 cf-ipcheck | LAX | 887.4ms
```

其他字符（含 `&`、`/`、中文、空格）原样输出，占位符可以重复写。模板渲染走的是纯字符串替换，
不再用 `sed` —— 老写法在 `{colo}` 展开成 `n/a` 时会被斜杠截断（`sed: unknown option to 's'`），
结果把没展开的 `{colo}` 直接写进文件，这个坑现在有 5 条自检断言钉着（`cf-ipcheck selftest`）。
`cf-ipcheck _annot '<模板>' <colo> <total>` 可以先手工看一下渲染结果。

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
