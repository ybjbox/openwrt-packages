#
# Copyright (C) 2026 ybjbox <https://github.com/ybjbox>
#
# This is free software, licensed under the Apache License, Version 2.0.
#

include $(TOPDIR)/rules.mk

PKG_NAME:=sysupgrade-clash-cleaner
PKG_VERSION:=1.1.0
PKG_RELEASE:=1

include $(INCLUDE_DIR)/package.mk

define Package/sysupgrade-clash-cleaner
  SECTION:=utils
  CATEGORY:=Utilities
  TITLE:=Filter large OpenClash cache files during sysupgrade to prevent webpage hang
  PKGARCH:=all
endef

define Package/sysupgrade-clash-cleaner/description
  Excludes OpenClash's large smart_weight_data cache from the sysupgrade backup list
  ($CONFFILES) via a package-owned /lib/upgrade drop-in hook, so it is never packed
  into sysupgrade.tgz during a keep-settings upgrade (prevents CPU 100% / LuCI hang).
endef

define Build/Compile
endef

define Package/sysupgrade-clash-cleaner/install
	# Drop-in hook sourced by /sbin/sysupgrade via `include /lib/upgrade` on every run.
	# It registers filter_clash_smart_weight() into $sysupgrade_init_conffiles and strips
	# /etc/openclash/smart_weight_data from the backup list. The file lives in the overlay,
	# so it survives keep-settings upgrades (unlike /sbin/sysupgrade, which the new image
	# overwrites). No system binaries are modified.
	$(INSTALL_DIR) $(1)/lib/upgrade
	$(INSTALL_DATA) ./files/lib/upgrade/zzz-sysupgrade-clash-cleaner.sh $(1)/lib/upgrade/zzz-sysupgrade-clash-cleaner.sh
endef

$(eval $(call BuildPackage,sysupgrade-clash-cleaner))
