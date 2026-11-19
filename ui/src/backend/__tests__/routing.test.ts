import { describe, expect, it } from "vitest";
import { decodeProfile, needsGeo, profileDns, profileRules } from "../routing";

const profile = {
  Name: "RoscomVPN",
  GlobalProxy: "true",
  RouteOrder: "block-proxy-direct",
  RemoteDNSType: "DoH",
  RemoteDNSDomain: "https://cloudflare-dns.com/dns-query",
  DomesticDNSType: "DoH",
  DomesticDNSDomain: "https://dns.yandex.ru/dns-query",
  DirectSites: ["geosite:category-ru", "example.ru"],
  DirectIp: ["geoip:ru"],
  ProxySites: ["geosite:youtube"],
  BlockSites: ["geosite:category-ads"],
};
const b64 = (s: string) => Buffer.from(s, "utf8").toString("base64");

describe("профили маршрутизации", () => {
  it("диплинк happ://routing/onadd/<base64> и JSON дают один профиль", () => {
    const a = decodeProfile("happ://routing/onadd/" + b64(JSON.stringify(profile)));
    const b = decodeProfile(JSON.stringify(profile));
    expect(a.name).toBe("RoscomVPN");
    expect(a.directSites).toEqual(b.directSites);
    expect(a.remoteDns).toBe("https://cloudflare-dns.com/dns-query");
  });

  it("мусор и пустой профиль — понятная ошибка", () => {
    expect(() => decodeProfile("не профиль")).toThrow(/не профиль/i);
    expect(() => decodeProfile(JSON.stringify({ Name: "x" }))).toThrow(/ни одного правила/);
  });

  it("правила по порядку block → proxy → direct, «через VPN» — туда же, что у провайдера", () => {
    const p = decodeProfile(JSON.stringify(profile));
    const { rules, final } = profileRules(p, { balancerTag: "auto" });
    expect(rules.map((r) => r.outboundTag ?? r.balancerTag)).toEqual(["block", "auto", "direct", "direct"]);
    expect(rules[2].domain).toEqual(["geosite:category-ru", "domain:example.ru"]);
    expect(final).toMatchObject({ balancerTag: "auto" });
  });

  it("без GlobalProxy остальное идёт напрямую", () => {
    const p = decodeProfile(JSON.stringify({ ...profile, GlobalProxy: "false" }));
    expect(profileRules(p, { outboundTag: "proxy" }).final).toMatchObject({ outboundTag: "direct" });
  });

  it("нужны ли базы geo и DNS профиля", () => {
    const p = decodeProfile(JSON.stringify(profile));
    expect(needsGeo(p)).toEqual({ geosite: true, geoip: true });
    const dns = profileDns(p)!;
    expect(dns.servers[0]).toMatchObject({ address: "https+local://dns.yandex.ru/dns-query", skipFallback: true });
    expect(dns.servers[1]).toBe("https://cloudflare-dns.com/dns-query");
  });
});
