import 'dart:math' as math;

import 'package:flutter/material.dart';

import '../core/vpn_tunnel.dart';
import '../theme.dart';

/// Главная кнопка: логотип-закат с баобабом в «годичных кольцах», как на сайте.
/// Отключено — логотип приглушён, кольца неподвижны.
/// Подключение — кольца бегут по кругу.
/// Подключено — логотип светится, кольца расходятся волнами.
class PowerButton extends StatefulWidget {
  const PowerButton({super.key, required this.state, required this.onTap, this.size = 240});

  final TunnelState state;
  final VoidCallback onTap;
  final double size;

  @override
  State<PowerButton> createState() => _PowerButtonState();
}

class _PowerButtonState extends State<PowerButton> with SingleTickerProviderStateMixin {
  late final AnimationController _anim =
      AnimationController(vsync: this, duration: const Duration(seconds: 4))..repeat();

  @override
  void dispose() {
    _anim.dispose();
    super.dispose();
  }

  bool get _connected => widget.state == TunnelState.connected;
  bool get _busy =>
      widget.state == TunnelState.connecting || widget.state == TunnelState.disconnecting;

  @override
  Widget build(BuildContext context) {
    final c = context.c;
    final disc = widget.size * 0.46;
    final label = switch (widget.state) {
      TunnelState.connected => 'Отключить VPN',
      TunnelState.connecting => 'Подключаемся',
      TunnelState.disconnecting => 'Отключаемся',
      TunnelState.disconnected => 'Подключить VPN',
    };

    return Semantics(
      button: true,
      label: label,
      child: GestureDetector(
        onTap: _busy ? null : widget.onTap,
        child: SizedBox.square(
          dimension: widget.size,
          child: AnimatedBuilder(
            animation: _anim,
            builder: (context, child) => CustomPaint(
              painter: _RingsPainter(
                t: _anim.value,
                connected: _connected,
                busy: _busy,
                accent: c.accent,
                line: c.lineStrong,
              ),
              child: child,
            ),
            child: Center(
              child: AnimatedContainer(
                duration: const Duration(milliseconds: 400),
                width: disc,
                height: disc,
                decoration: BoxDecoration(
                  shape: BoxShape.circle,
                  color: c.disc,
                  boxShadow: _connected
                      ? [BoxShadow(color: c.accent.withValues(alpha: 0.45), blurRadius: 48, spreadRadius: 4)]
                      : const [],
                ),
                child: AnimatedOpacity(
                  duration: const Duration(milliseconds: 400),
                  opacity: _connected ? 1 : (_busy ? 0.8 : 0.55),
                  child: ColorFiltered(
                    colorFilter: _connected || _busy
                        ? const ColorFilter.mode(Colors.transparent, BlendMode.dst)
                        : const ColorFilter.matrix(_desaturate),
                    child: Image.asset('assets/logo_disc.png', fit: BoxFit.contain),
                  ),
                ),
              ),
            ),
          ),
        ),
      ),
    );
  }

  /// Наполовину обесцвечиваем логотип в выключенном состоянии.
  static const List<double> _desaturate = [
    0.6, 0.3, 0.1, 0, 0, //
    0.2, 0.7, 0.1, 0, 0, //
    0.2, 0.3, 0.5, 0, 0, //
    0, 0, 0, 1, 0,
  ];
}

class _RingsPainter extends CustomPainter {
  _RingsPainter({
    required this.t,
    required this.connected,
    required this.busy,
    required this.accent,
    required this.line,
  });

  final double t;
  final bool connected;
  final bool busy;
  final Color accent;
  final Color line;

  @override
  void paint(Canvas canvas, Size size) {
    final center = size.center(Offset.zero);
    final maxR = size.width / 2;
    final minR = size.width * 0.25;

    // Неподвижные «годичные кольца».
    for (var i = 0; i < 4; i++) {
      final r = minR + (maxR - minR) * (i + 1) / 4.6;
      final paint = Paint()
        ..style = PaintingStyle.stroke
        ..strokeWidth = 1
        ..color = (connected ? accent : line)
            .withValues(alpha: connected ? 0.30 - i * 0.06 : 0.9 - i * 0.18);
      canvas.drawCircle(center, r, paint);
    }

    if (connected) {
      // Расходящиеся волны, как ring-pulse на сайте.
      for (var k = 0; k < 2; k++) {
        final p = (t + k / 2) % 1.0;
        final r = minR + (maxR - minR) * p;
        final paint = Paint()
          ..style = PaintingStyle.stroke
          ..strokeWidth = 2
          ..color = accent.withValues(alpha: (1 - p) * 0.55);
        canvas.drawCircle(center, r, paint);
      }
    } else if (busy) {
      // Бегущая дуга на внешнем кольце.
      final r = minR + (maxR - minR) * 3.2 / 4.6;
      final rect = Rect.fromCircle(center: center, radius: r);
      final paint = Paint()
        ..style = PaintingStyle.stroke
        ..strokeWidth = 3
        ..strokeCap = StrokeCap.round
        ..color = accent;
      canvas.drawArc(rect, t * 4 * math.pi, math.pi * 0.6, false, paint);
    }
  }

  @override
  bool shouldRepaint(_RingsPainter old) =>
      old.t != t || old.connected != connected || old.busy != busy || old.accent != accent;
}
