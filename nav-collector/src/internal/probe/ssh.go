/* SSH 探针：读取 OpenWrt/iStoreOS 的 WAN 口流量、负载与温度 */
package probe

import (
	"fmt"
	"net"
	"os"
	"strconv"
	"strings"
	"sync"
	"time"

	"nav/collector/internal/config"
	"nav/collector/internal/metrics"

	"golang.org/x/crypto/ssh"
)

const sshScript = `
cat /proc/net/dev
echo "---LOAD---"
cat /proc/loadavg
echo "---UP---"
cat /proc/uptime
echo "---STAT---"
head -1 /proc/stat
echo "---TEMP---"
cat /sys/class/thermal/thermal_zone*/temp 2>/dev/null | sort -n | tail -1
`

// 只读抓取 NAS（Debian/fnOS）最近 150 行系统日志；若仅配置了指标受限账号则静默返回空
const sshLogScript = `
if command -v journalctl >/dev/null 2>&1; then
  journalctl -n 150 --no-pager -o short-iso 2>/dev/null || journalctl -n 150 --no-pager 2>/dev/null
elif [ -r /var/log/syslog ]; then
  tail -n 150 /var/log/syslog
elif [ -r /var/log/messages ]; then
  tail -n 150 /var/log/messages
else
  dmesg -T 2>/dev/null | tail -n 150 || dmesg 2>/dev/null | tail -n 150
fi
`

type SSHProbe struct {
	cfg config.DeviceConfig
	mu  sync.Mutex
	client *ssh.Client
	prevCPU *cpuStatX
	prevNet map[string]*netStatX
	prevAt  time.Time
	spark   []float64
}

type cpuStatX struct{ total, idle uint64 }
type netStatX struct{ rx, tx uint64 }

func NewSSH(cfg config.DeviceConfig) *SSHProbe {
	return &SSHProbe{cfg: cfg, prevNet: map[string]*netStatX{}}
}

func (p *SSHProbe) dial() (*ssh.Client, error) {
	if p.client != nil {
		if _, _, err := p.client.SendRequest("keepalive@openssh.com", true, nil); err == nil {
			return p.client, nil
		}
		_ = p.client.Close()
		p.client = nil
	}
	host := p.cfg.Host
	if _, _, err := net.SplitHostPort(host); err != nil {
		host = net.JoinHostPort(host, "22")
	}
	timeout := p.cfg.Timeout
	if timeout <= 0 {
		timeout = 10 * time.Second
	}
	key, err := os.ReadFile(p.cfg.KeyFile)
	if err != nil {
		return nil, fmt.Errorf("读取私钥失败: %w", err)
	}
	signer, err := ssh.ParsePrivateKey(key)
	if err != nil {
		return nil, fmt.Errorf("解析私钥失败: %w", err)
	}
	cfgS := &ssh.ClientConfig{
		User: p.cfg.User,
		Auth: []ssh.AuthMethod{ssh.PublicKeys(signer)},
		HostKeyCallback: ssh.InsecureIgnoreHostKey(), // 内网固定设备；如需严格校验可提供 known_hosts
		Timeout:         timeout,
	}
	client, err := ssh.Dial("tcp", host, cfgS)
	if err != nil {
		return nil, err
	}
	p.client = client
	return client, nil
}

// Collect 返回设备指标；status 由调用方依据错误判定
func (p *SSHProbe) Collect() (*metrics.DeviceSample, error) {
	p.mu.Lock()
	defer p.mu.Unlock()

	client, err := p.dial()
	if err != nil {
		return nil, err
	}
	sess, err := client.NewSession()
	if err != nil {
		_ = p.client.Close()
		p.client = nil
		return nil, err
	}
	defer sess.Close()
	out, err := sess.CombinedOutput(sshScript)
	if err != nil {
		return nil, fmt.Errorf("执行命令失败: %w", err)
	}

	s := &metrics.DeviceSample{
		ID:     p.cfg.ID,
		Name:   p.cfg.Name,
		Kind:   p.cfg.Kind,
		Status: "online",
	}
	section := ""
	for _, line := range strings.Split(string(out), "\n") {
		line = strings.TrimRight(line, "\r")
		switch line {
		case "---LOAD---", "---UP---", "---STAT---", "---TEMP---":
			section = line
			continue
		}
		if strings.Contains(line, ":") && section == "" {
			parts := strings.SplitN(line, ":", 2)
			iface := strings.TrimSpace(parts[0])
			fields := strings.Fields(parts[1])
			if len(fields) < 9 {
				continue
			}
			rx, _ := strconv.ParseUint(fields[0], 10, 64)
			tx, _ := strconv.ParseUint(fields[8], 10, 64)
			// WAN 口优先，其次取流量最大的口
			isWan := p.cfg.WANIface != "" && iface == p.cfg.WANIface
			if isWan {
				p.applyTraffic(s, iface, rx, tx)
			} else if s.Traffic == nil && p.cfg.WANIface == "" {
				p.applyTraffic(s, iface, rx, tx)
			}
			continue
		}
		switch section {
		case "---LOAD---":
			if f := strings.Fields(line); len(f) > 0 {
				s.Load1, _ = strconv.ParseFloat(f[0], 64)
			}
		case "---UP---":
			if f := strings.Fields(line); len(f) > 0 {
				v, _ := strconv.ParseFloat(f[0], 64)
				s.UptimeS = v
			}
		case "---STAT---":
			if strings.HasPrefix(line, "cpu ") {
				if cs, perr := parseCPUStatX(line); perr == nil {
					if p.prevCPU != nil {
						dt := cs.total - p.prevCPU.total
						di := cs.idle - p.prevCPU.idle
						if dt > 0 {
							s.CPU = (1 - float64(di)/float64(dt)) * 100
						}
					}
					p.prevCPU = &cs
				}
			}
		case "---TEMP---":
			if v, perr := strconv.ParseFloat(strings.TrimSpace(line), 64); perr == nil && v > 0 {
				s.Temp = v / 1000
			}
		}
	}
	return s, nil
}

// CollectLogs 在开启独立日志开关时抓取 NAS 最近 80 行系统日志并做本地脱敏；失败不影响在线判定
func (p *SSHProbe) CollectLogs() []string {
	if !p.cfg.Logs {
		return nil
	}
	p.mu.Lock()
	defer p.mu.Unlock()

	client, err := p.dial()
	if err != nil {
		return nil
	}
	sess, err := client.NewSession()
	if err != nil {
		return nil
	}
	defer sess.Close()
	out, err := sess.CombinedOutput(sshLogScript)
	if err != nil || len(out) == 0 {
		return nil
	}
	return cleanLines(string(out), maxLogLines)
}

func (p *SSHProbe) applyTraffic(s *metrics.DeviceSample, iface string, rx, tx uint64) {
	now := time.Now()
	prev, ok := p.prevNet[iface]
	p.prevNet[iface] = &netStatX{rx: rx, tx: tx}
	if !ok || p.prevAt.IsZero() || !p.prevAt.Before(now) {
		return
	}
	dt := now.Sub(p.prevAt).Seconds()
	if rx < prev.rx || tx < prev.tx || dt < 0.5 {
		return
	}
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

func parseCPUStatX(line string) (cpuStatX, error) {
	fields := strings.Fields(line)
	if len(fields) < 5 {
		return cpuStatX{}, fmt.Errorf("bad stat")
	}
	var total, idle uint64
	for i, f := range fields[1:] {
		v, err := strconv.ParseUint(f, 10, 64)
		if err != nil {
			continue
		}
		total += v
		if i == 3 {
			idle = v
		}
	}
	return cpuStatX{total: total, idle: idle}, nil
}
