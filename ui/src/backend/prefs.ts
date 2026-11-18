import { defaultSubPrefs, type ServerNode, type SubPrefs, type Subscription } from "./types";

/**
 * Применяет свои настройки провайдера к данным подписки: название, переименованные
 * и скрытые серверы. Данные из подписки не трогаем — при обновлении они приходят заново,
 * а настройки остаются.
 */
export function applyPrefs(sub: Omit<Subscription, "title" | "prefs"> & { prefs?: Partial<SubPrefs> }): Subscription {
  const prefs: SubPrefs = { ...defaultSubPrefs, ...sub.prefs };
  const nodes: ServerNode[] = sub.nodes.map((n) => {
    if (n.divider) return n;
    const base = n.originalName ?? n.name;
    const custom = prefs.renames[n.id]?.trim();
    return {
      ...n,
      name: custom || base,
      originalName: custom ? base : undefined,
      hidden: prefs.hidden.includes(n.id) || undefined,
    };
  });
  return { ...sub, nodes, prefs, title: prefs.title?.trim() || sub.providerTitle };
}

/** Новые настройки провайдера поверх старых (renames и hidden — целиком из patch). */
export function mergePrefs(prev: Partial<SubPrefs> | undefined, patch: Partial<SubPrefs>): SubPrefs {
  return { ...defaultSubPrefs, ...prev, ...patch };
}

/**
 * Текущий сервер: выбранный вручную или лучший по пингу (автовыбор).
 * В автовыбор не идут скрытые серверы и провайдеры, выключенные из автовыбора.
 */
export function pickCurrent(
  subscriptions: Subscription[],
  selected: { subUrl: string; nodeId: string } | null,
): { sub: Subscription; node: ServerNode } | null {
  const all = subscriptions.flatMap((sub) => sub.nodes.filter((node) => !node.divider).map((node) => ({ sub, node })));
  if (selected) {
    const found = all.find((p) => p.sub.url === selected.subUrl && p.node.id === selected.nodeId);
    if (found) return found;
  }
  const pool = all.filter((p) => !p.node.hidden && p.sub.prefs.autoSelect);
  const candidates = pool.length ? pool : all;
  const measured = candidates.filter((p) => p.node.pingMs != null && p.node.pingMs > 0).sort((a, b) => a.node.pingMs! - b.node.pingMs!);
  return measured[0] ?? candidates[0] ?? null;
}
