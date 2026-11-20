import qrcode from "qrcode-generator";
import { Check, Copy, QrCode, ShieldAlert } from "lucide-react";
import { useMemo, useState } from "react";
import type { Subscription } from "@/backend";
import { IconTile } from "@/components/bits";
import { Button } from "@/components/ui/button";
import { Sheet } from "@/components/ui/sheet";
import { t } from "@/lib/i18n";

/**
 * Перенос подписки на другое устройство: QR со ссылкой bproxy://add/<адрес>.
 * Камера телефона с B-Proxy сразу откроет приложение, сканер в «Новой подписке» тоже её понимает.
 */
export function ShareSubscriptionSheet({ sub, open, onOpenChange }: { sub: Subscription; open: boolean; onOpenChange: (v: boolean) => void }) {
  const link = `bproxy://add/${sub.url}`;
  const [copied, setCopied] = useState(false);

  // SVG без цветов темы: QR должен быть чёрным на белом, иначе камеры читают хуже.
  const svg = useMemo(() => {
    if (sub.hideUrl) return "";
    const qr = qrcode(0, "M");
    qr.addData(link);
    qr.make();
    return qr.createSvgTag({ cellSize: 6, margin: 4, scalable: true });
  }, [link, sub.hideUrl]);

  async function copy() {
    try {
      await navigator.clipboard.writeText(sub.url);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      /* буфер обмена недоступен */
    }
  }

  return (
    <Sheet
      open={open}
      onOpenChange={onOpenChange}
      title={t("На другое устройство")}
      description={sub.title}
      icon={<IconTile icon={QrCode} tone="teal" />}
    >
      {sub.hideUrl ? (
        <p className="glass rounded-[24px] px-4 py-5 text-[14px] text-ink-2">
          {t("Провайдер скрыл адрес этой подписки. Возьмите ссылку для другого устройства у него — в личном кабинете или боте.")}
        </p>
      ) : (
        <div className="flex flex-col items-center gap-5">
          {/* Белая подложка с полями — QR читается с экрана и в тёмной теме. */}
          <div
            className="aspect-square w-full max-w-[300px] rounded-[24px] bg-white p-3 [&_svg]:size-full"
            role="img"
            aria-label={t("QR-код подписки «{0}»", [sub.title])}
            dangerouslySetInnerHTML={{ __html: svg }}
          />
          <p className="max-w-sm text-center text-[14px] leading-relaxed text-ink-2">
            {t("Откройте камеру телефона или «Добавить подписку» → «Сканировать QR» в B-Proxy и наведите на код.")}
          </p>
          <Button variant="glass" className="w-full max-w-sm" onClick={() => void copy()}>
            {copied ? <Check className="text-good" aria-hidden /> : <Copy aria-hidden />}
            {copied ? t("Ссылка скопирована") : t("Скопировать ссылку")}
          </Button>
          <p className="flex max-w-sm gap-2 text-[13px] text-warn">
            <ShieldAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
            {t("Это ключ к вашей подписке: кто отсканирует код, тот получит доступ и займёт место устройства. Не показывайте его посторонним.")}
          </p>
        </div>
      )}
    </Sheet>
  );
}
