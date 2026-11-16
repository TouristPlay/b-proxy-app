import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../models/subscription.dart';
import '../services/storage.dart';
import '../services/subscription_service.dart';
import 'config_builder.dart';
import 'vpn_tunnel.dart';
import 'xray_bridge.dart';

/// Всё состояние приложения в одном месте. Экраны слушают его через
/// ListenableBuilder и вызывают методы.
class AppController extends ChangeNotifier {
  AppController({Storage? storage, SubscriptionService? subs, VpnTunnel? tunnel})
      : _storage = storage ?? Storage(),
        _subs = subs ?? SubscriptionService(),
        _tunnel = tunnel ?? VpnTunnel.create();

  final Storage _storage;
  final SubscriptionService _subs;
  final VpnTunnel _tunnel;

  List<Subscription> subscriptions = [];
  ConnectionSettings settings = const ConnectionSettings();
  ThemeMode themeMode = ThemeMode.system;

  /// null — автовыбор по пингу.
  String? _selectedKey;
  bool get autoSelect => _selectedKey == null;

  TunnelState state = TunnelState.disconnected;
  DateTime? connectedAt;
  String? lastError;
  bool busy = false;
  bool pinging = false;

  TunnelStats? _statsStart;
  TunnelStats? _statsLast;
  DateTime? _statsLastAt;
  int downSpeed = 0; // байт/с
  int upSpeed = 0;
  bool get hasStats => _statsLast != null;

  StreamSubscription<TunnelState>? _stateSub;
  Timer? _ticker;

  bool get isConnected => state == TunnelState.connected;
  bool get hasServers => allNodes.isNotEmpty;

  Subscription? get primary =>
      subscriptions.isEmpty ? null : subscriptions.first;

  Iterable<(Subscription, ServerNode)> get allNodes sync* {
    for (final s in subscriptions) {
      for (final n in s.nodes) {
        yield (s, n);
      }
    }
  }

  static String _key(Subscription s, ServerNode n) => '${s.url}|${n.id}';

  bool isSelected(Subscription s, ServerNode n) => _selectedKey == _key(s, n);

  /// Сервер, к которому подключимся: выбранный вручную или с лучшим пингом.
  (Subscription, ServerNode)? get currentNode {
    final nodes = allNodes.toList();
    if (nodes.isEmpty) return null;
    if (_selectedKey != null) {
      for (final pair in nodes) {
        if (_key(pair.$1, pair.$2) == _selectedKey) return pair;
      }
    }
    final measured = nodes
        .where((p) => p.$2.pingMs != null && p.$2.pingMs! > 0)
        .toList()
      ..sort((a, b) => a.$2.pingMs!.compareTo(b.$2.pingMs!));
    return measured.isNotEmpty ? measured.first : nodes.first;
  }

  Future<void> init() async {
    subscriptions = await _storage.loadSubscriptions();
    settings = await _storage.loadSettings();
    _selectedKey = await _storage.loadSelected();
    themeMode = switch (await _storage.loadTheme()) {
      'dark' => ThemeMode.dark,
      'light' => ThemeMode.light,
      _ => ThemeMode.system,
    };
    _stateSub = _tunnel.states.listen(_onTunnelState);
    notifyListeners();

    // Подписки обновляем в фоне, если прошло больше суток (или сколько просит панель).
    for (final s in List.of(subscriptions)) {
      final hours = s.updateIntervalHours ?? 24;
      if (DateTime.now().difference(s.updatedAt).inHours >= hours) {
        unawaited(refreshSubscription(s).catchError((_) {}));
      }
    }
  }

  void _onTunnelState(TunnelState s) {
    state = s;
    if (s == TunnelState.connected) {
      connectedAt ??= DateTime.now();
      _startTicker();
    } else if (s == TunnelState.disconnected) {
      connectedAt = null;
      _stopTicker();
    }
    notifyListeners();
  }

  Future<void> toggle() => isConnected || state == TunnelState.connecting
      ? disconnect()
      : connect();

  Future<void> connect() async {
    final pair = currentNode;
    if (pair == null) {
      lastError = 'Сначала добавьте подписку';
      notifyListeners();
      return;
    }
    lastError = null;
    busy = true;
    state = TunnelState.connecting;
    notifyListeners();
    try {
      if (!await _tunnel.prepare()) {
        throw Exception('Разрешите B-Proxy создавать VPN-подключение');
      }
      final config = XrayConfigBuilder.build(pair.$2, settings,
          providerFragment: pair.$1.fragment);
      await _tunnel.start(config);
      state = TunnelState.connected;
      connectedAt = DateTime.now();
      _startTicker();
    } catch (e) {
      state = TunnelState.disconnected;
      lastError = _humanError(e);
    } finally {
      busy = false;
      notifyListeners();
    }
  }

  Future<void> disconnect() async {
    busy = true;
    notifyListeners();
    try {
      await _tunnel.stop();
    } catch (e) {
      lastError = _humanError(e);
    } finally {
      state = TunnelState.disconnected;
      connectedAt = null;
      _stopTicker();
      busy = false;
      notifyListeners();
    }
  }

  /// Переподключиться, если сменили сервер или настройки во время работы.
  Future<void> _reconnectIfNeeded() async {
    if (!isConnected) return;
    await disconnect();
    await connect();
  }

  Future<void> select(Subscription? s, ServerNode? n) async {
    _selectedKey = (s == null || n == null) ? null : _key(s, n);
    await _storage.saveSelected(_selectedKey);
    notifyListeners();
    await _reconnectIfNeeded();
  }

  Future<void> addSubscription(String url) async {
    final sub = await _subs.fetch(url);
    subscriptions.removeWhere((s) => s.url == sub.url);
    subscriptions.insert(0, sub);
    await _storage.saveSubscriptions(subscriptions);
    notifyListeners();
    unawaited(pingAll());
  }

  Future<void> refreshSubscription(Subscription old) async {
    final fresh = await _subs.fetch(old.url, previous: old);
    final i = subscriptions.indexWhere((s) => s.url == old.url);
    if (i >= 0) subscriptions[i] = fresh;
    await _storage.saveSubscriptions(subscriptions);
    notifyListeners();
  }

  Future<void> refreshAll() async {
    for (final s in List.of(subscriptions)) {
      await refreshSubscription(s);
    }
  }

  Future<void> removeSubscription(Subscription s) async {
    subscriptions.removeWhere((x) => x.url == s.url);
    if (_selectedKey?.startsWith('${s.url}|') ?? false) _selectedKey = null;
    await _storage.saveSubscriptions(subscriptions);
    await _storage.saveSelected(_selectedKey);
    notifyListeners();
  }

  /// Пинг через ядро. Пока VPN включён, libXray пинговать не даёт —
  /// поэтому замеряем только в отключённом состоянии.
  Future<void> pingAll() async {
    if (pinging || state != TunnelState.disconnected) return;
    final nodes = allNodes.map((p) => p.$2).toList();
    if (nodes.isEmpty) return;
    pinging = true;
    notifyListeners();
    try {
      final results = await XrayBridge.instance
          .pingBatch([for (final n in nodes) XrayConfigBuilder.buildPingConfig(n)]);
      for (var i = 0; i < nodes.length && i < results.length; i++) {
        nodes[i].pingMs = results[i];
      }
      await _storage.saveSubscriptions(subscriptions);
    } catch (e) {
      lastError = _humanError(e);
    } finally {
      pinging = false;
      notifyListeners();
    }
  }

  Future<void> updateSettings(ConnectionSettings s) async {
    settings = s;
    await _storage.saveSettings(s);
    notifyListeners();
    await _reconnectIfNeeded();
  }

  Future<void> setThemeMode(ThemeMode mode) async {
    themeMode = mode;
    await _storage.saveTheme(switch (mode) {
      ThemeMode.dark => 'dark',
      ThemeMode.light => 'light',
      ThemeMode.system => 'system',
    });
    notifyListeners();
  }

  void clearError() {
    lastError = null;
    notifyListeners();
  }

  void _startTicker() {
    _ticker?.cancel();
    _statsStart = null;
    _statsLast = null;
    _ticker = Timer.periodic(const Duration(seconds: 1), (_) => _tick());
  }

  void _stopTicker() {
    _ticker?.cancel();
    _ticker = null;
    _statsStart = null;
    _statsLast = null;
    downSpeed = 0;
    upSpeed = 0;
  }

  Future<void> _tick() async {
    final now = DateTime.now();
    final s = await _tunnel.stats().catchError((_) => null);
    if (s != null) {
      _statsStart ??= s;
      if (_statsLast != null && _statsLastAt != null) {
        final dt = now.difference(_statsLastAt!).inMilliseconds / 1000;
        if (dt > 0) {
          downSpeed = ((s.rxBytes - _statsLast!.rxBytes) / dt).round().clamp(0, 1 << 40);
          upSpeed = ((s.txBytes - _statsLast!.txBytes) / dt).round().clamp(0, 1 << 40);
        }
      }
      _statsLast = s;
      _statsLastAt = now;
    }
    notifyListeners(); // заодно обновляется таймер подключения
  }

  static String _humanError(Object e) {
    if (e is PlatformException) return e.message ?? e.code;
    final text = e.toString();
    return text.startsWith('Exception: ') ? text.substring(11) : text;
  }

  @override
  void dispose() {
    _stateSub?.cancel();
    _ticker?.cancel();
    super.dispose();
  }
}
