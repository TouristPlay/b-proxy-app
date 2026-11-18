package main

import (
	"encoding/json"
	"os"
	"path/filepath"
)

// Kill switch: пока VPN включён — и если ядро упало или приложение закрылось
// аварийно, — трафик мимо туннеля блокируется правилами файрвола системы.
// Снимаются правила только при штатном отключении (stop-файл, SIGTERM) или
// командой `bproxy-core --killswitch-off <папка>`, которую вызывает приложение.
//
// Включается переменными в env конфига (их ставит интерфейс, backend/xray.ts):
// BPROXY_KILL_SWITCH=1, BPROXY_KILL_SWITCH_LAN=1 (оставить локальную сеть), BPROXY_TUN — имя туннеля.

type killSwitchConfig struct {
	enabled bool
	lan     bool
	tun     string
}

func readKillSwitch(config []byte) killSwitchConfig {
	var c struct {
		Env map[string]string `json:"env"`
	}
	_ = json.Unmarshal(config, &c)
	return killSwitchConfig{
		enabled: c.Env["BPROXY_KILL_SWITCH"] == "1",
		lan:     c.Env["BPROXY_KILL_SWITCH_LAN"] == "1",
		tun:     c.Env["BPROXY_TUN"],
	}
}

// Метка-файл рядом с core.state: правила стоят. По ней приложение понимает,
// что после аварии интернет заблокирован и его надо открыть при отключении.
func markerPath(stateDir string) string { return filepath.Join(stateDir, "killswitch") }

func setMarker(stateDir string, on bool) {
	if on {
		_ = os.WriteFile(markerPath(stateDir), []byte("on"), 0o644)
	} else {
		_ = os.Remove(markerPath(stateDir))
	}
}
