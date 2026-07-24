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

# === [1/4] shell syntax check (sh -n) ========================================
echo "=== [1/4] Shell syntax check (sh -n) ==="
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

# === [2/4] RED LINE 1: no forbidden js shipped under root/www ================
echo "=== [2/4] Red line 1: forbidden js under root/www/ ==="
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

# === [3/4] RED LINE 3: no cross-package duplicate installed file =============
echo "=== [3/4] Red line 3: cross-package duplicate file paths ==="
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

# === [4/4] RED LINE 2: bandix restart hint (info only, never fails) ==========
echo "=== [4/4] Red line 2: bandix restart hint (info only) ==="
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

# --- cleanup ---
rm -f "$ALL_FILES" "$TMP_ERR" "$TMP_DUP" "$SHELL_LIST" 2>/dev/null

echo "=== lint summary ==="
if [ "$fail" = 0 ]; then
    echo "[PASS] all lint checks passed"
else
    echo "[FAIL] lint found issues"
fi
exit $fail
