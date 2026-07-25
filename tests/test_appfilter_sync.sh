#!/bin/sh
# Regression test for luci-app-dhcp-comment AppFilter (user_info) sync fix.
#
# Bug under test:
#   sync_dhcp_user_info was committed as 100644 (non-executable) while the
#   repo uses core.filemode=false, so buildroot checked it out as 0644.
#   The dnsmasq hook invoked it by bare path and uci-defaults gated it with
#   `[ -x ... ]`; both require the exec bit -> silent permission denied ->
#   user_info stayed empty -> AppFilter never saw DHCP comments.
#
# Fix under test:
#   1) uci-defaults now invokes the script as `sh /usr/bin/sync_dhcp_user_info`
#      (in the dnsmasq hook and the first-run full sync), and the first-run
#      guard uses `[ -f ... ]` instead of `[ -x ... ]`.
#   2) git mode of the script is 100755 (update-index --chmod=+x).
#
# This script is POSIX sh, safe under BusyBox ash (no bashisms), and never
# touches a real router: it runs the REAL sync script against a mock `uci`
# backend (a flat key=value store in a temp dir, prepended to PATH).
#
# Usage: sh tests/test_appfilter_sync.sh   (run from anywhere)

set -u

# --- resolve repo-relative paths from this script's own location ----------
SCRIPT_DIR=$(cd "$(dirname "$0")" && pwd)
REPO_ROOT=$(cd "$SCRIPT_DIR/.." && pwd)
SYNC_SRC="$REPO_ROOT/luci-app-dhcp-comment/root/usr/bin/sync_dhcp_user_info"
UCI_DEFAULTS="$REPO_ROOT/luci-app-dhcp-comment/root/etc/uci-defaults/99-luci-app-dhcp-comment"

PASS=0
FAIL=0
ok()  { echo "[PASS] $1"; PASS=$((PASS + 1)); }
bad() { echo "[FAIL] $1"; FAIL=$((FAIL + 1)); }

# ---------------------------------------------------------------------------
# Mock UCI backend writer.  The mock is materialised at runtime into a temp
# dir so the test stays a single self-contained file.
#   DB      : flat "key=value" store ($UCI_DB)
#   CFGMAP  : "cfgid<TAB>index" map so `add`-returned cfg ids resolve to
#             anonymous section indices ($UCI_CFGMAP)
# ---------------------------------------------------------------------------
write_mock_uci() {
    cat > "$1" <<'MOCK_EOF'
#!/bin/sh
# Mock UCI for sync_dhcp_user_info regression test (POSIX sh).
set -u
DB="${UCI_DB:?UCI_DB not set}"
CFGMAP="${UCI_CFGMAP:?UCI_CFGMAP not set}"
[ -f "$DB" ] || : > "$DB"
[ -f "$CFGMAP" ] || : > "$CFGMAP"

cmd="$1"
[ "$cmd" = "-q" ] && { shift; cmd="$1"; shift; }

case "$cmd" in
  get)
    k="$1"
    # value starts right after the "=" : skip key (length(k)) AND the "="
    awk -v k="$k" 'BEGIN{p=length(k)+2} index($0, k"=")==1 {print substr($0, p); exit}' "$DB"
    exit 0
    ;;
  show)
    cfg="$1"
    awk -v p="$cfg." 'index($0, p)==1' "$DB"
    exit 0
    ;;
  add)
    config="$1"; type="$2"
    nidx=$(awk -v t="$type" 'BEGIN{m=-1} $0 ~ ("^" t "\\.@" t "\\[[0-9]+\\]=" t "$") {n=$0; gsub(/[^0-9]/,"",n); if (n+0>m) m=n+0} END{print (m<0?0:m+1)}' "$DB")
    cfgid="cfg$(printf '%04d' "$nidx")"
    echo "${config}.@${type}[${nidx}]=${type}" >> "$DB"
    printf '%s\t%s\n' "$cfgid" "$nidx" >> "$CFGMAP"
    echo "$cfgid"
    exit 0
    ;;
  set)
    arg="$1"
    k="${arg%%=*}"
    v="${arg#*=}"
    case "$k" in
      user_info.cfg*)
        cf="${k#user_info.}"
        cid="${cf%%.*}"
        fld="${cf#*.}"
        idx=$(awk -v c="$cid" -F'\t' '$1==c {print $2; exit}' "$CFGMAP")
        [ -n "$idx" ] && k="user_info.@user_info[${idx}].${fld}"
        ;;
    esac
    awk -v k="$k" 'index($0, k"=")!=1' "$DB" > "$DB.tmp"
    mv "$DB.tmp" "$DB"
    printf '%s=%s\n' "$k" "$v" >> "$DB"
    exit 0
    ;;
  delete)
    k="$1"
    before=$(wc -l < "$DB")
    awk -v p="$k" 'index($0, p)!=1' "$DB" > "$DB.tmp"
    after=$(wc -l < "$DB.tmp")
    mv "$DB.tmp" "$DB"
    [ "$after" -lt "$before" ] && exit 0 || exit 1
    ;;
  commit)
    exit 0
    ;;
  *)
    exit 1
    ;;
esac
MOCK_EOF
    chmod +x "$1"
}

# ---------------------------------------------------------------------------
# Run the real sync script once against a seeded mock uci store.
#   $1 = enable_appfilter value ("1" or "")  -> writes a fresh mock store
#   echoes the path to the resulting DB file on stdout
# ---------------------------------------------------------------------------
run_case() {
    af="$1"
    work=$(mktemp -d "${TMPDIR:-/tmp}/afs.XXXXXX") || { echo "[FAIL] cannot create workdir" >&2; exit 1; }
    db="$work/uci.db"
    cfgmap="$work/uci.cfgmap"
    bin="$work/bin"
    mkdir -p "$bin"
    : > "$db"; : > "$cfgmap"

    # Seed: global enabled + (optional) appfilter + one DHCP host with an
    # UPPERCASE mac to prove lowercase normalisation.
    {
        echo "dhcp_comment.global.enabled=1"
        if [ -n "$af" ]; then
            echo "dhcp_comment.global.enable_appfilter=$af"
        fi
        echo "dhcp.@host[0]=host"
        echo "dhcp.@host[0].comment=小爱"
        echo "dhcp.@host[0].mac=8C:DE:F9:94:2A:81"
    } > "$db"

    write_mock_uci "$bin/uci"

    # Invoke EXACTLY the way the fixed dnsmasq hook / uci-defaults now do:
    # `sh /usr/bin/sync_dhcp_user_info` (exec bit independent).
    PATH="$bin:$PATH" UCI_DB="$db" UCI_CFGMAP="$cfgmap" sh "$SYNC_SRC" >/dev/null 2>&1

    echo "$db"
}

# ===========================================================================
echo "=== [A] static checks (git mode + uci-defaults invocation) ==="

# A1: git mode must be 100755 (was 100644 in the broken commit).
# NOTE: on this Windows Git, `git -C <abs-posix-path>` fails ("cannot change to
# /c/Users/..."); relative paths from cwd work. So cd into the repo root (via
# bash, which resolves the POSIX path fine) and run git without -C.
mode=$( ( cd "$SCRIPT_DIR/.." && git ls-files -s -- "luci-app-dhcp-comment/root/usr/bin/sync_dhcp_user_info" ) | awk '{print $1}' )
if [ "$mode" = "100755" ]; then
    ok "sync_dhcp_user_info git mode = 100755 (executable bit restored)"
else
    bad "git mode = '${mode:-empty}', expected 100755"
fi

# A2: dnsmasq hook lines (start_service / reload_service) must call via `sh `
grep -Fq "start_service() {/a sh /usr/bin/sync_dhcp_user_info" "$UCI_DEFAULTS" \
    && ok "dnsmasq start_service hook calls 'sh /usr/bin/sync_dhcp_user_info'" \
    || bad "dnsmasq start_service hook missing 'sh ' prefix"
grep -Fq "reload_service() {/a sh /usr/bin/sync_dhcp_user_info" "$UCI_DEFAULTS" \
    && ok "dnsmasq reload_service hook calls 'sh /usr/bin/sync_dhcp_user_info'" \
    || bad "dnsmasq reload_service hook missing 'sh ' prefix"

# A3: first-run full sync must use `[ -f ... ]` guard (not `[ -x ... ]`) + `sh `
grep -Fq "[ -f /usr/bin/sync_dhcp_user_info ] && sh /usr/bin/sync_dhcp_user_info" "$UCI_DEFAULTS" \
    && ok "first-run sync uses '[ -f ]' guard + 'sh ' prefix" \
    || bad "first-run sync missing '[ -f ]' guard or 'sh ' prefix"

# A4: script is POSIX-parseable
if sh -n "$SYNC_SRC" 2>/dev/null; then
    ok "sync_dhcp_user_info passes 'sh -n' syntax check"
else
    bad "sync_dhcp_user_info failed 'sh -n' syntax check"
fi

# ===========================================================================
echo "=== [B] functional regression (mock uci, real sync script) ==="

# B1: AppFilter ENABLED -> user_info must be populated with lowercased mac
db_on=$(run_case "1")
if grep -qxF "user_info.@user_info[0]=user_info" "$db_on"; then
    ok "AppFilter enabled: user_info section created"
else
    bad "AppFilter enabled: no user_info section created"
fi
if grep -qxF "user_info.@user_info[0].nickname=小爱" "$db_on"; then
    ok "AppFilter enabled: nickname='小爱' synced (comment visible in AppFilter)"
else
    bad "AppFilter enabled: user_info.@user_info[0].nickname='小爱' missing"
fi
if grep -qxF "user_info.@user_info[0].mac=8c:de:f9:94:2a:81" "$db_on"; then
    ok "AppFilter enabled: mac lowercased 8C:DE:F9:94:2A:81 -> 8c:de:f9:94:2a:81"
else
    bad "AppFilter enabled: mac not lowercased (expected 8c:de:f9:94:2a:81)"
fi

# B2: AppFilter DISABLED -> must NOT create any user_info section
db_off=$(run_case "")
if grep -q "user_info" "$db_off"; then
    bad "AppFilter disabled: user_info section unexpectedly created"
else
    ok "AppFilter disabled: no user_info section created (branch correctly gated)"
fi

# ===========================================================================
echo "=== [C] CI integration note (optional) ==="
echo "[INFO] This test is standalone & POSIX. Wire it into CI by adding one step, e.g.:"
echo "        sh openwrt-packages/tests/test_appfilter_sync.sh"
echo "[INFO] No changes to lint.sh / run_busybox_test.sh are required; both remain green."

# ===========================================================================
echo "=== test summary ==="
echo "PASS=$PASS FAIL=$FAIL"
if [ "$FAIL" -eq 0 ]; then
    echo "[PASS] all regression checks passed"
    exit 0
else
    echo "[FAIL] $FAIL check(s) failed"
    exit 1
fi
