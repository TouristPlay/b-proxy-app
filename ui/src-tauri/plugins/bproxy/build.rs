const COMMANDS: &[&str] = &["invoke_core", "fetch_subscription", "prepare", "start", "stop", "stats", "log", "log_info", "read_log", "open_logs_dir", "tcp_ping", "device_info", "geo_info", "download_geo", "live_activity", "speed_test", "open_vpn_settings", "list_apps"];

fn main() {
    tauri_plugin::Builder::new(COMMANDS)
        .android_path("android")
        .ios_path("ios")
        .build();
}
