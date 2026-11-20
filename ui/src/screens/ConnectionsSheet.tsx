import { Ban, Globe, RefreshCw, Search, ShieldCheck, Trash2, Waypoints } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { backend, useSnapshot } from "@/backend";
import { exclusionFor, siteOf, type Connection, type ConnectionRoute } from "@/backend/connections";
import { IconTile } from "@/components/bits";
import { Button } from "@/components/ui/button";
import { Sheet } from "@/components/ui/sheet";
import { Switch } from "@/components/ui/switch";
import { plural } from "@/lib/format";
import { LOCALE, t } from "@/lib/i18n";
import { cn } from "@/lib/utils";

type Filter = "all" | ConnectionRoute;

const routeView: Record<ConnectionRoute, { label: string; icon: typeof ShieldCheck; cls: string }> = {
  vpn: { label: t("Через VPN"), icon: ShieldCheck, cls: "text-amber" },
  direct: { label: t("Напрямую"), icon: Globe, cls: "text-ink-2" },
  block: { label: t("Заблокировано"), icon: Ban, cls: "text-bad" },
};

const time = (at: number) => new Date(at).toLocaleTimeString(LOCALE, { hour: "2-digit", minute: "2-digit", second: "2-digit" });

/**
 * Журнал соединений: какие сайты открываются сейчас и куда идут — через VPN, напрямую
 * или в блок. Сайт, которому VPN мешает (банк, госуслуги), одним нажатием уходит
 * в исключения «напрямую». Записи — только на этом устройстве, по умолчанию выключено.
 */
export function ConnectionsSheet({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const s = useSnapshot();
  const enabled = s.settings.connectionLog;
  const [list, setList] = useState<Connection[] | null>(null);
  const [filter, setFilter] = useState<Filter>("all");
  const [query, setQuery] = useState("");

  const load = useCallback(async () => setList(await backend.readConnections()), []);

  // Пока шторка открыта и VPN работает — обновляем раз в 3 секунды.
  useEffect(() => {
    if (!open || !enabled) return;
    void load();
    if (s.state !== "connected") return;
    const id = window.setInterval(() => void load(), 3000);
    return () => window.clearInterval(id);
  }, [open, enabled, s.state, load, s.settings.network.exclusions]);

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (list ?? []).filter((c) => (filter === "all" || c.route === filter) && (!q || c.host.includes(q) || c.ip?.includes(q)));
  }, [list, filter, query]);

  const counts = useMemo(() => {
    const n = { all: 0, vpn: 0, direct: 0, block: 0 };
    for (const c of list ?? []) {
      n.all += 1;
      n[c.route] += 1;
    }
    return n;
  }, [list]);

  return (
    <Sheet
      open={open}
      onOpenChange={onOpenChange}
      wide
      title={t("Соединения")}
      description={t("Какие сайты открываются и куда идут. Сайт, который не работает через VPN, можно пустить напрямую")}
      icon={<IconTile icon={Waypoints} tone="teal" />}
    >
      <label htmlFor="connection-log" className="glass mb-3 flex cursor-pointer items-center gap-3 rounded-[18px] px-4 py-3">
        <span className="min-w-0 flex-1">
          <span className="block font-medium">{t("Записывать соединения")}</span>
          <span className="mt-0.5 block text-[13px] leading-snug text-ink-2">
            {t("Только на этом устройстве. При выключении записи стираются")}
          </span>
        </span>
        <Switch id="connection-log" checked={enabled} onCheckedChange={(v) => void backend.updateSettings({ connectionLog: v })} />
      </label>

      {!enabled ? (
        <p className="px-1 py-6 text-center text-[15px] text-balance text-ink-2">
          {t("Включите запись и переподключитесь — здесь появятся сайты, которые открывают ваши приложения")}
        </p>
      ) : (
        <>
          <div className="mb-3 flex flex-wrap gap-1.5" role="group" aria-label={t("Показать")}>
            {(
              [
                ["all", t("Все")],
                ["vpn", t("Через VPN")],
                ["direct", t("Напрямую")],
                ["block", t("Заблокировано")],
              ] as const
            ).map(([id, label]) => (
              <button
                key={id}
                type="button"
                aria-pressed={filter === id}
                onClick={() => setFilter(id)}
                className={cn(
                  "h-9 rounded-full border px-3.5 text-[13.5px] font-medium tabular-nums transition-colors duration-[var(--dur)]",
                  filter === id ? "border-transparent bg-ink text-base" : "border-edge text-ink-2 hover:text-ink",
                )}
              >
                {label} <span className="opacity-60">{counts[id]}</span>
              </button>
            ))}
          </div>

          <div className="glass mb-3 flex h-11 items-center gap-2 rounded-2xl px-3.5">
            <Search className="size-4 shrink-0 text-ink-3" aria-hidden />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={t("Найти сайт")}
              aria-label={t("Найти сайт")}
              inputMode="url"
              autoCapitalize="off"
              autoCorrect="off"
              spellCheck={false}
              className="h-full min-w-0 flex-1 bg-transparent text-[15px] outline-none placeholder:text-ink-3"
            />
          </div>

          <div className="glass h-[46dvh] md:h-[38dvh] overflow-y-auto overscroll-contain rounded-[20px]" aria-live="off">
            {list == null ? (
              <p className="p-6 text-center text-ink-2">{t("Загружаем…")}</p>
            ) : shown.length === 0 ? (
              <p className="p-6 text-center text-[15px] text-balance text-ink-2">
                {list.length > 0
                  ? t("Ничего не нашлось. Попробуйте другой фильтр")
                  : s.state === "connected"
                    ? t("Пока пусто. Откройте любой сайт — он появится здесь. Если включили запись только что, переподключитесь")
                    : t("Подключитесь к VPN — соединения записываются, пока он включён")}
              </p>
            ) : (
              <ul className="divide-y divide-edge">
                {shown.map((c) => (
                  <ConnectionRow key={c.host} c={c} exclusions={s.settings.network.exclusions} />
                ))}
              </ul>
            )}
          </div>

          <div className="mt-3 flex flex-wrap gap-2">
            <Button size="sm" variant="glass" onClick={() => void load()}>
              <RefreshCw />
              {t("Обновить")}
            </Button>
            <Button
              size="sm"
              variant="ghost"
              disabled={!list?.length}
              onClick={async () => {
                await backend.clearConnections();
                setList([]);
              }}
            >
              <Trash2 />
              {t("Очистить")}
            </Button>
          </div>
        </>
      )}
    </Sheet>
  );
}

function ConnectionRow({ c, exclusions }: { c: Connection; exclusions: string[] }) {
  const view = routeView[c.route];
  const Icon = view.icon;
  // Своё исключение можно снять; правило провайдера или профиля — нет.
  const own = exclusionFor(c.host, exclusions);
  return (
    <li className="flex items-center gap-3 px-4 py-2.5">
      <Icon className={cn("size-[18px] shrink-0", view.cls)} aria-hidden />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[15px] font-medium" title={`${c.host}${c.ip ? ` (${c.ip})` : ""} · ${c.network.toUpperCase()} ${c.port}`}>
          {c.host}
        </span>
        <span className="block truncate text-[12.5px] text-ink-3 tabular-nums">
          <span className={view.cls}>{view.label}</span> · {time(c.last)} · {c.count}{" "}
          {plural(c.count, t("соединение"), t("соединения"), t("соединений"))}
        </span>
      </span>
      {c.route === "vpn" && !own && (
        <Button
          size="sm"
          variant="glass"
          className="shrink-0 px-3"
          aria-label={t("Пускать {0} напрямую", [siteOf(c.host)])}
          onClick={() => void backend.setDirect(c.host, true)}
        >
          {t("Напрямую")}
        </Button>
      )}
      {own && (
        <Button
          size="sm"
          variant="ghost"
          className="shrink-0 px-3"
          aria-label={t("Вернуть {0} в VPN", [own])}
          onClick={() => void backend.setDirect(c.host, false)}
        >
          {t("Через VPN")}
        </Button>
      )}
    </li>
  );
}
