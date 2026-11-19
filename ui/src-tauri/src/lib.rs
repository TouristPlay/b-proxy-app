//! B-Proxy: оболочка Tauri вокруг интерфейса из `ui/`.
//! Вся работа с ядром Xray и VPN — в плагине `tauri-plugin-bproxy`.
//! На компьютере здесь же значок в трее, закрытие окна в трей и автозапуск.

mod crash;
#[cfg(desktop)]
mod desktop;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    // Отчёты о сбоях — до всего остального, чтобы поймать и ранние паники (если пользователь согласен).
    let _crash = crash::init();
    let builder = tauri::Builder::default();
    // Один экземпляр на компьютере — первым плагином, как требует Tauri: повторный запуск
    // (ярлык или ссылка bproxy://) передаёт аргументы уже открытому окну.
    #[cfg(desktop)]
    let builder = builder.plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| desktop::show_main(app)));
    let builder = builder
        .plugin(tauri_plugin_deep_link::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_bproxy::init());

    #[cfg(desktop)]
    let builder = desktop::setup(builder)
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init());

    // Команды самого приложения (у плагина bproxy — свои).
    #[cfg(desktop)]
    let builder = builder.invoke_handler(tauri::generate_handler![crash::set_crash_reports, desktop::set_close_to_tray]);
    #[cfg(mobile)]
    let builder = builder.invoke_handler(tauri::generate_handler![crash::set_crash_reports]);

    // QR-код подписки камерой — только на телефонах.
    #[cfg(mobile)]
    let builder = builder.plugin(tauri_plugin_barcode_scanner::init());

    #[cfg(mobile)]
    let builder = builder.setup(|app| {
        use tauri::Manager;
        if let Some(w) = app.get_webview_window("main") {
            let _ = w.show();
        }
        Ok(())
    });

    builder
        .run(tauri::generate_context!())
        .expect("не удалось запустить B-Proxy");
}
