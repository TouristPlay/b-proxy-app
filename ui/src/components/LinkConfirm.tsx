import { Link2 } from "lucide-react";
import { backend, useSnapshot } from "@/backend";
import { IconTile } from "@/components/bits";
import { Button } from "@/components/ui/button";
import { Sheet } from "@/components/ui/sheet";

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
      title={link?.kind === "routing" ? "Включить профиль маршрутизации?" : "Добавить подписку?"}
      description={
        link?.kind === "routing"
          ? `«${link.name}»: правила, какие сайты идут напрямую, а какие через VPN`
          : `Ссылка ведёт на ${host}. Добавляйте, только если её дал ваш провайдер`
      }
      icon={<IconTile icon={Link2} tone="amber" />}
    >
      <div className="flex flex-col gap-3">
        <Button variant="amber" className="min-h-12 w-full" onClick={() => void backend.confirmLink(true)}>
          {link?.kind === "routing" ? "Включить профиль" : "Добавить подписку"}
        </Button>
        <Button variant="ghost" className="min-h-12 w-full" onClick={() => void backend.confirmLink(false)}>
          Отмена
        </Button>
      </div>
    </Sheet>
  );
}

function safeHost(url: string) {
  try {
    return new URL(url).host;
  } catch {
    return "неизвестный адрес";
  }
}
