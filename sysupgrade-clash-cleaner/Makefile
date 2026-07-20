#
# Copyright (C) 2026 ybjbox <https://github.com/ybjbox>
#
# This is free software, licensed under the Apache License, Version 2.0.
#

include $(TOPDIR)/rules.mk

PKG_NAME:=sysupgrade-clash-cleaner
PKG_VERSION:=1.0.0
PKG_RELEASE:=1

include $(INCLUDE_DIR)/package.mk

define Package/sysupgrade-clash-cleaner
  SECTION:=utils
  CATEGORY:=Utilities
  TITLE:=Filter large OpenClash cache files during sysupgrade to prevent webpage hang
  PKGARCH:=all
endef

define Package/sysupgrade-clash-cleaner/description
  Automatically filters smart_weight_data files during OpenWrt sysupgrade backup to prevent web UI timeout.
endef

define Build/Compile
endef

define Package/sysupgrade-clash-cleaner/install
	$(INSTALL_DIR) $(1)/etc/uci-defaults
	$(INSTALL_BIN) ./files/etc/uci-defaults/90-sysupgrade-clash-cleaner $(1)/etc/uci-defaults/90-sysupgrade-clash-cleaner
endef

$(eval $(call BuildPackage,sysupgrade-clash-cleaner))
