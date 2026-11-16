import type { TunnelState } from "@/backend";

/**
 * Живой фон: два размытых пятна света и еле заметный силуэт баобаба у нижнего края.
 * Без VPN пятна холодные, при подключении — тёплые закатные.
 */
export function Backdrop({ state }: { state: TunnelState }) {
  const warm = state === "connected";
  const half = state === "connecting";
  return (
    <div className="pointer-events-none fixed inset-0 -z-10 overflow-hidden bg-base" aria-hidden>
      <div
        className="absolute -top-[18%] -left-[22%] h-[70vmax] w-[70vmax] rounded-full blur-[90px] transition-[background-color,opacity] duration-[1600ms]"
        style={{
          backgroundColor: warm ? "#b8662c" : half ? "#4a4d4f" : "#2b3a4c",
          opacity: warm ? 0.26 : 0.35,
          animation: "drift-a 22s ease-in-out infinite",
        }}
      />
      <div
        className="absolute -right-[25%] -bottom-[20%] h-[65vmax] w-[65vmax] rounded-full blur-[110px] transition-[background-color,opacity] duration-[1600ms]"
        style={{
          backgroundColor: warm ? "#5e3424" : "#1c2a3d",
          opacity: warm ? 0.3 : 0.45,
          animation: "drift-b 28s ease-in-out infinite",
        }}
      />
      <div
        className="absolute top-[30%] left-[45%] h-[38vmax] w-[38vmax] rounded-full blur-[100px] transition-[background-color,opacity] duration-[1600ms]"
        style={{ backgroundColor: warm ? "#f2b04b" : "#24313f", opacity: warm ? 0.07 : 0.2 }}
      />
      {/* Горизонт с баобабами — фирменный знак, очень тихо. */}
      <svg
        viewBox="0 0 400 90"
        preserveAspectRatio="xMidYMax slice"
        className="absolute inset-x-0 bottom-0 h-[22vh] w-full opacity-[0.22]"
      >
        <path d="M0 70 C 80 62, 160 66, 220 68 S 340 62, 400 66 L400 90 L0 90 Z" fill="#05080b" />
        <BaobabShape x={70} y={69} s={0.55} />
        <BaobabShape x={330} y={66} s={0.32} />
      </svg>
    </div>
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
