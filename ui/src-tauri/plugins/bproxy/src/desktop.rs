//! Компьютеры: Windows, Linux, macOS.
//!
//! libXray подгружается из папки ресурсов приложения через `libloading`
//! и вызывается через `CGoInvoke`/`CGoFree` — так работают разбор ссылок и пинг.
//!
//! Туннель:
//! - Windows и macOS — помощник с правами системы (служба `BProxyHelper` / LaunchDaemon,
//!   `helper.rs`): VPN включается без окна UAC и пароля. Службу Windows ставит установщик,
//!   помощника macOS — приложение при первом подключении (пароль один раз).
//! - Без помощника и на Linux — отдельный процесс `bproxy-core`: Linux из deb/rpm — с правами
//!   на сеть без пароля, иначе pkexec / osascript / окно UAC. Он пишет состояние в `core.state`
//!   и завершается, когда появляется файл `core.stop`.

use crate::logs;
use crate::models::{AppEntry, PrepareResult, StartArgs, StateEvent, Stats};
use serde::de::DeserializeOwned;
use std::ffi::{c_char, CStr, CString};
use std::path::PathBuf;
use std::sync::{Arc, Mutex};
use tauri::{plugin::PluginApi, AppHandle, Emitter, Manager, Runtime};

#[cfg(target_os = "windows")]
const LIB_NAME: &str = "libXray.dll";
#[cfg(target_os = "linux")]
const LIB_NAME: &str = "core/libXray.so";
#[cfg(target_os = "macos")]
const LIB_NAME: &str = "core/libXray.dylib";

/// Имя интерфейса туннеля — его же ставит конфиг (ui/src/backend/xray.ts).
#[cfg(target_os = "windows")]
const TUN_NAME: &str = "B-Proxy";
#[cfg(target_os = "linux")]
const TUN_NAME: &str = "bproxy0";
#[cfg(target_os = "macos")]
const TUN_NAME: &str = "utun199";

type InvokeFn = unsafe extern "C" fn(*const c_char) -> *mut c_char;
type FreeFn = unsafe extern "C" fn(*mut c_char);

struct Core {
    _lib: libloading::Library,
    invoke: InvokeFn,
    free: FreeFn,
}

impl Core {
    fn load(path: &PathBuf) -> Result<Self, String> {
        unsafe {
            let lib = libloading::Library::new(path)
                .map_err(|e| format!("Не удалось загрузить ядро {}: {e}", path.display()))?;
            let invoke = *lib
                .get::<InvokeFn>(b"CGoInvoke\0")
                .map_err(|e| e.to_string())?;
            let free = *lib.get::<FreeFn>(b"CGoFree\0").map_err(|e| e.to_string())?;
            Ok(Core { _lib: lib, invoke, free })
        }
    }

    fn call(&self, request: &str) -> Result<String, String> {
        let input = CString::new(request).map_err(|e| e.to_string())?;
        unsafe {
            let out = (self.invoke)(input.as_ptr());
            if out.is_null() {
                return Err("Пустой ответ ядра".into());
            }
            let text = CStr::from_ptr(out).to_string_lossy().into_owned();
            (self.free)(out);
            Ok(text)
        }
    }
}

pub struct Vpn<R: Runtime> {
    app: AppHandle<R>,
    core: Mutex<Option<Arc<Core>>>,
    running: Mutex<bool>,
    /// VPN включён через помощника (Windows, macOS), а не отдельным процессом.
    #[allow(dead_code)]
    helper: Mutex<bool>,
}

pub fn init<R: Runtime, C: DeserializeOwned>(
    app: &AppHandle<R>,
    _api: PluginApi<R, C>,
) -> tauri::Result<Vpn<R>> {
    Ok(Vpn {
        app: app.clone(),
        core: Mutex::new(None),
        running: Mutex::new(false),
        helper: Mutex::new(false),
    })
}

impl<R: Runtime> Vpn<R> {
    fn core(&self) -> Result<Arc<Core>, String> {
        let mut guard = self.core.lock().unwrap();
        if let Some(core) = guard.as_ref() {
            return Ok(core.clone());
        }
        let dir = self.app.path().resource_dir().map_err(|e| e.to_string())?;
        let path = dir.join(LIB_NAME);
        let core = Arc::new(Core::load(&path).inspect_err(|e| logs::error("core", e))?);
        logs::info("core", &format!("libXray загружен: {}", path.display()));
        *guard = Some(core.clone());
        Ok(core)
    }

    fn data_dir(&self) -> Result<PathBuf, String> {
        let dir = self.app.path().app_local_data_dir().map_err(|e| e.to_string())?;
        std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
        Ok(dir)
    }

    fn emit(&self, state: &str, error: Option<String>) {
        let _ = self.app.emit(
            "bproxy://state",
            StateEvent { state: state.into(), error },
        );
    }

    pub async fn invoke_core(&self, request: String) -> Result<String, String> {
        let core = self.core()?;
        tauri::async_runtime::spawn_blocking(move || core.call(&request))
            .await
            .map_err(|e| e.to_string())?
    }

    pub async fn live_activity(&self, _args: serde_json::Value) -> Result<(), String> {
        Ok(())
    }

    /// VPN сейчас работает через помощника (журнал соединений — у него).
    #[allow(dead_code)]
    pub fn uses_helper(&self) -> bool {
        *self.running.lock().unwrap() && *self.helper.lock().unwrap()
    }

    pub async fn geo_dir(&self) -> Result<PathBuf, String> {
        Ok(self.data_dir()?.join("geo"))
    }

    /// Запущенные программы пользователя (по имени процесса — так их понимает правило Xray «process»).
    pub async fn list_apps(&self) -> Result<Vec<AppEntry>, String> {
        tauri::async_runtime::spawn_blocking(|| {
            use sysinfo::{ProcessRefreshKind, ProcessesToUpdate, System, UpdateKind};
            let mut sys = System::new();
            sys.refresh_processes_specifics(
                ProcessesToUpdate::All,
                true,
                ProcessRefreshKind::nothing().with_exe(UpdateKind::Always),
            );
            let mut seen = std::collections::BTreeMap::new();
            for p in sys.processes().values() {
                // Без пути к программе — потоки ядра и системные процессы, их не показываем.
                let Some(exe) = p.exe() else { continue };
                // Имя файла программы, как его видит правило Xray (а не обрезанное имя процесса).
                let name = exe
                    .file_name()
                    .map(|n| n.to_string_lossy().to_string())
                    .unwrap_or_default()
                    .trim_end_matches(".exe")
                    .to_string();
                if name.is_empty() || name.starts_with("bproxy") || name.eq_ignore_ascii_case("b-proxy") {
                    continue;
                }
                let path = exe.to_string_lossy().to_string();
                if is_system_path(&path) {
                    continue;
                }
                seen.entry(name.to_lowercase()).or_insert(AppEntry { id: name.clone(), name, icon: None, path: Some(path) });
            }
            seen.into_values().collect()
        })
        .await
        .map_err(|e| e.to_string())
    }

    pub async fn open_vpn_settings(&self) -> Result<(), String> {
        Err("Есть только на Android".into())
    }

    pub async fn device_info(&self) -> Result<crate::device::DeviceInfo, String> {
        static CACHE: std::sync::OnceLock<crate::device::DeviceInfo> = std::sync::OnceLock::new();
        if let Some(d) = CACHE.get() {
            return Ok(d.clone());
        }
        let raw = tauri::async_runtime::spawn_blocking(crate::device::desktop_raw)
            .await
            .map_err(|e| e.to_string())?;
        if raw.id.is_empty() {
            return Err("Не удалось определить идентификатор устройства".into());
        }
        Ok(CACHE.get_or_init(|| crate::device::DeviceInfo::from_raw(raw)).clone())
    }

    pub async fn prepare(&self) -> Result<PrepareResult, String> {
        Ok(PrepareResult { granted: true })
    }

    pub async fn start(&self, args: StartArgs) -> Result<(), String> {
        logs::info("vpn", &format!("Запуск ядра, конфиг {} байт", args.config.len()));
        logs::rotate_core_log();
        let started = std::time::Instant::now();
        let result = self.start_inner(args).await;
        match &result {
            Ok(()) => {
                *self.running.lock().unwrap() = true;
                logs::info("vpn", &format!("VPN подключён за {} мс", started.elapsed().as_millis()));
                self.emit("connected", None);
            }
            Err(e) => {
                logs::error("vpn", &format!("Не удалось подключиться: {e}"));
                self.emit("disconnected", Some(e.clone()));
            }
        }
        result
    }

    pub async fn stop(&self) -> Result<(), String> {
        logs::info("vpn", "Отключение");
        let result = self.stop_inner().await;
        if let Err(e) = &result {
            logs::error("vpn", &format!("Ошибка при отключении: {e}"));
        }
        *self.running.lock().unwrap() = false;
        self.emit("disconnected", result.clone().err());
        result
    }

    /// Синхронная остановка при выходе из приложения.
    pub fn shutdown(&self) {
        if !*self.running.lock().unwrap() {
            return;
        }
        #[cfg(any(target_os = "windows", target_os = "macos"))]
        if *self.helper.lock().unwrap() {
            let _ = crate::helper::call(&serde_json::json!({ "cmd": "stop" }), std::time::Duration::from_secs(5));
            return;
        }
        if let Ok(dir) = self.data_dir() {
            let _ = std::fs::write(dir.join("core.stop"), b"");
        }
    }

    pub async fn stats(&self) -> Result<Option<Stats>, String> {
        if !*self.running.lock().unwrap() {
            return Ok(None);
        }
        Ok(interface_stats())
    }

    // ---------- Windows и macOS: помощник, без него — процесс ----------

    #[cfg(any(target_os = "windows", target_os = "macos"))]
    async fn start_inner(&self, args: StartArgs) -> Result<(), String> {
        if self.ensure_helper().await? {
            let request = serde_json::json!({ "cmd": "start", "config": args.config });
            tauri::async_runtime::spawn_blocking(move || crate::helper::call(&request, std::time::Duration::from_secs(60)))
                .await
                .map_err(|e| e.to_string())??;
            *self.helper.lock().unwrap() = true;
            logs::info("vpn", "Ядро запущено помощником");
            return Ok(());
        }
        *self.helper.lock().unwrap() = false;
        self.start_process(args).await
    }

    #[cfg(any(target_os = "windows", target_os = "macos"))]
    async fn stop_inner(&self) -> Result<(), String> {
        if *self.helper.lock().unwrap() {
            *self.helper.lock().unwrap() = false;
            let request = serde_json::json!({ "cmd": "stop" });
            return tauri::async_runtime::spawn_blocking(move || crate::helper::call(&request, std::time::Duration::from_secs(15)))
                .await
                .map_err(|e| e.to_string())?
                .map(|_| ());
        }
        self.stop_process().await
    }

    /// Windows: служба есть, если её поставил установщик NSIS.
    #[cfg(target_os = "windows")]
    async fn ensure_helper(&self) -> Result<bool, String> {
        Ok(tauri::async_runtime::spawn_blocking(crate::helper::available).await.unwrap_or(false))
    }

    /// macOS: помощника ставим сами — один раз спрашиваем пароль, и после обновления приложения
    /// (отпечаток ядра изменился). Отказались — подключаемся по-старому, с паролем.
    #[cfg(target_os = "macos")]
    async fn ensure_helper(&self) -> Result<bool, String> {
        let installed = self.app.path().resource_dir().map_err(|e| e.to_string())?.join("core/bproxy-core");
        let path = installed.clone();
        let fresh = tauri::async_runtime::spawn_blocking(move || {
            crate::helper::available() && crate::helper::version().is_some_and(|v| Some(v) == crate::helper::file_hash(&path))
        })
        .await
        .unwrap_or(false);
        if fresh {
            return Ok(true);
        }
        logs::info("vpn", "Ставим помощника B-Proxy (один раз попросим пароль)");
        let command = format!("{} --install-helper", shell_quote(&installed));
        let script = format!(
            "do shell script \"{}\" with prompt \"B-Proxy ставит помощника, чтобы больше не спрашивать пароль при подключении\" with administrator privileges",
            command.replace('\\', "\\\\").replace('"', "\\\"")
        );
        let ok = tauri::async_runtime::spawn_blocking(move || {
            std::process::Command::new("osascript").arg("-e").arg(script).status().map(|s| s.success()).unwrap_or(false)
        })
        .await
        .unwrap_or(false);
        if !ok {
            return Err("Подключение отменено".into());
        }
        // launchd поднимает помощника не мгновенно.
        for _ in 0..25 {
            if tauri::async_runtime::spawn_blocking(crate::helper::available).await.unwrap_or(false) {
                return Ok(true);
            }
            tokio_sleep(std::time::Duration::from_millis(200)).await;
        }
        logs::error("vpn", "Помощник не ответил — подключаемся без него");
        Ok(false)
    }

    #[cfg(target_os = "linux")]
    async fn start_inner(&self, args: StartArgs) -> Result<(), String> {
        self.start_process(args).await
    }

    #[cfg(target_os = "linux")]
    async fn stop_inner(&self) -> Result<(), String> {
        self.stop_process().await
    }

    // ---------- Процесс bproxy-core с правами администратора ----------

    async fn start_process(&self, args: StartArgs) -> Result<(), String> {
        use std::time::{Duration, Instant};

        let dir = self.data_dir()?;
        let config = dir.join("config.json");
        let state = dir.join("core.state");
        let stop = dir.join("core.stop");

        // Если от прошлого запуска осталось ядро — просим его завершиться.
        if read_state(&state).as_deref() == Some("running") {
            let _ = std::fs::write(&stop, b"");
            tokio_sleep(Duration::from_millis(1500)).await;
        }
        let _ = std::fs::remove_file(&state);
        let _ = std::fs::remove_file(&stop);
        std::fs::write(&config, args.config.as_bytes()).map_err(|e| e.to_string())?;

        let resources = self.app.path().resource_dir().map_err(|e| e.to_string())?;
        // Windows: ядро запускаем прямо из папки установки, система спросит разрешение (UAC).
        #[cfg(target_os = "windows")]
        launch_privileged(&resources.join("bproxy-core.exe"), &config, &state, &stop)?;
        #[cfg(not(target_os = "windows"))]
        let installed = resources.join("core/bproxy-core");
        #[cfg(not(target_os = "windows"))]
        if has_net_caps(&installed) {
            // Пакет deb/rpm дал ядру права на сеть — запускаем без пароля, прямо
            // из папки установки (при копировании права теряются).
            launch_direct(&installed, &config, &state, &stop)?;
        } else {
            // Копия ядра в папке данных: из AppImage (FUSE) root файлы не видит.
            let binary = dir.join("bproxy-core");
            copy_if_changed(&installed, &binary)?;
            launch_privileged(&binary, &config, &state, &stop)?;
        }

        // Ждём, пока ядро запустится: пользователь может долго вводить пароль.
        let started = Instant::now();
        loop {
            // Пользователь отменил подключение — ядро увидит этот же файл и не запустится.
            if stop.exists() {
                return Err("Подключение отменено".into());
            }
            match read_state(&state).as_deref() {
                Some("running") => return Ok(()),
                Some(s) if s.starts_with("error:") => {
                    return Err(s.trim_start_matches("error:").trim().to_string())
                }
                Some("stopped") | Some("cancelled") => {
                    return Err("Подключение отменено".into())
                }
                _ => {}
            }
            if started.elapsed() > Duration::from_secs(120) {
                let _ = std::fs::write(&stop, b"");
                return Err("Ядро не запустилось за 2 минуты".into());
            }
            tokio_sleep(Duration::from_millis(300)).await;
        }
    }

    async fn stop_process(&self) -> Result<(), String> {
        use std::time::{Duration, Instant};
        let dir = self.data_dir()?;
        let state = dir.join("core.state");
        // Флаг пишем всегда: если ядро ещё ждёт пароль, оно увидит его и не запустится.
        std::fs::write(dir.join("core.stop"), b"").map_err(|e| e.to_string())?;
        if read_state(&state).as_deref() == Some("running") {
            let started = Instant::now();
            while read_state(&state).as_deref() == Some("running") {
                if started.elapsed() > Duration::from_secs(10) {
                    return Err("Ядро не остановилось за 10 секунд".into());
                }
                tokio_sleep(Duration::from_millis(200)).await;
            }
        }
        // Ядро упало или приложение закрывалось аварийно — kill switch ещё держит
        // интернет закрытым. Пользователь отключает VPN — открываем.
        if dir.join("killswitch").exists() {
            let installed = self.app.path().resource_dir().map_err(|e| e.to_string())?.join("core/bproxy-core");
            let copy = dir.join("bproxy-core");
            tauri::async_runtime::spawn_blocking(move || release_kill_switch(&installed, &copy, &dir))
                .await
                .map_err(|e| e.to_string())??;
        }
        Ok(())
    }
}

async fn tokio_sleep(d: std::time::Duration) {
    let _ = tauri::async_runtime::spawn_blocking(move || std::thread::sleep(d)).await;
}

fn read_state(path: &PathBuf) -> Option<String> {
    std::fs::read_to_string(path)
        .ok()
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty())
}

#[cfg(not(target_os = "windows"))]
fn copy_if_changed(from: &PathBuf, to: &PathBuf) -> Result<(), String> {
    use std::os::unix::fs::PermissionsExt;
    let src = std::fs::metadata(from)
        .map_err(|e| format!("Нет файла ядра {}: {e}", from.display()))?;
    let same = std::fs::metadata(to)
        .map(|m| m.len() == src.len())
        .unwrap_or(false);
    if !same {
        let _ = std::fs::remove_file(to);
        std::fs::copy(from, to).map_err(|e| e.to_string())?;
    }
    std::fs::set_permissions(to, std::fs::Permissions::from_mode(0o755))
        .map_err(|e| e.to_string())
}

#[cfg(target_os = "macos")]
fn shell_quote(path: &PathBuf) -> String {
    format!("'{}'", path.display().to_string().replace('\'', r"'\''"))
}

/// Есть ли у файла ядра права CAP_NET_ADMIN (ставит установщик пакета через setcap).
#[cfg(target_os = "linux")]
fn has_net_caps(path: &PathBuf) -> bool {
    use std::os::unix::ffi::OsStrExt;
    const CAP_NET_ADMIN: u32 = 12;
    let Ok(cpath) = std::ffi::CString::new(path.as_os_str().as_bytes()) else {
        return false;
    };
    let name = c"security.capability";
    let mut buf = [0u8; 24];
    // vfs_cap_data: magic_etc, затем пары (permitted, inheritable) по 32 бита.
    let n = unsafe { libc::getxattr(cpath.as_ptr(), name.as_ptr(), buf.as_mut_ptr().cast(), buf.len()) };
    if n < 12 {
        return false;
    }
    let permitted = u32::from_le_bytes([buf[4], buf[5], buf[6], buf[7]]);
    permitted & (1 << CAP_NET_ADMIN) != 0
}

#[cfg(target_os = "macos")]
fn has_net_caps(_path: &PathBuf) -> bool {
    false
}

/// Запуск ядра от пользователя: права на сеть уже есть у самого файла.
#[cfg(target_os = "linux")]
fn launch_direct(binary: &PathBuf, config: &PathBuf, state: &PathBuf, stop: &PathBuf) -> Result<(), String> {
    let state_for_thread = state.clone();
    let mut child = std::process::Command::new(binary)
        .arg(config)
        .arg(state)
        .arg(stop)
        .stdin(std::process::Stdio::null())
        .stdout(std::process::Stdio::null())
        .stderr(std::process::Stdio::null())
        .spawn()
        .map_err(|e| format!("Не удалось запустить ядро: {e}"))?;
    std::thread::spawn(move || {
        if let Ok(status) = child.wait() {
            // Ядро упало, не успев записать состояние, — чтобы приложение не ждало 2 минуты.
            if !status.success() && read_state(&state_for_thread).is_none() {
                let _ = std::fs::write(&state_for_thread, format!("error: ядро завершилось ({status})"));
            }
        }
    });
    Ok(())
}

#[cfg(target_os = "macos")]
fn launch_direct(_: &PathBuf, _: &PathBuf, _: &PathBuf, _: &PathBuf) -> Result<(), String> {
    Err("Запуск без пароля на macOS пока не поддерживается".into())
}

/// Снять правила kill switch, оставшиеся после аварии (`bproxy-core --killswitch-off`).
#[cfg(target_os = "linux")]
fn release_kill_switch(installed: &PathBuf, copy: &PathBuf, dir: &PathBuf) -> Result<(), String> {
    let status = if has_net_caps(installed) {
        std::process::Command::new(installed).arg("--killswitch-off").arg(dir).status()
    } else {
        std::process::Command::new("pkexec").arg(copy).arg("--killswitch-off").arg(dir).status()
    };
    match status {
        Ok(s) if s.success() => Ok(()),
        _ => Err("Не удалось снять kill switch — интернет закрыт. Подключитесь снова или перезагрузите компьютер".into()),
    }
}

#[cfg(target_os = "macos")]
fn release_kill_switch(_installed: &PathBuf, copy: &PathBuf, dir: &PathBuf) -> Result<(), String> {
    let command = format!("{} --killswitch-off {}", shell_quote(copy), shell_quote(dir));
    let script = format!(
        "do shell script \"{}\" with prompt \"B-Proxy открывает интернет после сбоя VPN\" with administrator privileges",
        command.replace('\\', "\\\\").replace('"', "\\\"")
    );
    let ok = std::process::Command::new("osascript").arg("-e").arg(script).status().map(|s| s.success()).unwrap_or(false);
    if ok {
        Ok(())
    } else {
        Err("Не удалось снять kill switch — интернет закрыт. Подключитесь снова или перезагрузите компьютер".into())
    }
}

#[cfg(target_os = "linux")]
fn launch_privileged(binary: &PathBuf, config: &PathBuf, state: &PathBuf, stop: &PathBuf) -> Result<(), String> {
    // pkexec ждёт пароль и держит процесс ядра, поэтому запускаем без ожидания.
    let state_for_thread = state.clone();
    let mut child = std::process::Command::new("pkexec")
        .arg(binary)
        .arg(config)
        .arg(state)
        .arg(stop)
        .stdin(std::process::Stdio::null())
        .stdout(std::process::Stdio::null())
        .stderr(std::process::Stdio::null())
        .spawn()
        .map_err(|e| format!("Не найден pkexec (polkit): {e}"))?;
    std::thread::spawn(move || {
        if let Ok(status) = child.wait() {
            // 126 — пользователь закрыл окно пароля, 127 — нет прав.
            if matches!(status.code(), Some(126) | Some(127)) {
                let _ = std::fs::write(&state_for_thread, b"cancelled");
            }
        }
    });
    Ok(())
}

#[cfg(target_os = "macos")]
fn launch_privileged(binary: &PathBuf, config: &PathBuf, state: &PathBuf, stop: &PathBuf) -> Result<(), String> {
    let command = format!(
        "{} {} {} {} > /dev/null 2>&1 &",
        shell_quote(binary),
        shell_quote(config),
        shell_quote(state),
        shell_quote(stop)
    );
    let script = format!(
        "do shell script \"{}\" with prompt \"B-Proxy включает VPN\" with administrator privileges",
        command.replace('\\', "\\\\").replace('"', "\\\"")
    );
    let state = state.clone();
    std::thread::spawn(move || {
        let ok = std::process::Command::new("osascript")
            .arg("-e")
            .arg(script)
            .status()
            .map(|s| s.success())
            .unwrap_or(false);
        if !ok {
            let _ = std::fs::write(&state, b"cancelled");
        }
    });
    Ok(())
}

/// Windows без службы: ядро с правами администратора через окно UAC.
#[cfg(target_os = "windows")]
fn launch_privileged(binary: &PathBuf, config: &PathBuf, state: &PathBuf, stop: &PathBuf) -> Result<(), String> {
    use std::os::windows::ffi::OsStrExt;
    use windows_sys::Win32::UI::Shell::{ShellExecuteExW, SEE_MASK_NOASYNC, SHELLEXECUTEINFOW};
    use windows_sys::Win32::UI::WindowsAndMessaging::SW_HIDE;
    let wide = |s: &std::ffi::OsStr| s.encode_wide().chain(std::iter::once(0)).collect::<Vec<u16>>();
    let file = wide(binary.as_os_str());
    let verb = wide(std::ffi::OsStr::new("runas"));
    let params = wide(std::ffi::OsStr::new(&format!(
        "\"{}\" \"{}\" \"{}\"",
        config.display(),
        state.display(),
        stop.display()
    )));
    let state = state.clone();
    std::thread::spawn(move || {
        let mut info: SHELLEXECUTEINFOW = unsafe { std::mem::zeroed() };
        info.cbSize = std::mem::size_of::<SHELLEXECUTEINFOW>() as u32;
        info.fMask = SEE_MASK_NOASYNC;
        info.lpVerb = verb.as_ptr();
        info.lpFile = file.as_ptr();
        info.lpParameters = params.as_ptr();
        info.nShow = SW_HIDE;
        // 0 — окно UAC закрыли или не дали прав.
        if unsafe { ShellExecuteExW(&mut info) } == 0 {
            let _ = std::fs::write(&state, b"cancelled");
        }
    });
    Ok(())
}

/// Windows: правил файрвола нет (WFP живёт, пока работает ядро) — убираем только метку.
#[cfg(target_os = "windows")]
fn release_kill_switch(_installed: &PathBuf, _copy: &PathBuf, dir: &PathBuf) -> Result<(), String> {
    let _ = std::fs::remove_file(dir.join("killswitch"));
    Ok(())
}

// ---------- Счётчики трафика интерфейса туннеля ----------
// Принятое интерфейсом туннеля — это скачанное приложениями, отправленное — загруженное.

#[cfg(target_os = "linux")]
fn interface_stats() -> Option<Stats> {
    let read = |name: &str| -> Option<u64> {
        std::fs::read_to_string(format!("/sys/class/net/{TUN_NAME}/statistics/{name}"))
            .ok()?
            .trim()
            .parse()
            .ok()
    };
    Some(Stats { rx: read("rx_bytes")?, tx: read("tx_bytes")? })
}

#[cfg(target_os = "macos")]
fn interface_stats() -> Option<Stats> {
    // Name Mtu Network Address Ipkts Ierrs Ibytes Opkts Oerrs Obytes Coll —
    // у строки <Link#> нет адреса, поэтому считаем столбцы с конца.
    let out = std::process::Command::new("netstat")
        .args(["-ibn", "-I", TUN_NAME])
        .output()
        .ok()?;
    let text = String::from_utf8_lossy(&out.stdout);
    let line = text.lines().find(|l| l.contains("<Link#"))?;
    let fields: Vec<&str> = line.split_whitespace().collect();
    let n = fields.len();
    if n < 6 {
        return None;
    }
    Some(Stats {
        rx: fields[n - 5].parse().ok()?,
        tx: fields[n - 2].parse().ok()?,
    })
}

#[cfg(target_os = "windows")]
fn interface_stats() -> Option<Stats> {
    use windows_sys::Win32::NetworkManagement::IpHelper::{FreeMibTable, GetIfTable2, MIB_IF_TABLE2};
    unsafe {
        let mut table: *mut MIB_IF_TABLE2 = std::ptr::null_mut();
        if GetIfTable2(&mut table) != 0 || table.is_null() {
            return None;
        }
        let rows = std::slice::from_raw_parts((*table).Table.as_ptr(), (*table).NumEntries as usize);
        let mut result = None;
        for row in rows {
            let end = row.Alias.iter().position(|&c| c == 0).unwrap_or(row.Alias.len());
            if String::from_utf16_lossy(&row.Alias[..end]) == TUN_NAME {
                result = Some(Stats { rx: row.InOctets, tx: row.OutOctets });
                break;
            }
        }
        FreeMibTable(table as *const _);
        result
    }
}

/// Службы системы — в списке приложений только мешают.
fn is_system_path(path: &str) -> bool {
    let p = path.to_lowercase().replace('\\', "/");
    ["c:/windows/", "/usr/libexec/", "/usr/lib/systemd/", "/lib/systemd/", "/system/library/", "/usr/sbin/", "/sbin/"]
        .iter()
        .any(|prefix| p.starts_with(prefix))
}

#[cfg(all(test, target_os = "linux"))]
mod tests {
    use super::*;

    #[test]
    fn file_without_caps() {
        let file = std::env::temp_dir().join("bproxy-caps-test");
        std::fs::write(&file, b"x").unwrap();
        assert!(!has_net_caps(&file), "у обычного файла нет CAP_NET_ADMIN");
        assert!(!has_net_caps(&PathBuf::from("/нет/такого/файла")));
        let _ = std::fs::remove_file(file);
    }

    #[test]
    fn state_file() {
        let file = std::env::temp_dir().join("bproxy-state-test");
        std::fs::write(&file, "running\n").unwrap();
        assert_eq!(read_state(&file).as_deref(), Some("running"));
        let _ = std::fs::remove_file(file);
    }
}
