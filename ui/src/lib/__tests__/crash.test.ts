import { describe, expect, it } from "vitest";
import { scrub } from "../crash";

describe("отчёты о сбоях не уносят ссылки подписок", () => {
  it("оставляет только адрес сервера", () => {
    expect(scrub("Ошибка https://sub.example.com/api/sub/AbC123?x=1 код 500")).toBe("Ошибка https://sub.example.com/… код 500");
    expect(scrub("vless://uuid-secret@1.2.3.4:443?type=tcp#Имя")).toBe("vless://1.2.3.4:443/…");
    expect(scrub("https://a.example.com")).toBe("https://a.example.com");
    expect(scrub("без ссылок")).toBe("без ссылок");
  });
});
