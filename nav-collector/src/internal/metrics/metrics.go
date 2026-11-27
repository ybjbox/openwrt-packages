/* 数据模型：与云端 /api/ingest 契约一致 */
package metrics

type DiskInfo struct {
	Mount   string  `json:"mount"`
	UsedPct float64 `json:"used_pct"`
	TotalGB float64 `json:"total_gb"`
}

type TrafficInfo struct {
	Iface   string  `json:"iface,omitempty"`
	RxBps   float64 `json:"rx_bps"`
	TxBps   float64 `json:"tx_bps"`
	RxTotal uint64  `json:"rx_total,omitempty"`
	TxTotal uint64  `json:"tx_total,omitempty"`
}

type DeviceSample struct {
	ID      string     `json:"id"`
	Name    string     `json:"name"`
	Kind    string     `json:"kind"` // router | nas | service | other
	Status  string     `json:"status"` // online | offline | degraded
	CPU     float64    `json:"cpu,omitempty"`
	Mem     float64    `json:"mem,omitempty"`
	Load1   float64    `json:"load1,omitempty"`
	Temp    float64    `json:"temp,omitempty"`
	UptimeS float64    `json:"uptime_s,omitempty"`
	Version string     `json:"version,omitempty"`   // 固件/核心版本
	Connections int    `json:"connections,omitempty"` // conntrack / Clash 连接数
	Internet *bool     `json:"internet,omitempty"`  // 路由器 WAN 连通性（nil = 未知）
	Disks   []DiskInfo `json:"disks,omitempty"`
	Traffic *TrafficInfo `json:"traffic,omitempty"`
	Spark   []float64  `json:"spark,omitempty"`
}

type ServiceStatus struct {
	Name      string `json:"name"`
	Status    string `json:"status"` // online | offline | slow
	LatencyMs int64  `json:"latency_ms,omitempty"`
	Fails     int    `json:"fails,omitempty"`
}

type Alert struct {
	ID       string `json:"id"`
	Device   string `json:"device"`
	Rule     string `json:"rule"`
	Severity string `json:"severity"` // warn | critical
	Message  string `json:"message"`
	FirstSeen int64 `json:"first_seen"` // unix ms
	LastSeen  int64 `json:"last_seen"`
}

type LogPayload struct {
	OpenWrt   []string `json:"openwrt,omitempty"`
	OpenClash []string `json:"openclash,omitempty"`
	NAS       []string `json:"nas,omitempty"`
}

type Snapshot struct {
	TS               int64           `json:"ts"` // unix ms
	Source           string          `json:"source,omitempty"` // 采集器实例标识（router/nas/…）
	Devices          []DeviceSample  `json:"devices"`
	Services         []ServiceStatus `json:"services"`
	Alerts           []Alert         `json:"alerts"`
	ResolvedAlertIDs []string        `json:"resolved_alert_ids,omitempty"`
	Logs             *LogPayload     `json:"logs,omitempty"`
}
