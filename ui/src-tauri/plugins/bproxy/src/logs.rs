//! Журналы на диске: `logs/bproxy.log` — приложение и плагин, `logs/xray.log` — ядро Xray.
//!
//! Лежат в папке данных приложения (Windows: %LOCALAPPDATA%\com.baobabproxy.bproxy\logs,
//! Linux: ~/.local/share/com.baobabproxy.bproxy/logs, macOS: ~/Library/Application Support/…).
//! Ссылки (https://…, vless://…) в журнал не попадают: в них ключи доступа.

use serde::Serialize;
use std::io::{Read, Seek, SeekFrom, Write};
use std::path::{Path, PathBuf};
use std::sync::{Mutex, OnceLock};
use std::time::{SystemTime, UNIX_EPOCH};

static DIR: OnceLock<PathBuf> = OnceLock::new();
static LOCK: Mutex<()> = Mutex::new(());

/// Больше — старый журнал уходит в `.1`, остаётся две части.
const MAX_BYTES: u64 = 2 * 1024 * 1024;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LogInfo {
    pub dir: String,
    pub app_log: String,
    pub core_log: String,
}

pub fn init(dir: PathBuf) {
    let _ = std::fs::create_dir_all(&dir);
    let _ = DIR.set(dir);
    info("plugin", &format!(
        "B-Proxy {} запущен: {} {}",
        env!("CARGO_PKG_VERSION"),
        std::env::consts::OS,
        std::env::consts::ARCH
    ));
}

pub fn dir() -> Option<&'static PathBuf> {
    DIR.get()
}

pub fn info_paths() -> Option<LogInfo> {
    let dir = dir()?;
    Some(LogInfo {
        dir: dir.display().to_string(),
        app_log: dir.join("bproxy.log").display().to_string(),
        core_log: dir.join("xray.log").display().to_string(),
    })
}

pub fn info(source: &str, message: &str) {
    write("INFO", source, message);
}

pub fn error(source: &str, message: &str) {
    write("ERROR", source, message);
}

pub fn write(level: &str, source: &str, message: &str) {
    let Some(dir) = dir() else { return };
    let _guard = LOCK.lock();
    let path = dir.join("bproxy.log");
    rotate(&path);
    if let Ok(mut f) = std::fs::OpenOptions::new().create(true).append(true).open(&path) {
        let _ = writeln!(f, "{} {:<5} [{}] {}", timestamp(), level, source, sanitize(message));
    }
}

/// Перед запуском ядра: слишком большой журнал Xray уходит в `.1`.
pub fn rotate_core_log() {
    if let Some(dir) = dir() {
        rotate(&dir.join("xray.log"));
    }
}

fn rotate(path: &Path) {
    if std::fs::metadata(path).map(|m| m.len() > MAX_BYTES).unwrap_or(false) {
        let mut old = path.as_os_str().to_owned();
        old.push(".1");
        let _ = std::fs::rename(path, PathBuf::from(old));
    }
}

/// Последние `max_bytes` журнала — для просмотра в приложении и отчёта в поддержку.
pub fn tail(which: &str, max_bytes: u64) -> Result<String, String> {
    let dir = dir().ok_or("Журналы ещё не готовы")?;
    let name = if which == "core" { "xray.log" } else { "bproxy.log" };
    Ok(sanitize(&tail_file(&dir.join(name), max_bytes)?))
}

/// Последние `max_bytes` файла, с целой строки; файла нет — пустая строка.
pub fn tail_file(path: &Path, max_bytes: u64) -> Result<String, String> {
    let mut f = match std::fs::File::open(path) {
        Ok(f) => f,
        Err(_) => return Ok(String::new()),
    };
    let len = f.metadata().map(|m| m.len()).unwrap_or(0);
    let start = len.saturating_sub(max_bytes);
    f.seek(SeekFrom::Start(start)).map_err(|e| e.to_string())?;
    let mut buf = Vec::new();
    f.read_to_end(&mut buf).map_err(|e| e.to_string())?;
    let text = String::from_utf8_lossy(&buf);
    // Начинаем с целой строки.
    let text = if start > 0 { text.split_once('\n').map(|x| x.1).unwrap_or(&text) } else { &text };
    Ok(text.to_string())
}

/// Ссылки с ключами (подписка, vless://, trojan:// …) заменяются на ‹ссылка›.
pub fn sanitize(text: &str) -> String {
    let mut out = String::with_capacity(text.len());
    for (i, part) in text.split(' ').enumerate() {
        if i > 0 {
            out.push(' ');
        }
        if let Some(pos) = part.find("://") {
            // Схема — буквы и цифры прямо перед «://»: «(https://…» → «https».
            let prefix_len = part[..pos]
                .rfind(|c: char| !(c.is_ascii_alphanumeric() || c == '+'))
                .map(|p| p + 1)
                .unwrap_or(0);
            if prefix_len < pos {
                out.push_str(&part[..prefix_len]);
                out.push_str("‹ссылка›");
                continue;
            }
        }
        out.push_str(part);
    }
    out
}

/// Время UTC без внешних библиотек: «2026-11-17 00:41:05Z».
fn timestamp() -> String {
    let secs = SystemTime::now().duration_since(UNIX_EPOCH).map(|d| d.as_secs()).unwrap_or(0);
    let (days, rem) = (secs / 86_400, secs % 86_400);
    // Алгоритм civil_from_days (Howard Hinnant).
    let z = days as i64 + 719_468;
    let era = z.div_euclid(146_097);
    let doe = z - era * 146_097;
    let yoe = (doe - doe / 1460 + doe / 36_524 - doe / 146_096) / 365;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
    let mp = (5 * doy + 2) / 153;
    let d = doy - (153 * mp + 2) / 5 + 1;
    let m = if mp < 10 { mp + 3 } else { mp - 9 };
    let y = yoe + era * 400 + if m <= 2 { 1 } else { 0 };
    format!(
        "{y:04}-{m:02}-{d:02} {:02}:{:02}:{:02}Z",
        rem / 3600,
        rem / 60 % 60,
        rem % 60
    )
}

/// Открыть папку журналов в файловом менеджере (только компьютеры).
#[cfg(desktop)]
pub fn open_dir() -> Result<(), String> {
    let dir = dir().ok_or("Журналы ещё не готовы")?;
    #[cfg(target_os = "windows")]
    let program = "explorer";
    #[cfg(target_os = "macos")]
    let program = "open";
    #[cfg(target_os = "linux")]
    let program = "xdg-open";
    std::process::Command::new(program)
        .arg(dir)
        .spawn()
        .map(|_| ())
        .map_err(|e| format!("Не удалось открыть папку: {e}"))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn hides_links() {
        assert_eq!(
            sanitize("ошибка (https://baobab-keys.com/abc) и vless://uuid@1.2.3.4:443?x=1 конец"),
            "ошибка (‹ссылка› и ‹ссылка› конец"
        );
        assert_eq!(sanitize("обычный текст 10:20"), "обычный текст 10:20");
    }

    #[test]
    fn tail_from_whole_line() {
        let path = std::env::temp_dir().join(format!("bproxy-tail-{}.log", std::process::id()));
        std::fs::write(&path, "первая\nвторая\nтретья\n").unwrap();
        assert_eq!(tail_file(&path, 20).unwrap(), "третья\n");
        assert_eq!(tail_file(&path, 1000).unwrap(), "первая\nвторая\nтретья\n");
        let _ = std::fs::remove_file(&path);
        assert_eq!(tail_file(&path, 10).unwrap(), "");
    }

    #[test]
    fn time_format() {
        let t = timestamp();
        assert_eq!(t.len(), 20);
        assert!(t.ends_with('Z'));
    }
}
