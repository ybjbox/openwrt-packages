#
# Copyright (C) 2026 ybjbox <https://github.com/ybjbox>
#
# This is free software, licensed under the Apache License, Version 2.0.
#

include $(TOPDIR)/rules.mk

LUCI_TITLE:=LuCI support for DHCP comment & active lease comment display
LUCI_DEPENDS:=+luci-mod-network +luci-mod-status
LUCI_PKGARCH:=all

PKG_NAME:=luci-app-dhcp-comment
PKG_VERSION:=1.0.0
PKG_RELEASE:=1

include $(TOPDIR)/feeds/luci/luci.mk

# call BuildPackage - OpenWrt build system signature
