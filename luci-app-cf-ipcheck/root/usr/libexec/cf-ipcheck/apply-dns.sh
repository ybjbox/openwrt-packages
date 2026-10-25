#!/bin/sh
# apply-dns.sh —— 把本轮榜首 IP 写进 Cloudflare DNS 的指定 A 记录
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
# 为什么只在 IP 变化时才发写请求：
#   默认每 6 小时一轮，若每轮都 PATCH 一次，等于给记录 TTL 反复归零、也给 API 添无谓写入。
#   内容相同就直接退出（幂等）。
#
# 安全约定：
#   · 令牌只进 Authorization 头，任何时候都不打印、不写日志；
#   · --dry-run 把 Authorization 打码后打印完整请求，便于人工核对；
#   · 任何失败都只追加一行日志，不修改任何现状（不删记录、不回滚别人的值）。
#
# 用法：
#   apply-dns.sh --dry-run           # 只打印将要发的请求，不联网写
#   apply-dns.sh                     # 需要 dns_sync=1（或 --force）才真的写
#   apply-dns.sh --ip 1.2.3.4         # 指定 IP，不读 result.json
#   apply-dns.sh --selftest          # 离线自检，不联网

set -u

API='https://api.cloudflare.com/client/v4'
PROG='apply-dns'

RUN_DIR="${CFIP_RUN_DIR:-/tmp/cf-ipcheck}"
ETC_DIR="${CFIP_ETC_DIR:-/etc/cf-ipcheck}"
LOG="$RUN_DIR/cf-ipcheck.log"

DRY=0
# 三个动作要分开，不能用同一个 force 混着表达：
#   --manual  绕过 dns_sync 总开关（人点了就该执行），但**仍然**走本机去重
#   --force   连去重也绕过（真要去问一次现在的记录，ssh 里手工用）
SKIP_GATE=0
BYPASS_CACHE=0
SELFTEST=0
IP_ARG=''

usage() {
	cat <<'U'
用法: apply-dns.sh [选项]
  --dry-run        打印将要发送的请求（令牌打码），不写
  --manual         跳过 dns_sync 开关检查；已经同步过的 IP 仍然会跳过（页面按钮用这个）
  --force          连本机去重也跳过，强制去问一次 Cloudflare（手工排查用）
  --ip <IPv4>      指定目标 IP（默认取 result.json 的 items[0].ip）
  --selftest       离线自检
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
CURL=$(find_bin /usr/bin/curl /usr/sbin/curl /bin/curl) || CURL=''

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

# ---- 本机去重状态 ----
# 为什么还要一层本机状态，明明接口那边已经幂等了：
#   接口幂等（读回 content 与目标一致就不写）只能省掉「写」，省不掉读 —— 每轮仍要
#   发 2 个 GET（查 zone、查记录）才能知道记录是什么。6 小时一轮虽然不算多，
#   但「已经解析过的 IP 就不该再问一遍」是更直接的语义，也省下两条无谓请求。
#   所以：把「上次确实生效过的 (zone, 记录, TTL, IP)」记在 /etc 下（掉电不丢），
#   自动路径命中就直接短路；--force（页面手工点）**不**吃这层缓存，仍去问一次 ——
#   人点了就是想确认现在的记录到底是不是这颗 IP。
#   状态只在「回读校验通过」或「读到的内容本来就等于目标」之后才写，绝不提前记。
STATE_FILE="$ETC_DIR/dns-state"

state_get() {
	[ -f "$STATE_FILE" ] && sed -n '1p' "$STATE_FILE" 2>/dev/null
	return 0
}

state_put() {
	mkdir -p "$ETC_DIR" 2>/dev/null
	if printf '%s\n' "$1" > "$STATE_FILE.tmp" 2>/dev/null; then
		mv "$STATE_FILE.tmp" "$STATE_FILE" 2>/dev/null || rm -f "$STATE_FILE.tmp" 2>/dev/null
	fi
	return 0
}

# 解析状态行，命中时置 ST_ZONE_ID 与 ST_MATCH=1。
# 抽成函数是为了能在 --selftest 里直接钉住「命中 / 不命中」的判据 ——
# 这段是准确性路径的核心，藏在主流程里就只能靠真机碰运气。
state_load() {
	# $1=zone $2=记录名 $3=ttl $4=ip
	ST_ZONE_ID=''
	ST_MATCH=0
	_st=$(state_get)
	[ -n "$_st" ] || return 0
	_szid=${_st%%|*}; _rest=${_st#*|}
	_szone=${_rest%%|*}; _rest=${_rest#*|}
	_srec=${_rest%%|*}; _rest=${_rest#*|}
	_sttl=${_rest%%|*}; _sip=${_rest#*|}
	# zone_id 必须是 32 位 hex：旧格式（4 段）或脏数据一律当作没有缓存
	case "$_szid" in
		''|*[!0-9a-fA-F]*) return 0 ;;
	esac
	[ ${#_szid} -eq 32 ] || return 0
	[ "$_szone" = "$1" ] || return 0
	[ "$_srec" = "$2" ] || return 0
	[ "$_sttl" = "$3" ] || return 0
	[ "$_sip" = "$4" ] || return 0
	ST_ZONE_ID=$_szid
	ST_MATCH=1
	return 0
}

# 目标 IP：--ip > result.json 的 items[0].ip > best-ip.txt 第一行（去掉注释与端口）
target_ip() {	if [ -n "$IP_ARG" ]; then printf '%s' "$IP_ARG"; return 0; fi
	if [ -f "$RUN_DIR/result.json" ] && [ -n "$JQ" ]; then
		_t=$("$JQ" -r '.items[0].ip // empty' "$RUN_DIR/result.json" 2>/dev/null) || _t=''
		[ -n "$_t" ] && { printf '%s' "$_t"; return 0; }
	fi
	if [ -f "$ETC_DIR/best-ip.txt" ]; then
		# 榜单形如 "1.2.3.4 # cf-ipcheck | SIN | 123ms"：取第一行、砍掉 # 之后
		sed -n '1{s/[#[:space:]].*$//;p;}' "$ETC_DIR/best-ip.txt" 2>/dev/null
		return 0
	fi
	return 1
}

# 请求体用 jq 拼，不手工拼字符串 —— 记录名里可能有需要转义的字符
body_create() {
	"$JQ" -n --arg n "$REC" --arg c "$1" --argjson t "$TTL" \
		'{type:"A",name:$n,content:$c,proxied:false,ttl:$t}'
}

body_patch() {
	"$JQ" -n --arg c "$1" --argjson t "$TTL" \
		'{content:$c,proxied:false,ttl:$t}'
}

api() {
	# $1 = GET|POST|PATCH, $2 = 路径, $3 = body（GET 时省略）
	# --max-time 6 是算过的：一次同步最多 4 个请求（zone/查记录/写/回读），
	# 而 rpcd 对外部执行有平台级 30 秒上限（真机 /etc/config/rpcd option timeout 30，
	# file.exec 与 ucode 方法共用）。4×6=24 秒才留得住余量；给 20 秒的话最坏会
	# 被 rpcd 掐断，页面上表现为「没有回应」而不是一条明确的失败原因。
	if [ -n "${3:-}" ]; then
		"$CURL" -sS --max-time 6 -X "$1" \
			-H "Authorization: Bearer $TOKEN" \
			-H 'Content-Type: application/json' \
			--data "$3" "$API$2"
	else
		"$CURL" -sS --max-time 6 -X "$1" \
			-H "Authorization: Bearer $TOKEN" "$API$2"
	fi
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

	# 目标 IP 的读取链路（用临时目录，不碰真实路径）
	_tmp="${TMPDIR:-/tmp}/cfip-test.$$"
	mkdir -p "$_tmp/etc" "$_tmp/run" 2>/dev/null
	printf '9.9.9.9 # cf-ipcheck | NRT | 88ms\n8.8.8.8\n' > "$_tmp/etc/best-ip.txt"
	_save_run=$RUN_DIR; _save_etc=$ETC_DIR
	RUN_DIR="$_tmp/run"; ETC_DIR="$_tmp/etc"
	chk 'best-ip.txt 取第一行并去注释' "$(target_ip)" '9.9.9.9'
	IP_ARG='7.7.7.7'
	chk '--ip 优先' "$(target_ip)" '7.7.7.7'
	IP_ARG=''
	RUN_DIR=$_save_run; ETC_DIR=$_save_etc
	rm -rf "$_tmp" 2>/dev/null

	# 本机去重状态：写入 / 读回 / 命中判据
	# 这一段是准确性路径的核心：判错就会「该写的没写」或「每轮都白查」。
	_tmp2="${TMPDIR:-/tmp}/cfip-state.$$"
	_save_etc2=$ETC_DIR
	ETC_DIR="$_tmp2"; STATE_FILE="$ETC_DIR/dns-state"
	_zid='0123456789abcdef0123456789abcdef'
	chk '没有状态文件时读回空' "$(state_get)" ''
	state_put "$_zid|example.com|cf.example.com|60|1.2.3.4"
	chk '状态写入后能原样读回' "$(state_get)" "$_zid|example.com|cf.example.com|60|1.2.3.4"
	state_load example.com cf.example.com 60 1.2.3.4
	chk '四项全同 → 命中' "$ST_MATCH" '1'
	chk '命中时把 zone_id 带回（省掉一次 zone 查询）' "$ST_ZONE_ID" "$_zid"
	state_load example.com cf.example.com 60 5.6.7.8
	chk 'IP 变了 → 不命中' "$ST_MATCH" '0'
	state_load example.com other.example.com 60 1.2.3.4
	chk '记录名变了 → 不命中' "$ST_MATCH" '0'
	state_load example.com cf.example.com 120 1.2.3.4
	chk 'TTL 变了 → 不命中' "$ST_MATCH" '0'
	state_load other.example.net cf.example.com 60 1.2.3.4
	chk 'zone 变了 → 不命中' "$ST_MATCH" '0'
	state_put "notahex|example.com|cf.example.com|60|1.2.3.4"
	state_load example.com cf.example.com 60 1.2.3.4
	chk 'zone_id 不是 32 位 hex → 当没有缓存' "$ST_MATCH" '0'
	state_put 'example.com|cf.example.com|60|1.2.3.4'
	state_load example.com cf.example.com 60 1.2.3.4
	chk '旧的 4 段格式 → 当没有缓存（不会误命中）' "$ST_MATCH" '0'
	ETC_DIR=$_save_etc2; STATE_FILE="$ETC_DIR/dns-state"
	rm -rf "$_tmp2" 2>/dev/null

	if [ -n "$JQ" ]; then
		REC='cf.example.com'; TTL=60
		_b=$(body_patch '1.2.3.4')
		chk 'PATCH 体含 content' "$(printf '%s' "$_b" | "$JQ" -r .content)" '1.2.3.4'
		chk 'PATCH 体 proxied 是布尔 false' "$(printf '%s' "$_b" | "$JQ" -r '.proxied|tostring')" 'false'
		chk 'PATCH 体 ttl 是数字' "$(printf '%s' "$_b" | "$JQ" -r '.ttl|type')" 'number'
		_c=$(body_create '1.2.3.4')
		chk 'POST 体含 type=A' "$(printf '%s' "$_c" | "$JQ" -r .type)" 'A'
		chk 'POST 体含记录名' "$(printf '%s' "$_c" | "$JQ" -r .name)" 'cf.example.com'
	else
	printf '[SKIP] 没有 jq，跳过请求体断言\n'
	fi

	printf '\n自检：%s 通过，%s 失败\n' "$_ok" "$_bad"
	[ "$_bad" = 0 ] || return 1
	return 0
}

[ "$SELFTEST" = 1 ] && { selftest; exit $?; }

# ---------------------------------------------------------------- 主流程

ZONE=$(cfg dns_zone)
REC=$(cfg dns_record)
TOKEN=$(cfg dns_token)
TOKEN_FILE=$(cfg dns_token_file)
TTL=$(cfg dns_ttl)
SYNC=$(cfg dns_sync)

# 令牌文件只在 dns_token 为空时才读（与 gist 那套一致的优先级）
if [ -z "$TOKEN" ] && [ -n "$TOKEN_FILE" ] && [ -r "$TOKEN_FILE" ]; then
	TOKEN=$(sed -n '1{s/[[:space:]]*$//;p;}' "$TOKEN_FILE" 2>/dev/null)
fi

[ -n "$ZONE" ]  || { log '缺 dns_zone（zone 名或 zone id），不执行'; exit 2; }
[ -n "$REC" ]   || { log '缺 dns_record（完整记录名），不执行'; exit 2; }
[ -n "$TOKEN" ] || { log '缺 dns_token 或 dns_token_file 读不到，不执行'; exit 2; }

TTL=${TTL:-60}
case "$TTL" in
	''|*[!0-9]*) log "dns_ttl 不是正整数（$TTL），按 60 处理"; TTL=60 ;;
esac
[ "$TTL" -ge 1 ] && [ "$TTL" -le 86400 ] || { log "dns_ttl 超出 1..86400（$TTL），不执行"; exit 2; }

if [ "$(cfg dns_proxied)" = '1' ]; then
	log 'dns_proxied=1 被忽略：橙云会让优选 IP 失效，这里固定灰云（proxied=false）'
fi

TIP=$(target_ip) || TIP=''
valid_ip4 "$TIP" || { log "目标 IP 不合法（'$TIP'），不执行"; exit 2; }

# 安全闸：没开总开关、也没 --force，就只允许 dry-run
if [ "$DRY" = 0 ] && [ "$SYNC" != '1' ] && [ "$SKIP_GATE" = 0 ]; then
	log "dns_sync 未置 1，且没给 --force —— 这是刻意的安全闸，不写入（用 --dry-run 可以先看请求）"
	exit 2
fi

# ---- 0. 读本机状态：去重 + 缓存 zone_id ----
# 状态行格式：<zone_id>|<zone>|<记录名>|<ttl>|<ip>
# 为什么连 zone_id 一起存：准确性的代价要压到最小。要确认「记录没被别人改过」，
# 就必须真的读一次记录；而按 zone 名读记录之前得先按名字查 zone（2 个请求）。
# 把 zone_id 缓存下来，核对就只要 1 个请求。
#
# 注意去重**不等于**跳过核对：命中只说明「上次写成功的就是这颗 IP」，
# 不代表 Cloudflare 上现在还是它（面板上人手改过、别的脚本动过）。
# 所以下面的流程是「少查一次 zone」，而不是「什么都不查」。
ST_ZONE_ID=''
ST_MATCH=0
if [ "$DRY" = 0 ] && [ "$BYPASS_CACHE" = 0 ]; then
	state_load "$ZONE" "$REC" "$TTL" "$TIP"
fi

# 工具检查放在去重之后：已经同步过的 IP 在这一步之前就退出了，
# 不该因为开发机上没有 jq 就报一个和「同步状态」无关的错。
# jq 一律需要（构造与解析都靠它）；curl 只在真要联网时才需要 ——
# --dry-run 必须能在一台没有 curl 的机器上跑，否则「先看请求再决定」这条就断了。
[ -n "$JQ" ] || { log '缺少 jq，无法解析/构造 JSON'; exit 2; }
if [ "$DRY" = 0 ]; then
	[ -n "$CURL" ] || { log '缺少 curl，无法访问 Cloudflare API'; exit 2; }
fi

# ---- 1. zone id（zone 本身就是 32 位 hex 就直接用；否则优先用状态里缓存的 id）
case "$ZONE" in
	*[!0-9a-fA-F]*) ZONE_ID='' ;;
	*) ZONE_ID=$([ ${#ZONE} -eq 32 ] && printf '%s' "$ZONE") ;;
esac
# 缓存命中就用它，省掉「按 zone 名查 id」那一次请求（这是去重省下来的唯一开销）
[ -n "$ZONE_ID" ] || ZONE_ID=$ST_ZONE_ID

if [ -z "$ZONE_ID" ]; then
	if [ "$DRY" = 1 ]; then
		printf '[dry-run] GET  %s/zones?name=%s\n        Authorization: Bearer ***\n' "$API" "$ZONE"
	else
		_res=$(api GET "/zones?name=$ZONE") || { log "查 zone 失败（网络）：$ZONE"; exit 3; }
		if [ "$(printf '%s' "$_res" | "$JQ" -r '.success')" != 'true' ]; then
			log "查 zone 被拒：$(printf '%s' "$_res" | "$JQ" -r '.errors[0].message // "未知错误"')"
			exit 4
		fi
		ZONE_ID=$(printf '%s' "$_res" | "$JQ" -r '.result[0].id // empty')
		[ -n "$ZONE_ID" ] || { log "zone 不存在或令牌无权访问：$ZONE"; exit 4; }
	fi
fi

# ---- 2. 查现有记录
if [ "$DRY" = 1 ]; then
	printf '[dry-run] GET  %s/zones/%s/dns_records?type=A&name=%s\n' "$API" "${ZONE_ID:-<zone_id>}" "$REC"
	CURL_CONTENT=''
	REC_ID=''
else
	_res=$(api GET "/zones/$ZONE_ID/dns_records?type=A&name=$REC") || { log "查记录失败（网络）：$REC"; exit 3; }
	if [ "$(printf '%s' "$_res" | "$JQ" -r '.success')" != 'true' ]; then
		log "查记录被拒：$(printf '%s' "$_res" | "$JQ" -r '.errors[0].message // "未知错误"')"
		exit 4
	fi
	_n=$(printf '%s' "$_res" | "$JQ" -r '.result | length')
	if [ "$_n" -gt 1 ]; then
		log "同名 A 记录有 $_n 条（不该发生），为免误改，不执行"
		exit 4
	fi
	REC_ID=$(printf '%s' "$_res" | "$JQ" -r '.result[0].id // empty')
	CURL_CONTENT=$(printf '%s' "$_res" | "$JQ" -r '.result[0].content // empty')
fi

# ---- 3. 记录已等于目标：核对通过，不发写请求
if [ "$DRY" = 0 ] && [ -n "$REC_ID" ] && [ "$CURL_CONTENT" = "$TIP" ]; then
	# 刚读到的就是目标值 —— 这是「核对过」的事实，不只是「记得是」。写进状态。
	state_put "$ZONE_ID|$ZONE|$REC|$TTL|$TIP"
	if [ "$ST_MATCH" = 1 ]; then
		log "DNS 未变：$REC 已是 $TIP（已核对记录，未发写请求）"
	else
		log "DNS 未变：$REC 已是 $TIP"
	fi
	exit 0
fi

# ---- 4. 写
if [ -n "$REC_ID" ]; then
	_body=$(body_patch "$TIP")
	if [ "$DRY" = 1 ]; then
		printf '[dry-run] PATCH %s/zones/%s/dns_records/%s\n        Authorization: Bearer ***\n        %s\n' \
			"$API" "${ZONE_ID:-<zone_id>}" "$REC_ID" "$_body"
		exit 0
	fi
	_res=$(api PATCH "/zones/$ZONE_ID/dns_records/$REC_ID" "$_body") || { log "PATCH 失败（网络）：$REC"; exit 3; }
else
	_body=$(body_create "$TIP")
	if [ "$DRY" = 1 ]; then
		printf '[dry-run] POST %s/zones/%s/dns_records\n        Authorization: Bearer ***\n        %s\n' \
			"$API" "${ZONE_ID:-<zone_id>}" "$_body"
		exit 0
	fi
	_res=$(api POST "/zones/$ZONE_ID/dns_records" "$_body") || { log "POST 失败（网络）：$REC"; exit 3; }
fi

if [ "$(printf '%s' "$_res" | "$JQ" -r '.success')" != 'true' ]; then
	log "写入被拒：$(printf '%s' "$_res" | "$JQ" -r '.errors[0].message // "未知错误"')（记录保持原值）"
	exit 4
fi

# ---- 5. 回读校验
_verify=$(api GET "/zones/$ZONE_ID/dns_records?type=A&name=$REC") || { log "回读失败（网络）：$REC，写入结果未知"; exit 3; }
_got=$(printf '%s' "$_verify" | "$JQ" -r '.result[0].content // empty')
if [ "$_got" = "$TIP" ]; then
	# 只有回读确认过才写状态：先记状态再写记录的话，万一写失败，
	# 下一轮就会以为「已经同步过」而跳过，把错误永久固化下来。
	state_put "$ZONE_ID|$ZONE|$REC|$TTL|$TIP"
	log "DNS 已更新：$REC -> $TIP（ttl=$TTL，proxied=false）"
	exit 0
fi

log "回读不一致：期望 $TIP，实际 '$_got' —— 请人工核对（未做任何回滚，避免覆盖他人改动）"
exit 5
