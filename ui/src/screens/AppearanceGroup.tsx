import { Check, ImagePlus, Moon, Palette, Sparkles, Sun, SunMoon } from "lucide-react";
import { useId, useRef } from "react";
import { backend, useSnapshot, type Appearance, type BackgroundKind } from "@/backend";
import { Group, IconTile, Row } from "@/components/bits";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { accentOf, themes } from "@/lib/theme";
import { cn } from "@/lib/utils";

const backgrounds: { id: BackgroundKind; name: string }[] = [
  { id: "horizon", name: "Горизонт" },
  { id: "blobs", name: "Пятна" },
  { id: "stars", name: "Звёзды" },
  { id: "solid", name: "Однотонный" },
  { id: "image", name: "Своё фото" },
];

const modes: { id: Appearance["mode"]; name: string; icon: typeof Sun }[] = [
  { id: "dark", name: "Тёмная", icon: Moon },
  { id: "light", name: "Светлая", icon: Sun },
  { id: "system", name: "Как в системе", icon: SunMoon },
];

/** Раздел настроек «Оформление»: тема, свой цвет, фон, режим, стекло, анимации. */
export function AppearanceGroup() {
  const { settings } = useSnapshot();
  const a = settings.appearance;
  const set = (patch: Partial<Appearance>) => backend.updateAppearance(patch);
  const fileRef = useRef<HTMLInputElement>(null);
  const colorId = useId();
  const accent = accentOf(a);

  function pickImage(file: File | undefined) {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => set({ background: "image", backgroundImage: String(reader.result) });
    reader.readAsDataURL(file);
  }

  return (
    <Group title="Оформление">
      {/* Темы */}
      <div className="px-4 pt-4 pb-4">
        <div className="mb-3 flex items-center gap-3.5">
          <IconTile icon={Palette} tone="amber" />
          <span className="flex-1 text-[16px] font-medium">Тема</span>
        </div>
        <div className="grid grid-cols-3 gap-2 sm:grid-cols-6" role="radiogroup" aria-label="Тема оформления">
          {themes.map((t) => {
            const active = a.theme === t.id && !a.accent;
            return (
              <button
                key={t.id}
                role="radio"
                aria-checked={active}
                onClick={() => set({ theme: t.id, accent: null })}
                className={cn(
                  "flex flex-col items-center gap-2 rounded-2xl border px-2 py-3 text-[12.5px] font-medium transition-colors",
                  active ? "border-amber bg-amber/10 text-ink" : "border-edge text-ink-2 hover:bg-glass-2",
                )}
              >
                <span
                  className="relative flex size-9 items-center justify-center rounded-full"
                  style={{ background: `radial-gradient(circle at 35% 30%, ${t.active[2]}, ${t.active[0]} 60%, ${t.base})` }}
                  aria-hidden
                >
                  <span className="size-3.5 rounded-full ring-2 ring-black/30" style={{ backgroundColor: t.accent }} />
                  {active && (
                    <span className="absolute -right-1 -bottom-1 flex size-4.5 items-center justify-center rounded-full bg-amber text-on-accent">
                      <Check className="size-3" strokeWidth={3} />
                    </span>
                  )}
                </span>
                {t.name}
              </button>
            );
          })}
          {/* Свой цвет */}
          <label
            htmlFor={colorId}
            className={cn(
              "relative flex cursor-pointer flex-col items-center gap-2 rounded-2xl border px-2 py-3 text-[12.5px] font-medium transition-colors focus-within:outline-2 focus-within:outline-amber",
              a.accent ? "border-amber bg-amber/10 text-ink" : "border-edge text-ink-2 hover:bg-glass-2",
            )}
          >
            <span
              className="flex size-9 items-center justify-center rounded-full"
              style={{ background: "conic-gradient(#f87171, #fbbf24, #4ade80, #22d3ee, #818cf8, #f472b6, #f87171)" }}
              aria-hidden
            >
              <span className="size-4 rounded-full ring-2 ring-white/80" style={{ backgroundColor: accent }} />
            </span>
            Свой цвет
            <input
              id={colorId}
              type="color"
              value={accent}
              onChange={(e) => set({ accent: e.target.value })}
              className="absolute inset-0 cursor-pointer opacity-0"
              aria-label="Свой цвет акцента"
            />
          </label>
        </div>
        {a.accent && (
          <p className="mt-2.5 text-[13px] text-ink-3">
            Свой цвет {a.accent.toUpperCase()} поверх темы.{" "}
            <button className="text-amber underline-offset-2 hover:underline" onClick={() => set({ accent: null })}>
              Вернуть цвет темы
            </button>
          </p>
        )}
      </div>

      {/* Режим */}
      <div className="px-4 py-4">
        <p className="mb-3 text-[16px] font-medium">Режим</p>
        <div className="grid grid-cols-3 gap-1 rounded-2xl bg-glass p-1" role="radiogroup" aria-label="Светлая или тёмная">
          {modes.map(({ id, name, icon: Icon }) => (
            <button
              key={id}
              role="radio"
              aria-checked={a.mode === id}
              onClick={() => set({ mode: id })}
              className={cn(
                "flex h-11 items-center justify-center gap-1.5 rounded-xl text-[13.5px] font-medium transition-colors",
                a.mode === id ? "bg-ink text-base" : "text-ink-2 hover:text-ink",
              )}
            >
              <Icon className="size-4" aria-hidden />
              {name}
            </button>
          ))}
        </div>
      </div>

      {/* Фон */}
      <div className="px-4 py-4">
        <p className="mb-3 text-[16px] font-medium">Фон</p>
        <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Фон">
          {backgrounds.map((b) => (
            <button
              key={b.id}
              role="radio"
              aria-checked={a.background === b.id}
              onClick={() => (b.id === "image" ? fileRef.current?.click() : set({ background: b.id }))}
              className={cn(
                "flex h-10 items-center gap-1.5 rounded-full border px-4 text-[13.5px] font-medium transition-colors",
                a.background === b.id ? "border-amber bg-amber/10 text-ink" : "border-edge text-ink-2 hover:bg-glass-2",
              )}
            >
              {b.id === "image" && <ImagePlus className="size-4" aria-hidden />}
              {b.name}
            </button>
          ))}
          <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={(e) => pickImage(e.target.files?.[0])} />
        </div>

        <div className="mt-5 flex items-baseline justify-between">
          <span className="text-[14.5px] text-ink-2">Яркость фона</span>
          <span className="text-[14px] text-ink tabular-nums">{a.backgroundDim}%</span>
        </div>
        <Slider
          className="mt-1"
          min={0}
          max={100}
          step={5}
          value={[a.backgroundDim]}
          onValueChange={([v]) => set({ backgroundDim: v })}
          aria-label="Яркость фона"
        />

        <div className="mt-4 flex items-baseline justify-between">
          <span className="text-[14.5px] text-ink-2">Размытие стекла</span>
          <span className="text-[14px] text-ink tabular-nums">{a.glassBlur === 0 ? "Выкл." : `${a.glassBlur} px`}</span>
        </div>
        <Slider
          className="mt-1"
          min={0}
          max={40}
          step={2}
          value={[a.glassBlur]}
          onValueChange={([v]) => set({ glassBlur: v })}
          aria-label="Размытие стекла"
        />
      </div>

      <Row
        htmlFor="appearance-motion"
        icon={<IconTile icon={Sparkles} tone="violet" />}
        title="Анимации"
        hint="Волны вокруг кнопки и плавающие пятна на фоне"
        aside={<Switch id="appearance-motion" checked={a.motion} onCheckedChange={(v) => set({ motion: v })} />}
      />
    </Group>
  );
}
