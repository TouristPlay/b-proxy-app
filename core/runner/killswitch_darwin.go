//go:build darwin

package main

import (
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
)

// macOS: правила pf в якоре com.apple/… (главный pf.conf их подключает).
// Ядро работает от root (osascript), его соединения пропускает «user root».
const ksAnchor = "com.apple/250.BProxyKillSwitch"

func markOwnSockets() {}

// Токен pfctl -E: pf остаётся включённым, пока токен не отдан (pfctl -X).
func tokenPath() string { return filepath.Join(os.TempDir(), "bproxy-pf-token") }

func killSwitchOn(k killSwitchConfig) error {
	tun := k.tun
	if tun == "" {
		tun = "utun199"
	}
	var b strings.Builder
	b.WriteString("pass out quick on lo0 all\n")
	fmt.Fprintf(&b, "pass out quick on %s all\n", tun)
	b.WriteString("pass out quick proto { tcp udp } from any to any user root\n")
	b.WriteString("pass out quick proto udp from any port 68 to any port 67\n")
	if k.lan {
		b.WriteString("pass out quick inet from any to { 10.0.0.0/8, 172.16.0.0/12, 192.168.0.0/16, 169.254.0.0/16, 224.0.0.0/4, 255.255.255.255 }\n")
		b.WriteString("pass out quick inet6 from any to { fe80::/10, fc00::/7, ff00::/8 }\n")
	}
	b.WriteString("block drop out quick all\n")
	cmd := exec.Command("/sbin/pfctl", "-a", ksAnchor, "-f", "-")
	cmd.Stdin = strings.NewReader(b.String())
	if out, err := cmd.CombinedOutput(); err != nil {
		return fmt.Errorf("pfctl: %v: %s", err, strings.TrimSpace(string(out)))
	}
	out, err := exec.Command("/sbin/pfctl", "-E").CombinedOutput()
	if err != nil {
		return fmt.Errorf("pfctl -E: %v", err)
	}
	for _, line := range strings.Split(string(out), "\n") {
		if strings.HasPrefix(line, "Token : ") {
			_ = os.WriteFile(tokenPath(), []byte(strings.TrimPrefix(line, "Token : ")), 0o600)
		}
	}
	return nil
}

func killSwitchOff() error {
	_ = exec.Command("/sbin/pfctl", "-a", ksAnchor, "-F", "all").Run()
	if token, err := os.ReadFile(tokenPath()); err == nil {
		_ = exec.Command("/sbin/pfctl", "-X", strings.TrimSpace(string(token))).Run()
		_ = os.Remove(tokenPath())
	}
	return nil
}
