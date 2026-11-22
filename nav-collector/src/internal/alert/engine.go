/* 告警引擎：阈值规则评估 + 触发/恢复状态迁移 */
package alert

import (
	"fmt"
	"sync"
	"time"

	"nav/collector/internal/config"
	"nav/collector/internal/metrics"
)

type Engine struct {
	cfg  *config.Config
	mu   sync.Mutex
	// 持续性计数
	counters map[string]int
	// 活动告警
	active map[string]metrics.Alert
	// 服务连续失败计数
	svcFails map[string]int
}

func NewEngine(cfg *config.Config) *Engine {
	return &Engine{
		cfg:      cfg,
		counters: map[string]int{},
		active:   map[string]metrics.Alert{},
		svcFails: map[string]int{},
	}
}

func nowMs() int64 { return time.Now().UnixMilli() }

// Evaluate 根据本轮设备与服务状态计算告警集合。
// 返回：当前活动告警、本轮恢复的告警（含最后消息）、本轮新触发的告警。
func (e *Engine) Evaluate(devices []metrics.DeviceSample, services []metrics.ServiceStatus) (active, resolved, fresh []metrics.Alert) {
	e.mu.Lock()
	defer e.mu.Unlock()
	now := nowMs()
	t := e.cfg.Thresholds
	sustain := e.cfg.Alerts.Sustain

	seen := map[string]bool{}

	raise := func(id, device, rule, severity, msg string, cond bool) {
		if cond {
			e.counters[id]++
			if e.counters[id] >= sustain || sustain <= 1 {
				if _, ok := e.active[id]; !ok {
					e.active[id] = metrics.Alert{ID: id, Device: device, Rule: rule, Severity: severity, Message: msg, FirstSeen: now}
					fresh = append(fresh, e.active[id])
				}
				a := e.active[id]
				a.LastSeen = now
				a.Message = msg
				e.active[id] = a
				seen[id] = true
			}
		} else {
			delete(e.counters, id)
		}
	}

	for _, d := range devices {
		offline := d.Status == "offline"
		raise("down-"+d.ID, d.Name, "unreachable", "critical",
			fmt.Sprintf("设备 %s 不可达", d.Name), offline)

		if !offline {
			raise("cpu-"+d.ID, d.Name, "cpu_high", "warn",
				fmt.Sprintf("%s CPU %.0f%% ≥ %.0f%%", d.Name, d.CPU, t.CPU), d.CPU >= t.CPU)
			raise("mem-"+d.ID, d.Name, "mem_high", "warn",
				fmt.Sprintf("%s 内存 %.0f%% ≥ %.0f%%", d.Name, d.Mem, t.Mem), d.Mem >= t.Mem)
			if d.Temp > 0 {
				raise("temp-"+d.ID, d.Name, "temp_high", "warn",
					fmt.Sprintf("%s 温度 %.0f°C ≥ %.0f°C", d.Name, d.Temp, t.Temp), d.Temp >= t.Temp)
			}
			// WAN 连通性（FanchmWrt ubus 上报）
			if d.Internet != nil && !*d.Internet {
				raise("net-"+d.ID, d.Name, "internet_down", "critical",
					fmt.Sprintf("%s WAN 未联网", d.Name), true)
			}
			// 连接数（conntrack / Clash 连接）
			raise("conn-"+d.ID, d.Name, "conntrack_high", "warn",
				fmt.Sprintf("%s 连接数 %d ≥ %.0f", d.Name, d.Connections, t.Conn),
				d.Connections > 0 && float64(d.Connections) >= t.Conn)
			for _, disk := range d.Disks {
				id := fmt.Sprintf("disk-%s-%s", d.ID, disk.Mount)
				raise(id, d.Name, "disk_usage", "critical",
					fmt.Sprintf("磁盘 %s 用量 %.0f%% ≥ %.0f%%", disk.Mount, disk.UsedPct, t.Disk), disk.UsedPct >= t.Disk)
			}
		}
	}

	// 设备整体是否离线由 main 判定（连续失败计数），这里只做规则映射
	for _, svc := range services {
		id := "svc-" + svc.Name
		if svc.Status == "offline" {
			e.svcFails[svc.Name]++
			raise(id, svc.Name, "service_down", "warn",
				fmt.Sprintf("服务 %s 探活失败", svc.Name), e.svcFails[svc.Name] >= 2)
		} else {
			delete(e.svcFails, svc.Name)
			delete(e.counters, id)
		}
	}

	// 恢复：不再出现的活动告警
	for id, a := range e.active {
		if !seen[id] {
			a.LastSeen = now
			resolved = append(resolved, a)
			delete(e.active, id)
		}
	}
	active = append(active, e.activeList()...)
	return active, resolved, fresh
}

func (e *Engine) activeList() []metrics.Alert {
	out := make([]metrics.Alert, 0, len(e.active))
	for _, a := range e.active {
		out = append(out, a)
	}
	return out
}
