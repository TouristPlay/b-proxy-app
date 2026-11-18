import { Entrance } from "@/lib/motion";
import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { splitFlag } from "@/lib/format";
import { cn } from "@/lib/utils";
import { t } from "@/lib/i18n";

/** Флаг страны в скруглённой плитке; без флага — точки. */
export function Flag({ name, size = "md", className }: { name: string; size?: "sm" | "md" | "lg"; className?: string }) {
  const raw = Array.from(name.trim());
  const { code } = splitFlag(name);
  const emoji = code ? raw.slice(0, 2).join("") : null;
  const box =
    size === "lg"
      ? "size-14 rounded-[18px] text-[30px]"
      : size === "sm"
        ? "size-9 rounded-xl text-[18px]"
        : "size-12 rounded-2xl text-[24px]";
  return (
    <span
      aria-hidden
      className={cn("flex shrink-0 items-center justify-center border border-edge bg-glass-2 leading-none", box, className)}
    >
      {emoji ?? <span className="text-xs font-semibold text-ink-2">··</span>}
    </span>
  );
}

const tagColor: Record<string, string> = {
  VLESS: "text-tag-vless border-tag-vless/40",
  VMESS: "text-tag-vless border-tag-vless/40",
  REALITY: "text-tag-reality border-tag-reality/40",
  GRPC: "text-tag-grpc border-tag-grpc/40",
  TLS: "text-tag-tls border-tag-tls/40",
  XHTTP: "text-tag-xhttp border-tag-xhttp/40",
  WS: "text-tag-ws border-tag-ws/40",
  WEBSOCKET: "text-tag-ws border-tag-ws/40",
  TCP: "text-tag-tcp border-tag-tcp/40",
  HYSTERIA2: "text-tag-hy border-tag-hy/40",
  TROJAN: "text-tag-trojan border-tag-trojan/40",
  SHADOWSOCKS: "text-tag-trojan border-tag-trojan/40",
};

/** Цветные метки транспорта: VLESS, REALITY, GRPC… */
export function Tags({ tags, className }: { tags: string[]; className?: string }) {
  return (
    <span className={cn("flex flex-wrap gap-1.5", className)}>
      {tags.map((t) => (
        <span
          key={t}
          className={cn(
            "rounded-md border px-1.5 py-px text-[11px] leading-4 font-medium tracking-wide",
            tagColor[t] ?? "border-edge-2 text-ink-2",
          )}
        >
          {t}
        </span>
      ))}
    </span>
  );
}

/** Пинг: полоски сигнала + число. Смысл несут и цвет, и число полосок, и цифра. */
/**
 * Пинг: полоски сигнала и число. Пока идёт замер, полоски «дышат» волной, а число
 * сменяется мерцающей заглушкой; результат появляется с небольшой задержкой по порядку
 * строки — список «отвечает» сверху вниз.
 */
export function SignalPing({
  ms,
  className,
  big,
  measuring,
  order = 0,
}: {
  ms: number | null;
  className?: string;
  big?: boolean;
  measuring?: boolean;
  order?: number;
}) {
  const delay = `${Math.min(order, 14) * 45}ms`;
  if (measuring) {
    return (
      <span className={cn("flex items-center gap-2", className)} aria-label={t("Меряем пинг")}>
        <span className="flex h-3.5 items-end gap-[2px]" aria-hidden>
          {[0, 1, 2].map((b) => (
            <span
              key={b}
              className="h-full w-[3px] origin-bottom rounded-full bg-amber"
              style={{ animation: `ping-bar 900ms ease-in-out ${(order % 6) * 80 + b * 120}ms infinite` }}
            />
          ))}
        </span>
        <span className="ping-shimmer h-3.5 w-11 rounded-full" aria-hidden />
      </span>
    );
  }
  if (ms == null) return <span className={cn("text-sm text-ink-3", className)}>—</span>;
  if (ms < 0)
    return (
      <Entrance as="span" anim="anim-pop" key="fail" className={cn("text-sm font-medium text-bad", className)} style={{ animationDelay: delay }}>
        
        {t("нет связи")}
      </Entrance>
    );
  const bars = ms < 80 ? 3 : ms < 160 ? 2 : 1;
  const color = ms < 80 ? "bg-good" : ms < 160 ? "bg-warn" : "bg-ember";
  return (
    <span className={cn("flex items-center gap-2", className)}>
      <span className="flex h-3.5 items-end gap-[2px]" aria-hidden>
        {[0, 1, 2].map((i) => (
          <span
            key={i}
            className={cn("w-[3px] rounded-full transition-colors duration-[var(--dur)]", i < bars ? color : "bg-glass-3")}
            style={{ height: `${(i + 1) * 33}%` }}
          />
        ))}
      </span>
      <Entrance
        as="span"
        anim="anim-pop"
        key={ms}
        className={cn("tabular-nums", big ? "font-display text-lg font-semibold" : "text-[15px] font-medium")}
        style={{ animationDelay: delay }}
      >
        {ms}
        <span className="ml-0.5 text-xs font-normal text-ink-3"> {" "}{t("мс")}</span>
      </Entrance>
    </span>
  );
}

const tones = {
  amber: "border-amber/25 bg-amber/12 text-amber",
  green: "border-good/25 bg-good/12 text-good",
  blue: "border-tag-tls/25 bg-tag-tls/12 text-tag-tls",
  violet: "border-tag-reality/25 bg-tag-reality/12 text-tag-reality",
  teal: "border-tag-xhttp/25 bg-tag-xhttp/12 text-tag-xhttp",
  red: "border-bad/25 bg-bad/12 text-bad",
  gray: "border-edge-2 bg-glass-2 text-ink-2",
} as const;

export type Tone = keyof typeof tones;

/** Цветная плитка с иконкой для строк настроек. */
export function IconTile({ icon: Icon, tone }: { icon: LucideIcon; tone: Tone }) {
  return (
    <span className={cn("flex size-10 shrink-0 items-center justify-center rounded-[13px] border", tones[tone])} aria-hidden>
      <Icon className="size-[19px]" />
    </span>
  );
}

/** Группа строк на стекле. */
export function Group({ title, children, className }: { title?: string; children: ReactNode; className?: string }) {
  return (
    <section className={className}>
      {title && <h2 className="mb-2.5 px-2 text-[13px] font-medium text-ink-3">{title}</h2>}
      <div className="glass divide-y divide-edge overflow-hidden rounded-[var(--radius-glass)]">{children}</div>
    </section>
  );
}

/** Строка группы: иконка, заголовок, подпись и что-то справа. */
export function Row({
  icon,
  title,
  hint,
  aside,
  onClick,
  htmlFor,
}: {
  icon?: ReactNode;
  title: ReactNode;
  hint?: ReactNode;
  aside?: ReactNode;
  onClick?: () => void;
  htmlFor?: string;
}) {
  const body = (
    <>
      {icon}
      <span className="min-w-0 flex-1">
        <span className="block text-[16px] leading-snug font-medium">{title}</span>
        {hint && <span className="mt-0.5 block text-[13.5px] leading-snug text-ink-2">{hint}</span>}
      </span>
      {aside}
    </>
  );
  const cls = "flex w-full items-center gap-3.5 px-4 py-3.5 text-left";
  if (onClick)
    return (
      <button onClick={onClick} className={cn(cls, "transition-colors hover:bg-glass-2")}>
        {body}
      </button>
    );
  if (htmlFor)
    return (
      <label htmlFor={htmlFor} className={cn(cls, "cursor-pointer")}>
        {body}
      </label>
    );
  return <div className={cls}>{body}</div>;
}
