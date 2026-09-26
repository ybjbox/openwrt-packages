#!/bin/sh
# cf-ipcheck 引擎的离线回归测试。
# POSIX sh；设计为在 BusyBox ash（alpine 容器）里跑，与 tests/lint.sh 同一环境。
#
# 只测纯逻辑，绝不联网：CIDR 展开、达标过滤、排序、截断、JSON 字符串转义。
# 引擎自身带 selftest 子命令，这里负责用「安装后的真实路径」把它跑起来，
# 并且显式覆盖两个曾经真实踩过的坑：
#   1) CIDR 展开吐出网络地址 .0  ->  整片候选超时，榜单恒空
#   2) 排序未按 total 升序        ->  选出来的 IP 不是最快的
set -u

# 定位引擎：CI 里在仓库内；装到设备上后在 /usr/bin
BIN=''
for c in ./luci-app-cf-ipcheck/root/usr/bin/cf-ipcheck \
         luci-app-cf-ipcheck/root/usr/bin/cf-ipcheck \
         /usr/bin/cf-ipcheck; do
	[ -f "$c" ] && BIN=$c && break
done

if [ -z "$BIN" ]; then
	echo '[FAIL] 找不到 cf-ipcheck 引擎' >&2
	exit 1
fi

echo "=== 被测引擎: $BIN"

# 语法检查（与 lint.sh 互补：这里只盯这一个文件，失败信息更集中）
if ! sh -n "$BIN"; then
	echo '[FAIL] 引擎语法检查未通过' >&2
	exit 1
fi
echo '[PASS] sh -n'

# 隔离运行时目录，避免污染 /etc 与 /tmp 的真实路径
export CFIP_RUN_DIR=${TMPDIR:-/tmp}/cf-ipcheck-test-run
export CFIP_ETC_DIR=${TMPDIR:-/tmp}/cf-ipcheck-test-etc
rm -rf "$CFIP_RUN_DIR" "$CFIP_ETC_DIR" 2>/dev/null || true
mkdir -p "$CFIP_RUN_DIR" "$CFIP_ETC_DIR"

# 引擎在找不到 uci 时改读 CFIP_* 环境变量；CI 容器里没有 uci，正好走这条路径
if sh "$BIN" selftest; then
	rc=0
else
	rc=$?
fi

# 空候选池必须安全退出，不能留下一份看似成功的结果
: >"$CFIP_ETC_DIR/best-ip.txt"
CFIP_USE_OFFICIAL_RANGES=0 CFIP_REUSE_LAST=0 \
	CFIP_COMMUNITY_SOURCES='' sh "$BIN" run >/dev/null 2>&1
if grep -q '"state":"error"' "$CFIP_RUN_DIR/status.json" 2>/dev/null; then
	echo '[PASS] 空候选池被识别为 error 而非伪造成功'
else
	echo '[FAIL] 空候选池未产生 error 状态' >&2
	rc=1
fi

rm -rf "$CFIP_RUN_DIR" "$CFIP_ETC_DIR" 2>/dev/null || true

if [ "$rc" = 0 ]; then
	echo '=== cf-ipcheck 测试全部通过'
else
	echo '=== cf-ipcheck 测试失败' >&2
fi
exit $rc
