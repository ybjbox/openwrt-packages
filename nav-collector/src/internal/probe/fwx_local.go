/* FanchmWrt 本机 ubus 增强（插件在路由器上运行时）：
 * 直接 shell 调用 `ubus call fwx common ...`（本地 ubus socket，无需 HTTP RPC/会话）。
 * 为 self 设备补充：conntrack 连接数、WAN 连通状态、固件与 OAF 版本。
 * 失败不影响本机 /proc 指标（非 FanchmWrt 固件关闭 fwx 开关即可）。
 */
package probe

import (
	"encoding/json"
	"fmt"
	"os"
	"os/exec"
	"strings"

	"nav/collector/internal/metrics"
)

type FwxLocalProbe struct{}

func NewFwxLocal() *FwxLocalProbe { return &FwxLocalProbe{} }

func (p *FwxLocalProbe) call(api string) (map[string]any, error) {
	cmdName := os.Getenv("NAV_UBUS_CMD")
	if cmdName == "" {
		cmdName = "ubus"
	}
	out, err := exec.Command(cmdName, "call", "fwx", "common",
		fmt.Sprintf(`{"api":"%s","data":{}}`, api)).Output()
	if err != nil {
		return nil, err
	}
	var inner struct {
		Code int            `json:"code"`
		Data map[string]any `json:"data"`
	}
	if err := json.Unmarshal(out, &inner); err != nil {
		return nil, err
	}
	if inner.Code != 2000 {
		return nil, fmt.Errorf("fwx %s code=%d", api, inner.Code)
	}
	return inner.Data, nil
}

// Enrich 为本机样本补充 FanchmWrt 信息（尽力而为，失败静默）
func (p *FwxLocalProbe) Enrich(s *metrics.DeviceSample) {
	dash, err := p.call("get_dashboard_common")
	if err != nil {
		return
	}
	sys, _ := dash["system_status"].(map[string]any)
	net, _ := dash["network_status"].(map[string]any)
	if sys != nil {
		if c := asFloat(sys["connections"]); c > 0 {
			s.Connections = int(c)
		}
		if v, ok := sys["openwrt_version"].(string); ok && v != "" {
			s.Version = v
		}
	}
	if net != nil {
		if internet, ok := net["internet"].(float64); ok {
			up := internet == 1
			s.Internet = &up
		}
	}
	if oaf, err := p.call("get_oaf_status"); err == nil {
		if ver, ok := oaf["engine_version"].(string); ok && strings.TrimSpace(ver) != "" {
			if s.Version != "" {
				s.Version += " · OAF " + strings.TrimSpace(ver)
			} else {
				s.Version = "OAF " + strings.TrimSpace(ver)
			}
		}
	}
}
