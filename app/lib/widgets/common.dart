import 'package:flutter/material.dart';

import '../theme.dart';

String formatBytes(int bytes) {
  const units = ['Б', 'КБ', 'МБ', 'ГБ', 'ТБ'];
  var v = bytes.toDouble();
  var i = 0;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i++;
  }
  final s = v >= 100 || i == 0 ? v.toStringAsFixed(0) : v.toStringAsFixed(1);
  return '$s ${units[i]}';
}

String formatSpeed(int bytesPerSec) => '${formatBytes(bytesPerSec)}/с';

String formatDuration(Duration d) {
  String two(int n) => n.toString().padLeft(2, '0');
  return '${two(d.inHours)}:${two(d.inMinutes % 60)}:${two(d.inSeconds % 60)}';
}

const _months = [
  'января', 'февраля', 'марта', 'апреля', 'мая', 'июня',
  'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря',
];

String formatDate(DateTime d) => '${d.day} ${_months[d.month - 1]} ${d.year}';

/// Карточка в стиле сайта: поверхность, тонкая рамка, скругление 18.
class BCard extends StatelessWidget {
  const BCard({super.key, required this.child, this.onTap, this.padding, this.highlighted = false});

  final Widget child;
  final VoidCallback? onTap;
  final EdgeInsetsGeometry? padding;
  final bool highlighted;

  @override
  Widget build(BuildContext context) {
    final c = context.c;
    return Material(
      color: c.surface,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(18),
        side: BorderSide(color: highlighted ? c.accent : c.line, width: highlighted ? 1.5 : 1),
      ),
      clipBehavior: Clip.antiAlias,
      child: InkWell(
        onTap: onTap,
        child: Padding(padding: padding ?? const EdgeInsets.all(16), child: child),
      ),
    );
  }
}

/// Мелкая подпись капсом моноширинным шрифтом, как .eyebrow на сайте.
class Eyebrow extends StatelessWidget {
  const Eyebrow(this.text, {super.key, this.color});
  final String text;
  final Color? color;

  @override
  Widget build(BuildContext context) =>
      Text(text.toUpperCase(), style: mono(11, color ?? context.c.accentFg));
}

/// Точка-индикатор пинга: зелёная — быстро, янтарная — средне, красная — нет связи.
class PingDot extends StatelessWidget {
  const PingDot(this.ms, {super.key});
  final int? ms;

  @override
  Widget build(BuildContext context) {
    final c = context.c;
    final color = ms == null
        ? c.faint
        : ms! < 0
            ? c.danger
            : ms! < 150
                ? c.leaf
                : c.accent;
    return Container(
      width: 8,
      height: 8,
      decoration: BoxDecoration(color: color, shape: BoxShape.circle),
    );
  }
}

String pingLabel(int? ms) => ms == null ? '—' : (ms < 0 ? 'нет связи' : '$ms мс');

/// Флаг по первому слову названия сервера, если там есть эмодзи-флаг
/// или двухбуквенный код страны.
String? flagFromName(String name) {
  final runes = name.runes.toList();
  if (runes.length >= 2 &&
      runes[0] >= 0x1F1E6 && runes[0] <= 0x1F1FF &&
      runes[1] >= 0x1F1E6 && runes[1] <= 0x1F1FF) {
    return String.fromCharCodes(runes.take(2));
  }
  return null;
}

/// Название без ведущего эмодзи-флага.
String nameWithoutFlag(String name) =>
    flagFromName(name) == null ? name : String.fromCharCodes(name.runes.skip(2)).trim();
