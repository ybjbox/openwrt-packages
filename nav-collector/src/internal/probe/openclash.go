/* OpenClash 探针：Clash External Controller REST API
 * GET /version（核心版本）、GET /connections（连接数 + 累计代理流量差分）、GET /memory
 * 服务运行状态以 API 可达为准；secret 在 OpenClash「外部控制」设置里查看。
 */
package probe

import (
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strconv"
	"strings"
	"sync"
	"time"

	"nav/collector/internal/config"
	"nav/collector/internal/metrics"
)

type ClashProbe struct {
	cfg    config.DeviceConfig
	client *http.Client
	mu     sync.Mutex

	prevDown, prevUp uint64
	prevAt           time.Time
	spark            []float64
}

func NewClash(cfg config.DeviceConfig) *ClashProbe {
	timeout := cfg.Timeout
	if timeout <= 0 {
		timeout = 8 * time.Second
	}
	return &ClashProbe{cfg: cfg, client: &http.Client{Timeout: timeout}}
}

func (p *ClashProbe) get(path string, out any) error {
	host := p.cfg.Host
	if !strings.Contains(host, ":") {
		port := p.cfg.ApiPort
		if port <= 0 {
			port = 9090
		}
		host = host + ":" + strconv.Itoa(port)
	}
	url := "http://" + host + path
	req, err := http.NewRequest(http.MethodGet, url, nil)
	if err != nil {
		return err
	}
	if p.cfg.ApiSecret != "" {
		req.Header.Set("authorization", "Bearer "+p.cfg.ApiSecret)
	}
	resp, err := p.client.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()
	if resp.StatusCode == 401 {
		return fmt.Errorf("clash API 鉴权失败（检查 api_secret）")
	}
	if resp.StatusCode >= 300 {
		return fmt.Errorf("clash API %s 返回 %d", path, resp.StatusCode)
	}
	raw, err := io.ReadAll(io.LimitReader(resp.Body, 16*1024*1024))
	if err != nil {
		return err
	}
	return json.Unmarshal(raw, out)
}

func (p *ClashProbe) Collect() (*metrics.DeviceSample, error) {
	s := &metrics.DeviceSample{
		ID:     p.cfg.ID,
		Name:   p.cfg.Name,
		Kind:   p.cfg.Kind,
		Status: "online",
	}

	var ver map[string]any
	if err := p.get("/version", &ver); err != nil {
		return nil, err
	}
	if v, ok := ver["version"].(string); ok {
		s.Version = v
	}

	var conns map[string]any
	if err := p.get("/connections", &conns); err != nil {
		return nil, err
	}
	if list, ok := conns["connections"].([]any); ok {
		s.Connections = len(list)
	}
	down := asFloat(conns["downloadTotal"])
	up := asFloat(conns["uploadTotal"])
	now := time.Now()
	p.mu.Lock()
	{
		prevAt := p.prevAt
		p.prevAt = now
		pd, pu := p.prevDown, p.prevUp
		p.prevDown, p.prevUp = uint64(down), uint64(up)
		if !prevAt.IsZero() && prevAt.Before(now) && down >= float64(pd) && up >= float64(pu) {
			dt := now.Sub(prevAt).Seconds()
			if dt > 0.5 {
				s.Traffic = &metrics.TrafficInfo{
					Iface:   "clash",
					RxBps:   (down - float64(pd)) / dt, // 代理下载
					TxBps:   (up - float64(pu)) / dt,   // 代理上传
					RxTotal: uint64(down),
					TxTotal: uint64(up),
				}
				p.spark = append(p.spark, s.Traffic.RxBps)
				if len(p.spark) > 48 {
					p.spark = p.spark[len(p.spark)-48:]
				}
				s.Spark = p.spark
			}
		}
	}
	p.mu.Unlock()

	var mem map[string]any
	if err := p.get("/memory", &mem); err == nil {
		if inuse := asFloat(mem["inuse"]); inuse > 0 {
			s.Load1 = inuse // 借位承载 Clash 内存字节数（不直接展示）
		}
	}

	return s, nil
}
