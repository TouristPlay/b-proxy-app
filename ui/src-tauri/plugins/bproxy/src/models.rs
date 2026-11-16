use serde::{Deserialize, Serialize};
use std::collections::HashMap;

/// Ответ сервера подписки: код, заголовки (ключи в нижнем регистре) и тело.
#[derive(Debug, Clone, Serialize)]
pub struct FetchResult {
    pub status: u16,
    pub headers: HashMap<String, String>,
    pub body: String,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct StartArgs {
    /// Полный конфиг Xray в JSON.
    pub config: String,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct Stats {
    pub rx: u64,
    pub tx: u64,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct PrepareResult {
    pub granted: bool,
}

/// Событие «bproxy://state» для интерфейса.
#[derive(Debug, Clone, Serialize)]
pub struct StateEvent {
    pub state: String,
    pub error: Option<String>,
}
