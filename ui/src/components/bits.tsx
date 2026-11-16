import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { splitFlag } from "@/lib/format";

/** Код страны в круге. Эмодзи-флаги выглядят по-разному на разных системах, буквы — одинаково. */
export function CountryCode({ name, className }: { name: string; className?: string }) {
  const { code } = splitFlag(name);
  return (
    <span
      aria-hidden
      className={cn(
        "flex size-10 shrink-0 items-center justify-center rounded-full bg-dusk-2 text-[13px] font-semibold tracking-wide text-ink",
        className,
      )}
    >
      {code ?? "··"}
    </span>
  );
}

/** Пинг: число и цвет вместе, чтобы смысл не держался только на цвете. */
export function Ping({ ms, className }: { ms: number | null; className?: string }) {
  if (ms == null) return <span className={cn("text-sm text-ink-faint", className)}>не измерен</span>;
  if (ms < 0) return <span className={cn("text-sm text-danger", className)}>нет связи</span>;
  return (
    <span className={cn("text-sm tabular-nums", ms < 120 ? "text-sun" : "text-ink-muted", className)}>
      {ms} мс
    </span>
  );
}

/** Заголовок раздела. */
export function SectionTitle({ children, aside }: { children: ReactNode; aside?: ReactNode }) {
  return (
    <div className="mt-8 mb-3 flex items-baseline justify-between gap-4 first:mt-0">
      <h2 className="font-display text-[15px] font-medium tracking-tight text-ink">{children}</h2>
      {aside && <span className="text-sm text-ink-faint">{aside}</span>}
    </div>
  );
}
