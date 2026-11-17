//! TCP-пинг: время установки TCP-соединения с сервером (без DNS).
//! Быстрее и проще «реальной задержки» через ядро и не зависит от протокола,
//! но показывает только доступность адреса, а не работу прокси целиком.

use serde::{Deserialize, Serialize};
use std::net::{TcpStream, ToSocketAddrs};
use std::time::{Duration, Instant};

#[derive(Debug, Clone, Deserialize)]
pub struct Target {
    pub id: String,
    pub host: String,
    pub port: u16,
}

#[derive(Debug, Clone, Serialize)]
pub struct Result_ {
    pub id: String,
    /// Миллисекунды; None — не ответил за отведённое время.
    pub ms: Option<u64>,
}

fn one(target: &Target, timeout: Duration) -> Option<u64> {
    let addr = (target.host.as_str(), target.port).to_socket_addrs().ok()?.next()?;
    let started = Instant::now();
    TcpStream::connect_timeout(&addr, timeout).ok()?;
    Some((started.elapsed().as_millis() as u64).max(1))
}

/// Все цели параллельно, каждая в своём потоке; общее время — не больше таймаута (+ DNS).
pub fn run(targets: Vec<Target>, timeout_ms: u64) -> Vec<Result_> {
    let timeout = Duration::from_millis(timeout_ms.clamp(500, 15_000));
    let handles: Vec<_> = targets
        .into_iter()
        .map(|t| std::thread::spawn(move || Result_ { ms: one(&t, timeout), id: t.id }))
        .collect();
    handles.into_iter().filter_map(|h| h.join().ok()).collect()
}
