import { Camera, ClipboardPaste, ImageUp, Link2, LoaderCircle } from "lucide-react";
import { type ClipboardEvent, type FormEvent, useEffect, useId, useRef, useState } from "react";
import { detectPlatform } from "@/backend/xray";
import { decodeQrImage, scanQrWithCamera } from "@/lib/qr";
import { backend } from "@/backend";
import { IconTile } from "@/components/bits";
import { Button } from "@/components/ui/button";
import { Sheet } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import { t } from "@/lib/i18n";

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
      setError(t("Нет доступа к буферу обмена. Вставьте ссылку вручную."));
    }
  }

  const fileRef = useRef<HTMLInputElement>(null);
  const mobile = ["android", "ios"].includes(detectPlatform()) && "__TAURI_INTERNALS__" in window;
  const [scanning, setScanning] = useState(false);

  // Код прочитан — сразу добавляем: человек уже выбрал, что добавить.
  async function fromQr(text: string | null) {
    if (!text) {
      setError(t("QR-код не найден. Возьмите картинку крупнее, без обрезанных углов"));
      return;
    }
    setUrl(text);
    await add(text);
  }

  async function scanCamera() {
    setError(null);
    setScanning(true);
    try {
      await fromQr(await scanQrWithCamera());
    } catch (err) {
      const denied = err instanceof Error && err.message === "camera-denied";
      setError(denied ? t("Нет доступа к камере. Разрешите его B-Proxy в настройках системы") : t("Сканирование отменено"));
    } finally {
      setScanning(false);
    }
  }

  async function fromImage(file: Blob | null | undefined) {
    if (!file) return;
    setError(null);
    try {
      await fromQr(await decodeQrImage(file));
    } catch {
      setError(t("Не удалось открыть картинку. Подойдут PNG, JPG и снимки экрана"));
    }
  }

  // Вставили картинку (Ctrl+V со снимком экрана) — ищем на ней QR-код.
  function onPaste(e: ClipboardEvent) {
    const image = [...e.clipboardData.files].find((f) => f.type.startsWith("image/"));
    if (image) {
      e.preventDefault();
      void fromImage(image);
    }
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    await add(url);
  }

  async function add(url: string) {
    if (!url.trim()) {
      setError(t("Вставьте ссылку на подписку"));
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
      title={t("Новая подписка")}
      description={t("Ссылку выдаёт ваш VPN-провайдер: в личном кабинете или в Telegram-боте")}
      icon={<IconTile icon={Link2} tone="amber" />}
    >
      <form onSubmit={submit} onPaste={onPaste} noValidate>
        <label htmlFor={inputId} className="mb-2 block px-1 text-sm font-medium text-ink-2">
          
          {t("Ссылка на подписку")}
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
            className="h-14 min-w-0 flex-1 bg-transparent px-4 text-[16px] text-ink placeholder:text-ink-3 focus:outline-none"
          />
          <button
            type="button"
            onClick={paste}
            className="mr-1.5 flex size-11 shrink-0 items-center justify-center rounded-full text-ink-2 hover:bg-glass-2 hover:text-ink"
            aria-label={t("Вставить из буфера обмена")}
            title={t("Вставить из буфера обмена")}
          >
            <ClipboardPaste className="size-5" />
          </button>
        </div>
        <p id={hintId} role={error ? "alert" : undefined} className={cn("mt-2 px-1 text-[13.5px]", error ? "text-bad" : "text-ink-3")}>
          {error ?? t("Подойдёт ссылка Remnawave, Marzban и любые vless://, trojan://, hysteria2://")}
        </p>

        <div className="mt-4 flex gap-2">
          {mobile && (
            <Button type="button" variant="glass" className="flex-1" disabled={loading || scanning} onClick={() => void scanCamera()}>
              <Camera />
              {t("Сканировать QR")}
            </Button>
          )}
          <Button type="button" variant="glass" className="flex-1" disabled={loading} onClick={() => fileRef.current?.click()}>
            <ImageUp />
            {t("QR с картинки")}
          </Button>
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            className="hidden"
            tabIndex={-1}
            aria-hidden
            onChange={(e) => {
              void fromImage(e.target.files?.[0]);
              e.target.value = "";
            }}
          />
        </div>
        {!mobile && <p className="mt-2 px-1 text-[13px] text-ink-3">{t("Или вставьте снимок экрана с QR-кодом: {0}", [detectPlatform() === "macos" ? "⌘V" : "Ctrl+V"])}</p>}

        <Button type="submit" variant="amber" className="mt-6 w-full" disabled={loading}>
          {loading && <LoaderCircle className="animate-spin" />}
          {loading ? t("Загружаем серверы") : t("Добавить подписку")}
        </Button>
      </form>
    </Sheet>
  );
}
