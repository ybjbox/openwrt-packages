//go:build !linux

/* 本机探针：非 Linux 平台的占位实现（开发机验证用） */
package probe

import (
	"nav/collector/internal/config"
	"nav/collector/internal/metrics"
)

type LocalProbe struct{ cfg config.SelfConfig }

func NewLocal(cfg config.SelfConfig) *LocalProbe { return &LocalProbe{cfg: cfg} }

func (p *LocalProbe) Collect() *metrics.DeviceSample {
	return &metrics.DeviceSample{
		ID:     p.cfg.ID,
		Name:   p.cfg.Name,
		Kind:   p.cfg.Kind,
		Status: "online",
	}
}
