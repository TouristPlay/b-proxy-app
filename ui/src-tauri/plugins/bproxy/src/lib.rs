//! Плагин B-Proxy: ядро Xray (libXray) и системный VPN-туннель.
//!
//! - Windows: libXray.dll внутри процесса, адаптер Wintun (нужны права администратора).
//! - Linux и macOS: отдельный процесс `bproxy-core` с правами администратора
//!   (pkexec / osascript), разбор подписок и пинг — через libXray в процессе.
//! - Android: VpnService, ядро в процессе приложения (Kotlin, android/).
//! - iOS: Network Extension PacketTunnel (Swift, ios/ и расширение в проекте Xcode).

use tauri::{
    plugin::{Builder, TauriPlugin},
    Manager, Runtime,
};

mod commands;
mod device;
mod geo;
mod ping;
pub mod logs;
mod models;
mod speed;
mod subscription;

#[cfg(desktop)]
mod desktop;
#[cfg(mobile)]
mod mobile;

#[cfg(desktop)]
pub use desktop::Vpn;
#[cfg(mobile)]
pub use mobile::Vpn;

pub use models::*;

/// Доступ к плагину из любого места, где есть AppHandle.
pub trait VpnExt<R: Runtime> {
    fn vpn(&self) -> &Vpn<R>;
}

impl<R: Runtime, T: Manager<R>> VpnExt<R> for T {
    fn vpn(&self) -> &Vpn<R> {
        self.state::<Vpn<R>>().inner()
    }
}

pub fn init<R: Runtime>() -> TauriPlugin<R> {
    Builder::new("bproxy")
        .invoke_handler(tauri::generate_handler![
            commands::invoke_core,
            commands::fetch_subscription,
            commands::prepare,
            commands::start,
            commands::stop,
            commands::stats,
            commands::log,
            commands::log_info,
            commands::read_log,
            commands::open_logs_dir,
            commands::tcp_ping,
            commands::device_info,
            commands::geo_info,
            commands::download_geo,
            commands::live_activity,
            commands::speed_test
        ])
        .setup(|app, api| {
            if let Ok(dir) = app.path().app_local_data_dir() {
                logs::init(dir.join("logs"));
            }
            #[cfg(mobile)]
            let vpn = mobile::init(app, api)?;
            #[cfg(desktop)]
            let vpn = desktop::init(app, api)?;
            app.manage(vpn);
            Ok(())
        })
        .on_event(|app, event| {
            // Закрыли приложение — выключаем VPN, чтобы не остался туннель без интерфейса.
            #[cfg(desktop)]
            if let tauri::RunEvent::Exit = event {
                app.vpn().shutdown();
            }
            #[cfg(mobile)]
            let _ = (app, event);
        })
        .build()
}
