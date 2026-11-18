//! Android и iOS: команды уходят в нативный код плагина
//! (android/ — Kotlin, ios/ — Swift).

use crate::models::{PrepareResult, StartArgs, Stats};
use serde::{de::DeserializeOwned, Deserialize, Serialize};
use tauri::{
    plugin::{PluginApi, PluginHandle},
    AppHandle, Runtime,
};

#[cfg(target_os = "ios")]
tauri::ios_plugin_binding!(init_plugin_bproxy);

pub fn init<R: Runtime, C: DeserializeOwned>(
    _app: &AppHandle<R>,
    api: PluginApi<R, C>,
) -> Result<Vpn<R>, Box<dyn std::error::Error>> {
    #[cfg(target_os = "android")]
    let handle = api.register_android_plugin("com.baobabproxy.bproxy.plugin", "BProxyPlugin")?;
    #[cfg(target_os = "ios")]
    let handle = api.register_ios_plugin(init_plugin_bproxy)?;
    Ok(Vpn(handle))
}

pub struct Vpn<R: Runtime>(PluginHandle<R>);

#[derive(Serialize)]
struct InvokeArgs {
    request: String,
}

#[derive(Deserialize)]
struct InvokeResult {
    result: String,
}

#[derive(Deserialize)]
struct StatsResult {
    running: bool,
    #[serde(default)]
    rx: u64,
    #[serde(default)]
    tx: u64,
}

impl<R: Runtime> Vpn<R> {
    pub async fn invoke_core(&self, request: String) -> Result<String, String> {
        self.0
            .run_mobile_plugin_async::<InvokeResult>("invokeCore", InvokeArgs { request })
            .await
            .map(|r| r.result)
            .map_err(|e| e.to_string())
    }

    pub async fn live_activity(&self, args: serde_json::Value) -> Result<(), String> {
        #[cfg(target_os = "ios")]
        return self
            .0
            .run_mobile_plugin_async::<serde_json::Value>("liveActivity", args)
            .await
            .map(|_| ())
            .map_err(|e| e.to_string());
        #[cfg(not(target_os = "ios"))]
        {
            let _ = args;
            Ok(())
        }
    }

    /// Android — папка приложения, iOS — общий контейнер App Group (его читает расширение).
    pub async fn geo_dir(&self) -> Result<std::path::PathBuf, String> {
        #[derive(Deserialize)]
        struct Dir {
            path: String,
        }
        self.0
            .run_mobile_plugin_async::<Dir>("geoDir", ())
            .await
            .map(|d| std::path::PathBuf::from(d.path))
            .map_err(|e| e.to_string())
    }

    pub async fn device_info(&self) -> Result<crate::device::DeviceInfo, String> {
        static CACHE: std::sync::OnceLock<crate::device::DeviceInfo> = std::sync::OnceLock::new();
        if let Some(d) = CACHE.get() {
            return Ok(d.clone());
        }
        let raw = self
            .0
            .run_mobile_plugin_async::<crate::device::RawDevice>("deviceInfo", ())
            .await
            .map_err(|e| e.to_string())?;
        if raw.id.is_empty() {
            return Err("Не удалось определить идентификатор устройства".into());
        }
        Ok(CACHE.get_or_init(|| crate::device::DeviceInfo::from_raw(raw)).clone())
    }

    pub async fn prepare(&self) -> Result<PrepareResult, String> {
        self.0
            .run_mobile_plugin_async::<PrepareResult>("prepare", ())
            .await
            .map_err(|e| e.to_string())
    }

    pub async fn start(&self, args: StartArgs) -> Result<(), String> {
        self.0
            .run_mobile_plugin_async::<serde_json::Value>("start", args)
            .await
            .map(|_| ())
            .map_err(|e| e.to_string())
    }

    pub async fn stop(&self) -> Result<(), String> {
        self.0
            .run_mobile_plugin_async::<serde_json::Value>("stop", ())
            .await
            .map(|_| ())
            .map_err(|e| e.to_string())
    }

    pub async fn stats(&self) -> Result<Option<Stats>, String> {
        let r = self
            .0
            .run_mobile_plugin_async::<StatsResult>("stats", ())
            .await
            .map_err(|e| e.to_string())?;
        Ok(r.running.then_some(Stats { rx: r.rx, tx: r.tx }))
    }
}
