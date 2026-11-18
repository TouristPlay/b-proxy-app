import { ClipboardCopy, FileText, FolderOpen, RefreshCw } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { backend } from "@/backend";
import { detectPlatform, isMobile } from "@/backend/xray";
import { IconTile } from "@/components/bits";
import { Button } from "@/components/ui/button";
import { Sheet } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import { t } from "@/lib/i18n";

type Which = "app" | "core";

/**
 * Технические журналы: что делало приложение (bproxy.log) и что писало ядро Xray (xray.log).
 * Нужны, чтобы разобраться, почему не подключается. Ссылки с ключами в них заменены.
 */
export function LogsSheet({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const [which, setWhich] = useState<Which>("app");
  const [text, setText] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const box = useRef<HTMLPreElement>(null);
  const desktop = !isMobile(detectPlatform());

  const load = useCallback(async () => {
    setText(null);
    const t = await backend.readLog(which);
    setText(t);
    // Самое свежее — внизу: прокручиваем к концу.
    requestAnimationFrame(() => box.current?.scrollTo({ top: box.current.scrollHeight }));
  }, [which]);

  useEffect(() => {
    if (open) void load();
  }, [open, load]);

  function flash(t: string) {
    setNote(t);
    window.setTimeout(() => setNote(null), 3000);
  }

  return (
    <Sheet
      open={open}
      onOpenChange={onOpenChange}
      wide
      title={t("Технические журналы")}
      description={t("Что делали приложение и ядро. Пригодится поддержке, если что-то не работает")}
      icon={<IconTile icon={FileText} tone="gray" />}
    >
      <div className="glass mb-3 grid grid-cols-2 gap-1 rounded-2xl p-1" role="tablist" aria-label={t("Какой журнал")}>
        {(
          [
            ["app", t("Приложение")],
            ["core", t("Ядро Xray")],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={which === id}
            onClick={() => setWhich(id)}
            className={cn(
              "h-10 rounded-xl text-sm font-medium transition-colors duration-[var(--dur)]",
              which === id ? "bg-ink text-base" : "text-ink-2 hover:text-ink",
            )}
          >
            {label}
          </button>
        ))}
      </div>

      <pre
        ref={box}
        tabIndex={0}
        aria-label={which === "app" ? t("Журнал приложения") : t("Журнал ядра")}
        className="glass h-[42dvh] overflow-auto overscroll-contain rounded-[18px] p-3 font-mono text-[12px] leading-relaxed whitespace-pre-wrap text-ink-2"
      >
        {text == null
          ? t("Загружаем…")
          : text.trim()
            ? text
            : which === "core"
              ? t("Ядро ещё ничего не записало. Подключитесь, и здесь появятся его сообщения. Подробность — в «Ядро Xray» → уровень журнала")
              : t("Журнал пуст")}
      </pre>

      <div className="mt-3 flex flex-wrap gap-2">
        <Button size="sm" variant="glass" onClick={() => void load()}>
          <RefreshCw />
          
          {t("Обновить")}
        </Button>
        <Button
          size="sm"
          variant="glass"
          disabled={!text}
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(text ?? "");
              flash(t("Скопировано"));
            } catch {
              flash(t("Нет доступа к буферу обмена"));
            }
          }}
        >
          <ClipboardCopy />
          
          {t("Скопировать")}
        </Button>
        {desktop && (
          <Button
            size="sm"
            variant="ghost"
            onClick={async () => {
              if (!(await backend.openLogsFolder())) flash(t("Папка журналов доступна только в приложении"));
            }}
          >
            <FolderOpen />
            
            {t("Открыть папку")}
          </Button>
        )}
      </div>
      <p aria-live="polite" className="mt-2 min-h-5 text-[13px] text-good">
        {note}
      </p>
    </Sheet>
  );
}
