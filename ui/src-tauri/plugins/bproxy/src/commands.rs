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
pub(crate) async fn start<R: Runtime>(app: AppHandle<R>, config: String) -> Result<(), String> {
    app.vpn().start(StartArgs { config }).await
}

#[command]
pub(crate) async fn stop<R: Runtime>(app: AppHandle<R>) -> Result<(), String> {
    app.vpn().stop().await
}

#[command]
pub(crate) async fn stats<R: Runtime>(app: AppHandle<R>) -> Result<Option<Stats>, String> {
    app.vpn().stats().await
}
