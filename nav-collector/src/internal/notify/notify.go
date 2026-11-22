/* 告警通知：Bark / Telegram / 通用 Webhook */
package notify

import (
	"bytes"
	"fmt"
	"log"
	"net/http"
	"strings"
	"time"

	"nav/collector/internal/config"
	"nav/collector/internal/metrics"
)

type Notifier struct {
	cfg  *config.AlertsConfig
	client *http.Client
}

func New(cfg *config.AlertsConfig) *Notifier {
	return &Notifier{cfg: cfg, client: &http.Client{Timeout: 10 * time.Second}}
}

// Send 触发/恢复都会调用；resolved=true 表示恢复
func (n *Notifier) Send(a metrics.Alert, resolved bool) {
	verb := "触发"
	if resolved {
		verb = "恢复"
	}
	title := fmt.Sprintf("[NAV] %s %s", a.Device, verb)
	body := a.Message

	if n.cfg.Channels.Bark.URL != "" && n.cfg.Channels.Bark.Key != "" {
		go n.postJSON(strings.TrimRight(n.cfg.Channels.Bark.URL, "/")+"/push", map[string]string{
			"device_key": n.cfg.Channels.Bark.Key,
			"title":      title,
			"body":       body,
			"group":      "nav",
		})
	}
	if n.cfg.Channels.Telegram.Token != "" && n.cfg.Channels.Telegram.ChatID != "" {
		url := fmt.Sprintf("https://api.telegram.org/bot%s/sendMessage", n.cfg.Channels.Telegram.Token)
		go n.postJSON(url, map[string]string{
			"chat_id": n.cfg.Channels.Telegram.ChatID,
			"text":    title + "\n" + body,
		})
	}
	if n.cfg.Channels.Webhook.URL != "" {
		payload := n.cfg.Channels.Webhook.Template
		if payload == "" {
			payload = `{"title":"{{title}}","message":"{{message}}","device":"{{device}}","severity":"{{severity}}"}`
		}
		r := strings.NewReplacer(
			"{{title}}", title,
			"{{message}}", body,
			"{{device}}", a.Device,
			"{{severity}}", a.Severity,
		)
		go n.postRaw(n.cfg.Channels.Webhook.URL, r.Replace(payload))
	}
}

func (n *Notifier) postJSON(url string, body map[string]string) {
	n.postRaw(url, mustJSON(body))
}

func (n *Notifier) postRaw(url, body string) {
	req, err := http.NewRequest(http.MethodPost, url, bytes.NewReader([]byte(body)))
	if err != nil {
		log.Printf("notify: 构造请求失败: %v", err)
		return
	}
	req.Header.Set("content-type", "application/json")
	resp, err := n.client.Do(req)
	if err != nil {
		log.Printf("notify: 发送失败 %s: %v", url, err)
		return
	}
	defer resp.Body.Close()
	if resp.StatusCode >= 300 {
		log.Printf("notify: %s 返回 %d", url, resp.StatusCode)
	}
}

func mustJSON(v map[string]string) string {
	var b bytes.Buffer
	b.WriteByte('{')
	first := true
	for k, val := range v {
		if !first {
			b.WriteByte(',')
		}
		first = false
		fmt.Fprintf(&b, `%q:%q`, k, val)
	}
	b.WriteByte('}')
	return b.String()
}
