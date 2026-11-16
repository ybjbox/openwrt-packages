#
# Copyright (C) 2026 ybjbox <https://github.com/ybjbox>
#
# This is free software, licensed under the Apache License, Version 2.0.
#

include $(TOPDIR)/rules.mk

PKG_NAME:=athena-custom
PKG_VERSION:=1.0.1
PKG_RELEASE:=1

include $(INCLUDE_DIR)/package.mk

define Package/athena-custom
  SECTION:=base
  CATEGORY:=Base system
  TITLE:=Athena (IPQ6018) placeholder package
  PKGARCH:=all
endef

define Package/athena-custom/description
  Placeholder package so existing package lists keep working.
  The first-boot settings script was moved to the build repository
  (ybjbox/fanchmwrt-athena-builder, files/etc/uci-defaults/) in 2026-11:
  it is tied to one device and one source branch, and shipping it in a
  generic ipk wrote wrong theme/mirror settings on other systems.
endef

define Build/Compile
endef

define Package/athena-custom/install
  $(INSTALL_DIR) $(1)/etc/athena-custom
  $(INSTALL_DATA) ./README.md $(1)/etc/athena-custom/README.md
endef

$(eval $(call BuildPackage,athena-custom))
