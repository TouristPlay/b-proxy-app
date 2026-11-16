import 'dart:convert';
import 'dart:io';

import '../models/subscription.dart';

/// Настройки подключения, которые пользователь меняет в приложении.
class ConnectionSettings {
  const ConnectionSettings({
    this.russianSitesDirect = true,
    this.blockAds = false,
    this.dnsServer = '1.1.1.1',
    this.ipv6 = false,
    this.tlsFragment = false,
  });

  /// Российские сайты (.ru, .рф, .su) идут напрямую, без VPN.
  final bool russianSitesDirect;
  final bool blockAds;
  final String dnsServer;
  final bool ipv6;

  /// Дробить TLS ClientHello на куски, чтобы его не узнавал DPI.
  final bool tlsFragment;

  ConnectionSettings copyWith({
    bool? russianSitesDirect,
    bool? blockAds,
    String? dnsServer,
    bool? ipv6,
    bool? tlsFragment,
  }) =>
      ConnectionSettings(
        russianSitesDirect: russianSitesDirect ?? this.russianSitesDirect,
        blockAds: blockAds ?? this.blockAds,
        dnsServer: dnsServer ?? this.dnsServer,
        ipv6: ipv6 ?? this.ipv6,
        tlsFragment: tlsFragment ?? this.tlsFragment,
      );

  Map<String, dynamic> toJson() => {
        'russianSitesDirect': russianSitesDirect,
        'blockAds': blockAds,
        'dnsServer': dnsServer,
        'ipv6': ipv6,
        'tlsFragment': tlsFragment,
      };

  factory ConnectionSettings.fromJson(Map<String, dynamic> j) =>
      ConnectionSettings(
        russianSitesDirect: j['russianSitesDirect'] as bool? ?? true,
        blockAds: j['blockAds'] as bool? ?? false,
        dnsServer: j['dnsServer'] as String? ?? '1.1.1.1',
        ipv6: j['ipv6'] as bool? ?? false,
        tlsFragment: j['tlsFragment'] as bool? ?? false,
      );
}

/// Собирает полный конфиг Xray для режима VPN (весь трафик через TUN).
class XrayConfigBuilder {
  /// Адреса внутри туннеля. DNS 172.19.0.2 отвечает сам Xray.
  static const tunGateway4 = '172.19.0.1/30';
  static const tunGateway6 = 'fdfe:dcba:9876::1/126';
  static const tunDns = '172.19.0.2';

  static const _privateCidrs = [
    '10.0.0.0/8',
    '172.16.0.0/12',
    '192.168.0.0/16',
    '169.254.0.0/16',
    '127.0.0.0/8',
    '100.64.0.0/10',
    'fc00::/7',
    'fe80::/10',
    '::1/128',
  ];

  static const _adDomains = [
    'domain:doubleclick.net',
    'domain:googlesyndication.com',
    'domain:googleadservices.com',
    'domain:adservice.google.com',
    'domain:an.yandex.ru',
    'domain:adfox.ru',
    'domain:mc.yandex.ru',
  ];

  /// Короткий конфиг без TUN, только outbound «proxy»
  /// (так его ждёт pingBatch в libXray).
  static String buildPingConfig(ServerNode node) {
    return jsonEncode({
      'outbounds': [_proxyOutbound(node)],
    });
  }

  /// [providerFragment] — фрагментация из заголовков подписки; включает её,
  /// даже если пользователь не включал её в настройках.
  static String build(ServerNode node, ConnectionSettings s,
      {Map<String, String>? providerFragment}) {
    final useFragment = s.tlsFragment || providerFragment != null;
    final fragment = {
      'packets': providerFragment?['packets'] ?? 'tlshello',
      'length': providerFragment?['length'] ?? '100-200',
      'interval': providerFragment?['interval'] ?? '10-20',
    };
    final config = {
      'log': {'loglevel': 'warning'},
      'dns': {
        'servers': [s.dnsServer, '8.8.8.8'],
        'queryStrategy': s.ipv6 ? 'UseIP' : 'UseIPv4',
      },
      'inbounds': [_tunInbound(s)],
      'outbounds': [
        _proxyOutbound(node, fragment: useFragment),
        {'tag': 'direct', 'protocol': 'freedom'},
        if (useFragment)
          {
            'tag': 'fragment',
            'protocol': 'freedom',
            'settings': {'fragment': fragment},
          },
        {'tag': 'block', 'protocol': 'blackhole'},
        {'tag': 'dns-out', 'protocol': 'dns'},
      ],
      'routing': {
        'domainStrategy': 'IPIfNonMatch',
        'rules': [
          {
            'type': 'field',
            'inboundTag': ['tun-in'],
            'port': '53',
            'outboundTag': 'dns-out',
          },
          if (s.blockAds)
            {'type': 'field', 'domain': _adDomains, 'outboundTag': 'block'},
          {'type': 'field', 'ip': _privateCidrs, 'outboundTag': 'direct'},
          if (s.russianSitesDirect)
            {
              'type': 'field',
              'domain': [
                'regexp:\\.ru\$',
                'regexp:\\.su\$',
                'regexp:\\.xn--p1ai\$',
              ],
              'outboundTag': 'direct',
            },
          {'type': 'field', 'network': 'tcp,udp', 'outboundTag': 'proxy'},
        ],
      },
    };
    return const JsonEncoder.withIndent('  ').convert(config);
  }

  static Map<String, dynamic> _proxyOutbound(ServerNode node,
      {bool fragment = false}) {
    final out = Map<String, dynamic>.from(node.outbound);
    out['tag'] = 'proxy';
    if (fragment) {
      // Соединение до сервера идёт через outbound "fragment".
      final stream = Map<String, dynamic>.from(
          (out['streamSettings'] as Map?) ?? const <String, dynamic>{});
      final sockopt = Map<String, dynamic>.from(
          (stream['sockopt'] as Map?) ?? const <String, dynamic>{});
      sockopt['dialerProxy'] = 'fragment';
      stream['sockopt'] = sockopt;
      out['streamSettings'] = stream;
    }
    return out;
  }

  static Map<String, dynamic> _tunInbound(ConnectionSettings s) {
    final settings = <String, dynamic>{'mtu': 1500};

    if (Platform.isAndroid || Platform.isIOS) {
      // Сам туннель и маршруты создаёт система (VpnService / NetworkExtension),
      // а дескриптор нативный код кладёт в env "xray.tun.fd".
      settings['name'] = 'xray0';
    } else {
      settings['name'] = Platform.isMacOS
          ? 'utun77'
          : Platform.isWindows
              ? 'B-Proxy'
              : 'bproxy0';
      settings['gateway'] = [tunGateway4, if (s.ipv6) tunGateway6];
      settings['dns'] = [tunDns];
      settings['autoSystemRoutingTable'] = [
        '0.0.0.0/0',
        if (s.ipv6) '::/0',
      ];
      if (Platform.isWindows) {
        settings['autoSystemWfpBlockLeak'] = ['dns', 'misconfigtun'];
      }
      if (Platform.isLinux) {
        settings['autoSystemDnsToGateway'] = false;
      }
    }

    return {
      'tag': 'tun-in',
      'port': 0,
      'protocol': 'tun',
      'settings': settings,
      'sniffing': {
        'enabled': true,
        'destOverride': ['http', 'tls', 'quic'],
        'routeOnly': true,
      },
    };
  }
}
