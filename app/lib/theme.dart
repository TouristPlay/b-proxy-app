import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';

/// Цвета сайта baobabproxy.com: «ночная саванна» — тёмный зеленоватый фон,
/// янтарный акцент заката, зелёный листовой цвет для статуса «онлайн».
@immutable
class BaobabColors extends ThemeExtension<BaobabColors> {
  const BaobabColors({
    required this.bg,
    required this.bgAlt,
    required this.surface,
    required this.surface2,
    required this.line,
    required this.lineStrong,
    required this.fg,
    required this.muted,
    required this.faint,
    required this.accent,
    required this.accentFg,
    required this.accentSoft,
    required this.onAccent,
    required this.leaf,
    required this.danger,
    required this.disc,
  });

  final Color bg, bgAlt, surface, surface2, line, lineStrong;
  final Color fg, muted, faint;
  final Color accent, accentFg, accentSoft, onAccent;
  final Color leaf, danger, disc;

  static const dark = BaobabColors(
    bg: Color(0xFF0D1210),
    bgAlt: Color(0xFF111815),
    surface: Color(0xFF161E1A),
    surface2: Color(0xFF1D2722),
    line: Color(0x1AD6E8DC),
    lineStrong: Color(0x33D6E8DC),
    fg: Color(0xFFEDF0EA),
    muted: Color(0xFF9BA79F),
    faint: Color(0xFF6D7A72),
    accent: Color(0xFFF0A23B),
    accentFg: Color(0xFFF5B55C),
    accentSoft: Color(0x1FF0A23B),
    onAccent: Color(0xFF1B1205),
    leaf: Color(0xFF8CC489),
    danger: Color(0xFFEF7B6B),
    disc: Color(0xFF0A0F0D),
  );

  static const light = BaobabColors(
    bg: Color(0xFFF1F3EE),
    bgAlt: Color(0xFFE8ECE5),
    surface: Color(0xFFFFFFFF),
    surface2: Color(0xFFF4F6F2),
    line: Color(0x1A14221A),
    lineStrong: Color(0x3314221A),
    fg: Color(0xFF131A16),
    muted: Color(0xFF56625B),
    faint: Color(0xFF7B867F),
    accent: Color(0xFFE8932A),
    accentFg: Color(0xFFA3560A),
    accentSoft: Color(0x24E8932A),
    onAccent: Color(0xFF1B1205),
    leaf: Color(0xFF2F8A3A),
    danger: Color(0xFFC43D2B),
    disc: Color(0xFF0A0F0D),
  );

  @override
  BaobabColors copyWith() => this;

  @override
  BaobabColors lerp(BaobabColors? other, double t) =>
      t < 0.5 ? this : (other ?? this);
}

extension BaobabContext on BuildContext {
  BaobabColors get c => Theme.of(this).extension<BaobabColors>()!;
}

/// Шрифты сайта: Unbounded для заголовков, Golos Text для текста,
/// JetBrains Mono для мелких подписей капсом (как .eyebrow на сайте).
TextStyle display(double size, Color color, {FontWeight weight = FontWeight.w600}) =>
    GoogleFonts.getFont('Unbounded',
        fontSize: size, color: color, fontWeight: weight, letterSpacing: -0.3);

TextStyle mono(double size, Color color) => GoogleFonts.getFont('JetBrains Mono',
    fontSize: size, color: color, letterSpacing: 1.2, fontWeight: FontWeight.w500);

ThemeData buildTheme(Brightness brightness) {
  final c = brightness == Brightness.dark ? BaobabColors.dark : BaobabColors.light;
  final base = ThemeData(
    brightness: brightness,
    useMaterial3: true,
    scaffoldBackgroundColor: c.bg,
    colorScheme: ColorScheme.fromSeed(
      seedColor: c.accent,
      brightness: brightness,
      primary: c.accent,
      onPrimary: c.onAccent,
      surface: c.surface,
      onSurface: c.fg,
      error: c.danger,
    ),
    extensions: [c],
  );
  final text = GoogleFonts.getTextTheme('Golos Text', base.textTheme)
      .apply(bodyColor: c.fg, displayColor: c.fg);

  return base.copyWith(
    textTheme: text,
    appBarTheme: AppBarTheme(
      backgroundColor: c.bg,
      foregroundColor: c.fg,
      elevation: 0,
      scrolledUnderElevation: 0,
      centerTitle: false,
      titleTextStyle: display(18, c.fg),
    ),
    dividerTheme: DividerThemeData(color: c.line, thickness: 1, space: 1),
    filledButtonTheme: FilledButtonThemeData(
      style: FilledButton.styleFrom(
        backgroundColor: c.accent,
        foregroundColor: c.onAccent,
        textStyle: const TextStyle(fontWeight: FontWeight.w600, fontSize: 16),
        padding: const EdgeInsets.symmetric(horizontal: 26, vertical: 16),
        shape: const StadiumBorder(),
      ),
    ),
    outlinedButtonTheme: OutlinedButtonThemeData(
      style: OutlinedButton.styleFrom(
        foregroundColor: c.fg,
        side: BorderSide(color: c.lineStrong),
        padding: const EdgeInsets.symmetric(horizontal: 22, vertical: 14),
        shape: const StadiumBorder(),
      ),
    ),
    inputDecorationTheme: InputDecorationTheme(
      filled: true,
      fillColor: c.surface2,
      hintStyle: TextStyle(color: c.faint),
      contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
      border: OutlineInputBorder(
          borderRadius: BorderRadius.circular(12),
          borderSide: BorderSide(color: c.line)),
      enabledBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(12),
          borderSide: BorderSide(color: c.line)),
      focusedBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(12),
          borderSide: BorderSide(color: c.accent, width: 1.5)),
    ),
    switchTheme: SwitchThemeData(
      thumbColor: WidgetStateProperty.resolveWith(
          (s) => s.contains(WidgetState.selected) ? c.onAccent : c.muted),
      trackColor: WidgetStateProperty.resolveWith(
          (s) => s.contains(WidgetState.selected) ? c.accent : c.surface2),
      trackOutlineColor: WidgetStateProperty.all(c.line),
    ),
    snackBarTheme: SnackBarThemeData(
      backgroundColor: c.surface2,
      contentTextStyle: TextStyle(color: c.fg),
      behavior: SnackBarBehavior.floating,
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
    ),
  );
}
