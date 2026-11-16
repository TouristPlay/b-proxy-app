import { Power, ShieldCheck } from "lucide-react";
import type { TunnelState } from "@/backend";
import { cn } from "@/lib/utils";

/**
 * Главная кнопка «Янтарное стекло»: стеклянный шар, который наполняется светом цвета темы.
 * Выключено — шар пустой и холодный, значок питания.
 * Подключение — уровень поднимается до середины, волны бегут быстрее, по кругу идёт дуга.
 * Защищено — шар почти полный, щит, мягкие волны вокруг; уровень покачивается от скорости загрузки.
 * Отключение — свет сливается вниз.
 */
export function PowerOrb({
  state,
  onToggle,
  size = 280,
  speed = 0,
  label: customLabel,
  className,
}: {
  state: TunnelState;
  onToggle: () => void;
  size?: number;
  /** Скорость загрузки, байт/с: от неё чуть колышется уровень. */
  speed?: number | null;
  /** Своя подпись для экранного диктора, например «Добавить подписку». */
  label?: string;
  className?: string;
}) {
  const on = state === "connected";
  const busy = state === "connecting" || state === "disconnecting";
  // Во время подключения кнопка не блокируется: повторное нажатие его отменяет.
  const label =
    customLabel ??
    (on ? "Отключить VPN" : state === "connecting" ? "Отменить подключение" : state === "disconnecting" ? "Идёт отключение" : "Подключить VPN");
  const disc = size * 0.62;

  // Уровень поверхности света в координатах шара (0 — верх, 100 — низ).
  // При трафике уровень приподнимается на несколько пунктов: 1 МБ/с ≈ 3, потолок 8.
  const lift = on ? Math.min(8, Math.log10(1 + (speed ?? 0) / 100_000) * 4) : 0;
  const level = { disconnected: 108, connecting: 58, connected: 26 - lift, disconnecting: 104 }[state];
  const fast = state === "connecting";

  return (
    <div className={cn("relative flex items-center justify-center", className)} style={{ width: size, height: size }}>
      {/* Внешние тонкие кольца, внешнее — пунктиром. */}
      <span className="absolute inset-0 rounded-full border border-dashed border-edge" aria-hidden />
      <span
        className={cn("absolute inset-[9%] rounded-full border transition-colors duration-[var(--dur-slow)]", on ? "border-amber/35" : "border-edge")}
        aria-hidden
      />

      {/* Волны вокруг, пока VPN включён. */}
      {on &&
        [0, 1].map((i) => (
          <span
            key={i}
            aria-hidden
            className="absolute rounded-full border border-amber/45"
            style={{ width: disc, height: disc, animation: `ring-wave 3.4s ease-out ${i * 1.7}s infinite` }}
          />
        ))}

      {/* Бегущая дуга во время подключения и отключения. */}
      {busy && (
        <svg
          aria-hidden
          className="absolute"
          width={disc + size * 0.1}
          height={disc + size * 0.1}
          viewBox="0 0 100 100"
          style={{ animation: "spin-slow 1.2s linear infinite" }}
        >
          <circle cx="50" cy="50" r="48" fill="none" stroke="var(--color-amber)" strokeWidth="2.5" strokeLinecap="round" strokeDasharray="60 300" />
        </svg>
      )}

      <button
        type="button"
        onClick={onToggle}
        disabled={state === "disconnecting"}
        aria-label={label}
        aria-pressed={on}
        className={cn(
          "relative isolate overflow-hidden rounded-full border transition-[transform,border-color,box-shadow] duration-[var(--dur)] ease-[var(--ease-out)] hover:scale-[1.02] active:scale-[0.96] disabled:cursor-progress",
          on ? "border-amber/50" : "border-edge-2",
        )}
        style={{
          width: disc,
          height: disc,
          background: "radial-gradient(circle at 50% 30%, var(--color-glass-3), var(--color-disc) 72%)",
          boxShadow: on
            ? "0 0 70px -10px color-mix(in srgb, var(--color-amber) 60%, transparent), inset 0 1px 0 rgb(255 255 255 / 0.14)"
            : "inset 0 1px 0 rgb(255 255 255 / 0.12), 0 20px 50px -20px rgb(0 0 0 / 0.8)",
        }}
      >
        {/* Свет внутри шара: две волны, задняя темнее. */}
        <svg aria-hidden className="absolute inset-0 size-full" viewBox="0 0 100 100" preserveAspectRatio="none">
          <g
            style={{
              transform: `translateY(${level}px)`,
              transition: `transform ${state === "disconnecting" ? 700 : 1100}ms var(--ease-out)`,
            }}
          >
            <g style={{ animation: `liquid-wave ${fast ? 1.4 : 3.2}s linear infinite` }}>
              <path d={wave(0, 4)} fill="var(--color-amber-deep)" />
            </g>
            <g style={{ animation: `liquid-wave ${fast ? 2.1 : 4.6}s linear infinite reverse` }}>
              <path d={wave(3, 3)} fill="var(--color-amber)" opacity="0.92" />
            </g>
          </g>
        </svg>

        {/* Блик стекла сверху. */}
        <span
          aria-hidden
          className="pointer-events-none absolute inset-x-[24%] top-[8%] h-[14%] rounded-[50%] bg-gradient-to-b from-white/[0.10] to-transparent"
        />

        <span className="relative z-10 flex size-full items-center justify-center">
          {on ? (
            <ShieldCheck key="on" className="anim-pop text-on-accent" style={{ width: disc * 0.3, height: disc * 0.3 }} strokeWidth={1.8} />
          ) : (
            <Power
              key="off"
              className={cn("anim-pop transition-colors", busy ? "text-amber-2" : "text-ink-2")}
              style={{ width: disc * 0.3, height: disc * 0.3 }}
              strokeWidth={1.6}
            />
          )}
        </span>
      </button>
    </div>
  );
}

/**
 * Волна шириной 200 с периодом 50: сдвиг на −50 по кругу выглядит бесконечным.
 * y — смещение линии, a — высота гребня.
 */
function wave(y: number, a: number) {
  let d = `M0 ${y}`;
  for (let x = 0; x < 200; x += 50) {
    d += ` Q${x + 12.5} ${y - a} ${x + 25} ${y} T${x + 50} ${y}`;
  }
  return `${d} V120 H0 Z`;
}
