#!/bin/sh
# lint.sh — 静态规范检查 (红线守卫)
#
# 做三件事, 任一失败 exit 1 并打印明确 FAIL 原因:
#   1) sh -n 语法检查: 所有 */root/etc/uci-defaults/* 与名为 sync_dhcp_user_info 的文件
#   2) 红线①: 包内不得 ship dhcp.js / bandix/*.js
#   3) 红线③: 跨包不得 ship 同名 root/ 文件路径 (固件编译 0 opkg 同名冲突)
#
# 健壮性说明:
#   - 管道子 shell 内的 `exit 1` 不会传播到脚本主体, 故用 fail 标志累积失败,
#     在末尾统一 `exit 1`, 确保非零退出可靠。
#   - 所有 grep 末尾补 `|| true`, 避免 "无匹配" 的返回码 1 误杀 set -e。
set -e

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$REPO_ROOT" || exit 1

fail=0
note_fail() {
    echo "FAIL: $1"
    fail=1
}

# ---------- 1. sh -n 语法检查 ----------
echo "[lint] 1/3 sh -n 语法检查"
for f in $(find . -path '*/root/etc/uci-defaults/*' -type f 2>/dev/null) \
         $(find . -type f -name 'sync_dhcp_user_info' 2>/dev/null); do
    if ! sh -n "$f" 2>/tmp/lint_shn.err; then
        note_fail "语法错误: $f"
        sed 's/^/    /' /tmp/lint_shn.err
    fi
done

# ---------- 2. 红线①: 不得 ship dhcp.js / bandix/*.js ----------
echo "[lint] 2/3 红线① 检查 (禁止 ship dhcp.js / bandix/*.js)"
bad_www=$(find . -path '*/root/www/*' -type f 2>/dev/null \
          | grep -E '(resources/view/network/dhcp\.js|/bandix/)' || true)
if [ -n "$bad_www" ]; then
    note_fail "发现被禁止的原厂页面文件 (红线①):${bad_www}"
fi

# ---------- 3. 红线③: 跨包同名 root/ 文件路径冲突 ----------
echo "[lint] 3/3 红线③ 检查 (跨包同名 root/ 文件路径)"
dups=$(find . -path '*/root/*' -type f 2>/dev/null \
       | sed 's#.*/root/##' | sort | uniq -d)
if [ -n "$dups" ]; then
    note_fail "存在跨包同名 root 文件路径 (红线③):${dups}"
fi

if [ "$fail" -ne 0 ]; then
    echo "[lint] 检查未通过 ($fail 处失败)"
    exit 1
fi
echo "[lint] PASS"
