//go:build !windows

package main

import (
	"os"
	"syscall"
)

// chownLike — владелец файла как у папки (только когда работаем от root).
func chownLike(path, dir string) {
	if os.Geteuid() != 0 {
		return
	}
	info, err := os.Stat(dir)
	if err != nil {
		return
	}
	if st, ok := info.Sys().(*syscall.Stat_t); ok {
		_ = os.Chown(path, int(st.Uid), int(st.Gid))
	}
}
