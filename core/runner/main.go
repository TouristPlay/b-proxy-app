// bproxy-core — ядро Xray для Linux и macOS. TUN требует прав администратора:
// на Linux из пакета deb/rpm у файла есть CAP_NET_ADMIN (ставит установщик) и
// ядро запускается без пароля, иначе — через pkexec; на macOS — через osascript.
//
//	bproxy-core <config.json> <state-файл> <stop-файл>
//	bproxy-core --killswitch-off <папка с core.state>   — снять kill switch после аварии
//	bproxy-core --helper | --install-helper | --uninstall-helper
//	    помощник с правами системы (служба Windows, LaunchDaemon macOS), см. helper.go
//
// В state-файл пишется «running», «error: …» или «stopped». Ядро работает,
// пока не появится stop-файл, не придёт SIGTERM или не завершится приложение.
// Собирается внутри модуля libXray: scripts/build_core.sh.
package main

import (
	"fmt"
	"os"
	"os/signal"
	"path/filepath"
	"runtime"
	"syscall"
	"time"

	"github.com/xtls/libxray/xray"
)

func main() {
	if len(os.Args) == 2 {
		var err error
		switch os.Args[1] {
		case "--helper":
			err = runHelper()
		case "--install-helper":
			err = installHelper()
		case "--uninstall-helper":
			err = uninstallHelper()
		default:
			err = fmt.Errorf("неизвестный ключ %s", os.Args[1])
		}
		if err != nil {
			fmt.Fprintln(os.Stderr, err)
			os.Exit(1)
		}
		return
	}
	if len(os.Args) == 3 && os.Args[1] == "--killswitch-off" {
		raiseAmbientCaps()
		if err := killSwitchOff(); err != nil {
			fmt.Fprintln(os.Stderr, err)
		}
		setMarker(os.Args[2], false)
		return
	}
	if len(os.Args) != 4 {
		fmt.Fprintln(os.Stderr, "использование: bproxy-core <config.json> <state> <stop>")
		os.Exit(2)
	}
	configPath, statePath, stopPath := os.Args[1], os.Args[2], os.Args[3]

	setState := func(s string) {
		_ = os.WriteFile(statePath, []byte(s), 0o644)
	}

	// Приложение удаляет stop-файл перед запуском. Если он есть — подключение
	// отменили, пока система спрашивала пароль: не запускаемся.
	if _, err := os.Stat(stopPath); err == nil {
		_ = os.Remove(stopPath)
		setState("stopped")
		return
	}

	raiseAmbientCaps()

	config, err := os.ReadFile(configPath)
	if err != nil {
		setState("error: " + err.Error())
		os.Exit(1)
	}
	stateDir := filepath.Dir(statePath)
	ks := readKillSwitch(config)
	if ks.enabled {
		markOwnSockets()
	}
	prepareLogFiles(config)
	if err := xray.RunXray(string(config)); err != nil {
		setState("error: " + err.Error())
		os.Exit(1)
	}
	// Правила — после запуска: туннель уже есть, иначе заблокировали бы и запуск.
	if ks.enabled {
		if err := killSwitchOn(ks); err != nil {
			_ = xray.StopXray()
			setState("error: kill switch: " + err.Error())
			os.Exit(1)
		}
		setMarker(stateDir, true)
	} else if _, err := os.Stat(markerPath(stateDir)); err == nil {
		// Остались правила с аварийного сеанса, а kill switch уже выключен.
		_ = killSwitchOff()
		setMarker(stateDir, false)
	}
	setState("running")

	// Штатное отключение снимает kill switch; если не стало приложения — правила остаются.
	keepBlock := false
	signals := make(chan os.Signal, 1)
	signal.Notify(signals, os.Interrupt, syscall.SIGTERM, syscall.SIGHUP)
	ticker := time.NewTicker(300 * time.Millisecond)
	defer ticker.Stop()
	parent := os.Getppid()

loop:
	for {
		select {
		case <-signals:
			break loop
		case <-ticker.C:
			if _, err := os.Stat(stopPath); err == nil {
				break loop
			}
			// pkexec заменяет себя ядром, поэтому на Linux родитель — само приложение
			// (и при запуске без пароля тоже).
			// Если его не стало (упало, убили), выключаем VPN.
			if runtime.GOOS == "linux" && os.Getppid() != parent {
				keepBlock = ks.enabled
				break loop
			}
		}
	}
	_ = xray.StopXray()
	if ks.enabled && !keepBlock {
		_ = killSwitchOff()
		setMarker(stateDir, false)
	}
	_ = os.Remove(stopPath)
	if keepBlock {
		setState("error: приложение закрылось, kill switch держит интернет закрытым")
		return
	}
	setState("stopped")
}
