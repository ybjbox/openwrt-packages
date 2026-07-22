include $(TOPDIR)/rules.mk

PKG_NAME:=luci-app-dhcp-comment
PKG_VERSION:=1.0.0
PKG_RELEASE:=1

PKG_MAINTAINER:=OpenWrt Developer
PKG_LICENSE:=MIT

include $(INCLUDE_DIR)/package.mk

define Package/luci-app-dhcp-comment
  SECTION:=luci
  CATEGORY:=LuCI
  SUBMENU:=3. Applications
  TITLE:=LuCI support for DHCP Chinese Comment Enhancer
  DEPENDS:=+luci-base
  PKGARCH:=all
endef

define Package/luci-app-dhcp-comment/description
  LuCI support for DHCP Chinese Comment Enhancer across DHCP leases, Bandix, AppFilter, and OPAssistant Mobile App.
endef

define Build/Configure
enddefine

define Build/Compile
enddefine

define Package/luci-app-dhcp-comment/install
	$(INSTALL_DIR) $(1)/usr/share/luci/menu.d
	$(INSTALL_DIR) $(1)/usr/share/rpcd/acl.d
	$(INSTALL_DIR) $(1)/www/luci-static/resources/view/dhcp_comment
	$(INSTALL_DIR) $(1)/etc/config
	$(INSTALL_DIR) $(1)/etc/uci-defaults

	$(INSTALL_DATA) ./files/usr/share/luci/menu.d/*.json $(1)/usr/share/luci/menu.d/ 2>/dev/null || true
	$(INSTALL_DATA) ./files/usr/share/rpcd/acl.d/*.json $(1)/usr/share/rpcd/acl.d/ 2>/dev/null || true
	$(INSTALL_DATA) ./files/www/luci-static/resources/view/dhcp_comment/*.js $(1)/www/luci-static/resources/view/dhcp_comment/ 2>/dev/null || true
	$(INSTALL_DATA) ./files/etc/config/* $(1)/etc/config/ 2>/dev/null || true
	$(INSTALL_BIN) ./files/etc/uci-defaults/* $(1)/etc/uci-defaults/ 2>/dev/null || true
endef

$(eval $(call BuildPackage,luci-app-dhcp-comment))
