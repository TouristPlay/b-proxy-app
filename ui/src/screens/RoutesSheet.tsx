import type { LucideIcon } from "lucide-react";
import { ArrowDownUp, Ban, Globe, House, ListX, Network, Route, Scissors } from "lucide-react";
import { useEffect, useState } from "react";
import { backend, useSnapshot, type NetworkSettings, type Settings } from "@/backend";
import { Group, IconTile, Row, type Tone } from "@/components/bits";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Sheet } from "@/components/ui/sheet";
import { Switch } from "@/components/ui/switch";

type BoolKey = { [K in keyof Settings]: Settings[K] extends boolean ? K : never }[keyof Settings];

export const routes: { key: BoolKey; title: string; short: string; hint: string; icon: LucideIcon; tone: Tone }[] = [
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

export const dnsPresets = [
  { value: "1.1.1.1", title: "Cloudflare" },
  { value: "8.8.8.8", title: "Google" },
  { value: "9.9.9.9", title: "Quad9" },
  { value: "https://1.1.1.1/dns-query", title: "Cloudflare DoH" },
];

/** «Маршруты и DNS»: что идёт через VPN, локальная сеть, свои исключения, DNS. */
export function RoutesSheet({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const s = useSnapshot();
  const n = s.settings.network;
  const setNet = (patch: Partial<NetworkSettings>) => void backend.updateSettings({ network: { ...n, ...patch } });

  // Исключения и свой DNS правим в черновике и сохраняем, когда поле потеряло фокус.
  const [exclusions, setExclusions] = useState(n.exclusions.join("\n"));
  useEffect(() => setExclusions(n.exclusions.join("\n")), [n.exclusions]);
  const preset = dnsPresets.some((d) => d.value === s.settings.dnsServer);
  const [customDns, setCustomDns] = useState(preset ? "" : s.settings.dnsServer);
  const [custom, setCustom] = useState(!preset);
  useEffect(() => {
    if (!dnsPresets.some((d) => d.value === s.settings.dnsServer)) {
      setCustomDns(s.settings.dnsServer);
      setCustom(true);
    }
  }, [s.settings.dnsServer]);

  const field = "w-full bg-transparent text-[15px] text-ink placeholder:text-ink-3 focus:outline-none";

  return (
    <Sheet
      open={open}
      onOpenChange={onOpenChange}
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
          {s.settings.ipv6 && (
            <Row
              htmlFor="net-v6"
              icon={<IconTile icon={ArrowDownUp} tone="blue" />}
              title="Сначала IPv6"
              hint={n.preferIpv6 ? "Сайты, у которых есть IPv6, открываются по нему" : "Сначала IPv4, IPv6 — если нет другого"}
              aside={<Switch id="net-v6" checked={n.preferIpv6} onCheckedChange={(preferIpv6) => setNet({ preferIpv6 })} />}
            />
          )}
        </Group>

        <Group title="Локальная сеть">
          <Row
            htmlFor="net-lan"
            icon={<IconTile icon={House} tone="green" />}
            title="Локальная сеть мимо VPN"
            hint={
              n.lanDirect
                ? "Роутер, принтер, NAS и Chromecast доступны как обычно"
                : "Адреса вида 192.168.x.x тоже идут через сервер — нужно редко"
            }
            aside={<Switch id="net-lan" checked={n.lanDirect} onCheckedChange={(lanDirect) => setNet({ lanDirect })} />}
          />
        </Group>

        <Group title="Исключения — напрямую, мимо VPN">
          <label className="block px-4 py-3.5">
            <span className="mb-2 flex items-center gap-2.5 text-[13.5px] text-ink-2">
              <ListX className="size-4 shrink-0" aria-hidden />
              По одному в строке: сайт, IP или подсеть
            </span>
            <textarea
              value={exclusions}
              onChange={(e) => setExclusions(e.target.value)}
              onBlur={() =>
                setNet({
                  exclusions: exclusions
                    .split("\n")
                    .map((x) => x.trim())
                    .filter(Boolean),
                })
              }
              rows={4}
              spellCheck={false}
              autoComplete="off"
              placeholder={"example.com\n192.168.50.0/24\n203.0.113.7"}
              aria-label="Исключения: сайты и адреса, которые идут напрямую"
              className={`${field} min-h-24 resize-y font-mono text-[14px] leading-relaxed`}
            />
          </label>
        </Group>

        <Group title="DNS внутри туннеля">
          <RadioGroup
            value={custom ? "custom" : s.settings.dnsServer}
            onValueChange={(v) => {
              if (v === "custom") {
                setCustom(true);
                if (customDns.trim()) void backend.updateSettings({ dnsServer: customDns.trim() });
                return;
              }
              setCustom(false);
              void backend.updateSettings({ dnsServer: v });
            }}
            className="divide-y divide-edge"
            aria-label="DNS-сервер"
          >
            {dnsPresets.map((d) => (
              <label key={d.value} className="flex cursor-pointer items-center gap-3.5 px-4 py-3.5">
                <RadioGroupItem value={d.value} aria-label={d.title} />
                <span className="flex-1 font-medium">{d.title}</span>
                <span className="max-w-[45%] truncate text-sm text-ink-3 tabular-nums">{d.value.replace(/^https:\/\//, "")}</span>
              </label>
            ))}
            <div className="px-4 py-3.5">
              <label className="flex cursor-pointer items-center gap-3.5">
                <RadioGroupItem value="custom" aria-label="Свой DNS" />
                <span className="flex-1 font-medium">Свой</span>
              </label>
              {custom && (
                <div className="mt-3 rounded-xl border border-edge-2 bg-glass px-3 py-2.5 focus-within:border-amber/60">
                  <input
                    value={customDns}
                    onChange={(e) => setCustomDns(e.target.value)}
                    onBlur={() => customDns.trim() && void backend.updateSettings({ dnsServer: customDns.trim() })}
                    onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
                    placeholder="77.88.8.8, https://dns.google/dns-query"
                    inputMode="url"
                    autoComplete="off"
                    spellCheck={false}
                    aria-label="Свой DNS: адреса или ссылки DoH через запятую"
                    className={field}
                  />
                </div>
              )}
            </div>
          </RadioGroup>
        </Group>
        <p className="-mt-4 px-2 text-[13px] text-ink-3">Можно несколько через запятую: первый — основной, остальные — запасные.</p>
      </div>
    </Sheet>
  );
}
