import { AppWindow, LayoutGrid, Plus, Search } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { backend, useSnapshot, type AppEntry, type PerAppSettings } from "@/backend";
import { detectPlatform } from "@/backend/xray";
import { Group, IconTile } from "@/components/bits";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Sheet } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import { t } from "@/lib/i18n";

export const perAppModes: { value: PerAppSettings["mode"]; title: string; hint: string }[] = [
  { value: "off", title: t("Все приложения"), hint: t("Весь трафик устройства идёт через VPN") },
  { value: "only", title: t("Только выбранные"), hint: t("Через VPN — отмеченные, остальные напрямую") },
  { value: "except", title: t("Все, кроме выбранных"), hint: t("Отмеченные идут напрямую, мимо VPN") },
];

export function perAppHint(p: PerAppSettings) {
  if (p.mode === "off" || p.apps.length === 0) return t("Все приложения через VPN");
  return p.mode === "only" ? t("Только выбранные: {0}", [p.apps.length]) : t("Кроме выбранных: {0}", [p.apps.length]);
}

/** VPN по приложениям: режим и список. Android — приложения телефона, компьютер — программы. */
export function AppsSheet({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const { settings } = useSnapshot();
  const p = settings.perApp ?? { mode: "off", apps: [] };
  const android = detectPlatform() === "android";
  const [apps, setApps] = useState<AppEntry[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [manual, setManual] = useState("");

  useEffect(() => {
    if (!open || p.mode === "off" || apps) return;
    backend
      .listApps()
      .then((list) => setApps(list.sort((a, b) => a.name.localeCompare(b.name))))
      .catch((e) => setError(e instanceof Error ? e.message : String(e)));
  }, [open, p.mode, apps]);

  const set = (patch: Partial<PerAppSettings>) => void backend.updateSettings({ perApp: { ...p, ...patch } });
  const toggle = (id: string) => set({ apps: p.apps.includes(id) ? p.apps.filter((a) => a !== id) : [...p.apps, id] });

  // Отмеченные — сверху; на компьютере в списке и те, что сейчас не запущены.
  const rows = useMemo(() => {
    const known = new Map((apps ?? []).map((a) => [a.id, a]));
    for (const id of p.apps) if (!known.has(id)) known.set(id, { id, name: id });
    const q = query.trim().toLowerCase();
    return [...known.values()]
      .filter((a) => !q || a.name.toLowerCase().includes(q) || a.id.toLowerCase().includes(q))
      .sort((a, b) => Number(p.apps.includes(b.id)) - Number(p.apps.includes(a.id)) || a.name.localeCompare(b.name));
  }, [apps, p.apps, query]);

  function addManual() {
    const id = manual.trim().replace(/\.exe$/i, "");
    if (id && !p.apps.includes(id)) set({ apps: [...p.apps, id] });
    setManual("");
  }

  return (
    <Sheet
      open={open}
      onOpenChange={onOpenChange}
      title={t("VPN по приложениям")}
      description={android ? t("Какие приложения телефона идут через VPN") : t("Какие программы компьютера идут через VPN")}
      icon={<IconTile icon={LayoutGrid} tone="violet" />}
    >
      <div className="flex flex-col gap-6">
        <Group>
          <RadioGroup
            value={p.mode}
            onValueChange={(v) => set({ mode: v as PerAppSettings["mode"] })}
            className="divide-y divide-edge"
            aria-label={t("Режим")}
          >
            {perAppModes.map((m) => (
              <label key={m.value} className="flex cursor-pointer items-center gap-3.5 px-4 py-3.5">
                <RadioGroupItem value={m.value} aria-label={m.title} />
                <span className="min-w-0 flex-1">
                  <span className="block font-medium">{m.title}</span>
                  <span className="block text-[13px] text-ink-3">{m.hint}</span>
                </span>
              </label>
            ))}
          </RadioGroup>
        </Group>

        {p.mode !== "off" && (
          <>
            <label className="glass flex min-h-12 items-center gap-2.5 rounded-2xl px-4 focus-within:ring-2 focus-within:ring-amber/50">
              <Search className="size-[18px] shrink-0 text-ink-3" aria-hidden />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={android ? t("Найти приложение") : t("Найти программу")}
                aria-label={android ? t("Найти приложение") : t("Найти программу")}
                className="min-w-0 flex-1 bg-transparent text-[16px] placeholder:text-ink-3 focus:outline-none md:text-[15px]"
              />
            </label>

            <Group title={p.apps.length ? t("Отмечено: {0}", [p.apps.length]) : undefined}>
              {apps === null && !error && <p className="px-4 py-4 text-[14px] text-ink-3">{t("Загружаем список…")}</p>}
              {error && <p className="px-4 py-4 text-[14px] text-bad">{t("Не удалось получить список: {0}", [error])}</p>}
              <ul className="divide-y divide-edge">
                {rows.map((a) => {
                  const on = p.apps.includes(a.id);
                  return (
                    <li key={a.id}>
                      <label className="flex min-h-14 cursor-pointer items-center gap-3 px-4 py-2.5">
                        {a.icon ? (
                          <img src={a.icon} alt="" className="size-9 shrink-0 rounded-[10px]" />
                        ) : (
                          <span className="flex size-9 shrink-0 items-center justify-center rounded-[10px] bg-glass-2 text-ink-2">
                            <AppWindow className="size-[18px]" aria-hidden />
                          </span>
                        )}
                        <span className="min-w-0 flex-1">
                          <span className="block truncate font-medium">{a.name}</span>
                          {(a.path || android) && <span className="block truncate text-[12.5px] text-ink-3">{a.path ?? a.id}</span>}
                        </span>
                        <input
                          type="checkbox"
                          checked={on}
                          onChange={() => toggle(a.id)}
                          className={cn("size-5 shrink-0 accent-amber")}
                          aria-label={a.name}
                        />
                      </label>
                    </li>
                  );
                })}
              </ul>
              {apps && rows.length === 0 && <p className="px-4 py-4 text-[14px] text-ink-3">{t("Ничего не нашлось по «{0}»", [query])}</p>}
            </Group>

            {!android && (
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  addManual();
                }}
                className="glass flex min-h-12 items-center gap-2 rounded-2xl pr-1.5 pl-4 focus-within:ring-2 focus-within:ring-amber/50"
              >
                <input
                  value={manual}
                  onChange={(e) => setManual(e.target.value)}
                  placeholder={t("Другая программа: имя файла")}
                  aria-label={t("Добавить программу по имени файла")}
                  spellCheck={false}
                  className="min-w-0 flex-1 bg-transparent text-[16px] placeholder:text-ink-3 focus:outline-none md:text-[14px]"
                />
                <button
                  type="submit"
                  disabled={!manual.trim()}
                  className="flex size-11 shrink-0 items-center justify-center rounded-full text-ink-2 hover:bg-glass-2 hover:text-ink disabled:opacity-40"
                  aria-label={t("Добавить программу")}
                >
                  <Plus className="size-5" aria-hidden />
                </button>
              </form>
            )}
            <p className="px-2 text-[13px] text-ink-3">
              {android
                ? t("Изменения вступят в силу после переподключения.")
                : t("Программу узнаём по имени файла. Изменения вступят в силу после переподключения.")}
            </p>
          </>
        )}
      </div>
    </Sheet>
  );
}
