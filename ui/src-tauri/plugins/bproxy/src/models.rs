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
    /// Телефоны: служба VPN сама сообщит, если туннель оборвался не по команде пользователя.
    #[serde(default)]
    pub notify_disconnect: bool,
    /// iOS: includeAllNetworks — трафик мимо туннеля закрыт, даже если он упал.
    /// На компьютерах kill switch приходит в самом конфиге (env и WFP).
    #[serde(default)]
    pub kill_switch: bool,
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

/// Приложение для «VPN по приложениям»: Android — пакет, компьютер — имя процесса.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AppEntry {
    pub id: String,
    pub name: String,
    /// data:-адрес значка (только Android).
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub icon: Option<String>,
    /// Полный путь к программе (компьютер) — подсказка, какая это программа.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub path: Option<String>,
}
