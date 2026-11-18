import Foundation
import NetworkExtension
import SwiftRs
import Tauri
import UIKit
import WebKit

class InvokeCoreArgs: Decodable {
    let request: String
}

class StartArgs: Decodable {
    let config: String
    let notifyDisconnect: Bool?
}

/// Мост между интерфейсом (Tauri) и iOS.
///
/// Сам туннель работает в расширении PacketTunnel (отдельный процесс).
/// Приложение сохраняет конфиг в профиль VPN и просит систему его запустить.
/// Разбор ссылок и пинг идут через libXray в процессе приложения.
class BProxyPlugin: Plugin {
    private var tunnelManager: NETunnelProviderManager?
    private var statusObserver: NSObjectProtocol?
    private var pendingStart: Invoke?
    private let xrayQueue = DispatchQueue(label: "bproxy.xray", qos: .userInitiated)

    override init() {
        super.init()
        statusObserver = NotificationCenter.default.addObserver(
            forName: .NEVPNStatusDidChange, object: nil, queue: .main
        ) { [weak self] note in
            guard let self = self,
                  let session = note.object as? NETunnelProviderSession,
                  (session.manager.protocolConfiguration as? NETunnelProviderProtocol)?
                    .providerBundleIdentifier == Shared.extensionBundleId else { return }
            self.onStatus(session.status)
        }
    }

    // MARK: - Команды

    @objc public func invokeCore(_ invoke: Invoke) throws {
        let args = try invoke.parseArgs(InvokeCoreArgs.self)
        xrayQueue.async {
            invoke.resolve(["result": XrayInvoke.call(args.request)])
        }
    }

    /// Разрешение система спросит сама при первом сохранении профиля VPN.
    @objc public func prepare(_ invoke: Invoke) {
        invoke.resolve(["granted": true])
    }

    @objc public func start(_ invoke: Invoke) throws {
        let args = try invoke.parseArgs(StartArgs.self)
        let config = args.config
        let notify = (args.notifyDisconnect ?? false) as NSNumber
        loadManager { existing in
            let manager = existing ?? NETunnelProviderManager()
            let proto = (manager.protocolConfiguration as? NETunnelProviderProtocol) ?? NETunnelProviderProtocol()
            proto.providerBundleIdentifier = Shared.extensionBundleId
            proto.serverAddress = "B-Proxy"
            proto.providerConfiguration = ["config": config, "notifyDisconnect": notify]
            proto.disconnectOnSleep = false
            manager.protocolConfiguration = proto
            manager.localizedDescription = "B-Proxy"
            manager.isEnabled = true

            Shared.defaults?.removeObject(forKey: Shared.lastErrorKey)

            manager.saveToPreferences { error in
                if let error = error {
                    invoke.reject(Self.describe(error))
                    return
                }
                // После сохранения профиль нужно перечитать, иначе первый запуск падает.
                manager.loadFromPreferences { error in
                    if let error = error {
                        invoke.reject(Self.describe(error))
                        return
                    }
                    self.tunnelManager = manager
                    do {
                        self.pendingStart?.reject("Подключение начато заново")
                        self.pendingStart = invoke
                        try manager.connection.startVPNTunnel(options: ["config": config as NSString, "notifyDisconnect": notify])
                    } catch {
                        self.pendingStart = nil
                        invoke.reject(Self.describe(error))
                    }
                }
            }
        }
    }

    @objc public func stop(_ invoke: Invoke) {
        loadManager { manager in
            manager?.connection.stopVPNTunnel()
            invoke.resolve()
        }
    }

    /// Счётчики интерфейса туннеля (utun с адресом 172.19.0.1) — видны и из приложения.
    @objc public func stats(_ invoke: Invoke) {
        loadManager { manager in
            let running = manager?.connection.status == .connected
            let counters = running ? TunnelCounters.read() : nil
            invoke.resolve([
                "running": running && counters != nil,
                "rx": counters?.rx ?? 0,
                "tx": counters?.tx ?? 0,
            ])
        }
    }

    // MARK: - Состояние

    private func loadManager(_ completion: @escaping (NETunnelProviderManager?) -> Void) {
        NETunnelProviderManager.loadAllFromPreferences { managers, _ in
            let mine = managers?.first {
                ($0.protocolConfiguration as? NETunnelProviderProtocol)?.providerBundleIdentifier == Shared.extensionBundleId
            }
            self.tunnelManager = mine
            DispatchQueue.main.async { completion(mine) }
        }
    }

    private func onStatus(_ status: NEVPNStatus) {
        var payload: JSObject = ["state": Self.stateName(status)]
        let lastError = Shared.defaults?.string(forKey: Shared.lastErrorKey)
        if status == .disconnected, let lastError = lastError {
            payload["error"] = lastError
        }
        trigger("state", data: payload)

        guard let pending = pendingStart else { return }
        switch status {
        case .connected:
            pendingStart = nil
            pending.resolve()
        case .disconnected, .invalid:
            pendingStart = nil
            pending.reject(lastError ?? "Не удалось подключиться")
        default:
            break
        }
    }

    private static func stateName(_ status: NEVPNStatus) -> String {
        switch status {
        case .connected: return "connected"
        case .connecting, .reasserting: return "connecting"
        case .disconnecting: return "disconnecting"
        default: return "disconnected"
        }
    }

    private static func describe(_ error: Error) -> String {
        let ns = error as NSError
        if ns.domain == NEVPNErrorDomain, ns.code == NEVPNError.configurationReadWriteFailed.rawValue {
            return "Разрешите B-Proxy добавить конфигурацию VPN"
        }
        return error.localizedDescription
    }
}

@_cdecl("init_plugin_bproxy")
func initPlugin() -> Plugin {
    return BProxyPlugin()
}

/// Общие для приложения и расширения настройки (группа приложений).
enum Shared {
    static var appBundleId: String {
        let id = Bundle.main.bundleIdentifier ?? "com.baobabproxy.bproxy"
        return id.hasSuffix(".PacketTunnel") ? String(id.dropLast(".PacketTunnel".count)) : id
    }
    static var extensionBundleId: String { appBundleId + ".PacketTunnel" }
    static var appGroup: String { "group." + appBundleId }
    static var defaults: UserDefaults? { UserDefaults(suiteName: appGroup) }
    static let lastErrorKey = "lastError"
}

/// Байты, прошедшие через интерфейс туннеля.
enum TunnelCounters {
    static let address = "172.19.0.1"

    static func read() -> (rx: UInt64, tx: UInt64)? {
        var list: UnsafeMutablePointer<ifaddrs>?
        guard getifaddrs(&list) == 0, let first = list else { return nil }
        defer { freeifaddrs(list) }

        var tunName: String?
        var cursor: UnsafeMutablePointer<ifaddrs>? = first
        while let item = cursor {
            if let addr = item.pointee.ifa_addr, addr.pointee.sa_family == UInt8(AF_INET) {
                var host = [CChar](repeating: 0, count: Int(NI_MAXHOST))
                getnameinfo(addr, socklen_t(addr.pointee.sa_len), &host, socklen_t(host.count), nil, 0, NI_NUMERICHOST)
                if String(cString: host) == address {
                    tunName = String(cString: item.pointee.ifa_name)
                    break
                }
            }
            cursor = item.pointee.ifa_next
        }
        guard let name = tunName else { return nil }

        cursor = first
        while let item = cursor {
            if String(cString: item.pointee.ifa_name) == name,
               let addr = item.pointee.ifa_addr, addr.pointee.sa_family == UInt8(AF_LINK),
               let data = item.pointee.ifa_data {
                let stats = data.assumingMemoryBound(to: if_data.self).pointee
                // Принятое интерфейсом туннеля — скачанное приложениями.
                return (UInt64(stats.ifi_ibytes), UInt64(stats.ifi_obytes))
            }
            cursor = item.pointee.ifa_next
        }
        return nil
    }
}

/// Вызов libXray через его C-интерфейс CGoInvoke.
///
/// Ядро слинковано в само приложение (gen/apple/project.yml), а не в плагин,
/// поэтому функции берём через dlsym. Флаги компоновщика -u _CGoInvoke -u _CGoFree
/// не дают им выпасть при оптимизации.
enum XrayInvoke {
    private typealias InvokeFn = @convention(c) (UnsafeMutablePointer<CChar>) -> UnsafeMutablePointer<CChar>?
    private typealias FreeFn = @convention(c) (UnsafeMutableRawPointer?) -> Void

    private static let handle = dlopen(nil, RTLD_NOW)
    private static let invoke: InvokeFn? = {
        guard let sym = dlsym(handle, "CGoInvoke") else { return nil }
        return unsafeBitCast(sym, to: InvokeFn.self)
    }()
    private static let release: FreeFn? = {
        guard let sym = dlsym(handle, "CGoFree") else { return nil }
        return unsafeBitCast(sym, to: FreeFn.self)
    }()

    static func call(_ request: String) -> String {
        guard let invoke = invoke else {
            return #"{"success":false,"data":null,"error":"Ядро Xray не подключено к приложению"}"#
        }
        guard let cRequest = strdup(request) else {
            return #"{"success":false,"data":null,"error":"out of memory"}"#
        }
        defer { free(cRequest) }
        guard let cResponse = invoke(cRequest) else {
            return #"{"success":false,"data":null,"error":"empty response"}"#
        }
        defer { release?(cResponse) }
        return String(cString: cResponse)
    }
}
