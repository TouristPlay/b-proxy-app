package main

import (
	"bufio"
	"bytes"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"io"
	"os"
	"path/filepath"
	"runtime"
	"sync"

	"github.com/xtls/libxray/xray"
)

// Помощник (служба Windows / LaunchDaemon macOS): работает с правами системы постоянно,
// а приложение просит его включить и выключить VPN — без пароля и окна UAC каждый раз.
//
// Протокол: одно соединение — одна строка JSON-запроса и одна строка ответа.
//
//	{"cmd":"start","config":"…"}  → {"ok":true} | {"ok":false,"error":"…"}
//	{"cmd":"stop"}                 → {"ok":true}
//	{"cmd":"state"}                → {"ok":true,"state":"running|stopped|error: …"}
//	{"cmd":"version"}              → {"ok":true,"version":"<sha256 файла помощника>"}
//	{"cmd":"access"}               → {"ok":true,"log":"<конец журнала соединений>"}
//	{"cmd":"access","clear":true}  → {"ok":true} — журнал соединений стёрт
//
// Подключиться может любой пользователь компьютера, поэтому конфиг чистится:
// пути журналов из него убираются (помощник не пишет файлы по чужой указке).
// Журнал соединений (включается в настройках) помощник ведёт только в своём файле
// accessLogPath(), стирает по просьбе приложения и когда он больше 4 МБ.

type helperRequest struct {
	Cmd    string `json:"cmd"`
	Config string `json:"config,omitempty"`
	Clear  bool   `json:"clear,omitempty"`
}

type helperResponse struct {
	Ok      bool   `json:"ok"`
	Error   string `json:"error,omitempty"`
	State   string `json:"state,omitempty"`
	Version string `json:"version,omitempty"`
	Log     string `json:"log,omitempty"`
}

type helper struct {
	mu    sync.Mutex
	state string
	ks    killSwitchConfig
}

func newHelper() *helper {
	markOwnSockets()
	return &helper{state: "stopped"}
}

func (h *helper) serve(conn io.ReadWriter) {
	line, err := bufio.NewReader(conn).ReadBytes('\n')
	if err != nil && len(line) == 0 {
		return
	}
	var req helperRequest
	resp := helperResponse{Ok: true}
	if err := json.Unmarshal(line, &req); err != nil {
		resp = helperResponse{Error: "неверный запрос"}
	} else {
		resp = h.handle(req)
	}
	out, _ := json.Marshal(resp)
	_, _ = conn.Write(append(out, '\n'))
}

func (h *helper) handle(req helperRequest) helperResponse {
	h.mu.Lock()
	defer h.mu.Unlock()
	switch req.Cmd {
	case "start":
		h.stopLocked()
		if info, err := os.Stat(accessLogPath()); err == nil && info.Size() > 4<<20 {
			_ = os.Remove(accessLogPath())
		}
		config, err := sanitizeConfig(req.Config)
		if err != nil {
			h.state = "error: " + err.Error()
			return helperResponse{Error: err.Error()}
		}
		ks := readKillSwitch([]byte(config))
		if err := xray.RunXray(config); err != nil {
			h.state = "error: " + err.Error()
			return helperResponse{Error: err.Error()}
		}
		if ks.enabled {
			if err := killSwitchOn(ks); err != nil {
				_ = xray.StopXray()
				h.state = "error: kill switch: " + err.Error()
				return helperResponse{Error: "kill switch: " + err.Error()}
			}
		} else {
			_ = killSwitchOff()
		}
		h.ks = ks
		h.state = "running"
		return helperResponse{Ok: true}
	case "stop":
		h.stopLocked()
		return helperResponse{Ok: true}
	case "state":
		return helperResponse{Ok: true, State: h.state}
	case "version":
		return helperResponse{Ok: true, Version: selfHash()}
	case "access":
		if req.Clear {
			_ = os.Remove(accessLogPath())
			return helperResponse{Ok: true}
		}
		return helperResponse{Ok: true, Log: tailFile(accessLogPath(), 256*1024)}
	}
	return helperResponse{Error: "неизвестная команда " + req.Cmd}
}

func (h *helper) stopLocked() {
	if h.state == "running" {
		_ = xray.StopXray()
	}
	if h.ks.enabled {
		_ = killSwitchOff()
		h.ks = killSwitchConfig{}
	}
	h.state = "stopped"
}

// sanitizeConfig убирает из конфига пути файлов журнала: помощник работает от имени системы.
func sanitizeConfig(raw string) (string, error) {
	var config map[string]any
	if err := json.Unmarshal([]byte(raw), &config); err != nil {
		return "", err
	}
	if log, ok := config["log"].(map[string]any); ok {
		delete(log, "error")
		// Журнал соединений просили — пишем его только в свой файл.
		if access, _ := log["access"].(string); access != "" && access != "none" {
			path := accessLogPath()
			_ = os.MkdirAll(filepath.Dir(path), 0o700)
			log["access"] = path
		} else {
			log["access"] = "none"
		}
	}
	out, err := json.Marshal(config)
	return string(out), err
}

// accessLogPath — файл журнала соединений помощника: в папке, куда пишет только система.
func accessLogPath() string {
	if runtime.GOOS == "windows" {
		base := os.Getenv("ProgramData")
		if base == "" {
			base = `C:\ProgramData`
		}
		return filepath.Join(base, "B-Proxy", "access.log")
	}
	return "/var/run/bproxy-access.log"
}

// tailFile — последние max байт файла, с целой строки.
func tailFile(path string, max int64) string {
	f, err := os.Open(path)
	if err != nil {
		return ""
	}
	defer f.Close()
	info, err := f.Stat()
	if err != nil {
		return ""
	}
	start := info.Size() - max
	if start < 0 {
		start = 0
	}
	if _, err := f.Seek(start, io.SeekStart); err != nil {
		return ""
	}
	buf, _ := io.ReadAll(f)
	if start > 0 {
		if i := bytes.IndexByte(buf, '\n'); i >= 0 {
			buf = buf[i+1:]
		}
	}
	return string(buf)
}

// selfHash — отпечаток файла помощника: приложение сравнивает его со своим ядром
// и переустанавливает помощника после обновления.
func selfHash() string {
	exe, err := os.Executable()
	if err != nil {
		return ""
	}
	f, err := os.Open(exe)
	if err != nil {
		return ""
	}
	defer f.Close()
	sum := sha256.New()
	_, _ = io.Copy(sum, f)
	return hex.EncodeToString(sum.Sum(nil))
}
