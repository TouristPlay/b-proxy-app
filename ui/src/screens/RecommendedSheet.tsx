import { Check, Copy, ExternalLink, Sparkles } from "lucide-react";
import { useEffect, useState } from "react";
import { backend, useSnapshot } from "@/backend";
import type { CatalogItem } from "@/backend/catalog";
import { IconTile } from "@/components/bits";
import { buttonVariants } from "@/components/ui/button";
import { Sheet } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import { t } from "@/lib/i18n";

/** «Рекомендуемые VPN»: платные размещения сервисов, где можно купить подписку. */
export function RecommendedSheet({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const { catalog } = useSnapshot();

  useEffect(() => {
    if (open) void backend.loadCatalog();
  }, [open]);

  return (
    <Sheet
      open={open}
      onOpenChange={onOpenChange}
      title={t("Рекомендуемые VPN")}
      description={t("Где купить подписку, если её ещё нет")}
      icon={<IconTile icon={Sparkles} tone="amber" />}
    >
      <div className="flex flex-col gap-3">
        {catalog?.length ? (
          catalog.map((item) => <Card key={item.id} item={item} />)
        ) : (
          <p className="glass rounded-[24px] px-4 py-5 text-[14px] text-ink-2">
            {t("Список пока пуст. Загляните позже или спросите подписку у знакомого провайдера.")}
          </p>
        )}
        <p className="px-2 pt-1 text-[12.5px] leading-relaxed text-ink-3">
          {t("Размещение в этом списке платное. B-Proxy не продаёт подписки и не отвечает за работу этих сервисов: условия, оплата и поддержка — у них.")}
        </p>
      </div>
    </Sheet>
  );
}

function Card({ item }: { item: CatalogItem }) {
  const [copied, setCopied] = useState(false);
  async function copyPromo() {
    if (!item.promo) return;
    try {
      await navigator.clipboard.writeText(item.promo);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      /* код и так виден */
    }
  }
  const ad = [t("Реклама"), item.advertiser, item.erid && `erid: ${item.erid}`].filter(Boolean).join(" · ");

  return (
    <article className="glass rounded-[24px] p-4" aria-label={item.name}>
      <div className="flex items-start gap-3">
        {item.logo ? (
          <img src={item.logo} alt="" className="size-12 shrink-0 rounded-[14px] bg-glass-2 object-cover" />
        ) : (
          <span className="flex size-12 shrink-0 items-center justify-center rounded-[14px] bg-glass-2 font-display text-[18px] font-semibold text-amber">
            {item.name.slice(0, 1)}
          </span>
        )}
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <h3 className="font-display text-[17px] leading-tight font-semibold">{item.name}</h3>
            {item.badge && <span className="rounded-full bg-amber/15 px-2 py-0.5 text-[12px] font-medium text-amber">{item.badge}</span>}
          </div>
          {item.price && <p className="mt-0.5 text-[14px] font-medium text-ink-2 tabular-nums">{item.price}</p>}
        </div>
      </div>
      {item.description && <p className="mt-3 text-[14px] leading-relaxed text-ink-2">{item.description}</p>}
      {item.tags?.length ? (
        <ul className="mt-3 flex flex-wrap gap-1.5" aria-label={t("Особенности")}>
          {item.tags.map((tag) => (
            <li key={tag} className="rounded-full border border-edge px-2.5 py-1 text-[12.5px] text-ink-2">
              {tag}
            </li>
          ))}
        </ul>
      ) : null}
      <div className="mt-4 flex gap-2">
        <a href={item.url} target="_blank" rel="noreferrer sponsored" className={buttonVariants({ variant: "amber", className: "flex-1" })}>
          <ExternalLink aria-hidden />
          {item.promo ? t("Купить") : t("Купить подписку")}
        </a>
        {item.promo && (
          <button
            type="button"
            onClick={() => void copyPromo()}
            className={cn(buttonVariants({ variant: "glass" }), "font-mono")}
            aria-label={t("Скопировать промокод {0}", [item.promo])}
          >
            {copied ? <Check className="text-good" aria-hidden /> : <Copy aria-hidden />}
            {item.promo}
          </button>
        )}
      </div>
      <p className="mt-3 text-[11.5px] text-ink-3">{ad}</p>
    </article>
  );
}
