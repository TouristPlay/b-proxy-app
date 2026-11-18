import { AppWindow, Check, Copy, Download, ExternalLink, LoaderCircle, ShieldOff, RadioTower, Plug, Bell, ChevronRight,  FileText, Gauge, Power, Info, Palette, Plus, RotateCcw, Route, Server, Trash2 } from "lucide-react";
import { useState } from "react";
import { backend, useSnapshot } from "@/backend";
import { detectPlatform } from "@/backend/xray";
import { Group, IconTile, Row } from "@/components/bits";
import { Button } from "@/components/ui/button";
import { Sheet } from "@/components/ui/sheet";
import { Switch } from "@/components/ui/switch";
import { AppearanceSheet } from "./AppearanceGroup";
import { CoreSettingsSheet } from "./CoreSettingsSheet";
import { intervalTitle, NotificationsSheet, PingSheet, ProvidersSheet } from "./PingUpdateSheets";
import { LogsSheet } from "./LogsSheet";
import { dnsPresets as dns, routes, RoutesSheet } from "./RoutesSheet";
import { themeById } from "@/lib/theme";
import { t } from "@/lib/i18n";
import { cn } from "@/lib/utils";

export function SettingsScreen({ embedded, onAdd }: { embedded?: boolean; onAdd: () => void }) {
  const s = useSnapshot();
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
  const routingHint = `${enabledRoutes.length ? enabledRoutes.join(", ") : t("Всё через VPN")}; DNS ${dnsName}`;
  const modeName = { dark: t("тёмная"), light: t("светлая"), system: t("авто") }[ap.mode];

  return (
    <div className={embedded ? "w-full" : "mx-auto w-full max-w-md px-5 pt-[max(18px,env(safe-area-inset-top))] pb-32"}>
      {!embedded && <h1 className="mb-6 font-display text-[28px] font-semibold tracking-[-0.02em]">{t("Настройки")}</h1>}

      <div className="flex flex-col gap-6">
        <Group>
          <Row
            onClick={() => setLook(true)}
            icon={<IconTile icon={Palette} tone="amber" />}
            title={t("Оформление")}
            hint={`${ap.accent ? t("Свой цвет") : themeById(ap.theme).name}, ${modeName}`}
            aside={<ChevronRight className="size-5 text-ink-3" aria-hidden />}
          />
          <Row
            onClick={() => setRouting(true)}
            icon={<IconTile icon={Route} tone="green" />}
            title={t("Маршруты и DNS")}
            hint={routingHint}
            aside={<ChevronRight className="size-5 text-ink-3" aria-hidden />}
          />
        </Group>

        <Group title={t("Провайдеры")}>
          <Row
            onClick={() => setUpdates(true)}
            icon={<IconTile icon={Server} tone="teal" />}
            title={t("Настройки провайдеров")}
            hint={[
              intervalTitle(s.settings.updates.interval),
              s.settings.updates.onStart && t("при запуске"),
              s.settings.sendHwid ? "HWID" : t("без HWID"),
            ].filter(Boolean).join(", ")}
            aside={<ChevronRight className="size-5 text-ink-3" aria-hidden />}
          />
          <Row
            onClick={() => setPing(true)}
            icon={<IconTile icon={Gauge} tone="amber" />}
            title={t("Пинг")}
            hint={t("{0}, ожидание {1} с", [{ tcp: "TCP", head: "HTTP HEAD", get: "HTTP GET" }[s.settings.ping.method], s.settings.ping.timeoutSec])}
            aside={<ChevronRight className="size-5 text-ink-3" aria-hidden />}
          />
        </Group>

        <Group title={t("Подключение")}>
          <Row
            htmlFor="set-autoconnect"
            icon={<IconTile icon={Power} tone="green" />}
            title={t("Подключаться при запуске")}
            hint={t("B-Proxy включит VPN сразу после открытия")}
            aside={<Switch id="set-autoconnect" checked={s.settings.autoConnect} onCheckedChange={(v) => void backend.updateSettings({ autoConnect: v })} />}
          />
          {detectPlatform() === "android" ? (
            <Row
              onClick={() => void backend.openVpnSettings()}
              icon={<IconTile icon={ShieldOff} tone="red" />}
              title={t("Kill switch")}
              hint={t("В Android включается в системе: «Постоянная VPN» и «Блокировать соединения без VPN»")}
              aside={<ExternalLink className="size-5 text-ink-3" aria-hidden />}
            />
          ) : (
            <Row
              htmlFor="set-kill"
              icon={<IconTile icon={ShieldOff} tone="red" />}
              title={t("Kill switch")}
              hint={
                s.settings.killSwitch
                  ? t("Если VPN оборвётся, интернет закроется, пока VPN не подключится снова")
                  : t("Закрывать интернет, если VPN оборвался")
              }
              aside={<Switch id="set-kill" checked={s.settings.killSwitch} onCheckedChange={(v) => void backend.updateSettings({ killSwitch: v })} />}
            />
          )}
          {detectPlatform() === "ios" && (
            <Row
              htmlFor="set-live"
              icon={<IconTile icon={RadioTower} tone="green" />}
              title={t("Живая активность")}
              hint={t("Статус VPN и время сеанса на экране блокировки и в Dynamic Island")}
              aside={<Switch id="set-live" checked={s.settings.liveActivity} onCheckedChange={(v) => void backend.updateSettings({ liveActivity: v })} />}
            />
          )}
        </Group>

        <Group title={t("Производительность")}>
          <Row
            onClick={() => setCore(true)}
            icon={<IconTile icon={Gauge} tone="amber" />}
            title={t("Расширенные настройки")}
            hint={t("Память {0} МБ, таймаут {1} с", [s.settings.core.memoryLimitMb, s.settings.core.idleTimeoutSec])}
            aside={
              <span className="flex items-center gap-1 text-[15px] text-ink-2">
                Xray Core <ChevronRight className="size-5 text-ink-3" aria-hidden />
              </span>
            }
          />
        </Group>

        <Group title={t("Подписки")}>
          {s.subscriptions.map((sub) => (
            <Row
              key={sub.url}
              icon={<IconTile icon={Server} tone="teal" />}
              title={sub.title}
              hint={t("{0} серв. · {1}", [sub.nodes.filter((n) => !n.divider).length, safeHost(sub.url)])}
              aside={
                <Button
                  variant="ghost"
                  size="icon"
                  className="text-bad hover:text-bad"
                  onClick={() => void backend.removeSubscription(sub.url)}
                  aria-label={t("Удалить подписку {0}", [sub.title])}
                >
                  <Trash2 />
                </Button>
              }
            />
          ))}
          <Row
            onClick={onAdd}
            icon={<IconTile icon={Plus} tone="amber" />}
            title={t("Добавить подписку")}
            hint={s.subscriptions.length === 0 ? t("Ссылка из личного кабинета или Telegram-бота") : undefined}
          />
        </Group>

        {s.autostart !== null && (
          <Group title={t("Компьютер")}>
            <AppUpdateRows />
            <Row
              htmlFor="set-autostart"
              icon={<IconTile icon={Power} tone="green" />}
              title={t("Запускать вместе с системой")}
              hint={t("B-Proxy стартует свёрнутым в трей")}
              aside={<Switch id="set-autostart" checked={s.autostart} onCheckedChange={(v) => void backend.setAutostart(v)} />}
            />
            <Row
              htmlFor="set-tray"
              icon={<IconTile icon={AppWindow} tone="gray" />}
              title={t("Сворачивать в трей при закрытии")}
              hint={s.settings.desktop.closeToTray ? t("Крестик прячет окно, VPN продолжает работать") : t("Крестик закрывает приложение и VPN")}
              aside={
                <Switch
                  id="set-tray"
                  checked={s.settings.desktop.closeToTray}
                  onCheckedChange={(v) => backend.updateDesktop({ closeToTray: v })}
                />
              }
            />
            <div>
              <Row
                htmlFor="set-proxy"
                icon={<IconTile icon={Plug} tone="violet" />}
                title={t("Локальный прокси")}
                hint={lp.enabled ? t("Работает, пока VPN включён") : t("SOCKS5 и HTTP для браузера или Telegram в настройках прокси")}
                aside={<Switch id="set-proxy" checked={lp.enabled} onCheckedChange={(enabled) => setProxy({ enabled })} />}
              />
              {lp.enabled && <ProxyDetails />}
            </div>
          </Group>
        )}

        <Group title={t("Приложение")}>
          <Row
            onClick={() => setNotifications(true)}
            icon={<IconTile icon={Bell} tone="amber" />}
            title={t("Уведомления")}
            hint={s.settings.notifications.enabled ? t("Обрывы VPN, срок подписки, трафик, объявления") : t("Выключены")}
            aside={<ChevronRight className="size-5 text-ink-3" aria-hidden />}
          />
          <Row
            onClick={() => setLogs(true)}
            icon={<IconTile icon={FileText} tone="gray" />}
            title={t("Технические журналы")}
            hint={t("Что делали приложение и ядро — для поддержки")}
            aside={<ChevronRight className="size-5 text-ink-3" aria-hidden />}
          />
          <Row
            onClick={() => setAbout(true)}
            icon={<IconTile icon={Info} tone="gray" />}
            title={t("О приложении")}
            aside={
              <span className="flex items-center gap-1 text-[15px] text-ink-2">
                B-Proxy <ChevronRight className="size-5 text-ink-3" aria-hidden />
              </span>
            }
          />
        </Group>

        <Button variant="danger" className="w-full" onClick={() => void backend.resetSettings()}>
          <RotateCcw />
          
          {t("Сбросить настройки")}
        </Button>
      </div>

      <CoreSettingsSheet open={core} onOpenChange={setCore} />
      <PingSheet open={ping} onOpenChange={setPing} />
      <ProvidersSheet open={updates} onOpenChange={setUpdates} />
      <NotificationsSheet open={notifications} onOpenChange={setNotifications} />
      <LogsSheet open={logs} onOpenChange={setLogs} />
      <AppearanceSheet open={look} onOpenChange={setLook} />
      <RoutesSheet open={routing} onOpenChange={setRouting} />
      <Sheet open={about} onOpenChange={setAbout} title={t("О приложении")} icon={<IconTile icon={Info} tone="gray" />}>
        <Group>
          <Row title={t("Версия приложения")} aside={<span className="text-ink-2 tabular-nums">{s.version.app}</span>} />
          <Row title={t("Версия Xray")} aside={<span className="text-ink-2 tabular-nums">{s.version.xray}</span>} />
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

/** Раскрытая часть «Локального прокси»: адреса с копированием, порт и доступ из сети. */
function ProxyDetails() {
  const lp = useSnapshot().settings.localProxy;
  const setProxy = (patch: Partial<typeof lp>) => void backend.updateSettings({ localProxy: { ...lp, ...patch } });
  const [copied, setCopied] = useState<string | null>(null);
  const host = lp.lan ? lanHost() : "127.0.0.1";
  const addresses = [
    { kind: "SOCKS5", value: `${host}:${lp.port}` },
    { kind: "HTTP", value: `${host}:${lp.port + 1}` },
  ];
  async function copy(value: string) {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(value);
      window.setTimeout(() => setCopied((c) => (c === value ? null : c)), 1800);
    } catch {
      /* буфер обмена недоступен — адрес и так виден */
    }
  }

  return (
    <div className="mx-4 mb-3.5 min-[460px]:ml-[70px] overflow-hidden rounded-2xl border border-edge bg-glass">
      {addresses.map((a) => (
        <button
          key={a.kind}
          type="button"
          onClick={() => void copy(a.value)}
          className="flex min-h-11 w-full items-center gap-3 border-b border-edge px-3.5 py-2 text-left transition-colors hover:bg-glass-2 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-amber"
          aria-label={t("Скопировать адрес {0} {1}", [a.kind, a.value])}
        >
          <span className="w-14 shrink-0 text-[13px] text-ink-3">{a.kind}</span>
          <span className="min-w-0 flex-1 truncate font-mono text-[14px] text-ink">{a.value}</span>
          {copied === a.value ? (
            <span className="flex items-center gap-1 text-[13px] text-good">
              <Check className="size-4" aria-hidden />
              {t("Скопирован")}
            </span>
          ) : (
            <Copy className="size-4 shrink-0 text-ink-3" aria-hidden />
          )}
        </button>
      ))}
      <label className="flex min-h-11 items-center gap-3 border-b border-edge px-3.5 py-1.5">
        <span className="flex-1 text-[14px] text-ink-2">{t("Порт")}</span>
        <input
          type="text"
          inputMode="numeric"
          pattern="[0-9]*"
          maxLength={5}
          defaultValue={lp.port}
          key={lp.port}
          onBlur={(e) => {
            const port = Math.round(Number(e.target.value));
            if (port >= 1024 && port <= 65534) setProxy({ port });
            else e.target.value = String(lp.port);
          }}
          onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
          aria-label={t("Порт SOCKS5")}
          className="w-[76px] rounded-lg border border-edge-2 bg-base/40 px-2 py-1.5 text-center font-mono text-[16px] tabular-nums text-ink md:text-[14px] focus:border-amber/60 focus:outline-none"
        />
      </label>
      <label htmlFor="set-proxy-lan" className="flex min-h-11 cursor-pointer items-center gap-3 px-3.5 py-2">
        <span className="min-w-0 flex-1">
          <span className="block text-[14px] text-ink">{t("Доступ из локальной сети")}</span>
          <span className="block text-[12.5px] leading-snug text-ink-3">{t("Для других устройств в вашей сети Wi-Fi")}</span>
        </span>
        <Switch id="set-proxy-lan" checked={lp.lan} onCheckedChange={(lan) => setProxy({ lan })} />
      </label>
    </div>
  );
}

/** Адрес для других устройств: компьютер слушает все интерфейсы, свой IP в сети приложение не знает. */
function lanHost() {
  return t("IP компьютера");
}

/** Версия приложения: проверить, скачать и установить обновление; автопроверка. */
function AppUpdateRows() {
  const { appUpdate: u, version, settings } = useSnapshot();
  if (!u) return null;
  const busy = u.state === "checking" || u.state === "downloading";
  const hint =
    u.state === "available"
      ? (u.error ?? t("Вышла версия {0}. VPN отключится на время установки", [u.version ?? ""]))
      : u.state === "downloading"
        ? u.progress != null
          ? t("Загружаем версию {0}: {1}%", [u.version ?? "", Math.round(u.progress * 100)])
          : t("Загружаем версию {0}…", [u.version ?? ""])
        : u.state === "checking"
          ? t("Проверяем…")
          : u.state === "none"
            ? t("Версия {0} — последняя", [version.app])
            : u.state === "error"
              ? (u.error ?? "")
              : t("Версия {0}", [version.app]);
  return (
    <>
      <div>
        <Row
          icon={<IconTile icon={Download} tone={u.state === "available" ? "amber" : "gray"} />}
          title={t("Обновление приложения")}
          hint={<span aria-live="polite">{hint}</span>}
          aside={
            u.state === "downloading" ? null : u.state === "available" ? (
              <Button variant="amber" size="sm" onClick={() => void backend.installAppUpdate()}>
                {t("Обновить")}
              </Button>
            ) : (
              <Button variant="glass" size="sm" disabled={busy} onClick={() => void backend.checkAppUpdate(true)}>
                {busy && <LoaderCircle className="animate-spin" aria-hidden />}
                {t("Проверить")}
              </Button>
            )
          }
        />
        {u.state === "downloading" && (
          <div
            className="mx-4 mb-3.5 h-1.5 overflow-hidden rounded-full bg-glass-3 min-[460px]:ml-[70px]"
            role="progressbar"
            aria-label={t("Загрузка обновления")}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={u.progress != null ? Math.round(u.progress * 100) : undefined}
          >
            <div
              className={cn("h-full rounded-full bg-amber transition-[width]", u.progress == null && "w-1/3 animate-pulse")}
              style={u.progress != null ? { width: `${Math.round(u.progress * 100)}%` } : undefined}
            />
          </div>
        )}
      </div>
      <Row
        htmlFor="set-autoupdate"
        icon={<IconTile icon={RotateCcw} tone="teal" />}
        title={t("Проверять обновления сами")}
        hint={t("После запуска и раз в 12 часов. Устанавливаем только по вашей кнопке")}
        aside={
          <Switch
            id="set-autoupdate"
            checked={settings.desktop.autoUpdate}
            onCheckedChange={(v) => backend.updateDesktop({ autoUpdate: v })}
          />
        }
      />
    </>
  );
}
