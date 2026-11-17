//! B-Proxy: оболочка Tauri вокруг интерфейса из `ui/`.
//! Вся работа с ядром Xray и VPN — в плагине `tauri-plugin-bproxy`.
//! На компьютере здесь же значок в трее, закрытие окна в трей и автозапуск.

#[cfg(desktop)]
mod desktop;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let builder = tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_bproxy::init());

    #[cfg(desktop)]
    let builder = desktop::setup(builder);

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
