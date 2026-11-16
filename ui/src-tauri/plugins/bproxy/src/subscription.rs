//! Загрузка подписки с заголовком клиента: Remnawave отдаёт список серверов
//! только приложениям, а браузеру — страницу подписки.

use crate::models::FetchResult;
use std::collections::HashMap;
use std::time::Duration;

pub async fn fetch(url: &str, user_agent: &str) -> Result<FetchResult, String> {
    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(20))
        .user_agent(user_agent)
        .build()
        .map_err(|e| e.to_string())?;
    let response = client
        .get(url)
        .header("Accept", "*/*")
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
