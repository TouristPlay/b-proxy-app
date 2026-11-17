//! B-Proxy: оболочка Tauri вокруг интерфейса из `ui/`.
//! Вся работа с ядром Xray и VPN — в плагине `tauri-plugin-bproxy`.

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_bproxy::init())
        .run(tauri::generate_context!())
        .expect("не удалось запустить B-Proxy");
}
