import { Bell, Check, Link2, Power, QrCode, ShieldCheck } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { type ReactNode, useEffect, useState } from "react";
import logo from "@/assets/logo.png";
import { backend, useSnapshot } from "@/backend";
import { detectPlatform } from "@/backend/xray";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import { t } from "@/lib/i18n";

type Grant = "idle" | "asking" | "granted" | "denied";

/**
 * Знакомство при первом запуске: два шага — подписка и разрешения.
 * Подписку добавляет обычный лист «Новая подписка»; как только она появилась — следующий шаг.
 */
export function Onboarding({ onAdd }: { onAdd: () => void }) {
  const s = useSnapshot();
  const [step, setStep] = useState<1 | 2>(1);
  const hasSub = s.subscriptions.length > 0;
  const mobile = ["android", "ios"].includes(detectPlatform());
  const [vpn, setVpn] = useState<Grant>("idle");
  const [notify, setNotify] = useState<Grant>("idle");

  // Подписка добавилась — к разрешениям.
  useEffect(() => {
    if (hasSub && step === 1) setStep(2);
  }, [hasSub, step]);

  async function ask(set: (g: Grant) => void, fn: () => Promise<boolean>) {
    set("asking");
    set((await fn()) ? "granted" : "denied");
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="onboarding-title"
      className="fixed inset-0 z-40 overflow-y-auto bg-base/70 backdrop-blur-xl"
    >
      <div className="mx-auto flex min-h-dvh max-w-[440px] flex-col px-5 md:justify-center pt-[max(28px,env(safe-area-inset-top))] pb-[max(24px,env(safe-area-inset-bottom))]">
        <div className="flex items-center justify-between">
          <span className="flex items-center gap-2.5">
            <img src={logo} alt="" width={36} height={36} className="size-9 rounded-full" />
            <span className="font-display text-[17px] font-semibold">B-Proxy</span>
          </span>
          <span className="text-[13px] text-ink-3 tabular-nums" aria-label={t("Шаг {0} из 2", [step])}>
            {step} / 2
          </span>
        </div>

        {step === 1 ? (
          <section className="flex flex-1 flex-col justify-center py-10 md:flex-none">
            <h1 id="onboarding-title" className="font-display text-[32px] leading-[1.1] font-bold tracking-[-0.02em]">
              {t("Сначала — подписка")}
            </h1>
            <p className="mt-3 text-[16px] leading-relaxed text-ink-2">
              {t("Ссылку выдаёт ваш VPN-провайдер — в личном кабинете или в Telegram-боте. Серверы, срок и трафик B-Proxy подтянет из неё сам.")}
            </p>
            <ul className="mt-7 flex flex-col gap-3">
              <Hint icon={Link2}>{t("Ссылка https://… или vless://, trojan://, hysteria2://")}</Hint>
              <Hint icon={QrCode}>{t("QR-код — камерой или картинкой")}</Hint>
            </ul>
            <div className="mt-auto flex flex-col gap-2 pt-10 md:mt-0">
              <Button variant="amber" className="w-full" onClick={onAdd}>
                {t("Добавить подписку")}
              </Button>
              <Button variant="ghost" className="w-full text-ink-2" onClick={() => setStep(2)}>
                {t("Добавлю позже")}
              </Button>
            </div>
          </section>
        ) : (
          <section className="flex flex-1 flex-col justify-center py-10 md:flex-none">
            <h1 id="onboarding-title" className="font-display text-[32px] leading-[1.1] font-bold tracking-[-0.02em]">
              {hasSub ? t("Подписка на месте") : t("Почти готово")}
            </h1>
            <p className="mt-3 text-[16px] leading-relaxed text-ink-2">
              {mobile
                ? t("Остались разрешения системы. Их можно дать и потом — система спросит при первом подключении.")
                : t("Пара настроек для компьютера. Всё это потом есть в «Настройках».")}
            </p>
            <div className="glass mt-7 divide-y divide-edge rounded-[24px]">
              {mobile && (
                <PermRow
                  icon={ShieldCheck}
                  title={t("Создавать VPN")}
                  hint={t("Без этого телефон не пустит трафик через B-Proxy")}
                  grant={vpn}
                  onAsk={() => void ask(setVpn, () => backend.requestVpnPermission())}
                />
              )}
              <PermRow
                icon={Bell}
                title={t("Уведомления")}
                hint={t("Если VPN отключится и когда подписка подходит к концу")}
                grant={notify}
                onAsk={() => void ask(setNotify, () => backend.requestNotifications())}
              />
              {!mobile && s.autostart !== null && (
                <label htmlFor="onb-autostart" className="flex min-h-[68px] cursor-pointer items-center gap-3.5 px-4 py-3">
                  <Power className="size-5 shrink-0 text-ink-2" aria-hidden />
                  <span className="min-w-0 flex-1">
                    <span className="block font-medium">{t("Запускать вместе с системой")}</span>
                    <span className="block text-[13px] text-ink-3">{t("Свёрнутым в трей, без окна")}</span>
                  </span>
                  <Switch id="onb-autostart" checked={!!s.autostart} onCheckedChange={(v) => void backend.setAutostart(v)} />
                </label>
              )}
            </div>
            <div className="mt-auto flex flex-col gap-2 pt-10 md:mt-0">
              <Button variant="amber" className="w-full" onClick={() => backend.finishOnboarding()}>
                {hasSub ? t("Перейти к подключению") : t("Готово")}
              </Button>
              {!hasSub && (
                <Button variant="ghost" className="w-full text-ink-2" onClick={() => setStep(1)}>
                  {t("Назад к подписке")}
                </Button>
              )}
            </div>
          </section>
        )}
      </div>
    </div>
  );
}

function Hint({ icon: Icon, children }: { icon: LucideIcon; children: ReactNode }) {
  return (
    <li className="flex items-center gap-3 text-[15px] text-ink-2">
      <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-glass-2 text-amber">
        <Icon className="size-[18px]" aria-hidden />
      </span>
      {children}
    </li>
  );
}

function PermRow({ icon: Icon, title, hint, grant, onAsk }: { icon: LucideIcon; title: string; hint: string; grant: Grant; onAsk: () => void }) {
  return (
    <div className="flex min-h-[68px] items-center gap-3.5 px-4 py-3">
      <Icon className="size-5 shrink-0 text-ink-2" aria-hidden />
      <span className="min-w-0 flex-1">
        <span className="block font-medium">{title}</span>
        <span className={cn("block text-[13px]", grant === "denied" ? "text-warn" : "text-ink-3")}>
          {grant === "denied" ? t("Не разрешено — можно включить в настройках системы") : hint}
        </span>
      </span>
      {grant === "granted" ? (
        <span className="flex items-center gap-1 text-[14px] font-medium text-good">
          <Check className="size-4" aria-hidden />
          {t("Разрешено")}
        </span>
      ) : (
        <Button variant="glass" size="sm" disabled={grant === "asking"} onClick={onAsk}>
          {grant === "denied" ? t("Ещё раз") : t("Разрешить")}
        </Button>
      )}
    </div>
  );
}
