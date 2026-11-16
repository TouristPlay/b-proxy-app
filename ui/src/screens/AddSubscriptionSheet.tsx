import { ClipboardPaste, LoaderCircle } from "lucide-react";
import { type FormEvent, useEffect, useId, useState } from "react";
import { backend } from "@/backend";
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
      description="Ссылка есть в личном кабинете BaobabVPN и в Telegram-боте."
    >
      <form onSubmit={submit} noValidate>
        <label htmlFor={inputId} className="mb-2 block text-sm font-medium text-ink">
          Ссылка на подписку
        </label>
        <div
          className={cn(
            "flex items-center rounded-row border bg-night transition-colors focus-within:border-sun",
            error ? "border-danger" : "border-line",
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
            placeholder="https://sub.baobabproxy.com/…"
            aria-invalid={Boolean(error)}
            aria-describedby={hintId}
            className="min-h-13 min-w-0 flex-1 bg-transparent px-4 text-[15px] text-ink placeholder:text-ink-faint focus:outline-none"
          />
          <button
            type="button"
            onClick={paste}
            className="mr-1 flex size-11 shrink-0 items-center justify-center rounded-full text-ink-muted hover:bg-dusk hover:text-ink"
            aria-label="Вставить из буфера обмена"
            title="Вставить из буфера обмена"
          >
            <ClipboardPaste className="size-5" />
          </button>
        </div>
        <p id={hintId} role={error ? "alert" : undefined} className={cn("mt-2 text-sm", error ? "text-danger" : "text-ink-faint")}>
          {error ?? "Начинается с https://. Серверы и остаток трафика подтянутся автоматически."}
        </p>

        <Button type="submit" variant="sun" className="mt-6 w-full" disabled={loading}>
          {loading ? <LoaderCircle className="animate-spin" /> : null}
          {loading ? "Загружаем серверы" : "Добавить подписку"}
        </Button>
      </form>
    </Sheet>
  );
}
