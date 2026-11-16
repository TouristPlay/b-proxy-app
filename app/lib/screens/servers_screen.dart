import 'package:flutter/material.dart';

import '../core/app_controller.dart';
import '../core/vpn_tunnel.dart';
import '../theme.dart';
import '../widgets/common.dart';
import 'add_subscription_screen.dart';

class ServersScreen extends StatelessWidget {
  const ServersScreen({super.key, required this.app});
  final AppController app;

  @override
  Widget build(BuildContext context) {
    final c = context.c;
    return ListenableBuilder(
      listenable: app,
      builder: (context, _) => Scaffold(
        appBar: AppBar(
          title: const Text('Серверы'),
          actions: [
            if (app.pinging)
              const Padding(
                padding: EdgeInsets.all(16),
                child: SizedBox.square(dimension: 20, child: CircularProgressIndicator(strokeWidth: 2)),
              )
            else
              IconButton(
                tooltip: app.state == TunnelState.disconnected
                    ? 'Проверить пинг'
                    : 'Пинг доступен при отключённом VPN',
                icon: Icon(Icons.speed_rounded, color: c.muted),
                onPressed: app.state == TunnelState.disconnected ? app.pingAll : null,
              ),
            IconButton(
              tooltip: 'Обновить подписки',
              icon: Icon(Icons.refresh_rounded, color: c.muted),
              onPressed: () => _refresh(context),
            ),
            const SizedBox(width: 8),
          ],
        ),
        body: Center(
          child: ConstrainedBox(
            constraints: const BoxConstraints(maxWidth: 560),
            child: RefreshIndicator(
              color: c.accent,
              onRefresh: () => _refresh(context),
              child: ListView(
                padding: const EdgeInsets.fromLTRB(20, 8, 20, 32),
                children: [
                  BCard(
                    padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 6),
                    child: Row(children: [
                      Icon(Icons.bolt_rounded, color: c.accentFg),
                      const SizedBox(width: 12),
                      const Expanded(
                        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                          Text('Авто', style: TextStyle(fontWeight: FontWeight.w600)),
                          Text('Сервер с лучшим пингом', style: TextStyle(fontSize: 13)),
                        ]),
                      ),
                      Switch(
                        value: app.autoSelect,
                        onChanged: (v) {
                          if (v) {
                            app.select(null, null);
                          } else {
                            final p = app.currentNode;
                            if (p != null) app.select(p.$1, p.$2);
                          }
                        },
                      ),
                    ]),
                  ),
                  for (final sub in app.subscriptions) ...[
                    const SizedBox(height: 24),
                    Row(children: [
                      Expanded(child: Eyebrow(sub.title)),
                      PopupMenuButton<String>(
                        tooltip: 'Действия с подпиской',
                        icon: Icon(Icons.more_horiz_rounded, color: c.muted),
                        onSelected: (v) async {
                          if (v == 'refresh') {
                            await app.refreshSubscription(sub);
                          } else if (v == 'delete') {
                            await app.removeSubscription(sub);
                          }
                        },
                        itemBuilder: (_) => const [
                          PopupMenuItem(value: 'refresh', child: Text('Обновить')),
                          PopupMenuItem(value: 'delete', child: Text('Удалить')),
                        ],
                      ),
                    ]),
                    const SizedBox(height: 8),
                    for (final node in sub.nodes) ...[
                      BCard(
                        highlighted: !app.autoSelect && app.isSelected(sub, node),
                        onTap: () {
                          app.select(sub, node);
                          Navigator.of(context).maybePop();
                        },
                        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
                        child: Row(children: [
                          SizedBox(
                            width: 28,
                            child: Text(flagFromName(node.name) ?? '🌐',
                                style: const TextStyle(fontSize: 20)),
                          ),
                          const SizedBox(width: 8),
                          Expanded(
                            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                              Text(nameWithoutFlag(node.name),
                                  maxLines: 1,
                                  overflow: TextOverflow.ellipsis,
                                  style: const TextStyle(fontWeight: FontWeight.w600)),
                              Text(node.subtitle, style: TextStyle(color: c.muted, fontSize: 13)),
                            ]),
                          ),
                          PingDot(node.pingMs),
                          const SizedBox(width: 6),
                          Text(pingLabel(node.pingMs),
                              style: TextStyle(color: c.muted, fontSize: 13)),
                        ]),
                      ),
                      const SizedBox(height: 8),
                    ],
                  ],
                  const SizedBox(height: 16),
                  OutlinedButton.icon(
                    onPressed: () => Navigator.of(context).push(MaterialPageRoute(
                        builder: (_) => AddSubscriptionScreen(app: app))),
                    icon: const Icon(Icons.add_rounded),
                    label: const Text('Добавить подписку'),
                  ),
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }

  Future<void> _refresh(BuildContext context) async {
    final messenger = ScaffoldMessenger.of(context);
    try {
      await app.refreshAll();
      messenger.showSnackBar(const SnackBar(content: Text('Подписки обновлены')));
    } catch (e) {
      messenger.showSnackBar(SnackBar(content: Text('Не удалось обновить: $e')));
    }
  }
}
