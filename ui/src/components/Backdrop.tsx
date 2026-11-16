import type { Appearance, TunnelState } from "@/backend";
import { themeById } from "@/lib/theme";

/**
 * Фон приложения. Вид выбирается в «Оформлении»:
 * пятна, пятна с горизонтом и баобабами, звёзды, однотонный или своё фото.
 * Пятна живые: цвета темы «в покое» без VPN и «активные» при подключении.
 */
export function Backdrop({ state, appearance, mode }: { state: TunnelState; appearance: Appearance; mode: "dark" | "light" }) {
  const theme = themeById(appearance.theme);
  const warm = state === "connected";
  const half = state === "connecting";
  const colors = warm ? theme.active : theme.idle;
  const light = mode === "light";
  // Яркость фона: 60 — как задумано, 0 — почти не видно, 100 — ярче.
  const k = (appearance.backgroundDim / 60) * (light ? 0.55 : 1);
  const kind = appearance.background;
  const showBlobs = kind !== "solid" && kind !== "image";

  return (
    <div className="pointer-events-none fixed inset-0 -z-10 overflow-hidden bg-base transition-colors duration-700" aria-hidden>
      {kind === "image" && appearance.backgroundImage && (
        <>
          <img src={appearance.backgroundImage} alt="" className="absolute inset-0 h-full w-full object-cover" />
          <div className="absolute inset-0 bg-base" style={{ opacity: Math.max(0.15, 1 - appearance.backgroundDim / 100) }} />
        </>
      )}

      {showBlobs && (
        <>
          <Blob
            className="-top-[18%] -left-[22%] h-[70vmax] w-[70vmax] blur-[90px]"
            color={half ? theme.idle[0] : colors[0]}
            opacity={(warm ? 0.26 : 0.35) * k * (light ? 1.4 : 1)}
            anim="drift-a 22s ease-in-out infinite"
          />
          <Blob
            className="-right-[25%] -bottom-[20%] h-[65vmax] w-[65vmax] blur-[110px]"
            color={colors[1]}
            opacity={(warm ? 0.3 : 0.45) * k}
            anim="drift-b 28s ease-in-out infinite"
          />
          <Blob
            className="top-[30%] left-[45%] h-[38vmax] w-[38vmax] blur-[100px]"
            color={colors[2]}
            opacity={(warm ? 0.08 : 0.2) * k}
          />
        </>
      )}

      {kind === "stars" && (
        <svg className="absolute inset-0 h-full w-full" style={{ opacity: Math.min(1, 0.7 * k) }}>
          {stars.map(([x, y, r], i) => (
            <circle key={i} cx={`${x}%`} cy={`${y}%`} r={r} fill={light ? "#5b6676" : "#dfe6ee"} opacity={0.35 + (i % 4) * 0.15} />
          ))}
        </svg>
      )}

      {kind === "horizon" && (
        <svg
          viewBox="0 0 400 90"
          preserveAspectRatio="xMidYMax slice"
          className="absolute inset-x-0 bottom-0 h-[22vh] w-full"
          style={{ opacity: (light ? 0.1 : 0.22) * Math.min(1.6, k) }}
        >
          <path d="M0 70 C 80 62, 160 66, 220 68 S 340 62, 400 66 L400 90 L0 90 Z" fill="#05080b" />
          <BaobabShape x={70} y={69} s={0.55} />
          <BaobabShape x={330} y={66} s={0.32} />
        </svg>
      )}
    </div>
  );
}

function Blob({ className, color, opacity, anim }: { className: string; color: string; opacity: number; anim?: string }) {
  return (
    <div
      className={`absolute rounded-full transition-[background-color,opacity] duration-[1600ms] ${className}`}
      style={{ backgroundColor: color, opacity, animation: anim }}
    />
  );
}

function BaobabShape({ x, y, s }: { x: number; y: number; s: number }) {
  return (
    <g transform={`translate(${x} ${y}) scale(${s})`} fill="#05080b">
      <path d="M-17 0 C -19 -20, -17 -42, -10 -60 C -6 -64, 6 -64, 10 -60 C 17 -42, 19 -20, 17 0 Z" />
      <g stroke="#05080b" strokeLinecap="round" fill="none">
        <path d="M-7 -60 C -16 -72, -28 -78, -44 -82" strokeWidth="7" />
        <path d="M-3 -62 C -7 -76, -13 -88, -18 -96" strokeWidth="6" />
        <path d="M3 -62 C 7 -78, 12 -90, 16 -98" strokeWidth="6" />
        <path d="M7 -60 C 17 -70, 30 -76, 46 -80" strokeWidth="7" />
      </g>
      {[
        [-46, -86],
        [-19, -100],
        [17, -102],
        [48, -84],
      ].map(([cx, cy]) => (
        <ellipse key={`${cx}`} cx={cx} cy={cy} rx="17" ry="7" />
      ))}
    </g>
  );
}

/** Звёзды: [x %, y %, радиус px], разбросаны заранее, чтобы фон не прыгал. */
const stars: [number, number, number][] = Array.from({ length: 70 }, (_, i) => {
  const a = Math.sin(i * 12.9898) * 43758.5453;
  const b = Math.sin(i * 78.233) * 12345.6789;
  return [Math.abs(a % 100), Math.abs(b % 100) * 0.85, i % 7 === 0 ? 1.4 : i % 3 === 0 ? 1 : 0.7];
});
