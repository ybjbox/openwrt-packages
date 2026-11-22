/* 插件本地配置页：仅监听局域网，展示 Cloudflare 连接状态与配置，写回 UCI 并重启服务 */
package ui

import (
	_ "embed"
	"encoding/json"
	"fmt"
	"net/http"
	"os/exec"
	"strings"
	"sync"
	"time"

	"nav/collector/internal/config"
	"nav/collector/internal/push"
	"nav/collector/internal/version"
)

//go:embed page.html
var pageHTML []byte

type RemoteInfo struct {
	ConfigVersion float64
	Checks        int
	LastFetchOK   bool
	LastFetchAt   time.Time
	LastError     string
}

type Server struct {
	cfg     *config.Config
	status  func() push.StatusSnapshot
	remote  func() RemoteInfo
	mu      sync.Mutex
	started time.Time
}

func Serve(listen, password string, cfg *config.Config, statusFn func() push.StatusSnapshot, remoteFn func() RemoteInfo) error {
	s := &Server{cfg: cfg, status: statusFn, remote: remoteFn, started: time.Now()}
	mux := http.NewServeMux()
	mux.HandleFunc("GET /", func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/" {
			http.NotFound(w, r)
			return
		}
		w.Header().Set("content-type", "text/html; charset=utf-8")
		w.Write(pageHTML)
	})
	mux.HandleFunc("GET /api/status", func(w http.ResponseWriter, r *http.Request) {
		writeJSON(w, map[string]any{
			"version":   version.Version,
			"source":    cfg.Push.Source,
			"interval":  int(cfg.Push.Interval.Seconds()),
			"push_url":  cfg.Push.URL,
			"push":      s.status(),
			"remote":    s.remoteSnapshot(),
			"uptime_ms": time.Since(s.started).Milliseconds(),
		})
	})
	mux.HandleFunc("GET /api/config", func(w http.ResponseWriter, r *http.Request) {
		if !s.authOK(r, password) {
			http.Error(w, "未授权", http.StatusUnauthorized)
			return
		}
		writeJSON(w, map[string]any{
			"main": map[string]string{
				"push_url":  uciGet("main", "push_url"),
				"push_token_set": boolStr(uciGet("main", "push_token") != ""),
				"source":    uciGet("main", "source"),
				"interval":  uciGet("main", "interval"),
				"checks":    uciGet("main", "checks"),
			},
			"self": map[string]string{
				"id": uciGet("self", "id"), "name": uciGet("self", "name"),
				"traffic_iface": uciGet("self", "traffic_iface"), "fwx": uciGet("self", "fwx"),
			},
			"openclash": map[string]string{
				"enabled": uciGet("openclash", "enabled"), "host": uciGet("openclash", "host"),
				"api_port": uciGet("openclash", "api_port"), "api_secret_set": boolStr(uciGet("openclash", "api_secret") != ""),
			},
			"nas": map[string]string{
				"enabled": uciGet("nas", "enabled"), "host": uciGet("nas", "host"),
				"user": uciGet("nas", "user"), "key_file": uciGet("nas", "key_file"),
				"key_exists": boolStr(fileExists(uciGet("nas", "key_file"))),
			},
			"thresholds": map[string]string{
				"cpu": uciGet("thresholds", "cpu"), "mem": uciGet("thresholds", "mem"),
				"disk": uciGet("thresholds", "disk"), "temp": uciGet("thresholds", "temp"),
				"conn": uciGet("thresholds", "conn"),
			},
			"ui": map[string]string{"listen": uciGet("ui", "listen"), "password_set": boolStr(password != "")},
		})
	})
	mux.HandleFunc("POST /api/config", func(w http.ResponseWriter, r *http.Request) {
		if password == "" {
			http.Error(w, "未设置访问密码：uci set nav.ui.password='<密码>' 后才能修改配置", http.StatusForbidden)
			return
		}
		if !s.authOK(r, password) {
			http.Error(w, "密码错误", http.StatusUnauthorized)
			return
		}
		var body map[string]map[string]string
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			http.Error(w, "请求格式错误", http.StatusBadRequest)
			return
		}
		// 仅允许白名单字段；值不允许换行（UCI 单行约束）
		allowed := map[string]map[string]bool{
			"main":       {"push_url": true, "push_token": true, "source": true, "interval": true, "checks": true},
			"self":       {"id": true, "name": true, "traffic_iface": true, "fwx": true},
			"openclash":  {"enabled": true, "host": true, "api_port": true, "api_secret": true},
			"nas":        {"enabled": true, "host": true, "user": true, "key_file": true},
			"thresholds": {"cpu": true, "mem": true, "disk": true, "temp": true, "conn": true},
			"ui":         {"password": true},
		}
		changed := 0
		for section, kv := range body {
			okKeys, exist := allowed[section]
			if !exist {
				http.Error(w, "未知分组: "+section, http.StatusBadRequest)
				return
			}
			for k, v := range kv {
				if !okKeys[k] {
					http.Error(w, section+" 不允许修改字段: "+k, http.StatusBadRequest)
					return
				}
				if strings.ContainsAny(v, "\n\r\x00") {
					http.Error(w, "值包含非法字符", http.StatusBadRequest)
					return
				}
				if err := exec.Command("uci", "set", fmt.Sprintf("nav.%s.%s=%s", section, k, v)).Run(); err != nil {
					http.Error(w, "uci set 失败: "+err.Error(), http.StatusInternalServerError)
					return
				}
				changed++
			}
		}
		if changed > 0 {
			if err := exec.Command("uci", "commit", "nav").Run(); err != nil {
				http.Error(w, "uci commit 失败: "+err.Error(), http.StatusInternalServerError)
				return
			}
		}
		writeJSON(w, map[string]any{"ok": true, "changed": changed, "restarting": changed > 0})
		// 异步重启自身（procd 拉起新配置的实例）
		if changed > 0 {
			go func() {
				time.Sleep(300 * time.Millisecond)
				_ = exec.Command("/etc/init.d/nav", "restart").Start()
			}()
		}
	})
	srv := &http.Server{Addr: listen, Handler: mux, ReadHeaderTimeout: 5 * time.Second}
	return srv.ListenAndServe()
}

func (s *Server) authOK(r *http.Request, password string) bool {
	if password == "" {
		return false
	}
	return r.Header.Get("x-ui-password") == password
}

var (
	remoteMu sync.Mutex
	remoteV  RemoteInfo
)

func (s *Server) remoteSnapshot() RemoteInfo {
	remoteMu.Lock()
	defer remoteMu.Unlock()
	return remoteV
}

// SetRemote 由主循环更新云端配置拉取状态
func SetRemote(v RemoteInfo) {
	remoteMu.Lock()
	remoteV = v
	remoteMu.Unlock()
}

func writeJSON(w http.ResponseWriter, v any) {
	w.Header().Set("content-type", "application/json; charset=utf-8")
	_ = json.NewEncoder(w).Encode(v)
}

func uciGet(section, key string) string {
	out, err := exec.Command("uci", "-q", "get", fmt.Sprintf("nav.%s.%s", section, key)).Output()
	if err != nil {
		return ""
	}
	return strings.TrimSpace(string(out))
}

func boolStr(b bool) string {
	if b {
		return "1"
	}
	return "0"
}

func fileExists(p string) bool {
	if p == "" {
		return false
	}
	// 仅判断存在性，不暴露路径内容
	out, err := exec.Command("sh", "-c", "[ -f '"+p+"' ] && echo y || echo n").Output()
	if err != nil {
		return false
	}
	return strings.TrimSpace(string(out)) == "y"
}
