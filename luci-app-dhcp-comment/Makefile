#
# Copyright (C) 2026 ybjbox <https://github.com/ybjbox>
#
# This is free software, licensed under the Apache License, Version 2.0.
#

include $(TOPDIR)/rules.mk

PKG_NAME:=luci-app-dhcp-comment
PKG_VERSION:=1.0.0
PKG_RELEASE:=2

include $(INCLUDE_DIR)/package.mk

define Package/luci-app-dhcp-comment
  SECTION:=luci
  CATEGORY:=LuCI
  SUBMENU:=3. Applications
  TITLE:=LuCI support for DHCP comment & active lease comment display
  DEPENDS:=+luci-mod-network +luci-mod-status
  PKGARCH:=all
endef

define Package/luci-app-dhcp-comment/description
  Extends LuCI DHCP settings and status overview pages to display Chinese comments for active leases.
endef

define Build/Compile
endef

define Package/luci-app-dhcp-comment/install
	$(INSTALL_DIR) $(1)/usr/share/luci-app-dhcp-comment
	$(INSTALL_DATA) ./files/usr/share/luci-app-dhcp-comment/dhcp.js $(1)/usr/share/luci-app-dhcp-comment/dhcp.js
	$(INSTALL_DATA) ./files/usr/share/luci-app-dhcp-comment/40_dhcp.js $(1)/usr/share/luci-app-dhcp-comment/40_dhcp.js
	$(INSTALL_DIR) $(1)/etc/uci-defaults
	$(INSTALL_BIN) ./files/etc/uci-defaults/99-luci-app-dhcp-comment $(1)/etc/uci-defaults/99-luci-app-dhcp-comment
endef

$(eval $(call BuildPackage,luci-app-dhcp-comment))
