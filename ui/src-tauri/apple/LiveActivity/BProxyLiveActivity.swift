import ActivityKit
import AppIntents
import SwiftUI
import WidgetKit

// Расширение виджетов B-Proxy:
// - «Живая активность» на экране блокировки и в Dynamic Island;
// - виджет «B-Proxy» на рабочем столе и экране блокировки;
// - кнопка в Пункте управления (iOS 18).
// BProxyActivityAttributes, BProxyWidgetStore и BProxyToggleTunnelIntent — в apple/Shared.

/// Янтарь — цвет по умолчанию, если приложение ещё не прислало цвет темы.
private let amber = Color(red: 0.96, green: 0.69, blue: 0.25)

private func themeColor(_ hex: String?) -> Color {
    guard var s = hex?.trimmingCharacters(in: .whitespaces), s.hasPrefix("#") else { return amber }
    s.removeFirst()
    guard s.count == 6, let v = UInt32(s, radix: 16) else { return amber }
    return Color(
        red: Double((v >> 16) & 0xFF) / 255,
        green: Double((v >> 8) & 0xFF) / 255,
        blue: Double(v & 0xFF) / 255
    )
}

@main
struct BProxyWidgets: WidgetBundle {
    var body: some Widget {
        BProxyLiveActivity()
        BProxyStatusWidget()
        if #available(iOS 18.0, *) {
            BProxyToggleControl()
        }
    }
}

// MARK: - Пункт управления

/// Кнопка «B-Proxy» в Пункте управления (iOS 18+): включает и выключает VPN, не открывая приложение.
@available(iOS 18.0, *)
struct BProxyToggleControl: ControlWidget {
    var body: some ControlWidgetConfiguration {
        StaticControlConfiguration(kind: "com.baobabproxy.bproxy.toggle") {
            ControlWidgetButton(action: BProxyToggleTunnelIntent()) {
                Label("B-Proxy", systemImage: "shield.lefthalf.filled")
            }
        }
        .displayName("B-Proxy")
        .description("Включить или выключить VPN")
    }
}

// MARK: - «Живая активность»

struct BProxyLiveActivity: Widget {
    var body: some WidgetConfiguration {
        ActivityConfiguration(for: BProxyActivityAttributes.self) { context in
            LockScreenView(state: context.state)
                .activityBackgroundTint(Color.black.opacity(0.6))
                .activitySystemActionForegroundColor(themeColor(context.state.accent))
        } dynamicIsland: { context in
            let state = context.state
            let accent = themeColor(state.accent)
            return DynamicIsland {
                DynamicIslandExpandedRegion(.leading) {
                    Label {
                        Text(state.label).lineLimit(1)
                    } icon: {
                        ShieldIcon(status: state.status, accent: accent)
                    }
                    .font(.subheadline.weight(.semibold))
                    .foregroundStyle(accent)
                    .padding(.leading, 4)
                }
                DynamicIslandExpandedRegion(.trailing) {
                    StatusTime(state: state)
                        .font(.title3.monospacedDigit().weight(.semibold))
                        .foregroundStyle(.white)
                        .padding(.trailing, 4)
                }
                DynamicIslandExpandedRegion(.bottom) {
                    HStack(alignment: .center, spacing: 10) {
                        ServerLine(state: state)
                        Spacer(minLength: 6)
                        StopButton(state: state, accent: accent)
                    }
                    .padding(.horizontal, 4)
                    .padding(.top, 4)
                }
            } compactLeading: {
                ShieldIcon(status: state.status, accent: accent)
            } compactTrailing: {
                StatusTime(state: state)
                    .font(.caption2.monospacedDigit().weight(.semibold))
                    .foregroundStyle(accent)
                    .frame(maxWidth: 52)
            } minimal: {
                ShieldIcon(status: state.status, accent: accent)
            }
            .keylineTint(accent)
        }
    }
}

private struct LockScreenView: View {
    let state: BProxyActivityAttributes.ContentState

    var body: some View {
        let accent = themeColor(state.accent)
        VStack(spacing: 12) {
            HStack(spacing: 14) {
                ZStack {
                    Circle().fill(accent.opacity(0.18))
                    ShieldIcon(status: state.status, accent: accent)
                        .font(.system(size: 22, weight: .semibold))
                }
                .frame(width: 46, height: 46)
                VStack(alignment: .leading, spacing: 3) {
                    Text(state.label)
                        .font(.headline)
                        .foregroundStyle(.white)
                    ServerLine(state: state)
                }
                Spacer(minLength: 8)
                StatusTime(state: state)
                    .font(.title2.monospacedDigit().weight(.semibold))
                    .foregroundStyle(.white)
            }
            if state.status == "connected" {
                HStack {
                    Spacer()
                    StopButton(state: state, accent: accent)
                }
            }
        }
        .padding(16)
    }
}

/// Щит: при подключении — с галочкой, во время подключения — пульсирует.
private struct ShieldIcon: View {
    let status: String
    let accent: Color

    var body: some View {
        if status == "connected" {
            Image(systemName: "checkmark.shield.fill")
                .foregroundStyle(accent)
        } else if #available(iOS 17.0, *) {
            Image(systemName: "shield.lefthalf.filled")
                .foregroundStyle(accent)
                .symbolEffect(.pulse, options: .repeating)
        } else {
            Image(systemName: "shield.lefthalf.filled")
                .foregroundStyle(accent)
        }
    }
}

/// Флаг, сервер и протокол.
private struct ServerLine: View {
    let state: BProxyActivityAttributes.ContentState

    var body: some View {
        VStack(alignment: .leading, spacing: 1) {
            Text([state.flag ?? "", state.server].filter { !$0.isEmpty }.joined(separator: " "))
                .font(.subheadline.weight(.medium))
                .foregroundStyle(.white)
                .lineLimit(1)
            if let proto = state.proto, !proto.isEmpty {
                Text(proto)
                    .font(.caption2.weight(.medium))
                    .foregroundStyle(.white.opacity(0.6))
                    .lineLimit(1)
            }
        }
    }
}

/// Время сеанса тикает само; пока подключаемся — индикатор.
private struct StatusTime: View {
    let state: BProxyActivityAttributes.ContentState

    var body: some View {
        if state.status == "connected" {
            Text(timerInterval: state.since...Date.distantFuture, countsDown: false)
                .multilineTextAlignment(.trailing)
        } else {
            ProgressView().tint(.white)
        }
    }
}

/// «Отключить» прямо из «Живой активности» (iOS 17+).
private struct StopButton: View {
    let state: BProxyActivityAttributes.ContentState
    let accent: Color

    var body: some View {
        if #available(iOS 17.0, *) {
            Button(intent: BProxyToggleTunnelIntent(stopOnly: true)) {
                Label(state.stopLabel ?? "Отключить", systemImage: "power")
                    .font(.caption.weight(.semibold))
                    .padding(.horizontal, 12)
                    .padding(.vertical, 7)
            }
            .buttonStyle(.plain)
            .foregroundStyle(.black)
            .background(accent, in: Capsule())
        }
    }
}

// MARK: - Виджет на рабочем столе и экране блокировки

struct StatusEntry: TimelineEntry {
    let date: Date
    let snapshot: BProxyWidgetStore.Snapshot
}

struct StatusProvider: TimelineProvider {
    func placeholder(in context: Context) -> StatusEntry {
        StatusEntry(
            date: Date(),
            snapshot: .init(status: "connected", server: "Нидерланды", flag: "🇳🇱", since: Date().addingTimeInterval(-754),
                            accent: nil, ready: true, labels: [:])
        )
    }

    func getSnapshot(in context: Context, completion: @escaping (StatusEntry) -> Void) {
        completion(context.isPreview ? placeholder(in: context) : StatusEntry(date: Date(), snapshot: BProxyWidgetStore.read()))
    }

    func getTimeline(in context: Context, completion: @escaping (Timeline<StatusEntry>) -> Void) {
        // Перерисовку просят приложение и расширение VPN при смене состояния.
        completion(Timeline(entries: [StatusEntry(date: Date(), snapshot: BProxyWidgetStore.read())], policy: .never))
    }
}

struct BProxyStatusWidget: Widget {
    var body: some WidgetConfiguration {
        StaticConfiguration(kind: "com.baobabproxy.bproxy.status", provider: StatusProvider()) { entry in
            StatusWidgetView(entry: entry)
        }
        .configurationDisplayName("B-Proxy")
        .description("Состояние VPN и кнопка включения")
        .supportedFamilies([.systemSmall, .systemMedium, .accessoryCircular, .accessoryRectangular, .accessoryInline])
    }
}

private struct StatusWidgetView: View {
    @Environment(\.widgetFamily) private var family
    let entry: StatusEntry

    private var s: BProxyWidgetStore.Snapshot { entry.snapshot }
    private var on: Bool { s.status == "connected" }
    private var accent: Color { themeColor(s.accent) }
    private var statusText: String {
        switch s.status {
        case "connected": return s.label("connected", "Защищено")
        case "connecting": return s.label("connecting", "Подключаемся")
        default: return s.label("disconnected", "Не защищено")
        }
    }
    private var place: String {
        let text = [s.flag, s.server].filter { !$0.isEmpty }.joined(separator: " ")
        return text.isEmpty ? s.label("hint", "Нажмите, чтобы подключить") : text
    }

    var body: some View {
        content
            .widgetURL(URL(string: "bproxy://toggle"))
            .modifier(WidgetBackground(accent: accent, on: on))
    }

    @ViewBuilder private var content: some View {
        switch family {
        case .accessoryInline:
            Label("B-Proxy · \(statusText)", systemImage: on ? "checkmark.shield.fill" : "shield")
        case .accessoryCircular:
            ZStack {
                AccessoryWidgetBackgroundCompat()
                Image(systemName: on ? "checkmark.shield.fill" : "shield.slash")
                    .font(.system(size: 22, weight: .semibold))
            }
        case .accessoryRectangular:
            VStack(alignment: .leading, spacing: 1) {
                Label(statusText, systemImage: on ? "checkmark.shield.fill" : "shield")
                    .font(.headline)
                Text(place).font(.caption).lineLimit(1)
                if on, let since = s.since {
                    Text(timerInterval: since...Date.distantFuture, countsDown: false)
                        .font(.caption.monospacedDigit())
                }
            }
        case .systemMedium:
            HStack(spacing: 16) {
                info
                Spacer(minLength: 0)
                ToggleCircle(on: on, ready: s.ready, accent: accent, size: 72)
            }
        default:
            VStack(alignment: .leading, spacing: 0) {
                HStack {
                    ToggleCircle(on: on, ready: s.ready, accent: accent, size: 44)
                    Spacer()
                }
                Spacer(minLength: 8)
                info
            }
        }
    }

    private var info: some View {
        VStack(alignment: .leading, spacing: 3) {
            Text(statusText)
                .font(.headline)
                .foregroundStyle(on ? accent : .white)
                .lineLimit(1)
            Text(place)
                .font(.caption)
                .foregroundStyle(.white.opacity(0.7))
                .lineLimit(2)
            if on, let since = s.since {
                Text(timerInterval: since...Date.distantFuture, countsDown: false)
                    .font(.subheadline.monospacedDigit().weight(.semibold))
                    .foregroundStyle(.white)
            }
        }
    }
}

/// Круглая кнопка: в iOS 17 включает и выключает VPN прямо в виджете,
/// раньше (или пока VPN ни разу не включали) — открывает приложение.
private struct ToggleCircle: View {
    let on: Bool
    let ready: Bool
    let accent: Color
    let size: CGFloat

    var body: some View {
        if ready {
            if #available(iOS 17.0, *) {
                Button(intent: BProxyToggleTunnelIntent()) { circle }
                    .buttonStyle(.plain)
            } else {
                circle
            }
        } else {
            circle
        }
    }

    private var circle: some View {
        ZStack {
            Circle().fill(on ? accent : Color.white.opacity(0.12))
            Image(systemName: "power")
                .font(.system(size: size * 0.42, weight: .bold))
                .foregroundStyle(on ? Color.black : Color.white)
        }
        .frame(width: size, height: size)
        .accessibilityLabel(on ? "Выключить VPN" : "Включить VPN")
    }
}

private struct AccessoryWidgetBackgroundCompat: View {
    var body: some View {
        if #available(iOS 16.0, *) {
            AccessoryWidgetBackground()
        }
    }
}

/// Фон: тёмное стекло с отсветом цвета темы, когда VPN работает.
private struct WidgetBackground: ViewModifier {
    @Environment(\.widgetFamily) private var family
    let accent: Color
    let on: Bool

    private var isAccessory: Bool {
        [.accessoryInline, .accessoryCircular, .accessoryRectangular].contains(family)
    }

    private var background: some View {
        ZStack {
            Color(red: 0.07, green: 0.08, blue: 0.10)
            if on {
                RadialGradient(colors: [accent.opacity(0.35), .clear], center: .topLeading, startRadius: 0, endRadius: 220)
            }
        }
    }

    func body(content: Content) -> some View {
        if #available(iOS 17.0, *) {
            content.containerBackground(for: .widget) {
                if isAccessory { Color.clear } else { background }
            }
        } else if isAccessory {
            content
        } else {
            content.padding().background(background)
        }
    }
}
