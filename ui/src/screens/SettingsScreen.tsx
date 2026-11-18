import { AppWindow, Plug, Wifi, Bell, ChevronRight, Copy, Fingerprint, FileText, Gauge, Power, Info, Palette, Plus, RefreshCw, RotateCcw, Route, Server, Trash2 } from "lucide-react";
import { useState } from "react";
import { backend, useSnapshot } from "@/backend";
import { Group, IconTile, Row } from "@/components/bits";
import { Button } from "@/components/ui/button";
import { Sheet } from "@/components/ui/sheet";
import { Switch } from "@/components/ui/switch";
import { AppearanceSheet } from "./AppearanceGroup";
import { CoreSettingsSheet } from "./CoreSettingsSheet";
import { intervalTitle, NotificationsSheet, PingSheet, UpdatesSheet } from "./PingUpdateSheets";
import { LogsSheet } from "./LogsSheet";
import { dnsPresets as dns, routes, RoutesSheet } from "./RoutesSheet";
import { themeById } from "@/lib/theme";

export function SettingsScreen({ embedded, onAdd }: { embedded?: boolean; onAdd: () => void }) {
  const s = useSnapshot();
  // Подсказка под HWID: «скопирован» на пару секунд вместо самого идентификатора.
  const [hwidNote, setHwidNote] = useState<string | null>(null);
  async function copyHwid(hwid: string) {
    try {
      await navigator.clipboard.writeText(hwid);
      setHwidNote("Скопирован — отправьте его в поддержку провайдера");
    } catch {
      setHwidNote(hwid);
    }
    window.setTimeout(() => setHwidNote(null), 3000);
  }
  const [core, setCore] = useState(false);
  const [ping, setPing] = useState(false);
  const [updates, setUpdates] = useState(false);
  const [notifications, setNotifications] = useState(false);
  const [about, setAbout] = useState(false);
  const [look, setLook] = useState(false);
  const [routing, setRouting] = useState(false);
  const [logs, setLogs] = useState(false);
  const ap = s.settings.appearance;
  const lp = s.settings.localProxy;
  const setProxy = (patch: Partial<typeof lp>) => void backend.updateSettings({ localProxy: { ...lp, ...patch } });
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

        <Group title="Серверы и подписки">
          <Row
            onClick={() => setPing(true)}
            icon={<IconTile icon={Gauge} tone="amber" />}
            title="Пинг"
            hint={`${{ tcp: "TCP", head: "HTTP HEAD", get: "HTTP GET" }[s.settings.ping.method]}, ожидание ${s.settings.ping.timeoutSec} с`}
            aside={<ChevronRight className="size-5 text-ink-3" aria-hidden />}
          />
          <Row
            onClick={() => setUpdates(true)}
            icon={<IconTile icon={RefreshCw} tone="teal" />}
            title="Обновление подписок"
            hint={intervalTitle(s.settings.updates.interval) + (s.settings.updates.onStart ? ", при запуске" : "")}
            aside={<ChevronRight className="size-5 text-ink-3" aria-hidden />}
          />
          <Row
            htmlFor="set-autoconnect"
            icon={<IconTile icon={Power} tone="green" />}
            title="Подключаться при запуске"
            hint="B-Proxy включит VPN сразу после открытия"
            aside={<Switch id="set-autoconnect" checked={s.settings.autoConnect} onCheckedChange={(v) => void backend.updateSettings({ autoConnect: v })} />}
          />
          <Row
            htmlFor="set-hwid"
            icon={<IconTile icon={Fingerprint} tone="violet" />}
            title="Отправлять HWID"
            hint={
              s.settings.sendHwid
                ? "Провайдер видит устройство и считает лимит устройств подписки"
                : "Подписки с лимитом устройств не обновятся"
            }
            aside={<Switch id="set-hwid" checked={s.settings.sendHwid} onCheckedChange={(v) => void backend.updateSettings({ sendHwid: v })} />}
          />
          {s.device && (
            <Row
              onClick={() => void copyHwid(s.device!.hwid)}
              icon={<IconTile icon={Copy} tone="gray" />}
              title="HWID устройства"
              hint={hwidNote ?? `${s.device.hwid.slice(0, 8)}… · ${[s.device.os, s.device.model].filter(Boolean).join(", ")}`}
              aside={<span className="text-[14px] text-ink-2">Скопировать</span>}
            />
          )}
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
          <Row
            onClick={onAdd}
            icon={<IconTile icon={Plus} tone="amber" />}
            title="Добавить подписку"
            hint={s.subscriptions.length === 0 ? "Ссылка из личного кабинета или Telegram-бота" : undefined}
          />
        </Group>

        {s.autostart !== null && (
          <Group title="Компьютер">
            <Row
              htmlFor="set-autostart"
              icon={<IconTile icon={Power} tone="green" />}
              title="Запускать вместе с системой"
              hint="B-Proxy стартует свёрнутым в трей"
              aside={<Switch id="set-autostart" checked={s.autostart} onCheckedChange={(v) => void backend.setAutostart(v)} />}
            />
            <Row
              htmlFor="set-tray"
              icon={<IconTile icon={AppWindow} tone="gray" />}
              title="Сворачивать в трей при закрытии"
              hint={s.settings.desktop.closeToTray ? "Крестик прячет окно, VPN продолжает работать" : "Крестик закрывает приложение и VPN"}
              aside={
                <Switch
                  id="set-tray"
                  checked={s.settings.desktop.closeToTray}
                  onCheckedChange={(v) => backend.updateDesktop({ closeToTray: v })}
                />
              }
            />
            <Row
              htmlFor="set-proxy"
              icon={<IconTile icon={Plug} tone="violet" />}
              title="Локальный прокси"
              hint={
                lp.enabled
                  ? `SOCKS5 ${lp.lan ? "0.0.0.0" : "127.0.0.1"}:${lp.port}, HTTP :${lp.port + 1} — работает, пока VPN включён`
                  : "SOCKS5 и HTTP для браузера или Telegram в настройках прокси"
              }
              aside={<Switch id="set-proxy" checked={lp.enabled} onCheckedChange={(enabled) => setProxy({ enabled })} />}
            />
            {lp.enabled && (
              <>
                <label className="flex items-center gap-3.5 px-4 py-3.5">
                  <span className="min-w-0 flex-1">
                    <span className="block text-[16px] font-medium">Порт SOCKS5</span>
                    <span className="block text-[13.5px] text-ink-2">HTTP — на следующем, {lp.port + 1}</span>
                  </span>
                  <input
                    type="number"
                    min={1024}
                    max={65534}
                    defaultValue={lp.port}
                    key={lp.port}
                    onBlur={(e) => {
                      const port = Math.round(Number(e.target.value));
                      if (port >= 1024 && port <= 65534) setProxy({ port });
                      else e.target.value = String(lp.port);
                    }}
                    aria-label="Порт SOCKS5"
                    className="w-24 rounded-xl border border-edge-2 bg-glass px-3 py-2 text-right font-display tabular-nums text-ink focus:border-amber/60 focus:outline-none"
                  />
                </label>
                <Row
                  htmlFor="set-proxy-lan"
                  icon={<IconTile icon={Wifi} tone="amber" />}
                  title="Доступ из локальной сети"
                  hint="Другие устройства в вашей Wi-Fi сети смогут ходить через этот прокси"
                  aside={<Switch id="set-proxy-lan" checked={lp.lan} onCheckedChange={(lan) => setProxy({ lan })} />}
                />
              </>
            )}
          </Group>
        )}

        <Group title="Приложение">
          <Row
            onClick={() => setNotifications(true)}
            icon={<IconTile icon={Bell} tone="amber" />}
            title="Уведомления"
            hint={s.settings.notifications.enabled ? "Обрывы VPN, срок подписки, трафик, объявления" : "Выключены"}
            aside={<ChevronRight className="size-5 text-ink-3" aria-hidden />}
          />
          <Row
            onClick={() => setLogs(true)}
            icon={<IconTile icon={FileText} tone="gray" />}
            title="Технические журналы"
            hint="Что делали приложение и ядро — для поддержки"
            aside={<ChevronRight className="size-5 text-ink-3" aria-hidden />}
          />
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
      <PingSheet open={ping} onOpenChange={setPing} />
      <UpdatesSheet open={updates} onOpenChange={setUpdates} />
      <NotificationsSheet open={notifications} onOpenChange={setNotifications} />
      <LogsSheet open={logs} onOpenChange={setLogs} />
      <AppearanceSheet open={look} onOpenChange={setLook} />
      <RoutesSheet open={routing} onOpenChange={setRouting} />
      <Sheet open={about} onOpenChange={setAbout} title="О приложении" icon={<IconTile icon={Info} tone="gray" />}>
        <Group>
          <Row title="Версия приложения" aside={<span className="text-ink-2 tabular-nums">{s.version.app}</span>} />
          <Row title="Версия Xray" aside={<span className="text-ink-2 tabular-nums">{s.version.xray}</span>} />
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
