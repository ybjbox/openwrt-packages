/* 推送器：账号密码登录换取临时令牌 + 快照推送云端（退避重试 + 断网本地缓冲） */
package push

import (
	"bytes"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"net/url"
	"sync"
	"time"

	"nav/collector/internal/config"
	"nav/collector/internal/metrics"
)

const maxBuffer = 60 // 断网期间最多缓存的快照数

type Pusher struct {
	cfg      config.PushConfig
	client   *http.Client
	buf      [][]byte // 待重发快照（JSON）
	Status   Status   // 连接状态（插件配置页展示）
	authMu   sync.Mutex
	token    string
	tokenExp time.Time
}

func New(cfg config.PushConfig) *Pusher {
	return &Pusher{cfg: cfg, client: &http.Client{Timeout: cfg.Timeout}}
}

// AuthMode 返回当前云端认证方式：account | none
func (p *Pusher) AuthMode() string {
	if p.cfg.Username != "" && p.cfg.Password != "" {
		return "account"
	}
	return "none"
}

// InvalidateToken 清空缓存的云端会话令牌（遇到 401 时触发重新登录）
func (p *Pusher) InvalidateToken() {
	p.authMu.Lock()
	p.token = ""
	p.tokenExp = time.Time{}
	p.authMu.Unlock()
}

// AuthHeader 返回可用的 Authorization 请求头；账号密码模式会自动登录并缓存临时 JWT
func (p *Pusher) AuthHeader() (string, error) {
	if p.cfg.Username != "" && p.cfg.Password != "" {
		p.authMu.Lock()
		defer p.authMu.Unlock()
		if p.token != "" && time.Now().Before(p.tokenExp.Add(-5*time.Minute)) {
			return "Bearer " + p.token, nil
		}
		if err := p.loginLocked(); err != nil {
			return "", err
		}
		return "Bearer " + p.token, nil
	}
	return "", fmt.Errorf("未配置云端推送账号密码")
}

func (p *Pusher) loginLocked() error {
	base, err := url.Parse(p.cfg.URL)
	if err != nil {
		return fmt.Errorf("push.url 无效: %w", err)
	}
	base.Path = "/api/collector/login"
	base.RawQuery = ""
	payload, _ := json.Marshal(map[string]string{
		"username": p.cfg.Username,
		"password": p.cfg.Password,
		"source":   p.cfg.Source,
	})
	req, err := http.NewRequest(http.MethodPost, base.String(), bytes.NewReader(payload))
	if err != nil {
		return err
	}
	req.Header.Set("content-type", "application/json")
	resp, err := p.client.Do(req)
	if err != nil {
		return fmt.Errorf("采集器登录请求失败: %w", err)
	}
	defer resp.Body.Close()
	var res struct {
		OK        bool   `json:"ok"`
		Token     string `json:"token"`
		ExpiresIn int64  `json:"expires_in"`
		Error     string `json:"error"`
	}
	_ = json.NewDecoder(resp.Body).Decode(&res)
	if resp.StatusCode >= 300 || res.Token == "" {
		if res.Error != "" {
			return fmt.Errorf("登录失败(%d): %s", resp.StatusCode, res.Error)
		}
		return fmt.Errorf("登录失败: HTTP %d", resp.StatusCode)
	}
	ttl := res.ExpiresIn
	if ttl <= 0 {
		ttl = 86400
	}
	p.token = res.Token
	p.tokenExp = time.Now().Add(time.Duration(ttl) * time.Second)
	return nil
}

// Send 推送一个快照；失败则入缓冲，成功后冲刷缓冲
func (p *Pusher) Send(snap *metrics.Snapshot) {
	body, err := json.Marshal(snap)
	if err != nil {
		log.Printf("push: 序列化失败: %v", err)
		return
	}
	if err := p.post(body); err != nil {
		log.Printf("push: 推送失败: %v", err)
		p.Status.RecordFail(err.Error())
		p.buf = append(p.buf, body)
		if len(p.buf) > maxBuffer {
			p.buf = p.buf[len(p.buf)-maxBuffer:]
		}
		return
	}
	p.Status.RecordOK()
	// 成功：冲刷积压（逐条，200ms 间隔避免突发）
	if len(p.buf) > 0 {
		log.Printf("push: 恢复连接，冲刷 %d 条积压快照", len(p.buf))
		for _, b := range p.buf {
			if err := p.post(b); err != nil {
				log.Printf("push: 冲刷失败，保留剩余缓冲: %v", err)
				return
			}
			time.Sleep(200 * time.Millisecond)
		}
		p.buf = nil
	}
}

func (p *Pusher) post(body []byte) error {
	for attempt := 0; attempt < 2; attempt++ {
		auth, err := p.AuthHeader()
		if err != nil {
			return err
		}
		req, err := http.NewRequest(http.MethodPost, p.cfg.URL, bytes.NewReader(body))
		if err != nil {
			return err
		}
		req.Header.Set("content-type", "application/json")
		req.Header.Set("authorization", auth)
		resp, err := p.client.Do(req)
		if err != nil {
			return err
		}
		resp.Body.Close()
		if resp.StatusCode == 401 && attempt == 0 && p.AuthMode() == "account" {
			// 令牌可能已过期或云端密码已更新：清缓存立即重登再试一次
			p.InvalidateToken()
			continue
		}
		if resp.StatusCode == 401 {
			log.Println("push: 认证失败（401），请检查云端推送账号密码")
		}
		if resp.StatusCode >= 300 {
			return fmt.Errorf("HTTP %d", resp.StatusCode)
		}
		return nil
	}
	return fmt.Errorf("推送失败")
}
