import { Entrance, useEntrance } from "@/lib/motion";
import { Check, ChevronDown, Gauge, Megaphone, RefreshCw, Search, Star, X, Zap } from "lucide-react";
import { useMemo, useState } from "react";
import { backend, nodeKey, useSnapshot, type Subscription } from "@/backend";
import { Flag, SignalPing, Tags } from "@/components/bits";
import { Switch } from "@/components/ui/switch";
import { daysLeft, formatBytes, formatDate, plural, splitFlag } from "@/lib/format";
import { cn } from "@/lib/utils";

/**
 * Список серверов: поиск, «Все / Избранные», автовыбор и группы по подпискам.
 * На телефоне — отдельный экран, на компьютере — левая панель.
 */
export function ServerList({ compact, onPicked }: { compact?: boolean; onPicked?: () => void }) {
  const s = useSnapshot();
  const [query, setQuery] = useState("");
  const [onlyFav, setOnlyFav] = useState(false);
  const [collapsed, setCollapsed] = useState<string[]>([]);
  const auto = s.selected == null;
  const total = s.subscriptions.reduce((n, x) => n + x.nodes.filter((v) => !v.divider).length, 0);

  const groups = useMemo(() => {
    const q = query.trim().toLowerCase();
    return s.subscriptions.map((sub) => ({
      sub,
      nodes: sub.nodes.filter((n) =>
        // Разделители показываем, только когда список не отфильтрован.
        n.divider
          ? !q && !onlyFav
          : (!q || n.name.toLowerCase().includes(q) || n.tags.some((t) => t.toLowerCase().includes(q))) &&
            (!onlyFav || s.favorites.includes(nodeKey(sub.url, n.id))),
      ),
    }));
  }, [s.subscriptions, s.favorites, query, onlyFav]);

  return (
    <div className="flex flex-col gap-3">
      <label className="glass flex h-12 items-center gap-3 rounded-2xl pr-1 pl-4 focus-within:border-amber/60 focus-within:ring-2 focus-within:ring-amber/40">
        <Search className="size-[18px] shrink-0 text-ink-3" aria-hidden />
        <input
          type="search"
          name="server-search"
          autoComplete="off"
          spellCheck={false}
          enterKeyHint="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => e.key === "Escape" && setQuery("")}
          placeholder="Страна, город или протокол…"
          aria-label="Поиск сервера"
          className="min-w-0 flex-1 bg-transparent text-[15px] text-ink placeholder:text-ink-3 focus:outline-none [&::-webkit-search-cancel-button]:hidden"
        />
        {query && (
          <button
            type="button"
            onClick={() => setQuery("")}
            aria-label="Очистить поиск"
            className="flex size-10 shrink-0 items-center justify-center rounded-xl text-ink-3 hover:bg-glass-2 hover:text-ink"
          >
            <X className="size-4" />
          </button>
        )}
      </label>

      <div className="glass grid grid-cols-2 gap-1 rounded-2xl p-1" role="tablist" aria-label="Какие серверы показать">
        {[
          { fav: false, label: `Все ${total}` },
          { fav: true, label: `Избранные ${s.favorites.length}` },
        ].map((t) => (
          <button
            key={t.label}
            role="tab"
            aria-selected={onlyFav === t.fav}
            onClick={() => setOnlyFav(t.fav)}
            className={cn(
              "h-10 rounded-xl text-sm font-medium transition-colors",
              onlyFav === t.fav ? "bg-ink text-base" : "text-ink-2 hover:text-ink",
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      <label className="glass flex cursor-pointer items-center gap-3.5 rounded-[20px] px-4 py-3">
        <span className="flex size-10 items-center justify-center rounded-[13px] border border-amber/25 bg-amber/12 text-amber" aria-hidden>
          <Zap className="size-[19px]" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block font-medium">Автовыбор</span>
          <span className="block text-[13px] text-ink-2">Сервер с лучшим пингом</span>
        </span>
        <Switch
          checked={auto}
          onCheckedChange={(v) => {
            if (v) void backend.select(null);
            else if (s.current) void backend.select({ subUrl: s.current.sub.url, nodeId: s.current.node.id });
          }}
          aria-label="Автовыбор сервера"
        />
      </label>

      {groups.map(({ sub, nodes }) => {
        const closed = collapsed.includes(sub.url);
        return (
          <section key={sub.url} className="mt-1">
            <ProviderHeader
              sub={sub}
              closed={closed}
              compact={compact}
              hideNote={!!query.trim()}
              onToggle={() => setCollapsed((c) => (closed ? c.filter((x) => x !== sub.url) : [...c, sub.url]))}
            />
            {!closed && (
              <ul className="flex flex-col gap-2" aria-label={`Серверы ${sub.title}`}>
                {nodes.length === 0 && (
                  <li className="px-3 py-4 text-[14px] text-ink-2">
                    {query.trim() ? (
                      <>
                        Нет серверов по запросу «{query.trim()}».{" "}
                        <button type="button" onClick={() => setQuery("")} className="font-medium text-amber underline-offset-4 hover:underline">
                          Показать все
                        </button>
                      </>
                    ) : onlyFav ? (
                      "Нажмите на звёздочку у сервера, и он появится здесь"
                    ) : (
                      "В подписке нет серверов. Обновите её или напишите в поддержку"
                    )}
                  </li>
                )}
                {nodes.map((node) => {
                  if (node.divider) {
                    return (
                      <li key={node.id} className="px-2 pt-3 pb-0.5 text-[13px] font-medium text-ink-2" role="presentation">
                        {dividerTitle(node.name)}
                      </li>
                    );
                  }
                  const key = nodeKey(sub.url, node.id);
                  const active = s.current?.node.id === node.id && s.current.sub.url === sub.url;
                  const fav = s.favorites.includes(key);
                  return (
                    <li key={node.id} className="group relative">
                      <button
                        onClick={() => {
                          void backend.select({ subUrl: sub.url, nodeId: node.id });
                          onPicked?.();
                        }}
                        aria-current={active ? "true" : undefined}
                        className={cn(
                          "glass flex w-full items-center gap-3.5 rounded-[22px] text-left transition-[background-color,border-color,transform] duration-[var(--dur)] hover:bg-glass-2 active:scale-[0.985]",
                          // Справа место под звёздочку «В избранное».
                          compact ? "py-3 pr-12 pl-3" : "py-3.5 pr-12 pl-4",
                          active && "border-amber/60 bg-amber/[0.07] hover:bg-amber/10",
                        )}
                      >
                        <Flag name={node.name} size={compact ? "sm" : "md"} />
                        <span className="min-w-0 flex-1">
                          <span className="line-clamp-2 block leading-snug font-medium">{splitFlag(node.name).name}</span>
                          <Tags tags={node.tags} className="mt-1.5" />
                        </span>
                        <SignalPing ms={node.pingMs} className="shrink-0" />
                        {active && !auto ? (
                          <Entrance as="span" anim="anim-pop" className="flex size-6 shrink-0 items-center justify-center rounded-full bg-amber text-on-accent" aria-label="Выбран">
                            <Check className="size-4" strokeWidth={3} />
                          </Entrance>
                        ) : null}
                      </button>
                      <button
                        onClick={() => backend.toggleFavorite(key)}
                        aria-label={fav ? "Убрать из избранного" : "В избранное"}
                        aria-pressed={fav}
                        className={cn(
                          "absolute top-1/2 right-0.5 flex size-11 -translate-y-1/2 items-center justify-center rounded-full transition-opacity",
                          fav ? "text-amber" : "text-ink-3/70 lg:opacity-0 lg:group-hover:opacity-100 lg:focus-visible:opacity-100",
                        )}
                      >
                        <FavStar key={String(fav)} fav={fav} />
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        );
      })}
    </div>
  );
}

/** «⬇️ Обходы глушилок | LTE ⬇️» → «Обходы глушилок | LTE»: убираем стрелки и тире по краям. */
function dividerTitle(name: string) {
  return name.replace(/^[\s\p{Extended_Pictographic}\uFE0F\u2B07\u2B06\-–—=_*•.]+|[\s\p{Extended_Pictographic}\uFE0F\u2B07\u2B06\-–—=_*•.]+$/gu, "").trim();
}

/** Звёздочка «прыгает», только когда её нажали, а не при открытии списка. */
function FavStar({ fav }: { fav: boolean }) {
  const pop = useEntrance("anim-pop");
  return <Star className={cn("size-4", fav && pop)} fill={fav ? "currentColor" : "none"} />;
}

/**
 * Заголовок провайдера: название, сколько серверов, коротко трафик и срок, объявление
 * из подписки (announce) и кнопки «Проверить пинг» и «Обновить» — только для этого провайдера.
 * Виден и в свёрнутом виде.
 */
function ProviderHeader({
  sub,
  closed,
  compact,
  hideNote,
  onToggle,
}: {
  sub: Subscription;
  closed: boolean;
  compact?: boolean;
  hideNote: boolean;
  onToggle: () => void;
}) {
  const s = useSnapshot();
  const count = sub.nodes.filter((n) => !n.divider).length;
  const days = daysLeft(sub.expireAt);
  const unlimited = sub.totalBytes <= 0;
  const pinging = s.pingingSub === sub.url;
  const refreshing = s.refreshingSub === sub.url || s.refreshingSub === "*";
  const canPing = s.state === "disconnected" && !s.pinging;
  const facts = [
    unlimited ? `${formatBytes(sub.usedBytes)} · без лимита` : `${formatBytes(sub.usedBytes)} из ${formatBytes(sub.totalBytes)}`,
    days == null ? "бессрочно" : `${days} ${plural(days, "день", "дня", "дней")}${sub.expireAt ? ` · до ${formatDate(sub.expireAt)}` : ""}`,
  ];

  return (
    <div className={cn("glass mb-2 rounded-[22px]", compact ? "p-2.5" : "p-3")}>
      <div className="flex items-center gap-1">
        <button
          type="button"
          onClick={onToggle}
          aria-expanded={!closed}
          className="flex min-h-11 min-w-0 flex-1 items-center gap-2 rounded-xl px-1.5 text-left"
        >
          <ChevronDown className={cn("size-4 shrink-0 text-ink-2 transition-transform", closed && "-rotate-90")} aria-hidden />
          <span className="min-w-0 flex-1">
            <span className="flex items-baseline gap-2">
              <span className="truncate font-medium text-ink">{sub.title}</span>
              <span className="shrink-0 text-[13px] text-ink-3 tabular-nums">{count}</span>
            </span>
            <span className={cn("block truncate text-ink-2 tabular-nums", compact ? "text-[12px]" : "text-[13px]")}>
              {facts.join(" · ")}
            </span>
          </span>
        </button>
        <button
          type="button"
          onClick={() => void backend.ping(sub.url)}
          disabled={!canPing}
          aria-label={pinging ? `Меряем пинг ${sub.title}` : `Проверить пинг ${sub.title}`}
          title={s.state === "disconnected" ? "Проверить пинг" : "Пинг проверяется при выключенном VPN"}
          className="flex size-10 shrink-0 items-center justify-center rounded-full text-amber transition-colors hover:bg-glass-2 disabled:text-ink-3"
        >
          <Gauge className={cn("size-[18px]", pinging && "animate-pulse")} />
        </button>
        <button
          type="button"
          onClick={() => void backend.refreshSubscription(sub.url)}
          disabled={refreshing}
          aria-label={`Обновить подписку ${sub.title}`}
          title="Обновить подписку"
          className="flex size-10 shrink-0 items-center justify-center rounded-full text-ink-2 transition-colors hover:bg-glass-2 hover:text-ink"
        >
          <RefreshCw className={cn("size-[18px]", refreshing && "animate-spin")} />
        </button>
      </div>
      {sub.announce && !hideNote && <ProviderNote text={sub.announce} compact={compact} />}
    </div>
  );
}

/** Объявление провайдера; длинное сворачивается до двух строк. */
function ProviderNote({ text, compact }: { text: string; compact?: boolean }) {
  const [open, setOpen] = useState(false);
  const long = text.length > 90 || text.split("\n").length > 2;
  return (
    <div className={cn("mt-1.5 flex gap-2.5 border-t border-edge pt-2.5 text-ink", compact ? "px-1 text-[12.5px]" : "px-1.5 text-[13.5px]")}>
      <Megaphone className="mt-0.5 size-4 shrink-0 text-amber" aria-hidden />
      <div className="min-w-0 flex-1">
        <p className={cn("leading-snug whitespace-pre-line break-words", long && !open && "line-clamp-2")}>{text}</p>
        {long && (
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            aria-expanded={open}
            className="-ml-1 mt-0.5 inline-flex min-h-8 items-center rounded-lg px-1 text-[13px] font-medium text-amber hover:text-amber-2"
          >
            {open ? "Свернуть" : "Показать полностью"}
          </button>
        )}
      </div>
    </div>
  );
}
