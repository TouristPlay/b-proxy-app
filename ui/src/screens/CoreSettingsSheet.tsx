import { Combine, Cpu, Eye, Gauge, GitFork, Layers, Minus, Plus, ScrollText, Timer, Waves, Zap } from "lucide-react";
import { useId } from "react";
import { backend, useSnapshot, type CoreSettings } from "@/backend";
import { Group, IconTile, Row } from "@/components/bits";
import { Sheet } from "@/components/ui/sheet";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import { t } from "@/lib/i18n";

/** «Расширенные настройки» ядра Xray: память, соединения, сеть, журнал. */
export function CoreSettingsSheet({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const { settings } = useSnapshot();
  const c = settings.core;
  const set = (patch: Partial<CoreSettings>) => void backend.updateCore(patch);
  const memId = useId();

  return (
    <Sheet
      open={open}
      onOpenChange={onOpenChange}
      wide
      title={t("Ядро Xray")}
      description={t("Память, соединения и сеть")}
      icon={<IconTile icon={Gauge} tone="amber" />}
    >
      <div className="flex flex-col gap-6">
        <Group title={t("Память")}>
          <div className="px-4 pt-4 pb-3">
            <div className="flex items-baseline justify-between gap-3">
              <label htmlFor={memId} className="text-[16px] font-medium">
                
                {t("Лимит памяти Xray")}
              </label>
              <span className="font-display text-lg font-semibold text-amber tabular-nums">{c.memoryLimitMb} {" "}{t("МБ")}</span>
            </div>
            <Slider
              id={memId}
              className="mt-3"
              min={20}
              max={50}
              step={1}
              value={[c.memoryLimitMb]}
              onValueChange={([v]) => set({ memoryLimitMb: v })}
              aria-label={t("Лимит памяти Xray, мегабайт")}
            />
            <div className="mt-1 flex justify-between text-[12.5px] text-ink-3 tabular-nums">
              <span>{t("20 МБ")}</span>
              <span>{t("50 МБ")}</span>
            </div>
            <p className="mt-3 text-[13.5px] leading-snug text-ink-2">
              
              {t("Мягкий предел для ядра, по умолчанию 30 МБ. На iPhone система даёт VPN около 50 МБ: если туннель отключается сам, уменьшите лимит.")}
            </p>
          </div>
          <Row
            htmlFor="core-nolimit"
            icon={<IconTile icon={Zap} tone="amber" />}
            title={t("Агрессивная очистка памяти")}
            hint={t("Чаще освобождает память, чтобы система не выгружала VPN")}
            aside={<Switch id="core-nolimit" checked={c.noLimitMode} onCheckedChange={(v) => set({ noLimitMode: v })} />}
          />
        </Group>

        <Group title={t("Соединения")}>
          <Row
            icon={<IconTile icon={Timer} tone="blue" />}
            title={t("Таймаут простоя")}
            hint={t("Через сколько секунд закрывать неактивное соединение")}
            aside={
              <Stepper
                value={c.idleTimeoutSec}
                min={30}
                max={1800}
                step={30}
                format={(v) => t("{0} с", [v])}
                label={t("Таймаут простоя")}
                onChange={(v) => set({ idleTimeoutSec: v })}
              />
            }
          />
        </Group>

        <Group title={t("Сеть")}>
          <Row
            htmlFor="core-sniff"
            icon={<IconTile icon={Eye} tone="green" />}
            title={t("Анализ трафика")}
            hint={t("Определять сайт по содержимому соединения, чтобы правильно маршрутизировать")}
            aside={<Switch id="core-sniff" checked={c.sniffing} onCheckedChange={(v) => set({ sniffing: v })} />}
          />
          <Row
            htmlFor="core-route"
            icon={<IconTile icon={GitFork} tone="violet" />}
            title={t("Только для маршрутов")}
            hint={t("Найденный домен используется для правил, адрес не подменяется. Выключите, если не работают звонки по UDP или QUIC")}
            aside={
              <Switch id="core-route" checked={c.routeOnly} disabled={!c.sniffing} onCheckedChange={(v) => set({ routeOnly: v })} />
            }
          />
          <Row
            icon={<IconTile icon={Waves} tone="teal" />}
            title={t("MTU туннеля")}
            hint={t("Размер пакета в туннеле. Меняйте, только если часть сайтов не открывается")}
            aside={
              <Stepper
                value={c.mtu}
                min={0}
                max={1500}
                step={10}
                format={(v) => (v === 0 ? t("Авто") : String(v))}
                label={t("MTU туннеля")}
                onChange={(v) => set({ mtu: v === 10 ? 1280 : v > 0 && v < 1280 ? 0 : v })}
              />
            }
          />
        </Group>

        <Group title={t("Мультиплексирование")}>
          <Row
            htmlFor="core-mux"
            icon={<IconTile icon={Combine} tone="blue" />}
            title="Mux"
            hint={t("Несколько соединений в одном канале до сервера: быстрее открываются страницы, меньше рукопожатий. Серверы с XTLS Vision и XHTTP работают без него")}
            aside={<Switch id="core-mux" checked={c.mux} onCheckedChange={(v) => set({ mux: v })} />}
          />
          {c.mux && (
            <Row
              icon={<IconTile icon={Layers} tone="gray" />}
              title={t("Соединений в канале")}
              hint={t("Больше — экономнее, меньше — стабильнее на плохой сети")}
              aside={
                <Stepper
                  value={c.muxConcurrency}
                  min={1}
                  max={32}
                  step={1}
                  format={(v) => String(v)}
                  label={t("Соединений в канале Mux")}
                  onChange={(v) => set({ muxConcurrency: v })}
                />
              }
            />
          )}
        </Group>

        <Group title={t("Отладка")}>
          <div className="px-4 py-3.5">
            <div className="flex items-center gap-3.5">
              <IconTile icon={ScrollText} tone="gray" />
              <span className="flex-1 text-[16px] font-medium">{t("Журнал ядра")}</span>
            </div>
            <div className="mt-3 grid grid-cols-4 gap-1 rounded-2xl bg-glass p-1" role="radiogroup" aria-label={t("Подробность журнала")}>
              {(
                [
                  ["none", t("Выкл.")],
                  ["error", t("Ошибки")],
                  ["warning", t("Обычный")],
                  ["debug", t("Подробный")],
                ] as const
              ).map(([v, label]) => (
                <button
                  key={v}
                  role="radio"
                  aria-checked={c.logLevel === v}
                  onClick={() => set({ logLevel: v })}
                  className={cn(
                    "h-10 rounded-xl text-[13px] font-medium transition-colors",
                    c.logLevel === v ? "bg-ink text-base" : "text-ink-2 hover:text-ink",
                  )}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
          <Row
            icon={<IconTile icon={Cpu} tone="gray" />}
            title={t("Ядро")}
            aside={<span className="text-[15px] text-ink-2">Xray-core</span>}
          />
        </Group>
      </div>
    </Sheet>
  );
}

/** Кнопки «−» и «+» со значением, как в настройках iOS. */
function Stepper({
  value,
  min,
  max,
  step,
  format,
  label,
  onChange,
}: {
  value: number;
  min: number;
  max: number;
  step: number;
  format: (v: number) => string;
  label: string;
  onChange: (v: number) => void;
}) {
  return (
    <span className="flex shrink-0 flex-col items-end gap-1.5">
      <span className="font-display text-[15px] font-semibold text-amber tabular-nums" aria-live="polite">
        {format(value)}
      </span>
      <span className="glass flex h-10 items-center rounded-full">
        <button
          className="flex h-full w-11 items-center justify-center rounded-l-full text-ink hover:bg-glass-2 disabled:opacity-35"
          onClick={() => onChange(Math.max(min, value - step))}
          disabled={value <= min}
          aria-label={t("{0}: меньше", [label])}
        >
          <Minus className="size-4" />
        </button>
        <span className="h-5 w-px bg-edge-2" aria-hidden />
        <button
          className="flex h-full w-11 items-center justify-center rounded-r-full text-ink hover:bg-glass-2 disabled:opacity-35"
          onClick={() => onChange(Math.min(max, value + step))}
          disabled={value >= max}
          aria-label={t("{0}: больше", [label])}
        >
          <Plus className="size-4" />
        </button>
      </span>
    </span>
  );
}
