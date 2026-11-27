/* 采集器配置（YAML）与动态项（云端下发） */
package config

import (
	"fmt"
	"os"
	"time"

	"gopkg.in/yaml.v3"
)

type PushConfig struct {
	URL      string        `yaml:"url"`
	Username string        `yaml:"username"` // 云端登录账号（调用 /api/collector/login 换取临时 JWT）
	Password string        `yaml:"password"` // 云端登录密码
	Source   string        `yaml:"source"`   // 采集器实例标识（多源云端分桶）；缺省用 self.id
	Interval time.Duration `yaml:"interval"`
	Timeout  time.Duration `yaml:"timeout"`
}

type MountConfig struct {
	Mount string `yaml:"mount"` // 宿主挂载点，如 /vol1
	Path  string `yaml:"path"`  // 容器内可见路径，如 /host/vol1
}

type SelfConfig struct {
	ID            string        `yaml:"id"`
	Name          string        `yaml:"name"`
	Kind          string        `yaml:"kind"` // router | nas | other
	HostProc      string        `yaml:"host_proc"`
	HostSys       string        `yaml:"host_sys"`
	Mounts        []MountConfig `yaml:"mounts"`
	TrafficIface  string        `yaml:"traffic_iface"`
	Fwx           bool          `yaml:"fwx"` // 路由器插件模式：用本地 ubus 读 FanchmWrt 状态（连接数/联网/版本）
}

type DeviceConfig struct {
	ID       string        `yaml:"id"`
	Name     string        `yaml:"name"`
	Kind     string        `yaml:"kind"` // router | service | other
	Type     string        `yaml:"type"` // ssh | ping | ubus | openclash
	Host     string        `yaml:"host"` // host[:port]
	User     string        `yaml:"user"`
	Password string        `yaml:"password"` // ubus RPC 会话登录
	KeyFile  string        `yaml:"key_file"`
	WANIface string        `yaml:"wan_iface"`
	ApiPort  int           `yaml:"api_port"`  // openclash: Clash External Controller 端口
	ApiSecret string       `yaml:"api_secret"` // openclash: Clash API secret
	Logs      bool         `yaml:"logs"`       // ssh: 是否通过 SSH 采集系统日志（独立开关）
	Timeout  time.Duration `yaml:"timeout"`
}

type BarkChannel struct {
	URL string `yaml:"url"` // 如 https://api.day.app
	Key string `yaml:"key"`
}
type TelegramChannel struct {
	Token  string `yaml:"token"`
	ChatID string `yaml:"chat_id"`
}
type WebhookChannel struct {
	URL      string `yaml:"url"`
	Template string `yaml:"template"` // 支持 {{title}} {{message}} {{device}} {{severity}}
}

type AlertsConfig struct {
	FailThreshold int              `yaml:"fail_threshold"`
	Sustain       int              `yaml:"sustain"` // 高负载需连续满足的采样次数
	Channels      struct {
		Bark     BarkChannel     `yaml:"bark"`
		Telegram TelegramChannel `yaml:"telegram"`
		Webhook  WebhookChannel  `yaml:"webhook"`
	} `yaml:"channels"`
}

type UIConfig struct {
	Listen   string `yaml:"listen"`   // 本地配置页监听地址（仅局域网）
	Username string `yaml:"username"` // 本地配置页登录账号（默认 admin）
	Password string `yaml:"password"` // 登录配置页所需密码；空 = 禁止在线修改配置
}

type Thresholds struct {
	CPU  float64 `yaml:"cpu"`
	Mem  float64 `yaml:"mem"`
	Disk float64 `yaml:"disk"`
	Temp float64 `yaml:"temp"`
	Conn float64 `yaml:"conn"` // conntrack/连接数告警阈值
}

type Config struct {
	Push       PushConfig    `yaml:"push"`
	Self       SelfConfig    `yaml:"self"`
	Devices    []DeviceConfig `yaml:"devices"`
	Alerts     AlertsConfig  `yaml:"alerts"`
	Thresholds Thresholds    `yaml:"thresholds"`
	UI         UIConfig      `yaml:"ui"`
}

func Load(path string) (*Config, error) {
	b, err := os.ReadFile(path)
	if err != nil {
		return nil, fmt.Errorf("读取配置失败: %w", err)
	}
	c := &Config{}
	if err := yaml.Unmarshal(b, c); err != nil {
		return nil, fmt.Errorf("解析配置失败: %w", err)
	}
	if c.Push.Interval <= 0 {
		c.Push.Interval = 60 * time.Second
	}
	if c.Push.Timeout <= 0 {
		c.Push.Timeout = 15 * time.Second
	}
	if c.Alerts.FailThreshold <= 0 {
		c.Alerts.FailThreshold = 3
	}
	if c.Alerts.Sustain <= 0 {
		c.Alerts.Sustain = 3
	}
	if c.Thresholds.CPU <= 0 {
		c.Thresholds = Thresholds{CPU: 85, Mem: 90, Disk: 90, Temp: 65, Conn: 30000}
	}
	if c.Thresholds.Conn <= 0 {
		c.Thresholds.Conn = 30000
	}
	if c.UI.Password != "" && c.UI.Username == "" {
		c.UI.Username = "admin"
	}
	return c, nil
}
