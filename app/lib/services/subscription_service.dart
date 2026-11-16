import 'dart:convert';

import 'package:http/http.dart' as http;

import '../core/xray_bridge.dart';
import '../models/subscription.dart';

/// Загружает подписку Remnawave и превращает её в список серверов.
class SubscriptionService {
  SubscriptionService({XrayBridge? bridge, http.Client? client})
      : _bridge = bridge ?? XrayBridge.instance,
        _client = client ?? http.Client();

  final XrayBridge _bridge;
  final http.Client _client;

  /// User-Agent, по которому панель отдаёт обычный список ссылок.
  static const userAgent = 'BProxy/0.1.0';

  Future<Subscription> fetch(String url, {Subscription? previous}) async {
    final uri = Uri.parse(url.trim());
    if (!uri.hasScheme || !(uri.scheme == 'https' || uri.scheme == 'http')) {
      throw const FormatException('Ссылка на подписку должна начинаться с https://');
    }

    final response = await _client
        .get(uri, headers: {'User-Agent': userAgent, 'Accept': '*/*'})
        .timeout(const Duration(seconds: 20));
    if (response.statusCode != 200) {
      throw Exception('Сервер подписки ответил кодом ${response.statusCode}');
    }

    final body = utf8.decode(response.bodyBytes, allowMalformed: true).trim();
    final nodes = await parseNodes(body);
    if (nodes.isEmpty) {
      throw Exception('В подписке нет ни одного сервера');
    }

    final headers = response.headers; // ключи уже в нижнем регистре
    final sub = Subscription(
      url: uri.toString(),
      title: _decodeHeaderText(headers['profile-title']) ??
          _titleFromDisposition(headers['content-disposition']) ??
          previous?.title ??
          uri.host,
      nodes: nodes,
      updatedAt: DateTime.now(),
      supportUrl: headers['support-url'],
      announce: _decodeHeaderText(headers['announce']),
      updateIntervalHours: int.tryParse(headers['profile-update-interval'] ?? ''),
    );
    _applyUserInfo(sub, headers['subscription-userinfo']);

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

    if (body.startsWith('[')) {
      // Формат Xray JSON от Remnawave: массив полных конфигов с "remarks".
      outbounds = [];
      for (final cfg in jsonDecode(body) as List) {
        final map = Map<String, dynamic>.from(cfg as Map);
        final list = (map['outbounds'] as List? ?? const [])
            .map((e) => Map<String, dynamic>.from(e as Map));
        final proxy = list.firstWhere(
          (o) => o['tag'] == 'proxy',
          orElse: () => list.isEmpty ? <String, dynamic>{} : list.first,
        );
        if (proxy.isEmpty) continue;
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
          sub.expireAt = value > 0
              ? DateTime.fromMillisecondsSinceEpoch(value * 1000)
              : null;
      }
    }
  }

  /// Заголовки могут прийти как "base64:..." — так Remnawave передаёт кириллицу.
  static String? _decodeHeaderText(String? raw) {
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
    return match?.group(1);
  }
}
