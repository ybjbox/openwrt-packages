include $(TOPDIR)/rules.mk

PKG_NAME:=luci-app-cf-ipcheck
PKG_VERSION:=1.0.0
PKG_RELEASE:=15

LUCI_TITLE:=Cloudflare preferred-IP local checker
LUCI_PKGARCH:=all
LUCI_DEPENDS:=+curl +jq +ca-bundle

include $(TOPDIR)/feeds/luci/luci.mk

# call BuildPackage - OpenWrt buildroot signature
