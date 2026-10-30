include $(TOPDIR)/rules.mk

PKG_NAME:=luci-app-cf-ipcheck
PKG_VERSION:=1.0.0
PKG_RELEASE:=136

# 许可证与维护者是 openwrt/packages 审稿的硬要求（CONTRIBUTING.md：
# 「A (PKG_)MAINTAINER definition」「A PKG_LICENSE tag ... use SPDX identifiers」，
# 另有 .github/llm-review-rules.md 把 maintainer 列为新包的必需项）。
# 这里只声明 PKG_LICENSE，不写 PKG_LICENSE_FILES —— 那个字段指的是**包目录内**
# 存在的许可文件，本包目录里没有 LICENSE 文件，写了会让构建去拷一个不存在的文件。
PKG_LICENSE:=Apache-2.0

LUCI_TITLE:=Cloudflare preferred-IP local checker
LUCI_DESCRIPTION:=Measures Cloudflare edge IPs from the router itself and publishes a ranked best-ip list.
LUCI_PKGARCH:=all
# rpcd-mod-ucode：页面与引擎之间那条通道就是包里的 ucode 插件（root/usr/share/rpcd/ucode/），
# 没有它 rpcd 根本不认 luci.cf-ipcheck 这个对象，页面会整页「读不到引擎的输出」。
# 雅典娜这台机器本来就装了它，写出来是为了换固件时不靠运气。
LUCI_DEPENDS:=+curl +jq +ca-bundle +rpcd-mod-ucode

# conffiles 必须自己写：luci.mk 完全不探测 root/etc/config（grep 过，零处 conffiles 逻辑），
# 而 include/package-pack.mk 只吃 Package/<name>/conffiles —— 声明之后才会生成
# /lib/apk/packages/<name>.conffiles_static，base-files 的 list_conffiles() 才认这个文件
# （实测：装 r33 时这张表里没有它，装完 r34 后有 sha256 那一行）。
# 为什么要认：`sysupgrade -u`（跳过与 /rom 相同的文件）以及 -c/-o 两种模式下
# 「配置文件 vs overlay 文件」的分类都从这张表算起。
# ⚠️ 别把「不声明就会丢配置」当依据：本机默认的 `sysupgrade -b` 其实**已经**带上了
# 这个文件，因为 sysupgrade 第 222 行在 SAVE_OVERLAY_PATH 为空时把整个 overlay 都
# find 了进去。那是本机当前版本的行为，不是这条声明换来的，换分支/换配置模式就不一定。
# 注意：这一段里的路径**不能缩进**（BuildPackVariable 原样 echo，缩进会进文件内容）。
define Package/luci-app-cf-ipcheck/conffiles
/etc/config/cf_ipcheck
endef

include $(TOPDIR)/feeds/luci/luci.mk

# call BuildPackage - OpenWrt buildroot signature
