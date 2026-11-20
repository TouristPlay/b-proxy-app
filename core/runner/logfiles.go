package main

import (
	"encoding/json"
	"os"
	"path/filepath"
)

// prepareLogFiles создаёт файлы журналов Xray заранее и отдаёт их владельцу папки.
// Ядро, запущенное через pkexec или osascript, работает от root, а Xray создаёт
// журналы с правами 0600 — без этого приложение не смогло бы их прочитать.
func prepareLogFiles(config []byte) {
	var c struct {
		Log struct {
			Error  string `json:"error"`
			Access string `json:"access"`
		} `json:"log"`
	}
	if json.Unmarshal(config, &c) != nil {
		return
	}
	for _, path := range []string{c.Log.Error, c.Log.Access} {
		if path == "" || path == "none" {
			continue
		}
		f, err := os.OpenFile(path, os.O_APPEND|os.O_WRONLY|os.O_CREATE, 0o600)
		if err != nil {
			continue
		}
		_ = f.Close()
		chownLike(path, filepath.Dir(path))
	}
}
