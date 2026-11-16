import 'dart:async';
import 'dart:io';

import 'package:flutter/services.dart';
import 'package:path_provider/path_provider.dart';

import 'xray_bridge.dart';

enum TunnelState { disconnected, connecting, connected, disconnecting }

class TunnelStats {
  const TunnelStats(this.rxBytes, this.txBytes);
  final int rxBytes;
  final int txBytes;
}

/// Запуск и остановка VPN на конкретной платформе.
abstract class VpnTunnel {
  static VpnTunnel create() {
    if (Platform.isAndroid || Platform.isIOS || Platform.isMacOS) {
      return MobileVpnTunnel();
    }
    if (Platform.isWindows) return WindowsVpnTunnel();
    if (Platform.isLinux) return LinuxVpnTunnel();
    return UnsupportedVpnTunnel();
  }

  /// Состояние, о котором сообщает система (VPN мог отключиться сам).
  Stream<TunnelState> get states;

  /// Запросить разрешение на VPN (Android). true — можно подключаться.
  Future<bool> prepare() async => true;

  Future<void> start(String xrayConfigJson);
  Future<void> stop();

  /// Счётчики трафика с момента подключения, если платформа умеет.
  Future<TunnelStats?> stats() async => null;
}

/// Android и iOS: туннель держит нативный сервис.
class MobileVpnTunnel extends VpnTunnel {
  static const _channel = MethodChannel('b_proxy/vpn');
  static const _events = EventChannel('b_proxy/vpn/state');

  @override
  Stream<TunnelState> get states => _events.receiveBroadcastStream().map((e) {
        switch (e as String) {
          case 'connecting':
            return TunnelState.connecting;
          case 'connected':
            return TunnelState.connected;
          case 'disconnecting':
            return TunnelState.disconnecting;
          default:
            return TunnelState.disconnected;
        }
      });

  @override
  Future<bool> prepare() async =>
      await _channel.invokeMethod<bool>('prepare') ?? false;

  @override
  Future<void> start(String xrayConfigJson) =>
      _channel.invokeMethod('start', {'config': xrayConfigJson});

  @override
  Future<void> stop() => _channel.invokeMethod('stop');

  @override
  Future<TunnelStats?> stats() async {
    final m = await _channel.invokeMapMethod<String, dynamic>('stats');
    if (m == null) return null;
    return TunnelStats((m['rx'] as num).toInt(), (m['tx'] as num).toInt());
  }
}

/// Windows: ядро работает прямо в процессе приложения через libXray.dll.
/// Приложение запускается от администратора (так требует Wintun),
/// а wintun.dll лежит рядом с b_proxy.exe.
class WindowsVpnTunnel extends VpnTunnel {
  final _controller = StreamController<TunnelState>.broadcast();

  @override
  Stream<TunnelState> get states => _controller.stream;

  @override
  Future<void> start(String xrayConfigJson) async {
    _controller.add(TunnelState.connecting);
    try {
      await XrayBridge.instance.call('runXray', {'xrayJson': xrayConfigJson});
      _controller.add(TunnelState.connected);
    } catch (e) {
      _controller.add(TunnelState.disconnected);
      rethrow;
    }
  }

  @override
  Future<void> stop() async {
    _controller.add(TunnelState.disconnecting);
    try {
      await XrayBridge.instance.call('stopXray');
    } finally {
      _controller.add(TunnelState.disconnected);
    }
  }
}

/// Linux: для TUN нужны права root, поэтому ядро запускается отдельным
/// процессом через pkexec (система один раз спросит пароль при подключении).
/// Остановка — через файл-флаг, который видит обёртка с правами root.
class LinuxVpnTunnel extends VpnTunnel {
  final _controller = StreamController<TunnelState>.broadcast();
  Process? _process;
  File? _stopFlag;

  @override
  Stream<TunnelState> get states => _controller.stream;

  static String _corePath() {
    final exeDir = File(Platform.resolvedExecutable).parent.path;
    return '$exeDir/lib/xray';
  }

  @override
  Future<void> start(String xrayConfigJson) async {
    _controller.add(TunnelState.connecting);
    final dir = await getApplicationSupportDirectory();
    final config = File('${dir.path}/xray.json');
    final errors = File('${dir.path}/xray-error.txt');
    _stopFlag = File('${dir.path}/xray.stop');
    await config.writeAsString(xrayConfigJson);
    await errors.writeAsString('');
    if (await _stopFlag!.exists()) await _stopFlag!.delete();

    // Обёртка: запускает ядро и гасит его, когда появляется файл-флаг
    // или когда завершается само приложение.
    const script = r'''
core="$1"; cfg="$2"; flag="$3"; err="$4"; owner="$5"
"$core" run -set-dns=false -config "$cfg" -error-file "$err" &
pid=$!
while kill -0 "$pid" 2>/dev/null; do
  if [ -e "$flag" ] || ! kill -0 "$owner" 2>/dev/null; then
    kill "$pid"; wait "$pid"; exit 0
  fi
  sleep 1
done
wait "$pid"
''';
    _process = await Process.start('pkexec', [
      '/bin/sh',
      '-c',
      script,
      'bproxy',
      _corePath(),
      config.path,
      _stopFlag!.path,
      errors.path,
      '$pid',
    ]);

    // Если процесс не упал за 3 секунды — считаем, что туннель поднят.
    final exited = await _process!.exitCode
        .timeout(const Duration(seconds: 3), onTimeout: () => -999);
    if (exited != -999) {
      _process = null;
      _controller.add(TunnelState.disconnected);
      final text = (await errors.readAsString()).trim();
      throw Exception(exited == 126 || exited == 127
          ? 'Нет прав администратора для запуска VPN'
          : (text.isEmpty ? 'Ядро Xray остановилось (код $exited)' : text));
    }
    _controller.add(TunnelState.connected);
    unawaited(_process!.exitCode.then((_) {
      _process = null;
      _controller.add(TunnelState.disconnected);
    }));
  }

  @override
  Future<void> stop() async {
    if (_process == null) return;
    _controller.add(TunnelState.disconnecting);
    await _stopFlag?.writeAsString('stop');
    await _process?.exitCode.timeout(const Duration(seconds: 5),
        onTimeout: () => 0);
  }
}

class UnsupportedVpnTunnel extends VpnTunnel {
  @override
  Stream<TunnelState> get states => const Stream.empty();
  @override
  Future<void> start(String xrayConfigJson) =>
      Future.error(Exception('Эта платформа пока не поддерживается'));
  @override
  Future<void> stop() async {}
}
