import Foundation
import NetworkExtension
import LibXray

#if os(iOS)
import Flutter
#else
import FlutterMacOS
#endif

/// Мост между Flutter и системой на iOS и macOS.
///
/// Каналы те же, что на Android:
///  - b_proxy/xray        — вызовы libXray (разбор подписок, пинг, версия);
///  - b_proxy/vpn         — prepare / start / stop / stats / state;
///  - b_proxy/vpn/state   — поток состояний VPN.
///
/// Сам туннель работает в расширении PacketTunnel (отдельный процесс).
/// Приложение только сохраняет конфиг в настройки VPN и просит систему его запустить.
public class BProxyApplePlugin: NSObject, FlutterPlugin, FlutterStreamHandler {

    private var manager: NETunnelProviderManager?
    private var eventSink: FlutterEventSink?
    private var statusObserver: NSObjectProtocol?
    private var pendingStart: FlutterResult?
    private let xrayQueue = DispatchQueue(label: "b_proxy.xray", qos: .userInitiated)

    public static func register(with registrar: FlutterPluginRegistrar) {
        #if os(iOS)
        let messenger = registrar.messenger()
        #else
        let messenger = registrar.messenger
        #endif
        let instance = BProxyApplePlugin()

        let xray = FlutterMethodChannel(name: "b_proxy/xray", binaryMessenger: messenger)
        xray.setMethodCallHandler { call, result in instance.handleXray(call, result) }

        let vpn = FlutterMethodChannel(name: "b_proxy/vpn", binaryMessenger: messenger)
        vpn.setMethodCallHandler { call, result in instance.handleVpn(call, result) }

        let events = FlutterEventChannel(name: "b_proxy/vpn/state", binaryMessenger: messenger)
        events.setStreamHandler(instance)

        instance.observeStatus()
    }

    // MARK: - libXray

    private func handleXray(_ call: FlutterMethodCall, _ result: @escaping FlutterResult) {
        guard call.method == "invoke", let request = call.arguments as? String else {
            result(FlutterMethodNotImplemented)
            return
        }
        xrayQueue.async {
            let response = XrayInvoke.call(request)
            DispatchQueue.main.async { result(response) }
        }
    }

    // MARK: - VPN

    private func handleVpn(_ call: FlutterMethodCall, _ result: @escaping FlutterResult) {
        switch call.method {
        case "prepare":
            // Разрешение система спросит сама при первом сохранении профиля VPN.
            result(true)
        case "start":
            guard let args = call.arguments as? [String: Any],
                  let config = args["config"] as? String else {
                result(FlutterError(code: "args", message: "Нет конфига", details: nil))
                return
            }
            start(config: config, result: result)
        case "stop":
            loadManager { manager in
                manager?.connection.stopVPNTunnel()
                result(nil)
            }
        case "stats":
            result(nil)
        case "state":
            loadManager { manager in
                result(Self.stateName(manager?.connection.status ?? .disconnected))
            }
        default:
            result(FlutterMethodNotImplemented)
        }
    }

    private func start(config: String, result: @escaping FlutterResult) {
        loadManager { existing in
            let manager = existing ?? NETunnelProviderManager()
            let proto = (manager.protocolConfiguration as? NETunnelProviderProtocol) ?? NETunnelProviderProtocol()
            proto.providerBundleIdentifier = Shared.extensionBundleId
            proto.serverAddress = "B-Proxy"
            proto.providerConfiguration = ["config": config]
            proto.disconnectOnSleep = false
            manager.protocolConfiguration = proto
            manager.localizedDescription = "B-Proxy"
            manager.isEnabled = true

            Shared.defaults?.removeObject(forKey: Shared.lastErrorKey)

            manager.saveToPreferences { error in
                if let error = error {
                    result(FlutterError(code: "vpn", message: Self.describe(error), details: nil))
                    return
                }
                // После сохранения профиль нужно перечитать, иначе первый запуск падает.
                manager.loadFromPreferences { error in
                    if let error = error {
                        result(FlutterError(code: "vpn", message: Self.describe(error), details: nil))
                        return
                    }
                    self.manager = manager
                    do {
                        self.pendingStart?(FlutterError(code: "busy", message: "Подключение уже идёт", details: nil))
                        self.pendingStart = result
                        try manager.connection.startVPNTunnel(options: ["config": config as NSString])
                    } catch {
                        self.pendingStart = nil
                        result(FlutterError(code: "vpn", message: Self.describe(error), details: nil))
                    }
                }
            }
        }
    }

    private func loadManager(_ completion: @escaping (NETunnelProviderManager?) -> Void) {
        NETunnelProviderManager.loadAllFromPreferences { managers, _ in
            let mine = managers?.first {
                ($0.protocolConfiguration as? NETunnelProviderProtocol)?.providerBundleIdentifier == Shared.extensionBundleId
            }
            self.manager = mine
            DispatchQueue.main.async { completion(mine) }
        }
    }

    private func observeStatus() {
        statusObserver = NotificationCenter.default.addObserver(
            forName: .NEVPNStatusDidChange, object: nil, queue: .main
        ) { [weak self] note in
            guard let self = self, let connection = note.object as? NEVPNConnection else { return }
            guard let session = connection as? NETunnelProviderSession,
                  (session.manager.protocolConfiguration as? NETunnelProviderProtocol)?
                    .providerBundleIdentifier == Shared.extensionBundleId else { return }
            self.onStatus(connection.status)
        }
    }

    private func onStatus(_ status: NEVPNStatus) {
        let name = Self.stateName(status)
        eventSink?(name)
        guard let pending = pendingStart else { return }
        switch status {
        case .connected:
            pendingStart = nil
            pending(nil)
        case .disconnected, .invalid:
            pendingStart = nil
            let message = Shared.defaults?.string(forKey: Shared.lastErrorKey) ?? "Не удалось подключиться"
            pending(FlutterError(code: "vpn", message: message, details: nil))
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

    // MARK: - FlutterStreamHandler

    public func onListen(withArguments arguments: Any?, eventSink events: @escaping FlutterEventSink) -> FlutterError? {
        eventSink = events
        loadManager { manager in
            events(Self.stateName(manager?.connection.status ?? .disconnected))
        }
        return nil
    }

    public func onCancel(withArguments arguments: Any?) -> FlutterError? {
        eventSink = nil
        return nil
    }
}

/// Общие для приложения и расширения настройки.
enum Shared {
    /// Идентификатор приложения без суффикса расширения.
    static var appBundleId: String {
        let id = Bundle.main.bundleIdentifier ?? "com.baobabproxy.bProxy"
        return id.hasSuffix(".PacketTunnel") ? String(id.dropLast(".PacketTunnel".count)) : id
    }
    static var extensionBundleId: String { appBundleId + ".PacketTunnel" }
    static var appGroup: String { "group." + appBundleId }
    static var defaults: UserDefaults? { UserDefaults(suiteName: appGroup) }
    static let lastErrorKey = "lastError"
}

/// Вызов libXray через его C-интерфейс CGoInvoke.
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
