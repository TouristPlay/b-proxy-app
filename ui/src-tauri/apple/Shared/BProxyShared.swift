import Foundation
import NetworkExtension
#if canImport(ActivityKit)
import ActivityKit
#endif
#if canImport(AppIntents)
import AppIntents
#endif
#if canImport(WidgetKit)
import WidgetKit
#endif

// Общий код приложения и расширения виджетов (LiveActivity): этот файл входит в оба
// таргета (scripts/tauri_ios_extension.py). Так требует Apple для намерений,
// которые нажимают в виджете, а выполняются в процессе приложения.

/// Данные «Живой активности». Та же структура (имя и поля) объявлена в плагине
/// (plugins/bproxy/ios/Sources/LiveActivity.swift) — система сопоставляет их по имени типа.
#if canImport(ActivityKit)
@available(iOS 16.1, *)
struct BProxyActivityAttributes: ActivityAttributes {
    public struct ContentState: Codable, Hashable {
        /// connecting | connected
        var status: String
        var server: String
        var label: String
        var since: Date
        /// Флаг страны сервера (эмодзи).
        var flag: String?
        /// Протокол: «VLESS · REALITY».
        var proto: String?
        /// Цвет темы приложения, #RRGGBB.
        var accent: String?
        /// Подписи на языке интерфейса.
        var stopLabel: String?
    }
}
#endif

/// Состояние для виджетов — в общих настройках группы приложений.
/// Пишут: плагин (сервер, флаг, тема, подписи) и расширение PacketTunnel (запуск и остановка).
enum BProxyWidgetStore {
    static let group = "group.com.baobabproxy.bproxy"
    static let tunnelBundleId = "com.baobabproxy.bproxy.PacketTunnel"
    static var defaults: UserDefaults? { UserDefaults(suiteName: group) }

    struct Snapshot {
        /// connected | connecting | disconnected
        var status: String
        var server: String
        var flag: String
        var since: Date?
        var accent: String?
        /// Профиль VPN уже создан — значит, виджет может включать VPN сам.
        var ready: Bool
        var labels: [String: String]

        func label(_ key: String, _ fallback: String) -> String { labels[key] ?? fallback }
    }

    static func read() -> Snapshot {
        let d = defaults
        let since = d?.double(forKey: "widget.since") ?? 0
        return Snapshot(
            status: d?.string(forKey: "widget.status") ?? "disconnected",
            server: d?.string(forKey: "widget.server") ?? "",
            flag: d?.string(forKey: "widget.flag") ?? "",
            since: since > 0 ? Date(timeIntervalSince1970: since) : nil,
            accent: d?.string(forKey: "widget.accent"),
            ready: d?.bool(forKey: "widget.ready") ?? false,
            labels: (d?.dictionary(forKey: "widget.labels") as? [String: String]) ?? [:]
        )
    }

    /// Смена состояния туннеля: время сеанса и перерисовка виджетов.
    static func setStatus(_ status: String, server: String? = nil) {
        guard let d = defaults else { return }
        let before = d.string(forKey: "widget.status")
        d.set(status, forKey: "widget.status")
        if status == "connected", before != "connected" {
            d.set(Date().timeIntervalSince1970, forKey: "widget.since")
        }
        if let server = server, !server.isEmpty { d.set(server, forKey: "widget.server") }
        d.set(true, forKey: "widget.ready")
        reload()
    }

    static func reload() {
        #if canImport(WidgetKit)
        if #available(iOS 14.0, *) { WidgetCenter.shared.reloadAllTimelines() }
        #endif
    }

    /// Профиль VPN B-Proxy, если пользователь уже подключался из приложения.
    @available(iOS 15.0, *)
    static func manager() async -> NETunnelProviderManager? {
        let all = (try? await NETunnelProviderManager.loadAllFromPreferences()) ?? []
        return all.first {
            ($0.protocolConfiguration as? NETunnelProviderProtocol)?.providerBundleIdentifier == tunnelBundleId
        }
    }
}

#if canImport(AppIntents)
/// Кнопка «Включить / выключить» в виджете и «Живой активности» (iOS 17+).
/// LiveActivityIntent выполняется в процессе приложения (в фоне, без открытия окна):
/// там есть доступ к профилю VPN. Конфиг берётся из профиля — его сохранило приложение.
@available(iOS 17.0, *)
struct BProxyToggleTunnelIntent: LiveActivityIntent {
    static let title: LocalizedStringResource = "Включить или выключить VPN"
    static let description = IntentDescription("Включает VPN с последним сервером или выключает его")
    static let isDiscoverable = true

    /// stop — только выключить (кнопка «Отключить» в «Живой активности»).
    @Parameter(title: "Только выключить", default: false)
    var stopOnly: Bool

    init() {}

    init(stopOnly: Bool) {
        self.stopOnly = stopOnly
    }

    func perform() async throws -> some IntentResult {
        guard let manager = await BProxyWidgetStore.manager() else { return .result() }
        switch manager.connection.status {
        case .connected, .connecting, .reasserting:
            manager.connection.stopVPNTunnel()
            BProxyWidgetStore.setStatus("disconnected")
            #if canImport(ActivityKit)
            for activity in Activity<BProxyActivityAttributes>.activities {
                await activity.end(nil, dismissalPolicy: .immediate)
            }
            #endif
        default:
            guard !stopOnly else { return .result() }
            if !manager.isEnabled {
                manager.isEnabled = true
                try await manager.saveToPreferences()
                try await manager.loadFromPreferences()
            }
            try manager.connection.startVPNTunnel()
            BProxyWidgetStore.setStatus("connecting")
        }
        return .result()
    }
}
#endif
