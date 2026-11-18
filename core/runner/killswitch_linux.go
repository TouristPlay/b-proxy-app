//go:build linux

package main

import (
	"fmt"
	"os/exec"
	"strings"
	"syscall"

	"github.com/xtls/xray-core/transport/internet"
)

// Своим соединениям ядро ставит метку SO_MARK — их правило пропускает мимо туннеля
// (до сервера VPN, «напрямую», DNS ядра). Всё остальное идёт только через туннель.
const ksMark = 0x62707278 // «bprx»

const ksTable = "bproxy_killswitch"

func markOwnSockets() {
	_ = internet.RegisterDialerController(func(network, address string, c syscall.RawConn) error {
		return c.Control(func(fd uintptr) {
			_ = syscall.SetsockoptInt(int(fd), syscall.SOL_SOCKET, syscall.SO_MARK, ksMark)
		})
	})
}

func killSwitchOn(k killSwitchConfig) error {
	tun := k.tun
	if tun == "" {
		tun = "bproxy0"
	}
	var b strings.Builder
	// «table; delete table; table {…}» — одна транзакция, заменяет старые правила.
	fmt.Fprintf(&b, "table inet %s\ndelete table inet %s\ntable inet %s {\n", ksTable, ksTable, ksTable)
	b.WriteString("  chain output {\n    type filter hook output priority 0; policy accept;\n")
	b.WriteString("    oifname \"lo\" accept\n")
	fmt.Fprintf(&b, "    oifname %q accept\n", tun)
	fmt.Fprintf(&b, "    meta mark 0x%x accept\n", ksMark)
	b.WriteString("    udp dport { 67, 68 } accept\n")   // DHCP — иначе сеть не продлит адрес
	b.WriteString("    meta l4proto ipv6-icmp accept\n") // соседи IPv6 (NDP)
	if k.lan {
		b.WriteString("    ip daddr { 10.0.0.0/8, 172.16.0.0/12, 192.168.0.0/16, 169.254.0.0/16, 224.0.0.0/4, 255.255.255.255 } accept\n")
		b.WriteString("    ip6 daddr { fe80::/10, fc00::/7, ff00::/8 } accept\n")
	}
	b.WriteString("    reject with icmpx type admin-prohibited\n  }\n}\n")
	return nft(b.String())
}

func killSwitchOff() error {
	return nft(fmt.Sprintf("table inet %s\ndelete table inet %s\n", ksTable, ksTable))
}

func nft(script string) error {
	cmd := exec.Command("nft", "-f", "-")
	cmd.Stdin = strings.NewReader(script)
	if out, err := cmd.CombinedOutput(); err != nil {
		if _, lookErr := exec.LookPath("nft"); lookErr != nil {
			return fmt.Errorf("для kill switch нужна программа nft (пакет nftables)")
		}
		return fmt.Errorf("nft: %v: %s", err, strings.TrimSpace(string(out)))
	}
	return nil
}
