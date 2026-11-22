# OpenWrt 包：NAV 采集器（路由器插件）
# 集成方式见 navpage/docs/PLUGIN.md（固件内置 或 SDK 独立出 ipk）
include $(TOPDIR)/rules.mk

PKG_NAME:=nav-collector
PKG_VERSION:=0.2.1
PKG_RELEASE:=1
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
GO_PKG_LDFLAGS_X:=$(GO_PKG)/internal/version.Version=$(PKG_VERSION)-$(PKG_RELEASE)
# 体积约束：裁剪调试信息（交叉 CGO 默认禁用，无需显式）
GO_PKG_LDFLAGS+=-s -w

define Build/Prepare
	$(INSTALL_DIR) $(PKG_BUILD_DIR)
	$(CP) ./src/. $(PKG_BUILD_DIR)/
endef

define Package/nav-collector/install
	$(call GoPackage/Package/Install/Bin,$(1))
	$(INSTALL_DIR) $(1)/etc/config $(1)/etc/init.d
	$(INSTALL_DATA) ./files/config $(1)/etc/config/nav
	$(INSTALL_BIN) ./files/nav.init $(1)/etc/init.d/nav
endef

$(eval $(call BuildPackage,nav-collector))
