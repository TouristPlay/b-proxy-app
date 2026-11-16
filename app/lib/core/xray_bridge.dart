import 'dart:convert';
import 'dart:io';

import 'package:flutter/services.dart';

import 'xray_bridge_ffi.dart';

/// Ошибка, которую вернул libXray.
class XrayException implements Exception {
  XrayException(this.message);
  final String message;
  @override
  String toString() => message;
}

/// Доступ к libXray через его единый вход `Invoke` (apiVersion 3).
///
/// На Android и iOS библиотека собрана через gomobile и вызывается из
/// нативного кода по MethodChannel. На Windows и Linux — напрямую через FFI
/// (`CGoInvoke` из libXray.dll / libXray.so).
abstract class XrayBridge {
  static const int apiVersion = 3;

  static XrayBridge? _instance;
  static XrayBridge get instance => _instance ??= _create();

  static XrayBridge _create() {
    if (Platform.isAndroid || Platform.isIOS) return _ChannelXrayBridge();
    if (Platform.isWindows || Platform.isLinux) return FfiXrayBridge();
    // macOS подключим вместе с Network Extension.
    return _ChannelXrayBridge();
  }

  /// Сырой вызов: принимает и возвращает JSON-строку.
  Future<String> invokeRaw(String requestJson);

  /// Вызов метода libXray. Возвращает поле `data` ответа.
  Future<dynamic> call(String method, [Map<String, dynamic>? payload]) async {
    final request = jsonEncode({
      'apiVersion': apiVersion,
      'method': method,
      if (payload != null) 'payload': payload,
    });
    final raw = await invokeRaw(request);
    final response = jsonDecode(raw) as Map<String, dynamic>;
    if (response['success'] != true) {
      throw XrayException((response['error'] as String?) ?? 'Ошибка ядра Xray');
    }
    return response['data'];
  }

  /// Ссылки vless://, trojan://, ss://, hysteria2:// и т. д. → список outbounds.
  Future<List<Map<String, dynamic>>> convertShareLinks(String text) async {
    final data = await call('convertShareLinksToXrayJson', {'text': text});
    final outbounds = (data as Map)['outbounds'] as List? ?? const [];
    return outbounds.map((e) => Map<String, dynamic>.from(e as Map)).toList();
  }

  /// Замер задержки для каждого outbound. Возвращает мс или -1.
  Future<List<int>> pingBatch(List<String> xrayJsons,
      {String url = 'https://www.gstatic.com/generate_204',
      int timeoutSec = 5}) async {
    final data = await call('pingBatch', {
      'configs': [
        for (final j in xrayJsons) {'xrayJson': j, 'outboundTag': 'proxy'}
      ],
      'timeout': timeoutSec,
      'url': url,
    });
    final results = (data as Map)['results'] as List? ?? const [];
    return [
      for (final r in results)
        (r as Map)['success'] == true ? (r['delay'] as num).toInt() : -1
    ];
  }

  Future<String> version() async {
    final data = await call('xrayVersion');
    return (data as Map)['version'] as String? ?? '';
  }
}

class _ChannelXrayBridge extends XrayBridge {
  static const _channel = MethodChannel('b_proxy/xray');

  @override
  Future<String> invokeRaw(String requestJson) async {
    final result = await _channel.invokeMethod<String>('invoke', requestJson);
    if (result == null) throw XrayException('Пустой ответ ядра');
    return result;
  }
}
