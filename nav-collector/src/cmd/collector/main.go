/* NAV 采集器：本机指标 + 设备探针 + 服务探活 + 告警 + 云端推送
 *
 * 典型部署：飞牛 NAS Docker，只读挂载宿主 /proc、/sys 与数据卷，仅出站访问云端。
 */
package main

import (
	"context"
	"encoding/json"
	"flag"
	"fmt"
	"log"
	"net/http"
	"net/url"
	"os"
	"os/signal"
	"strconv"
	"sync"
	"syscall"
	"time"

	"nav/collector/internal/alert"
	"nav/collector/internal/config"
	"nav/collector/internal/metrics"
	"nav/collector/internal/notify"
	"nav/collector/internal/probe"
	"nav/collector/internal/push"
	"nav/collector/internal/ui"
	"nav/collector/internal/version"
)

// 云端下发的动态配置（探活目标 + 阈值）
type remoteConfig struct {
	ConfigVersion float64          `json:"config_version"`
	Checks        []struct {
		Name string `json:"name"`
		Host string `json:"host"`
		Port int    `json:"port"`
	} `json:"checks"`
	Thresholds *struct {
		CPU  float64 `json:"cpu"`
		Mem  float64 `json:"mem"`
		Disk float64 `json:"disk"`
		Temp float64 `json:"temp"`
		Conn float64 `json:"conn"`
	} `json:"thresholds"`
}

func main() {
	cfgPath := flag.String("config", "/config/config.yaml", "配置文件路径")
	once := flag.Bool("once", false, "只采集一轮并打印快照 JSON（验证用）")
	flag.Parse()

	cfg, err := config.Load(*cfgPath)
	if err != nil {
		log.Fatalf("配置加载失败: %v", err)
	}

	engine := alert.NewEngine(cfg)
	notifier := notify.New(&cfg.Alerts)
	pusher := push.New(cfg.Push)

	// 远程动态配置缓存
	var remoteMu sync.Mutex
	var remote remoteConfig

	refreshRemote := func() {
		if cfg.Push.Token == "" || cfg.Push.URL == "" {
			return
		}
		base, err := url.Parse(cfg.Push.URL)
		if err != nil {
			return
		}
		base.Path = "/api/collector-config"
		client := &http.Client{Timeout: 10 * time.Second}
		req, err := http.NewRequest(http.MethodGet, base.String(), nil)
		if err != nil {
			return
		}
		req.Header.Set("authorization", "Bearer "+cfg.Push.Token)
		resp, err := client.Do(req)
		if err != nil {
			ui.SetRemote(ui.RemoteInfo{LastFetchOK: false, LastError: err.Error(), LastFetchAt: time.Now()})
			log.Printf("remote-config: 拉取失败: %v", err)
			return
		}
		defer resp.Body.Close()
		if resp.StatusCode == 200 {
			var rc remoteConfig
			if err := json.NewDecoder(resp.Body).Decode(&rc); err == nil {
				remoteMu.Lock()
				remote = rc
				if rc.Thresholds != nil {
					// 只覆盖有效值（云端旧配置可能缺少新增阈值字段，不能覆盖成 0）
					nt := cfg.Thresholds
					if rc.Thresholds.CPU > 0 {
						nt.CPU = rc.Thresholds.CPU
					}
					if rc.Thresholds.Mem > 0 {
						nt.Mem = rc.Thresholds.Mem
					}
					if rc.Thresholds.Disk > 0 {
						nt.Disk = rc.Thresholds.Disk
					}
					if rc.Thresholds.Temp > 0 {
						nt.Temp = rc.Thresholds.Temp
					}
					if rc.Thresholds.Conn > 0 {
						nt.Conn = rc.Thresholds.Conn
					}
					cfg.Thresholds = nt
				}
				remoteMu.Unlock()
				ui.SetRemote(ui.RemoteInfo{ConfigVersion: rc.ConfigVersion, Checks: len(rc.Checks), LastFetchOK: true, LastFetchAt: time.Now()})
				log.Printf("remote-config: 已更新 (v%v, %d 个探活目标)", rc.ConfigVersion, len(rc.Checks))
			}
		}
	}

	// 本机探针（插件模式即路由器自身；fwx=true 时用本地 ubus 增强）
	var local *probe.LocalProbe
	var fwx *probe.FwxLocalProbe
	if cfg.Self.ID != "" && cfg.Self.HostProc != "" {
		local = probe.NewLocal(cfg.Self)
		if cfg.Self.Fwx {
			fwx = probe.NewFwxLocal()
		}
	}

	// 设备探针（SSH/Ping/ubus/OpenClash）
	type deviceProbe struct {
		cfg    config.DeviceConfig
		ssh    *probe.SSHProbe
		ping   *probe.PingProbe
		ubus   *probe.UbusProbe
		clash  *probe.ClashProbe
		fails  int
	}
	devices := make([]deviceProbe, 0, len(cfg.Devices))
	for _, d := range cfg.Devices {
		dp := deviceProbe{cfg: d}
		switch d.Type {
		case "ssh":
			dp.ssh = probe.NewSSH(d)
		case "ping":
			dp.ping = probe.NewPing(d)
		case "ubus":
			dp.ubus = probe.NewUbus(d)
		case "openclash":
			dp.clash = probe.NewClash(d)
		}
		devices = append(devices, dp)
	}

	// 设备离线判定（连续失败）
	offlineCount := map[string]int{}

	collect := func() *metrics.Snapshot {
		now := time.Now().UnixMilli()
		source := cfg.Push.Source
		if source == "" {
			source = cfg.Self.ID
		}
		snap := &metrics.Snapshot{TS: now, Source: source, Devices: []metrics.DeviceSample{}, Services: []metrics.ServiceStatus{}}

		// 本机（插件模式：self 即路由器自身；fwx 增强 FanchmWrt 状态）
		if local != nil {
			selfSample := local.Collect()
			if fwx != nil {
				fwx.Enrich(selfSample)
			}
			snap.Devices = append(snap.Devices, *selfSample)
		}

		// 设备（并行）
		var wg sync.WaitGroup
		var mu sync.Mutex
		for i := range devices {
			dp := &devices[i]
			wg.Add(1)
			go func() {
				defer wg.Done()
				var (
					s   *metrics.DeviceSample
					err error
				)
				switch {
				case dp.ssh != nil:
					s, err = dp.ssh.Collect()
				case dp.ping != nil:
					s, err = dp.ping.Collect()
				case dp.ubus != nil:
					s, err = dp.ubus.Collect()
				case dp.clash != nil:
					s, err = dp.clash.Collect()
				default:
					return
				}
				mu.Lock()
				defer mu.Unlock()
				if err != nil {
					offlineCount[dp.cfg.ID]++
					log.Printf("device %s: %v（连续失败 %d）", dp.cfg.ID, err, offlineCount[dp.cfg.ID])
					if s == nil {
						s = &metrics.DeviceSample{ID: dp.cfg.ID, Name: dp.cfg.Name, Kind: dp.cfg.Kind}
					}
					if offlineCount[dp.cfg.ID] >= cfg.Alerts.FailThreshold {
						s.Status = "offline"
					} else {
						s.Status = "degraded"
					}
				} else {
					offlineCount[dp.cfg.ID] = 0
				}
				snap.Devices = append(snap.Devices, *s)
			}()
		}
		wg.Wait()

		// 服务探活（云端下发目标；OpenWrt 插件可通过 NAV_CHECKS=0 关闭，职责让渡给 NAS agent）
		runChecks := true
		if v := os.Getenv("NAV_CHECKS"); v != "" {
			if b, err := strconv.ParseBool(v); err == nil {
				runChecks = b
			}
		}
		remoteMu.Lock()
		checks := make([]probe.CheckTarget, 0, len(remote.Checks))
		for _, c := range remote.Checks {
			checks = append(checks, probe.CheckTarget{Name: c.Name, Host: c.Host, Port: c.Port})
		}
		remoteMu.Unlock()
		timeout := 5 * time.Second
		if runChecks {
			snap.Services = probe.RunChecks(checks, timeout)
		} else {
			snap.Services = []metrics.ServiceStatus{}
		}

		// 告警评估
		active, resolved, fresh := engine.Evaluate(snap.Devices, snap.Services)
		snap.Alerts = active
		ids := make([]string, 0, len(resolved))
		for _, a := range resolved {
			ids = append(ids, a.ID)
		}
		snap.ResolvedAlertIDs = ids
		for _, a := range fresh {
			notifier.Send(a, false)
		}
		for _, a := range resolved {
			notifier.Send(a, true)
		}
		return snap
	}

	if *once {
		refreshRemote()
		snap := collect()
		out, _ := json.MarshalIndent(snap, "", "  ")
		fmt.Println(string(out))
		pusher.Send(snap)
		return
	}

	log.Printf("NAV 采集器启动：推送 %s（间隔 %s），设备 %d 个", cfg.Push.URL, cfg.Push.Interval, len(devices))
	refreshRemote()
	go func() {
		t := time.NewTicker(10 * time.Minute)
		defer t.Stop()
		for range t.C {
			refreshRemote()
		}
	}()

	// 本地配置页（仅局域网）：展示 Cloudflare 连接状态，写回 UCI
	if cfg.UI.Listen != "" {
		go func() {
			err := ui.Serve(cfg.UI.Listen, cfg.UI.Password, cfg,
				func() push.StatusSnapshot { return pusher.Status.Snapshot(version.Version) },
				func() ui.RemoteInfo {
					remoteMu.Lock()
					defer remoteMu.Unlock()
					return ui.RemoteInfo{
						ConfigVersion: remote.ConfigVersion,
						Checks:        len(remote.Checks),
						LastFetchOK:   true,
						LastFetchAt:   time.Now(),
					}
				})
			if err != nil {
				log.Printf("配置页启动失败: %v", err)
			}
		}()
	}

	ctx, stop := signal.NotifyContext(context.Background(), syscall.SIGINT, syscall.SIGTERM)
	defer stop()

	t := time.NewTicker(cfg.Push.Interval)
	defer t.Stop()
	for {
		snap := collect()
		pusher.Send(snap)
		select {
		case <-ctx.Done():
			log.Println("采集器退出")
			return
		case <-t.C:
		}
	}
}
