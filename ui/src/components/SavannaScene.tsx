import type { TunnelState } from "@/backend";
import { cn } from "@/lib/utils";

/**
 * Главный элемент интерфейса: саванна с баобабом на горизонте.
 * Солнце — это состояние VPN. Не подключено: ночь, солнце за горизонтом.
 * Подключение: солнце поднимается. Защищено: закатное небо, солнце над землёй.
 * Вся сцена — одна большая кнопка, по ней удобно попасть пальцем.
 */
export function SavannaScene({
  state,
  onToggle,
  disabled,
  className,
}: {
  state: TunnelState;
  onToggle: () => void;
  disabled?: boolean;
  className?: string;
}) {
  const up = state === "connected" || state === "connecting";
  const lit = state === "connected";
  const busy = state === "connecting" || state === "disconnecting";

  const label =
    state === "connected"
      ? "Отключить VPN"
      : state === "connecting"
        ? "Идёт подключение"
        : state === "disconnecting"
          ? "Идёт отключение"
          : "Подключить VPN";

  return (
    <button
      type="button"
      onClick={onToggle}
      disabled={disabled || busy}
      aria-label={label}
      aria-pressed={lit}
      className={cn(
        "group relative block w-full cursor-pointer overflow-hidden outline-offset-[-3px] disabled:cursor-progress",
        className,
      )}
    >
      <svg
        viewBox="0 0 400 258"
        preserveAspectRatio="xMidYMax slice"
        className="block h-full w-full"
        aria-hidden
      >
        <defs>
          <linearGradient id="sky-night" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#0b1519" />
            <stop offset="1" stopColor="#1c3138" />
          </linearGradient>
          <linearGradient id="sky-dusk" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#16202f" />
            <stop offset="0.55" stopColor="#5b3530" />
            <stop offset="0.85" stopColor="#c8603a" />
            <stop offset="1" stopColor="#f0904a" />
          </linearGradient>
          <radialGradient id="sun-fill" cx="0.5" cy="0.4" r="0.6">
            <stop offset="0" stopColor="#ffe6a8" />
            <stop offset="0.6" stopColor="#f6b24a" />
            <stop offset="1" stopColor="#e8733a" />
          </radialGradient>
          <radialGradient id="sun-glow" cx="0.5" cy="0.5" r="0.5">
            <stop offset="0" stopColor="#f4a63c" stopOpacity="0.55" />
            <stop offset="1" stopColor="#f4a63c" stopOpacity="0" />
          </radialGradient>
        </defs>

        {/* Небо: ночное всегда снизу, закатное проявляется поверх. */}
        <rect width="400" height="258" fill="url(#sky-night)" />
        <rect
          width="400"
          height="258"
          fill="url(#sky-dusk)"
          style={{ opacity: lit ? 1 : up ? 0.45 : 0, transition: "opacity 1400ms var(--ease-out-soft)" }}
        />

        {/* Звёзды гаснут, когда восходит солнце. */}
        <g
          fill="#efe8d8"
          style={{ opacity: up ? 0 : 1, transition: "opacity 900ms ease-out" }}
        >
          {stars.map(([x, y, r, d], i) => (
            <circle
              key={i}
              cx={x}
              cy={y}
              r={r}
              style={{ animation: `twinkle ${d}s ease-in-out ${i * 0.37}s infinite` }}
            />
          ))}
        </g>

        {/* Солнце и марево. */}
        <g
          style={{
            transform: `translateY(${lit ? -78 : up ? -40 : 0}px)`,
            transition: `transform ${state === "connecting" ? 1600 : 1100}ms var(--ease-out-soft)`,
          }}
        >
          <circle
            cx="200"
            cy="236"
            r="110"
            fill="url(#sun-glow)"
            style={{
              opacity: lit ? 1 : up ? 0.6 : 0.25,
              transformOrigin: "200px 236px",
              animation: lit ? "shimmer 5s ease-in-out infinite" : undefined,
              transition: "opacity 900ms ease-out",
            }}
          />
          <circle
            cx="200"
            cy="236"
            r="52"
            fill="url(#sun-fill)"
            style={{ filter: lit ? undefined : "saturate(0.55) brightness(0.8)", transition: "filter 900ms" }}
          />
          {/* Значок питания на солнце: подсказка, что это кнопка. */}
          <g
            stroke="#3a1a08"
            strokeWidth="4"
            strokeLinecap="round"
            fill="none"
            style={{ opacity: up ? 0.55 : 0, transition: "opacity 600ms ease-out" }}
          >
            <path d="M200 214 v18" />
            <path d="M188 219 a20 20 0 1 0 24 0" />
          </g>
        </g>

        {/* Земля и силуэты. Рисуются поверх солнца — оно «садится» за горизонт. */}
        <path
          d="M0 222 C 60 214, 120 218, 180 220 S 320 214, 400 219 L400 258 L0 258 Z"
          fill="#091215"
        />
        <Baobab x={92} y={221} scale={1} />
        <Baobab x={318} y={219} scale={0.46} />
        {/* Трава у горизонта. */}
        <g stroke="#091215" strokeWidth="1.6" strokeLinecap="round">
          {grass.map(([x, h], i) => (
            <path key={i} d={`M${x} 221 l${i % 2 ? 1.5 : -1.5} -${h}`} />
          ))}
        </g>
      </svg>

      {/* Подпись внутри сцены для зрячих пользователей; для скринридера есть aria-label. */}
      <span
        className={cn(
          "pointer-events-none absolute inset-x-0 bottom-5 text-center text-sm text-ink-muted transition-opacity duration-500",
          state === "disconnected" ? "opacity-100" : "opacity-0",
        )}
        aria-hidden
      >
        Коснитесь солнца, чтобы подключиться
      </span>
    </button>
  );
}

/** Силуэт баобаба: толстый ствол бутылкой, короткие толстые ветви и плоские кудрявые шапки листвы. */
function Baobab({ x, y, scale }: { x: number; y: number; scale: number }) {
  return (
    <g transform={`translate(${x} ${y}) scale(${scale})`} fill="#091215">
      <path d="M-17 0 C -19 -20, -17 -42, -10 -60 C -6 -64, 6 -64, 10 -60 C 17 -42, 19 -20, 17 0 Z" />
      <g stroke="#091215" strokeLinecap="round" fill="none">
        <path d="M-7 -60 C -16 -72, -28 -78, -44 -82" strokeWidth="7" />
        <path d="M-3 -62 C -7 -76, -13 -88, -18 -96" strokeWidth="6" />
        <path d="M3 -62 C 7 -78, 12 -90, 16 -98" strokeWidth="6" />
        <path d="M7 -60 C 17 -70, 30 -76, 46 -80" strokeWidth="7" />
      </g>
      {crown.map(([cx, cy, k]) =>
        leaf.map(([dx, dy, r], i) => <circle key={`${cx}-${i}`} cx={cx + dx * k} cy={cy + dy * k} r={r * k} />),
      )}
    </g>
  );
}

/** Центры шапок листвы на концах ветвей и их размер. */
const crown: [number, number, number][] = [
  [-46, -86, 1.05], [-19, -100, 0.95], [17, -102, 1], [48, -84, 1.1], [0, -92, 0.7],
];
/** Одна шапка: несколько кругов, плоская снизу и кудрявая сверху. */
const leaf: [number, number, number][] = [
  [-13, 1, 5], [-7, -2, 6], [0, -4, 6.5], [7, -2, 6], [13, 1, 5], [-4, 2, 5], [5, 2, 5], [0, 1, 5],
];

const stars: [number, number, number, number][] = [
  [34, 40, 1.1, 3.1], [78, 22, 0.8, 4.2], [126, 58, 1.2, 3.6], [168, 30, 0.7, 5.0],
  [236, 46, 1.0, 4.4], [284, 18, 0.9, 3.3], [322, 62, 1.3, 4.8], [366, 34, 0.8, 3.9],
  [58, 96, 0.7, 4.6], [300, 104, 0.8, 3.4], [214, 92, 0.6, 5.2], [148, 118, 0.7, 4.0],
];

const grass: [number, number][] = [
  [12, 6], [20, 9], [27, 5], [150, 7], [158, 10], [164, 6], [236, 8], [243, 5],
  [262, 9], [270, 6], [352, 7], [360, 10], [367, 5], [388, 8],
];
