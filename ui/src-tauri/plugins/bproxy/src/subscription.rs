//! Загрузка подписки с заголовком клиента: Remnawave отдаёт список серверов
//! только приложениям, а браузеру — страницу подписки.

use crate::device::DeviceInfo;
use crate::models::FetchResult;
use std::collections::HashMap;
use std::time::Duration;

/// `device` — заголовки HWID (если пользователь не выключил их отправку).
pub async fn fetch(url: &str, user_agent: &str, device: Option<&DeviceInfo>) -> Result<FetchResult, String> {
    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(20))
        .user_agent(user_agent)
        .build()
        .map_err(|e| e.to_string())?;
    let mut request = client.get(url).header("Accept", "*/*");
    for (name, value) in device.map(|d| d.headers()).unwrap_or_default() {
        request = request.header(name, value);
    }
    let response = request
        .send()
        .await
        .map_err(|e| format!("Сервер подписки недоступен: {e}"))?;
    let status = response.status().as_u16();
    let mut headers = HashMap::new();
    for (name, value) in response.headers() {
        if let Ok(v) = value.to_str() {
            headers.insert(name.as_str().to_ascii_lowercase(), v.to_string());
        }
    }
    let bytes = response.bytes().await.map_err(|e| e.to_string())?;
    let body = String::from_utf8_lossy(&bytes).into_owned();
    Ok(FetchResult { status, headers, body })
}
