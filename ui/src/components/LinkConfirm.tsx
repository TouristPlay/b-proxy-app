import { Link2 } from "lucide-react";
import { backend, useSnapshot } from "@/backend";
import { IconTile } from "@/components/bits";
import { Button } from "@/components/ui/button";
import { Sheet } from "@/components/ui/sheet";
import { t } from "@/lib/i18n";

/**
 * Подтверждение ссылки bproxy://: её может открыть любой сайт, поэтому подписку
 * и профиль маршрутизации добавляем только после «Да».
 */
export function LinkConfirm() {
  const { pendingLink: link } = useSnapshot();
  const host = link?.kind === "subscription" ? safeHost(link.url) : "";
  return (
    <Sheet
      open={link != null}
      onOpenChange={(o) => !o && void backend.confirmLink(false)}
      title={link?.kind === "routing" ? t("Включить профиль маршрутизации?") : t("Добавить подписку?")}
      description={
        link?.kind === "routing"
          ? t("«{0}»: правила, какие сайты идут напрямую, а какие через VPN", [link.name])
          : t("Ссылка ведёт на {0}. Добавляйте, только если её дал ваш провайдер", [host])
      }
      icon={<IconTile icon={Link2} tone="amber" />}
    >
      <div className="flex flex-col gap-3">
        <Button variant="amber" className="min-h-12 w-full" onClick={() => void backend.confirmLink(true)}>
          {link?.kind === "routing" ? t("Включить профиль") : t("Добавить подписку")}
        </Button>
        <Button variant="ghost" className="min-h-12 w-full" onClick={() => void backend.confirmLink(false)}>
          
          {t("Отмена")}
        </Button>
      </div>
    </Sheet>
  );
}

function safeHost(url: string) {
  try {
    return new URL(url).host;
  } catch {
    return t("неизвестный адрес");
  }
}
