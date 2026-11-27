# OpenWrt 包：NAV 采集器（路由器插件）
# 本目录是采集器的唯一真源：Go module（src/）+ OpenWrt 包（Makefile/files）+ NAS Docker（Dockerfile）
# 云端项目见 ybjbox/nav（前端 + Worker）；采集器经 HTTPS 出站推送到 NAV 云端。
include $(TOPDIR)/rules.mk

PKG_NAME:=nav-collector
PKG_VERSION:=0.2.1
PKG_RELEASE:=11
PKG_MAINTAINER:=NAV
PKG_LICENSE:=MIT
PKG_BUILD_DEPENDS:=golang/host
PKG_CONFIG_DEPENDS:=CONFIG_PACKAGE_nav-collector

# 源码随包目录分发（src/ 下为完整 Go module：cmd/ internal/ go.mod go.sum）
# 无 PKG_SOURCE_URL：Prepare 阶段手动把 ./src 复制进 PKG_BUILD_DIR
PKG_BUILD_DIR:=$(BUILD_DIR)/$(PKG_NAME)-$(PKG_VERSION)

# ⚠️ GO_PKG 及相关的 GO_* 变量必须写在 include golang-package.mk 之前。
# 该文件末尾有一段 include 时求值的条件：
#   ifneq ($(strip $(GO_PKG)),)
#     Build/Configure=$(call GoPackage/Build/Configure)
#     Build/Compile=$(call GoPackage/Build/Compile)
# 如果 GO_PKG 定义在 include 之后，这段不生效：Build/Configure 保持默认（不会
# 创建 .go_work 工作区），Build/Compile 落回 Build/Compile/Default（在
# PKG_BUILD_DIR 里跑 make）。两种结果都是编译失败。
GO_PKG:=nav/collector
# go install 目标必须是完整 import path（GOPATH 布局下相对 GO_PKG 根）
GO_PKG_BUILD_PKG:=nav/collector/cmd/collector
# golang-build.sh 拷源码时只认 .c/.cc/.cpp/.go/.h/.hh/.hpp/.proto/.s、
# /testdata/、go.mod|go.sum|go.work。internal/ui/page.html 不在其中，
# 而 ui.go 里有 //go:embed page.html —— 必须整包拷贝，否则报
# "pattern page.html: no matching files found"。
GO_PKG_INSTALL_ALL:=1
GO_PKG_LDFLAGS_X:=$(GO_PKG)/internal/version.Version=$(PKG_VERSION)-$(PKG_RELEASE)
# 体积约束：裁剪调试信息
GO_PKG_LDFLAGS+=-s -w

include $(INCLUDE_DIR)/package.mk
# 需要 packages feed 的 golang 构建（feeds update/install packages 后可用）
include $(TOPDIR)/feeds/packages/lang/golang/golang-package.mk

define Package/nav-collector
  SECTION:=net
  CATEGORY:=Network
  TITLE:=NAV router collector (OpenClash/system monitoring)
  URL:=https://github.com/ybjbox/MyNav
  DEPENDS:=$(GO_ARCH_DEPENDS) +luci-base
endef

define Package/nav-collector/description
  NAV 采集器路由器插件：采集本机系统指标（/proc）、OpenClash 运行状态
  （Clash External Controller API），阈值告警并出站推送到 NAV 云端。
  仅出站 HTTPS，不监听对外端口；本地配置页 :12900 仅局域网；配置见 /etc/config/nav。
  同时提供 LuCI 后台「服务 → NAV 采集器」配置页，与 :12900 互通。
endef

# 不要关 CGO。golang-package.mk 的 GO_PKG_DEFAULT_LDFLAGS 里写死了
#   -linkmode external -extldflags '...'
# 而 Go 在 CGO_ENABLED=0 时拒绝外部链接，直接报
#   -linkmode requires external (cgo) linking, but cgo is not enabled
# 交叉链接用的是 TARGET_CC（aarch64-openwrt-linux-musl-gcc），工具链里有。
# 若确实要静态二进制，得同时清空 GO_PKG_DEFAULT_LDFLAGS，代价是丢掉上游的
# hardening（PIE/RELRO），不建议。

define Build/Prepare
	$(INSTALL_DIR) $(PKG_BUILD_DIR)
	$(CP) ./src/. $(PKG_BUILD_DIR)/
endef

# Build/Configure 与 Build/Compile 由 golang-package.mk 在 GO_PKG 非空时自动
# 挂上（见文件开头说明），这里不要再定义，否则容易漏掉 Configure 那一半。

define Package/nav-collector/install
	$(call GoPackage/Package/Install/Bin,$(1))
	# go install 的产物名取包目录名（cmd/collector → collector），
	# 而 files/nav.init 里 PROG=/usr/bin/nav-collector，这里改名对齐。
	$(INSTALL_BIN) $(1)/usr/bin/collector $(1)/usr/bin/nav-collector
	$(RM) $(1)/usr/bin/collector
	$(INSTALL_DIR) $(1)/etc/config $(1)/etc/init.d
	$(INSTALL_DATA) ./files/config $(1)/etc/config/nav
	$(INSTALL_BIN) ./files/nav.init $(1)/etc/init.d/nav
	# LuCI 后台配置页：菜单入口 + rpcd 授权 + JS 视图
	$(INSTALL_DIR) $(1)/usr/share/luci/menu.d
	$(INSTALL_DATA) ./files/nav-menu.json $(1)/usr/share/luci/menu.d/luci-app-nav.json
	$(INSTALL_DIR) $(1)/usr/share/rpcd/acl.d
	$(INSTALL_DATA) ./files/nav.acl $(1)/usr/share/rpcd/acl.d/luci-app-nav.json
	$(INSTALL_DIR) $(1)/www/luci-static/resources/view/nav
	$(INSTALL_DATA) ./files/luci-nav.js $(1)/www/luci-static/resources/view/nav/config.js
endef

$(eval $(call BuildPackage,nav-collector))
