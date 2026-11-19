import { describe, expect, it } from "vitest";
import { parseLink } from "../links";

describe("ссылки bproxy://", () => {
  it("добавление подписки в разных записях", () => {
    for (const raw of [
      "bproxy://add/https://sub.example.com/a",
      "bproxy://add?url=https%3A%2F%2Fsub.example.com%2Fa",
      "bproxy://import/https%3A%2F%2Fsub.example.com%2Fa",
      "bproxy://sub/https//sub.example.com/a",
    ]) {
      expect(parseLink(raw)).toEqual({ kind: "pending", link: { kind: "subscription", url: "https://sub.example.com/a" } });
    }
  });

  it("управление VPN", () => {
    expect(parseLink("bproxy://connect").kind).toBe("connect");
    expect(parseLink("bproxy://disconnect/").kind).toBe("disconnect");
    expect(parseLink("BPROXY://toggle").kind).toBe("toggle");
  });

  it("профиль маршрутизации и неизвестное", () => {
    const b64 = Buffer.from(JSON.stringify({ Name: "P", ProxySites: ["geosite:youtube"] })).toString("base64");
    expect(parseLink(`bproxy://routing/onadd/${b64}`)).toMatchObject({ kind: "pending", link: { kind: "routing", name: "P" } });
    expect(parseLink("bproxy://add/javascript:alert(1)").kind).toBe("unknown");
    expect(parseLink("https://example.com").kind).toBe("unknown");
  });
});
