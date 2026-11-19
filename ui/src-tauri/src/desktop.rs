//! Компьютер: значок в трее, закрытие окна в трей, автозапуск при входе в систему,
//! регистрация ссылок bproxy://. Один экземпляр приложения — в lib.rs.
//!
//! При автозапуске приложение получает аргумент `--minimized` и стартует сразу в трее.
//! Сворачивать ли окно в трей при закрытии, решает настройка в интерфейсе
//! (команда `set_close_to_tray`); по умолчанию — да.

use std::sync::atomic::{AtomicBool, Ordering};

use serde::Deserialize;
use tauri::{
    image::Image,
    menu::{CheckMenuItem, IsMenuItem, Menu, MenuItem, PredefinedMenuItem, Submenu},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    AppHandle, Builder, Emitter, Manager, Runtime, WindowEvent, Wry,
};
use tauri_plugin_autostart::MacosLauncher;

/// Аргумент, с которым система запускает B-Proxy при входе.
const MINIMIZED: &str = "--minimized";

static CLOSE_TO_TRAY: AtomicBool = AtomicBool::new(true);

/// Интерфейс сообщает, сворачивать ли окно в трей при закрытии.
#[tauri::command]
pub fn set_close_to_tray(enabled: bool) {
    CLOSE_TO_TRAY.store(enabled, Ordering::Relaxed);
}

// ---------- Меню в трее ----------
//
// Меню строит интерфейс (тексты на языке приложения, список серверов) и присылает командой
// `update_tray`; нажатия приходят обратно событием `tray-action` с id пункта:
// toggle, ping, refresh, auto, server:<номер>, open — сами по себе, quit — выход.

static TRAY_ON: &[u8] = include_bytes!("../tray/on.png");
static TRAY_OFF: &[u8] = include_bytes!("../tray/off.png");

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TrayModel {
    /// «Подключено · Нидерланды» — строка состояния (не нажимается).
    status: String,
    connected: bool,
    /// «Подключить» / «Отключить».
    toggle: String,
    tooltip: String,
    servers_title: String,
    auto: Option<TrayCheck>,
    servers: Vec<TrayCheck>,
    ping: String,
    refresh: String,
    open: String,
    quit: String,
}

#[derive(Deserialize)]
pub struct TrayCheck {
    label: String,
    checked: bool,
}

#[tauri::command]
pub fn update_tray(app: AppHandle, model: TrayModel) -> Result<(), String> {
    let tray = app.tray_by_id("main").ok_or("нет значка в трее")?;
    let menu = build_menu(&app, &model).map_err(|e| e.to_string())?;
    tray.set_menu(Some(menu)).map_err(|e| e.to_string())?;
    let _ = tray.set_tooltip(Some(&model.tooltip));
    if let Ok(icon) = Image::from_bytes(if model.connected { TRAY_ON } else { TRAY_OFF }) {
        let _ = tray.set_icon(Some(icon));
    }
    Ok(())
}

fn build_menu<R: Runtime>(app: &AppHandle<R>, m: &TrayModel) -> tauri::Result<Menu<R>> {
    let status = MenuItem::with_id(app, "status", &m.status, false, None::<&str>)?;
    let toggle = MenuItem::with_id(app, "toggle", &m.toggle, true, None::<&str>)?;
    let sep = || PredefinedMenuItem::separator(app);

    let mut server_items: Vec<Box<dyn IsMenuItem<R>>> = Vec::new();
    if let Some(auto) = &m.auto {
        server_items.push(Box::new(CheckMenuItem::with_id(app, "auto", &auto.label, true, auto.checked, None::<&str>)?));
        server_items.push(Box::new(sep()?));
    }
    for (i, s) in m.servers.iter().enumerate() {
        server_items.push(Box::new(CheckMenuItem::with_id(app, format!("server:{i}"), &s.label, true, s.checked, None::<&str>)?));
    }
    let refs: Vec<&dyn IsMenuItem<R>> = server_items.iter().map(|b| b.as_ref()).collect();
    let servers = Submenu::with_id_and_items(app, "servers", &m.servers_title, !m.servers.is_empty(), &refs)?;

    let ping = MenuItem::with_id(app, "ping", &m.ping, true, None::<&str>)?;
    let refresh = MenuItem::with_id(app, "refresh", &m.refresh, true, None::<&str>)?;
    let open = MenuItem::with_id(app, "open", &m.open, true, None::<&str>)?;
    let quit = MenuItem::with_id(app, "quit", &m.quit, true, None::<&str>)?;
    Menu::with_items(
        app,
        &[&status, &toggle, &sep()?, &servers, &ping, &refresh, &sep()?, &open, &quit],
    )
}

/// Показать главное окно и вывести его поверх остальных.
pub fn show_main<R: Runtime>(app: &AppHandle<R>) {
    if let Some(w) = app.get_webview_window("main") {
        let _ = w.unminimize();
        let _ = w.show();
        let _ = w.set_focus();
    }
}

const WINDOW_FLAGS: fn() -> tauri_plugin_window_state::StateFlags = || {
    use tauri_plugin_window_state::StateFlags;
    // Видимость не восстанавливаем: окно показывает setup (или не показывает при автозапуске).
    StateFlags::all() - StateFlags::VISIBLE
};

fn restore_or_fit<R: Runtime>(app: &AppHandle<R>) {
    use tauri_plugin_window_state::{AppHandleExt, WindowExt};
    let saved = app
        .path()
        .app_config_dir()
        .map(|d| d.join(app.filename()).exists())
        .unwrap_or(false);
    match app.get_webview_window("main") {
        Some(w) if saved => {
            let _ = w.restore_state(WINDOW_FLAGS());
        }
        _ => fit_to_screen(app),
    }
}

/// Размер окна при первом запуске: 1280×820 (раскладка для компьютера), но не больше рабочей
/// области экрана. Без этого на скрытом окне Linux и маленьких экранах окно открывалось
/// узким — с раскладкой для телефона.
fn fit_to_screen<R: Runtime>(app: &AppHandle<R>) {
    use tauri::{LogicalSize, PhysicalPosition, PhysicalSize};
    let Some(w) = app.get_webview_window("main") else { return };
    let Some(monitor) = w.primary_monitor().ok().flatten().or_else(|| w.current_monitor().ok().flatten()) else {
        return;
    };
    let scale = monitor.scale_factor();
    let area = monitor.work_area();
    let (aw, ah) = (area.size.width as f64 / scale, area.size.height as f64 / scale);
    let width = 1280f64.min(aw * 0.94).max(400.0);
    let height = 820f64.min(ah * 0.92).max(640f64.min(ah));
    let _ = w.set_size(LogicalSize::new(width, height));
    let size = PhysicalSize::new((width * scale) as i32, (height * scale) as i32);
    let _ = w.set_position(PhysicalPosition::new(
        area.position.x + (area.size.width as i32 - size.width) / 2,
        area.position.y + (area.size.height as i32 - size.height) / 2,
    ));
}

pub fn setup(builder: Builder<Wry>) -> Builder<Wry> {
    builder
        .plugin(
            tauri_plugin_window_state::Builder::default()
                .with_state_flags(WINDOW_FLAGS())
                .skip_initial_state("main")
                .build(),
        )
        .plugin(tauri_plugin_autostart::init(
            MacosLauncher::LaunchAgent,
            Some(vec![MINIMIZED]),
        ))
        .on_window_event(|window, event| {
            if let WindowEvent::CloseRequested { api, .. } = event {
                if window.label() == "main" && CLOSE_TO_TRAY.load(Ordering::Relaxed) {
                    api.prevent_close();
                    let _ = window.hide();
                }
            }
        })
        .setup(|app| {
            // Меню до загрузки интерфейса; дальше его присылает интерфейс (update_tray).
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
                    "status" => {}
                    // Остальное делает интерфейс: подключение, выбор сервера, пинг.
                    id => {
                        let _ = app.emit("tray-action", id.to_string());
                    }
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
            match Image::from_bytes(TRAY_OFF) {
                Ok(icon) => tray = tray.icon(icon),
                Err(_) => {
                    if let Some(icon) = app.default_window_icon() {
                        tray = tray.icon(icon.clone());
                    }
                }
            }
            tray.build(app)?;

            // Ссылки bproxy:// на Windows и Linux регистрируем при запуске: так они работают
            // и без установщика (AppImage, переносная версия). macOS берёт схему из Info.plist.
            #[cfg(any(windows, target_os = "linux"))]
            {
                use tauri_plugin_deep_link::DeepLinkExt;
                if let Err(e) = app.deep_link().register_all() {
                    eprintln!("bproxy:// не зарегистрирован: {e}");
                }
            }

            // Размер и место окна с прошлого раза; при первом запуске — по размеру экрана.
            restore_or_fit(app.handle());

            // Окно создаётся скрытым, чтобы при автозапуске не мелькать на экране.
            let minimized = std::env::args().any(|a| a == MINIMIZED);
            if !minimized {
                show_main(app.handle());
            }
            Ok(())
        })
}
