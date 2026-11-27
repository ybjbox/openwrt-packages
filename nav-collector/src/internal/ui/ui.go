/* 插件本地配置页：仅监听局域网，展示 Cloudflare 连接状态与配置，写回 UCI 并重启服务 */
package ui

import (
	"crypto/rand"
	"crypto/subtle"
	_ "embed"
	"encoding/hex"
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

const uiSessionCookie = "nav_ui_session"

type RemoteInfo struct {
	ConfigVersion float64
	Checks        int
	LastFetchOK   bool
	LastFetchAt   time.Time
	LastError     string
}

type Server struct {
	cfg      *config.Config
	authMode string
	status   func() push.StatusSnapshot
	remote   func() RemoteInfo
	mu       sync.Mutex
	sessions map[string]time.Time
	started  time.Time
}

func Serve(cfg *config.Config, authMode string, statusFn func() push.StatusSnapshot, remoteFn func() RemoteInfo) error {
	s := &Server{
		cfg:      cfg,
		authMode: authMode,
		status:   statusFn,
		remote:   remoteFn,
		sessions: map[string]time.Time{},
		started:  time.Now(),
	}
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
			"auth_mode": s.authMode,
			"push":      s.status(),
			"remote":    s.remoteSnapshot(),
			"uptime_ms": time.Since(s.started).Milliseconds(),
		})
	})
	mux.HandleFunc("GET /api/session", func(w http.ResponseWriter, r *http.Request) {
		writeJSON(w, map[string]any{
			"authenticated": s.sessionOK(r),
			"username":      cfg.UI.Username,
			"password_set":  cfg.UI.Password != "",
			"auth_mode":     s.authMode,
		})
	})
	mux.HandleFunc("POST /api/login", func(w http.ResponseWriter, r *http.Request) {
		if cfg.UI.Password == "" {
			writeErr(w, http.StatusForbidden, "尚未设置本地登录密码：请在 LuCI 或 SSH 配置 nav.ui.username / nav.ui.password")
			return
		}
		var body struct {
			Username string `json:"username"`
			Password string `json:"password"`
		}
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			writeErr(w, http.StatusBadRequest, "请求格式错误")
			return
		}
		wantUser := cfg.UI.Username
		if wantUser == "" {
			wantUser = "admin"
		}
		if !constTimeEq(strings.TrimSpace(body.Username), wantUser) || !constTimeEq(body.Password, cfg.UI.Password) {
			writeErr(w, http.StatusUnauthorized, "账号或密码错误")
			return
		}
		sid, err := s.createSession()
		if err != nil {
			writeErr(w, http.StatusInternalServerError, "创建会话失败")
			return
		}
		http.SetCookie(w, &http.Cookie{
			Name:     uiSessionCookie,
			Value:    sid,
			Path:     "/",
			HttpOnly: true,
			SameSite: http.SameSiteLaxMode,
			MaxAge:   86400,
		})
		writeJSON(w, map[string]any{"ok": true, "username": wantUser})
	})
	mux.HandleFunc("POST /api/logout", func(w http.ResponseWriter, r *http.Request) {
		if c, err := r.Cookie(uiSessionCookie); err == nil && c.Value != "" {
			s.deleteSession(c.Value)
		}
		http.SetCookie(w, &http.Cookie{
			Name:     uiSessionCookie,
			Value:    "",
			Path:     "/",
			HttpOnly: true,
			SameSite: http.SameSiteLaxMode,
			MaxAge:   -1,
		})
		writeJSON(w, map[string]any{"ok": true})
	})
	mux.HandleFunc("GET /api/config", func(w http.ResponseWriter, r *http.Request) {
		if cfg.UI.Password == "" {
			writeErr(w, http.StatusForbidden, "尚未设置本地登录密码：请配置 nav.ui.username 与 nav.ui.password")
			return
		}
		if !s.sessionOK(r) {
			writeErr(w, http.StatusUnauthorized, "请先登录账号")
			return
		}
		writeJSON(w, map[string]any{
			"main": map[string]string{
				"push_url":          uciGet("main", "push_url"),
				"push_username":     uciGet("main", "push_username"),
				"push_password_set": boolStr(uciGet("main", "push_password") != ""),
				"source":            uciGet("main", "source"),
				"interval":          uciGet("main", "interval"),
				"checks":            uciGet("main", "checks"),
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
				"logs":       uciGet("nas", "logs"),
			},
			"thresholds": map[string]string{
				"cpu": uciGet("thresholds", "cpu"), "mem": uciGet("thresholds", "mem"),
				"disk": uciGet("thresholds", "disk"), "temp": uciGet("thresholds", "temp"),
				"conn": uciGet("thresholds", "conn"),
			},
			"ui": map[string]string{
				"listen":       uciGet("ui", "listen"),
				"username":     uciGet("ui", "username"),
				"password_set": boolStr(cfg.UI.Password != ""),
			},
		})
	})
	mux.HandleFunc("POST /api/config", func(w http.ResponseWriter, r *http.Request) {
		if cfg.UI.Password == "" {
			writeErr(w, http.StatusForbidden, "未设置本地登录密码，禁止修改配置")
			return
		}
		if !s.sessionOK(r) {
			writeErr(w, http.StatusUnauthorized, "会话已失效，请重新登录")
			return
		}
		var body map[string]map[string]string
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			writeErr(w, http.StatusBadRequest, "请求格式错误")
			return
		}
		// 仅允许白名单字段；值不允许换行（UCI 单行约束）
		allowed := map[string]map[string]bool{
			"main":       {"push_url": true, "push_username": true, "push_password": true, "source": true, "interval": true, "checks": true},
			"self":       {"id": true, "name": true, "traffic_iface": true, "fwx": true},
			"openclash":  {"enabled": true, "host": true, "api_port": true, "api_secret": true},
			"nas":        {"enabled": true, "host": true, "user": true, "key_file": true, "logs": true},
			"thresholds": {"cpu": true, "mem": true, "disk": true, "temp": true, "conn": true},
			"ui":         {"username": true, "password": true},
		}
		changed := 0
		for section, kv := range body {
			okKeys, exist := allowed[section]
			if !exist {
				writeErr(w, http.StatusBadRequest, "未知分组: "+section)
				return
			}
			for k, v := range kv {
				if !okKeys[k] {
					writeErr(w, http.StatusBadRequest, section+" 不允许修改字段: "+k)
					return
				}
				if strings.ContainsAny(v, "\n\r\x00") {
					writeErr(w, http.StatusBadRequest, "值包含非法字符")
					return
				}
				if err := exec.Command("uci", "set", fmt.Sprintf("nav.%s.%s=%s", section, k, v)).Run(); err != nil {
					writeErr(w, http.StatusInternalServerError, "uci set 失败: "+err.Error())
					return
				}
				changed++
			}
		}
		if changed > 0 {
			if err := exec.Command("uci", "commit", "nav").Run(); err != nil {
				writeErr(w, http.StatusInternalServerError, "uci commit 失败: "+err.Error())
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
	srv := &http.Server{Addr: cfg.UI.Listen, Handler: mux, ReadHeaderTimeout: 5 * time.Second}
	return srv.ListenAndServe()
}

func constTimeEq(a, b string) bool {
	if len(a) != len(b) {
		return false
	}
	return subtle.ConstantTimeCompare([]byte(a), []byte(b)) == 1
}

func (s *Server) createSession() (string, error) {
	b := make([]byte, 24)
	if _, err := rand.Read(b); err != nil {
		return "", err
	}
	sid := hex.EncodeToString(b)
	s.mu.Lock()
	now := time.Now()
	for k, exp := range s.sessions {
		if now.After(exp) {
			delete(s.sessions, k)
		}
	}
	s.sessions[sid] = now.Add(24 * time.Hour)
	s.mu.Unlock()
	return sid, nil
}

func (s *Server) deleteSession(sid string) {
	s.mu.Lock()
	delete(s.sessions, sid)
	s.mu.Unlock()
}

func (s *Server) sessionOK(r *http.Request) bool {
	if s.cfg.UI.Password == "" {
		return false
	}
	c, err := r.Cookie(uiSessionCookie)
	if err != nil || c.Value == "" {
		return false
	}
	s.mu.Lock()
	exp, ok := s.sessions[c.Value]
	if ok && time.Now().After(exp) {
		delete(s.sessions, c.Value)
		ok = false
	}
	s.mu.Unlock()
	return ok
}

func writeErr(w http.ResponseWriter, status int, msg string) {
	w.Header().Set("content-type", "application/json; charset=utf-8")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(map[string]any{"error": msg})
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
