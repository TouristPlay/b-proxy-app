//! HWID и сведения об устройстве для лимита устройств в панели (Remnawave, Marzban и др.).
//!
//! При загрузке подписки клиент отправляет заголовки `x-hwid`, `x-device-os`, `x-ver-os`,
//! `x-device-model` (стандарт, предложенный Happ). Панель по ним считает устройства.
//!
//! HWID = SHA-256("bproxy_hwid_" + идентификатор устройства), первые 16 байт в виде UUID
//! (36 символов, только A–F, цифры и «-» — так требует панель: 10–64 символа, латиница, цифры, = и -).
//! Идентификатор не меняется при переустановке приложения:
//! Linux — /etc/machine-id, Windows — MachineGuid, macOS — IOPlatformUUID,
//! Android — ANDROID_ID, iOS — identifierForVendor.

use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};

/// То, что отдаёт платформа: идентификатор ещё не хэширован.
#[derive(Debug, Clone, Default, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RawDevice {
    pub id: String,
    pub os: String,
    pub os_version: String,
    pub model: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DeviceInfo {
    pub hwid: String,
    pub os: String,
    pub os_version: String,
    pub model: String,
}

impl DeviceInfo {
    pub fn from_raw(raw: RawDevice) -> Self {
        let digest = Sha256::digest(format!("bproxy_hwid_{}", raw.id.trim()).as_bytes());
        let hex: String = digest[..16].iter().map(|b| format!("{b:02X}")).collect();
        let hwid = format!("{}-{}-{}-{}-{}", &hex[0..8], &hex[8..12], &hex[12..16], &hex[16..20], &hex[20..32]);
        Self {
            hwid,
            os: clean(&raw.os),
            os_version: clean(&raw.os_version),
            model: clean(&raw.model),
        }
    }

    /// Заголовки для запроса подписки.
    pub fn headers(&self) -> Vec<(&'static str, String)> {
        let mut out = vec![("x-hwid", self.hwid.clone())];
        for (name, value) in [("x-device-os", &self.os), ("x-ver-os", &self.os_version), ("x-device-model", &self.model)] {
            if !value.is_empty() {
                out.push((name, value.clone()));
            }
        }
        out
    }
}

/// Заголовки HTTP — только видимый ASCII; кириллицу и прочее убираем.
fn clean(value: &str) -> String {
    value
        .chars()
        .filter(|c| c.is_ascii_graphic() || *c == ' ')
        .collect::<String>()
        .split_whitespace()
        .collect::<Vec<_>>()
        .join(" ")
        .chars()
        .take(64)
        .collect()
}

#[cfg(any(windows, target_os = "macos"))]
fn run(cmd: &str, args: &[&str]) -> String {
    let mut command = std::process::Command::new(cmd);
    command.args(args);
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        command.creation_flags(0x0800_0000); // CREATE_NO_WINDOW: без мигающей консоли
    }
    command
        .output()
        .ok()
        .map(|o| String::from_utf8_lossy(&o.stdout).into_owned())
        .unwrap_or_default()
}

/// Значение из `reg query`: последнее слово строки с именем параметра.
#[cfg(windows)]
fn reg(key: &str, name: &str) -> String {
    run("reg", &["query", key, "/v", name])
        .lines()
        .find(|l| l.trim_start().starts_with(name))
        .and_then(|l| l.split("REG_SZ").nth(1))
        .map(|v| v.trim().to_string())
        .unwrap_or_default()
}

#[cfg(desktop)]
pub fn desktop_raw() -> RawDevice {
    #[cfg(target_os = "linux")]
    {
        let read = |p: &str| std::fs::read_to_string(p).map(|s| s.trim().to_string()).unwrap_or_default();
        let mut id = read("/etc/machine-id");
        if id.is_empty() {
            id = read("/var/lib/dbus/machine-id");
        }
        let release = read("/etc/os-release");
        let field = |key: &str| {
            release
                .lines()
                .find_map(|l| l.strip_prefix(&format!("{key}=")))
                .map(|v| v.trim_matches('"').to_string())
                .unwrap_or_default()
        };
        let mut os_version = field("PRETTY_NAME");
        if os_version.is_empty() {
            os_version = field("VERSION_ID");
        }
        let vendor = read("/sys/class/dmi/id/sys_vendor");
        let product = read("/sys/class/dmi/id/product_name");
        let model = format!("{vendor} {product}").trim().to_string();
        RawDevice { id, os: "Linux".into(), os_version, model: if model.is_empty() { "PC".into() } else { model } }
    }
    #[cfg(windows)]
    {
        let id = reg(r"HKLM\SOFTWARE\Microsoft\Cryptography", "MachineGuid");
        let cv = r"HKLM\SOFTWARE\Microsoft\Windows NT\CurrentVersion";
        let build: u32 = reg(cv, "CurrentBuildNumber").parse().unwrap_or(0);
        // Windows 11 по-прежнему называет себя 10 в ProductName; отличаем по номеру сборки.
        let os_version = if build >= 22000 { format!("11 ({build})") } else { format!("10 ({build})") };
        let bios = r"HKLM\HARDWARE\DESCRIPTION\System\BIOS";
        let model = format!("{} {}", reg(bios, "SystemManufacturer"), reg(bios, "SystemProductName"));
        RawDevice { id, os: "Windows".into(), os_version, model: model.trim().to_string() }
    }
    #[cfg(target_os = "macos")]
    {
        let id = run("ioreg", &["-rd1", "-c", "IOPlatformExpertDevice"])
            .lines()
            .find(|l| l.contains("IOPlatformUUID"))
            .and_then(|l| l.split('"').nth(3))
            .unwrap_or_default()
            .to_string();
        RawDevice {
            id,
            os: "macOS".into(),
            os_version: run("sw_vers", &["-productVersion"]).trim().to_string(),
            model: run("sysctl", &["-n", "hw.model"]).trim().to_string(),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn hwid_is_stable_uuid() {
        let raw = RawDevice { id: "abc".into(), os: "Linux".into(), os_version: "Ubuntu 24.04".into(), model: "PC".into() };
        let a = DeviceInfo::from_raw(raw.clone());
        let b = DeviceInfo::from_raw(raw);
        assert_eq!(a.hwid, b.hwid);
        assert_eq!(a.hwid.len(), 36);
        assert!(a.hwid.chars().all(|c| c.is_ascii_hexdigit() || c == '-'));
    }

    #[test]
    fn headers_are_ascii() {
        let raw = RawDevice { id: "x".into(), os: "Android".into(), os_version: "16".into(), model: "Телефон Xiaomi 23113RKC6G".into() };
        let d = DeviceInfo::from_raw(raw);
        assert_eq!(d.model, "Xiaomi 23113RKC6G");
        assert_eq!(d.headers()[0].0, "x-hwid");
    }
}

