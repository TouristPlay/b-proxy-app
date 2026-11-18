import type { LucideIcon } from "lucide-react";
import { ArrowDownUp, Ban, Database, Globe, House, ListX, Map as MapIcon, Network, Plus, RefreshCw, Route, Scissors, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import { backend, useSnapshot, type NetworkSettings, type Settings } from "@/backend";
import { formatBytes } from "@/lib/format";
import { Group, IconTile, Row, type Tone } from "@/components/bits";
import { Button } from "@/components/ui/button";
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
  const profileOn = s.settings.routing.enabled && s.settings.routing.profiles.some((p) => p.id === s.settings.routing.activeId);

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
        <ProfilesGroup />

        <Group title="Маршруты">
          {routes.map((r) => {
            const byProfile = profileOn && (r.key === "russianSitesDirect" || r.key === "blockAds");
            return (
            <Row
              key={r.key}
              htmlFor={`set-${r.key}`}
              icon={<IconTile icon={r.icon} tone={r.tone} />}
              title={r.title}
              hint={byProfile ? "Сейчас это решает профиль маршрутизации" : r.hint}
              aside={
                <Switch
                  id={`set-${r.key}`}
                  checked={s.settings[r.key]}
                  disabled={byProfile}
                  onCheckedChange={(v) => void backend.updateSettings({ [r.key]: v } as Partial<Settings>)}
                />
              }
            />
            );
          })}
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

        {profileOn && <p className="-mb-4 px-2 text-[13px] text-amber">DNS задаёт профиль маршрутизации — эта настройка сейчас не действует</p>}
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

/**
 * Профили маршрутизации (формат Happ/INCY, например RoscomVPN): что напрямую, что через VPN,
 * что блокировать — по базам geoip/geosite. Базы скачиваются по ссылкам из профиля.
 */
function ProfilesGroup() {
  const s = useSnapshot();
  const r = s.settings.routing;
  const [adding, setAdding] = useState(false);
  const [input, setInput] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const geo = s.geo;
  const geoText = geo?.downloading
    ? "Скачиваем базы…"
    : geo && geo.files.length
      ? geo.files.map((f) => `${f.name.replace(".dat", "")} ${formatBytes(f.size)}`).join(" · ") +
        ` · ${new Date(Math.max(...geo.files.map((f) => f.updatedAt))).toLocaleDateString("ru-RU")}`
      : "Базы ещё не скачаны";

  async function add() {
    setBusy(true);
    setError(null);
    try {
      await backend.addRoutingProfile(input);
      setInput("");
      setAdding(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <Group title="Профиль маршрутизации">
        <Row
          htmlFor="rt-on"
          icon={<IconTile icon={MapIcon} tone="violet" />}
          title="Маршрутизация по профилю"
          hint={
            r.profiles.length === 0
              ? "Готовые правила: какие сайты напрямую, какие через VPN, что блокировать"
              : r.enabled
                ? "Правила профиля заменяют «РФ напрямую», рекламу и DNS"
                : "Выключено — работают обычные маршруты ниже"
          }
          aside={
            <Switch
              id="rt-on"
              checked={r.enabled && r.profiles.length > 0}
              disabled={r.profiles.length === 0}
              onCheckedChange={(enabled) => backend.setRouting({ enabled, activeId: r.activeId ?? r.profiles[0]?.id ?? null })}
            />
          }
        />
        {r.profiles.length > 0 && (
          <RadioGroup
            value={r.activeId ?? ""}
            onValueChange={(activeId) => backend.setRouting({ activeId, enabled: true })}
            className="divide-y divide-edge"
            aria-label="Активный профиль маршрутизации"
          >
            {r.profiles.map((p) => {
              const count =
                p.directSites.length + p.directIp.length + p.proxySites.length + p.proxyIp.length + p.blockSites.length + p.blockIp.length;
              return (
                <div key={p.id} className="flex items-center gap-3.5 px-4 py-3">
                  <label className="flex min-w-0 flex-1 cursor-pointer items-center gap-3.5">
                    <RadioGroupItem value={p.id} aria-label={p.name} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-medium">{p.name}</span>
                      <span className="block truncate text-[13px] text-ink-2">
                        {count} правил · остальное {p.globalProxy ? "через VPN" : "напрямую"}
                        {p.source ? " · по ссылке" : ""}
                      </span>
                    </span>
                  </label>
                  <button
                    type="button"
                    onClick={() => backend.removeRoutingProfile(p.id)}
                    aria-label={`Удалить профиль ${p.name}`}
                    className="flex size-10 shrink-0 items-center justify-center rounded-full text-ink-3 transition-colors hover:bg-bad/10 hover:text-bad"
                  >
                    <Trash2 className="size-[18px]" />
                  </button>
                </div>
              );
            })}
          </RadioGroup>
        )}
        {r.profiles.length > 0 && (
          <Row
            onClick={() => void backend.updateGeo()}
            icon={<IconTile icon={Database} tone="blue" />}
            title="Обновить базы geoip и geosite"
            hint={geoText}
            aside={<RefreshCw className={`size-5 text-ink-3 ${geo?.downloading ? "animate-spin" : ""}`} aria-hidden />}
          />
        )}
        <Row
          onClick={() => setAdding(true)}
          icon={<IconTile icon={Plus} tone="amber" />}
          title="Добавить профиль"
          hint="Ссылка happ://routing/…, incy://routing/…, адрес https или JSON"
        />
      </Group>

      <Sheet
        open={adding}
        onOpenChange={(o) => {
          setAdding(o);
          if (!o) setError(null);
        }}
        title="Профиль маршрутизации"
        description="Вставьте диплинк, ссылку на профиль или его JSON. Подойдут профили для Happ и INCY"
        icon={<IconTile icon={MapIcon} tone="violet" />}
      >
        <form
          className="flex flex-col gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            if (input.trim()) void add();
          }}
        >
          <textarea
            autoFocus
            value={input}
            onChange={(e) => setInput(e.target.value)}
            rows={5}
            spellCheck={false}
            autoComplete="off"
            placeholder={"happ://routing/onadd/eyJOYW1lIjoi…\nhttps://…/DEFAULT.JSON"}
            aria-label="Профиль маршрутизации"
            aria-invalid={error ? true : undefined}
            className="glass min-h-32 w-full resize-y rounded-2xl px-4 py-3 font-mono text-[13.5px] leading-relaxed text-ink placeholder:text-ink-3 focus:outline-none focus:ring-2 focus:ring-amber/40"
          />
          {error && (
            <p className="px-1 text-[14px] text-bad" role="alert">
              {error}
            </p>
          )}
          <p className="px-1 text-[13px] text-ink-3">
            Базы geoip и geosite скачаются по ссылкам из профиля и будут обновляться раз в неделю.
          </p>
          <Button type="submit" variant="amber" className="min-h-12 w-full" disabled={busy || !input.trim()}>
            {busy ? "Добавляем…" : "Добавить и включить"}
          </Button>
        </form>
      </Sheet>
    </>
  );
}
