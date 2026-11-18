//! Базы geoip.dat и geosite.dat для профилей маршрутизации (формат Happ/INCY).
//!
//! Приложение скачивает их по ссылкам из профиля в свою папку, а конфиг ядра указывает
//! на неё через env `xray.location.asset`. На iOS папка лежит в общем контейнере
//! App Group, чтобы её видело расширение PacketTunnel.

use serde::Serialize;
use std::path::{Path, PathBuf};
use std::time::{Duration, UNIX_EPOCH};

/// Какие файлы можно класть в папку баз — только эти два имени.
const NAMES: [&str; 2] = ["geoip.dat", "geosite.dat"];
/// Больше этого — явно не база правил (у RoscomVPN это единицы мегабайт).
const MAX_SIZE: usize = 64 * 1024 * 1024;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GeoFile {
    pub name: String,
    pub size: u64,
    /// Время изменения, мс с 1970 года.
    pub updated_at: u64,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GeoInfo {
    pub dir: String,
    pub files: Vec<GeoFile>,
}

pub fn info(dir: &Path) -> GeoInfo {
    let files = NAMES
        .iter()
        .filter_map(|name| {
            let meta = std::fs::metadata(dir.join(name)).ok()?;
            let updated_at = meta
                .modified()
                .ok()
                .and_then(|t| t.duration_since(UNIX_EPOCH).ok())
                .map(|d| d.as_millis() as u64)
                .unwrap_or(0);
            Some(GeoFile { name: name.to_string(), size: meta.len(), updated_at })
        })
        .collect();
    GeoInfo { dir: dir.to_string_lossy().into_owned(), files }
}

/// Скачивает базу во временный файл и только потом заменяет старую:
/// оборванная загрузка не портит рабочую базу.
pub async fn download(dir: PathBuf, name: &str, url: &str) -> Result<GeoFile, String> {
    if !NAMES.contains(&name) {
        return Err(format!("Неизвестный файл базы: {name}"));
    }
    if !url.starts_with("https://") {
        return Err("Ссылка на базу должна начинаться с https://".into());
    }
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(120))
        .build()
        .map_err(|e| e.to_string())?;
    let response = client
        .get(url)
        .send()
        .await
        .map_err(|e| format!("Не удалось скачать {name}: {e}"))?;
    if !response.status().is_success() {
        return Err(format!("Не удалось скачать {name}: сервер ответил {}", response.status().as_u16()));
    }
    let bytes = response.bytes().await.map_err(|e| format!("Не удалось скачать {name}: {e}"))?;
    if bytes.len() < 64 || bytes.len() > MAX_SIZE || bytes.starts_with(b"<") {
        return Err(format!("По ссылке не база {name}: проверьте ссылку в профиле"));
    }
    let tmp = dir.join(format!("{name}.part"));
    std::fs::write(&tmp, &bytes).map_err(|e| e.to_string())?;
    std::fs::rename(&tmp, dir.join(name)).map_err(|e| e.to_string())?;
    info(&dir)
        .files
        .into_iter()
        .find(|f| f.name == name)
        .ok_or_else(|| "База не сохранилась".into())
}
