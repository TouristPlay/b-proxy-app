import 'dart:convert';

import 'package:shared_preferences/shared_preferences.dart';

import '../core/config_builder.dart';
import '../models/subscription.dart';

/// Локальное хранение подписок и настроек.
class Storage {
  static const _subsKey = 'subscriptions.v1';
  static const _selectedKey = 'selected.v1';
  static const _settingsKey = 'settings.v1';
  static const _themeKey = 'theme.v1';

  Future<SharedPreferences> get _prefs => SharedPreferences.getInstance();

  Future<List<Subscription>> loadSubscriptions() async {
    final raw = (await _prefs).getStringList(_subsKey) ?? const [];
    final result = <Subscription>[];
    for (final s in raw) {
      try {
        result.add(Subscription.decode(s));
      } catch (_) {
        // Повреждённую запись пропускаем.
      }
    }
    return result;
  }

  Future<void> saveSubscriptions(List<Subscription> subs) async =>
      (await _prefs).setStringList(_subsKey, [for (final s in subs) s.encode()]);

  /// Выбранный сервер: "<url подписки>|<id сервера>" или null для «Авто».
  Future<String?> loadSelected() async => (await _prefs).getString(_selectedKey);

  Future<void> saveSelected(String? value) async {
    final p = await _prefs;
    if (value == null) {
      await p.remove(_selectedKey);
    } else {
      await p.setString(_selectedKey, value);
    }
  }

  Future<ConnectionSettings> loadSettings() async {
    final raw = (await _prefs).getString(_settingsKey);
    if (raw == null) return const ConnectionSettings();
    try {
      return ConnectionSettings.fromJson(jsonDecode(raw) as Map<String, dynamic>);
    } catch (_) {
      return const ConnectionSettings();
    }
  }

  Future<void> saveSettings(ConnectionSettings s) async =>
      (await _prefs).setString(_settingsKey, jsonEncode(s.toJson()));

  /// 'system' | 'dark' | 'light'
  Future<String> loadTheme() async =>
      (await _prefs).getString(_themeKey) ?? 'system';

  Future<void> saveTheme(String mode) async =>
      (await _prefs).setString(_themeKey, mode);
}
