import { Entrance, useEntrance } from "@/lib/motion";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import {
  Check,
  ChevronDown,
  CircleHelp,
  ExternalLink,
  MoreHorizontal,
  RefreshCw,
  Search,
  Server as ServerIcon,
  Star,
  Trash2,
  X,
  Zap,
} from "lucide-react";
import { useMemo, useState } from "react";
import { backend, nodeKey, useSnapshot, type Subscription } from "@/backend";
import { Flag, SignalPing, Tags } from "@/components/bits";
import { Switch } from "@/components/ui/switch";
import { daysLeft, formatBytes, splitFlag } from "@/lib/format";
import { useNow } from "@/lib/useMedia";
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
                {nodes.map((node, i) => {
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
                          "glass relative flex w-full items-center gap-3.5 overflow-hidden rounded-[22px] text-left transition-[background-color,border-color,transform] duration-[var(--dur)] hover:bg-glass-2 active:scale-[0.985]",
                          // Справа место под звёздочку «В избранное».
                          compact ? "py-3 pr-12 pl-3" : "py-3.5 pr-12 pl-4",
                          active && "border-amber/60 bg-amber/[0.07] hover:bg-amber/10",
                        )}
                      >
                        {/* Пока меряется пинг провайдера — по карточкам по очереди проходит полоса света. */}
                        {s.pingingSub === sub.url && (
                          <span aria-hidden className="ping-sweep" style={{ animationDelay: `${(i % 12) * 90}ms` }} />
                        )}
                        <Flag name={node.name} size={compact ? "sm" : "md"} />
                        <span className="min-w-0 flex-1">
                          <span className="line-clamp-2 block leading-snug font-medium">{splitFlag(node.name).name}</span>
                          <Tags tags={node.tags} className="mt-1.5" />
                        </span>
                        <SignalPing ms={node.pingMs} measuring={s.pingingSub === sub.url} order={i} className="shrink-0" />
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

const updatedFmt = new Intl.DateTimeFormat("ru-RU", {
  day: "2-digit",
  month: "2-digit",
  year: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
});

/** «сейчас», «12 мин», «3 ч», «2 дн.» — сколько прошло с обновления. */
function ago(t: number, now: number) {
  const min = Math.max(0, Math.floor((now - t) / 60_000));
  if (min < 1) return "сейчас";
  if (min < 60) return `${min} мин`;
  const h = Math.floor(min / 60);
  return h < 24 ? `${h} ч` : `${Math.floor(h / 24)} дн.`;
}

/**
 * Карточка провайдера (как в INCY): название, когда обновлялась, кнопки «Обновить»,
 * «Проверить пинг» и меню; срок и трафик с полосой; объявление провайдера целиком;
 * «Поддержка»; внизу — дата обновления и число серверов. Видна и в свёрнутом виде.
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
  const now = useNow(false);
  const count = sub.nodes.filter((n) => !n.divider).length;
  const days = daysLeft(sub.expireAt);
  const unlimited = sub.totalBytes <= 0;
  const used = unlimited ? 0 : Math.min(1, sub.usedBytes / sub.totalBytes);
  const pinging = s.pingingSub === sub.url;
  const refreshing = s.refreshingSub === sub.url || s.refreshingSub === "*";
  const canPing = s.state === "disconnected" && !s.pinging;
  const iconBtn =
    "flex size-10 shrink-0 items-center justify-center rounded-full bg-glass-2 text-ink-2 transition-colors hover:bg-glass-3 hover:text-ink disabled:opacity-50";

  return (
    <div className={cn("glass mb-2 rounded-[24px]", compact ? "p-3" : "p-4")}>
      <div className="flex items-center gap-1.5">
        <button
          type="button"
          onClick={onToggle}
          aria-expanded={!closed}
          aria-label={`${closed ? "Показать" : "Скрыть"} серверы ${sub.title}`}
          className="-ml-1 flex min-h-11 min-w-0 flex-1 items-center gap-2 rounded-xl px-1 text-left"
        >
          <ChevronDown className={cn("size-5 shrink-0 text-ink-2 transition-transform duration-[var(--dur)]", closed && "-rotate-90")} aria-hidden />
          <span className={cn("truncate font-display font-semibold", compact ? "text-[15px]" : "text-[17px]")}>{sub.title}</span>
        </button>
        <button
          type="button"
          onClick={() => void backend.refreshSubscription(sub.url)}
          disabled={refreshing}
          aria-label={`Обновить подписку ${sub.title}`}
          title="Обновить подписку"
          className={iconBtn}
        >
          <RefreshCw className={cn("size-[18px]", refreshing && "animate-spin")} />
        </button>
        <button
          type="button"
          onClick={() => void backend.ping(sub.url)}
          disabled={!canPing}
          aria-label={pinging ? `Меряем пинг ${sub.title}` : `Проверить пинг ${sub.title}`}
          title={s.state === "disconnected" ? "Проверить пинг" : "Пинг проверяется при выключенном VPN"}
          className={cn(iconBtn, pinging && "bg-amber/15 text-amber")}
        >
          <Zap className={cn("size-[18px]", pinging && "animate-pulse")} />
        </button>
        <ProviderMenu sub={sub} className={iconBtn} />
      </div>

      {/* Срок и трафик: полоса заполняется при лимите, при безлимите — пустая дорожка и «∞». */}
      <div className="mt-2 flex items-center gap-3 text-[13px] text-ink-2 tabular-nums">
        <span className="shrink-0">{days == null ? "Бессрочно" : days === 0 ? "Закончилась" : `Осталось ${days} дн.`}</span>
        <span className="h-1.5 min-w-8 flex-1 overflow-hidden rounded-full bg-glass-3" aria-hidden>
          {!unlimited && (
            <span
              className={cn("block h-full rounded-full", used > 0.9 ? "bg-bad" : "bg-amber")}
              style={{ width: `${Math.max(2, used * 100)}%` }}
            />
          )}
        </span>
        <span className="shrink-0">
          {formatBytes(sub.usedBytes)} / {unlimited ? "∞" : formatBytes(sub.totalBytes)}
        </span>
      </div>

      {sub.announce && !hideNote && (
        <p className={cn("mt-3 leading-snug whitespace-pre-line break-words text-ink", compact ? "text-[13px]" : "text-[14.5px]")}>
          {sub.announce}
        </p>
      )}

      {sub.supportUrl && (
        <a
          href={sub.supportUrl}
          target="_blank"
          rel="noreferrer"
          className="mt-3 inline-flex min-h-10 items-center gap-2 rounded-[14px] border border-tag-reality/25 bg-tag-reality/10 px-3.5 text-[14px] font-medium text-tag-reality transition-colors hover:bg-tag-reality/15"
        >
          <CircleHelp className="size-[18px]" aria-hidden />
          Поддержка
        </a>
      )}

      <p className="mt-2 flex items-center justify-end gap-1.5 text-[12px] text-ink-3 tabular-nums" title={`Обновлена ${updatedFmt.format(sub.updatedAt)}`}>
        обновлена {ago(sub.updatedAt, now)}{ago(sub.updatedAt, now) === "сейчас" ? "" : " назад"} · {updatedFmt.format(sub.updatedAt)} · {count}
        <ServerIcon className="size-3.5" aria-label="серверов" />
      </p>
    </div>
  );
}

/** Меню «⋯» провайдера: продлить, удалить (с «Вернуть»). */
function ProviderMenu({ sub, className }: { sub: Subscription; className: string }) {
  const item =
    "flex min-h-11 cursor-pointer items-center gap-2.5 rounded-xl px-3 text-[15px] outline-none data-[highlighted]:bg-glass-2";
  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger className={className} aria-label={`Ещё: ${sub.title}`} title="Ещё">
        <MoreHorizontal className="size-[18px]" />
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content
          align="end"
          sideOffset={6}
          className="z-50 min-w-52 rounded-[18px] border border-edge-2 bg-panel p-1.5 shadow-[0_18px_40px_-16px_rgb(0_0_0/0.7)] data-[state=open]:animate-[dialog-in_var(--dur-fast)_var(--ease-out)]"
        >
          {sub.webPageUrl && (
            <DropdownMenu.Item className={item} onSelect={() => window.open(sub.webPageUrl!, "_blank", "noopener")}>
              <ExternalLink className="size-[18px] text-ink-2" aria-hidden />
              Продлить
            </DropdownMenu.Item>
          )}
          <DropdownMenu.Item className={cn(item, "text-bad")} onSelect={() => void backend.removeSubscription(sub.url)}>
            <Trash2 className="size-[18px]" aria-hidden />
            Удалить подписку
          </DropdownMenu.Item>
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}
