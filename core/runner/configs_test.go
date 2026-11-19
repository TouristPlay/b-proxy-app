package main

import (
	"os"
	"path/filepath"
	"testing"

	"github.com/xtls/libxray/xray"
)

// Конфиги, которые собирает интерфейс (ui: npm test пишет их в ui/.test-configs),
// должно принимать само ядро Xray — без запуска, только проверка.
func TestGeneratedConfigsAcceptedByXray(t *testing.T) {
	dir := os.Getenv("BPROXY_TEST_CONFIGS")
	if dir == "" {
		t.Skip("BPROXY_TEST_CONFIGS не задан — сначала npm test в ui/")
	}
	files, _ := filepath.Glob(filepath.Join(dir, "*.json"))
	if len(files) == 0 {
		t.Fatalf("в %s нет конфигов", dir)
	}
	for _, f := range files {
		raw, err := os.ReadFile(f)
		if err != nil {
			t.Fatal(err)
		}
		if err := xray.TestXray(string(raw)); err != nil {
			t.Errorf("%s: %v", filepath.Base(f), err)
		}
	}
}
