import Foundation
import NetworkExtension
import LibXray
import UserNotifications

/// Расширение Network Extension: здесь работает ядро Xray.
///
/// Система создаёт utun-интерфейс по нашим сетевым настройкам, мы находим его
/// дескриптор и передаём ядру через env["xray.tun.fd"]. Дальше пакеты разбирает
/// встроенный TUN Xray. Соединения самого расширения в туннель не попадают.
///
/// На iOS расширению доступно около 50 МБ памяти. Лимит памяти Go и частоту
/// сборки мусора задают настройки «Ядро Xray» (env BPROXY_MEMORY_LIMIT_MB
/// и BPROXY_AGGRESSIVE_GC в конфиге, core/memory/memory.go), по умолчанию 30 МБ.
class PacketTunnelProvider: NEPacketTunnelProvider {

    // Совпадают с конфигом из ui/src/backend/xray.ts.
    private let tunAddress = "172.19.0.1"
    private let tunMask = "255.255.255.252"
    private let tunDns = "172.19.0.2"
    private let tunAddress6 = "fdfe:dcba:9876::1"

    /// Сообщать ли об обрыве (настройка «Уведомления → VPN отключился»).
    private var notifyDisconnect = false

    override func startTunnel(options: [String: NSObject]?, completionHandler: @escaping (Error?) -> Void) {
        Shared.defaults?.removeObject(forKey: Shared.lastErrorKey)
        let providerConfig = (protocolConfiguration as? NETunnelProviderProtocol)?.providerConfiguration
        notifyDisconnect = (options?["notifyDisconnect"] as? NSNumber)?.boolValue
            ?? (providerConfig?["notifyDisconnect"] as? NSNumber)?.boolValue
            ?? false

        // Конфиг приходит в options при ручном запуске и лежит в профиле VPN
        // на случай, если система перезапускает туннель сама (Connect On Demand).
        let fromOptions = options?["config"] as? String
        let fromProfile = (protocolConfiguration as? NETunnelProviderProtocol)?
            .providerConfiguration?["config"] as? String
        guard let rawConfig = fromOptions ?? fromProfile,
              var config = try? JSONSerialization.jsonObject(with: Data(rawConfig.utf8)) as? [String: Any] else {
            completionHandler(fail("Нет конфигурации подключения"))
            return
        }

        let ipv6 = ((config["dns"] as? [String: Any])?["queryStrategy"] as? String) == "UseIP"

        let settings = NEPacketTunnelNetworkSettings(tunnelRemoteAddress: "254.1.1.1")
        settings.mtu = NSNumber(value: Self.tunMtu(config))
        let ipv4 = NEIPv4Settings(addresses: [tunAddress], subnetMasks: [tunMask])
        ipv4.includedRoutes = [NEIPv4Route.default()]
        settings.ipv4Settings = ipv4
        if ipv6 {
            let v6 = NEIPv6Settings(addresses: [tunAddress6], networkPrefixLengths: [126])
            v6.includedRoutes = [NEIPv6Route.default()]
            settings.ipv6Settings = v6
        }
        let dns = NEDNSSettings(servers: [tunDns])
        dns.matchDomains = [""] // весь DNS через туннель
        settings.dnsSettings = dns

        setTunnelNetworkSettings(settings) { [weak self] error in
            guard let self = self else { return }
            if let error = error {
                completionHandler(self.fail(error.localizedDescription))
                return
            }
            guard let fd = self.tunnelFileDescriptor else {
                completionHandler(self.fail("Не найден интерфейс туннеля"))
                return
            }

            var env = (config["env"] as? [String: String]) ?? [:]
            env["xray.tun.fd"] = String(fd)
            config["env"] = env

            guard let data = try? JSONSerialization.data(withJSONObject: config),
                  let xrayJson = String(data: data, encoding: .utf8) else {
                completionHandler(self.fail("Не удалось подготовить конфигурацию"))
                return
            }

            let request: [String: Any] = [
                "apiVersion": 3,
                "method": "runXray",
                "payload": ["xrayJson": xrayJson],
            ]
            let requestData = try! JSONSerialization.data(withJSONObject: request)
            let response = XrayInvoke.call(String(data: requestData, encoding: .utf8)!)
            if let message = Self.errorMessage(response) {
                completionHandler(self.fail(message))
                return
            }
            completionHandler(nil)
        }
    }

    override func stopTunnel(with reason: NEProviderStopReason, completionHandler: @escaping () -> Void) {
        _ = XrayInvoke.call(#"{"apiVersion":3,"method":"stopXray"}"#)
        if notifyDisconnect, let text = Self.disconnectReason(reason) {
            Self.alertDisconnected(text, then: completionHandler)
        } else {
            completionHandler()
        }
    }

    /// Причина обрыва для уведомления; nil — отключили сами (кнопкой, в Настройках) или это сон.
    private static func disconnectReason(_ reason: NEProviderStopReason) -> String? {
        switch reason {
        case .superceded: return "Включён другой VPN"
        case .providerFailed, .connectionFailed: return "Туннель перестал работать"
        case .noNetworkAvailable, .unrecoverableNetworkChange: return "Пропала сеть"
        case .idleTimeout: return "Соединение простаивало слишком долго"
        default: return nil
        }
    }

    /// Уведомление «VPN отключился» из расширения: приложение в этот момент может быть закрыто.
    /// Разрешение на уведомления запрашивает приложение при подключении.
    private static func alertDisconnected(_ reason: String, then done: @escaping () -> Void) {
        let content = UNMutableNotificationContent()
        content.title = "VPN отключился"
        content.body = "\(reason). Откройте B-Proxy, чтобы подключиться снова"
        content.sound = .default
        let request = UNNotificationRequest(identifier: "bproxy.disconnect", content: content, trigger: nil)
        UNUserNotificationCenter.current().add(request) { _ in done() }
    }

    override func handleAppMessage(_ messageData: Data, completionHandler: ((Data?) -> Void)?) {
        completionHandler?(nil)
    }

    /// Дескриптор utun, который система создала для этого туннеля.
    private var tunnelFileDescriptor: Int32? {
        var buf = [CChar](repeating: 0, count: Int(IFNAMSIZ))
        let utunPrefix = "utun".utf8CString.dropLast()
        return (0 ... 1024).first { (fd: Int32) -> Bool in
            var len = socklen_t(buf.count)
            // SYSPROTO_CONTROL = 2, UTUN_OPT_IFNAME = 2
            return getsockopt(fd, 2, 2, &buf, &len) == 0 && buf.starts(with: utunPrefix)
        }
    }

    /// MTU из настроек ядра: inbound с протоколом tun.
    private static func tunMtu(_ config: [String: Any]) -> Int {
        let inbounds = (config["inbounds"] as? [[String: Any]]) ?? []
        let tun = inbounds.first { ($0["protocol"] as? String) == "tun" }
        return ((tun?["settings"] as? [String: Any])?["mtu"] as? Int) ?? 1500
    }

    private func fail(_ message: String) -> NSError {
        Shared.defaults?.set(message, forKey: Shared.lastErrorKey)
        return NSError(domain: "B-Proxy", code: 1, userInfo: [NSLocalizedDescriptionKey: message])
    }

    private static func errorMessage(_ response: String) -> String? {
        guard let data = response.data(using: .utf8),
              let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any] else {
            return "Ядро вернуло непонятный ответ"
        }
        if json["success"] as? Bool == true { return nil }
        return (json["error"] as? String) ?? "Ядро не запустилось"
    }
}

enum Shared {
    static var appBundleId: String {
        let id = Bundle.main.bundleIdentifier ?? "com.baobabproxy.bproxy"
        return id.hasSuffix(".PacketTunnel") ? String(id.dropLast(".PacketTunnel".count)) : id
    }
    static var appGroup: String { "group." + appBundleId }
    static var defaults: UserDefaults? { UserDefaults(suiteName: appGroup) }
    static let lastErrorKey = "lastError"
}

enum XrayInvoke {
    static func call(_ request: String) -> String {
        guard let cRequest = strdup(request) else {
            return #"{"success":false,"data":null,"error":"out of memory"}"#
        }
        defer { free(cRequest) }
        guard let cResponse = CGoInvoke(cRequest) else {
            return #"{"success":false,"data":null,"error":"empty response"}"#
        }
        defer { CGoFree(cResponse) }
        return String(cString: cResponse)
    }
}
