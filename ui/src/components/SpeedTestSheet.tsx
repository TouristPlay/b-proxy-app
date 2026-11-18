import { ArrowDown, ArrowUp, Gauge, LoaderCircle, Timer } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { backend, useSnapshot, type SpeedTest } from "@/backend";
import { IconTile } from "@/components/bits";
import { Button } from "@/components/ui/button";
import { Sheet } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import { t } from "@/lib/i18n";

const phases: { key: "latency" | "download" | "upload"; title: string; unit: string; icon: LucideIcon; value: (s: SpeedTest) => number | null }[] = [
  { key: "latency", title: t("Задержка"), unit: t("мс"), icon: Timer, value: (s) => s.latencyMs },
  { key: "download", title: t("Скачивание"), unit: t("Мбит/с"), icon: ArrowDown, value: (s) => s.downloadMbps },
  { key: "upload", title: t("Отдача"), unit: t("Мбит/с"), icon: ArrowUp, value: (s) => s.uploadMbps },
];

/** Проверка скорости через выбранный сервер: задержка, скачивание, отдача. */
export function SpeedTestSheet({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const s = useSnapshot();
  const st = s.speedTest;
  const running = st != null && st.phase !== "done" && st.phase !== "error";
  const connected = s.state === "connected";
  const server = st?.server || s.current?.node.name || "";

  return (
    <Sheet
      open={open}
      onOpenChange={onOpenChange}
      title={t("Скорость через сервер")}
      description={server || t("Сервер не выбран")}
      icon={<IconTile icon={Gauge} tone="amber" />}
    >
      <div className="flex flex-col gap-5">
        <div className="grid grid-cols-3 gap-2" aria-live="polite">
          {phases.map((p) => {
            const value = st ? p.value(st) : null;
            const active = st?.phase === p.key;
            return (
              <div
                key={p.key}
                className={cn(
                  "glass relative flex min-h-[112px] flex-col justify-between overflow-hidden rounded-[22px] px-3 py-3 transition-colors",
                  active && "border-amber/45",
                )}
              >
                <span className={cn("flex items-center gap-1.5 text-[13px]", active ? "text-amber" : "text-ink-2")}>
                  <p.icon className="size-4" aria-hidden />
                  {p.title}
                </span>
                <span>
                  <span className={cn("block font-display text-[28px] leading-none font-semibold tabular-nums", value == null && "text-ink-3")}>
                    {value == null ? "—" : value >= 100 || p.key === "latency" ? Math.round(value) : value.toFixed(1)}
                  </span>
                  <span className="mt-1 block text-[12.5px] text-ink-3">{p.unit}</span>
                </span>
                {active && (
                  <span className="absolute inset-x-0 bottom-0 h-1 bg-glass-3" aria-hidden>
                    <span className="block h-full bg-amber transition-[width] duration-300" style={{ width: `${Math.round((st?.progress ?? 0) * 100)}%` }} />
                  </span>
                )}
              </div>
            );
          })}
        </div>

        {st?.phase === "error" && st.error && (
          <p role="alert" className="px-1 text-[14px] text-bad">
            {st.error}
          </p>
        )}

        <Button variant="amber" className="w-full" disabled={running || !connected} onClick={() => void backend.runSpeedTest()}>
          {running ? <LoaderCircle className="animate-spin" /> : <Gauge />}
          {running ? t("Проверяем…") : st?.phase === "done" ? t("Проверить ещё раз") : t("Проверить скорость")}
        </Button>
        <p className="px-1 text-[13px] text-ink-3">
          {connected
            ? t("Около 20 секунд. Тратит трафик: на быстром канале — до 200 МБ")
            : t("Подключитесь, чтобы проверить скорость сервера")}
        </p>
      </div>
    </Sheet>
  );
}
