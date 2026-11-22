/* 存活探针：优先 ICMP（pro-bing），失败时回退 TCP 80/443 连接检测 */
package probe

import (
	"net"
	"strconv"
	"time"

	"nav/collector/internal/config"
	"nav/collector/internal/metrics"

	probing "github.com/prometheus-community/pro-bing"
)

type PingProbe struct {
	cfg config.DeviceConfig
}

func NewPing(cfg config.DeviceConfig) *PingProbe { return &PingProbe{cfg: cfg} }

func (p *PingProbe) Collect() (*metrics.DeviceSample, error) {
	host := p.cfg.Host
	timeout := p.cfg.Timeout
	if timeout <= 0 {
		timeout = 5 * time.Second
	}

	s := &metrics.DeviceSample{
		ID:     p.cfg.ID,
		Name:   p.cfg.Name,
		Kind:   p.cfg.Kind,
		Status: "online",
	}

	// 1) ICMP（部分系统/非特权容器不可用）
	pinger := probing.New(host)
	pinger.Count = 1
	pinger.Timeout = timeout
	if err := pinger.Run(); err == nil {
		if st := pinger.Statistics(); st != nil && len(st.Rtts) > 0 {
			s.Load1 = st.Rtts[0].Seconds() * 1000 // 延迟占位（不展示）
		}
		return s, nil
	}

	// 2) 回退：TCP 80 / 443
	for _, port := range []int{80, 443} {
		conn, err := net.DialTimeout("tcp", net.JoinHostPort(host, strconv.Itoa(port)), timeout)
		if err == nil {
			_ = conn.Close()
			return s, nil
		}
	}
	return nil, &icmpAndTCPFailError{host: host}
}

type icmpAndTCPFailError struct{ host string }

func (e *icmpAndTCPFailError) Error() string {
	return "ICMP 与 TCP(80/443) 探测均失败: " + e.host
}
