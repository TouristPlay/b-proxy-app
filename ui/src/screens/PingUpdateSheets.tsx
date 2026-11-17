import { Gauge, Minus, Plus, Power, RefreshCw } from "lucide-react";
import { backend, useSnapshot, type PingMethod, type PingSettings, type UpdateInterval, type UpdateSettings } from "@/backend";
import { Group, IconTile, Row } from "@/components/bits";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Sheet } from "@/components/ui/sheet";
import { Switch } from "@/components/ui/switch";

const methods: { value: PingMethod; title: string; hint: string }[] = [
  {
    value: "tcp",
    title: "TCP",
    hint: "Время соединения с адресом сервера. Быстро и без ядра, но не проверяет, работает ли сам прокси",
  },
  {
    value: "real",
    title: "Реальная задержка",
    hint: "Запрос через сервер к проверочному адресу — как будет работать VPN. Дольше и тратит немного трафика",
  },
];

const timeouts = [3, 5, 8, 10];

/** Настройки пинга: способ, время ожидания, проверочный адрес, замер при запуске. */
export function PingSheet({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const { settings } = useSnapshot();
  const p = settings.ping;
  const set = (patch: Partial<PingSettings>) => void backend.updateSettings({ ping: { ...p, ...patch } });

  return (
    <Sheet open={open} onOpenChange={onOpenChange} title="Пинг" description="Как проверять скорость отклика серверов" icon={<IconTile icon={Gauge} tone="amber" />}>
      <div className="flex flex-col gap-6">
        <Group title="Способ">
          <RadioGroup value={p.method} onValueChange={(v) => set({ method: v as PingMethod })} className="divide-y divide-edge" aria-label="Способ пинга">
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

        <Group title="Ожидание ответа">
          <div className="flex items-center gap-3 px-4 py-3.5">
            <span className="flex-1 font-medium">Не отвечает дольше</span>
            <Stepper
              value={p.timeoutSec}
              options={timeouts}
              format={(v) => `${v} с`}
              onChange={(timeoutSec) => set({ timeoutSec })}
              label="Время ожидания пинга, секунд"
            />
          </div>
        </Group>

        {p.method === "real" && (
          <Group title="Проверочный адрес">
            <label className="block px-4 py-3.5">
              <input
                type="url"
                inputMode="url"
                autoComplete="off"
                spellCheck={false}
                value={p.url}
                onChange={(e) => set({ url: e.target.value.trim() })}
                className="w-full bg-transparent text-[15px] text-ink focus:outline-none"
                aria-label="Проверочный адрес для реальной задержки"
              />
              <span className="mt-1 block text-[13px] text-ink-3">Отвечает пустой страницей и быстро — например, generate_204 от Google</span>
            </label>
          </Group>
        )}

        <Group>
          <Row
            htmlFor="ping-start"
            icon={<IconTile icon={Power} tone="green" />}
            title="Мерить при запуске"
            hint="Пинг выбранного провайдера — чтобы автовыбор сразу взял быстрый сервер"
            aside={<Switch id="ping-start" checked={p.onStart} onCheckedChange={(onStart) => set({ onStart })} />}
          />
        </Group>
      </div>
    </Sheet>
  );
}

const intervals: { value: UpdateInterval; title: string }[] = [
  { value: "provider", title: "Как просит провайдер" },
  { value: 1, title: "Каждый час" },
  { value: 3, title: "Каждые 3 часа" },
  { value: 6, title: "Каждые 6 часов" },
  { value: 12, title: "Каждые 12 часов" },
  { value: 24, title: "Раз в сутки" },
  { value: "off", title: "Только вручную" },
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
      title="Обновление подписок"
      description="Списки серверов, трафик и сроки от провайдеров"
      icon={<IconTile icon={RefreshCw} tone="teal" />}
    >
      <div className="flex flex-col gap-6">
        <Group title="Обновлять автоматически">
          <RadioGroup
            value={String(u.interval)}
            onValueChange={(v) => set({ interval: (/^\d+$/.test(v) ? Number(v) : v) as UpdateInterval })}
            className="divide-y divide-edge"
            aria-label="Как часто обновлять подписки"
          >
            {intervals.map((i) => (
              <label key={String(i.value)} className="flex cursor-pointer items-center gap-3.5 px-4 py-3.5">
                <RadioGroupItem value={String(i.value)} aria-label={i.title} />
                <span className="flex-1 font-medium">{i.title}</span>
                {i.value === "provider" && <span className="text-[13px] text-ink-3">обычно 12 ч</span>}
              </label>
            ))}
          </RadioGroup>
        </Group>
        <Group>
          <Row
            htmlFor="upd-start"
            icon={<IconTile icon={Power} tone="green" />}
            title="Обновлять при запуске"
            hint="Свежие серверы сразу после открытия приложения"
            aside={<Switch id="upd-start" checked={u.onStart} onCheckedChange={(onStart) => set({ onStart })} />}
          />
        </Group>
        <p className="px-2 text-[13px] text-ink-3">
          Обновить одного провайдера вручную — кнопкой рядом с его названием в «Серверах».
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
        aria-label="Меньше"
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
        aria-label="Больше"
      >
        <Plus className="size-4" />
      </button>
    </div>
  );
}
