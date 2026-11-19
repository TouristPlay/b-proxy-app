//! Отчёты о сбоях: паники Rust уходят в Sentry-совместимый сервер (Sentry, GlitchTip).
//! Адрес (DSN) задаётся при сборке переменной BPROXY_SENTRY_DSN; без него ничего не отправляется.
//! Отправляем, только если пользователь не выключил «Отправлять отчёты о сбоях»: интерфейс
//! сообщает это командой `set_crash_reports` при запуске (до этого отчёты не уходят).
//! Ссылки из текста ошибок вырезаются до адреса сервера — в них могут быть ключи подписок.

use std::sync::atomic::{AtomicBool, Ordering};

static CONSENT: AtomicBool = AtomicBool::new(false);

pub fn init() -> Option<sentry::ClientInitGuard> {
    let dsn = option_env!("BPROXY_SENTRY_DSN").filter(|d| !d.is_empty())?;
    let mut options = sentry::ClientOptions::default();
    options.release = Some(format!("b-proxy@{}", env!("CARGO_PKG_VERSION")).into());
    options.send_default_pii = false;
    options.before_send = Some(std::sync::Arc::new(|mut event| {
        if !CONSENT.load(Ordering::Relaxed) {
            return None;
        }
        event.server_name = None;
        event.user = None;
        if let Some(m) = event.message.as_mut() {
            *m = scrub(m);
        }
        for e in event.exception.values.iter_mut() {
            if let Some(v) = e.value.as_mut() {
                *v = scrub(v);
            }
        }
        Some(event)
    }));
    Some(sentry::init((dsn, options)))
}

#[tauri::command]
pub fn set_crash_reports(enabled: bool) {
    CONSENT.store(enabled, Ordering::Relaxed);
}

/// «https://sub.example.com/abc?token=…» → «https://sub.example.com/…».
pub fn scrub(text: &str) -> String {
    let mut out = String::with_capacity(text.len());
    let mut rest = text;
    while let Some(i) = rest.find("://") {
        out.push_str(&rest[..i + 3]);
        let tail = &rest[i + 3..];
        let end = tail.find(|c: char| c.is_whitespace() || c == '"' || c == '\'' || c == ')').unwrap_or(tail.len());
        let url = &tail[..end];
        let host_end = url.find(['/', '?', '#']).unwrap_or(url.len());
        // Логин и пароль в адресе (user:pass@host) тоже не нужны.
        let host = url[..host_end].rsplit('@').next().unwrap_or("");
        out.push_str(host);
        if host_end < url.len() {
            out.push_str("/…");
        }
        rest = &tail[end..];
    }
    out.push_str(rest);
    out
}

#[cfg(test)]
mod tests {
    use super::scrub;

    #[test]
    fn urls_lose_paths_and_credentials() {
        assert_eq!(scrub("нет сети: https://sub.example.com/api/sub/AbC123?x=1 ответ 500"), "нет сети: https://sub.example.com/… ответ 500");
        assert_eq!(scrub("vless://uuid-secret@1.2.3.4:443?type=tcp#Имя"), "vless://1.2.3.4:443/…");
        assert_eq!(scrub("без ссылок"), "без ссылок");
        assert_eq!(scrub("https://a.example.com"), "https://a.example.com");
    }
}
