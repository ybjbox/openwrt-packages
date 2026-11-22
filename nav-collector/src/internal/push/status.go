/* 推送状态追踪（供插件本地配置页展示 Cloudflare 连接状态） */
package push

import (
	"sync"
	"time"
)

type Status struct {
	mu               sync.Mutex
	LastAttemptAt    time.Time
	LastOKAt         time.Time
	LastError        string
	ConsecutiveFails int
	TotalOK          uint64
	TotalFail        uint64
}

func (s *Status) RecordOK() {
	s.mu.Lock()
	defer s.mu.Unlock()
	now := time.Now()
	s.LastAttemptAt = now
	s.LastOKAt = now
	s.LastError = ""
	s.ConsecutiveFails = 0
	s.TotalOK++
}

func (s *Status) RecordFail(errMsg string) {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.LastAttemptAt = time.Now()
	s.LastError = errMsg
	s.ConsecutiveFails++
	s.TotalFail++
}

type StatusSnapshot struct {
	Version          string `json:"version"`
	LastAttemptAt    int64  `json:"last_attempt_at,omitempty"` // unix ms
	LastOKAt         int64  `json:"last_ok_at,omitempty"`
	LastError        string `json:"last_error,omitempty"`
	ConsecutiveFails int    `json:"consecutive_fails"`
	TotalOK          uint64 `json:"total_ok"`
	TotalFail        uint64 `json:"total_fail"`
	Connected        bool   `json:"connected"` // 最近一次推送是否成功
}

func (s *Status) Snapshot(version string) StatusSnapshot {
	s.mu.Lock()
	defer s.mu.Unlock()
	return StatusSnapshot{
		Version:          version,
		LastAttemptAt:    timeToMs(s.LastAttemptAt),
		LastOKAt:         timeToMs(s.LastOKAt),
		LastError:        s.LastError,
		ConsecutiveFails: s.ConsecutiveFails,
		TotalOK:          s.TotalOK,
		TotalFail:        s.TotalFail,
		Connected:        !s.LastOKAt.IsZero() && (s.LastError == "" || s.LastOKAt.After(s.LastAttemptAt)) && s.ConsecutiveFails == 0,
	}
}

func timeToMs(t time.Time) int64 {
	if t.IsZero() {
		return 0
	}
	return t.UnixMilli()
}
