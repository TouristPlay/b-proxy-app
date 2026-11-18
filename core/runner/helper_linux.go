//go:build linux

package main

import "errors"

// На Linux помощник не нужен: пакет даёт ядру права на сеть (setcap), см. caps_linux.go.
func runHelper() error       { return errors.New("на Linux помощник не нужен") }
func installHelper() error   { return errors.New("на Linux помощник не нужен") }
func uninstallHelper() error { return nil }
