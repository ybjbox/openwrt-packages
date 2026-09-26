#!/bin/sh
# luci-app-dhcp-comment CI lint.
# POSIX sh; intended to run under BusyBox ash (alpine container).
# Uses ONLY shell builtins + sed + grep + find (all provided by BusyBox).
#
# Checks:
#   1) sh -n syntax for every shell script in the repo
#   2) RED LINE 1: never ship dhcp.js / bandix*.js under a package root/www/
#   3) RED LINE 3: no cross-package same-name file (opkg install conflict)
#   4) RED LINE 2: weak hint that the sync script restarts bandix (info only)
#   5) RED LINE 4: LuCI view JS traps (CBI render promise in array, .stdout
#      after rpc.declare's expect: already unwrapped it)
#   6) RED LINE 5: scripts under root/usr/bin and */etc/init.d carry mode
#      100755 in the git index, otherwise they install as -rw-r--r-- and
#      procd/rpcd cannot exec them
set -u

fail=0

# Temp files (BusyBox always has /tmp).
ALL_FILES="/tmp/lint_all_files.$$"
TMP_ERR="/tmp/lint_err.$$"
TMP_DUP="/tmp/lint_dup.$$"
SHELL_LIST="/tmp/lint_shell.$$"

# --- collect every regular file, excluding build noise -----------------------
# Excluded per CI spec: .git node_modules scratch tmp_* (and any tmp_* dir).
find . \
    \( -name .git -o -name node_modules -o -name scratch -o -name 'tmp_*' \) -prune -o \
    -type f -print > "$ALL_FILES"

# === [1/6] shell syntax check (sh -n) ========================================
echo "=== [1/6] Shell syntax check (sh -n) ==="
: > "$SHELL_LIST"

# .sh files anywhere in the repo.
while IFS= read -r f; do
    [ -z "$f" ] && continue
    case "$f" in
        *.sh) echo "$f" >> "$SHELL_LIST" ;;
    esac
done < "$ALL_FILES"

# No-extension package scripts (uci-defaults / init.d / usr/bin).
while IFS= read -r f; do
    [ -z "$f" ] && continue
    case "$f" in
        */root/etc/uci-defaults/*|*/root/etc/init.d/*|*/root/usr/bin/*)
            echo "$f" >> "$SHELL_LIST" ;;
    esac
done < "$ALL_FILES"

# Run sh -n only on files whose shebang indicates a shell interpreter.
while IFS= read -r f; do
    [ -z "$f" ] && continue
    first=$(head -n 1 "$f" 2>/dev/null)
    case "$first" in
        *bin/sh*|*bin/bash*|*bin/dash*|*bin/ash*) ;;
        *) continue ;;
    esac
    if sh -n "$f" 2>"$TMP_ERR"; then
        echo "[PASS] shell syntax: $f"
    else
        echo "[FAIL] shell syntax: $f"
        sed 's/^/    /' "$TMP_ERR"
        fail=1
    fi
done < "$SHELL_LIST"

# === [2/6] RED LINE 1: no forbidden js shipped under root/www ================
echo "=== [2/6] Red line 1: forbidden js under root/www/ ==="
rl1=0
while IFS= read -r f; do
    [ -z "$f" ] && continue
    case "$f" in
        *root/www/*)
            case "$f" in
                *resources/view/network/dhcp.js|*/bandix/*.js)
                    echo "[FAIL] red-line-1 violation: $f"
                    rl1=1
                    ;;
            esac
            ;;
    esac
done < "$ALL_FILES"
if [ "$rl1" = 0 ]; then
    echo "[PASS] red-line-1: no forbidden js shipped under root/www/"
fi
[ "$rl1" = 0 ] || fail=1

# === [3/6] RED LINE 3: no cross-package duplicate installed file =============
echo "=== [3/6] Red line 3: cross-package duplicate file paths ==="
# Strip the package prefix up to and including /root/, then detect duplicates.
while IFS= read -r f; do
    [ -z "$f" ] && continue
    case "$f" in
        */root/*) echo "${f#*/root/}" ;;
    esac
done < "$ALL_FILES" | sort | uniq -d > "$TMP_DUP"
if [ -s "$TMP_DUP" ]; then
    echo "[FAIL] red-line-3: duplicate installed file path(s) across packages:"
    sed 's/^/    /' "$TMP_DUP"
    fail=1
else
    echo "[PASS] red-line-3: no cross-package duplicate file paths"
fi

# === [4/6] RED LINE 2: bandix restart hint (info only, never fails) ==========
echo "=== [4/6] Red line 2: bandix restart hint (info only) ==="
hint=0
while IFS= read -r f; do
    [ -z "$f" ] && continue
    case "$f" in
        */root/usr/bin/*|*/root/etc/*) ;;
        *) continue ;;
    esac
    if grep -q "bandix" "$f" 2>/dev/null && \
       grep -Eq "restart|/etc/init.d/bandix|service bandix" "$f" 2>/dev/null; then
        echo "[INFO] possible bandix restart logic in: $f"
        hint=1
    fi
done < "$ALL_FILES"
if [ "$hint" = 0 ]; then
    echo "[INFO] no explicit bandix restart logic detected; ensure the sync"
    echo "      script restarts bandix after rewriting hostname_bindings.txt"
fi

# === [5/6] RED LINE 4: LuCI view JS traps (found on real device) =============
# 这两条都是 2026-09-26 在雅典娜真机上验出来的：第一条让页面永远停在
# 「正在载入视图」，第二条让结果表永远显示「尚未运行过」。
echo "=== [5/6] Red line 4: LuCI view JS traps ==="
rl4=0
while IFS= read -r f; do
    [ -z "$f" ] && continue
    case "$f" in
        */htdocs/luci-static/resources/view/*.js) ;;
        *) continue ;;
    esac

    # (a) CBI 的 Map.render() 返回的是 Promise。把它写进节点数组里
    #     （return [bar, table, m.render()]）等于把 Promise 当 DOM 节点用。
    if grep -n "\.render()" "$f" 2>/dev/null | grep -v "Promise\.all" | \
       grep -q "\[[^]]*\.render()"; then
        echo "[FAIL] view js: $f puts a CBI .render() promise into a node array"
        rl4=1
    fi

    # (b) rpc.declare 里写了 expect: 时，resolve 到的已经是拆好层的值
    #     （字符串），再去取 .stdout 恒为 undefined。
    if grep -q "expect:" "$f" 2>/dev/null; then
        if sed -e 's,//.*,,' "$f" | grep -v '^[[:space:]]*[*]' | \
           grep -q "\.stdout\|\.stderr"; then
            echo "[FAIL] view js: $f reads .stdout although rpc.declare unwraps it"
            rl4=1
        fi
    fi
done < "$ALL_FILES"
if [ "$rl4" = 0 ]; then
    echo "[PASS] red-line-4: LuCI view js has no CBI-promise / expect-unwrap trap"
else
    fail=1
fi

# === [6/6] RED LINE 5: files procd/rpcd execute must carry the exec bit ======
# 2026-09-26 真机装 CI 产物时暴露：仓库里 root/etc/init.d/cf-ipcheck 与
# root/usr/bin/cf-ipcheck 是 100644，装到设备上就变成 -rw-r--r--，
# 于是 post-install 的 enable/start 报 Permission denied，页面点「立即测速」
# 也起不来（rpcd 是直接 execv 那个路径的）。手工 chmod 会把问题藏起来，
# 所以这条必须在 CI 里钉死。
echo "=== [6/6] Red line 5: executable file modes ==="
# 优先看 git index 里的 mode：Windows 的 checkout 会伪造执行位，[ -x ] 在那边
# 恒为真，只有 index mode 才是构建时真正打进包里的东西。
USE_GIT=0
if command -v git >/dev/null 2>&1 && git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
    USE_GIT=1
fi
rl5=0
while IFS= read -r f; do
    [ -z "$f" ] && continue
    case "$f" in
        */root/usr/bin/*|*/root/etc/init.d/*|*/files/etc/init.d/*) ;;
        *) continue ;;
    esac
    first=$(head -n 1 "$f" 2>/dev/null)
    case "$first" in
        *bin/sh*|*bin/bash*|*bin/ash*) ;;
        *) continue ;;
    esac
    if [ "$USE_GIT" = 1 ]; then
        mode=$(git ls-files -s -- "$f" 2>/dev/null | sed -n '1{s/ .*//;p}')
        how="git index mode"
    else
        if [ -x "$f" ]; then mode=100755; else mode=100644; fi
        how="fs exec bit"
    fi
    if [ "$mode" = 100755 ]; then
        echo "[PASS] exec mode ($how=100755): $f"
    else
        echo "[FAIL] $f is $how=$mode, must be 100755"
        echo "       fix: git update-index --chmod=+x '$f'"
        rl5=1
    fi
done < "$ALL_FILES"
if [ "$rl5" = 1 ]; then
    fail=1
fi

# --- cleanup ---
rm -f "$ALL_FILES" "$TMP_ERR" "$TMP_DUP" "$SHELL_LIST" 2>/dev/null

echo "=== lint summary ==="
if [ "$fail" = 0 ]; then
    echo "[PASS] all lint checks passed"
else
    echo "[FAIL] lint found issues"
fi
exit $fail
