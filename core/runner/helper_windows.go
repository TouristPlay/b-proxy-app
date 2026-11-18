//go:build windows

package main

import (
	"errors"
	"fmt"
	"os"
	"time"
	"unsafe"

	"golang.org/x/sys/windows"
	"golang.org/x/sys/windows/svc"
	"golang.org/x/sys/windows/svc/mgr"
)

const (
	serviceName = "BProxyHelper"
	pipeName    = `\\.\pipe\bproxy-helper`
	// Система и администраторы — полный доступ, вошедшие в систему пользователи — чтение и запись.
	pipeSDDL = "D:P(A;;GA;;;SY)(A;;GA;;;BA)(A;;GRGW;;;IU)"
)

// runHelper — режим службы Windows: принимает команды по именованному каналу.
func runHelper() error {
	isService, err := svc.IsWindowsService()
	if err != nil {
		return err
	}
	if !isService {
		return serveHelperPipe(newHelper(), nil)
	}
	return svc.Run(serviceName, &helperService{})
}

type helperService struct{}

func (s *helperService) Execute(_ []string, requests <-chan svc.ChangeRequest, status chan<- svc.Status) (bool, uint32) {
	status <- svc.Status{State: svc.StartPending}
	h := newHelper()
	stop := make(chan struct{})
	go func() { _ = serveHelperPipe(h, stop) }()
	status <- svc.Status{State: svc.Running, Accepts: svc.AcceptStop | svc.AcceptShutdown}
	for req := range requests {
		switch req.Cmd {
		case svc.Interrogate:
			status <- req.CurrentStatus
		case svc.Stop, svc.Shutdown:
			status <- svc.Status{State: svc.StopPending}
			h.handle(helperRequest{Cmd: "stop"})
			close(stop)
			return false, 0
		}
	}
	return false, 0
}

func serveHelperPipe(h *helper, stop <-chan struct{}) error {
	sd, err := windows.SecurityDescriptorFromString(pipeSDDL)
	if err != nil {
		return err
	}
	sa := &windows.SecurityAttributes{Length: uint32(unsafe.Sizeof(windows.SecurityAttributes{})), SecurityDescriptor: sd}
	name, _ := windows.UTF16PtrFromString(pipeName)
	for {
		select {
		case <-stop:
			return nil
		default:
		}
		handle, err := windows.CreateNamedPipe(name,
			windows.PIPE_ACCESS_DUPLEX,
			windows.PIPE_TYPE_BYTE|windows.PIPE_READMODE_BYTE|windows.PIPE_WAIT|windows.PIPE_REJECT_REMOTE_CLIENTS,
			windows.PIPE_UNLIMITED_INSTANCES, 64*1024, 64*1024, 0, sa)
		if err != nil {
			time.Sleep(time.Second)
			continue
		}
		if err := windows.ConnectNamedPipe(handle, nil); err != nil && !errors.Is(err, windows.ERROR_PIPE_CONNECTED) {
			windows.CloseHandle(handle)
			continue
		}
		go func(hd windows.Handle) {
			f := os.NewFile(uintptr(hd), pipeName)
			defer f.Close()
			h.serve(f)
			_ = windows.FlushFileBuffers(hd)
			_ = windows.DisconnectNamedPipe(hd)
		}(handle)
	}
}

// installHelper ставит службу (запускает установщик NSIS с правами администратора).
func installHelper() error {
	exe, err := os.Executable()
	if err != nil {
		return err
	}
	m, err := mgr.Connect()
	if err != nil {
		return err
	}
	defer m.Disconnect()
	if old, err := m.OpenService(serviceName); err == nil {
		_, _ = old.Control(svc.Stop)
		time.Sleep(time.Second)
		_ = old.Delete()
		old.Close()
		time.Sleep(time.Second)
	}
	s, err := m.CreateService(serviceName, exe, mgr.Config{
		DisplayName:      "B-Proxy Helper",
		Description:      "Включает VPN B-Proxy без запроса прав администратора",
		StartType:        mgr.StartAutomatic,
		ServiceStartName: "LocalSystem",
	}, "--helper")
	if err != nil {
		return fmt.Errorf("создание службы: %w", err)
	}
	defer s.Close()
	return s.Start()
}

func uninstallHelper() error {
	m, err := mgr.Connect()
	if err != nil {
		return err
	}
	defer m.Disconnect()
	s, err := m.OpenService(serviceName)
	if err != nil {
		return nil
	}
	defer s.Close()
	_, _ = s.Control(svc.Stop)
	time.Sleep(time.Second)
	return s.Delete()
}
