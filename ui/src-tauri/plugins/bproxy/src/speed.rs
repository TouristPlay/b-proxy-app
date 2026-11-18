//! Проверка скорости через выбранный сервер: запросы идут в служебный SOCKS-вход ядра
//! (127.0.0.1, порт выбирает интерфейс при подключении), а дальше — через сервер VPN.
//! Так замер честный на всех платформах, даже там, где само приложение вне туннеля (Android).
//!
//! Задержка — медиана 5 запросов к пустой странице, скачивание и отдача — сколько успели
//! за отведённое время. Ход замера приходит событием `bproxy://speed`.

use std::time::{Duration, Instant};

use serde::Serialize;
use tauri::{AppHandle, Emitter, Runtime};

const PING_URL: &str = "https://cp.cloudflare.com/generate_204";
const DOWN_URL: &str = "https://speed.cloudflare.com/__down?bytes=100000000";
const UP_URL: &str = "https://speed.cloudflare.com/__up";
/// Сколько длится каждый этап: дольше — точнее, но тратит трафик.
const PHASE: Duration = Duration::from_secs(8);

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SpeedProgress {
    /// latency | download | upload | done
    pub phase: &'static str,
    pub latency_ms: Option<u32>,
    pub download_mbps: Option<f64>,
    pub upload_mbps: Option<f64>,
    /// 0…1 внутри текущего этапа.
    pub progress: f64,
}

fn mbps(bytes: u64, elapsed: Duration) -> f64 {
    let secs = elapsed.as_secs_f64().max(0.001);
    (bytes as f64 * 8.0 / secs / 1_000_000.0 * 10.0).round() / 10.0
}

pub async fn run<R: Runtime>(app: AppHandle<R>, port: u16) -> Result<SpeedProgress, String> {
    let proxy = reqwest::Proxy::all(format!("socks5h://127.0.0.1:{port}")).map_err(|e| e.to_string())?;
    let client = reqwest::Client::builder()
        .proxy(proxy)
        .connect_timeout(Duration::from_secs(10))
        .user_agent("B-Proxy speed test")
        .build()
        .map_err(|e| e.to_string())?;

    let mut state = SpeedProgress { phase: "latency", latency_ms: None, download_mbps: None, upload_mbps: None, progress: 0.0 };
    let emit = |s: &SpeedProgress| {
        let _ = app.emit("bproxy://speed", s.clone());
    };
    emit(&state);

    // --- Задержка: первый запрос открывает соединение, его не считаем ---
    let mut samples = Vec::new();
    for i in 0..6 {
        let started = Instant::now();
        let res = client.get(PING_URL).timeout(Duration::from_secs(8)).send().await;
        match res {
            Ok(r) if r.status().is_success() || r.status().as_u16() == 204 => {
                if i > 0 {
                    samples.push(started.elapsed().as_millis() as u32);
                }
            }
            Ok(r) => return Err(format!("сервер проверки ответил {}", r.status())),
            Err(e) => return Err(describe(&e)),
        }
        state.progress = (i + 1) as f64 / 6.0;
        emit(&state);
    }
    samples.sort_unstable();
    state.latency_ms = samples.get(samples.len() / 2).copied();

    // --- Скачивание ---
    state.phase = "download";
    state.progress = 0.0;
    emit(&state);
    let started = Instant::now();
    let mut got: u64 = 0;
    let mut res = client.get(DOWN_URL).timeout(PHASE + Duration::from_secs(10)).send().await.map_err(|e| describe(&e))?;
    let mut last_emit = Instant::now();
    while started.elapsed() < PHASE {
        match res.chunk().await {
            Ok(Some(chunk)) => got += chunk.len() as u64,
            Ok(None) => break,
            Err(e) => {
                if got == 0 {
                    return Err(describe(&e));
                }
                break;
            }
        }
        if last_emit.elapsed() > Duration::from_millis(250) {
            last_emit = Instant::now();
            state.download_mbps = Some(mbps(got, started.elapsed()));
            state.progress = (started.elapsed().as_secs_f64() / PHASE.as_secs_f64()).min(1.0);
            emit(&state);
        }
    }
    drop(res);
    state.download_mbps = Some(mbps(got, started.elapsed()));

    // --- Отдача: кусками по 2 МБ, пока не выйдет время ---
    state.phase = "upload";
    state.progress = 0.0;
    emit(&state);
    let chunk = vec![0u8; 2 * 1024 * 1024];
    let started = Instant::now();
    let mut sent: u64 = 0;
    while started.elapsed() < PHASE {
        let left = PHASE.saturating_sub(started.elapsed()) + Duration::from_secs(5);
        match client.post(UP_URL).timeout(left).body(chunk.clone()).send().await {
            Ok(r) if r.status().is_success() => sent += chunk.len() as u64,
            Ok(_) | Err(_) => break,
        }
        state.upload_mbps = Some(mbps(sent, started.elapsed()));
        state.progress = (started.elapsed().as_secs_f64() / PHASE.as_secs_f64()).min(1.0);
        emit(&state);
    }
    state.upload_mbps = if sent > 0 { Some(mbps(sent, started.elapsed())) } else { None };

    state.phase = "done";
    state.progress = 1.0;
    emit(&state);
    Ok(state)
}

fn describe(e: &reqwest::Error) -> String {
    if e.is_timeout() {
        "сервер не ответил вовремя".into()
    } else if e.is_connect() {
        "нет соединения через VPN — переподключитесь".into()
    } else {
        e.to_string()
    }
}
