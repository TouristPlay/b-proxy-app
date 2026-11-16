fn main() {
    // На Windows ядру нужен адаптер Wintun, а его создаёт только администратор:
    // в манифесте приложения просим права администратора при запуске.
    let attrs = tauri_build::Attributes::new().windows_attributes(
        tauri_build::WindowsAttributes::new().app_manifest(include_str!("windows-app-manifest.xml")),
    );
    tauri_build::try_build(attrs).expect("не удалось подготовить сборку Tauri");
}
