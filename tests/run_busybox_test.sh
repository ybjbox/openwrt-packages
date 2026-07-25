#!/bin/sh
# BusyBox integration test for the production hot-patch script.
# Runs under alpine (busybox ash). Only shell builtins + sed + grep + find.
#
# It prepares a minimal dhcp.js fixture at the exact path the production script
# patches, runs the real production script, then asserts the injected markers
# are present (incl. equal-width co.width='20%' / so.width='20%' markers) and
# the column order (name -> comment -> mac) is correct.
set -u

fail=0

# Relative to repo root (CI checks out the repo at its root, no openwrt-packages/ prefix).
PROD="luci-app-dhcp-comment/root/etc/uci-defaults/99-luci-app-dhcp-comment"
FIXTURE="tests/fixtures/dhcp_host_section.js"

# Absolute path the production script operates on (line 11 of the script).
DHCP_JS="/www/luci-static/resources/view/network/dhcp.js"

echo "=== BusyBox hot-patch test ==="
echo "[setup] production script : $PROD"
echo "[setup] fixture           : $FIXTURE"
echo "[setup] target DHCP_JS    : $DHCP_JS"

# --- negative sanity: fixture must be PRISTINE (no injected markers) ---------
echo "--- negative sanity: fixture must not already contain injected markers ---"
bad=0
for marker in \
    "co=ss.option(form.Value,'comment'" \
    "max_cols=9" \
    "var mac_comments={};try{uci.sections" \
    "'%s'.format((function()"; do
    if grep -q "$marker" "$FIXTURE" 2>/dev/null; then
        echo "[FAIL] fixture already contains injected marker: $marker"
        bad=1
    fi
done
if [ "$bad" = 1 ]; then
    echo "[FAIL] fixture design error (contains injected markers before patching)"
    fail=1
else
    echo "[PASS] fixture is pristine (no injected markers)"
fi

# --- prepare the DHCP_JS file from the fixture -------------------------------
mkdir -p "$(dirname "$DHCP_JS")" || { echo "[FAIL] cannot create $(dirname "$DHCP_JS")"; exit 1; }
cp "$FIXTURE" "$DHCP_JS" || { echo "[FAIL] cannot copy fixture to $DHCP_JS"; exit 1; }
echo "[setup] copied fixture -> $DHCP_JS"

# --- run the REAL production hot-patch script -------------------------------
# It only modifies DHCP_JS; the other JS paths do not exist and are skipped.
# logger / module-cache cleanup are tolerant (|| true / 2>/dev/null inside).
sh "$PROD"
echo "[setup] production script exited with code $?"

# --- assertions on the patched DHCP_JS ---------------------------------------
check_marker() {
    m="$1"
    label="${2:-$m}"
    if grep -q "$m" "$DHCP_JS"; then
        echo "[PASS] injected: $label"
    else
        echo "[FAIL] missing: $label"
        fail=1
    fi
}

check_marker "co=ss.option(form.Value,'comment'"
check_marker "max_cols=9"
check_marker "var mac_comments={};try{uci.sections"
check_marker "'%s'.format((function()"

# --- equal-width behaviour: name & comment columns both pinned to 20% -------
# Must be checked AFTER the production script runs (above). Putting these in the
# negative sanity section would false-fail, because the fixture is intentionally
# unpatched at that point. These verify the host-name/comment columns render with
# matching width (LuCI sets column-header th style.width from co.width / so.width).
check_marker "co.width='20%'"
check_marker "so.width='20%'"

# --- wrapping CSS: long comment/name must wrap inside the 20% column --------
# Verifies the injected style snippet that overrides the default td nowrap so the
# long comment (data-name=comment) and host-name (data-name=name) cells wrap and
# the two columns stay visually equal-width. Checked AFTER the production script
# runs (above), not in the negative sanity section (fixture is unpatched there).
check_marker "data-name=comment" "备注列换行 CSS(data-name=comment)"
check_marker "overflow-wrap:anywhere" "备注列换行 CSS(overflow-wrap)"

# --- column order: comment must appear BEFORE the mac option ----------------
# Anchor both patterns at line start so a stray mention inside a comment can
# never be mistaken for the real injected code line.
echo "--- column order: name -> comment -> mac ---"
c_line=$(grep -nE "^var co=ss\.option\(form\.Value,'comment'" "$DHCP_JS" | head -n 1 | cut -d: -f1)
m_line=$(grep -nE "^so=ss\.option\(form\.DynamicList,'mac'," "$DHCP_JS" | head -n 1 | cut -d: -f1)
if [ -z "$c_line" ] || [ -z "$m_line" ]; then
    echo "[FAIL] cannot locate comment/mac anchor lines"
    fail=1
elif [ "$c_line" -lt "$m_line" ]; then
    echo "[PASS] column order correct (comment@${c_line} < mac@${m_line})"
else
    echo "[FAIL] column order wrong (comment@${c_line} >= mac@${m_line})"
    fail=1
fi

echo "=== test summary ==="
if [ "$fail" = 0 ]; then
    echo "[PASS] all busybox hot-patch assertions passed"
else
    echo "[FAIL] some assertions failed"
fi
exit $fail
