/**
 * Отчёты о сбоях интерфейса — в Sentry-совместимый сервер (Sentry, GlitchTip).
 * Адрес (DSN) задаётся при сборке: VITE_SENTRY_DSN. Без него ничего не отправляется,
 * а выключатель в настройках скрыт.
 *
 * Только ошибки и стек: без журнала действий, IP, данных устройства. Ссылки в тексте
 * обрезаются до адреса сервера — в ссылках подписок ключи.
 */

export const CRASH_DSN: string = import.meta.env.VITE_SENTRY_DSN ?? "";

let enabled = false;
let started = false;

/** «https://sub.example.com/abc?x» → «https://sub.example.com/…», без логина и пароля. */
export function scrub(text: string): string {
  return text.replace(/([a-z][a-z0-9+.-]*:\/\/)([^\s"')]+)/gi, (_, scheme: string, rest: string) => {
    const cut = rest.search(/[/?#]/);
    const host = (cut < 0 ? rest : rest.slice(0, cut)).split("@").pop() ?? "";
    return scheme + host + (cut < 0 ? "" : "/…");
  });
}

export async function setCrashReports(on: boolean, release: string, platform: string) {
  enabled = on;
  if (!CRASH_DSN || !on || started) return;
  started = true;
  const Sentry = await import("@sentry/browser");
  Sentry.init({
    dsn: CRASH_DSN,
    release: `b-proxy@${release}`,
    environment: platform,
    sendDefaultPii: false,
    // Без журнала действий (клики, запросы, консоль): там могут быть адреса и названия серверов.
    defaultIntegrations: false,
    integrations: [Sentry.globalHandlersIntegration(), Sentry.linkedErrorsIntegration(), Sentry.dedupeIntegration()],
    beforeSend(event) {
      if (!enabled) return null;
      delete event.request;
      delete event.user;
      delete event.breadcrumbs;
      if (event.message) event.message = scrub(event.message);
      for (const e of event.exception?.values ?? []) if (e.value) e.value = scrub(e.value);
      return event;
    },
  });
}
