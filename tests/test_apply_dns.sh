#!/bin/sh
# DNS 同步网络加固回归（CI 用；隔离临时目录 + 假 curl + 故障注入）
# 覆盖：GET 超时重试 / 重试也失败 / 写请求连接阶段失败重试 / POST 响应丢失后回读 /
#       DELETE 响应丢失 / 删除失败但已有新增生效 → 部分完成（退出码 6，数量按实际写入算）。
# 依赖：jq（CI 的 alpine job 先 apk add jq）。不联网、不读写真 DNS。
ROOT=$(CDPATH= cd "$(dirname "$0")/.." 2>/dev/null && pwd) || exit 1
AD="$ROOT/luci-app-cf-ipcheck/root/usr/libexec/cf-ipcheck/apply-dns.sh"
MK="$ROOT/tests/fixtures/mock-cf-curl.sh"
S="${TMPDIR:-/tmp}/cfi-dns-test.$$"
STORE=$S/records
TRACE=$STORE.trace
LOG=$S/run/cf-ipcheck.log
W=$S/wrap
trap 'rm -rf "$S"' EXIT INT TERM
mkdir -p "$S/run" "$S/etc" "$W" || exit 1
ok=0; bad=0
chk() { if [ "$2" = "$3" ]; then ok=$((ok+1)); printf '[PASS] %s\n' "$1"; else bad=$((bad+1)); printf '[FAIL] %s: got <%s> want <%s>\n' "$1" "$2" "$3"; fi; }

zid() { printf '%s' "$1" | md5sum | cut -c1-32; }
Z=$(zid example.com)

reset() {
	rm -rf "$S/run" "$S/etc" "$W" "$STORE" "$TRACE" "$S/mark"*
	mkdir -p "$S/run" "$S/etc" "$W"
	: >"$STORE"; : >"$TRACE"
}
seed() { # name id ip comment
	printf '%s|%s|%s|%s|%s\n' "$Z" "$1" "$2" "$3" "$4" >>"$STORE"
}
mk_legacy_curl() {
	# 首次 GET /dns_records? 超时；之后放行
	cat >"$W/get.sh" <<'EOF'
#!/bin/sh
case "$*" in
	*"/dns_records?"*)
		c=0
		[ -f "$MOCK_MARK" ] && c=$(cat "$MOCK_MARK" 2>/dev/null)
		case "$c" in ''|*[!0-9]*) c=0 ;; esac
		if [ "$c" -lt "$MOCK_FAIL_TIMES" ]; then
			c=$((c+1)); printf '%s' "$c" >"$MOCK_MARK"
			printf 'curl: (28) Operation timed out after 6001 milliseconds\n' >&2
			exit 28
		fi
		;;
esac
exec sh "$MOCK_CURL" "$@"
EOF
	chmod +x "$W/get.sh"
}
mk_write_curl() {
	# 首次写请求：drop=不发；after=先写成功再丢响应；connect=连接阶段 TLS 失败
	cat >"$W/write.sh" <<'EOF'
#!/bin/sh
case "$*" in
	*"-X $MOCK_METHOD"*"/dns_records"*)
		if [ ! -f "$MOCK_MARK" ]; then
			: >"$MOCK_MARK"
			if [ "$MOCK_MODE" = after ]; then
				sh "$MOCK_CURL" "$@" >/dev/null 2>&1
				printf 'curl: (28) Operation timed out after 6001 milliseconds\n' >&2
				exit 28
			fi
			if [ "$MOCK_MODE" = connect ]; then
				printf 'curl: (35) TLS connect error: error:0A000126:SSL routines::unexpected eof while reading\n' >&2
				exit 35
			fi
			printf 'curl: (28) Operation timed out after 6001 milliseconds\n' >&2
			exit 28
		fi
		;;
esac
exec sh "$MOCK_CURL" "$@"
EOF
	chmod +x "$W/write.sh"
}
run() { # $1=curl wrapper $2=extra env assignments...
	curlw=$1; shift
	env MOCK_STORE="$STORE" CFIP_CURL="$curlw" CFIP_RUN_DIR="$S/run" CFIP_ETC_DIR="$S/etc" \
		CFIP_UCI=/bin/false MOCK_CURL="$MK" CFIP_DNS_TOKEN=x CFIP_DNS_TARGETS="cf.example.com 2" "$@" \
		sh "$AD" --manual --ip 4.4.4.4,5.5.5.5
}
run_result() { # 从 result.json 取候选（不走 --ip），用于验发布过滤
	env MOCK_STORE="$STORE" CFIP_CURL="$MK" CFIP_RUN_DIR="$S/run" CFIP_ETC_DIR="$S/etc" \
		CFIP_UCI=/bin/false MOCK_CURL="$MK" CFIP_DNS_TOKEN=x \
		CFIP_DNS_TARGETS="cf.example.com 2 @NRT" sh "$AD" --manual
}
count_records() { awk -F'|' -v n="$1" '$2==n{print $4}' "$STORE" | grep -c .; }
has_log() { grep -q "$1" "$LOG" 2>/dev/null && echo yes || echo no; }

reset; mk_legacy_curl
echo "=== 1. GET 超时一次 → 重试成功 ==="
run "$W/get.sh" MOCK_MARK="$W/mark.get1" MOCK_FAIL_TIMES=1 >/dev/null 2>&1; rc=$?
chk '退出码 0' "$rc" 0
chk '两条记录都写进去了' "$(count_records cf.example.com)" 2
chk '日志记录了重试' "$(has_log '重试 1/1')" yes
chk '没有把目标判失败' "$(has_log '查记录失败')" no

reset; mk_legacy_curl
echo "=== 2. GET 连续超时两次 → 报网络失败，不写 ==="
run "$W/get.sh" MOCK_MARK="$W/mark.get2" MOCK_FAIL_TIMES=2 >/dev/null 2>&1; rc=$?
chk '退出码 3' "$rc" 3
chk '没有写记录' "$(count_records cf.example.com)" 0
chk '日志说明本次不重试' "$(has_log '本次不重试')" yes
chk '汇总行说失败' "$(has_log 'DNS 同步结束：0 完成、0 部分完成、1 失败')" yes

reset; mk_legacy_curl
echo "=== 3. POST 响应丢失但记录已建成 → 回读确认，不重复写 ==="
seed cf.example.com x0 1.1.1.1 cf-ipcheck
mk_write_curl
# 目标 2 条：4.4.4.4 新建时丢响应；5.5.5.5 正常
run "$W/write.sh" MOCK_MARK="$W/mark.post" MOCK_METHOD=POST MOCK_MODE=after >/dev/null 2>&1; rc=$?
chk '退出码 0' "$rc" 0
chk 'cf 上最终 2 条期望记录（1.1.1.1 是旧记录，另算）' \
	"$(awk -F'|' '$2=="cf.example.com" && ($4=="4.4.4.4" || $4=="5.5.5.5")' "$STORE" | wc -l)" 2
chk '没有因为重试多出重复 4.4.4.4' \
	"$(awk -F'|' '$2=="cf.example.com" && $4=="4.4.4.4"' "$STORE" | wc -l)" 1
chk '日志说回读确认记录已在' "$(has_log '回读确认记录已在')" yes
chk 'POST 总次数 = 2（丢响应的那次没有重放）' "$(grep -c '^POST' "$TRACE")" 2

reset
echo "=== 4. DELETE 响应丢失但记录已删掉 → 回读确认成功 ==="
seed cf.example.com old1 1.1.1.1 cf-ipcheck
mk_write_curl
run "$W/write.sh" MOCK_MARK="$W/mark.del.ok" MOCK_METHOD=DELETE MOCK_MODE=after >/dev/null 2>&1; rc=$?
chk '退出码 0' "$rc" 0
chk '旧记录已不在' "$(awk -F'|' '$3=="old1"' "$STORE" | wc -l)" 0
chk '日志说请求超时后回读确认' "$(has_log '请求超时，回读确认')" yes
chk '删除成功只记一行 IP' "$(has_log '删除 1.1.1.1')" yes
chk '不再打印删除前留档' "$(has_log '删除前留档')" no

reset
echo "=== 4b. DELETE TLS 连接失败 → 连接阶段安全重试一次 ==="
seed cf.example.com old3 1.1.1.3 cf-ipcheck
mk_write_curl
run "$W/write.sh" MOCK_MARK="$W/mark.del.tls" MOCK_METHOD=DELETE MOCK_MODE=connect >/dev/null 2>&1; rc=$?
chk '退出码 0' "$rc" 0
chk '旧记录被删掉' "$(awk -F'|' '$3=="old3"' "$STORE" | wc -l)" 0
chk '日志记录了连接阶段重试' "$(has_log '重试 1/1')" yes
chk 'DELETE 只发了一次（连接失败未到 mock）' "$(grep -c '^DELETE' "$TRACE")" 1

reset
echo "=== 4c. DNS 发布过滤：4xx 可达但不发布 ==="
cat >"$S/run/result.json" <<'JSON'
{"items":[{"ip":"5.5.5.5","code":200}],
 "dc_summary":[{"dc":"NRT","items":[
  {"ip":"4.4.4.4","ttfb_ms":10,"code":403},
  {"ip":"5.5.5.5","ttfb_ms":20,"code":200},
  {"ip":"6.6.6.6","ttfb_ms":30,"code":200},
  {"ip":"7.7.7.7","ttfb_ms":40,"code":200}]}]}
JSON
run_result >/dev/null 2>&1; rc=$?
chk '退出码 0' "$rc" 0
chk '只发布 2 条（请求 2 条）' "$(count_records cf.example.com)" 2
chk '403 的 4.4.4.4 没进 DNS' \
	"$(awk -F'|' '$2=="cf.example.com" && $4=="4.4.4.4"' "$STORE" | wc -l)" 0
chk '按 ttfb 取前 2 个 2xx' \
	"$(awk -F'|' '$2=="cf.example.com"{printf "%s ",$4}' "$STORE" | tr -d '\n')" '5.5.5.5 6.6.6.6 '
if [ "$rc" != 0 ]; then
	echo "---- 4c apply-dns log (rc=$rc) ----"
	sed -n '1,80p' "$LOG" 2>/dev/null
	echo "---- 4c store ----"
	cat "$STORE" 2>/dev/null
fi

reset
echo "=== 4d. 候选全被 HTTP 过滤 → 保留旧记录，不清空 ==="
seed cf.example.com old4 9.9.9.9 cf-ipcheck
cat >"$S/run/result.json" <<'JSON'
{"items":[{"ip":"9.9.9.8","code":200}],
 "dc_summary":[{"dc":"NRT","items":[
  {"ip":"4.4.4.4","ttfb_ms":10,"code":403},
  {"ip":"6.6.6.6","ttfb_ms":20,"code":500}]}]}
JSON
run_result >/dev/null 2>&1; rc=$?
chk '退出码 0（跳过不是失败）' "$rc" 0
chk '旧记录仍在' \
	"$(awk -F'|' '$2=="cf.example.com" && $4=="9.9.9.9"' "$STORE" | wc -l)" 1
chk '没有新增被过滤的 IP' \
	"$(awk -F'|' '$2=="cf.example.com" && ($4=="4.4.4.4" || $4=="6.6.6.6")' "$STORE" | wc -l)" 0
chk '日志说明保留旧记录' "$(has_log '保留现有 DNS 记录')" yes
chk '汇总说明保留旧记录' "$(has_log '保留旧记录')" yes

reset
echo "=== 5. DELETE 失败且记录仍在 → 部分完成（退出码 6） ==="
seed cf.example.com old2 1.1.1.2 cf-ipcheck
mk_write_curl
run "$W/write.sh" MOCK_MARK="$W/mark.del.no" MOCK_METHOD=DELETE MOCK_MODE=drop >/dev/null 2>&1; rc=$?
chk '退出码 6（部分完成）' "$rc" 6
chk '旧记录确实还在' "$(awk -F'|' '$3=="old2"' "$STORE" | wc -l)" 1
chk '新记录已经写进去' "$(awk -F'|' '$2=="cf.example.com" && $4=="4.4.4.4"' "$STORE" | wc -l)" 1
chk '日志点名下次同步再删' "$(has_log '记录仍在；下次同步再删')" yes
chk '汇总行说部分完成' "$(has_log 'DNS 同步部分完成')" yes
chk '汇总的数量是实际写入数（已新增 2 / 已删除 0）' \
	"$(has_log '已新增 2 / 已删除 1')$(has_log '已新增 2 / 已删除 0')" 'noyes'

echo "=== 6. 引擎把退出码 6 翻成 partial 标记 ==="
ERUN="$S/engine-run"; mkdir -p "$ERUN"
cat >"$S/fake6.sh" <<'EOF'
#!/bin/sh
printf '%s 测试：DNS 同步部分完成\n' "$(date '+%Y-%m-%dT%H:%M:%S%z')" >>"$CFIP_RUN_DIR/cf-ipcheck.log"
exit 6
EOF
chmod +x "$S/fake6.sh"
out=$(CFIP_RUN_DIR="$ERUN" \
	CFIP_LIB="$ROOT/luci-app-cf-ipcheck/root/usr/libexec/cf-ipcheck/lib.sh" \
	CFIP_APPLY_DNS="$S/fake6.sh" \
	sh "$ROOT/luci-app-cf-ipcheck/root/usr/bin/cf-ipcheck" dns-sync 2>/dev/null)
chk '引擎 JSON 带 partial:true' "$(printf '%s' "$out" | grep -c '"partial":true')" 1
chk '引擎 JSON 的 ok 仍是 false' "$(printf '%s' "$out" | grep -c '"ok":false')" 1

echo "=== 汇总：$ok 通过 / $bad 失败 ==="
[ "$bad" = 0 ]
