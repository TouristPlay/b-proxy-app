import 'dart:convert';

/// Один сервер из подписки: готовый outbound Xray и его имя.
class ServerNode {
  ServerNode({
    required this.id,
    required this.name,
    required this.protocol,
    required this.outbound,
    this.pingMs,
  });

  /// Стабильный идентификатор внутри подписки (индекс + имя).
  final String id;
  final String name;
  final String protocol;

  /// Outbound в формате Xray JSON (как его вернул libXray).
  final Map<String, dynamic> outbound;

  /// Последний замер задержки, мс. null — ещё не мерили, -1 — недоступен.
  int? pingMs;

  /// Транспорт для подписи под названием: «VLESS · Reality».
  String get subtitle {
    final stream = outbound['streamSettings'];
    final parts = <String>[protocol.toUpperCase()];
    if (stream is Map) {
      final security = stream['security'];
      final network = stream['network'];
      if (security is String && security.isNotEmpty && security != 'none') {
        parts.add(security == 'reality' ? 'Reality' : security.toUpperCase());
      }
      if (network is String && network.isNotEmpty && network != 'tcp' && network != 'raw') {
        parts.add(network.toUpperCase());
      }
    }
    return parts.join(' · ');
  }

  Map<String, dynamic> toJson() => {
        'id': id,
        'name': name,
        'protocol': protocol,
        'outbound': outbound,
        'pingMs': pingMs,
      };

  factory ServerNode.fromJson(Map<String, dynamic> json) => ServerNode(
        id: json['id'] as String,
        name: json['name'] as String,
        protocol: json['protocol'] as String,
        outbound: Map<String, dynamic>.from(json['outbound'] as Map),
        pingMs: json['pingMs'] as int?,
      );
}

/// Подписка Remnawave (или любая другая со ссылками vless://, trojan:// и т. д.).
class Subscription {
  Subscription({
    required this.url,
    required this.title,
    required this.nodes,
    required this.updatedAt,
    this.uploadBytes = 0,
    this.downloadBytes = 0,
    this.totalBytes = 0,
    this.expireAt,
    this.supportUrl,
    this.announce,
    this.updateIntervalHours,
  });

  final String url;
  String title;
  List<ServerNode> nodes;
  DateTime updatedAt;

  /// Данные из заголовка subscription-userinfo.
  int uploadBytes;
  int downloadBytes;
  int totalBytes; // 0 — безлимит
  DateTime? expireAt;

  String? supportUrl;
  String? announce;
  int? updateIntervalHours;

  int get usedBytes => uploadBytes + downloadBytes;
  bool get isUnlimited => totalBytes <= 0;
  double get usedFraction =>
      isUnlimited ? 0 : (usedBytes / totalBytes).clamp(0.0, 1.0);

  Map<String, dynamic> toJson() => {
        'url': url,
        'title': title,
        'nodes': nodes.map((n) => n.toJson()).toList(),
        'updatedAt': updatedAt.toIso8601String(),
        'uploadBytes': uploadBytes,
        'downloadBytes': downloadBytes,
        'totalBytes': totalBytes,
        'expireAt': expireAt?.toIso8601String(),
        'supportUrl': supportUrl,
        'announce': announce,
        'updateIntervalHours': updateIntervalHours,
      };

  factory Subscription.fromJson(Map<String, dynamic> json) => Subscription(
        url: json['url'] as String,
        title: json['title'] as String,
        nodes: (json['nodes'] as List)
            .map((e) => ServerNode.fromJson(Map<String, dynamic>.from(e as Map)))
            .toList(),
        updatedAt: DateTime.parse(json['updatedAt'] as String),
        uploadBytes: json['uploadBytes'] as int? ?? 0,
        downloadBytes: json['downloadBytes'] as int? ?? 0,
        totalBytes: json['totalBytes'] as int? ?? 0,
        expireAt: json['expireAt'] == null
            ? null
            : DateTime.parse(json['expireAt'] as String),
        supportUrl: json['supportUrl'] as String?,
        announce: json['announce'] as String?,
        updateIntervalHours: json['updateIntervalHours'] as int?,
      );

  String encode() => jsonEncode(toJson());
  static Subscription decode(String raw) =>
      Subscription.fromJson(jsonDecode(raw) as Map<String, dynamic>);
}
