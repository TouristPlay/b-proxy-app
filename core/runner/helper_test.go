package main

import (
	"encoding/json"
	"strings"
	"testing"
)

func TestSanitizeConfigDropsLogPaths(t *testing.T) {
	out, err := sanitizeConfig(`{"log":{"loglevel":"warning","error":"/etc/passwd","access":"/root/x"},"inbounds":[]}`)
	if err != nil {
		t.Fatal(err)
	}
	var c struct {
		Log map[string]any `json:"log"`
	}
	_ = json.Unmarshal([]byte(out), &c)
	if _, ok := c.Log["error"]; ok {
		t.Error("путь журнала ошибок остался в конфиге помощника")
	}
	if c.Log["access"] != "none" || c.Log["loglevel"] != "warning" {
		t.Errorf("журнал: %v", c.Log)
	}
	if _, err := sanitizeConfig("не json"); err == nil {
		t.Error("ожидали ошибку на неверном JSON")
	}
}

func TestReadKillSwitch(t *testing.T) {
	k := readKillSwitch([]byte(`{"env":{"BPROXY_KILL_SWITCH":"1","BPROXY_KILL_SWITCH_LAN":"1","BPROXY_TUN":"utun199"}}`))
	if !k.enabled || !k.lan || k.tun != "utun199" {
		t.Errorf("%+v", k)
	}
	if readKillSwitch([]byte(`{}`)).enabled {
		t.Error("kill switch включился без переменной")
	}
}

func TestHelperRejectsUnknownCommand(t *testing.T) {
	h := &helper{state: "stopped"}
	if r := h.handle(helperRequest{Cmd: "rm -rf"}); r.Ok || !strings.Contains(r.Error, "неизвестная команда") {
		t.Errorf("%+v", r)
	}
	if r := h.handle(helperRequest{Cmd: "state"}); !r.Ok || r.State != "stopped" {
		t.Errorf("%+v", r)
	}
}
