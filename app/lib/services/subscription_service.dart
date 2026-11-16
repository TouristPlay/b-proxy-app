import 'dart:convert';
import 'dart:io';

import 'package:http/http.dart' as http;

import '../core/xray_bridge.dart';
import '../models/subscription.dart';

/// Загружает подписку Remnawave и превращает её в список серверов.
///
/// Понимает те же заголовки ответа, что и популярные клиенты (INCY, Happ и др.):
/// profile-title, subscription-userinfo, announce, support-url,
/// profile-web-page-url, hide-url, sort-order, new-url, fragmentation-*.
/// Если заголовка нет, берутся строки метаданных из тела: `#profile-title: …`.
class SubscriptionService {
  SubscriptionService({XrayBridge? bridge, http.Client? client})
      : _bridge = bridge ?? XrayBridge.instance,
        _client = client ?? http.Client();

  final XrayBridge _bridge;
  final http.Client _client;

  static const appVersion = '0.1.0';

  static String get userAgent => 'BProxy/$appVersion/${_platform()}';

  static String _platform() {
    if (Platform.isAndroid) return 'android';
    if (Platform.isIOS) return 'ios';
    if (Platform.isWindows) return 'windows';
    if (Platform.isMacOS) return 'macos';
    return 'linux';
  }

  Future<Subscription> fetch(String url, {Subscription? previous}) async {
    final uri = Uri.parse(url.trim());
    if (!uri.hasScheme || !(uri.scheme == 'https' || uri.scheme == 'http')) {
      throw const FormatException('Ссылка на подписку должна начинаться с https://');
    }

    final response = await _client.get(uri, headers: {
      'User-Agent': userAgent,
      'Accept': '*/*',
      'Accept-Language': Platform.localeName.replaceAll('_', '-'),
      'x-app-version': appVersion,
      'x-client': 'BProxy',
    }).timeout(const Duration(seconds: 20));
    if (response.statusCode != 200) {
      throw Exception('Сервер подписки ответил кодом ${response.statusCode}');
    }

    final rawBody = utf8.decode(response.bodyBytes, allowMalformed: true).trim();
    final meta = <String, String>{};
    final body = _extractBodyMeta(rawBody, meta);

    final nodes = await parseNodes(body);
    if (nodes.isEmpty) {
      throw Exception('В подписке нет ни одного сервера');
    }

    // Заголовки важнее метаданных из тела. Ключи http уже в нижнем регистре.
    String? h(String name) {
      final v = response.headers[name] ?? meta[name];
      return (v == null || v.trim().isEmpty) ? null : v.trim();
    }

    // Провайдер может перенести подписку на новый адрес.
    final newUrl = h('new-url');
    final effectiveUrl =
        newUrl != null && newUrl.startsWith('https://') ? newUrl : uri.toString();

    final sub = Subscription(
      url: effectiveUrl,
      sourceUrl: previous?.sourceUrl ?? (effectiveUrl != uri.toString() ? uri.toString() : null),
      title: _decodeText(h('profile-title')) ??
          _decodeText(h('subscription-name')) ??
          _titleFromDisposition(h('content-disposition')) ??
          previous?.title ??
          uri.host,
      nodes: nodes,
      updatedAt: DateTime.now(),
      supportUrl: h('support-url'),
      announce: _decodeText(h('announce')),
      updateIntervalHours: int.tryParse(h('profile-update-interval') ?? ''),
      webPageUrl: h('profile-web-page-url') ?? h('homepage'),
      hideUrl: _flag(h('hide-url')),
      sortOrder: h('sort-order'),
      fragment: _flag(h('fragmentation-enable'))
          ? {
              'packets': h('fragmentation-packets') ?? 'tlshello',
              'length': h('fragmentation-length') ?? '100-200',
              'interval': h('fragmentation-interval') ?? '10-20',
            }
          : null,
    );
    _applyUserInfo(sub, h('subscription-userinfo'));

    if (sub.sortOrder == 'name') {
      sub.nodes.sort((a, b) => a.name.toLowerCase().compareTo(b.name.toLowerCase()));
    }

    // Сохраняем прошлые замеры пинга для серверов с тем же id.
    if (previous != null) {
      final oldPings = {for (final n in previous.nodes) n.id: n.pingMs};
      for (final n in sub.nodes) {
        n.pingMs = oldPings[n.id];
      }
    }
    return sub;
  }

  /// Тело подписки: base64 со ссылками, просто ссылки или Xray JSON.
  Future<List<ServerNode>> parseNodes(String body) async {
    final List<Map<String, dynamic>> outbounds;
    final names = <String>[];

    if (body.startsWith('[') || body.startsWith('{')) {
      // Xray JSON: массив полных конфигов с "remarks" (формат Remnawave) или один конфиг.
      final decoded = jsonDecode(body);
      final configs = decoded is List ? decoded : [decoded];
      outbounds = [];
      for (final cfg in configs) {
        final map = Map<String, dynamic>.from(cfg as Map);
        final list = (map['outbounds'] as List? ?? const [])
            .map((e) => Map<String, dynamic>.from(e as Map))
            .toList();
        if (list.isEmpty) continue;
        final proxy = list.firstWhere((o) => o['tag'] == 'proxy', orElse: () => list.first);
        outbounds.add(proxy);
        names.add((map['remarks'] as String?) ?? (proxy['tag'] as String? ?? ''));
      }
    } else {
      outbounds = await _bridge.convertShareLinks(body);
      for (final o in outbounds) {
        names.add((o['tag'] as String?) ?? '');
      }
    }

    final nodes = <ServerNode>[];
    for (var i = 0; i < outbounds.length; i++) {
      final o = outbounds[i];
      final protocol = (o['protocol'] as String?) ?? 'unknown';
      if (protocol == 'freedom' || protocol == 'blackhole' || protocol == 'dns') {
        continue;
      }
      final name = names[i].trim().isEmpty ? 'Сервер ${i + 1}' : names[i].trim();
      nodes.add(ServerNode(
        id: '$i:$name',
        name: name,
        protocol: protocol,
        outbound: o,
      ));
    }
    return nodes;
  }

  /// Вынимает из тела строки `#ключ: значение` и возвращает тело без них.
  /// В base64-теле метаданные ищутся после декодирования.
  static String _extractBodyMeta(String body, Map<String, String> meta) {
    var text = body;
    if (!text.contains('://') && !text.startsWith('[') && !text.startsWith('{')) {
      try {
        text = utf8.decode(base64.decode(base64.normalize(
            text.replaceAll(RegExp(r'\s'), '').replaceAll('-', '+').replaceAll('_', '/'))));
      } catch (_) {
        return body; // не base64 — отдаём как есть, libXray разберётся
      }
    }
    if (text.startsWith('[') || text.startsWith('{')) return text;

    final lines = <String>[];
    final metaLine = RegExp(r'^#([a-z\-]+):\s*(.*)$');
    for (final line in const LineSplitter().convert(text)) {
      final m = metaLine.firstMatch(line.trim());
      if (m != null) {
        meta[m.group(1)!] = m.group(2)!;
      } else {
        lines.add(line);
      }
    }
    return lines.join('\n');
  }

  /// subscription-userinfo: upload=123; download=456; total=789; expire=1700000000
  static void _applyUserInfo(Subscription sub, String? raw) {
    if (raw == null) return;
    for (final part in raw.split(';')) {
      final kv = part.split('=');
      if (kv.length != 2) continue;
      final value = int.tryParse(kv[1].trim()) ?? 0;
      switch (kv[0].trim()) {
        case 'upload':
          sub.uploadBytes = value;
        case 'download':
          sub.downloadBytes = value;
        case 'total':
          sub.totalBytes = value;
        case 'expire':
          // Больше 32 млрд — это уже миллисекунды.
          sub.expireAt = value <= 0
              ? null
              : DateTime.fromMillisecondsSinceEpoch(value > 32000000000 ? value : value * 1000);
      }
    }
  }

  static bool _flag(String? v) => v == '1' || v?.toLowerCase() == 'true';

  /// Текст может прийти как "base64:..." — так Remnawave передаёт кириллицу.
  static String? _decodeText(String? raw) {
    if (raw == null || raw.isEmpty) return null;
    if (raw.startsWith('base64:')) {
      try {
        return utf8.decode(base64.decode(base64.normalize(raw.substring(7))));
      } catch (_) {
        return null;
      }
    }
    return raw;
  }

  static String? _titleFromDisposition(String? raw) {
    if (raw == null) return null;
    final match = RegExp(r'filename="?([^";]+)"?').firstMatch(raw);
    return match?.group(1)?.replaceAll(RegExp(r'\.(txt|yaml)$'), '');
  }
}
