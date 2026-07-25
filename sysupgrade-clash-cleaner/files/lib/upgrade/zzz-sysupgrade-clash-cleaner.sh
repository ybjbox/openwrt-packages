#!/bin/sh
#
# sysupgrade-clash-cleaner — keep-settings upgrade hook (drop-in for /sbin/sysupgrade)
#
# == Problem (root cause) ==
# OpenClash's "Smart kernel" (smart routing) learns node latency/weights and writes a
# large runtime cache file, /etc/openclash/smart_weight_data (can grow to hundreds of
# MB). That file is registered as an OpenClash conffile, and is ALSO pulled in by
# /lib/upgrade/keep.d/luci-app-openclash (= /etc/openclash/), so it ends up in the
# sysupgrade backup list ($CONFFILES) and gets packed into sysupgrade.tgz. Restoring it
# on the next boot can peg CPU at 100% and hang LuCI.
#
# == Fix (治本, not a hot-patch of /sbin/sysupgrade) ==
# This file is a package-owned drop-in placed in /lib/upgrade/. /sbin/sysupgrade sources
# the whole directory via `include /lib/upgrade` on every run, so our code is loaded each
# time — without ever editing /sbin/sysupgrade (which the new firmware would overwrite).
#
# We register a function into the existing $sysupgrade_init_conffiles hook list (the very
# same mechanism OpenWrt's own luci-add-conffiles.sh uses). sysupgrade later calls each
# registered function with the path of the conffiles list file; our function strips the
# smart_weight_data line(s) so they are never added to the backup tarball.
#
# Because the file ships with this package (installed into the overlay), it survives
# "keep settings" upgrades, unlike /sbin/sysupgrade which is replaced by the new image.
#
# == Style (BusyBox safe) ==
# - Use '#' as the sed delimiter (the path contains '/'); never escape slashes.
# - Do NOT hide failures with `|| true`; log real errors via logger.
# - Guard with [ -f ]; run idempotently (safe to source/run more than once).

SYSCC_TAG="sysupgrade-clash-cleaner"

# Drop-in filter: remove OpenClash smart_weight_data from the backup list.
# $1 = path to the conffiles list file (normally /tmp/sysupgrade.conffiles)
filter_clash_smart_weight() {
	local file="$1"

	# Idempotent guard: only act when the list file exists and actually contains the target.
	[ -f "$file" ] || return 0
	grep -q 'smart_weight_data' "$file" 2>/dev/null || return 0

	# Two line forms are possible depending on the package manager / source:
	#   - find/keep.d output (apk & opkg): /etc/openclash/smart_weight_data
	#   - apk conffiles_static (path<space>sha256): /etc/openclash/smart_weight_data <hash>
	# Use '#' as the delimiter so the slashes in the path need no escaping.
	sed -i -e '\#/etc/openclash/smart_weight_data$#d' \
	       -e '\#/etc/openclash/smart_weight_data[[:space:]]#d' "$file" \
		|| logger -t "$SYSCC_TAG" "FAILED to filter smart_weight_data from $file"

	logger -t "$SYSCC_TAG" "excluded /etc/openclash/smart_weight_data from sysupgrade backup"
	return 0
}

# Register into the conffiles hook list (identical contract to luci-add-conffiles.sh).
# Idempotent: append only if not already present.
case " $sysupgrade_init_conffiles " in
	*" filter_clash_smart_weight "*)
		;;
	*)
		sysupgrade_init_conffiles="$sysupgrade_init_conffiles filter_clash_smart_weight"
		;;
esac
