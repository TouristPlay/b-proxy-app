/**
 * «Рекомендуемые VPN» — платные размещения сервисов, где можно купить подписку.
 * Список — JSON по адресу CATALOG_URL (его правит владелец B-Proxy, без выпуска приложения),
 * формат — в catalog/README.md в корне репозитория.
 *
 * По закону о рекламе (РФ) у каждой карточки есть пометка «Реклама», рекламодатель и erid.
 */

/** Адрес списка; пусто — раздел скрыт. Задаётся при сборке: VITE_CATALOG_URL. */
export const CATALOG_URL: string = import.meta.env.VITE_CATALOG_URL ?? "";

export interface CatalogItem {
  id: string;
  name: string;
  description: string;
  /** Ссылка на покупку (https). */
  url: string;
  logo?: string;
  /** «от 150 ₽/мес». */
  price?: string;
  tags?: string[];
  /** Промокод — показываем с кнопкой «Скопировать». */
  promo?: string;
  /** Короткая метка: «Выбор редакции», «Скидка 30%». */
  badge?: string;
  /** Рекламодатель (юрлицо или ИП) и токен ОРД — для пометки рекламы. */
  advertiser?: string;
  erid?: string;
  /** Чем больше, тем выше в списке. */
  weight?: number;
  /** Показывать до этой даты (YYYY-MM-DD) включительно. */
  until?: string;
}

const isHttps = (s: unknown): s is string => typeof s === "string" && /^https:\/\/\S+$/i.test(s);
const text = (s: unknown, max: number) => (typeof s === "string" ? s.trim().slice(0, max) : "");

/** Разбор и проверка: битые и просроченные карточки отбрасываем, остальные — по весу. */
export function parseCatalog(raw: string, now = new Date()): CatalogItem[] {
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    return [];
  }
  const list = Array.isArray(data) ? data : Array.isArray((data as { items?: unknown }).items) ? (data as { items: unknown[] }).items : [];
  const today = now.toISOString().slice(0, 10);
  const items: CatalogItem[] = [];
  for (const x of list as Record<string, unknown>[]) {
    if (!x || typeof x !== "object") continue;
    const name = text(x.name, 60);
    if (!name || !isHttps(x.url)) continue;
    const until = typeof x.until === "string" && /^\d{4}-\d{2}-\d{2}$/.test(x.until) ? x.until : undefined;
    if (until && until < today) continue;
    items.push({
      id: text(x.id, 60) || name,
      name,
      description: text(x.description, 280),
      url: x.url,
      logo: isHttps(x.logo) || (typeof x.logo === "string" && x.logo.startsWith("data:image/")) ? (x.logo as string) : undefined,
      price: text(x.price, 40) || undefined,
      tags: Array.isArray(x.tags) ? x.tags.map((t) => text(t, 24)).filter(Boolean).slice(0, 4) : undefined,
      promo: text(x.promo, 32) || undefined,
      badge: text(x.badge, 32) || undefined,
      advertiser: text(x.advertiser, 120) || undefined,
      erid: text(x.erid, 64) || undefined,
      weight: typeof x.weight === "number" ? x.weight : 0,
      until,
    });
  }
  return items.sort((a, b) => (b.weight ?? 0) - (a.weight ?? 0));
}
