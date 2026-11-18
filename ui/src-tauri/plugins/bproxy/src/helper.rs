//! Клиент помощника B-Proxy (служба Windows `BProxyHelper`, LaunchDaemon macOS):
//! помощник работает с правами системы, приложение просит его включить и выключить VPN.
//! Протокол — одна строка JSON туда и одна обратно (core/runner/helper.go).

use serde_json::Value;
use std::io::{BufRead, BufReader, Write};
use std::time::Duration;

#[cfg(target_os = "macos")]
const SOCKET: &str = "/var/run/bproxy-helper.sock";
#[cfg(target_os = "windows")]
const PIPE: &str = r"\\.\pipe\bproxy-helper";

pub fn call(request: &Value, timeout: Duration) -> Result<Value, String> {
    let mut line = request.to_string();
    line.push('\n');

    #[cfg(target_os = "macos")]
    let reply = {
        let mut stream = std::os::unix::net::UnixStream::connect(SOCKET).map_err(|e| e.to_string())?;
        stream.set_read_timeout(Some(timeout)).map_err(|e| e.to_string())?;
        stream.write_all(line.as_bytes()).map_err(|e| e.to_string())?;
        let mut reply = String::new();
        BufReader::new(stream).read_line(&mut reply).map_err(|e| e.to_string())?;
        reply
    };

    #[cfg(target_os = "windows")]
    let reply = {
        let _ = timeout; // канал отвечает, когда ядро запустилось
        let mut pipe = None;
        // Все экземпляры канала заняты (ERROR_PIPE_BUSY = 231) — ждём немного.
        for _ in 0..20 {
            match std::fs::OpenOptions::new().read(true).write(true).open(PIPE) {
                Ok(f) => {
                    pipe = Some(f);
                    break;
                }
                Err(e) if e.raw_os_error() == Some(231) => std::thread::sleep(Duration::from_millis(100)),
                Err(e) => return Err(e.to_string()),
            }
        }
        let mut pipe = pipe.ok_or("Помощник B-Proxy занят")?;
        pipe.write_all(line.as_bytes()).map_err(|e| e.to_string())?;
        let mut reply = String::new();
        BufReader::new(pipe).read_line(&mut reply).map_err(|e| e.to_string())?;
        reply
    };

    let value: Value = serde_json::from_str(reply.trim()).map_err(|e| format!("Помощник ответил непонятно: {e}"))?;
    if value["ok"].as_bool() == Some(true) {
        Ok(value)
    } else {
        Err(value["error"].as_str().unwrap_or("Ошибка помощника B-Proxy").to_string())
    }
}

/// Помощник установлен и отвечает.
pub fn available() -> bool {
    call(&serde_json::json!({ "cmd": "state" }), Duration::from_secs(3)).is_ok()
}

/// Отпечаток файла помощника (sha256) — сравниваем с ядром из приложения.
#[cfg(target_os = "macos")]
pub fn version() -> Option<String> {
    call(&serde_json::json!({ "cmd": "version" }), Duration::from_secs(3))
        .ok()
        .and_then(|v| v["version"].as_str().map(str::to_string))
}

#[cfg(target_os = "macos")]
pub fn file_hash(path: &std::path::Path) -> Option<String> {
    use sha2::{Digest, Sha256};
    let bytes = std::fs::read(path).ok()?;
    Some(Sha256::digest(&bytes).iter().map(|b| format!("{b:02x}")).collect())
}
