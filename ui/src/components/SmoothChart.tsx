import { useId, useRef } from "react";

/**
 * Плавный график скорости: сглаженная кривая с заливкой.
 * Значения сглаживаются (EMA), масштаб меняется постепенно, а каждая новая точка
 * не «перескакивает», а въезжает справа: график непрерывно сдвигается за секунду.
 */
export function SmoothChart({
  values,
  points = 40,
  color = "var(--color-good)",
  className,
}: {
  values: number[];
  points?: number;
  color?: string;
  className?: string;
}) {
  const id = useId().replace(/:/g, "");
  const w = 300;
  const h = 64;
  const step = w / (points - 1);

  // Сглаживание: экспоненциальное среднее, без ступенек от секунды к секунде.
  const raw = values.slice(-(points + 1));
  const padded = [...Array(Math.max(0, points + 1 - raw.length)).fill(0), ...raw];
  const smooth: number[] = [];
  padded.forEach((v, i) => smooth.push(i === 0 ? v : smooth[i - 1] * 0.45 + v * 0.55));

  // Масштаб подстраивается мягко: растёт сразу, уменьшается медленно.
  const target = Math.max(...smooth, 1) * 1.15;
  const scale = useRef(target);
  scale.current = target > scale.current ? target : scale.current * 0.92 + target * 0.08;
  const max = scale.current;

  const xy = smooth.map((v, i) => [i * step, h - 3 - (v / max) * (h - 8)] as const);
  const line = curve(xy);
  const area = `${line} L${xy[xy.length - 1][0]},${h} L0,${h} Z`;

  return (
    <svg viewBox={`0 0 ${w} ${h}`} className={className} preserveAspectRatio="none" aria-hidden>
      <defs>
        <linearGradient id={`g${id}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={color} stopOpacity="0.32" />
          <stop offset="1" stopColor={color} stopOpacity="0" />
        </linearGradient>
        <clipPath id={`c${id}`}>
          <rect width={w} height={h} />
        </clipPath>
      </defs>
      <g clipPath={`url(#c${id})`}>
        {/* key меняется с каждой новой точкой (история ограничена, поэтому не только длина) — сдвиг проигрывается заново. */}
        <g key={`${values.length}:${values[values.length - 1] ?? 0}:${values[0] ?? 0}`} className="chart-scroll" style={{ ["--step" as string]: `${step}px` }}>
          <g transform={`translate(${-step} 0)`}>
            <path d={area} fill={`url(#g${id})`} />
            <path d={line} fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
          </g>
        </g>
      </g>
    </svg>
  );
}

/** Гладкая кривая через точки (Catmull-Rom → кубические Безье), без выбросов ниже нуля. */
function curve(p: readonly (readonly [number, number])[]) {
  let d = `M${p[0][0]},${p[0][1]}`;
  for (let i = 0; i < p.length - 1; i++) {
    const p0 = p[i - 1] ?? p[i];
    const p1 = p[i];
    const p2 = p[i + 1];
    const p3 = p[i + 2] ?? p2;
    const t = 0.18;
    const c1 = [p1[0] + (p2[0] - p0[0]) * t, Math.min(64, p1[1] + (p2[1] - p0[1]) * t)];
    const c2 = [p2[0] - (p3[0] - p1[0]) * t, Math.min(64, p2[1] - (p3[1] - p1[1]) * t)];
    d += ` C${c1[0].toFixed(1)},${c1[1].toFixed(1)} ${c2[0].toFixed(1)},${c2[1].toFixed(1)} ${p2[0].toFixed(1)},${p2[1].toFixed(1)}`;
  }
  return d;
}
