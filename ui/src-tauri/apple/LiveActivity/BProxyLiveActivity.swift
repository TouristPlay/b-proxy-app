import ActivityKit
import SwiftUI
import WidgetKit

/// Те же поля, что в плагине (ui/src-tauri/plugins/bproxy/ios/Sources/LiveActivity.swift):
/// система сопоставляет «Живую активность» с виджетом по имени типа.
struct BProxyActivityAttributes: ActivityAttributes {
    public struct ContentState: Codable, Hashable {
        var status: String
        var server: String
        var label: String
        var since: Date
    }
}

/// Цвет акцента B-Proxy (янтарь) — на экране блокировки тема приложения недоступна.
private let amber = Color(red: 0.96, green: 0.69, blue: 0.25)

@main
struct BProxyWidgets: WidgetBundle {
    var body: some Widget {
        BProxyLiveActivity()
    }
}

struct BProxyLiveActivity: Widget {
    var body: some WidgetConfiguration {
        ActivityConfiguration(for: BProxyActivityAttributes.self) { context in
            LockScreenView(state: context.state)
                .activityBackgroundTint(Color.black.opacity(0.55))
                .activitySystemActionForegroundColor(amber)
        } dynamicIsland: { context in
            DynamicIsland {
                DynamicIslandExpandedRegion(.leading) {
                    Label(context.state.label, systemImage: "checkmark.shield.fill")
                        .font(.caption.weight(.semibold))
                        .foregroundStyle(amber)
                }
                DynamicIslandExpandedRegion(.trailing) {
                    SessionTimer(since: context.state.since)
                        .font(.caption.monospacedDigit())
                }
                DynamicIslandExpandedRegion(.bottom) {
                    Text(context.state.server)
                        .font(.subheadline.weight(.medium))
                        .lineLimit(1)
                }
            } compactLeading: {
                Image(systemName: "checkmark.shield.fill").foregroundStyle(amber)
            } compactTrailing: {
                SessionTimer(since: context.state.since)
                    .font(.caption2.monospacedDigit())
                    .frame(maxWidth: 52)
            } minimal: {
                Image(systemName: "checkmark.shield.fill").foregroundStyle(amber)
            }
        }
    }
}

private struct LockScreenView: View {
    let state: BProxyActivityAttributes.ContentState

    var body: some View {
        HStack(spacing: 14) {
            ZStack {
                Circle().fill(amber.opacity(0.18))
                Image(systemName: state.status == "connected" ? "checkmark.shield.fill" : "shield")
                    .font(.system(size: 22, weight: .semibold))
                    .foregroundStyle(amber)
            }
            .frame(width: 46, height: 46)
            VStack(alignment: .leading, spacing: 2) {
                Text(state.label)
                    .font(.headline)
                    .foregroundStyle(.white)
                Text(state.server)
                    .font(.subheadline)
                    .foregroundStyle(.white.opacity(0.7))
                    .lineLimit(1)
            }
            Spacer(minLength: 8)
            if state.status == "connected" {
                SessionTimer(since: state.since)
                    .font(.title3.monospacedDigit().weight(.semibold))
                    .foregroundStyle(.white)
            }
        }
        .padding(16)
    }
}

/// Время сеанса: тикает само, без обновлений из приложения.
private struct SessionTimer: View {
    let since: Date
    var body: some View {
        Text(timerInterval: since...Date.distantFuture, countsDown: false)
            .multilineTextAlignment(.trailing)
    }
}
