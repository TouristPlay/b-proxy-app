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
  className,
}: {
  state: TunnelState;
  onToggle: () => void;
  size?: number;
  className?: string;
}) {
  const on = state === "connected";
  const busy = state === "connecting" || state === "disconnecting";
  const label = on ? "Отключить VPN" : busy ? (state === "connecting" ? "Идёт подключение" : "Идёт отключение") : "Подключить VPN";
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
            ? "conic-gradient(from 210deg, #ffe3a6, #f2b04b 30%, #b9772a 55%, #f6c470 80%, #ffe3a6)"
            : "rgb(255 255 255 / 0.06)",
          boxShadow: on ? "0 0 60px -6px rgb(242 176 75 / 0.55)" : "none",
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
          <circle cx="50" cy="50" r="47" fill="none" stroke="#f2b04b" strokeWidth="4" strokeLinecap="round" strokeDasharray="70 300" />
        </svg>
      )}

      <button
        type="button"
        onClick={onToggle}
        disabled={busy}
        aria-label={label}
        aria-pressed={on}
        className="glass relative flex items-center justify-center rounded-full transition-transform duration-200 hover:scale-[1.02] active:scale-[0.97] disabled:cursor-progress"
        style={{
          width: disc,
          height: disc,
          background: on
            ? "radial-gradient(circle at 50% 35%, rgb(255 215 150 / 0.16), rgb(20 18 16 / 0.65) 70%)"
            : "radial-gradient(circle at 50% 30%, rgb(255 255 255 / 0.09), rgb(12 16 22 / 0.7) 70%)",
          boxShadow: "inset 0 1px 0 rgb(255 255 255 / 0.12), 0 20px 50px -20px rgb(0 0 0 / 0.8)",
        }}
      >
        {on ? (
          <ShieldCheck className="text-amber-2" style={{ width: disc * 0.34, height: disc * 0.34 }} strokeWidth={1.6} />
        ) : (
          <Power
            className={cn("transition-colors", busy ? "text-amber" : "text-ink-2")}
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
