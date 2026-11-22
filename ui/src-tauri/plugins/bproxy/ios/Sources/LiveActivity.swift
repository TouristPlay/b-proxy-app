import Foundation
#if canImport(ActivityKit)
import ActivityKit
#endif

#if canImport(ActivityKit)
/// Данные «Живой активности». Такая же структура (то же имя и поля) объявлена в расширении
/// ui/src-tauri/apple/LiveActivity — система сопоставляет их по имени типа.
@available(iOS 16.1, *)
public struct BProxyActivityAttributes: ActivityAttributes {
    public struct ContentState: Codable, Hashable {
        /// connecting | connected
        public var status: String
        public var server: String
        public var label: String
        public var since: Date
        public var flag: String?
        public var proto: String?
        public var accent: String?
        public var stopLabel: String?
    }
}

@available(iOS 16.1, *)
enum LiveActivityController {
    static func handle(_ args: LiveActivityArgs) {
        let state = BProxyActivityAttributes.ContentState(
            status: args.status ?? "connected",
            server: args.server ?? "",
            label: args.label ?? "B-Proxy",
            since: Date(timeIntervalSince1970: (args.since ?? Date().timeIntervalSince1970 * 1000) / 1000),
            flag: args.flag,
            proto: args.proto,
            accent: args.accent,
            stopLabel: args.stopLabel
        )
        let current = Activity<BProxyActivityAttributes>.activities
        switch args.action {
        case "end":
            Task {
                for activity in current {
                    await activity.end(dismissalPolicy: .immediate)
                }
            }
        default:
            guard ActivityAuthorizationInfo().areActivitiesEnabled else { return }
            if let activity = current.first {
                Task { await activity.update(using: state) }
                // Лишние (например, после сбоя) закрываем.
                for extra in current.dropFirst() {
                    Task { await extra.end(dismissalPolicy: .immediate) }
                }
            } else {
                _ = try? Activity.request(attributes: BProxyActivityAttributes(), contentState: state, pushType: nil)
            }
        }
    }
}
#endif
