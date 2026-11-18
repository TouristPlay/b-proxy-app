import { decodeProfile } from "./routing";
import type { PendingLink } from "./types";

/**
 * Ссылки bproxy:// — их открывают сайт провайдера, бот или браузер:
 *   bproxy://add/<ссылка на подписку>        (или bproxy://add?url=…, import/, sub/)
 *   bproxy://routing/onadd/<base64 профиля>  (как у Happ и INCY)
 *   bproxy://connect, bproxy://disconnect, bproxy://toggle
 * Подписку и профиль добавляем только после подтверждения: ссылку может открыть любой сайт.
 */
export type LinkAction = { kind: "pending"; link: PendingLink } | { kind: "connect" | "disconnect" | "toggle" } | { kind: "unknown" };

export function parseLink(raw: string): LinkAction {
  const url = raw.trim();
  const m = /^bproxy:\/\/(.*)$/i.exec(url);
  if (!m) return { kind: "unknown" };
  const rest = m[1];
  const [path, query = ""] = rest.split(/\?(.*)/s);
  const head = path.replace(/\/+$/, "").toLowerCase();
  if (["connect", "disconnect", "toggle"].includes(head)) return { kind: head as "connect" | "disconnect" | "toggle" };
  if (/^routing\/(on)?add\//i.test(path)) {
    try {
      const profile = decodeProfile(url);
      return { kind: "pending", link: { kind: "routing", input: url, name: profile.name } };
    } catch {
      return { kind: "unknown" };
    }
  }
  const add = /^(add|import|sub|install-config)\/?(.*)$/i.exec(rest);
  if (add) {
    const fromQuery = new URLSearchParams(query).get("url");
    let target = fromQuery ?? add[2];
    try {
      target = decodeURIComponent(target);
    } catch {
      // Уже раскодирована.
    }
    // bproxy://add/https//… — некоторые мессенджеры съедают двоеточие.
    target = target.replace(/^(https?)\/\//i, "$1://");
    if (/^https?:\/\/\S+$/i.test(target)) return { kind: "pending", link: { kind: "subscription", url: target } };
  }
  return { kind: "unknown" };
}
