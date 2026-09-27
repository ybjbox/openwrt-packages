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
#   7) RED LINE 6: the JSON keys cf-ipcheck writes and the keys the LuCI view
#      reads must match in both directions (renaming one side silently blanks
#      a table column instead of failing loudly)
set -u

fail=0

# Temp files (BusyBox always has /tmp).
ALL_FILES="/tmp/lint_all_files.$$"
TMP_ERR="/tmp/lint_err.$$"
TMP_DUP="/tmp/lint_dup.$$"
SHELL_LIST="/tmp/lint_shell.$$"
TMP_ENGINE="/tmp/lint_engine.$$"

# --- collect every regular file, excluding build noise -----------------------
# Excluded per CI spec: .git node_modules scratch tmp_* (and any tmp_* dir).
find . \
    \( -name .git -o -name node_modules -o -name scratch -o -name 'tmp_*' \) -prune -o \
    -type f -print > "$ALL_FILES"

# === [1/7] shell syntax check (sh -n) ========================================
echo "=== [1/7] Shell syntax check (sh -n) ==="
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

# === [2/7] RED LINE 1: no forbidden js shipped under root/www ================
echo "=== [2/7] Red line 1: forbidden js under root/www/ ==="
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

# === [3/7] RED LINE 3: no cross-package duplicate installed file =============
echo "=== [3/7] Red line 3: cross-package duplicate file paths ==="
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

# === [4/7] RED LINE 2: bandix restart hint (info only, never fails) ==========
echo "=== [4/7] Red line 2: bandix restart hint (info only) ==="
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

# === [5/7] RED LINE 4: LuCI view JS traps (found on real device) =============
# 这两条都是 2026-09-26 在雅典娜真机上验出来的：第一条让页面永远停在
# 「正在载入视图」，第二条让结果表永远显示「尚未运行过」。
echo "=== [5/7] Red line 4: LuCI view JS traps ==="
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

# === [6/7] RED LINE 5: files procd/rpcd execute must carry the exec bit ======
# 2026-09-26 真机装 CI 产物时暴露：仓库里 root/etc/init.d/cf-ipcheck 与
# root/usr/bin/cf-ipcheck 是 100644，装到设备上就变成 -rw-r--r--，
# 于是 post-install 的 enable/start 报 Permission denied，页面点「立即测速」
# 也起不来（rpcd 是直接 execv 那个路径的）。手工 chmod 会把问题藏起来，
# 所以这条必须在 CI 里钉死。
echo "=== [6/7] Red line 5: executable file modes ==="
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

# === [7/7] RED LINE 6: 引擎 JSON 与页面读数字段必须对得上 ====================
# 引擎改字段名、页面忘了改，不会有任何报错：那一列永远显示 —，或者整块信息
# 静默消失。吞吐列的键名已经改过两轮（speed_mbps -> speed_mibs -> speed_mbytes，
# 单位从"看着像 megabits"到 MiB 再回到 Ryan 要的十进制 MB/s），靠真机才看得出来，
# 所以这条契约检查放在 CI 里，两边任一侧单方面改名都会红。
echo "=== [7/7] Red line 6: engine <-> view JSON field contract ==="
ENGINE=luci-app-cf-ipcheck/root/usr/bin/cf-ipcheck
VIEW=luci-app-cf-ipcheck/htdocs/luci-static/resources/view/cf_ipcheck/settings.js
TMP_ENGINE="/tmp/lint_engine.$$"
rl6=0

if [ ! -f "$ENGINE" ] || [ ! -f "$VIEW" ]; then
    echo "[FAIL] contract: 找不到引擎或页面文件（$ENGINE / $VIEW）"
    rl6=1
else
    # 契约表：这三组就是页面会显示的全部数据来源。加字段必须在这里登记一份，
    # 目的是让「引擎写了但页面没读」「页面读了但引擎没写」两种单边改动都变红。
    # 为什么不直接正则扫引擎全文：Gist 载荷、Cloudflare /ips 的响应、自检里的
    # 样例 JSON 也都是 "key": 形状，扫全文会把它们误当契约（files/content/result）。
    STATUS_KEYS="state started finished pool qualified usable intercepted counts domains items reason"
    ITEM_KEYS="ip code connect_ms tls_ms ttfb_ms total_ms colo speed_mbytes domain"
    SOURCE_KEYS="url http rc ips cf_in"

    # 先把反斜杠去掉：顶层 JSON 写 "key":，items 那串写 \"key\":，去斜杠后同形。
    sed 's/\\//g' "$ENGINE" > "$TMP_ENGINE"

    for k in $STATUS_KEYS $ITEM_KEYS $SOURCE_KEYS; do
        if grep -q "\"$k\":" "$TMP_ENGINE"; then
            e=ok
        else
            e=missing
        fi
        if grep -q "$k" "$VIEW"; then
            v=ok
        else
            v=missing
        fi
        if [ "$e" = ok ] && [ "$v" = ok ]; then
            echo "[PASS] contract: $k 两边都在"
        else
            echo "[FAIL] contract: $k 引擎=$e 页面=$v（单边改动，界面上会静默缺一块）"
            rl6=1
        fi
    done

    # 反向兜底：页面从 items 里取的每个键必须登记在契约表里。
    # 前面的 [^.alnum_] 是为了别上 "/etc/init.d/rpcd" 这种路径的尾巴。
    for k in $(grep -oE '[^.[:alnum:]_]it\.[a-z_][a-z_]*' "$VIEW" | sed 's/^.*it\.//' | sort -u); do
        case " $ITEM_KEYS " in
            *" $k "*) ok=1 ;;
            *) ok=0 ;;
        esac
        if [ "$ok" = 1 ]; then
            echo "[PASS] contract: 页面读的 it.$k 已在契约表内"
        else
            echo "[FAIL] contract: 页面读 it.$k，但它不在 ITEM_KEYS 契约表里（引擎多半也不给）"
            rl6=1
        fi
    done
    # 已经踩过的旧名：出现即红，防止从别处粘回来
    for stale in speed_mbps speed_mibs; do
        if grep -q "$stale" "$ENGINE" "$VIEW"; then
            echo "[FAIL] contract: $stale 是废弃字段名（吞吐是十进制 MB/s，键名 speed_mbytes）"
            rl6=1
        fi
    done
    rm -f "$TMP_ENGINE"
fi
if [ "$rl6" = 1 ]; then
    fail=1
else
    echo "[PASS] red-line-6: engine/view JSON contract holds"
fi

# --- red-line-7: 表单字段一律「短说明留在页面 + 完整解释挂悬停」---------------
# 真机量过：17 条长说明一共 2299px，页面被拉到看不见榜单。这条只是防止以后再加字段时
# 顺手把整段背景知识写回 description —— 那种改动肉眼看不出来，只能靠结构断言。
if [ -f "$VIEW" ] && [ -f "$ENGINE" ]; then
    rl7=0
    OPTS=$(grep -oE "\.option\(form\.[A-Za-z]+, '[a-z_]+'" "$VIEW" | sed "s/.*, '//; s/'$//" | sort)
    HELPS=$(grep -oE "help\('[a-z_]+'" "$VIEW" | sed "s/help('//; s/'$//" | sort)
    # 两侧都压成空格分隔的集合再判成员：留着换行的话 *" $k "* 只会命中首尾两项。
    OPTSET=" $(printf '%s ' $OPTS)"
    HELPSET=" $(printf '%s ' $HELPS)"
    for k in $OPTS; do
        case "$HELPSET" in
            *" $k "*) : ;;
            *) echo "[FAIL] help-7: 字段 $k 没有 help() 条目（长解释会退回页面上常驻）"; rl7=1 ;;
        esac
    done
    # 反过来也要成对：HELP 里残留的键说明字段被改名/删掉了，悬停提示会静默失效。
    for k in $HELPS; do
        case "$OPTSET" in
            *" $k "*) : ;;
            *) echo "[FAIL] help-7: help('$k') 找不到对应字段（改名留下的孤儿键）"; rl7=1 ;;
        esac
    done
    dup=$(printf '%s\n' $HELPS | uniq -d)
    if [ -n "$dup" ]; then
        echo "[FAIL] help-7: help() 键重复，后一条会覆盖前一条: $dup"
        rl7=1
    fi
    # 页面上常驻的那句必须短：help('key', _('短句'), _('长句')) 的第二个实参。
    # 短句通常单独占一行，所以匹配到 help('key', 之后要么在同一行、要么在下一行取 _('…')。
    # 字面圆括号一律写成 [(]：`\(` 在 gawk 的动态正则里会被当成未转义分组，整段 awk 直接报错。
    # LC_ALL=C 是必须的：gawk 在 UTF-8 locale 下 length() 数的是字符数，busybox awk 数的是字节，
    # 不钉住 locale 的话同一条阈值在两个 CI 容器里量出来的数差三倍，断言就成了看运气。
    TMP_HELP="/tmp/lint_help.$$"
    LC_ALL=C awk -v q="'" -v lim=160 '
        function measure(s,   i, short) {
            gsub(/^[ \t]+/, "", s)
            if (s !~ ("^_[(]" q)) return
            sub("^_[(]" q, "", s)
            i = index(s, q "),")
            short = (i > 0) ? substr(s, 1, i - 1) : s
            if (length(short) > lim) { printf "%d bytes: %s\n", length(short), short; bad = 1 }
        }
        {
            line = $0
            gsub(/^[ \t]+/, "", line)
            if (pending) { pending = 0; measure(line); }
            if (line ~ ("^help[(]" q "[a-z_]+" q ",")) {
                rest = line
                sub("^help[(]" q "[a-z_]+" q ",[ \t]*", "", rest)
                if (rest ~ ("^_[(]" q)) measure(rest); else pending = 1
            }
        }
        END { exit !bad }' "$VIEW" > "$TMP_HELP"
    if [ -s "$TMP_HELP" ]; then
        echo "[FAIL] help-7: 以下短说明超过 160 字节（长解释应该只出现在悬停里）："
        sed 's|^|       |' "$TMP_HELP"
        rl7=1
    fi
    rm -f "$TMP_HELP"
    if [ "$rl7" = 1 ]; then
        fail=1
    else
        echo "[PASS] red-line-7: form fields all use short description + hover detail"
    fi
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
