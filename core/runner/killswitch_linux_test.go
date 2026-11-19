//go:build linux

package main

import (
	"strings"
	"testing"
)

func TestNftRules(t *testing.T) {
	r := nftRules(killSwitchConfig{enabled: true, lan: true, tun: "bproxy0"})
	for _, want := range []string{
		`oifname "bproxy0" accept`,
		`oifname "lo" accept`,
		"meta mark 0x62707278 accept",
		"192.168.0.0/16",
		"reject with icmpx type admin-prohibited",
		// Таблица сначала удаляется — повторное включение не плодит правила.
		"delete table inet bproxy_killswitch",
	} {
		if !strings.Contains(r, want) {
			t.Errorf("нет %q в правилах:\n%s", want, r)
		}
	}
	// Без «локальной сети» адреса LAN закрыты.
	if r := nftRules(killSwitchConfig{enabled: true, tun: "bproxy0"}); strings.Contains(r, "192.168.0.0/16") {
		t.Error("локальная сеть открыта, хотя lan выключен")
	}
	// Имя туннеля по умолчанию.
	if r := nftRules(killSwitchConfig{enabled: true}); !strings.Contains(r, `oifname "bproxy0"`) {
		t.Error("нет туннеля по умолчанию")
	}
	// Отклонение — последнее правило цепочки, иначе разрешения после него не сработают.
	if i, j := strings.Index(r, "reject"), strings.LastIndex(r, "accept"); i < j {
		t.Error("reject стоит раньше разрешений")
	}
}
