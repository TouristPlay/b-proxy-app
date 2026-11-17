import { ClipboardPaste, Link2, LoaderCircle } from "lucide-react";
import { type FormEvent, useEffect, useId, useState } from "react";
import { backend } from "@/backend";
import { IconTile } from "@/components/bits";
import { Button } from "@/components/ui/button";
import { Sheet } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";

export function AddSubscriptionSheet({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const [url, setUrl] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const inputId = useId();
  const hintId = useId();

  useEffect(() => {
    if (open) {
      setError(null);
      setLoading(false);
    }
  }, [open]);

  async function paste() {
    try {
      const text = (await navigator.clipboard.readText()).trim();
      if (text) {
        setUrl(text);
        setError(null);
      }
    } catch {
      setError("Нет доступа к буферу обмена. Вставьте ссылку вручную.");
    }
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!url.trim()) {
      setError("Вставьте ссылку на подписку");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      await backend.addSubscription(url);
      setUrl("");
      onOpenChange(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }

  return (
    <Sheet
      open={open}
      onOpenChange={onOpenChange}
      title="Новая подписка"
      description="Ссылку выдаёт ваш VPN-провайдер: в личном кабинете или в Telegram-боте"
      icon={<IconTile icon={Link2} tone="amber" />}
    >
      <form onSubmit={submit} noValidate>
        <label htmlFor={inputId} className="mb-2 block px-1 text-sm font-medium text-ink-2">
          Ссылка на подписку
        </label>
        <div
          className={cn(
            "glass flex items-center rounded-[20px] transition-colors focus-within:border-amber/70 focus-within:ring-2 focus-within:ring-amber/40",
            error && "border-bad/60",
          )}
        >
          <input
            id={inputId}
            type="url"
            inputMode="url"
            autoComplete="off"
            autoCapitalize="off"
            spellCheck={false}
            value={url}
            onChange={(e) => {
              setUrl(e.target.value);
              if (error) setError(null);
            }}
            placeholder="https://example.com/sub/…"
            aria-invalid={Boolean(error)}
            aria-describedby={hintId}
            className="h-14 min-w-0 flex-1 bg-transparent px-4 text-[15px] text-ink placeholder:text-ink-3 focus:outline-none"
          />
          <button
            type="button"
            onClick={paste}
            className="mr-1.5 flex size-11 shrink-0 items-center justify-center rounded-full text-ink-2 hover:bg-glass-2 hover:text-ink"
            aria-label="Вставить из буфера обмена"
            title="Вставить из буфера обмена"
          >
            <ClipboardPaste className="size-5" />
          </button>
        </div>
        <p id={hintId} role={error ? "alert" : undefined} className={cn("mt-2 px-1 text-[13.5px]", error ? "text-bad" : "text-ink-3")}>
          {error ?? "Подойдёт ссылка Remnawave, Marzban и любые vless://, trojan://, hysteria2://"}
        </p>

        <Button type="submit" variant="amber" className="mt-6 w-full" disabled={loading}>
          {loading && <LoaderCircle className="animate-spin" />}
          {loading ? "Загружаем серверы" : "Добавить подписку"}
        </Button>
      </form>
    </Sheet>
  );
}
