import { Power, ShieldCheck } from "lucide-react";
import type { TunnelState } from "@/backend";
import { cn } from "@/lib/utils";

/**
 * Главная кнопка: концентрические кольца вокруг стеклянного диска.
 * Выключено — тихие серые кольца и значок питания.
 * Подключение — по кольцу бежит янтарная дуга.
 * Защищено — толстое янтарно-золотое кольцо, щит и мягкие волны.
 */
export function PowerOrb({
  state,
  onToggle,
  size = 280,
  label: customLabel,
  className,
}: {
  state: TunnelState;
  onToggle: () => void;
  size?: number;
  /** Своя подпись для экранного диктора, например «Добавить подписку». */
  label?: string;
  className?: string;
}) {
  const on = state === "connected";
  const busy = state === "connecting" || state === "disconnecting";
  // Во время подключения кнопка не блокируется: повторное нажатие отменяет его.
  const label =
    customLabel ??
    (on ? "Отключить VPN" : state === "connecting" ? "Отменить подключение" : state === "disconnecting" ? "Идёт отключение" : "Подключить VPN");
  const disc = size * 0.56;
  const ring = size * 0.7;

  return (
    <div className={cn("relative flex items-center justify-center", className)} style={{ width: size, height: size }}>
      {/* Внешние тонкие кольца, внешнее — пунктиром. */}
      <span className="absolute inset-0 rounded-full border border-dashed border-edge" aria-hidden />
      <span className="absolute inset-[8%] rounded-full border border-edge" aria-hidden />

      {/* Волны при подключённом VPN. */}
      {on &&
        [0, 1].map((i) => (
          <span
            key={i}
            aria-hidden
            className="absolute rounded-full border border-amber/50"
            style={{
              width: ring,
              height: ring,
              animation: `ring-wave 3.2s ease-out ${i * 1.6}s infinite`,
            }}
          />
        ))}

      {/* Толстое кольцо: серое или золотое. */}
      <span
        aria-hidden
        className="absolute rounded-full transition-[background,box-shadow,opacity] duration-700"
        style={{
          width: ring,
          height: ring,
          background: on
            ? "conic-gradient(from 210deg, var(--color-amber-2), var(--color-amber) 30%, var(--color-amber-deep) 55%, var(--color-amber) 80%, var(--color-amber-2))"
            : "var(--color-glass-2)",
          boxShadow: on ? "0 0 60px -6px color-mix(in srgb, var(--color-amber) 55%, transparent)" : "none",
          WebkitMask: ringMask(size * 0.04),
          mask: ringMask(size * 0.04),
        }}
      />

      {/* Бегущая дуга во время подключения. */}
      {busy && (
        <svg
          aria-hidden
          className="absolute"
          width={ring}
          height={ring}
          viewBox="0 0 100 100"
          style={{ animation: "spin-slow 1.1s linear infinite" }}
        >
          <circle cx="50" cy="50" r="47" fill="none" stroke="var(--color-amber)" strokeWidth="4" strokeLinecap="round" strokeDasharray="70 300" />
        </svg>
      )}

      <button
        type="button"
        onClick={onToggle}
        disabled={state === "disconnecting"}
        aria-label={label}
        aria-pressed={on}
        className="glass relative flex items-center justify-center rounded-full transition-transform duration-200 hover:scale-[1.02] active:scale-[0.97] disabled:cursor-progress"
        style={{
          width: disc,
          height: disc,
          background: on
            ? "radial-gradient(circle at 50% 35%, color-mix(in srgb, var(--color-amber-2) 18%, transparent), var(--color-disc) 70%)"
            : "radial-gradient(circle at 50% 30%, var(--color-glass-3), var(--color-disc) 70%)",
          boxShadow: "inset 0 1px 0 rgb(255 255 255 / 0.12), 0 20px 50px -20px rgb(0 0 0 / 0.8)",
        }}
      >
        {on ? (
          <ShieldCheck key="on" className="anim-pop text-amber-2" style={{ width: disc * 0.34, height: disc * 0.34 }} strokeWidth={1.6} />
        ) : (
          <Power
            key="off"
            className={cn("anim-pop transition-colors", busy ? "text-amber" : "text-ink-2")}
            style={{ width: disc * 0.34, height: disc * 0.34 }}
            strokeWidth={1.6}
          />
        )}
      </button>
    </div>
  );
}

/** Маска, оставляющая от круга только кольцо толщиной w пикселей. */
const ringMask = (w: number) =>
  `radial-gradient(farthest-side, transparent calc(100% - ${w + 1}px), #000 calc(100% - ${w}px))`;
