import { describe, expect, it } from "vitest";
import { defaultSettings } from "../demo";
import type { Settings } from "../types";
import { buildConfig, dnsServers, exclusionRules, type Platform } from "../xray";
import type { NodeConfig } from "../subscription";

const node: NodeConfig = {
  outbounds: [
    {
      tag: "proxy",
      protocol: "vless",
      settings: { vnext: [{ address: "nl.example.com", port: 443, users: [{ id: "00000000-0000-0000-0000-000000000000", encryption: "none", flow: "xtls-rprx-vision" }] }] },
      streamSettings: {
        network: "tcp",
        security: "reality",
        realitySettings: { serverName: "www.example.com", fingerprint: "chrome", publicKey: "Z84J2IelR9ch3k8VtlVhhs5ycBUlXA7wHBWcBrjqnAw", shortId: "6ba85179e30d4fc2" },
      },
    },
  ],
};

type Config = {
  env?: Record<string, string>;
  inbounds: { tag: string; protocol: string; listen?: string; port?: number; settings?: Record<string, unknown> }[];
  outbounds: { tag: string; protocol: string }[];
  routing: { rules: Record<string, unknown>[] };
};

const build = (platform: Platform, patch: Partial<Settings> = {}, probePort?: number) =>
  JSON.parse(buildConfig(node, { ...defaultSettings, ...patch }, platform, null, null, null, probePort)) as Config;

describe("конфиг Xray", () => {
  it("на каждой платформе есть TUN, сервер и выход напрямую", () => {
    for (const p of ["linux", "windows", "macos", "android", "ios"] as Platform[]) {
      const c = build(p);
      expect(c.inbounds[0]).toMatchObject({ tag: "tun-in", protocol: "tun" });
      expect(c.outbounds.map((o) => o.tag)).toEqual(expect.arrayContaining(["proxy", "direct"]));
      // DNS из туннеля — первым правилом, до правил пользователя.
      expect(c.routing.rules.find((r) => r.port === "53")).toMatchObject({ outboundTag: "dns-out" });
    }
  });

  it("журнал соединений — только если включён и есть файл", () => {
    const log = (patch: Partial<Settings>, file: string | null) =>
      (JSON.parse(buildConfig(node, { ...defaultSettings, ...patch }, "linux", null, null, null, null, file)) as { log: Record<string, unknown> }).log;
    expect(log({}, "/tmp/access.log")).toMatchObject({ access: "none" });
    expect(log({ connectionLog: true }, null)).toMatchObject({ access: "none" });
    expect(log({ connectionLog: true }, "/tmp/access.log")).toMatchObject({ access: "/tmp/access.log", dnsLog: true });
  });

  it("лимит памяти ядра только на телефонах", () => {
    expect(build("ios").env?.BPROXY_MEMORY_LIMIT_MB).toBeDefined();
    expect(build("linux").env?.BPROXY_MEMORY_LIMIT_MB).toBeUndefined();
  });

  describe("kill switch", () => {
    it("Linux и macOS — переменные для ядра", () => {
      const c = build("linux", { killSwitch: true });
      expect(c.env).toMatchObject({ BPROXY_KILL_SWITCH: "1", BPROXY_TUN: "bproxy0" });
      expect(build("macos", { killSwitch: true }).env?.BPROXY_TUN).toBe("utun199");
      expect(build("linux").env?.BPROXY_KILL_SWITCH).toBeUndefined();
    });

    it("Windows — фильтры WFP на весь трафик", () => {
      const tun = (p: Partial<Settings>) => build("windows", p).inbounds[0].settings as Record<string, unknown>;
      expect(tun({ killSwitch: true, network: { ...defaultSettings.network, lanDirect: false } }).autoSystemWfpBlockLeak).toEqual(["all"]);
      expect(tun({ killSwitch: true, network: { ...defaultSettings.network, lanDirect: true } }).autoSystemWfpBlockLeak).toEqual(["allexceptlan"]);
      expect(tun({ killSwitch: false }).autoSystemWfpBlockLeak).toEqual(["dns", "misconfigtun"]);
    });
  });

  describe("VPN по приложениям", () => {
    it("компьютер: «кроме выбранных» — программы напрямую", () => {
      const c = build("linux", { perApp: { mode: "except", apps: ["steam"] } });
      expect(c.routing.rules).toContainEqual({ type: "field", inboundTag: ["tun-in"], process: ["steam"], outboundTag: "direct" });
    });

    it("компьютер: «только выбранные» — они через сервер, остальное напрямую", () => {
      const rules = build("windows", { perApp: { mode: "only", apps: ["Telegram"] } }).routing.rules;
      const i = rules.findIndex((r) => Array.isArray(r.process));
      expect(rules[i]).toMatchObject({ process: ["Telegram"], outboundTag: "proxy" });
      expect(rules[i + 1]).toMatchObject({ inboundTag: ["tun-in"], network: "tcp,udp", outboundTag: "direct" });
    });

    it("Android — списком в env, без правил Xray; пустой список не включает режим", () => {
      const c = build("android", { perApp: { mode: "only", apps: ["org.telegram.messenger", "com.android.chrome"] } });
      expect(c.env).toMatchObject({ BPROXY_APPS_MODE: "only", BPROXY_APPS: "org.telegram.messenger,com.android.chrome" });
      expect(c.routing.rules.some((r) => "process" in r)).toBe(false);
      expect(build("linux", { perApp: { mode: "only", apps: [] } }).routing.rules.some((r) => "process" in r)).toBe(false);
    });
  });

  it("служебный вход проверки скорости — только 127.0.0.1 и всегда через сервер", () => {
    const c = build("linux", {}, 23456);
    expect(c.inbounds.find((i) => i.tag === "probe-in")).toMatchObject({ listen: "127.0.0.1", port: 23456, protocol: "socks" });
    expect(c.routing.rules[0]).toMatchObject({ inboundTag: ["probe-in"], outboundTag: "proxy" });
    expect(build("linux").inbounds.some((i) => i.tag === "probe-in")).toBe(false);
  });

  it("DNS и исключения из настроек", () => {
    expect(dnsServers("1.1.1.1, https://dns.google/dns-query")).toEqual(["1.1.1.1", "https://dns.google/dns-query"]);
    const rules = exclusionRules(["example.com", "10.0.0.0/8"]);
    expect(JSON.stringify(rules)).toContain("example.com");
    expect(JSON.stringify(rules)).toContain("10.0.0.0/8");
  });
});

// Набор конфигов для проверки самим ядром: scripts/build_core.sh test (Go, xray.TestXray).
describe("конфиги для проверки ядром", () => {
  it("записываются в ui/.test-configs", async () => {
    const fs = await import("node:fs");
    const path = await import("node:path");
    const dir = path.resolve(__dirname, "../../../.test-configs");
    fs.rmSync(dir, { recursive: true, force: true });
    fs.mkdirSync(dir, { recursive: true });
    const cases: [string, Platform, Partial<Settings>, number?][] = [
      ["linux", "linux", {}],
      ["windows", "windows", {}],
      ["macos", "macos", {}],
      ["android", "android", {}],
      ["ios", "ios", {}],
      ["linux-killswitch", "linux", { killSwitch: true }],
      ["windows-killswitch", "windows", { killSwitch: true }],
      ["linux-apps-only", "linux", { perApp: { mode: "only", apps: ["firefox"] } }],
      ["windows-apps-except", "windows", { perApp: { mode: "except", apps: ["steam"] } }],
      ["linux-probe", "linux", {}, 23456],
      ["linux-mux-fragment", "linux", { tlsFragment: true, core: { ...defaultSettings.core, mux: true } }],
    ];
    for (const [name, platform, patch, probe] of cases) {
      fs.writeFileSync(path.join(dir, `${name}.json`), buildConfig(node, { ...defaultSettings, ...patch }, platform, null, null, null, probe));
    }
    expect(fs.readdirSync(dir)).toHaveLength(cases.length);
  });
});
