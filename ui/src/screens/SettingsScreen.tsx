import { Trash2 } from "lucide-react";
import { backend, useSnapshot, type Settings } from "@/backend";
import { SectionTitle } from "@/components/bits";
import { Button } from "@/components/ui/button";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Switch } from "@/components/ui/switch";

type BoolKey = { [K in keyof Settings]: Settings[K] extends boolean ? K : never }[keyof Settings];

const toggles: { key: BoolKey; title: string; hint: string }[] = [
  {
    key: "russianSitesDirect",
    title: "Российские сайты без VPN",
    hint: "Банки, Госуслуги и сайты в зонах .ru, .рф, .su открываются напрямую",
  },
  {
    key: "tlsFragment",
    title: "Обход блокировок по DPI",
    hint: "Дробит начало зашифрованного соединения. Включайте, если сервер не отвечает",
  },
  { key: "blockAds", title: "Блокировать рекламу", hint: "Отсекает основные рекламные домены" },
  { key: "ipv6", title: "IPv6", hint: "Нужен, только если ваш сервер его поддерживает" },
];

const dnsOptions = [
  { value: "1.1.1.1", title: "Cloudflare", address: "1.1.1.1" },
  { value: "8.8.8.8", title: "Google", address: "8.8.8.8" },
  { value: "9.9.9.9", title: "Quad9", address: "9.9.9.9" },
];

export function SettingsScreen() {
  const s = useSnapshot();

  return (
    <div className="mx-auto w-full max-w-xl px-6 pt-[max(24px,env(safe-area-inset-top))] pb-8">
      <h1 className="font-display text-2xl font-semibold tracking-[-0.02em]">Настройки</h1>
      <p className="mt-1 text-[15px] text-ink-muted">Изменения сразу применяются к текущему подключению.</p>

      <SectionTitle>Маршруты</SectionTitle>
      <div className="divide-y divide-line overflow-hidden rounded-row bg-dusk">
        {toggles.map((t) => {
          const id = `setting-${t.key}`;
          return (
            <label key={t.key} htmlFor={id} className="flex cursor-pointer items-center gap-4 px-4 py-4">
              <span className="flex-1">
                <span className="block font-medium">{t.title}</span>
                <span className="mt-0.5 block text-sm leading-snug text-ink-muted">{t.hint}</span>
              </span>
              <Switch
                id={id}
                checked={s.settings[t.key]}
                onCheckedChange={(v) => void backend.updateSettings({ [t.key]: v } as Partial<Settings>)}
              />
            </label>
          );
        })}
      </div>

      <SectionTitle>DNS</SectionTitle>
      <RadioGroup
        value={s.settings.dnsServer}
        onValueChange={(v) => void backend.updateSettings({ dnsServer: v })}
        className="divide-y divide-line overflow-hidden rounded-row bg-dusk"
        aria-label="DNS-сервер"
      >
        {dnsOptions.map((o) => (
          <label key={o.value} className="flex cursor-pointer items-center gap-4 px-4 py-4">
            <RadioGroupItem value={o.value} aria-label={o.title} />
            <span className="flex-1 font-medium">{o.title}</span>
            <span className="text-sm text-ink-faint tabular-nums">{o.address}</span>
          </label>
        ))}
      </RadioGroup>

      <SectionTitle>Подписки</SectionTitle>
      {s.subscriptions.length === 0 ? (
        <p className="text-[15px] text-ink-muted">Подписок пока нет.</p>
      ) : (
        <ul className="divide-y divide-line overflow-hidden rounded-row bg-dusk">
          {s.subscriptions.map((sub) => (
            <li key={sub.url} className="flex items-center gap-3 py-2 pr-2 pl-4">
              <span className="min-w-0 flex-1">
                <span className="block font-medium">{sub.title}</span>
                <span className="block truncate text-sm text-ink-faint">{new URL(sub.url).host}</span>
              </span>
              <Button
                variant="danger"
                size="icon"
                onClick={() => void backend.removeSubscription(sub.url)}
                aria-label={`Удалить подписку ${sub.title}`}
              >
                <Trash2 />
              </Button>
            </li>
          ))}
        </ul>
      )}

      <p className="mt-10 text-center text-sm text-ink-faint">B-Proxy 0.1.0 на ядре Xray</p>
    </div>
  );
}
