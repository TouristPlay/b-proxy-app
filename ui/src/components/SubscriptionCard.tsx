import { ExternalLink, MessageCircle, RefreshCw } from "lucide-react";
import { useState } from "react";
import { backend, type Subscription } from "@/backend";
import { Button, buttonVariants } from "@/components/ui/button";
import { daysLeft, formatBytes, formatDate, plural } from "@/lib/format";
import { cn } from "@/lib/utils";
import { t } from "@/lib/i18n";

/** Карточка подписки: крупно — сколько дней осталось, ниже трафик и «Продлить». */
export function SubscriptionCard({ sub, className }: { sub: Subscription; className?: string }) {
  const [busy, setBusy] = useState(false);
  const days = daysLeft(sub.expireAt);
  const unlimited = sub.totalBytes <= 0;
  const used = unlimited ? 0 : Math.min(1, sub.usedBytes / sub.totalBytes);
  const ending = days != null && days <= 3;

  return (
    <section
      className={cn(
        "glass relative overflow-hidden rounded-[28px] border-amber/20 p-4 short:px-4 short:py-3",
        "bg-[radial-gradient(120%_90%_at_100%_0%,color-mix(in_srgb,var(--color-amber)_13%,transparent),transparent_60%)]",
        className,
      )}
      aria-label={t("Подписка")}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[13px] font-medium text-amber/90">{sub.plan ?? t("Подписка")}</p>
          <p className="mt-0.5 truncate font-display text-lg font-semibold">{sub.title}</p>
        </div>
        <Button
          variant="glass"
          size="icon"
          aria-label={t("Обновить подписку")}
          title={t("Обновить подписку")}
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            await backend.refreshSubscriptions().finally(() => setBusy(false));
          }}
        >
          <RefreshCw className={cn(busy && "animate-spin")} />
        </Button>
      </div>

      {/* Подпись «дней осталось / до …» — по центру высоты числа. */}
      <div className="mt-2 flex items-center gap-3 short:mt-1">
        {days == null ? (
          <span className="font-display text-[34px] font-semibold">{t("Бессрочно")}</span>
        ) : (
          <>
            <span
              className={cn(
                "font-display text-[52px] leading-none font-bold tracking-[-0.04em] short:text-[42px]",
                ending ? "text-bad" : "bg-gradient-to-b from-amber-2 to-amber bg-clip-text text-transparent",
              )}
            >
              {days}
            </span>
            <span className="text-[15px] text-ink-2">
              {plural(days, t("день остался"), t("дня осталось"), t("дней осталось"))}
              {sub.expireAt && <span className="block text-[13px] text-ink-3">{t("до {0}", [formatDate(sub.expireAt)])}</span>}
            </span>
          </>
        )}
      </div>

      <div className="mt-3 short:mt-2">
        <div className="flex items-baseline justify-between text-[13.5px]">
          <span className="text-ink-2">{t("Трафик")}</span>
          <span className="tabular-nums">
            {unlimited ? (
              <>
                {formatBytes(sub.usedBytes)} <span className="text-ink-3">{t("· не ограничен")}</span>
              </>
            ) : (
              <>
                {formatBytes(sub.usedBytes)} <span className="text-ink-3">{t("из {0}", [formatBytes(sub.totalBytes)])}</span>
              </>
            )}
          </span>
        </div>
        <div
          className="mt-2 h-1.5 overflow-hidden rounded-full bg-glass-3"
          role="progressbar"
          aria-label={t("Использованный трафик")}
          aria-valuenow={Math.round(used * 100)}
          aria-valuemin={0}
          aria-valuemax={100}
        >
          <div
            className={cn("h-full rounded-full", unlimited ? "w-full bg-good/25" : used > 0.9 ? "bg-bad" : "bg-gradient-to-r from-amber-deep to-amber")}
            style={unlimited ? undefined : { width: `${Math.max(2, used * 100)}%` }}
          />
        </div>
      </div>

      <div className="mt-3 flex gap-2 short:mt-2.5">
        {sub.webPageUrl && (
          <a href={sub.webPageUrl} target="_blank" rel="noreferrer" className={buttonVariants({ variant: "amber", className: "flex-1" })}>
            <ExternalLink />
            
            {t("Продлить")}
          </a>
        )}
        {sub.supportUrl && (
          <a
            href={sub.supportUrl}
            target="_blank"
            rel="noreferrer"
            className={buttonVariants({ variant: "glass", className: sub.webPageUrl ? "" : "flex-1" })}
          >
            <MessageCircle />
            
            {t("Поддержка")}
          </a>
        )}
      </div>
    </section>
  );
}
