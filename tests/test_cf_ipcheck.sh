#!/bin/sh
# cf-ipcheck 引擎的离线回归测试（POSIX sh / BusyBox ash，绝不联网）。
#
# 失败诊断一律走 ::error:: / ::notice:: 注解：Actions 日志需要登录才能下载，
# 而注解在 API 上可读，这样 CI 里到底哪一条断言挂了能直接被看到。
# 定位完成后这些 echo 注解可以精简掉。
set -u

BIN=''
for c in ./luci-app-cf-ipcheck/root/usr/bin/cf-ipcheck \
         luci-app-cf-ipcheck/root/usr/bin/cf-ipcheck \
         /usr/bin/cf-ipcheck; do
	[ -f "$c" ] && BIN=$c && break
done

if [ -z "$BIN" ]; then
	echo '::error::找不到 cf-ipcheck 引擎'
	exit 1
fi
echo "=== 被测引擎: $BIN"

# 环境身份：用于判断是不是 awk / sort 的方言差异
ver=''
command -v busybox >/dev/null 2>&1 && ver=$(busybox 2>&1 | head -1)
echo "::notice::shell=$(readlink -f /bin/sh 2>/dev/null || echo ?) busybox=${ver:-none} awk=$(awk --version 2>&1 | head -1)"

sh -n "$BIN" || { echo '::error::引擎语法检查未通过'; exit 1; }
echo '[PASS] sh -n'

# 隔离运行时目录，避免污染真实路径
RUN=${TMPDIR:-/tmp}/cf-ipcheck-test-run
ETC=${TMPDIR:-/tmp}/cf-ipcheck-test-etc
rm -rf "$RUN" "$ETC" 2>/dev/null || true
mkdir -p "$RUN" "$ETC"
export CFIP_RUN_DIR=$RUN CFIP_ETC_DIR=$ETC

# 引擎找不到 uci 时改读 CFIP_* 环境变量；alpine 容器里没有 uci，正好走这条路径
out=$(sh "$BIN" selftest 2>&1)
rc=$?
printf '%s\n' "$out"
if [ "$rc" != 0 ]; then
	if printf '%s\n' "$out" | grep -q '\[FAIL\]'; then
		printf '%s\n' "$out" | grep '\[FAIL\]' | sed 's|.*|::error::selftest &|'
	else
		printf '%s\n' "$out" | tail -3 | sed 's|.*|::error::selftest 无 FAIL 行但退出码非 0: &|'
	fi
fi

# 空候选池必须报 error，并且说清是哪一种 error，不能留下一份看似成功的结果。
# 没装 curl 的容器里 engine 会先报 missing_curl —— 那也是"不伪造成功"，
# 但两种原因要能分开看，所以这里按 curl 在不在分别断言。
: >"$ETC/best-ip.txt"
CFIP_USE_OFFICIAL_RANGES=0 CFIP_REUSE_LAST=0 CFIP_COMMUNITY_SOURCES='' \
	sh "$BIN" run >/dev/null 2>&1
if command -v curl >/dev/null 2>&1; then want_reason=empty_pool; else want_reason=missing_curl; fi
reason=$(sed -n 's/.*"reason":"\([^"]*\)".*/\1/p' "$RUN/status.json" 2>/dev/null)
if grep -q '"state":"error"' "$RUN/status.json" 2>/dev/null && [ "$reason" = "$want_reason" ]; then
	echo "[PASS] 空候选池被识别为 error/$want_reason 而非伪造成功"
else
	echo "::error::空候选池未产生 error/$want_reason，实际内容=<$(head -c 160 "$RUN/status.json" 2>/dev/null)>"
	rc=1
fi

# 陈旧锁绝不能把后面所有轮次卡死：被 OOM/断电打断过一次之后，
# 只要锁主进程不在了就必须照常开跑（回归点：早先只看文件在不在）。
# 取一个必然不存在的 pid：超过内核 pid_max 一号，任何进程都占不上。
maxp=$(cat /proc/sys/kernel/pid_max 2>/dev/null || echo 32768)
deadpid=$((${maxp:-32768} + 1))
printf '%s %s\n' "$deadpid" "$(date +%s)" >"$RUN/lock"
: >"$ETC/best-ip.txt"
CFIP_USE_OFFICIAL_RANGES=0 CFIP_REUSE_LAST=0 CFIP_COMMUNITY_SOURCES='' \
	sh "$BIN" run >/dev/null 2>&1
reason=$(sed -n 's/.*"reason":"\([^"]*\)".*/\1/p' "$RUN/status.json" 2>/dev/null)
if [ "$reason" = "$want_reason" ]; then
	echo "[PASS] 陈旧锁被回收，本轮照常执行（$want_reason 说明真的跑进来了）"
else
	echo "::error::陈旧锁没被回收，status=<$(head -c 160 "$RUN/status.json" 2>/dev/null)>"
	rc=1
fi
rm -f "$RUN/lock"

# status 自愈：停在 running 但锁主已经不在，就不能再对外说 running
printf '{"state":"running","started":"x","items":[]}' >"$RUN/status.json"
printf '%s %s\n' "$deadpid" "$(date +%s)" >"$RUN/lock"
got=$(sh "$BIN" status 2>/dev/null | sed -n 's/.*"state":"\([^"]*\)".*/\1/p')
if [ "$got" = error ] || [ "$got" = never_run ] || [ "$got" = done ]; then
	echo "[PASS] running + 死锁不会被当成还在跑（读到的是 $got）"
else
	echo "::error::running + 死锁仍报 running，原始输出=<$(sh "$BIN" status 2>/dev/null)>"
	rc=1
fi
rm -f "$RUN/lock" "$RUN/status.json"

# 真有活锁时 run-now 必须拒绝并说明原因（不能两个实例同时探测，数字会互抢）
printf '%s %s\n' "$$" "$(date +%s)" >"$RUN/lock"
got=$(sh "$BIN" _locklive 2>/dev/null)
if [ "$got" = alive ]; then
	echo '[PASS] _locklive 认得自家活锁'
else
	echo "::error::_locklive 应答 alive，实际=<${got:-}>"
	rc=1
fi
got=$(sh "$BIN" run-now 2>/dev/null)
case "$got" in
	*'"state":"running"'*) echo '[PASS] 活锁下 run-now 直接回 running，不重复起一轮' ;;
	*) echo "::error::活锁下 run-now 应答 running，实际=<$(printf '%s' "$got")>"; rc=1 ;;
esac
rm -f "$RUN/lock"

rm -rf "$RUN" "$ETC" 2>/dev/null || true

if [ "$rc" = 0 ]; then
	echo '=== cf-ipcheck 测试全部通过'
else
	echo '=== cf-ipcheck 测试失败' >&2
fi
exit $rc
