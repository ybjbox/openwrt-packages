#
# Copyright (C) 2026 ybjbox <https://github.com/ybjbox>
#
# This is free software, licensed under the Apache License, Version 2.0.
#

include $(TOPDIR)/rules.mk

PKG_NAME:=athena-custom
PKG_VERSION:=1.0.0
PKG_RELEASE:=1

include $(INCLUDE_DIR)/package.mk

define Package/athena-custom
  SECTION:=base
  CATEGORY:=Base system
  TITLE:=Custom default settings for Athena (IPQ6018) router
  PKGARCH:=all
endef

define Package/athena-custom/description
  Provides default configuration scripts, network settings, WiFi roaming, NJU APK mirror, and optimization settings for Athena.
endef

define Build/Compile
endef

define Package/athena-custom/install
	$(INSTALL_DIR) $(1)/etc/uci-defaults
	$(INSTALL_BIN) ./files/etc/uci-defaults/99-athena-custom-settings $(1)/etc/uci-defaults/99-athena-custom-settings
endef

$(eval $(call BuildPackage,athena-custom))
