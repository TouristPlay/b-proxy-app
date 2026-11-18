import { Clock, Globe, PanelTopOpen, Pencil, Settings2, Zap } from "lucide-react";
import { useEffect, useState } from "react";
import { backend, useSnapshot, type SubPrefs, type UpdateInterval } from "@/backend";
import { Group, IconTile, Row } from "@/components/bits";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Sheet } from "@/components/ui/sheet";
import { Switch } from "@/components/ui/switch";
import { intervals } from "./PingUpdateSheets";

/**
 * Свои настройки одного провайдера: название, раскрытый список, автовыбор,
 * интервал обновления и DNS. Хранятся на устройстве, обновление подписки их не сбрасывает.
 */
export function ProviderSheet({ url, onOpenChange }: { url: string | null; onOpenChange: (open: boolean) => void }) {
  const s = useSnapshot();
  const sub = s.subscriptions.find((x) => x.url === url) ?? null;
  // Название и DNS правим в черновике: сохраняем, когда поле потеряло фокус.
  const [title, setTitle] = useState("");
  const [dns, setDns] = useState("");
  useEffect(() => {
    setTitle(sub?.prefs.title ?? "");
    setDns(sub?.prefs.dns ?? "");
  }, [sub?.url, sub?.prefs.title, sub?.prefs.dns]);

  if (!sub) return null;
  const p = sub.prefs;
  const set = (patch: Partial<SubPrefs>) => backend.updateSubPrefs(sub.url, patch);
  const own: { value: SubPrefs["interval"]; title: string }[] = [{ value: "global", title: "Как в общих настройках" }, ...intervals];
  const field = "w-full bg-transparent text-[16px] text-ink placeholder:text-ink-3 focus:outline-none";

  return (
    <Sheet
      open={url != null}
      onOpenChange={onOpenChange}
      title={sub.title}
      description="Настройки провайдера на этом устройстве"
      icon={<IconTile icon={Settings2} tone="teal" />}
    >
      <div className="flex flex-col gap-6">
        <Group title="Название">
          <label className="flex items-center gap-3.5 px-4 py-3.5">
            <Pencil className="size-[18px] shrink-0 text-ink-3" aria-hidden />
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              onBlur={() => set({ title: title.trim() || null })}
              onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
              placeholder={sub.providerTitle}
              maxLength={40}
              aria-label="Своё название провайдера"
              className={field}
            />
          </label>
        </Group>
        <p className="-mt-4 px-2 text-[13px] text-ink-3">Пусто — название из подписки: «{sub.providerTitle}»</p>

        <Group title="Список серверов">
          <Row
            htmlFor="pv-open"
            icon={<IconTile icon={PanelTopOpen} tone="violet" />}
            title="Не сворачивать"
            hint="Серверы провайдера всегда раскрыты"
            aside={<Switch id="pv-open" checked={p.keepOpen} onCheckedChange={(keepOpen) => set({ keepOpen })} />}
          />
          <Row
            htmlFor="pv-auto"
            icon={<IconTile icon={Zap} tone="amber" />}
            title="Участвует в автовыборе"
            hint={p.autoSelect ? "Автовыбор может взять сервер этого провайдера" : "Только если выбрать сервер вручную"}
            aside={<Switch id="pv-auto" checked={p.autoSelect} onCheckedChange={(autoSelect) => set({ autoSelect })} />}
          />
        </Group>

        <Group title="Обновлять подписку">
          <RadioGroup
            value={String(p.interval)}
            onValueChange={(v) => set({ interval: (/^\d+$/.test(v) ? Number(v) : v) as UpdateInterval | "global" })}
            className="divide-y divide-edge"
            aria-label="Как часто обновлять подписку провайдера"
          >
            {own.map((i) => (
              <label key={String(i.value)} className="flex cursor-pointer items-center gap-3.5 px-4 py-3">
                <RadioGroupItem value={String(i.value)} aria-label={i.title} />
                <span className="flex-1 font-medium">{i.title}</span>
                {i.value === "global" && <Clock className="size-4 text-ink-3" aria-hidden />}
              </label>
            ))}
          </RadioGroup>
        </Group>

        <Group title="DNS для серверов провайдера">
          <label className="flex items-center gap-3.5 px-4 py-3.5">
            <Globe className="size-[18px] shrink-0 text-ink-3" aria-hidden />
            <input
              value={dns}
              onChange={(e) => setDns(e.target.value)}
              onBlur={() => set({ dns: dns.trim() })}
              onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
              placeholder={`Общий: ${s.settings.dnsServer}`}
              inputMode="url"
              autoComplete="off"
              spellCheck={false}
              aria-label="Свой DNS провайдера"
              className={field}
            />
          </label>
        </Group>
        <p className="-mt-4 px-2 text-[13px] text-ink-3">
          Пусто — общая настройка. Подойдёт адрес вроде 1.1.1.1 или ссылка DoH: https://dns.google/dns-query
        </p>
      </div>
    </Sheet>
  );
}
