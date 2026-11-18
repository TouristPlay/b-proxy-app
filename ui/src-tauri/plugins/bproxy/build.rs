const COMMANDS: &[&str] = &["invoke_core", "fetch_subscription", "prepare", "start", "stop", "stats", "log", "log_info", "read_log", "open_logs_dir", "tcp_ping", "device_info"];

fn main() {
    tauri_plugin::Builder::new(COMMANDS)
        .android_path("android")
        .ios_path("ios")
        .build();
}
