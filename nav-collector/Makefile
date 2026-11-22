# OpenWrt 包：NAV 采集器（路由器插件）
# 集成方式见 navpage/docs/PLUGIN.md（固件内置 或 SDK 独立出 ipk）
include $(TOPDIR)/rules.mk

PKG_NAME:=nav-collector
PKG_VERSION:=0.2.1
PKG_RELEASE:=2
PKG_MAINTAINER:=NAV
PKG_LICENSE:=MIT
PKG_CONFIG_DEPENDS:=CONFIG_PACKAGE_nav-collector

# 源码随包目录分发（src/ 下为完整 Go module：cmd/ internal/ go.mod go.sum）
# 无 PKG_SOURCE_URL：Prepare 阶段手动把 ./src 复制进 PKG_BUILD_DIR
PKG_BUILD_DIR:=$(BUILD_DIR)/$(PKG_NAME)-$(PKG_VERSION)

include $(INCLUDE_DIR)/package.mk
# 需要 packages feed 的 golang 构建（feeds update/install packages 后可用）
include $(TOPDIR)/feeds/packages/lang/golang/golang-package.mk

define Package/nav-collector
  SECTION:=net
  CATEGORY:=Network
  TITLE:=NAV router collector (OpenClash/system monitoring)
  URL:=https://github.com/ybjbox/nav
  DEPENDS:=$(GO_ARCH_DEPENDS)
endef

define Package/nav-collector/description
  NAV 采集器路由器插件：采集本机系统指标（/proc）、OpenClash 运行状态
  （Clash External Controller API），阈值告警并出站推送到 NAV 云端。
  仅出站 HTTPS，不监听对外端口；本地配置页 :12900 仅局域网；配置见 /etc/config/nav。
endef

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
# 默认 GO_PKG_TARGET_VARS 里有 GOOS/GOARCH/CGO_ENABLED=1，直接 := 赋值会把
# 交叉编译参数一起抹掉（会编出 runner 本机的 amd64）。只翻 CGO，其余保留。
GO_PKG_TARGET_VARS:=$(filter-out CGO_ENABLED=1,$(GO_PKG_TARGET_VARS)) CGO_ENABLED=0

define Build/Prepare
	$(INSTALL_DIR) $(PKG_BUILD_DIR)
	$(CP) ./src/. $(PKG_BUILD_DIR)/
endef

# 必须显式定义：golang-package.mk 的 GoBinPackage 只定义 install，不定义编译。
# 缺了它就会落到 package.mk 的 Build/Compile/Default，在 PKG_BUILD_DIR 里跑
# make —— Go 项目没有 Makefile，报 "No targets specified and no makefile found"。
define Build/Compile
	$(call GoPackage/Build/Compile)
endef

define Package/nav-collector/install
	$(call GoPackage/Package/Install/Bin,$(1))
	# go install 的产物名取包目录名（cmd/collector → collector），
	# 而 files/nav.init 里 PROG=/usr/bin/nav-collector，这里改名对齐。
	$(INSTALL_BIN) $(1)/usr/bin/collector $(1)/usr/bin/nav-collector
	$(RM) $(1)/usr/bin/collector
	$(INSTALL_DIR) $(1)/etc/config $(1)/etc/init.d
	$(INSTALL_DATA) ./files/config $(1)/etc/config/nav
	$(INSTALL_BIN) ./files/nav.init $(1)/etc/init.d/nav
endef

$(eval $(call BuildPackage,nav-collector))
