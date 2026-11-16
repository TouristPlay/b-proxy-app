import 'package:flutter/material.dart';
import 'package:url_launcher/url_launcher.dart';

import '../core/app_controller.dart';
import '../core/vpn_tunnel.dart';
import '../theme.dart';
import '../widgets/common.dart';
import '../widgets/power_button.dart';
import 'add_subscription_screen.dart';
import 'servers_screen.dart';
import 'settings_screen.dart';

class HomeScreen extends StatelessWidget {
  const HomeScreen({super.key, required this.app});
  final AppController app;

  @override
  Widget build(BuildContext context) {
    final c = context.c;
    return ListenableBuilder(
      listenable: app,
      builder: (context, _) => Scaffold(
        appBar: AppBar(
          titleSpacing: 20,
          title: Row(children: [
            ClipOval(child: Image.asset('assets/logo_disc.png', width: 28, height: 28)),
            const SizedBox(width: 10),
            Text('B-Proxy', style: display(18, c.fg)),
          ]),
          actions: [
            IconButton(
              tooltip: 'Настройки',
              icon: Icon(Icons.tune_rounded, color: c.muted),
              onPressed: () => Navigator.of(context).push(MaterialPageRoute(
                  builder: (_) => SettingsScreen(app: app))),
            ),
            const SizedBox(width: 8),
          ],
        ),
        body: SafeArea(
          child: Center(
            child: ConstrainedBox(
              constraints: const BoxConstraints(maxWidth: 480),
              child: app.hasServers ? _Connected(app: app) : _Empty(app: app),
            ),
          ),
        ),
      ),
    );
  }
}

class _Empty extends StatelessWidget {
  const _Empty({required this.app});
  final AppController app;

  @override
  Widget build(BuildContext context) {
    final c = context.c;
    return Padding(
      padding: const EdgeInsets.all(24),
      child: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          PowerButton(state: TunnelState.disconnected, onTap: () => _add(context), size: 220),
          const SizedBox(height: 28),
          const Eyebrow('BaobabVPN'),
          const SizedBox(height: 10),
          Text('Корни свободы\nв интернете',
              textAlign: TextAlign.center, style: display(26, c.fg, weight: FontWeight.w700)),
          const SizedBox(height: 12),
          Text(
            'Вставьте ссылку на подписку из личного кабинета или Telegram-бота, '
            'и приложение само добавит все серверы.',
            textAlign: TextAlign.center,
            style: TextStyle(color: c.muted, height: 1.5),
          ),
          const SizedBox(height: 24),
          FilledButton.icon(
            onPressed: () => _add(context),
            icon: const Icon(Icons.add_rounded),
            label: const Text('Добавить подписку'),
          ),
        ],
      ),
    );
  }

  void _add(BuildContext context) => Navigator.of(context).push(
      MaterialPageRoute(builder: (_) => AddSubscriptionScreen(app: app)));
}

class _Connected extends StatelessWidget {
  const _Connected({required this.app});
  final AppController app;

  @override
  Widget build(BuildContext context) {
    final c = context.c;
    final pair = app.currentNode;
    final sub = app.primary;
    final (statusText, statusColor) = switch (app.state) {
      TunnelState.connected => ('Защищено', c.leaf),
      TunnelState.connecting => ('Подключаемся…', c.accentFg),
      TunnelState.disconnecting => ('Отключаемся…', c.muted),
      TunnelState.disconnected => ('Не подключено', c.muted),
    };

    return ListView(
      padding: const EdgeInsets.fromLTRB(20, 4, 20, 24),
      children: [
        if (sub?.announce != null && sub!.announce!.isNotEmpty) ...[
          _Announce(text: sub.announce!),
          const SizedBox(height: 12),
        ],
        const SizedBox(height: 8),
        Center(child: PowerButton(state: app.state, onTap: app.toggle)),
        const SizedBox(height: 8),
        Center(child: Text(statusText, style: display(20, statusColor))),
        const SizedBox(height: 6),
        Center(
          child: Text(
            app.connectedAt != null
                ? formatDuration(DateTime.now().difference(app.connectedAt!))
                : 'Нажмите на логотип, чтобы подключиться',
            style: app.connectedAt != null ? mono(13, c.muted) : TextStyle(color: c.muted),
          ),
        ),
        if (app.lastError != null) ...[
          const SizedBox(height: 16),
          _ErrorBanner(text: app.lastError!, onClose: app.clearError),
        ],
        const SizedBox(height: 24),
        if (pair != null)
          BCard(
            onTap: () => Navigator.of(context).push(
                MaterialPageRoute(builder: (_) => ServersScreen(app: app))),
            child: Row(children: [
              _Flag(name: pair.$2.name),
              const SizedBox(width: 12),
              Expanded(
                child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                  Text(nameWithoutFlag(pair.$2.name),
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: const TextStyle(fontWeight: FontWeight.w600, fontSize: 16)),
                  const SizedBox(height: 2),
                  Text(
                    '${app.autoSelect ? 'Авто · ' : ''}${pair.$2.subtitle}',
                    style: TextStyle(color: c.muted, fontSize: 13),
                  ),
                ]),
              ),
              PingDot(pair.$2.pingMs),
              const SizedBox(width: 6),
              Text(pingLabel(pair.$2.pingMs), style: TextStyle(color: c.muted, fontSize: 13)),
              const SizedBox(width: 4),
              Icon(Icons.chevron_right_rounded, color: c.faint),
            ]),
          ),
        if (app.isConnected && app.hasStats) ...[
          const SizedBox(height: 12),
          Row(children: [
            Expanded(child: _Stat(icon: Icons.south_rounded, label: 'Загрузка', value: formatSpeed(app.downSpeed))),
            const SizedBox(width: 12),
            Expanded(child: _Stat(icon: Icons.north_rounded, label: 'Отдача', value: formatSpeed(app.upSpeed))),
          ]),
        ],
        if (sub != null) ...[
          const SizedBox(height: 12),
          BCard(
            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Row(children: [
                Expanded(child: Eyebrow(sub.title)),
                Text(
                  sub.isUnlimited
                      ? 'Безлимит'
                      : '${formatBytes(sub.usedBytes)} из ${formatBytes(sub.totalBytes)}',
                  style: TextStyle(color: c.muted, fontSize: 13),
                ),
              ]),
              if (!sub.isUnlimited) ...[
                const SizedBox(height: 10),
                ClipRRect(
                  borderRadius: BorderRadius.circular(4),
                  child: LinearProgressIndicator(
                    value: sub.usedFraction,
                    minHeight: 6,
                    backgroundColor: c.surface2,
                    color: sub.usedFraction > 0.9 ? c.danger : c.accent,
                  ),
                ),
              ],
              const SizedBox(height: 10),
              Row(children: [
                Expanded(
                  child: Text(
                    sub.expireAt == null
                        ? 'Бессрочная подписка'
                        : _expireText(sub.expireAt!),
                    style: TextStyle(
                        color: sub.expireAt != null &&
                                sub.expireAt!.difference(DateTime.now()).inDays < 3
                            ? c.danger
                            : c.muted,
                        fontSize: 13),
                  ),
                ),
                if (sub.webPageUrl != null)
                  TextButton(
                    onPressed: () => launchUrl(Uri.parse(sub.webPageUrl!),
                        mode: LaunchMode.externalApplication),
                    child: Text('Сайт', style: TextStyle(color: c.accentFg)),
                  ),
                if (sub.supportUrl != null)
                  TextButton(
                    onPressed: () => launchUrl(Uri.parse(sub.supportUrl!),
                        mode: LaunchMode.externalApplication),
                    child: Text('Поддержка', style: TextStyle(color: c.accentFg)),
                  ),
              ]),
            ]),
          ),
        ],
      ],
    );
  }

  static String _expireText(DateTime d) {
    final days = d.difference(DateTime.now()).inDays;
    if (days < 0) return 'Подписка закончилась ${formatDate(d)}';
    return 'Подписка до ${formatDate(d)}';
  }
}

class _Flag extends StatelessWidget {
  const _Flag({required this.name});
  final String name;

  @override
  Widget build(BuildContext context) {
    final c = context.c;
    final flag = flagFromName(name);
    return Container(
      width: 40,
      height: 40,
      alignment: Alignment.center,
      decoration: BoxDecoration(color: c.accentSoft, shape: BoxShape.circle),
      child: flag != null
          ? Text(flag, style: const TextStyle(fontSize: 20))
          : Icon(Icons.public_rounded, color: c.accentFg, size: 20),
    );
  }
}

class _Stat extends StatelessWidget {
  const _Stat({required this.icon, required this.label, required this.value});
  final IconData icon;
  final String label;
  final String value;

  @override
  Widget build(BuildContext context) {
    final c = context.c;
    return BCard(
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Row(children: [
          Icon(icon, size: 14, color: c.muted),
          const SizedBox(width: 4),
          Text(label, style: TextStyle(color: c.muted, fontSize: 13)),
        ]),
        const SizedBox(height: 4),
        Text(value, style: display(16, c.fg, weight: FontWeight.w500)),
      ]),
    );
  }
}

class _Announce extends StatelessWidget {
  const _Announce({required this.text});
  final String text;

  @override
  Widget build(BuildContext context) {
    final c = context.c;
    return Container(
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: c.accentSoft,
        borderRadius: BorderRadius.circular(12),
      ),
      child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Icon(Icons.campaign_outlined, color: c.accentFg, size: 20),
        const SizedBox(width: 10),
        Expanded(child: Text(text, style: TextStyle(color: c.fg, height: 1.4))),
      ]),
    );
  }
}

class _ErrorBanner extends StatelessWidget {
  const _ErrorBanner({required this.text, required this.onClose});
  final String text;
  final VoidCallback onClose;

  @override
  Widget build(BuildContext context) {
    final c = context.c;
    return Container(
      padding: const EdgeInsets.fromLTRB(14, 10, 4, 10),
      decoration: BoxDecoration(
        color: c.danger.withValues(alpha: 0.12),
        borderRadius: BorderRadius.circular(12),
      ),
      child: Row(children: [
        Icon(Icons.error_outline_rounded, color: c.danger, size: 20),
        const SizedBox(width: 10),
        Expanded(child: Text(text, style: TextStyle(color: c.fg))),
        IconButton(
          tooltip: 'Скрыть',
          icon: Icon(Icons.close_rounded, color: c.muted, size: 18),
          onPressed: onClose,
        ),
      ]),
    );
  }
}
