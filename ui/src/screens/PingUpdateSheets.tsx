import { Bell, BellRing, Gauge, Minus, Plus, Power, RefreshCw } from "lucide-react";
import {
  backend,
  useSnapshot,
  type NotificationSettings,
  type PingMethod,
  type PingSettings,
  type UpdateInterval,
  type UpdateSettings,
} from "@/backend";
import { Button } from "@/components/ui/button";
import { Group, IconTile, Row } from "@/components/bits";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Sheet } from "@/components/ui/sheet";
import { Switch } from "@/components/ui/switch";
import { t } from "@/lib/i18n";

const methods: { value: PingMethod; title: string; hint: string }[] = [
  {
    value: "tcp",
    title: "TCP",
    hint: t("Время соединения с адресом сервера. Быстро и без ядра, но не проверяет, работает ли сам прокси"),
  },
  {
    value: "head",
    title: "HTTP HEAD",
    hint: t("Реальная задержка: запрос заголовков через сервер к проверочному адресу. Проверяет, что прокси работает"),
  },
  {
    value: "get",
    title: "HTTP GET",
    hint: t("Как HEAD, но с загрузкой ответа (до 64 КБ). Ближе всего к открытию сайта, тратит чуть больше трафика"),
  },
];

const timeouts = [3, 5, 8, 10];

/** Настройки пинга: способ, время ожидания, проверочный адрес, замер при запуске. */
export function PingSheet({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const { settings } = useSnapshot();
  const p = settings.ping;
  const set = (patch: Partial<PingSettings>) => void backend.updateSettings({ ping: { ...p, ...patch } });

  return (
    <Sheet open={open} onOpenChange={onOpenChange} title={t("Пинг")} description={t("Как проверять скорость отклика серверов")} icon={<IconTile icon={Gauge} tone="amber" />}>
      <div className="flex flex-col gap-6">
        <Group title={t("Способ")}>
          <RadioGroup value={p.method} onValueChange={(v) => set({ method: v as PingMethod })} className="divide-y divide-edge" aria-label={t("Способ пинга")}>
            {methods.map((m) => (
              <label key={m.value} className="flex cursor-pointer items-start gap-3.5 px-4 py-3.5">
                <RadioGroupItem value={m.value} aria-label={m.title} className="mt-0.5" />
                <span className="flex-1">
                  <span className="block font-medium">{m.title}</span>
                  <span className="mt-0.5 block text-[13.5px] leading-snug text-ink-2">{m.hint}</span>
                </span>
              </label>
            ))}
          </RadioGroup>
        </Group>

        <Group title={t("Ожидание ответа")}>
          <div className="flex items-center gap-3 px-4 py-3.5">
            <span className="flex-1 font-medium">{t("Не отвечает дольше")}</span>
            <Stepper
              value={p.timeoutSec}
              options={timeouts}
              format={(v) => t("{0} с", [v])}
              onChange={(timeoutSec) => set({ timeoutSec })}
              label={t("Время ожидания пинга, секунд")}
            />
          </div>
        </Group>

        {p.method !== "tcp" && (
          <Group title={t("Проверочный адрес")}>
            <label className="block px-4 py-3.5 focus-within:ring-2 focus-within:ring-amber/50 focus-within:ring-inset">
              <input
                type="url"
                inputMode="url"
                autoComplete="off"
                spellCheck={false}
                value={p.url}
                onChange={(e) => set({ url: e.target.value.trim() })}
                className="w-full bg-transparent text-[16px] text-ink focus:outline-none"
                aria-label={t("Проверочный адрес для реальной задержки")}
              />
              <span className="mt-1 block text-[13px] text-ink-3">
                {p.method === "get"
                  ? t("Для GET подойдёт небольшая страница — например, cp.cloudflare.com или generate_204 от Google")
                  : t("Отвечает пустой страницей и быстро — например, generate_204 от Google")}
              </span>
            </label>
          </Group>
        )}

        <Group>
          <Row
            htmlFor="ping-start"
            icon={<IconTile icon={Power} tone="green" />}
            title={t("Мерить при запуске")}
            hint={t("Пинг выбранного провайдера — чтобы автовыбор сразу взял быстрый сервер")}
            aside={<Switch id="ping-start" checked={p.onStart} onCheckedChange={(onStart) => set({ onStart })} />}
          />
        </Group>
      </div>
    </Sheet>
  );
}

export const intervals: { value: UpdateInterval; title: string }[] = [
  { value: "provider", title: t("Как просит провайдер") },
  { value: 1, title: t("Каждый час") },
  { value: 3, title: t("Каждые 3 часа") },
  { value: 6, title: t("Каждые 6 часов") },
  { value: 12, title: t("Каждые 12 часов") },
  { value: 24, title: t("Раз в сутки") },
  { value: "off", title: t("Только вручную") },
];

export const intervalTitle = (v: UpdateInterval) => intervals.find((i) => i.value === v)?.title ?? "";

/** Настройки обновления подписок: как часто и при запуске. */
export function UpdatesSheet({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const { settings } = useSnapshot();
  const u = settings.updates;
  const set = (patch: Partial<UpdateSettings>) => void backend.updateSettings({ updates: { ...u, ...patch } });

  return (
    <Sheet
      open={open}
      onOpenChange={onOpenChange}
      title={t("Обновление подписок")}
      description={t("Списки серверов, трафик и сроки от провайдеров")}
      icon={<IconTile icon={RefreshCw} tone="teal" />}
    >
      <div className="flex flex-col gap-6">
        <Group title={t("Обновлять автоматически")}>
          <RadioGroup
            value={String(u.interval)}
            onValueChange={(v) => set({ interval: (/^\d+$/.test(v) ? Number(v) : v) as UpdateInterval })}
            className="divide-y divide-edge"
            aria-label={t("Как часто обновлять подписки")}
          >
            {intervals.map((i) => (
              <label key={String(i.value)} className="flex cursor-pointer items-center gap-3.5 px-4 py-3.5">
                <RadioGroupItem value={String(i.value)} aria-label={i.title} />
                <span className="flex-1 font-medium">{i.title}</span>
                {i.value === "provider" && <span className="text-[13px] text-ink-3">{t("обычно 12 ч")}</span>}
              </label>
            ))}
          </RadioGroup>
        </Group>
        <Group>
          <Row
            htmlFor="upd-start"
            icon={<IconTile icon={Power} tone="green" />}
            title={t("Обновлять при запуске")}
            hint={t("Свежие серверы сразу после открытия приложения")}
            aside={<Switch id="upd-start" checked={u.onStart} onCheckedChange={(onStart) => set({ onStart })} />}
          />
          <Row
            htmlFor="upd-ping"
            icon={<IconTile icon={Gauge} tone="amber" />}
            title={t("Пинг после обновления")}
            hint={t("Сразу проверить серверы провайдера, когда пришёл свежий список")}
            aside={<Switch id="upd-ping" checked={u.pingAfter} onCheckedChange={(pingAfter) => set({ pingAfter })} />}
          />
        </Group>
        <Group title="User-Agent">
          <label className="block px-4 py-3.5 focus-within:ring-2 focus-within:ring-amber/50 focus-within:ring-inset">
            <input
              defaultValue={settings.userAgent}
              key={settings.userAgent}
              onBlur={(e) => void backend.updateSettings({ userAgent: e.target.value.trim() })}
              onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
              placeholder={t("Стандартный")}
              autoComplete="off"
              spellCheck={false}
              aria-label={t("Свой User-Agent для загрузки подписок")}
              className="w-full bg-transparent font-mono text-[16px] text-ink md:text-[14px] placeholder:font-sans placeholder:text-ink-3 focus:outline-none"
            />
            <span className="mt-1 block text-[13px] text-ink-3">
              
              {t("Меняйте, только если провайдер просит. Пусто — стандартный: панель отдаёт полный конфиг серверов")}
            </span>
          </label>
        </Group>
        <p className="px-2 text-[13px] text-ink-3">
          
          {t("Обновить одного провайдера вручную — кнопкой рядом с его названием в «Серверах».")}
        </p>
      </div>
    </Sheet>
  );
}

function Stepper({
  value,
  options,
  format,
  onChange,
  label,
}: {
  value: number;
  options: number[];
  format: (v: number) => string;
  onChange: (v: number) => void;
  label: string;
}) {
  const i = Math.max(0, options.indexOf(value));
  return (
    <div className="flex items-center gap-1" role="group" aria-label={label}>
      <button
        type="button"
        className="flex size-10 items-center justify-center rounded-full border border-edge-2 text-ink-2 hover:text-ink disabled:opacity-40"
        onClick={() => onChange(options[i - 1])}
        disabled={i === 0}
        aria-label={t("Меньше")}
      >
        <Minus className="size-4" />
      </button>
      <span className="w-14 text-center font-display font-semibold tabular-nums" aria-live="polite">
        {format(value)}
      </span>
      <button
        type="button"
        className="flex size-10 items-center justify-center rounded-full border border-edge-2 text-ink-2 hover:text-ink disabled:opacity-40"
        onClick={() => onChange(options[i + 1])}
        disabled={i === options.length - 1}
        aria-label={t("Больше")}
      >
        <Plus className="size-4" />
      </button>
    </div>
  );
}

const notifyTypes: { key: Exclude<keyof NotificationSettings, "enabled">; title: string; hint: string }[] = [
  { key: "disconnect", title: t("VPN отключился"), hint: t("Обрыв сети, сервер не отвечает или туннель закрыла система") },
  { key: "expiry", title: t("Срок подписки"), hint: t("За 3 дня, за день и когда подписка закончилась") },
  { key: "traffic", title: t("Трафик заканчивается"), hint: t("Израсходовано 90% лимита — для подписок с лимитом") },
  { key: "announce", title: t("Объявления провайдера"), hint: t("Провайдер обновил текст в подписке") },
];

/** Системные уведомления: общий выключатель, типы и проверка. */
export function NotificationsSheet({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const { settings } = useSnapshot();
  const n = settings.notifications;
  const set = (patch: Partial<NotificationSettings>) => void backend.updateSettings({ notifications: { ...n, ...patch } });

  return (
    <Sheet
      open={open}
      onOpenChange={onOpenChange}
      title={t("Уведомления")}
      description={t("Системные уведомления — даже когда B-Proxy свёрнут")}
      icon={<IconTile icon={Bell} tone="amber" />}
    >
      <div className="flex flex-col gap-6">
        <Group>
          <Row
            htmlFor="notify-all"
            icon={<IconTile icon={Bell} tone="amber" />}
            title={t("Показывать уведомления")}
            aside={<Switch id="notify-all" checked={n.enabled} onCheckedChange={(enabled) => set({ enabled })} />}
          />
        </Group>
        <Group title={t("О чём сообщать")}>
          {notifyTypes.map((t) => (
            <Row
              key={t.key}
              htmlFor={`notify-${t.key}`}
              title={t.title}
              hint={t.hint}
              aside={
                <Switch id={`notify-${t.key}`} checked={n.enabled && n[t.key]} disabled={!n.enabled} onCheckedChange={(v) => set({ [t.key]: v })} />
              }
            />
          ))}
        </Group>
        <Button variant="glass" onClick={() => void backend.testNotification()}>
          <BellRing />
          
          {t("Показать пример")}
        </Button>
        <p className="px-2 text-[13px] text-ink-3">
          
          {t("Если пример не появился, разрешите уведомления для B-Proxy в настройках системы.")}
        </p>
      </div>
    </Sheet>
  );
}
