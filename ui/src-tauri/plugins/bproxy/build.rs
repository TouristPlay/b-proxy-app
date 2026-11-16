const COMMANDS: &[&str] = &["invoke_core", "fetch_subscription", "prepare", "start", "stop", "stats"];

fn main() {
    tauri_plugin::Builder::new(COMMANDS)
        .android_path("android")
        .ios_path("ios")
        .build();
}
