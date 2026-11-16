import 'package:flutter/material.dart';

import '../core/app_controller.dart';
import '../core/xray_bridge.dart';
import '../theme.dart';
import '../widgets/common.dart';

class SettingsScreen extends StatelessWidget {
  const SettingsScreen({super.key, required this.app});
  final AppController app;

  @override
  Widget build(BuildContext context) {
    final c = context.c;
    return ListenableBuilder(
      listenable: app,
      builder: (context, _) {
        final s = app.settings;
        return Scaffold(
          appBar: AppBar(title: const Text('Настройки')),
          body: Center(
            child: ConstrainedBox(
              constraints: const BoxConstraints(maxWidth: 560),
              child: ListView(
                padding: const EdgeInsets.fromLTRB(20, 8, 20, 32),
                children: [
                  const Eyebrow('Маршрутизация'),
                  const SizedBox(height: 8),
                  BCard(
                    padding: EdgeInsets.zero,
                    child: Column(children: [
                      _Toggle(
                        title: 'Российские сайты напрямую',
                        subtitle: 'Банки, Госуслуги и сайты .ru открываются без VPN',
                        value: s.russianSitesDirect,
                        onChanged: (v) => app.updateSettings(s.copyWith(russianSitesDirect: v)),
                      ),
                      const Divider(),
                      _Toggle(
                        title: 'Фрагментация TLS',
                        subtitle: 'Помогает, если провайдер режет подключение к серверу',
                        value: s.tlsFragment,
                        onChanged: (v) => app.updateSettings(s.copyWith(tlsFragment: v)),
                      ),
                      const Divider(),
                      _Toggle(
                        title: 'Блокировать рекламу',
                        subtitle: 'Отсекает основные рекламные домены',
                        value: s.blockAds,
                        onChanged: (v) => app.updateSettings(s.copyWith(blockAds: v)),
                      ),
                      const Divider(),
                      _Toggle(
                        title: 'IPv6',
                        subtitle: 'Включайте, только если сервер поддерживает IPv6',
                        value: s.ipv6,
                        onChanged: (v) => app.updateSettings(s.copyWith(ipv6: v)),
                      ),
                    ]),
                  ),
                  const SizedBox(height: 24),
                  const Eyebrow('DNS'),
                  const SizedBox(height: 8),
                  BCard(
                    padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                    child: RadioGroup<String>(
                      groupValue: s.dnsServer,
                      onChanged: (v) {
                        if (v != null) app.updateSettings(s.copyWith(dnsServer: v));
                      },
                      child: const Column(children: [
                        RadioListTile(value: '1.1.1.1', title: Text('Cloudflare · 1.1.1.1')),
                        RadioListTile(value: '8.8.8.8', title: Text('Google · 8.8.8.8')),
                        RadioListTile(value: '9.9.9.9', title: Text('Quad9 · 9.9.9.9')),
                      ]),
                    ),
                  ),
                  const SizedBox(height: 24),
                  const Eyebrow('Оформление'),
                  const SizedBox(height: 8),
                  SegmentedButton<ThemeMode>(
                    segments: const [
                      ButtonSegment(value: ThemeMode.system, label: Text('Как в системе')),
                      ButtonSegment(value: ThemeMode.dark, label: Text('Тёмная')),
                      ButtonSegment(value: ThemeMode.light, label: Text('Светлая')),
                    ],
                    selected: {app.themeMode},
                    onSelectionChanged: (v) => app.setThemeMode(v.first),
                  ),
                  const SizedBox(height: 32),
                  Center(
                    child: FutureBuilder<String>(
                      future: XrayBridge.instance.version().catchError((_) => ''),
                      builder: (context, snap) => Text(
                        'B-Proxy 0.1.0${(snap.data ?? '').isNotEmpty ? ' · Xray ${snap.data}' : ''}',
                        style: mono(11, c.faint),
                      ),
                    ),
                  ),
                ],
              ),
            ),
          ),
        );
      },
    );
  }
}

class _Toggle extends StatelessWidget {
  const _Toggle({
    required this.title,
    required this.subtitle,
    required this.value,
    required this.onChanged,
  });

  final String title;
  final String subtitle;
  final bool value;
  final ValueChanged<bool> onChanged;

  @override
  Widget build(BuildContext context) => SwitchListTile(
        contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 4),
        title: Text(title, style: const TextStyle(fontWeight: FontWeight.w600)),
        subtitle: Text(subtitle, style: TextStyle(color: context.c.muted, fontSize: 13)),
        value: value,
        onChanged: onChanged,
      );
}
