use crate::logs::{self, LogInfo};
use crate::models::{FetchResult, PrepareResult, StartArgs, Stats};
use crate::{subscription, VpnExt};
use tauri::{command, AppHandle, Runtime};

/// Вызов libXray: `{apiVersion, method, payload}` → `{success, data, error}`.
#[command]
pub(crate) async fn invoke_core<R: Runtime>(app: AppHandle<R>, request: String) -> Result<String, String> {
    app.vpn().invoke_core(request).await
}

#[command]
pub(crate) async fn fetch_subscription(url: String, user_agent: String) -> Result<FetchResult, String> {
    subscription::fetch(&url, &user_agent).await
}

/// Разрешение на VPN (Android спрашивает пользователя, остальные — сразу да).
#[command]
pub(crate) async fn prepare<R: Runtime>(app: AppHandle<R>) -> Result<PrepareResult, String> {
    app.vpn().prepare().await
}

/// Запуск туннеля. Возвращается, когда VPN подключён или не смог подключиться.
#[command]
pub(crate) async fn start<R: Runtime>(
    app: AppHandle<R>,
    config: String,
    notify_disconnect: Option<bool>,
) -> Result<(), String> {
    app.vpn()
        .start(StartArgs { config, notify_disconnect: notify_disconnect.unwrap_or(false) })
        .await
}

#[command]
pub(crate) async fn stop<R: Runtime>(app: AppHandle<R>) -> Result<(), String> {
    app.vpn().stop().await
}

#[command]
pub(crate) async fn stats<R: Runtime>(app: AppHandle<R>) -> Result<Option<Stats>, String> {
    app.vpn().stats().await
}

/// Строка в журнал приложения от интерфейса: уровень INFO / WARN / ERROR.
#[command]
pub(crate) fn log(level: String, message: String) {
    let level = match level.as_str() {
        "error" => "ERROR",
        "warn" => "WARN",
        _ => "INFO",
    };
    logs::write(level, "ui", &message);
}

/// Где лежат журналы: интерфейс передаёт путь журнала ядра в конфиг Xray.
#[command]
pub(crate) fn log_info() -> Option<LogInfo> {
    logs::info_paths()
}

/// Конец журнала: which = "app" или "core".
#[command]
pub(crate) fn read_log(which: String, max_bytes: Option<u64>) -> Result<String, String> {
    logs::tail(&which, max_bytes.unwrap_or(64 * 1024))
}

#[command]
pub(crate) fn open_logs_dir() -> Result<(), String> {
    #[cfg(desktop)]
    return logs::open_dir();
    #[cfg(mobile)]
    Err("На телефоне папку журналов открыть нельзя — используйте «Скопировать»".into())
}

/// TCP-пинг серверов: время соединения с адресом и портом каждого.
#[command]
pub(crate) async fn tcp_ping(targets: Vec<crate::ping::Target>, timeout_ms: u64) -> Result<Vec<crate::ping::Result_>, String> {
    tauri::async_runtime::spawn_blocking(move || crate::ping::run(targets, timeout_ms))
        .await
        .map_err(|e| e.to_string())
}
