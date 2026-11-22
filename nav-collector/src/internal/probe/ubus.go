/* FanchmWrt ubus 探针：走 uhttpd-mod-ubus 的 HTTP JSON-RPC（无需 SSH）
 * 依据 http://doc.openappfilter.com/fanchmwrt/api.html：
 *   ubus call fwx common '{"api":"<api>","data":{}}'
 * 通过 RPC 等价调用，session login 后调用 "fwx" 对象的 "common" 方法。
 */
package probe

import (
	"bytes"
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

const ubusZeroSession = "00000000000000000000000000000000"

type UbusProbe struct {
	cfg    config.DeviceConfig
	client *http.Client
	mu     sync.Mutex
	session string

	prevNet map[string]*netStatX
	prevAt  time.Time
	spark   []float64
}

func NewUbus(cfg config.DeviceConfig) *UbusProbe {
	timeout := cfg.Timeout
	if timeout <= 0 {
		timeout = 10 * time.Second
	}
	return &UbusProbe{cfg: cfg, client: &http.Client{Timeout: timeout}, prevNet: map[string]*netStatX{}}
}

type ubusResp struct {
	Jsonrpc string        `json:"jsonrpc"`
	ID      int           `json:"id"`
	Result  []json.RawMessage `json:"result,omitempty"`
	Error   *struct {
		Code    int    `json:"code"`
		Message string `json:"message"`
	} `json:"error,omitempty"`
}

func (p *UbusProbe) endpoint() string {
	host := p.cfg.Host
	if !strings.Contains(host, ":") {
		host += ":80"
	}
	return "http://" + host + "/ubus"
}

func (p *UbusProbe) rpc(params []any) (*ubusResp, error) {
	body, _ := json.Marshal(map[string]any{
		"jsonrpc": "2.0", "id": 1, "method": "call", "params": params,
	})
	req, err := http.NewRequest(http.MethodPost, p.endpoint(), bytes.NewReader(body))
	if err != nil {
		return nil, err
	}
	req.Header.Set("content-type", "application/json")
	resp, err := p.client.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	raw, err := io.ReadAll(io.LimitReader(resp.Body, 8*1024*1024))
	if err != nil {
		return nil, err
	}
	var r ubusResp
	if err := json.Unmarshal(raw, &r); err != nil {
		return nil, fmt.Errorf("ubus 响应解析失败: %w", err)
	}
	if r.Error != nil {
		return nil, fmt.Errorf("ubus 错误 %d: %s", r.Error.Code, r.Error.Message)
	}
	return &r, nil
}

// login 获取 ubus 会话（session 过期时自动重登）
func (p *UbusProbe) login() error {
	r, err := p.rpc([]any{ubusZeroSession, "session", "login", map[string]string{
		"username": p.cfg.User, "password": p.cfg.Password,
	}})
	if err != nil {
		return err
	}
	if len(r.Result) < 2 {
		return fmt.Errorf("ubus 登录响应异常")
	}
	var obj map[string]any
	if err := json.Unmarshal(r.Result[1], &obj); err != nil {
		return err
	}
	sid, _ := obj["ubus_rpc_session"].(string)
	if sid == "" {
		return fmt.Errorf("ubus 登录失败（检查用户名/密码，且路由器需启用 uhttpd-mod-ubus）")
	}
	p.session = sid
	return nil
}

// callFwx 调用 fwx common 业务接口；返回 data 中的对象
func (p *UbusProbe) callFwx(api string, data map[string]any) (map[string]any, error) {
	p.mu.Lock()
	defer p.mu.Unlock()
	call := func() (*ubusResp, error) {
		params := []any{p.session, "fwx", "common", map[string]any{"api": api, "data": data}}
		return p.rpc(params)
	}
	r, err := call()
	if err == nil && len(r.Result) >= 1 {
		// 会话过期：result [6, {}]（UBUS_STATUS_PERMISSION_DENIED 等），重登一次
		var code int
		_ = json.Unmarshal(r.Result[0], &code)
		if code != 0 {
			if lerr := p.login(); lerr != nil {
				return nil, lerr
			}
			r, err = call()
		}
	}
	if err != nil {
		return nil, err
	}
	if len(r.Result) < 2 {
		return nil, fmt.Errorf("fwx %s 响应异常", api)
	}
	var inner struct {
		Code int            `json:"code"`
		Data map[string]any `json:"data"`
	}
	if err := json.Unmarshal(r.Result[1], &inner); err != nil {
		return nil, err
	}
	if inner.Code != 2000 {
		return nil, fmt.Errorf("fwx %s 返回 code=%d", api, inner.Code)
	}
	return inner.Data, nil
}

func (p *UbusProbe) Collect() (*metrics.DeviceSample, error) {
	dash, err := p.callFwx("get_dashboard_common", nil)
	if err != nil {
		return nil, err
	}

	s := &metrics.DeviceSample{
		ID:     p.cfg.ID,
		Name:   p.cfg.Name,
		Kind:   p.cfg.Kind,
		Status: "online",
	}

	sys, _ := dash["system_status"].(map[string]any)
	net, _ := dash["network_status"].(map[string]any)

	if sys != nil {
		if v, ok := sys["cpu"].(string); ok {
			s.CPU, _ = strconv.ParseFloat(v, 64)
		}
		total, _ := sys["total_mem"].(float64)
		used, _ := sys["used_mem"].(float64)
		if total > 0 {
			s.Mem = used / total * 100
		}
		s.UptimeS, _ = sys["uptime"].(float64)
		s.Connections = int(asFloat(sys["connections"]))
		if t, ok := sys["cpu_temp"].(float64); ok && t > 0 {
			s.Temp = t
		}
		if v, ok := sys["openwrt_version"].(string); ok {
			s.Version = v
		}
	}

	if net != nil {
		if internet, ok := net["internet"].(float64); ok {
			up := internet == 1
			s.Internet = &up
		}
		// WAN 口累计流量差分（优先 role=wan，其次指定接口名）
		ports, _ := net["port_status"].([]any)
		for _, pv := range ports {
			port, _ := pv.(map[string]any)
			role, _ := port["role"].(string)
			name, _ := port["name"].(string)
			if role != "wan" && (p.cfg.WANIface == "" || name != p.cfg.WANIface) {
				continue
			}
			rx := uint64(asFloat(port["rx_bytes"]))
			tx := uint64(asFloat(port["tx_bytes"]))
			p.applyTraffic(s, name, rx, tx)
			break
		}
	}

	// OAF 引擎状态并入版本描述（可选，失败不影响）
	if oaf, err := p.callFwx("get_oaf_status", nil); err == nil {
		ver, _ := oaf["engine_version"].(string)
		ver = strings.TrimSpace(ver)
		if ver != "" {
			if s.Version != "" {
				s.Version += " · OAF " + ver
			} else {
				s.Version = "OAF " + ver
			}
		}
	}

	return s, nil
}

func (p *UbusProbe) applyTraffic(s *metrics.DeviceSample, iface string, rx, tx uint64) {
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

func asFloat(v any) float64 {
	switch x := v.(type) {
	case float64:
		return x
	case string:
		f, _ := strconv.ParseFloat(x, 64)
		return f
	case int:
		return float64(x)
	default:
		return 0
	}
}
