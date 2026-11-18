//! Компьютеры: Windows, Linux, macOS.
//!
//! libXray подгружается из папки ресурсов приложения через `libloading`
//! и вызывается через `CGoInvoke`/`CGoFree` — так работают разбор ссылок и пинг.
//!
//! Туннель:
//! - Windows — ядро в процессе приложения (приложение запущено от администратора, Wintun).
//! - Linux и macOS — отдельный процесс `bproxy-core` с правами администратора
//!   (pkexec / osascript). Он пишет состояние в файл `core.state`
//!   и завершается, когда появляется файл `core.stop`.

use crate::logs;
use crate::models::{PrepareResult, StartArgs, StateEvent, Stats};
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
}

pub fn init<R: Runtime, C: DeserializeOwned>(
    app: &AppHandle<R>,
    _api: PluginApi<R, C>,
) -> tauri::Result<Vpn<R>> {
    Ok(Vpn {
        app: app.clone(),
        core: Mutex::new(None),
        running: Mutex::new(false),
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

    pub async fn geo_dir(&self) -> Result<PathBuf, String> {
        Ok(self.data_dir()?.join("geo"))
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
        #[cfg(target_os = "windows")]
        if let Ok(core) = self.core() {
            let _ = core.call(r#"{"apiVersion":3,"method":"stopXray"}"#);
        }
        #[cfg(not(target_os = "windows"))]
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

    // ---------- Windows: ядро в процессе ----------

    #[cfg(target_os = "windows")]
    async fn start_inner(&self, args: StartArgs) -> Result<(), String> {
        let core = self.core()?;
        let request = serde_json::json!({
            "apiVersion": 3,
            "method": "runXray",
            "payload": { "xrayJson": args.config },
        })
        .to_string();
        let raw = tauri::async_runtime::spawn_blocking(move || core.call(&request))
            .await
            .map_err(|e| e.to_string())??;
        check_response(&raw)
    }

    #[cfg(target_os = "windows")]
    async fn stop_inner(&self) -> Result<(), String> {
        let core = self.core()?;
        let request = r#"{"apiVersion":3,"method":"stopXray"}"#.to_string();
        let raw = tauri::async_runtime::spawn_blocking(move || core.call(&request))
            .await
            .map_err(|e| e.to_string())??;
        check_response(&raw)
    }

    // ---------- Linux и macOS: процесс bproxy-core с правами администратора ----------

    #[cfg(not(target_os = "windows"))]
    async fn start_inner(&self, args: StartArgs) -> Result<(), String> {
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
        let installed = resources.join("core/bproxy-core");
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

    #[cfg(not(target_os = "windows"))]
    async fn stop_inner(&self) -> Result<(), String> {
        use std::time::{Duration, Instant};
        let dir = self.data_dir()?;
        let state = dir.join("core.state");
        // Флаг пишем всегда: если ядро ещё ждёт пароль, оно увидит его и не запустится.
        std::fs::write(dir.join("core.stop"), b"").map_err(|e| e.to_string())?;
        if read_state(&state).as_deref() != Some("running") {
            return Ok(());
        }
        let started = Instant::now();
        while started.elapsed() < Duration::from_secs(10) {
            if read_state(&state).as_deref() != Some("running") {
                return Ok(());
            }
            tokio_sleep(Duration::from_millis(200)).await;
        }
        Err("Ядро не остановилось за 10 секунд".into())
    }
}

#[cfg(target_os = "windows")]
fn check_response(raw: &str) -> Result<(), String> {
    let value: serde_json::Value = serde_json::from_str(raw).map_err(|e| e.to_string())?;
    if value["success"].as_bool() == Some(true) {
        Ok(())
    } else {
        Err(value["error"]
            .as_str()
            .unwrap_or("Ошибка ядра Xray")
            .to_string())
    }
}

#[cfg(not(target_os = "windows"))]
async fn tokio_sleep(d: std::time::Duration) {
    let _ = tauri::async_runtime::spawn_blocking(move || std::thread::sleep(d)).await;
}

#[cfg(not(target_os = "windows"))]
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
