import { Check, ChevronDown, Search, Star, Zap } from "lucide-react";
import { useMemo, useState } from "react";
import { backend, nodeKey, useSnapshot } from "@/backend";
import { Flag, SignalPing, Tags } from "@/components/bits";
import { Switch } from "@/components/ui/switch";
import { splitFlag } from "@/lib/format";
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
  const total = s.subscriptions.reduce((n, x) => n + x.nodes.length, 0);

  const groups = useMemo(() => {
    const q = query.trim().toLowerCase();
    return s.subscriptions.map((sub) => ({
      sub,
      nodes: sub.nodes.filter(
        (n) =>
          (!q || n.name.toLowerCase().includes(q) || n.tags.some((t) => t.toLowerCase().includes(q))) &&
          (!onlyFav || s.favorites.includes(nodeKey(sub.url, n.id))),
      ),
    }));
  }, [s.subscriptions, s.favorites, query, onlyFav]);

  return (
    <div className="flex flex-col gap-3">
      <label className="glass flex h-12 items-center gap-3 rounded-2xl px-4 focus-within:border-amber/60">
        <Search className="size-[18px] shrink-0 text-ink-3" aria-hidden />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Поиск сервера"
          aria-label="Поиск сервера"
          className="min-w-0 flex-1 bg-transparent text-[15px] text-ink placeholder:text-ink-3 focus:outline-none"
        />
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
            <button
              onClick={() => setCollapsed((c) => (closed ? c.filter((x) => x !== sub.url) : [...c, sub.url]))}
              className="flex w-full items-center gap-2 rounded-xl px-2 py-2 text-left text-ink-2 hover:text-ink"
              aria-expanded={!closed}
            >
              <ChevronDown className={cn("size-4 transition-transform", closed && "-rotate-90")} aria-hidden />
              <span className="flex-1 font-medium text-ink">{sub.title}</span>
              <span className="text-sm text-ink-3 tabular-nums">{sub.nodes.length}</span>
            </button>
            {!closed && (
              <ul className="flex flex-col gap-2" aria-label={`Серверы ${sub.title}`}>
                {nodes.length === 0 && (
                  <li className="px-3 py-4 text-sm text-ink-3">
                    {onlyFav ? "Отметьте серверы звёздочкой, и они появятся здесь." : "Ничего не нашлось."}
                  </li>
                )}
                {nodes.map((node) => {
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
                          "glass flex w-full items-center gap-3.5 rounded-[22px] text-left transition-colors hover:bg-glass-2",
                          compact ? "px-3 py-3" : "px-4 py-3.5",
                          active && "border-amber/60 bg-amber/[0.07] hover:bg-amber/10",
                        )}
                      >
                        <Flag name={node.name} size={compact ? "sm" : "md"} />
                        <span className="min-w-0 flex-1">
                          <span className="line-clamp-2 block pr-6 leading-snug font-medium">{splitFlag(node.name).name}</span>
                          <Tags tags={node.tags} className="mt-1.5" />
                        </span>
                        <SignalPing ms={node.pingMs} className="shrink-0" />
                        {active && !auto ? (
                          <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-amber text-[#2a1806]" aria-label="Выбран">
                            <Check className="size-4" strokeWidth={3} />
                          </span>
                        ) : null}
                      </button>
                      <button
                        onClick={() => backend.toggleFavorite(key)}
                        aria-label={fav ? "Убрать из избранного" : "В избранное"}
                        aria-pressed={fav}
                        className={cn(
                          "absolute top-1.5 right-1.5 flex size-8 items-center justify-center rounded-full transition-opacity",
                          fav ? "text-amber" : "text-ink-3/70 lg:opacity-0 lg:group-hover:opacity-100 lg:focus-visible:opacity-100",
                        )}
                      >
                        <Star className="size-3.5" fill={fav ? "currentColor" : "none"} />
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
