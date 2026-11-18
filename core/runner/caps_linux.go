//go:build linux

package main

import (
	"os"
	"syscall"
	"unsafe"
)

// Без пароля: установщик (deb/rpm) даёт файлу ядра права CAP_NET_ADMIN и
// CAP_NET_RAW, и ядро запускается от пользователя. Xray создаёт TUN и маршруты
// сам, а для DNS вызывает resolvectl — дочернему процессу права не достаются,
// поэтому поднимаем их в «окружающие» (ambient): они переходят к детям.
//
// Права в Linux принадлежат потоку, а не процессу, поэтому меняем их во всех
// потоках сразу (AllThreadsSyscall; ядро собирается без cgo).

const (
	capNetAdmin       = 12
	capNetRaw         = 13
	prCapAmbient      = 47
	prCapAmbientRaise = 2
	capVersion3       = 0x20080522
)

type capHeader struct {
	version uint32
	pid     int32
}

type capData struct {
	effective, permitted, inheritable uint32
}

func raiseAmbientCaps() {
	if os.Geteuid() == 0 {
		return // запущено через pkexec — права и так есть
	}
	hdr := capHeader{version: capVersion3}
	var data [2]capData
	if _, _, e := syscall.RawSyscall(syscall.SYS_CAPGET, uintptr(unsafe.Pointer(&hdr)), uintptr(unsafe.Pointer(&data[0])), 0); e != 0 {
		return
	}
	var raise []uintptr
	for _, c := range []uint{capNetAdmin, capNetRaw} {
		if data[0].permitted&(1<<c) != 0 {
			data[0].inheritable |= 1 << c
			raise = append(raise, uintptr(c))
		}
	}
	if len(raise) == 0 {
		return
	}
	hdr.version = capVersion3
	if _, _, e := syscall.AllThreadsSyscall(syscall.SYS_CAPSET, uintptr(unsafe.Pointer(&hdr)), uintptr(unsafe.Pointer(&data[0])), 0); e != 0 {
		return
	}
	for _, c := range raise {
		_, _, _ = syscall.AllThreadsSyscall6(syscall.SYS_PRCTL, prCapAmbient, prCapAmbientRaise, c, 0, 0, 0)
	}
}
