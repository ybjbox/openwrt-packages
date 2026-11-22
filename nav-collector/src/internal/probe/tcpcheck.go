/* 服务入口 TCP 探活 */
package probe

import (
	"net"
	"strconv"
	"sync"
	"time"

	"nav/collector/internal/metrics"
)

type CheckTarget struct {
	Name string
	Host string
	Port int
}

type CheckResult struct {
	Name      string
	Status    string // online | offline | slow
	LatencyMs int64
}

// RunChecks 并发执行 TCP 探活（>1s 视为 slow）
func RunChecks(targets []CheckTarget, timeout time.Duration) []metrics.ServiceStatus {
	if len(targets) == 0 {
		return nil
	}
	results := make([]metrics.ServiceStatus, len(targets))
	var wg sync.WaitGroup
	for i, t := range targets {
		wg.Add(1)
		go func(i int, t CheckTarget) {
			defer wg.Done()
			start := time.Now()
			conn, err := net.DialTimeout("tcp", net.JoinHostPort(t.Host, strconv.Itoa(t.Port)), timeout)
			lat := time.Since(start).Milliseconds()
			if conn != nil {
				_ = conn.Close()
			}
			r := metrics.ServiceStatus{Name: t.Name}
			switch {
			case err != nil:
				r.Status = "offline"
			case lat > 1000:
				r.Status = "slow"
				r.LatencyMs = lat
			default:
				r.Status = "online"
				r.LatencyMs = lat
			}
			results[i] = r
		}(i, t)
	}
	wg.Wait()
	return results
}
