//go:build linux

/* 本机探针：读取宿主 /proc、/sys（容器内只读挂载），Linux 专用实现 */
package probe

import (
	"fmt"
	"os"
	"path/filepath"
	"sort"
	"strconv"
	"strings"
	"sync"
	"syscall"
	"time"

	"nav/collector/internal/config"
	"nav/collector/internal/metrics"
)

type LocalProbe struct {
	cfg config.SelfConfig
	mu  sync.Mutex

	// CPU 差分
	prevCPUStat   *cpuStat
	prevNetStat   map[string]*netStat
	prevNetAt     time.Time
	spark         []float64
	lastCPUStat   *cpuStat // 供首次采样的回退
}

type cpuStat struct {
	total, idle uint64
}

type netStat struct {
	rx, tx uint64
}

func NewLocal(cfg config.SelfConfig) *LocalProbe {
	return &LocalProbe{cfg: cfg, prevNetStat: map[string]*netStat{}}
}

func readFirstLine(path string) (string, error) {
	b, err := os.ReadFile(path)
	if err != nil {
		return "", err
	}
	s := string(b)
	if idx := strings.IndexByte(s, '\n'); idx >= 0 {
		s = s[:idx]
	}
	return strings.TrimSpace(s), nil
}

func parseCPUStat(line string) (cpuStat, error) {
	fields := strings.Fields(line)
	if len(fields) < 5 {
		return cpuStat{}, fmt.Errorf("stat 格式异常")
	}
	var total, idle uint64
	for i, f := range fields[1:] {
		v, err := strconv.ParseUint(f, 10, 64)
		if err != nil {
			continue
		}
		total += v
		if i == 3 { // idle
			idle = v
		}
	}
	return cpuStat{total: total, idle: idle}, nil
}

func readMem(hostProc string) (float64, error) {
	b, err := os.ReadFile(filepath.Join(hostProc, "meminfo"))
	if err != nil {
		return 0, err
	}
	var total, avail float64
	for _, line := range strings.Split(string(b), "\n") {
		if strings.HasPrefix(line, "MemTotal:") {
			total = parseKB(line)
		} else if strings.HasPrefix(line, "MemAvailable:") {
			avail = parseKB(line)
		}
	}
	if total <= 0 {
		return 0, fmt.Errorf("meminfo 缺少 MemTotal")
	}
	return (total - avail) / total * 100, nil
}

func parseKB(line string) float64 {
	f := strings.Fields(line)
	if len(f) < 2 {
		return 0
	}
	v, _ := strconv.ParseFloat(f[1], 64)
	return v
}

func readLoad(hostProc string) float64 {
	line, err := readFirstLine(filepath.Join(hostProc, "loadavg"))
	if err != nil {
		return 0
	}
	f := strings.Fields(line)
	if len(f) < 1 {
		return 0
	}
	v, _ := strconv.ParseFloat(f[0], 64)
	return v
}

func readUptime(hostProc string) float64 {
	line, err := readFirstLine(filepath.Join(hostProc, "uptime"))
	if err != nil {
		return 0
	}
	f := strings.Fields(line)
	if len(f) < 1 {
		return 0
	}
	v, _ := strconv.ParseFloat(f[0], 64)
	return v
}

func readNet(hostProc string, want string) map[string]*netStat {
	out := map[string]*netStat{}
	b, err := os.ReadFile(filepath.Join(hostProc, "net", "dev"))
	if err != nil {
		return out
	}
	for _, line := range strings.Split(string(b), "\n") {
		if !strings.Contains(line, ":") {
			continue
		}
		parts := strings.SplitN(line, ":", 2)
		iface := strings.TrimSpace(parts[0])
		if want != "" && iface != want {
			continue
		}
		fields := strings.Fields(parts[1])
		if len(fields) < 9 {
			continue
		}
		rx, _ := strconv.ParseUint(fields[0], 10, 64)
		tx, _ := strconv.ParseUint(fields[8], 10, 64)
		out[iface] = &netStat{rx: rx, tx: tx}
	}
	return out
}

func readTemp(hostSys string) float64 {
	if hostSys == "" {
		return 0
	}
	zones, _ := filepath.Glob(filepath.Join(hostSys, "class", "thermal", "thermal_zone*", "temp"))
	var max float64
	for _, z := range zones {
		b, err := os.ReadFile(z)
		if err != nil {
			continue
		}
		v, _ := strconv.ParseFloat(strings.TrimSpace(string(b)), 64)
		if v/1000 > max {
			max = v / 1000
		}
	}
	return max
}

func statfsPct(path string) (pct float64, totalGB float64, err error) {
	var st syscall.Statfs_t
	if err = syscall.Statfs(path, &st); err != nil {
		return 0, 0, err
	}
	total := st.Blocks * uint64(st.Bsize)
	avail := st.Bavail * uint64(st.Bsize)
	if total == 0 {
		return 0, 0, fmt.Errorf("statfs total=0")
	}
	return (1 - float64(avail)/float64(total)) * 100, float64(total) / 1024 / 1024 / 1024, nil
}

// Collect 采集一轮本机指标（CPU 用两次调用间隔做差分）
func (p *LocalProbe) Collect() *metrics.DeviceSample {
	p.mu.Lock()
	defer p.mu.Unlock()

	s := &metrics.DeviceSample{
		ID:     p.cfg.ID,
		Name:   p.cfg.Name,
		Kind:   p.cfg.Kind,
		Status: "online",
	}

	// CPU
	line, err := readFirstLine(filepath.Join(p.cfg.HostProc, "stat"))
	if err == nil && strings.HasPrefix(line, "cpu ") {
		if cs, perr := parseCPUStat(line); perr == nil {
			if p.prevCPUStat != nil {
				dt := cs.total - p.prevCPUStat.total
				di := cs.idle - p.prevCPUStat.idle
				if dt > 0 {
					s.CPU = (1 - float64(di)/float64(dt)) * 100
				}
			}
			p.prevCPUStat = &cs
		}
	}
	s.Mem, _ = readMem(p.cfg.HostProc)
	s.Load1 = readLoad(p.cfg.HostProc)
	s.UptimeS = readUptime(p.cfg.HostProc)
	s.Temp = readTemp(p.cfg.HostSys)

	// 磁盘
	for _, m := range p.cfg.Mounts {
		if pct, total, err := statfsPct(m.Path); err == nil {
			s.Disks = append(s.Disks, metrics.DiskInfo{Mount: m.Mount, UsedPct: pct, TotalGB: total})
		}
	}

	// 流量（差分速率）
	now := time.Now()
	net := readNet(p.cfg.HostProc, p.cfg.TrafficIface)
	var iface string
	var rx, tx uint64
	names := make([]string, 0, len(net))
	for n := range net {
		names = append(names, n)
	}
	sort.Strings(names)
	if len(names) > 0 {
		iface = names[0]
		ns := net[iface]
		rx, tx = ns.rx, ns.tx
		if prev, ok := p.prevNetStat[iface]; ok && p.prevNetAt.Before(now) {
			dt := now.Sub(p.prevNetAt).Seconds()
			if rx >= prev.rx && tx >= prev.tx && dt > 0.5 {
				s.Traffic = &metrics.TrafficInfo{
					Iface:   iface,
					RxBps:   float64(rx-prev.rx) / dt,
					TxBps:   float64(tx-prev.tx) / dt,
					RxTotal: rx,
					TxTotal: tx,
				}
				p.spark = append(p.spark, s.Traffic.RxBps)
				if len(p.spark) > 48 {
					p.spark = p.spark[len(p.spark)-48:]
				}
				s.Spark = p.spark
			}
		}
		p.prevNetStat[iface] = &netStat{rx: rx, tx: tx}
		p.prevNetAt = now
	}

	return s
}
