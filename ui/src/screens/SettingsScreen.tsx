import type { LucideIcon } from "lucide-react";
import { Ban, ChevronRight, Gauge, Globe, Info, Network, Palette, RotateCcw, Route, Scissors, Server, Trash2 } from "lucide-react";
import { useState } from "react";
import { backend, useSnapshot, type Settings } from "@/backend";
import { Group, IconTile, Row, type Tone } from "@/components/bits";
import { Button } from "@/components/ui/button";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Sheet } from "@/components/ui/sheet";
import { Switch } from "@/components/ui/switch";
import { AppearanceSheet } from "./AppearanceGroup";
import { CoreSettingsSheet } from "./CoreSettingsSheet";
import { themeById } from "@/lib/theme";

type BoolKey = { [K in keyof Settings]: Settings[K] extends boolean ? K : never }[keyof Settings];

const routes: { key: BoolKey; title: string; short: string; hint: string; icon: LucideIcon; tone: Tone }[] = [
  {
    key: "russianSitesDirect",
    title: "Российские сайты без VPN",
    short: "РФ напрямую",
    hint: "Банки, Госуслуги, сайты .ru и .рф открываются напрямую",
    icon: Globe,
    tone: "green",
  },
  {
    key: "tlsFragment",
    title: "Обход блокировок DPI",
    short: "обход DPI",
    hint: "Дробит начало соединения. Включайте, если сервер не отвечает",
    icon: Scissors,
    tone: "violet",
  },
  { key: "blockAds", title: "Блокировать рекламу", short: "без рекламы", hint: "Отсекает основные рекламные домены", icon: Ban, tone: "red" },
  { key: "ipv6", title: "IPv6", short: "IPv6", hint: "Нужен, только если сервер его поддерживает", icon: Network, tone: "blue" },
];

const dns = [
  { value: "1.1.1.1", title: "Cloudflare" },
  { value: "8.8.8.8", title: "Google" },
  { value: "9.9.9.9", title: "Quad9" },
];

export function SettingsScreen({ embedded }: { embedded?: boolean }) {
  const s = useSnapshot();
  const [core, setCore] = useState(false);
  const [about, setAbout] = useState(false);
  const [look, setLook] = useState(false);
  const [routing, setRouting] = useState(false);
  const ap = s.settings.appearance;
  const enabledRoutes = routes.filter((r) => s.settings[r.key]).map((r) => r.short);
  const dnsName = dns.find((d) => d.value === s.settings.dnsServer)?.title ?? s.settings.dnsServer;
  const routingHint = `${enabledRoutes.length ? enabledRoutes.join(", ") : "Всё через VPN"}; DNS ${dnsName}`;
  const modeName = { dark: "тёмная", light: "светлая", system: "авто" }[ap.mode];

  return (
    <div className={embedded ? "w-full" : "mx-auto w-full max-w-md px-5 pt-[max(18px,env(safe-area-inset-top))] pb-32"}>
      {!embedded && <h1 className="mb-6 font-display text-[28px] font-semibold tracking-[-0.02em]">Настройки</h1>}

      <div className="flex flex-col gap-6">
        <Group>
          <Row
            onClick={() => setLook(true)}
            icon={<IconTile icon={Palette} tone="amber" />}
            title="Оформление"
            hint={`${ap.accent ? "Свой цвет" : themeById(ap.theme).name}, ${modeName}`}
            aside={<ChevronRight className="size-5 text-ink-3" aria-hidden />}
          />
          <Row
            onClick={() => setRouting(true)}
            icon={<IconTile icon={Route} tone="green" />}
            title="Маршруты и DNS"
            hint={routingHint}
            aside={<ChevronRight className="size-5 text-ink-3" aria-hidden />}
          />
        </Group>

        <Group title="Производительность">
          <Row
            onClick={() => setCore(true)}
            icon={<IconTile icon={Gauge} tone="amber" />}
            title="Расширенные настройки"
            hint={`Память ${s.settings.core.memoryLimitMb} МБ, таймаут ${s.settings.core.idleTimeoutSec} с`}
            aside={
              <span className="flex items-center gap-1 text-[15px] text-ink-2">
                Xray Core <ChevronRight className="size-5 text-ink-3" aria-hidden />
              </span>
            }
          />
        </Group>

        <Group title="Подписки">
          {s.subscriptions.length === 0 && (
            <p className="px-4 py-4 text-[15px] text-ink-2">Добавьте подписку на главном экране — серверы появятся здесь</p>
          )}
          {s.subscriptions.map((sub) => (
            <Row
              key={sub.url}
              icon={<IconTile icon={Server} tone="teal" />}
              title={sub.title}
              hint={`${sub.nodes.filter((n) => !n.divider).length} серв. · ${safeHost(sub.url)}`}
              aside={
                <Button
                  variant="ghost"
                  size="icon"
                  className="text-bad hover:text-bad"
                  onClick={() => void backend.removeSubscription(sub.url)}
                  aria-label={`Удалить подписку ${sub.title}`}
                >
                  <Trash2 />
                </Button>
              }
            />
          ))}
        </Group>

        <Group title="Приложение">
          <Row
            onClick={() => setAbout(true)}
            icon={<IconTile icon={Info} tone="gray" />}
            title="О приложении"
            aside={
              <span className="flex items-center gap-1 text-[15px] text-ink-2">
                B-Proxy <ChevronRight className="size-5 text-ink-3" aria-hidden />
              </span>
            }
          />
        </Group>

        <Button variant="danger" className="w-full" onClick={() => void backend.resetSettings()}>
          <RotateCcw />
          Сбросить настройки
        </Button>
      </div>

      <CoreSettingsSheet open={core} onOpenChange={setCore} />
      <AppearanceSheet open={look} onOpenChange={setLook} />
      <Sheet
        open={routing}
        onOpenChange={setRouting}
        wide
        title="Маршруты и DNS"
        description="Что идёт через VPN, а что напрямую"
        icon={<IconTile icon={Route} tone="green" />}
      >
        <div className="flex flex-col gap-6">
          <Group title="Маршруты">
            {routes.map((r) => (
              <Row
                key={r.key}
                htmlFor={`set-${r.key}`}
                icon={<IconTile icon={r.icon} tone={r.tone} />}
                title={r.title}
                hint={r.hint}
                aside={
                  <Switch
                    id={`set-${r.key}`}
                    checked={s.settings[r.key]}
                    onCheckedChange={(v) => void backend.updateSettings({ [r.key]: v } as Partial<Settings>)}
                  />
                }
              />
            ))}
          </Group>

          <Group title="DNS внутри туннеля">
            <RadioGroup
              value={s.settings.dnsServer}
              onValueChange={(v) => void backend.updateSettings({ dnsServer: v })}
              className="divide-y divide-edge"
              aria-label="DNS-сервер"
            >
              {dns.map((d) => (
                <label key={d.value} className="flex cursor-pointer items-center gap-3.5 px-4 py-3.5">
                  <RadioGroupItem value={d.value} aria-label={d.title} />
                  <span className="flex-1 font-medium">{d.title}</span>
                  <span className="text-sm text-ink-3 tabular-nums">{d.value}</span>
                </label>
              ))}
            </RadioGroup>
          </Group>
        </div>
      </Sheet>
      <Sheet open={about} onOpenChange={setAbout} title="О приложении" icon={<IconTile icon={Info} tone="gray" />}>
        <Group>
          <Row title="Версия приложения" aside={<span className="text-ink-2 tabular-nums">{s.version.app}</span>} />
          <Row title="Версия Xray" aside={<span className="text-ink-2 tabular-nums">{s.version.xray}</span>} />
          <Row title="Провайдер" aside={<span className="text-ink-2">BaobabVPN</span>} />
        </Group>
      </Sheet>
    </div>
  );
}

function safeHost(url: string) {
  try {
    return new URL(url).host;
  } catch {
    return url;
  }
}
