import { describe, expect, it } from "vitest";
import { checkUrl, parseSubscription, tagsOf, type ConvertLinks, type Outbound } from "../subscription";

const b64 = (s: string) => Buffer.from(s, "utf8").toString("base64");

/** Заглушка libXray: каждая строка vless://…#имя — outbound с этим тегом. */
const convert: ConvertLinks = async (text) =>
  text
    .split("\n")
    .filter((l) => l.includes("://"))
    .map((l, i): Outbound => {
      const name = decodeURIComponent(l.split("#")[1] ?? `n${i}`);
      const address = /@([^:]+):/.exec(l)?.[1] ?? "1.2.3.4";
      return {
        protocol: "vless",
        tag: name,
        settings: { vnext: [{ address, port: 443 }] },
        streamSettings: { network: "grpc", security: "reality" },
      };
    });

const ok = (body: string, headers: Record<string, string> = {}) => ({ status: 200, headers, body });

describe("parseSubscription", () => {
  it("разбирает base64 со ссылками и заголовки панели", async () => {
    const body = b64("vless://id@nl.example.com:443#Нидерланды\nvless://id@de.example.com:443#Германия");
    const sub = await parseSubscription(
      "https://sub.example.com/abc",
      ok(body, {
        "profile-title": "base64:" + b64("Мой VPN"),
        "subscription-userinfo": "upload=100; download=200; total=1000; expire=1893456000",
        "support-url": "https://t.me/support",
        announce: "Привет",
      }),
      convert,
    );
    expect(sub.title).toBe("Мой VPN");
    expect(sub.nodes.map((n) => n.name)).toEqual(["Нидерланды", "Германия"]);
    expect(sub.nodes[0].tags).toEqual(["VLESS", "REALITY", "GRPC"]);
    expect(sub.usedBytes).toBe(300);
    expect(sub.totalBytes).toBe(1000);
    expect(sub.expireAt).toBe(1893456000 * 1000);
    expect(sub.supportUrl).toBe("https://t.me/support");
    expect(sub.announce).toBe("Привет");
    expect(Object.keys(sub.outbounds)).toEqual(["Нидерланды", "Германия"]);
  });

  it("берёт метаданные из строк #ключ: значение в теле", async () => {
    const body = "#profile-title: Из тела\n#hide-url: 1\nvless://id@a.example.com:443#A";
    const sub = await parseSubscription("https://x.example.com/s", ok(body), convert);
    expect(sub.title).toBe("Из тела");
    expect(sub.hideUrl).toBe(true);
    expect(sub.nodes).toHaveLength(1);
  });

  it("одинаковые названия получают разные id", async () => {
    const sub = await parseSubscription("https://x.example.com/s", ok("vless://a@a.com:1#A\nvless://b@b.com:1#A"), convert);
    expect(sub.nodes.map((n) => n.id)).toEqual(["A", "A#2"]);
  });

  it("строки-разделители не считаются серверами", async () => {
    const sub = await parseSubscription("https://x.example.com/s", ok("vless://a@0.0.0.0:1#⬇️ Обходы ⬇️\nvless://b@b.com:1#B"), convert);
    expect(sub.nodes[0].divider).toBe(true);
    expect(Object.keys(sub.outbounds)).toEqual(["B"]);
  });

  it("Xray JSON Remnawave: полный конфиг и балансировщики на сервер", async () => {
    const body = JSON.stringify([
      {
        remarks: "Auto | Все сервера",
        outbounds: [
          { tag: "proxy-1", protocol: "vless", settings: { vnext: [{ address: "a.example.com", port: 443 }] } },
          { tag: "direct", protocol: "freedom" },
        ],
        routing: { balancers: [{ tag: "auto", selector: ["proxy"] }], rules: [{ type: "field", network: "tcp,udp", balancerTag: "auto" }] },
        burstObservatory: { subjectSelector: ["proxy"] },
      },
    ]);
    const sub = await parseSubscription("https://x.example.com/s", ok(body), convert);
    expect(sub.nodes[0].name).toBe("Auto | Все сервера");
    const node = sub.outbounds["Auto | Все сервера"];
    expect(node.balancers?.[0].tag).toBe("auto");
    expect(node.burstObservatory).toBeTruthy();
  });

  it("сортировка по имени и новый адрес подписки", async () => {
    const sub = await parseSubscription(
      "https://old.example.com/s",
      ok("vless://a@a.com:1#Яблоко\nvless://b@b.com:1#Арбуз", { "sort-order": "name", "new-url": "https://new.example.com/s" }),
      convert,
    );
    expect(sub.nodes.map((n) => n.name)).toEqual(["Арбуз", "Яблоко"]);
    expect(sub.url).toBe("https://new.example.com/s");
  });

  it("фрагментация из заголовков провайдера", async () => {
    const sub = await parseSubscription(
      "https://x.example.com/s",
      ok("vless://a@a.com:1#A", { "fragmentation-enable": "true", "fragmentation-length": "50-100" }),
      convert,
    );
    expect(sub.fragment).toEqual({ packets: "tlshello", length: "50-100", interval: "10-20" });
  });

  it("понятные ошибки: лимит устройств, 404, страница вместо подписки, пусто", async () => {
    await expect(parseSubscription("https://x.example.com/s", ok("", { "x-hwid-max-devices-reached": "true" }), convert)).rejects.toThrow(/лимит устройств/);
    await expect(parseSubscription("https://x.example.com/s", { status: 404, headers: {}, body: "" }, convert)).rejects.toThrow(/не найдена/);
    await expect(parseSubscription("https://x.example.com/s", ok("<!doctype html><p>hi"), convert)).rejects.toThrow(/страница/);
    await expect(parseSubscription("https://x.example.com/s", ok("vless-нет"), async () => []), ).rejects.toThrow(/ни одного сервера/);
  });

  it("пинги переживают обновление подписки", async () => {
    const first = await parseSubscription("https://x.example.com/s", ok("vless://a@a.com:1#A"), convert);
    first.nodes[0].pingMs = 42;
    const second = await parseSubscription("https://x.example.com/s", ok("vless://a@a.com:1#A"), convert, first);
    expect(second.nodes[0].pingMs).toBe(42);
  });
});

describe("checkUrl и tagsOf", () => {
  it("ссылка должна быть http(s)", () => {
    expect(checkUrl("  https://a.example.com/s ")).toBe("https://a.example.com/s");
    expect(() => checkUrl("vless://x")).toThrow(/https/);
  });
  it("метки протокола", () => {
    expect(tagsOf({ protocol: "trojan", streamSettings: { security: "tls", network: "ws" } })).toEqual(["TROJAN", "TLS", "WS"]);
    expect(tagsOf({ protocol: "hysteria2" })).toEqual(["HYSTERIA2"]);
    expect(tagsOf({ protocol: "vless", streamSettings: { network: "splithttp" } })).toEqual(["VLESS", "XHTTP"]);
  });
});
