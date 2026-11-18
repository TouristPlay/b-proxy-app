use crate::device::DeviceInfo;
use crate::geo::{self, GeoFile, GeoInfo};
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
pub(crate) async fn fetch_subscription<R: Runtime>(
    app: AppHandle<R>,
    url: String,
    user_agent: String,
    hwid: Option<bool>,
) -> Result<FetchResult, String> {
    let device = if hwid.unwrap_or(true) { app.vpn().device_info().await.ok() } else { None };
    subscription::fetch(&url, &user_agent, device.as_ref()).await
}

/// Папка баз geoip/geosite и что в ней лежит.
#[command]
pub(crate) async fn geo_info<R: Runtime>(app: AppHandle<R>) -> Result<GeoInfo, String> {
    Ok(geo::info(&app.vpn().geo_dir().await?))
}

/// Скачать geoip.dat или geosite.dat по ссылке из профиля маршрутизации.
#[command]
pub(crate) async fn download_geo<R: Runtime>(app: AppHandle<R>, name: String, url: String) -> Result<GeoFile, String> {
    let dir = app.vpn().geo_dir().await?;
    let file = geo::download(dir, &name, &url).await;
    match &file {
        Ok(f) => logs::info("geo", &format!("{} скачан: {} КБ", f.name, f.size / 1024)),
        Err(e) => logs::error("geo", e),
    }
    file
}

/// «Живая активность» iOS: start | update | end. На других платформах ничего не делает.
#[command]
pub(crate) async fn live_activity<R: Runtime>(app: AppHandle<R>, args: serde_json::Value) -> Result<(), String> {
    app.vpn().live_activity(args).await
}

/// HWID и сведения об устройстве — те же, что уходят провайдеру с подпиской.
#[command]
pub(crate) async fn device_info<R: Runtime>(app: AppHandle<R>) -> Result<DeviceInfo, String> {
    app.vpn().device_info().await
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

/// Проверка скорости через служебный SOCKS-вход ядра (порт из конфига этого подключения).
#[command]
pub(crate) async fn speed_test<R: Runtime>(app: AppHandle<R>, port: u16) -> Result<crate::speed::SpeedProgress, String> {
    let res = crate::speed::run(app, port).await;
    match &res {
        Ok(r) => logs::info(
            "speed",
            &format!("задержка {:?} мс, скачивание {:?} Мбит/с, отдача {:?} Мбит/с", r.latency_ms, r.download_mbps, r.upload_mbps),
        ),
        Err(e) => logs::error("speed", e),
    }
    res
}
