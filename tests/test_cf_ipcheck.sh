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

# 空候选池必须报 error，不能留下一份看似成功的结果
: >"$ETC/best-ip.txt"
CFIP_USE_OFFICIAL_RANGES=0 CFIP_REUSE_LAST=0 CFIP_COMMUNITY_SOURCES='' \
	sh "$BIN" run >/dev/null 2>&1
if grep -q '"state":"error"' "$RUN/status.json" 2>/dev/null; then
	echo '[PASS] 空候选池被识别为 error 而非伪造成功'
else
	echo "::error::空候选池未产生 error 状态，实际内容=<$(head -c 120 "$RUN/status.json" 2>/dev/null)>"
	rc=1
fi

rm -rf "$RUN" "$ETC" 2>/dev/null || true

if [ "$rc" = 0 ]; then
	echo '=== cf-ipcheck 测试全部通过'
else
	echo '=== cf-ipcheck 测试失败' >&2
fi
exit $rc
