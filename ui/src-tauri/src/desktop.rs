//! Компьютер: значок в трее, закрытие окна в трей и автозапуск при входе в систему.
//!
//! При автозапуске приложение получает аргумент `--minimized` и стартует сразу в трее.
//! Сворачивать ли окно в трей при закрытии, решает настройка в интерфейсе
//! (команда `set_close_to_tray`); по умолчанию — да.

use std::sync::atomic::{AtomicBool, Ordering};

use tauri::{
    menu::{Menu, MenuItem, PredefinedMenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    AppHandle, Builder, Manager, Runtime, WindowEvent, Wry,
};
use tauri_plugin_autostart::MacosLauncher;

/// Аргумент, с которым система запускает B-Proxy при входе.
const MINIMIZED: &str = "--minimized";

static CLOSE_TO_TRAY: AtomicBool = AtomicBool::new(true);

/// Интерфейс сообщает, сворачивать ли окно в трей при закрытии.
#[tauri::command]
fn set_close_to_tray(enabled: bool) {
    CLOSE_TO_TRAY.store(enabled, Ordering::Relaxed);
}

/// Показать главное окно и вывести его поверх остальных.
pub fn show_main<R: Runtime>(app: &AppHandle<R>) {
    if let Some(w) = app.get_webview_window("main") {
        let _ = w.unminimize();
        let _ = w.show();
        let _ = w.set_focus();
    }
}

pub fn setup(builder: Builder<Wry>) -> Builder<Wry> {
    builder
        // Повторный запуск (ярлык, меню) не создаёт вторую копию, а показывает окно из трея.
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| show_main(app)))
        .plugin(tauri_plugin_autostart::init(
            MacosLauncher::LaunchAgent,
            Some(vec![MINIMIZED]),
        ))
        .invoke_handler(tauri::generate_handler![set_close_to_tray])
        .on_window_event(|window, event| {
            if let WindowEvent::CloseRequested { api, .. } = event {
                if window.label() == "main" && CLOSE_TO_TRAY.load(Ordering::Relaxed) {
                    api.prevent_close();
                    let _ = window.hide();
                }
            }
        })
        .setup(|app| {
            let open = MenuItem::with_id(app, "open", "Открыть B-Proxy", true, None::<&str>)?;
            let quit = MenuItem::with_id(app, "quit", "Выйти", true, None::<&str>)?;
            let menu = Menu::with_items(app, &[&open, &PredefinedMenuItem::separator(app)?, &quit])?;

            let mut tray = TrayIconBuilder::with_id("main")
                .tooltip("B-Proxy")
                .menu(&menu)
                .show_menu_on_left_click(false)
                .on_menu_event(|app, event| match event.id().as_ref() {
                    "open" => show_main(app),
                    // Выход по-настоящему: плагин bproxy на RunEvent::Exit остановит VPN.
                    "quit" => app.exit(0),
                    _ => {}
                })
                .on_tray_icon_event(|tray, event| {
                    if let TrayIconEvent::Click {
                        button: MouseButton::Left,
                        button_state: MouseButtonState::Up,
                        ..
                    } = event
                    {
                        show_main(tray.app_handle());
                    }
                });
            if let Some(icon) = app.default_window_icon() {
                tray = tray.icon(icon.clone());
            }
            tray.build(app)?;

            // Окно создаётся скрытым, чтобы при автозапуске не мелькать на экране.
            let minimized = std::env::args().any(|a| a == MINIMIZED);
            if !minimized {
                show_main(app.handle());
            }
            Ok(())
        })
}
