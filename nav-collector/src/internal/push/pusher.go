/* 推送器：快照推送云端（退避重试 + 断网本地缓冲） */
package push

import (
	"bytes"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"time"

	"nav/collector/internal/config"
	"nav/collector/internal/metrics"
)

const maxBuffer = 60 // 断网期间最多缓存的快照数

type Pusher struct {
	cfg    config.PushConfig
	client *http.Client
	buf    [][]byte // 待重发快照（JSON）
	Status Status   // 连接状态（插件配置页展示）
}

func New(cfg config.PushConfig) *Pusher {
	return &Pusher{cfg: cfg, client: &http.Client{Timeout: cfg.Timeout}}
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
	req, err := http.NewRequest(http.MethodPost, p.cfg.URL, bytes.NewReader(body))
	if err != nil {
		return err
	}
	req.Header.Set("content-type", "application/json")
	req.Header.Set("authorization", "Bearer "+p.cfg.Token)
	resp, err := p.client.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()
	if resp.StatusCode == 401 {
		log.Println("push: 令牌无效（401），请检查 COLLECTOR_TOKEN")
	}
	if resp.StatusCode >= 300 {
		return fmt.Errorf("HTTP %d", resp.StatusCode)
	}
	return nil
}
