// bproxy-core — ядро Xray для Linux и macOS. TUN требует прав администратора:
// на Linux из пакета deb/rpm у файла есть CAP_NET_ADMIN (ставит установщик) и
// ядро запускается без пароля, иначе — через pkexec; на macOS — через osascript.
//
//	bproxy-core <config.json> <state-файл> <stop-файл>
//
// В state-файл пишется «running», «error: …» или «stopped». Ядро работает,
// пока не появится stop-файл, не придёт SIGTERM или не завершится приложение.
// Собирается внутри модуля libXray: scripts/build_core.sh.
package main

import (
	"fmt"
	"os"
	"os/signal"
	"runtime"
	"syscall"
	"time"

	"github.com/xtls/libxray/xray"
)

func main() {
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
	if err := xray.RunXray(string(config)); err != nil {
		setState("error: " + err.Error())
		os.Exit(1)
	}
	setState("running")

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
				break loop
			}
		}
	}
	_ = xray.StopXray()
	_ = os.Remove(stopPath)
	setState("stopped")
}
