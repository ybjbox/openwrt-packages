/* OpenWrt 系统日志（logread）与 OpenClash 运行日志采集与本地脱敏 */
package probe

import (
	"bytes"
	"context"
	"io"
	"os"
	"os/exec"
	"regexp"
	"strings"
	"time"

	"nav/collector/internal/metrics"
)

const (
	maxLogLines    = 150
	maxLineRunes   = 400
	tailReadBytes  = 64 * 1024
)

var (
	reSensitiveKV  = regexp.MustCompile(`(?i)(password|passwd|pwd|secret|token|key|auth)=([^\s&"']+)`)
	reBearerToken  = regexp.MustCompile(`(?i)(Bearer\s+)[A-Za-z0-9._\-]+`)
	reSubURL       = regexp.MustCompile(`(?i)https?://[^\s"'<>]+?\?(?:[^\s"'<>]*?(?:token|key|auth|sub|password)=)[^\s"'<>]+`)
	openclashPaths = []string{
		"/tmp/openclash.log",
		"/var/log/openclash.log",
		"/etc/openclash/openclash.log",
	}
)

func sanitizeLine(s string) string {
	s = strings.TrimSpace(strings.ReplaceAll(s, "\r", ""))
	if s == "" {
		return ""
	}
	s = reSensitiveKV.ReplaceAllString(s, "$1=***")
	s = reBearerToken.ReplaceAllString(s, "$1***")
	s = reSubURL.ReplaceAllString(s, "[已脱敏URL]")
	runes := []rune(s)
	if len(runes) > maxLineRunes {
		s = string(runes[:maxLineRunes])
	}
	return s
}

func cleanLines(raw string, limit int) []string {
	rawLines := strings.Split(raw, "\n")
	if len(rawLines) > limit*2 {
		rawLines = rawLines[len(rawLines)-limit*2:]
	}
	out := make([]string, 0, limit)
	for _, l := range rawLines {
		if cleaned := sanitizeLine(l); cleaned != "" {
			out = append(out, cleaned)
		}
	}
	if len(out) > limit {
		out = out[len(out)-limit:]
	}
	return out
}

func readTailFile(path string) string {
	f, err := os.Open(path)
	if err != nil {
		return ""
	}
	defer f.Close()
	info, err := f.Stat()
	if err == nil && info.Size() > tailReadBytes {
		_, _ = f.Seek(-tailReadBytes, io.SeekEnd)
	}
	buf, err := io.ReadAll(io.LimitReader(f, tailReadBytes))
	if err != nil {
		return ""
	}
	return string(buf)
}

func readOpenWrtLogs() []string {
	ctx, cancel := context.WithTimeout(context.Background(), 3*time.Second)
	defer cancel()
	if path, err := exec.LookPath("logread"); err == nil {
		cmd := exec.CommandContext(ctx, path, "-l", "150")
		var out bytes.Buffer
		cmd.Stdout = &out
		if err := cmd.Run(); err == nil && out.Len() > 0 {
			return cleanLines(out.String(), maxLogLines)
		}
	}
	for _, p := range []string{"/var/log/messages", "/tmp/syslog"} {
		if s := readTailFile(p); s != "" {
			return cleanLines(s, maxLogLines)
		}
	}
	return nil
}

func readOpenClashLogs() []string {
	for _, p := range openclashPaths {
		if s := readTailFile(p); s != "" {
			return cleanLines(s, maxLogLines)
		}
	}
	return nil
}

// CollectRouterLogs 采集路由器与 OpenClash 最近日志并本地脱敏；无日志时返回 nil。
func CollectRouterLogs() *metrics.LogPayload {
	ow := readOpenWrtLogs()
	oc := readOpenClashLogs()
	if len(ow) == 0 && len(oc) == 0 {
		return nil
	}
	return &metrics.LogPayload{
		OpenWrt:   ow,
		OpenClash: oc,
	}
}
