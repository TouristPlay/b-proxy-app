import { useEntrance } from "@/lib/motion";
import * as ContextMenu from "@radix-ui/react-context-menu";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import {
  ArrowUpDown,
  Check,
  ChevronDown,
  ChevronsDownUp,
  ChevronsUpDown,
  Eye,
  EyeOff,
  Pencil,
  RotateCcw,
  Settings2,
  Gauge,
  Megaphone,
  MessageCircle,
  ExternalLink,
  MoreHorizontal,
  RefreshCw,
  Search,
  Star,
  Trash2,
  X,
  Zap,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { backend, nodeKey, useSnapshot, type ServerNode, type ServerSort, type Subscription } from "@/backend";
import { Button } from "@/components/ui/button";
import { Sheet } from "@/components/ui/sheet";
import { ProviderSheet } from "@/screens/ProviderSheet";
import { Flag, SignalPing, Tags } from "@/components/bits";
import { Switch } from "@/components/ui/switch";
import { daysLeft, formatBytes, plural, splitFlag } from "@/lib/format";
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
  const [collapsed, setCollapsed] = useState<string[]>(readCollapsed);
  // Провайдеры, у которых сейчас видны скрытые серверы.
  const [showHidden, setShowHidden] = useState<string[]>([]);
  const [renaming, setRenaming] = useState<{ sub: Subscription; node: ServerNode } | null>(null);
  const [settingsOf, setSettingsOf] = useState<string | null>(null);
  useEffect(() => {
    try {
      localStorage.setItem(COLLAPSED_KEY, JSON.stringify(collapsed));
    } catch {
      // Не сохранилось — свёрнутые провайдеры вспомнятся только до перезапуска.
    }
  }, [collapsed]);
  const sort = s.settings.serverSort;
  const auto = s.selected == null;
  const total = s.subscriptions.reduce((n, x) => n + x.nodes.filter((v) => !v.divider).length, 0);

  const groups = useMemo(() => {
    const q = query.trim().toLowerCase();
    return s.subscriptions.map((sub) => {
      const nodes = sub.nodes.filter((n) =>
        // Разделители показываем, только когда список не отфильтрован и идёт в порядке провайдера.
        n.divider
          ? !q && !onlyFav && sort === "provider"
          : (!n.hidden || showHidden.includes(sub.url)) &&
            (!q || n.name.toLowerCase().includes(q) || n.tags.some((t) => t.toLowerCase().includes(q))) &&
            (!onlyFav || s.favorites.includes(nodeKey(sub.url, n.id))),
      );
      return { sub, nodes: sortNodes(nodes, sort), hiddenCount: sub.nodes.filter((n) => n.hidden).length };
    });
  }, [s.subscriptions, s.favorites, query, onlyFav, sort, showHidden]);
  const collapsible = s.subscriptions.filter((x) => !x.prefs.keepOpen).map((x) => x.url);
  const allClosed = collapsible.length > 0 && collapsible.every((u) => collapsed.includes(u));

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

      <div className="flex items-center justify-between gap-2">
        <SortMenu value={sort} />
        {collapsible.length > 0 && (
          <button
            type="button"
            onClick={() => setCollapsed(allClosed ? [] : collapsible)}
            className="flex min-h-11 items-center gap-2 rounded-full px-3 text-[14px] font-medium text-ink-2 transition-colors hover:bg-glass-2 hover:text-ink"
          >
            {allClosed ? <ChevronsUpDown className="size-4" aria-hidden /> : <ChevronsDownUp className="size-4" aria-hidden />}
            {allClosed ? "Развернуть все" : "Свернуть все"}
          </button>
        )}
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

      {groups.map(({ sub, nodes, hiddenCount }) => {
        const closed = !sub.prefs.keepOpen && collapsed.includes(sub.url);
        const hiddenShown = showHidden.includes(sub.url);
        return (
          <section key={sub.url} className="glass mt-1 overflow-hidden rounded-[26px]">
            <ProviderHeader
              sub={sub}
              closed={closed}
              compact={compact}
              hideNote={!!query.trim()}
              onToggle={() => setCollapsed((c) => (closed ? c.filter((x) => x !== sub.url) : [...c, sub.url]))}
              hiddenCount={hiddenCount}
              hiddenShown={hiddenShown}
              onToggleHidden={() => setShowHidden((h) => (hiddenShown ? h.filter((x) => x !== sub.url) : [...h, sub.url]))}
              onSettings={() => setSettingsOf(sub.url)}
            />
            {!closed && (
              <ul className={cn("flex flex-col gap-0.5 border-t border-edge", compact ? "p-1.5" : "p-2")} aria-label={`Серверы ${sub.title}`}>
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
                      <li key={node.id} className="px-3 pt-3 pb-1 text-[13px] font-medium text-ink-2" role="presentation">
                        {dividerTitle(node.name)}
                      </li>
                    );
                  }
                  const key = nodeKey(sub.url, node.id);
                  const active = s.current?.node.id === node.id && s.current.sub.url === sub.url;
                  const fav = s.favorites.includes(key);
                  return (
                    <NodeMenu
                      key={node.id}
                      sub={sub}
                      node={node}
                      fav={fav}
                      canPing={s.state === "disconnected" && !s.pinging}
                      onRename={() => setRenaming({ sub, node })}
                    >
                    <li className={cn("group relative", node.hidden && "opacity-55")}>
                      <button
                        onClick={() => {
                          void backend.select({ subUrl: sub.url, nodeId: node.id });
                          onPicked?.();
                        }}
                        aria-current={active ? "true" : undefined}
                        className={cn(
                          "relative flex w-full items-center gap-3 overflow-hidden rounded-[18px] text-left transition-[background-color,box-shadow,transform] duration-[var(--dur)] hover:bg-glass-2 active:scale-[0.985]",
                          // Справа место под звёздочку «В избранное».
                          compact ? "py-2.5 pr-12 pl-2.5" : "py-3 pr-12 pl-3",
                          active && "bg-amber/[0.08] ring-1 ring-amber/45 ring-inset hover:bg-amber/[0.11]",
                        )}
                      >
                        {/* Пока меряется пинг провайдера — по карточкам по очереди проходит полоса света. */}
                        {s.pingingSub === sub.url && (
                          <span aria-hidden className="ping-sweep" style={{ animationDelay: `${(i % 12) * 90}ms` }} />
                        )}
                        <Flag name={node.name} size={compact ? "sm" : "md"} />
                        <span className="min-w-0 flex-1">
                          <span className="flex items-center gap-1.5">
                            <span className="truncate text-[14.5px] leading-snug font-medium" title={node.originalName ? `В подписке: ${node.originalName}` : splitFlag(node.name).name}>
                              {splitFlag(node.name).name}
                            </span>
                            {node.hidden && <EyeOff className="size-3.5 shrink-0 text-ink-3" aria-label="Скрыт" />}
                          </span>
                          <Tags tags={node.tags} className="mt-1" />
                        </span>
                        <SignalPing ms={node.pingMs} measuring={s.pingingSub === sub.url} order={i} className="shrink-0" />
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
                    </NodeMenu>
                  );
                })}
              </ul>
            )}
          </section>
        );
      })}

      <RenameSheet target={renaming} onClose={() => setRenaming(null)} />
      <ProviderSheet url={settingsOf} onOpenChange={(o) => !o && setSettingsOf(null)} />
    </div>
  );
}

const COLLAPSED_KEY = "b-proxy.collapsed";

function readCollapsed(): string[] {
  try {
    const v = JSON.parse(localStorage.getItem(COLLAPSED_KEY) ?? "[]");
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
}

/** Порядок серверов: как в подписке, по пингу (без связи — в конце) или по названию. */
function sortNodes(nodes: ServerNode[], sort: ServerSort): ServerNode[] {
  if (sort === "provider") return nodes;
  const list = nodes.filter((n) => !n.divider);
  if (sort === "name") return [...list].sort((a, b) => splitFlag(a.name).name.localeCompare(splitFlag(b.name).name, "ru"));
  const rank = (n: ServerNode) => (n.pingMs == null ? 1e9 : n.pingMs < 0 ? 2e9 : n.pingMs);
  return [...list].sort((a, b) => rank(a) - rank(b));
}

const sorts: { value: ServerSort; title: string }[] = [
  { value: "provider", title: "Как у провайдера" },
  { value: "ping", title: "По пингу" },
  { value: "name", title: "По названию" },
];

const menuBox =
  "z-50 min-w-56 rounded-[18px] border border-edge-2 bg-panel p-1.5 shadow-[0_18px_40px_-16px_rgb(0_0_0/0.7)] data-[state=open]:animate-[dialog-in_var(--dur-fast)_var(--ease-out)]";
const menuItem =
  "flex min-h-11 cursor-pointer items-center gap-2.5 rounded-xl px-3 text-[15px] outline-none data-[disabled]:cursor-default data-[disabled]:opacity-45 data-[highlighted]:bg-glass-2";

function SortMenu({ value }: { value: ServerSort }) {
  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger className="flex min-h-11 items-center gap-2 rounded-full px-3 text-[14px] font-medium text-ink-2 transition-colors hover:bg-glass-2 hover:text-ink">
        <ArrowUpDown className="size-4" aria-hidden />
        {sorts.find((x) => x.value === value)?.title}
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content align="start" sideOffset={6} className={menuBox}>
          <DropdownMenu.Label className="px-3 pt-1.5 pb-1 text-[13px] text-ink-3">Порядок серверов</DropdownMenu.Label>
          {sorts.map((x) => (
            <DropdownMenu.Item key={x.value} className={menuItem} onSelect={() => void backend.updateSettings({ serverSort: x.value })}>
              <span className="flex-1">{x.title}</span>
              {x.value === value && <Check className="size-4 text-amber" aria-hidden />}
            </DropdownMenu.Item>
          ))}
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}

/**
 * Меню сервера: правая кнопка мыши на компьютере, долгое нажатие на телефоне.
 * Пинг одного сервера, своё название, избранное, скрыть.
 */
function NodeMenu({
  sub,
  node,
  fav,
  canPing,
  onRename,
  children,
}: {
  sub: Subscription;
  node: ServerNode;
  fav: boolean;
  canPing: boolean;
  onRename: () => void;
  children: React.ReactNode;
}) {
  return (
    <ContextMenu.Root>
      <ContextMenu.Trigger asChild>{children}</ContextMenu.Trigger>
      <ContextMenu.Portal>
        <ContextMenu.Content className={menuBox}>
          <ContextMenu.Label className="max-w-64 truncate px-3 pt-1.5 pb-1 text-[13px] text-ink-3">{splitFlag(node.name).name}</ContextMenu.Label>
          <ContextMenu.Item className={menuItem} disabled={!canPing} onSelect={() => void backend.pingNode(sub.url, node.id)}>
            <Gauge className="size-[18px]" aria-hidden />
            {canPing ? "Проверить пинг" : "Пинг — при выключенном VPN"}
          </ContextMenu.Item>
          <ContextMenu.Item className={menuItem} onSelect={onRename}>
            <Pencil className="size-[18px]" aria-hidden />
            Переименовать
          </ContextMenu.Item>
          {node.originalName && (
            <ContextMenu.Item className={menuItem} onSelect={() => backend.renameNode(sub.url, node.id, null)}>
              <RotateCcw className="size-[18px]" aria-hidden />
              Вернуть название из подписки
            </ContextMenu.Item>
          )}
          <ContextMenu.Item className={menuItem} onSelect={() => backend.toggleFavorite(nodeKey(sub.url, node.id))}>
            <Star className="size-[18px]" aria-hidden fill={fav ? "currentColor" : "none"} />
            {fav ? "Убрать из избранного" : "В избранное"}
          </ContextMenu.Item>
          <ContextMenu.Separator className="my-1 h-px bg-edge" />
          <ContextMenu.Item className={menuItem} onSelect={() => backend.setNodeHidden(sub.url, node.id, !node.hidden)}>
            {node.hidden ? <Eye className="size-[18px]" aria-hidden /> : <EyeOff className="size-[18px]" aria-hidden />}
            {node.hidden ? "Показывать в списке" : "Скрыть сервер"}
          </ContextMenu.Item>
        </ContextMenu.Content>
      </ContextMenu.Portal>
    </ContextMenu.Root>
  );
}

/** Своё название сервера. Пустое поле — название из подписки. */
function RenameSheet({ target, onClose }: { target: { sub: Subscription; node: ServerNode } | null; onClose: () => void }) {
  const [name, setName] = useState("");
  useEffect(() => {
    if (target) setName(target.node.originalName ? target.node.name : "");
  }, [target]);
  const original = target ? (target.node.originalName ?? target.node.name) : "";
  const save = () => {
    if (target) backend.renameNode(target.sub.url, target.node.id, name.trim() || null);
    onClose();
  };
  return (
    <Sheet
      open={target != null}
      onOpenChange={(o) => !o && onClose()}
      title="Переименовать сервер"
      description={`В подписке: ${original}`}
      icon={<span className="flex size-11 items-center justify-center rounded-[14px] border border-edge-2 bg-glass-2 text-ink-2"><Pencil className="size-5" /></span>}
    >
      <form
        className="flex flex-col gap-4"
        onSubmit={(e) => {
          e.preventDefault();
          save();
        }}
      >
        <label className="glass flex h-14 items-center rounded-2xl px-4 focus-within:ring-2 focus-within:ring-amber/40">
          <input
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={original}
            maxLength={60}
            aria-label="Новое название сервера"
            className="w-full bg-transparent text-[16px] text-ink placeholder:text-ink-3 focus:outline-none"
          />
        </label>
        <p className="px-1 text-[13px] text-ink-3">Название меняется только у вас. Пустое поле — как в подписке.</p>
        <Button type="submit" variant="amber" className="min-h-12 w-full">
          Сохранить
        </Button>
      </form>
    </Sheet>
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
 * Карточка провайдера: сверху название и действия (пинг, обновление, меню), под ним срок
 * и полоса трафика. Объявление — в плашке, ниже «Продлить» и «Поддержка».
 * Серверы идут в том же блоке под чертой — это часть провайдера.
 */
function ProviderHeader({
  sub,
  hiddenCount,
  hiddenShown,
  onToggleHidden,
  onSettings,
  closed,
  compact,
  hideNote,
  onToggle,
}: {
  sub: Subscription;
  hiddenCount: number;
  hiddenShown: boolean;
  onToggleHidden: () => void;
  onSettings: () => void;
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
  const seg =
    "flex size-10 shrink-0 items-center justify-center rounded-full text-ink-2 transition-colors hover:bg-glass-2 hover:text-ink disabled:opacity-50";
  const updated = ago(sub.updatedAt, now);

  return (
    <div className={compact ? "p-3" : "p-4"}>
      <div className="flex items-start gap-1">
        {/* Название сворачивает и разворачивает серверы провайдера. */}
        <button
          type="button"
          onClick={onToggle}
          aria-expanded={!closed}
          aria-label={`${sub.title}: ${closed ? "показать" : "скрыть"} серверы`}
          className="flex min-w-0 flex-1 items-center gap-1.5 rounded-xl py-1.5 text-left"
        >
          <span className={cn("truncate font-display font-semibold", compact ? "text-[16px]" : "text-[18px]")}>{sub.title}</span>
          {!sub.prefs.keepOpen && (
            <ChevronDown
              className={cn("size-4 shrink-0 text-ink-3 transition-transform duration-[var(--dur)]", !closed && "rotate-180")}
              aria-hidden
            />
          )}
        </button>
        <button
          type="button"
          onClick={() => void backend.ping(sub.url)}
          disabled={!canPing}
          aria-label={pinging ? `Меряем пинг ${sub.title}` : `Проверить пинг ${sub.title}`}
          title={s.state === "disconnected" ? "Проверить пинг" : "Пинг проверяется при выключенном VPN"}
          className={cn(seg, pinging && "bg-amber/15 text-amber")}
        >
          <Gauge className={cn("size-[18px]", pinging && "animate-pulse")} />
        </button>
        <button
          type="button"
          onClick={() => void backend.refreshSubscription(sub.url)}
          disabled={refreshing}
          aria-label={`Обновить подписку ${sub.title}`}
          title="Обновить подписку"
          className={seg}
        >
          <RefreshCw className={cn("size-[17px]", refreshing && "animate-spin")} />
        </button>
        <ProviderMenu
          sub={sub}
          className={seg}
          hiddenCount={hiddenCount}
          hiddenShown={hiddenShown}
          onToggleHidden={onToggleHidden}
          onSettings={onSettings}
        />
      </div>

      <p className="text-[13px] text-ink-2 tabular-nums" title={updatedFmt.format(sub.updatedAt)}>
        {sub.plan ? `${sub.plan} · ` : ""}
        {count} {plural(count, "сервер", "сервера", "серверов")} · обновлена {updated}
        {updated === "сейчас" ? "" : " назад"}
      </p>

      {/* Срок и трафик — две строки с полосами, как на главной, только компактнее. */}
      <div className="mt-3 grid gap-2.5">
        <div>
          <div className="flex items-baseline justify-between gap-2 text-[13px]">
            <span className="text-ink-2">Срок</span>
            <span className={cn("tabular-nums", days != null && days <= 3 ? "text-bad" : "text-ink")}>
              {days == null ? "бессрочно" : days > 0 ? `осталось ${days} ${plural(days, "день", "дня", "дней")}` : "закончилась"}
              {sub.expireAt ? <span className="text-ink-3"> · до {expireFmt.format(sub.expireAt)}</span> : null}
            </span>
          </div>
          <Bar value={days == null ? 1 : Math.max(0, days) / termDays(days)} className={days != null && days <= 3 ? "bg-bad" : "bg-gradient-to-r from-amber-deep to-amber"} label="Осталось дней подписки" />
        </div>
        <div>
          <div className="flex items-baseline justify-between gap-2 text-[13px]">
            <span className="text-ink-2">Трафик</span>
            <span className="tabular-nums">
              {formatBytes(sub.usedBytes)}
              {unlimited ? <span className="text-ink-3"> · не ограничен</span> : <span className="text-ink-3"> из {formatBytes(sub.totalBytes)}</span>}
            </span>
          </div>
          <Bar
            value={unlimited ? 1 : used}
            className={unlimited ? "bg-good/25" : used > 0.9 ? "bg-bad" : "bg-gradient-to-r from-amber-deep to-amber"}
            label="Использованный трафик"
          />
        </div>
      </div>

      {sub.announce && !hideNote && (
        <div className="mt-3 flex gap-2 rounded-[16px] bg-amber/[0.06] px-3 py-2.5 ring-1 ring-amber/15 ring-inset">
          <Megaphone className="mt-[3px] size-3.5 shrink-0 text-amber" aria-hidden />
          {/* Пустая строка между абзацами — маленький отступ, а не целая строка. */}
          <div className="min-w-0 space-y-1 text-[13px] leading-[1.4] text-ink-2">
            {sub.announce
              .split(/\n\s*\n/)
              .map((part) => part.trim())
              .filter(Boolean)
              .map((part, i) => (
                <p key={i} className="whitespace-pre-line break-words">
                  {part}
                </p>
              ))}
          </div>
        </div>
      )}

      <div className="mt-3 flex items-center gap-2">
        {sub.webPageUrl && (
          <a
            href={sub.webPageUrl}
            target="_blank"
            rel="noreferrer"
            className="inline-flex min-h-10 shrink-0 items-center gap-1.5 rounded-full bg-amber px-4 text-[14px] font-semibold text-on-accent transition-colors hover:bg-amber-2"
          >
            <ExternalLink className="size-4" aria-hidden />
            Продлить
          </a>
        )}
        {sub.supportUrl && (
          <a
            href={sub.supportUrl}
            target="_blank"
            rel="noreferrer"
            className="inline-flex min-h-10 shrink-0 items-center justify-center gap-1.5 rounded-full border border-edge-2 px-4 text-[14px] font-medium text-ink-2 transition-colors hover:text-ink"
          >
            <MessageCircle className="size-4" aria-hidden />
            Поддержка
            
          </a>
        )}
      </div>
    </div>
  );
}


/** Меню «⋯» провайдера: удалить подписку (с «Вернуть» в уведомлении). */
function ProviderMenu({
  sub,
  className,
  hiddenCount,
  hiddenShown,
  onToggleHidden,
  onSettings,
}: {
  sub: Subscription;
  className: string;
  hiddenCount: number;
  hiddenShown: boolean;
  onToggleHidden: () => void;
  onSettings: () => void;
}) {
  const item = menuItem;
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
          <DropdownMenu.Item className={item} onSelect={onSettings}>
            <Settings2 className="size-[18px]" aria-hidden />
            Настройки провайдера
          </DropdownMenu.Item>
          {hiddenCount > 0 && (
            <DropdownMenu.Item className={item} onSelect={onToggleHidden}>
              {hiddenShown ? <EyeOff className="size-[18px]" aria-hidden /> : <Eye className="size-[18px]" aria-hidden />}
              {hiddenShown ? "Не показывать скрытые" : `Показать скрытые (${hiddenCount})`}
            </DropdownMenu.Item>
          )}
          <DropdownMenu.Separator className="my-1 h-px bg-edge" />
          <DropdownMenu.Item className={cn(item, "text-bad")} onSelect={() => void backend.removeSubscription(sub.url)}>
            <Trash2 className="size-[18px]" aria-hidden />
            Удалить подписку
          </DropdownMenu.Item>
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}

const expireFmt = new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "short" });

/** Тонкая полоса прогресса внутри карточки провайдера. */
function Bar({ value, className, label }: { value: number; className: string; label: string }) {
  return (
    <div
      className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-glass-3"
      role="progressbar"
      aria-label={label}
      aria-valuenow={Math.round(value * 100)}
      aria-valuemin={0}
      aria-valuemax={100}
    >
      <div className={cn("h-full rounded-full transition-[width] duration-[var(--dur)]", className)} style={{ width: `${Math.max(2, value * 100)}%` }} />
    </div>
  );
}

/**
 * Длина оплаченного периода для полосы срока. Даты начала подписка не сообщает,
 * поэтому берём ближайший обычный период: месяц, 3 месяца, полгода, год.
 */
function termDays(days: number) {
  return [30, 90, 180, 365].find((t) => days <= t) ?? days;
}
