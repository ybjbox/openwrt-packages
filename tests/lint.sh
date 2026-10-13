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
#   8) RED LINE 8: every subcommand name the view passes to file.exec must be a
#      label in the engine's dispatch table (a typo there returns usage text and
#      the page reports "not valid JSON", which reads like an engine bug)
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

# === [1/15] shell syntax check (sh -n) ========================================
echo "=== [1/15] Shell syntax check (sh -n) ==="
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

# === [2/15] RED LINE 1: no forbidden js shipped under root/www ================
echo "=== [2/15] Red line 1: forbidden js under root/www/ ==="
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

# === [3/15] RED LINE 3: no cross-package duplicate installed file =============
echo "=== [3/15] Red line 3: cross-package duplicate file paths ==="
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

# === [4/15] RED LINE 2: bandix restart hint (info only, never fails) ==========
echo "=== [4/15] Red line 2: bandix restart hint (info only) ==="
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

# === [5/15] RED LINE 4: LuCI view JS traps (found on real device) =============
# 这两条都是 2026-09-26 在雅典娜真机上验出来的：第一条让页面永远停在
# 「正在载入视图」，第二条让结果表永远显示「尚未运行过」。
echo "=== [5/15] Red line 4: LuCI view JS traps ==="
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

# === [6/15] RED LINE 5: files procd/rpcd execute must carry the exec bit ======
# 2026-09-26 真机装 CI 产物时暴露：仓库里 root/etc/init.d/cf-ipcheck 与
# root/usr/bin/cf-ipcheck 是 100644，装到设备上就变成 -rw-r--r--，
# 于是 post-install 的 enable/start 报 Permission denied，页面点「立即测速」
# 也起不来（rpcd 是直接 execv 那个路径的）。手工 chmod 会把问题藏起来，
# 所以这条必须在 CI 里钉死。
echo "=== [6/15] Red line 5: executable file modes ==="
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

# === [7/15] RED LINE 6: 引擎 JSON 与页面读数字段必须对得上 ====================
# 引擎改字段名、页面忘了改，不会有任何报错：那一列永远显示 —，或者整块信息
# 静默消失。吞吐列的键名已经改过两轮（speed_mbps -> speed_mibs -> speed_mbytes，
# 单位从"看着像 megabits"到 MiB 再回到 Ryan 要的十进制 MB/s），靠真机才看得出来，
# 所以这条契约检查放在 CI 里，两边任一侧单方面改名都会红。
echo "=== [7/15] Red line 6: engine <-> view JSON field contract ==="
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
    STATUS_KEYS="state started finished pool qualified usable intercepted counts domains items reason budget port enabled interval stage stage_done stage_total upload"
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

# --- red-line-8: 页面递给 file.exec 的子命令必须在引擎的分派表里 --------------
# 真机踩过：页面把源检测写成 runCmd(['sources'])，而引擎只有 check-sources，于是一点
# 「检测源可用性」拿到的是 usage 文本，页面报「输出不是合法 JSON」。JSON 键有 red-line-6
# 守着，命令名此前没人守 —— 这种单边改名，视图桩测和引擎自检都发现不了。
echo "=== [8/15] Red line 8: view only calls subcommands the engine dispatches ==="
if [ -f "$VIEW" ] && [ -f "$ENGINE" ]; then
    rl8=0
    TMP_LABELS="/tmp/lint_labels.$$"
    TMP_CALLS="/tmp/lint_calls.$$"
    # 只取主分派表里的标签，别把函数内部的 case 标签混进来当合法命令
    sed -n '/^case "${1:-}" in$/,/^esac$/p' "$ENGINE" |
        sed -n 's/^[[:space:]]*\([a-z][a-z_-]*\)).*/\1/p' | sort -u > "$TMP_LABELS"
    grep -oE "runCmd\(\[ '[a-z-]+'" "$VIEW" |
        sed -E "s/.*runCmd\(\[ '([a-z-]+)'.*/\1/" | sort -u > "$TMP_CALLS"
    if [ ! -s "$TMP_LABELS" ]; then
        echo "[FAIL] cmd: 从引擎里一条分派标签都没提出来，这条检查本身失效了"
        rl8=1
    fi
    while read -r c; do
        [ -n "$c" ] || continue
        if grep -qx "$c" "$TMP_LABELS"; then
            echo "[PASS] cmd: 页面调用 $c，引擎有这条分派"
        else
            echo "[FAIL] cmd: 页面调用 $c，引擎分派表里没有（会被当未知命令，回的是 usage 文本）"
            rl8=1
        fi
    done < "$TMP_CALLS"
    rm -f "$TMP_LABELS" "$TMP_CALLS"
    if [ "$rl8" = 1 ]; then
        fail=1
    else
        echo "[PASS] red-line-8: view only calls subcommands the engine dispatches"
    fi
fi

# --- red-line-9: 重画指纹必须覆盖被守卫组件读到的每一个状态字段 ---------------
# r32 真机事故：boardKeyOf 的指纹里没有 stage/stage_done/stage_total/upload，
# 而榜单面板在一轮里唯一会变的就是这四个 —— 于是进度清单画出来一次就冻住：
# 实测停在「拉取社区源 1/13」30 秒不动，同一时刻引擎已经跑到 12/13。
# 指纹漏字段这类 bug 桩测容易跟着一起漏（写断言的人和写指纹的人是同一个），
# 所以这里直接从渲染函数身上把字段名抠出来，逐个去指纹里点名。
echo "=== [9/15] Red line 9: redraw fingerprints cover the fields they guard ==="
if [ -f "$VIEW" ]; then
    rl9=0
    TMP_FIELDS="/tmp/lint_fields.$$"
    # 被守卫的渲染函数 → 它的指纹函数。加一对就在这里加一行。
    for pair in "RunProgress:boardKeyOf"; do
        render=${pair%%:*}
        keyfn=${pair##*:}
        awk "/^function ${render}\\(/,/^\\}/" "$VIEW" |
            grep -o 'st\.[A-Za-z_]*' | sed 's/^st\.//' | sort -u > "$TMP_FIELDS"
        keybody=$(awk "/^function ${keyfn}\\(/,/^\\}/" "$VIEW")
        if [ ! -s "$TMP_FIELDS" ] || [ -z "$keybody" ]; then
            echo "[FAIL] fingerprint: 从 $render / $keyfn 里什么都没提出来，这条检查本身失效了"
            rl9=1
            continue
        fi
        while read -r fld; do
            [ -n "$fld" ] || continue
            # 要按整词比：st.stage 会被 st.stage_done 冒充命中
            if printf '%s' "$keybody" | grep -Eq "st\.${fld}([^A-Za-z0-9_]|\$)"; then
                echo "[PASS] fingerprint: $render 读 $fld，$keyfn 的指纹里有"
            else
                echo "[FAIL] fingerprint: $render 读 $fld，但 $keyfn 的指纹里没有 —— 面板会冻在第一帧"
                rl9=1
            fi
        done < "$TMP_FIELDS"
    done
    rm -f "$TMP_FIELDS"
    if [ "$rl9" = 1 ]; then
        fail=1
    else
        echo "[PASS] red-line-9: redraw fingerprints cover the fields they guard"
    fi
fi

# --- red-line-10: 视图只许调用官方 LuCI 真有的 ui.* 方法 ------------------------
# 真机踩过一类问题：照着别的发行版（iStoreOS / LibWrt 分支）的例子写 `ui.addToast`，
# 而官方 LuCI 的 master / 25.12 / 24.10 / 19.07 里根本没有这个方法（真机 ui.js grep
# 命中 0），于是那条分支永远不成立、页面悄悄退化成兜底路径 —— 单测里桩件偏偏又
# 提供了 addToast，测试全绿。这里把「官方确实存在」的方法列成白名单，视图里出现
# 名单外的 ui.xxx 就判红。名单来源：modules/luci-base/.../ui.js 与 jsapi 文档。
echo "=== [10/15] Red line 10: view only calls ui.* methods that exist upstream ==="
if [ -f "$VIEW" ]; then
    rl10=0
    TMP_UI="/tmp/lint_ui.$$"
    # 官方 LuCI ui.js 里确实存在的方法（真机 grep 过命中数，另见 jsapi/LuCI.ui.html）
    cat > "$TMP_UI" <<'UIMETA'
addNotification
addTimeLimitedNotification
showNotification
hideNotification
showModal
hideModal
showIndicator
hideIndicator
instantiateView
itemlist
dropdown
Dropdown
combobutton
ComboButton
tabs
clearFeedback
addPeerContainer
removePeerContainer
updatePeerContainer
resolveScope
UIMETA
    # 只看代码行：注释里会提到「早先用过的 ui.addToast」「真机 ui.js」这类话，
    # 拿它们去比对名单等于让文档自己报警。以 * 或 /* 开头的行都是块注释的续行。
    grep -vE '^[[:space:]]*[\*/]' "$VIEW" |
        grep -oE '\bui\.[a-zA-Z_]+' | sed 's/^ui\.//' | sort -u > "$TMP_UI.used"
    if [ ! -s "$TMP_UI.used" ]; then
        echo "[PASS] ui-api: 视图里没有 ui.* 调用，跳过"
    fi
    while read -r m; do
        [ -n "$m" ] || continue
        if grep -qx "$m" "$TMP_UI"; then
            echo "[PASS] ui-api: ui.$m 是官方存在的方法"
        else
            echo "[FAIL] ui-api: ui.$m 在官方 LuCI 里不存在（厂商分支的 API），这条分支永远不会成立"
            rl10=1
        fi
    done < "$TMP_UI.used"
    rm -f "$TMP_UI" "$TMP_UI.used"
    if [ "$rl10" = 1 ]; then
        fail=1
    else
        echo "[PASS] red-line-10: view only calls ui.* methods that exist upstream"
    fi
fi

# --- red-line-11: 独立样式文件存在，且里面消费的每个 --令牌 都有出处 ----------------
# 样式从 JS 里搬成独立 .css（树内做法）之后，没有任何东西保证两件事：
#   1) 视图引用的那个路径在包里真的存在 —— 写错了页面完全没样式，还不报错；
#   2) var(--x) 有个出处 —— 拼错一个令牌名的表现是那一处静默失效（颜色回落到
#      继承值），比直接报错难查得多。这里两个一起守。
echo "=== [11/15] Red line 11: standalone stylesheet exists and its tokens resolve ==="
CSS_REL=$(sed -n "s/.*CSS_PATH = '\([^']*\)'.*/\1/p" "$VIEW" 2>/dev/null | head -n 1)
if [ -n "$CSS_REL" ]; then
    rl11=0
    CSS_FILE="luci-app-cf-ipcheck/htdocs/luci-static/resources/$CSS_REL"
    TMP_DEF="/tmp/lint_def.$$"
    TMP_USE="/tmp/lint_use.$$"
    if [ -f "$CSS_FILE" ]; then
        echo "[PASS] css: 视图引用的 $CSS_REL 在包里"
    else
        echo "[FAIL] css: 视图引用 $CSS_REL，但包里没有这个文件（页面会完全没样式）"
        rl11=1
    fi
    # 我们只在 var() 的兜底链里消费主题变量，这些本文件不定义是对的。
    # 名单来源：真机 grep —— Argon 只有 --primary / --dark-primary，
    # bootstrap 另有 --primary-color-high / --font-mono / --on-primary-color /
    # --border-color-medium（Argon 里 grep 这三个都是 0 命中，所以必须带兜底值）。
    THEME_VARS="--primary --dark-primary --primary-color-high --font-mono --on-primary-color --border-color-medium"
    if [ -f "$CSS_FILE" ]; then
        grep -o '^[[:space:]]*--[A-Za-z0-9-]*' "$CSS_FILE" | tr -d ' \t' | sort -u > "$TMP_DEF"
        grep -oE 'var\(--[A-Za-z0-9-]+' "$CSS_FILE" | sed 's/^var(//' | sort -u > "$TMP_USE"
        while read -r tok; do
            [ -n "$tok" ] || continue
            # -- 不能省：令牌名本身就是 -- 开头，否则 grep 把它当成选项
            if grep -qx -- "$tok" "$TMP_DEF"; then
                continue
            fi
            case " $THEME_VARS " in
                *" $tok "*) continue ;;
            esac
            echo "[FAIL] token: var($tok) 既没在本文件定义，也不在已知主题变量名单里（拼错令牌名会静默失效）"
            rl11=1
        done < "$TMP_USE"
    fi
    rm -f "$TMP_DEF" "$TMP_USE"
    if [ "$rl11" = 1 ]; then
        fail=1
    else
        echo "[PASS] red-line-11: standalone stylesheet exists and its tokens resolve"
    fi
fi

# --- red-line-12: 页面 ↔ ucode 插件 ↔ 引擎 ↔ ACL 四方要说同一套方法名 --------------
# 换成 rpcd 的 ucode 插件之后，一条命令的名字要穿过四层：
#   视图 RPC_METHODS 的 method → 插件里的方法名 → 插件调用的引擎子命令 → ACL 放开的名字。
# 任何一层写错都是同一种症状：页面拿到 null，报「读不到引擎的输出」，而引擎手动跑好好的。
# 这类"跨文件单边改名"正是 lint 该管的（red-line-6 管 JSON 键、red-line-8 管子命令名，
# 这一条管方法名与授权名单）。
echo "=== [12/15] Red line 12: view / ucode plugin / engine / ACL agree on method names ==="
UC_FILE="luci-app-cf-ipcheck/root/usr/share/rpcd/ucode/luci.cf-ipcheck"
ACL_FILE="luci-app-cf-ipcheck/root/usr/share/rpcd/acl.d/luci-app-cf-ipcheck.json"
if [ -f "$VIEW" ] && [ -f "$UC_FILE" ] && [ -f "$ACL_FILE" ] && [ -f "$ENGINE" ]; then
    rl12=0
    TMP_PAIRS="/tmp/lint_pairs.$$"
    TMP_ACL="/tmp/lint_acl.$$"
    TMP_LABELS12="/tmp/lint_labels12.$$"
    # 插件：方法名 = 它调的引擎子命令（只认 "=> sh('xxx')" 这种调用行，
    # 不认函数定义行，否则会把 "sub" 当成子命令）
    awk '/^[[:space:]]*[a-z_]+:[[:space:]]*\{/ { n=$1; sub(/:.*/, "", n) }
         /=>[[:space:]]*sh\(/ { if (match($0, /sh\([^)]*\)/)) {
             v = substr($0, RSTART + 4, RLENGTH - 5); gsub(/[^a-z_-]/, "", v); print n "=" v } }' \
        "$UC_FILE" > "$TMP_PAIRS"
    sed -n '/^case "${1:-}" in$/,/^esac$/p' "$ENGINE" |
        sed -n 's/^[[:space:]]*\([a-z][a-z_-]*\)).*/\1/p' | sort -u > "$TMP_LABELS12"
    # ACL 里放开的名字（ubus 段里引号包住的标识符）
    sed -n '/"ubus"/,/^\t*}$/p' "$ACL_FILE" |
        sed -nE 's/^[^"]*"([a-z_]+)"[",]*$/\1/p' | sort -u > "$TMP_ACL"
    if [ ! -s "$TMP_PAIRS" ]; then
        echo "[FAIL] ucode: 从插件里一条方法都没提出来，这条检查本身失效了"
        rl12=1
    fi
    if [ ! -s "$TMP_LABELS12" ]; then
        echo "[FAIL] ucode: 从引擎里提不出分派标签，这条检查本身失效了"
        rl12=1
    fi
    while IFS='=' read -r m sub; do
        [ -n "$m" ] || continue
        # 1) 插件调的子命令必须是引擎分派表里的
        if grep -qx "$sub" "$TMP_LABELS12"; then
            echo "[PASS] ucode: 插件方法 $m → 引擎子命令 $sub 存在"
        else
            echo "[FAIL] ucode: 插件方法 $m 调引擎子命令 $sub，分派表里没有"
            rl12=1
        fi
        # 2) 视图必须真的声明了这个 method
        if grep -q "method: '$m'" "$VIEW"; then
            echo "[PASS] ucode: 视图调用了 $m"
        else
            echo "[FAIL] ucode: 插件有方法 $m，视图里却没人调（要么删要么接上）"
            rl12=1
        fi
        # 3) ACL 必须放开它，否则页面只拿得到 null
        if grep -qx "$m" "$TMP_ACL"; then
            echo "[PASS] ucode: ACL 放开了 $m"
        else
            echo "[FAIL] ucode: ACL 没放开 $m —— 页面调它会拿到 null（表现为「读不到引擎的输出」）"
            rl12=1
        fi
    done < "$TMP_PAIRS"
    # 4) 视图声明的 object 名要和插件 return 的那个键一致
    VIEW_OBJ=$(sed -nE "s/^var RPC_OBJECT = '([^']+)'.*/\1/p" "$VIEW" | head -n 1)
    UC_OBJ=$(sed -nE "s/^return \{ '([^']+)'.*/\1/p" "$UC_FILE" | head -n 1)
    if [ -n "$VIEW_OBJ" ] && [ "$VIEW_OBJ" = "$UC_OBJ" ]; then
        echo "[PASS] ucode: 视图与插件的 ubus 对象名一致（$VIEW_OBJ）"
    else
        echo "[FAIL] ucode: 视图用对象名 <$VIEW_OBJ>，插件注册的是 <$UC_OBJ>，对不上"
        rl12=1
    fi
    rm -f "$TMP_PAIRS" "$TMP_ACL" "$TMP_LABELS12"
    if [ "$rl12" = 1 ]; then
        fail=1
    else
        echo "[PASS] red-line-12: view / ucode plugin / engine / ACL agree on method names"
    fi
fi

# --- red-line-13: 周期任务必须走官方 L.poll，不许自己 setInterval ----------------
# 官方 luci.js 里的 L.poll 是单例：一个全局 1 秒步进器按各自秒数派活、给每个登记项
# 配了重入守卫（上一回 promise 没落地不会重调），还跟框架的暂停/恢复打通 ——
# 弹「应用设置」对话框期间框架会 poll.stop()。自写 setInterval 这些都要自己再造一遍，
# 而且框架暂停时我们照打（r37 之前就是这样）。
echo "=== [13/15] Red line 13: periodic work goes through L.poll, no hand-rolled setInterval ==="
if [ -f "$VIEW" ]; then
    rl13=0
    if grep -vE '^[[:space:]]*[\*/]' "$VIEW" | grep -q 'setInterval('; then
        echo "[FAIL] poll: 视图里还有自己写的 setInterval —— 周期任务请走 poll.add(fn, 秒)"
        rl13=1
    else
        echo "[PASS] poll: 视图里没有自写的 setInterval"
    fi
    if grep -q "'require poll';" "$VIEW" && grep -vE '^[[:space:]]*[\*/]' "$VIEW" | grep -q 'poll.add('; then
        echo "[PASS] poll: 视图引了 L.poll 并用 poll.add 登记"
    else
        echo "[FAIL] poll: 视图没走 L.poll（缺 'require poll' 或没有 poll.add）"
        rl13=1
    fi
    # luci.js 的 add() 只在「起过表又停了」时才顺手起表，首次登记只入队不起表。
    # 光 poll.add 不加 poll.start，页面自己那一拍可能根本不跳（真机上是被框架
    # 别处的 start() 带起来的 —— 那是运气，不是设计）。
    if grep -vE '^[[:space:]]*[\*/]' "$VIEW" | grep -q 'poll.start('; then
        echo "[PASS] poll: 登记之后自己调了 poll.start"
    else
        echo "[FAIL] poll: 只 poll.add 不 poll.start —— 首次登记不会自己起表"
        rl13=1
    fi
    if [ "$rl13" = 1 ]; then
        fail=1
    else
        echo "[PASS] red-line-13: periodic work goes through L.poll, no hand-rolled setInterval"
    fi
fi

# --- red-line-14: 视图里不许出现 innerHTML / html: --------------------------------
# 这个页面的输入全是外部数据：引擎输出的 JSON、社区源 URL、curl 抓回来的 colo、
# 日志整段文本。el() 以前留过一个 `html:` 分支（零调用点的死代码），只要它在，
# 将来某次"顺手用一下"就是把外部数据当 HTML 解析 —— 那是注入，不是样式问题。
# 分支已删；这条守住它别被加回来。
echo "=== [14/15] Red line 14: view never writes raw HTML ==="
if [ -f "$VIEW" ]; then
    rl14=0
    for pat in 'innerHTML' "html[[:space:]]*:"; do
        hits=$(grep -vE '^[[:space:]]*[\*/]' "$VIEW" | grep -cE "$pat" 2>/dev/null)
        if [ "${hits:-0}" = "0" ]; then
            echo "[PASS] xss: 视图代码里没有 $pat"
        else
            echo "[FAIL] xss: 视图代码里有 $hits 处 $pat —— 外部数据只能走 textContent"
            rl14=1
        fi
    done
    if [ "$rl14" = 1 ]; then
        fail=1
    else
        echo "[PASS] red-line-14: view never writes raw HTML"
    fi
fi

# --- RED LINE 15: 源清单编辑只有一个出处，且「检测之前必先保存」 --------------------
# r41 把源清单的编辑行从「配置」搬进「源与检测」。两个会静默坏掉的点：
#   1) 同一份 DynamicList 若在两个面板各渲染一遍，就是两个出处（同 cbid 两份控件），
#      改一处、存另一处 —— 页面显示的和引擎读到的不是一份清单；
#   2) 引擎的 check_sources 从 UCI 读清单，所以没保存就检测 = 拿旧清单的结果骗人。
# 这两条都是"看起来好好的、数值却对不上"的类型，静态钉住。
echo "=== [15/15] Red line 15: source editor has one home; check implies save ==="
if [ -f "$VIEW" ]; then
    rl15=0
    # GROUP_OPTIONS 的四个组里不该再有 community_sources（它归源页宿主管）
    grp=$(sed -n '/^var GROUP_OPTIONS = {/,/^};/p' "$VIEW" | grep -c "community_sources")
    if [ "$grp" = "0" ]; then
        echo "[PASS] edit: 源清单不再属于「配置」的任何分组（不会出现两份）"
    else
        echo "[FAIL] edit: GROUP_OPTIONS 里还列着 community_sources（$grp 处）—— 会渲染出第二个输入区"
        rl15=1
    fi
    reg=$(grep -c "^var EDIT_ONLY_OPTIONS = { community_sources: true" "$VIEW")
    if [ "$reg" = "1" ]; then
        echo "[PASS] edit: 它被登记成「只搬不分组」，兜底组不会再收它"
    else
        echo "[FAIL] edit: EDIT_ONLY_OPTIONS 没登记 community_sources（会被兜进「其它」组，等于两份）"
        rl15=1
    fi
    # drawSources 只许清结果宿主；清整个面板会把编辑行一起抹掉（打字中途丢字 + 吞点击）
    if grep -q "clear(P.srcRes)" "$VIEW" && ! grep -q "clear(srcPane)" "$VIEW"; then
        echo "[PASS] edit: 每拍重画只清结果宿主，不碰编辑区"
    else
        echo "[FAIL] edit: 源面板的重画还在清整个容器 —— 编辑框会被连带换掉（r29 的吞点机制）"
        rl15=1
    fi
    # 保存必须先于检测：比较两处调用的行号
    sv=$(grep -n "P.form.save" "$VIEW" | head -1 | cut -d: -f1)
    ck=$(grep -n "runCmd\[?( 'check-sources'" "$VIEW" | head -1 | cut -d: -f1)
    ck=${ck:-$(grep -n "runCmd(\[ 'check-sources' \])" "$VIEW" | head -1 | cut -d: -f1)}
    if [ -n "$sv" ] && [ -n "$ck" ] && [ "$sv" -lt "$ck" ]; then
        echo "[PASS] save: 检测之前先保存（Map.save 在 runCmd('check-sources') 之前，行 $sv < $ck）"
    else
        echo "[FAIL] save: 没找到「先 Map.save 再 check-sources」的顺序 —— 检的会是配置文件里的旧清单"
        rl15=1
    fi
    if [ "$rl15" = 1 ]; then
        fail=1
    else
        echo "[PASS] red-line-15: source editor has one home; check implies save"
    fi
fi

# --- 版本一致性：视图里的 VIEW_BUILD 必须等于 Makefile 的 PKG_RELEASE -----------
# 视图版本号是给「你看到的到底是哪一版」准备的（uhttpd 只发 ETag，浏览器可能拿缓存
# 不重新验证）。但没人核对的话，这个号自己就会变成第二处「文档说的和代码不一样」。
MK=luci-app-cf-ipcheck/Makefile
if [ -f "$VIEW" ] && [ -f "$MK" ]; then
    mkrel=$(sed -n 's/^PKG_RELEASE:=[[:space:]]*\([0-9]*\).*/\1/p' "$MK" | head -n 1)
    vb=$(sed -n "s/.*VIEW_BUILD = 'r\([0-9]*\)'.*/\1/p" "$VIEW" | head -n 1)
    if [ -n "$mkrel" ] && [ "$mkrel" = "$vb" ]; then
        echo "[PASS] build: 视图版本标记 r$vb 与 PKG_RELEASE $mkrel 一致"
    else
        echo "[FAIL] build: 视图版本标记 r${vb:-<无>} 与 Makefile 的 PKG_RELEASE ${mkrel:-<无>} 不一致"
        fail=1
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
