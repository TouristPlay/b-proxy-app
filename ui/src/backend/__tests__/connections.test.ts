import { describe, expect, it } from "vitest";
import { exclusionFor, parseAccessLog, siteOf } from "../connections";

const log = [
  "2026/11/20 10:00:00.100000 localhost got answer: www.youtube.com. -> [142.250.1.1, 142.250.1.2] 12ms",
  "2026/11/20 10:00:00.200000 from 172.19.0.1:50000 accepted tcp:142.250.1.1:443 [tun-in >> proxy]",
  "2026/11/20 10:00:01.000000 from 172.19.0.1:50001 accepted udp:142.250.1.2:443 [tun-in -> auto]",
  "2026/11/20 10:00:02.000000 from 172.19.0.1:50002 accepted tcp:sberbank.ru:443 [tun-in >> direct]",
  "2026/11/20 10:00:03.000000 from 172.19.0.1:50003 accepted udp:172.19.0.2:53 [tun-in >> dns-out]",
  "2026/11/20 10:00:04.000000 from 172.19.0.1:50004 accepted tcp:203.0.113.7:8443 [tun-in >> block]",
  "2026/11/20 10:00:05.000000 from 172.19.0.1:50005 rejected tcp:198.51.100.1:443 something",
  "мусор без даты",
].join("\n");

describe("журнал соединений", () => {
  const list = parseAccessLog(log);

  it("находит имя сайта по ответу DNS и считает соединения", () => {
    const yt = list.find((c) => c.host === "www.youtube.com")!;
    expect(yt.count).toBe(2);
    expect(yt.ip).toBe("142.250.1.2");
    expect(yt.route).toBe("vpn");
    expect(yt.outbound).toBe("auto");
    expect(yt.network).toBe("udp");
  });

  it("различает напрямую и блокировку, пропускает DNS и отказы", () => {
    expect(list.find((c) => c.host === "sberbank.ru")?.route).toBe("direct");
    expect(list.find((c) => c.host === "203.0.113.7")?.route).toBe("block");
    expect(list.some((c) => c.host === "172.19.0.2")).toBe(false);
    expect(list.some((c) => c.host === "198.51.100.1")).toBe(false);
  });

  it("последние сверху", () => {
    expect(list.map((c) => c.host)).toEqual(["203.0.113.7", "sberbank.ru", "www.youtube.com"]);
  });
});

describe("исключения", () => {
  it("сайт целиком", () => {
    expect(siteOf("rr3---sn-abc.googlevideo.com")).toBe("googlevideo.com");
    expect(siteOf("www.bbc.co.uk")).toBe("bbc.co.uk");
    expect(siteOf("example.com")).toBe("example.com");
    expect(siteOf("142.250.1.1")).toBe("142.250.1.1");
  });

  it("находит запись в исключениях", () => {
    const list = ["# свои", "domain:youtube.com", "full:api.example.com", "10.0.0.0/8", "203.0.113.7"];
    expect(exclusionFor("www.youtube.com", list)).toBe("domain:youtube.com");
    expect(exclusionFor("api.example.com", list)).toBe("full:api.example.com");
    expect(exclusionFor("cdn.example.com", list)).toBeNull();
    expect(exclusionFor("203.0.113.7", list)).toBe("203.0.113.7");
    expect(exclusionFor("notyoutube.com", list)).toBeNull();
  });
});
