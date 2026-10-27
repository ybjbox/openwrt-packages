#!/bin/sh
# apply-dns.sh —— 把本轮优选出来的 IP 写进 Cloudflare DNS（支持多记录名、每个记录名多条 A 记录）
#
# 为什么要单独一个脚本、不塞进引擎：
#   引擎（/usr/bin/cf-ipcheck）负责「测量」，而这个脚本负责「对外副作用」。
#   两者正交：DNS 写失败不该影响本轮测量结论，也不该让引擎再背几百行 HTTP 代码。
#   单独成文件还能独立 --dry-run / --selftest / 手工跑，符合「先只读、再动」的规矩。
#
# 为什么 proxied 固定 false（灰云）：
#   橙云会让 Cloudflare 返回它自己的 anycast 地址，客户端根本不会解析到我们优选出来的
#   那颗 IP —— 那样这个功能等于白做。所以这里**强制** false，配置里写了 1 也只记一行警告。
#
# 为什么同一记录名可以有多条 A 记录：
#   DNS 层没有「权重」，同名多条 A 记录就是轮询（客户端/解析器轮流取）。
#   对优选 IP 场景这正好是「多颗都能用，随便挑一颗」的意思，也是故障切换的粗粒度手段：
#   其中一颗挂了，客户端下次轮询会落到别的。
#
# 为什么用 comment 标记自己建的记录：
#   同名 A 记录里可能有人手工在面板上加的。本工具只 PATCH/DELETE 带
#   comment="cf-ipcheck" 的记录，其余一律不碰，只在日志里提示有多少条「非本工具管理」。
#   宁可少管一条，也不误删一条 —— 误删是「网站直接挂」，漏管只是「多一条冗余」。
#
# 为什么只在有差异时才发写请求：
#   默认每 6 小时一轮，若每轮都全量重写，等于给记录 TTL 反复归零、也给 API 添无谓写入。
#   所以每轮先读、再算出 add/keep/del，只发真正的差异。
#
# 安全约定：
#   · 令牌只进 Authorization 头，任何时候都不打印、不写日志；
#   · --dry-run 把 Authorization 打码后打印计划，不联网；
#   · 单请求与总耗时都有上限（rpcd 对外部执行有 30 秒平台级上限）；
#   · 任何失败都只追加一行日志，不做跨目标的回滚（避免覆盖他人改动）；
#   · 写的时候**先加后删**：新增成功之后才删多余的旧记录。反过来（先删后加）一旦
#     新增失败，解析就会少几条甚至空掉 —— 那是"把网站写挂"，比多留一条旧 IP 严重得多；
#   · 同一时刻只允许一个同步在跑（mkdir 原子锁）：自动收尾与页面按钮是两条独立路径，
#     同时算 diff 会各自基于同一份旧快照 POST/DELETE，结果是重复记录或一边删一边加；
#   · 每条要删的记录在删之前把原字段（content/proxied/ttl/comment/id）写进日志，
#     这就是"撤回"需要的全部信息 —— 密码/令牌除外，留在日志里也不会多一条。
#
# 用法：
#   apply-dns.sh --dry-run             # 只打印计划，不联网、不写
#   apply-dns.sh                       # 需要 dns_sync=1（或 --manual/--force）才真的写
#   apply-dns.sh --ip 1.2.3.4,5.6.7.8  # 指定候选 IP（逗号分隔，顺序即优先级）
#   apply-dns.sh --selftest            # 离线自检，不联网

set -u

API='https://api.cloudflare.com/client/v4'
PROG='apply-dns'
MARK='cf-ipcheck'          # 写进记录 comment 的标记，也是「这是本工具建的」唯一判据
MAX_COUNT=10               # 单个记录名最多挂几条 A 记录
BUDGET=25                  # 整次同步的时间预算（秒）。rpcd 上限 30，留 5 秒余量
REQ_TIMEOUT=4              # 单请求超时（秒）。见下面 api() 的注释

RUN_DIR="${CFIP_RUN_DIR:-/tmp/cf-ipcheck}"
ETC_DIR="${CFIP_ETC_DIR:-/etc/cf-ipcheck}"
LOG="$RUN_DIR/cf-ipcheck.log"
# 锁的状态变量要在最早处赋值：--selftest 会在读到锁那段代码之前就 exit，
# 而自测里要拿它做 save/restore（踩过一次 unbound variable）。
LOCKDIR="$RUN_DIR/dns-sync.lock"
LOCK_STALE=600
LOCK_HELD=0

DRY=0
# 三个动作要分开，不能用同一个 force 混着表达：
#   --manual  绕过 dns_sync 总开关（人点了就该执行）
#   --force   连 zone 缓存也绕过（真要去重新问一次 zone id，ssh 里手工用）
SKIP_GATE=0
BYPASS_CACHE=0
SELFTEST=0
IP_ARG=''

usage() {
	cat <<'U'
用法: apply-dns.sh [选项]
  --dry-run            打印将要执行的动作（令牌打码），不联网、不写
  --manual             跳过 dns_sync 开关检查（页面「立即写一次」用这个）
  --force              连 zone id 缓存也跳过，强制重新查一次（手工排查用）
  --ip <IPv4[,IPv4]>   指定候选 IP，顺序即优先级（默认读 result.json / best-ip.txt）
  --selftest           离线自检
U
}

while [ $# -gt 0 ]; do
	case "$1" in
		--dry-run) DRY=1 ;;
		--manual) SKIP_GATE=1 ;;
		--force) SKIP_GATE=1; BYPASS_CACHE=1 ;;
		--selftest) SELFTEST=1 ;;
		--ip) shift; IP_ARG="${1:-}" ;;
		-h|--help) usage; exit 0 ;;
		*) printf '未知参数: %s\n' "$1" >&2; usage >&2; exit 2 ;;
	esac
	shift
done

# ---------------------------------------------------------------- 基础工具

# busybox 下按绝对路径找可执行文件（rpcd 子进程 PATH 里没有 /sbin，引擎踩过这个坑）
find_bin() {
	for f in "$@"; do
		[ -x "$f" ] && { printf '%s' "$f"; return 0; }
	done
	return 1
}

UCI=$(find_bin /sbin/uci /usr/sbin/uci /bin/uci /usr/bin/uci) || UCI=''
JQ=$(find_bin /usr/bin/jq /usr/sbin/jq /bin/jq) || JQ=''
# CFIP_CURL 只为测试留的口子（与引擎的 CFIP_APPLY_DNS 同一性质）：
# 写路径里「该删哪几条、该留哪几条」的判据是最贵的一段，而它必须靠真实的 API
# 响应形状才能验。没有这个覆盖点，就只能拿真令牌在真 zone 上试错 —— 那正是
# 「误删别人记录」最可能发生的场景。正式路径永远走 find_bin 的结果。
CURL="${CFIP_CURL:-$(find_bin /usr/bin/curl /usr/sbin/curl /bin/curl)}" || CURL=''

log() {
	[ "$DRY" = 1 ] && { printf '[dry-run] %s\n' "$*"; return 0; }
	mkdir -p "$RUN_DIR" 2>/dev/null
	printf '%s %s\n' "$(date '+%Y-%m-%dT%H:%M:%S%z' 2>/dev/null || echo '-')" "$*" >> "$LOG" 2>/dev/null
	# 手工在 ssh 里跑时（stderr 是终端）同时打出来；由 rpcd 调用时不是 tty，
	# 就只进日志 —— 免得引擎那边的 stdout 契约被这些行污染。
	[ -t 2 ] && printf '%s\n' "$*" >&2
	return 0
}

# 取值优先级：uci > 环境变量（环境变量只为离线调试，不进正式路径）
env_of() {
	case "$1" in
		dns_sync)       printf '%s' "${CFIP_DNS_SYNC:-}" ;;
		dns_zone)       printf '%s' "${CFIP_DNS_ZONE:-}" ;;
		dns_record)     printf '%s' "${CFIP_DNS_RECORD:-}" ;;
		dns_targets)    printf '%s' "${CFIP_DNS_TARGETS:-}" ;;
		dns_proxied)    printf '%s' "${CFIP_DNS_PROXIED:-}" ;;
		dns_ttl)        printf '%s' "${CFIP_DNS_TTL:-}" ;;
		dns_token)      printf '%s' "${CFIP_DNS_TOKEN:-}" ;;
		dns_token_file) printf '%s' "${CFIP_DNS_TOKEN_FILE:-}" ;;
		*)              printf '' ;;
	esac
}

cfg() {
	_cv=''
	if [ -n "$UCI" ]; then
		_cv=$("$UCI" -q get "cf_ipcheck.@global[0].$1" 2>/dev/null) || _cv=''
	fi
	[ -z "$_cv" ] && _cv=$(env_of "$1")
	printf '%s' "$_cv"
}

# IPv4 校验：先挡空值再判形状。
# 为什么不用 awk 正则兜底：真机上 `awk` 空输入也退出 0，曾被空值骗过（引擎 selftest 有这条）。
valid_ip4() {
	case "${1:-}" in
		''|*[!0-9.]*) return 1 ;;
	esac
	_old_ifs=$IFS
	IFS=.
	# shellcheck disable=SC2086
	set -- $1
	IFS=$_old_ifs
	[ $# -eq 4 ] || return 1
	for _o in "$@"; do
		[ -n "$_o" ] || return 1
		[ "$_o" -ge 0 ] 2>/dev/null && [ "$_o" -le 255 ] || return 1
	done
	return 0
}

# 从记录名推导 zone：cf.example.com -> example.com
# 只砍第一个 label。对 example.co.uk 这类多级后缀会推错，所以配置里可以显式写 zone。
derive_zone() {
	case "${1:-}" in
		*.*.*) printf '%s' "${1#*.}" ;;
		*)     printf '' ;;
	esac
}

# ---- zone_id 缓存 ----
# 为什么缓存 zone_id：
#   要确认「记录没被别人改过」就必须真读一次记录；而按 zone 名读记录之前得先
#   按名字查 zone。多个记录名常落在同一个 zone，把 zone 名到 id 的映射记下来，
#   一整个 zone 只查一次。
# 注意这层缓存**只**省「按名字查 id」，不省「读记录」—— 精确性优先。
ZCACHE="$ETC_DIR/dns-zones"

zcache_get() {
	[ -f "$ZCACHE" ] || return 1
	_v=$(awk -F'|' -v z="$1" '$1==z {print $2; exit}' "$ZCACHE" 2>/dev/null) || _v=''
	# zone_id 必须是 32 位 hex，脏数据一律当没有缓存
	case "$_v" in
		''|*[!0-9a-fA-F]*) return 1 ;;
	esac
	[ ${#_v} -eq 32 ] || return 1
	printf '%s' "$_v"
	return 0
}

zcache_put() {
	mkdir -p "$ETC_DIR" 2>/dev/null
	if [ -f "$ZCACHE" ]; then
		awk -F'|' -v z="$1" '$1!=z' "$ZCACHE" > "$ZCACHE.tmp" 2>/dev/null || : > "$ZCACHE.tmp"
	else
		: > "$ZCACHE.tmp" 2>/dev/null
	fi
	printf '%s|%s\n' "$1" "$2" >> "$ZCACHE.tmp" 2>/dev/null
	mv "$ZCACHE.tmp" "$ZCACHE" 2>/dev/null || rm -f "$ZCACHE.tmp" 2>/dev/null
	return 0
}

# ---- 目标清单解析 ----
# 输入：多行文本，每行 "<记录名> [数量] [zone]"
#   · 空行与 # 开头的行跳过；行尾 # 之后算注释
#   · 数量省略时默认 1；zone 省略时用全局 dns_zone，再不行从记录名推导
# 输出：每行 "记录名|数量|zone"，解析不了的行输出到 stderr 并跳过
# 抽成函数是为了能在 --selftest 里直接钉住解析规则 —— 这行格式是用户手写的，
# 容错边界比核心逻辑更容易出错。
parse_targets() {
	_default_zone="${2:-}"
	printf '%s\n' "${1:-}" | while IFS= read -r _l; do
		# 去行尾注释、去首尾空白
		_l=${_l%%#*}
		_l=$(printf '%s' "$_l" | sed 's/^[[:space:]]*//; s/[[:space:]]*$//')
		[ -n "$_l" ] || continue

		# shellcheck disable=SC2086
		set -- $_l
		_f=${1:-}
		_c=${2:-1}
		_z=${3:-}

		case "$_f" in
			'') printf '解析失败：缺记录名\n' >&2; continue ;;
			*.*) : ;;
			*) printf '解析失败：%s 不像完整记录名（要写 cf.example.com 这种）\n' "$_f" >&2; continue ;;
		esac

		case "$_c" in
			''|*[!0-9]*) printf '解析失败：%s 的数量 %s 不是正整数\n' "$_f" "$_c" >&2; continue ;;
		esac
		[ "$_c" -ge 1 ] || { printf '解析失败：%s 的数量要 >= 1\n' "$_f" >&2; continue; }
		[ "$_c" -le "$MAX_COUNT" ] || { printf '数量 %s 超过上限 %s，按 %s 处理（%s）\n' "$_c" "$MAX_COUNT" "$MAX_COUNT" "$_f" >&2; _c=$MAX_COUNT; }

		[ -n "$_z" ] || _z=$_default_zone
		[ -n "$_z" ] || _z=$(derive_zone "$_f")
		if [ -z "$_z" ]; then
			printf '解析失败：%s 推不出 zone，请在行尾写上 zone\n' "$_f" >&2
			continue
		fi

		printf '%s|%s|%s\n' "$_f" "$_c" "$_z"
	done
}

# ---- 候选 IP 清单 ----
# 输出所有候选 IP，一行一个，**去重且保序**（顺序 = 榜单排名）。
# 来源优先级：--ip > result.json > best-ip.txt。
# 去重是必须的：榜单偶尔会出现相邻两行同 IP（重复探测），不去重会让同一个 IP
# 占掉好几个名额，反而把真正不同的候选挤出去。
ranked_ips() {
	_raw=''
	if [ -n "$IP_ARG" ]; then
		_raw=$(printf '%s' "$IP_ARG" | tr ',' '\n')
	elif [ -f "$RUN_DIR/result.json" ] && [ -n "$JQ" ]; then
		_raw=$("$JQ" -r '.items[]?.ip // empty' "$RUN_DIR/result.json" 2>/dev/null) || _raw=''
	fi
	if [ -z "$_raw" ] && [ -f "$ETC_DIR/best-ip.txt" ]; then
		# 榜单形如 "1.2.3.4 # cf-ipcheck | SIN | 123ms"，也可能有裸 IP 行。
		# 这里必须用 awk 而不是 `sed -n 's/...//p'`：sed 的 p 只打印**发生过替换**的行，
		# 裸 IP 行没匹配到就不打印 —— 单 IP 时代只读第一行所以没暴露，多 IP 就少读一半。
		_raw=$(awk '{ sub(/[#[:space:]].*$/, ""); if ($0 != "") print }' "$ETC_DIR/best-ip.txt" 2>/dev/null)
	fi
	[ -n "$_raw" ] || return 1
	printf '%s\n' "$_raw" | while IFS= read -r _ip; do
		[ -n "$_ip" ] || continue
		valid_ip4 "$_ip" && printf '%s\n' "$_ip"
	done | awk '!seen[$0]++'
}

# 请求体用 jq 拼，不手工拼字符串 —— 记录名里可能有需要转义的字符
body_create() {
	"$JQ" -n --arg n "$2" --arg c "$1" --argjson t "$TTL" --arg m "$MARK" \
		'{type:"A",name:$n,content:$c,proxied:false,ttl:$t,comment:$m}'
}

body_patch() {
	"$JQ" -n --arg c "$1" --argjson t "$TTL" --arg m "$MARK" \
		'{content:$c,proxied:false,ttl:$t,comment:$m}'
}

api() {
	# $1 = GET|POST|PATCH|DELETE, $2 = 路径, $3 = body（GET/DELETE 时省略）
	# --max-time 4 是算过的：多目标时请求数会变多（每个目标 1 读 + 最多 N 写），
	# 而 rpcd 对外部执行有平台级 30 秒上限（真机 /etc/config/rpcd option timeout 30，
	# file.exec 与 ucode 方法共用）。单请求 4 秒 + BUDGET 25 秒双重约束，
	# 保证在被 rpcd 掐断前自己先停手、给出「做到哪一步」的日志，而不是页面一片沉默。
	if [ -n "${3:-}" ]; then
		"$CURL" -sS --max-time "$REQ_TIMEOUT" -X "$1" \
			-H "Authorization: Bearer $TOKEN" \
			-H 'Content-Type: application/json' \
			--data "$3" "$API$2"
	else
		"$CURL" -sS --max-time "$REQ_TIMEOUT" -X "$1" \
			-H "Authorization: Bearer $TOKEN" "$API$2"
	fi
}

# 剩余预算够不够再发一个请求
budget_ok() {
	[ "$DRY" = 1 ] && return 0
	_left=$(( BUDGET - ( $(date +%s) - T_START ) ))
	[ "$_left" -ge "$REQ_TIMEOUT" ] && return 0
	log "已接近 rpcd 的 30 秒上限（用了 $(( $(date +%s) - T_START )) 秒），停止后续目标；已完成的部分已生效"
	return 1
}

# ---------------------------------------------------------------- 自检（离线）

selftest() {
	_ok=0; _bad=0
	chk() {
		if [ "$2" = "$3" ]; then _ok=$((_ok + 1)); printf '[PASS] %s\n' "$1"
		else _bad=$((_bad + 1)); printf '[FAIL] %s：期望 %s，得到 %s\n' "$1" "$3" "$2"; fi
	}

	valid_ip4 1.2.3.4;          chk '合法 IPv4' "$?" 0
	valid_ip4 255.255.255.255;  chk '边界 255' "$?" 0
	valid_ip4 256.1.1.1;        chk '越界 256' "$?" 1
	valid_ip4 '';               chk '空串不算合法' "$?" 1
	valid_ip4 1.2.3;            chk '三段不算合法' "$?" 1
	valid_ip4 1.2.3.4.5;        chk '五段不算合法' "$?" 1
	valid_ip4 'a.b.c.d';        chk '非数字不算合法' "$?" 1

	chk 'zone 推导：cf.example.com' "$(derive_zone cf.example.com)" 'example.com'
	chk 'zone 推导：只有两段 → 空' "$(derive_zone example.com)" ''
	chk 'zone 推导：空 → 空' "$(derive_zone '')" ''

	# ---- 目标清单解析（用户手写，容错边界最容易错）----
	chk '单行只写记录名 → 数量默认 1' \
		"$(parse_targets 'cf.example.com' 'example.com' 2>/dev/null)" 'cf.example.com|1|example.com'
	chk '带数量' \
		"$(parse_targets 'cf.example.com 3' 'example.com' 2>/dev/null)" 'cf.example.com|3|example.com'
	chk '带数量与独立 zone' \
		"$(parse_targets 'api.other.net 2 other.net' 'example.com' 2>/dev/null)" 'api.other.net|2|other.net'
	chk '空行与 # 注释行被跳过' \
		"$(parse_targets '
# 这是注释
cf.example.com 2

' 'example.com' 2>/dev/null)" 'cf.example.com|2|example.com'
	chk '行尾注释被去掉' \
		"$(parse_targets 'cf.example.com 2 # 主线' 'example.com' 2>/dev/null)" 'cf.example.com|2|example.com'
	_multi=$(printf 'a.example.com 3\nb.example.com 1\nc.example.net 2 other.net')
	chk '多行保序' \
		"$(parse_targets "$_multi" 'example.com' 2>/dev/null | tr '\n' ',')" \
		'a.example.com|3|example.com,b.example.com|1|example.com,c.example.net|2|other.net,'
	chk '不带 zone 且无全局 zone 时按记录名推导' \
		"$(parse_targets 'cf.example.com 2' '' 2>/dev/null)" 'cf.example.com|2|example.com'
	chk '数量非数字 → 丢弃并报错' \
		"$(parse_targets 'cf.example.com x' 'example.com' 2>/dev/null)" ''
	chk '数量 0 → 丢弃' \
		"$(parse_targets 'cf.example.com 0' 'example.com' 2>/dev/null)" ''
	chk '数量超上限 → 截到 10' \
		"$(parse_targets 'cf.example.com 99' 'example.com' 2>/dev/null)" 'cf.example.com|10|example.com'
	chk '记录名不像 FQDN → 丢弃' \
		"$(parse_targets 'nohost 2' 'example.com' 2>/dev/null)" ''
	chk '全空输入 → 空输出' "$(parse_targets '' 'example.com' 2>/dev/null)" ''

	# ---- 候选 IP：读取 / 去重 / 保序 ----
	_tmp="${TMPDIR:-/tmp}/cfip-test.$$"
	mkdir -p "$_tmp/etc" "$_tmp/run" 2>/dev/null
	printf '9.9.9.9 # cf-ipcheck | NRT | 88ms\n8.8.8.8\n9.9.9.9\nbad-line\n7.7.7.7\n' > "$_tmp/etc/best-ip.txt"
	_save_run=$RUN_DIR; _save_etc=$ETC_DIR; _save_ip=$IP_ARG
	RUN_DIR="$_tmp/run"; ETC_DIR="$_tmp/etc"; IP_ARG=''
	chk 'best-ip.txt 读取：去注释、去非法、去重、保序' \
		"$(ranked_ips | tr '\n' ',')" '9.9.9.9,8.8.8.8,7.7.7.7,'
	IP_ARG='5.5.5.5,6.6.6.6'
	chk '--ip 优先且支持逗号多值' "$(ranked_ips | tr '\n' ',')" '5.5.5.5,6.6.6.6,'
	IP_ARG='5.5.5.5,5.5.5.5'
	chk '--ip 内部也去重' "$(ranked_ips | tr '\n' ',')" '5.5.5.5,'
	IP_ARG='5.5.5.5,bad,6.6.6.6'
	chk '--ip 里非法值被丢弃' "$(ranked_ips | tr '\n' ',')" '5.5.5.5,6.6.6.6,'
	IP_ARG=''
	chk '取前 N：前 2 个' "$(ranked_ips | head -n 2 | tr '\n' ',')" '9.9.9.9,8.8.8.8,'
	RUN_DIR=$_save_run; ETC_DIR=$_save_etc; IP_ARG=$_save_ip
	rm -rf "$_tmp" 2>/dev/null

	# ---- zone_id 缓存 ----
	_tmp2="${TMPDIR:-/tmp}/cfip-zone.$$"
	_save_etc2=$ETC_DIR; _save_zc=$ZCACHE
	ETC_DIR="$_tmp2"; ZCACHE="$ETC_DIR/dns-zones"
	_zid='0123456789abcdef0123456789abcdef'
	chk '没有缓存文件时读不到' "$(zcache_get example.com 2>/dev/null)" ''
	zcache_put example.com "$_zid"
	chk '写入后能读回 zone_id' "$(zcache_get example.com)" "$_zid"
	zcache_put other.net 'fedcba9876543210fedcba9876543210'
	chk '多个 zone 各自独立' "$(zcache_get other.net)" 'fedcba9876543210fedcba9876543210'
	chk '追加后原来的还在' "$(zcache_get example.com)" "$_zid"
	zcache_put example.com 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'
	chk '同 zone 重写会覆盖（不是追加两行）' "$(zcache_get example.com)" 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'
	chk '同 zone 只有一行' "$(grep -c '^example\.com|' "$ZCACHE")" '1'
	zcache_put bad.example 'notahex'
	chk 'zone_id 不是 32 位 hex → 当没有缓存' "$(zcache_get bad.example 2>/dev/null)" ''
	ETC_DIR=$_save_etc2; ZCACHE=$_save_zc
	rm -rf "$_tmp2" 2>/dev/null

	# ---- 并发锁（B2）：只有一个人能拿到；残留/陈旧的锁要能被接管 ----
	_tmp3="${TMPDIR:-/tmp}/cfip-lock.$$"
	mkdir -p "$_tmp3" 2>/dev/null
	_save_run3=$RUN_DIR; _save_lock3=$LOCKDIR; _save_log3=$LOG
	RUN_DIR="$_tmp3"; LOCKDIR="$_tmp3/dns-sync.lock"; LOG="$_tmp3/cf-ipcheck.log"
	LOCK_HELD=0
	lock_take; chk '第一次拿锁成功' "$?" 0
	lock_take; chk '同一进程再拿一次拿不到（有活着的持有者）' "$?" 1
	release_lock
	lock_take; chk '释放后能再拿到' "$?" 0
	# 残留锁：持有者 pid 已经不在
	release_lock
	mkdir -p "$LOCKDIR"; printf '999999 %s\n' "$(date +%s)" >"$LOCKDIR/owner"
	lock_take; chk '持有者进程已不在的残留锁会被接管' "$?" 0
	# 陈旧锁：pid 活着（就是自己）但起锁时间超过 10 分钟
	release_lock
	mkdir -p "$LOCKDIR"; printf '%s %s\n' "$$" "$(( $(date +%s) - 9999 ))" >"$LOCKDIR/owner"
	lock_take; chk '活着但超时的锁会被接管（断电/被杀不再永久卡死）' "$?" 0
	# 时间字段是脏值：算术里出现非数字会把 BusyBox 的 shell 打死（cfg_num 那一课）
	release_lock
	mkdir -p "$LOCKDIR"; printf '999999 胡来\n' >"$LOCKDIR/owner"
	lock_take; chk '时间字段是脏值时不炸、按已死处理' "$?" 0
	release_lock
	RUN_DIR=$_save_run3; LOCKDIR=$_save_lock3; LOG=$_save_log3
	rm -rf "$_tmp3" 2>/dev/null

	if [ -n "$JQ" ]; then
		TTL=60
		_b=$(body_patch '1.2.3.4')
		chk 'PATCH 体含 content' "$(printf '%s' "$_b" | "$JQ" -r .content)" '1.2.3.4'
		chk 'PATCH 体 proxied 是布尔 false' "$(printf '%s' "$_b" | "$JQ" -r '.proxied|tostring')" 'false'
		chk 'PATCH 体 ttl 是数字' "$(printf '%s' "$_b" | "$JQ" -r '.ttl|type')" 'number'
		chk 'PATCH 体带 comment 标记' "$(printf '%s' "$_b" | "$JQ" -r .comment)" "$MARK"
		_c=$(body_create '1.2.3.4' 'cf.example.com')
		chk 'POST 体含 type=A' "$(printf '%s' "$_c" | "$JQ" -r .type)" 'A'
		chk 'POST 体含记录名' "$(printf '%s' "$_c" | "$JQ" -r .name)" 'cf.example.com'
		chk 'POST 体含 comment 标记' "$(printf '%s' "$_c" | "$JQ" -r .comment)" "$MARK"
		# 集合差异的三个判据（用真实的 API 响应形状来钉）
		_js='{"result":[
			{"id":"r1","content":"1.1.1.1","comment":"cf-ipcheck"},
			{"id":"r2","content":"2.2.2.2","comment":"cf-ipcheck"},
			{"id":"r3","content":"9.9.9.9","comment":""},
			{"id":"r4","content":"8.8.8.8","comment":"手工加的"}
		]}'
		chk '识别本工具建的（comment 前缀）' \
			"$(printf '%s' "$_js" | "$JQ" -r '[.result[]|select((.comment//"")|startswith("cf-ipcheck"))|.content]|join(",")')" \
			'1.1.1.1,2.2.2.2'
		chk '识别非本工具建的' \
			"$(printf '%s' "$_js" | "$JQ" -r '[.result[]|select(((.comment//"")|startswith("cf-ipcheck"))|not)|.content]|join(",")')" \
			'9.9.9.9,8.8.8.8'
		chk '该保留的（期望里有、已有）' \
			"$(printf '%s' "$_js" | "$JQ" -r --arg m "$MARK" '
				[.result[]|select((.comment//"")|startswith($m))] as $mine
				| ["1.1.1.1","3.3.3.3"] - [ $mine[].content ] | join(",")')" \
			'3.3.3.3'
		chk '该删除的（mine 里有、期望里没有）' \
			"$(printf '%s' "$_js" | "$JQ" -r --arg m "$MARK" '
				[.result[]|select((.comment//"")|startswith($m))] as $mine
				| [ $mine[] | select(.content as $c | (["1.1.1.1","3.3.3.3"]|index($c))|not) | .content ] | join(",")')" \
			'2.2.2.2'
		chk '期望里已被他人建过的那个不算缺失' \
			"$(printf '%s' "$_js" | "$JQ" -r --arg m "$MARK" '
				[.result[]|select(((.comment//"")|startswith($m))|not)|.content] as $other
				| (["3.3.3.3","9.9.9.9"] - $other) | join(",")')" \
			'3.3.3.3'
	else
		printf '[SKIP] 没有 jq，跳过请求体与集合断言\n'
	fi

	printf '\n自检：%s 通过，%s 失败\n' "$_ok" "$_bad"
	[ "$_bad" = 0 ] || return 1
	return 0
}

release_lock() {
	[ "${LOCK_HELD:-0}" = 1 ] && rm -rf "$LOCKDIR" 2>/dev/null
	LOCK_HELD=0
	return 0
}

lock_owner_alive() { # $1=pid
	case "${1:-}" in
		''|*[!0-9]*) return 1 ;;
	esac
	kill -0 "$1" 2>/dev/null
}

lock_take() {
	mkdir -p "$RUN_DIR" 2>/dev/null
	if mkdir "$LOCKDIR" 2>/dev/null; then
		printf '%s %s\n' "$$" "$(date +%s)" >"$LOCKDIR/owner" 2>/dev/null
		LOCK_HELD=1
		trap 'release_lock' EXIT INT TERM HUP
		return 0
	fi
	_own=$(sed -n '1p' "$LOCKDIR/owner" 2>/dev/null)
	_p=${_own%% *}
	_t=${_own##* }
	# 算术里出现非数字会把 BusyBox 的 shell 直接打死（cfg_num 那一课），先挡掉
	case "$_t" in ''|*[!0-9]*) _t=0 ;; esac
	_now=$(date +%s)
	if lock_owner_alive "$_p" && [ $(( _now - _t )) -lt "$LOCK_STALE" ] 2>/dev/null; then
		log "另一个 DNS 同步正在进行（pid $_p），本次跳过"
		return 1
	fi
	if lock_owner_alive "$_p"; then
		log "接管陈旧的 DNS 同步锁（pid $_p 已持有超过 ${LOCK_STALE} 秒）"
	else
		log "接管残留的 DNS 同步锁（pid ${_p:-?} 已不在）"
	fi
	rm -rf "$LOCKDIR"
	mkdir "$LOCKDIR" 2>/dev/null || { log '拿不到 DNS 同步锁，本次跳过'; return 1; }
	printf '%s %s\n' "$$" "$_now" >"$LOCKDIR/owner" 2>/dev/null
	LOCK_HELD=1
	trap 'release_lock' EXIT INT TERM HUP
	return 0
}

[ "$SELFTEST" = 1 ] && { selftest; exit $?; }

# ---------------------------------------------------------------- 并发锁
# 为什么用 mkdir 而不是 flock：BusyBox 上没有 flock，而 mkdir 在所有 unix 上都是
# 原子的（要么建成功、要么已存在）。锁目录里记 pid + 起锁时刻；pid 已死或超过
# LOCK_STALE 秒就接管 —— 断电/被杀留下的锁不能让 DNS 同步永远停摆。
# ---------------------------------------------------------------- 主流程

DEFAULT_ZONE=$(cfg dns_zone)
# 目标清单在 uci 里是**分号分隔的单行**（uci 的 option 值不能含换行，写进去会坏配置文件），
# 页面上的多行文本框保存前会转成分号。这里把分号还原成换行再解析，
# 同时也接受真的多行（手工编辑 /etc/config 或走环境变量时）。
TARGETS_RAW=$(cfg dns_targets | tr ';' '\n')
TOKEN=$(cfg dns_token)
TOKEN_FILE=$(cfg dns_token_file)
TTL=$(cfg dns_ttl)
SYNC=$(cfg dns_sync)

# 令牌文件只在 dns_token 为空时才读（与 gist 那套一致的优先级）
if [ -z "$TOKEN" ] && [ -n "$TOKEN_FILE" ] && [ -r "$TOKEN_FILE" ]; then
	TOKEN=$(sed -n '1{s/[[:space:]]*$//;p;}' "$TOKEN_FILE" 2>/dev/null)
fi

# 兼容老配置：dns_targets 为空时，把 dns_record + dns_zone 当成唯一目标。
# 这条回退必须留着 —— 升级用户 /etc/config 是 conffiles，旧键还在、
# 新键要等迁移脚本跑，中间这段时间不能让功能失效。
if [ -z "$TARGETS_RAW" ]; then
	_legacy=$(cfg dns_record)
	if [ -n "$_legacy" ]; then
		TARGETS_RAW="$_legacy 1"
	fi
fi

[ -n "$TARGETS_RAW" ] || { log '缺 dns_targets（也没配 dns_record），不执行'; exit 2; }
[ -n "$TOKEN" ]      || { log '缺 dns_token 或 dns_token_file 读不到，不执行'; exit 2; }

TTL=${TTL:-60}
case "$TTL" in
	''|*[!0-9]*) log "dns_ttl 不是正整数（$TTL），按 60 处理"; TTL=60 ;;
esac
[ "$TTL" -ge 1 ] && [ "$TTL" -le 86400 ] || { log "dns_ttl 超出 1..86400（$TTL），不执行"; exit 2; }

if [ "$(cfg dns_proxied)" = '1' ]; then
	log 'dns_proxied=1 被忽略：橙云会让优选 IP 失效，这里固定灰云（proxied=false）'
fi

# 解析目标：能解析的行照常执行；解析失败的行把原因写进日志，不中断其余目标。
# （一次配置里 5 行，坏 1 行不该让另外 4 行也停 —— 但要让人知道坏在哪）
_PARSE_WARN=$(parse_targets "$TARGETS_RAW" "$DEFAULT_ZONE" 2>&1 >/dev/null)
TARGETS=$(parse_targets "$TARGETS_RAW" "$DEFAULT_ZONE" 2>/dev/null)
if [ -n "$_PARSE_WARN" ]; then
	log "目标清单有解析问题：$(printf '%s' "$_PARSE_WARN" | tr '\n' '；')"
fi
[ -n "$TARGETS" ] || { log '目标清单为空（全部行都解析失败），不执行'; exit 2; }

TARGET_TOTAL=$(printf '%s\n' "$TARGETS" | grep -c .)

# 安全闸：没开总开关、也没 --manual/--force，就只允许 dry-run
if [ "$DRY" = 0 ] && [ "$SYNC" != '1' ] && [ "$SKIP_GATE" = 0 ]; then
	log "dns_sync 未置 1，且没给 --manual/--force —— 这是刻意的安全闸，不写入（用 --dry-run 可以先看计划）"
	exit 2
fi

# jq 一律需要（构造与解析都靠它）；curl 只在真要联网时才需要 ——
# --dry-run 必须能在一台没有 curl 的机器上跑，否则「先看计划再决定」这条就断了。
[ -n "$JQ" ] || { log '缺少 jq，无法解析/构造 JSON'; exit 2; }
if [ "$DRY" = 0 ]; then
	[ -n "$CURL" ] || { log '缺少 curl，无法访问 Cloudflare API'; exit 2; }
fi

T_START=$(date +%s)

# 单实例：--dry-run 只读、不占锁（否则"先看看计划"会被一个正在跑的同步挡住）。
# 抢不到就 exit 2 —— 脚本自己已经把"另一个同步在跑"记进日志了，引擎那边按 2 处理，
# 不会把它报成失败。
if [ "$DRY" = 0 ]; then
	lock_take || exit 2
fi

# 全量候选 IP（去重保序）。取不到就没有可写的内容。
CANDIDATES=$(ranked_ips) || CANDIDATES=''
if [ -z "$CANDIDATES" ]; then
	log '没有可用的候选 IP（result.json / best-ip.txt / --ip 都取不到），不执行'
	exit 2
fi
CAND_TOTAL=$(printf '%s\n' "$CANDIDATES" | grep -c .)

# 取榜单前 N 个
top_ips() {
	printf '%s\n' "$CANDIDATES" | head -n "$1"
}

# 某 IP 是否在换行分隔的列表里
ip_in_list() {
	case "
$2
" in
		*"
$1
"*) return 0 ;;
	esac
	return 1
}

# zone 名 -> zone id，优先走缓存
resolve_zone() {
	_z=$1
	# zone 本身就是 32 位 hex（用户直接填了 id）
	case "$_z" in
		*[!0-9a-fA-F]*) : ;;
		*) [ ${#_z} -eq 32 ] && { printf '%s' "$_z"; return 0; } ;;
	esac
	if [ "$BYPASS_CACHE" = 0 ]; then
		_c=$(zcache_get "$_z" 2>/dev/null) && { printf '%s' "$_c"; return 0; }
	fi
	budget_ok || return 1
	if [ "$DRY" = 1 ]; then
		printf '[dry-run] GET  %s/zones?name=%s\n        Authorization: Bearer ***\n' "$API" "$_z" >&2
		printf '<zone_id>'
		return 0
	fi
	_res=$(api GET "/zones?name=$_z") || { log "查 zone 失败（网络）：$_z"; return 1; }
	if [ "$(printf '%s' "$_res" | "$JQ" -r '.success')" != 'true' ]; then
		log "查 zone 被拒：$(printf '%s' "$_res" | "$JQ" -r '.errors[0].message // "未知错误"')"
		return 1
	fi
	_zid=$(printf '%s' "$_res" | "$JQ" -r '.result[0].id // empty')
	[ -n "$_zid" ] || { log "zone 不存在或令牌无权访问：$_z"; return 1; }
	zcache_put "$_z" "$_zid"
	printf '%s' "$_zid"
	return 0
}

# 处理单个目标。$1=序号 $2=总数 $3=记录名|数量|zone
# 退出码：0 成功（含无变化）；3 网络；4 API/逻辑拒；5 回读不一致
handle_target() {
	_no=$1; _tot=$2; _spec=$3
	_f=${_spec%%|*}; _rest=${_spec#*|}
	_n=${_rest%%|*}; _z=${_rest#*|}

	_want=$(top_ips "$_n")
	_want_n=$(printf '%s\n' "$_want" | grep -c .)
	_want_csv=$(printf '%s\n' "$_want" | tr '\n' ' ' | sed 's/ $//')

	_tag="目标 $_no/$_tot $_f"
	[ "$_want_n" -ge "$_n" ] || log "$_tag：榜单只有 $_want_n 个可用 IP（想要 $_n 个），按实际数量办"

	_zid=$(resolve_zone "$_z") || return 3

	# ---- 读现有记录（同名 A 记录可能多条，全要）----
	if [ "$DRY" = 1 ]; then
		printf '[dry-run] %s（zone %s）\n' "$_tag" "$_z"
		printf '          期望: %s\n' "$_want_csv"
		printf '          GET   %s/zones/%s/dns_records?type=A&name=%s&per_page=100\n' "$API" "${_zid:-<zone_id>}" "$_f"
		printf '          读回后按差异执行：缺的 POST、comment=%s 且不在期望内的 DELETE、其余不动\n' "$MARK"
		_body=$(body_create "$(printf '%s' "$_want" | head -n 1)" "$_f")
		printf '          新建时的 body（示例）: %s\n' "$_body"
		return 0
	fi

	budget_ok || return 3
	_res=$(api GET "/zones/$_zid/dns_records?type=A&name=$_f&per_page=100") || { log "$_tag：查记录失败（网络）"; return 3; }
	if [ "$(printf '%s' "$_res" | "$JQ" -r '.success')" != 'true' ]; then
		log "$_tag：查记录被拒：$(printf '%s' "$_res" | "$JQ" -r '.errors[0].message // "未知错误"')"
		return 4
	fi

	# 三类：本工具建的（comment 前缀 MARK）/ 别人的 / 期望里已有的
	# 输出 "id:ip" 单 token 形式：`for x in $list` 是按空白拆的，
	# 如果输出 "id ip" 两个词，遍历就会拆散成四个 token（这条踩过）。
	_mine=$(printf '%s' "$_res" | "$JQ" -r --arg m "$MARK" \
		'.result[]|select((.comment//"")|startswith($m))|"\(.id):\(.content)"')
	_other_n=$(printf '%s' "$_res" | "$JQ" -r --arg m "$MARK" \
		'[.result[]|select(((.comment//"")|startswith($m))|not)]|length')

	# 需要新建的：期望里有、且任何现有记录（含别人的）都没有同 content
	_add=''
	for _ip in $_want; do
		if printf '%s\n' "$_mine" | grep -q ":$_ip\$"; then
			continue
		fi
		if printf '%s' "$_res" | "$JQ" -e --arg c "$_ip" '[.result[]|select(.content==$c)]|length>0' >/dev/null 2>&1; then
			# 别人已经建了同样的 content —— 不重复建，也不去改它（那是别人的记录）
			continue
		fi
		_add="$_add $_ip"
	done

	# 需要删除的：本工具建的、但不在期望内
	_del=''
	for _item in $_mine; do
		_id=${_item%%:*}
		_ip=${_item#*:}
		if ip_in_list "$_ip" "$_want"; then
			continue
		fi
		_del="$_del $_id:$_ip"
	done

	_add_n=$(printf '%s' "$_add" | wc -w | tr -d ' ')
	_del_n=$(printf '%s' "$_del" | wc -w | tr -d ' ')
	_keep_n=$(( _want_n - _add_n ))
	SUM_ADD=$((SUM_ADD + _add_n))
	SUM_DEL=$((SUM_DEL + _del_n))

	# ---- 无差异：直接收工 ----
	if [ "$_add_n" -eq 0 ] && [ "$_del_n" -eq 0 ]; then
		_note=''
		[ "$_other_n" -gt 0 ] && _note="，另有 $_other_n 条非本工具管理的记录未动"
		log "$_tag：已与期望一致（$_want_csv），未发写请求$_note"
		return 0
	fi

	# ---- 先新增缺少的 ----
	# 顺序是刻意的：新增成功之后才动删除。反过来的窗口里（旧的删了、新的还没建成）
	# 这个记录名的 A 记录会少几条甚至空掉 —— 对线上来说就是解析中断或变慢。
	# 先加的唯一代价是中间那一小会儿多一两颗"旧但当时可用"的 IP，DNS 层轮询无碍。
	for _ip in $_add; do
		budget_ok || return 3
		_body=$(body_create "$_ip" "$_f")
		_r=$(api POST "/zones/$_zid/dns_records" "$_body") || { log "$_tag：新增 $_ip 失败（网络），旧记录未动"; return 3; }
		if [ "$(printf '%s' "$_r" | "$JQ" -r '.success')" != 'true' ]; then
			log "$_tag：新增 $_ip 被拒：$(printf '%s' "$_r" | "$JQ" -r '.errors[0].message // "未知错误"')（旧记录未动）"
			return 4
		fi
	done

	# ---- 再删除多余的（删之前先把原记录留档）----
	for _item in $_del; do
		_id=${_item%%:*}
		_ip=${_item#*:}
		# 留档就是"撤回"要的全部信息：拿这一行去面板重建，或照着它手动 POST 回去。
		_prev=$(printf '%s' "$_res" | "$JQ" -r --arg id "$_id" \
			'.result[]|select(.id==$id)|"proxied=\(.proxied) ttl=\(.ttl) comment=\(.comment // "")"')
		log "$_tag：删除前留档 $_f A $_ip（${_prev:-原字段读不到}，id=$_id）—— 要恢复就照这行重建"
		budget_ok || return 3
		_r=$(api DELETE "/zones/$_zid/dns_records/$_id") || { log "$_tag：删除 $_ip 失败（网络）"; return 3; }
		if [ "$(printf '%s' "$_r" | "$JQ" -r '.success')" != 'true' ]; then
			log "$_tag：删除 $_ip 被拒：$(printf '%s' "$_r" | "$JQ" -r '.errors[0].message // "未知错误"')（保留原记录）"
			return 4
		fi
	done

	# ---- 回读校验：期望的 IP 必须全部在，且本工具多写的必须已清掉 ----
	budget_ok || return 3
	_verify=$(api GET "/zones/$_zid/dns_records?type=A&name=$_f&per_page=100") || { log "$_tag：回读失败（网络），写入结果未知"; return 3; }
	_got=$(printf '%s' "$_verify" | "$JQ" -r '.result[].content')
	_missing=''
	for _ip in $_want; do
		printf '%s\n' "$_got" | grep -qx "$_ip" || _missing="$_missing $_ip"
	done
	# 这里要的是"本工具建的、却不在期望里"的那些，不是"所有本工具建的"。
	# 变量名沿用 _extra，但判据必须过一遍期望清单 —— 否则正常轮次也会误报"删除没生效"。
	_mine_now=$(printf '%s' "$_verify" | "$JQ" -r --arg m "$MARK" \
		'[.result[]|select((.comment//"")|startswith($m))|.content]|join(" ")')
	_extra=''
	for _ip in $_mine_now; do
		ip_in_list "$_ip" "$_want" || _extra="$_extra $_ip"
	done

	_note=''
	[ "$_other_n" -gt 0 ] && _note="，另有 $_other_n 条非本工具管理的记录未动"
	if [ -n "$_missing" ]; then
		log "$_tag：回读少了 IP:$_missing（期望 $_want_csv）—— 请人工核对（未做回滚，避免覆盖他人改动）"
		return 5
	fi
	if [ -n "$(printf '%s' "$_extra" | tr -d ' ')" ]; then
		log "$_tag：回读仍有本工具建却不在期望内的记录（$_extra）—— 删除没生效，请人工核对"
		return 5
	fi
	log "$_tag：已同步 新增 $_add_n / 删除 $_del_n / 保持 $_keep_n（当前 $_want_csv）$_note"
	return 0
}

# ---- 逐目标执行 ----
# 统计要在这里累计，不能放在 handle_target 里做局部变量：
# 引擎（dns_sync_hook）取的是日志**最后一行**当作页面提示，
# 多目标时不加总结行的话，页面只会显示最后一个目标的结果 ——
# 前面某个目标失败了，用户看到的仍是「已同步」，这是最坏的一种沉默。
_rc_all=0
SUM_OK=0
SUM_FAIL=0
SUM_ADD=0
SUM_DEL=0
_seen=0
while IFS= read -r _spec; do
	[ -n "$_spec" ] || continue
	_seen=$((_seen + 1))
	if handle_target "$_seen" "$TARGET_TOTAL" "$_spec"; then
		SUM_OK=$((SUM_OK + 1))
	else
		_r=$?
		SUM_FAIL=$((SUM_FAIL + 1))
		_rc_all=$_r
	fi
done <<EOF
$TARGETS
EOF

if [ "$DRY" = 1 ]; then
	printf '[dry-run] 共 %s 个目标（未联网、未写入）\n' "$TARGET_TOTAL"
elif [ "$SUM_FAIL" -eq 0 ]; then
	log "DNS 同步完成：$SUM_OK 个记录名已与期望一致（新增 $SUM_ADD / 删除 $SUM_DEL）"
else
	log "DNS 同步结束：$SUM_OK 成功、$SUM_FAIL 失败（共 $TARGET_TOTAL 个记录名）—— 失败原因见上面各目标那行"
fi

# dns_sync_hook 会把退出码带回页面；多目标时按最后一个失败码报，
# 每个目标各自的结论都在日志里。
exit "$_rc_all"
