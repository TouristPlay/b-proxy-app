//go:build darwin

package main

import (
	"fmt"
	"io"
	"net"
	"os"
	"os/exec"
	"path/filepath"
)

const (
	helperLabel  = "com.baobabproxy.bproxy.helper"
	helperBinary = "/Library/PrivilegedHelperTools/" + helperLabel
	helperPlist  = "/Library/LaunchDaemons/" + helperLabel + ".plist"
	helperSocket = "/var/run/bproxy-helper.sock"
)

// runHelper — режим LaunchDaemon: слушает unix-сокет до остановки launchd.
func runHelper() error {
	_ = os.Remove(helperSocket)
	ln, err := net.Listen("unix", helperSocket)
	if err != nil {
		return err
	}
	// Подключаться может обычный пользователь — приложение работает без прав администратора.
	_ = os.Chmod(helperSocket, 0o666)
	h := newHelper()
	for {
		conn, err := ln.Accept()
		if err != nil {
			continue
		}
		go func(c net.Conn) {
			defer c.Close()
			h.serve(c)
		}(conn)
	}
}

// installHelper запускается один раз от root (через osascript): копирует себя
// в /Library/PrivilegedHelperTools и регистрирует LaunchDaemon.
func installHelper() error {
	exe, err := os.Executable()
	if err != nil {
		return err
	}
	_ = exec.Command("/bin/launchctl", "bootout", "system/"+helperLabel).Run()
	if err := os.MkdirAll(filepath.Dir(helperBinary), 0o755); err != nil {
		return err
	}
	if err := copyFile(exe, helperBinary, 0o755); err != nil {
		return err
	}
	plist := fmt.Sprintf(`<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>%s</string>
  <key>ProgramArguments</key><array><string>%s</string><string>--helper</string></array>
  <key>RunAtLoad</key><true/>
  <key>KeepAlive</key><true/>
</dict>
</plist>
`, helperLabel, helperBinary)
	if err := os.WriteFile(helperPlist, []byte(plist), 0o644); err != nil {
		return err
	}
	if out, err := exec.Command("/bin/launchctl", "bootstrap", "system", helperPlist).CombinedOutput(); err != nil {
		return fmt.Errorf("launchctl: %v: %s", err, out)
	}
	return nil
}

func uninstallHelper() error {
	_ = exec.Command("/bin/launchctl", "bootout", "system/"+helperLabel).Run()
	_ = os.Remove(helperPlist)
	_ = os.Remove(helperBinary)
	_ = os.Remove(helperSocket)
	return nil
}

func copyFile(src, dst string, mode os.FileMode) error {
	in, err := os.Open(src)
	if err != nil {
		return err
	}
	defer in.Close()
	tmp := dst + ".new"
	out, err := os.OpenFile(tmp, os.O_CREATE|os.O_WRONLY|os.O_TRUNC, mode)
	if err != nil {
		return err
	}
	if _, err := io.Copy(out, in); err != nil {
		out.Close()
		return err
	}
	if err := out.Close(); err != nil {
		return err
	}
	return os.Rename(tmp, dst)
}
