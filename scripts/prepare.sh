#!/usr/bin/env bash
# Готовит Flutter-проект к сборке:
#  1. досоздаёт стандартные файлы платформ (наши файлы flutter create не трогает);
#  2. подключает libXray к Android и включает запуск от администратора на Windows.
#
# Запуск из корня репозитория: ./scripts/prepare.sh
# Сами библиотеки ядра собирает scripts/build_libxray.sh.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
APP="$ROOT/app"
cd "$APP"

flutter create \
  --org com.baobabproxy \
  --project-name b_proxy \
  --platforms android,ios,macos,windows,linux \
  .

# Тест-заглушка из шаблона ссылается на MyApp, которого у нас нет.
rm -f test/widget_test.dart

# --- Android: libXray.aar из папки app/android/app/libs ---
GRADLE="android/app/build.gradle.kts"
if [ -f "$GRADLE" ] && ! grep -q 'libXray.aar' "$GRADLE"; then
  cat >> "$GRADLE" <<'EOF'

// B-Proxy: ядро Xray (собирается scripts/build_libxray.sh)
dependencies {
    implementation(files("libs/libXray.aar"))
}
EOF
fi

# --- Windows: Wintun требует прав администратора ---
RUNNER_CMAKE="windows/runner/CMakeLists.txt"
if [ -f "$RUNNER_CMAKE" ] && ! grep -q 'MANIFESTUAC' "$RUNNER_CMAKE"; then
  cat >> "$RUNNER_CMAKE" <<'EOF'

# B-Proxy: VPN-адаптер Wintun создаётся только с правами администратора.
target_link_options(${BINARY_NAME} PRIVATE "/MANIFESTUAC:level='requireAdministrator'")
EOF
fi

# --- Название окна на Windows и Linux ---
if [ -f windows/runner/main.cpp ]; then
  sed -i.bak 's/L"b_proxy"/L"B-Proxy"/' windows/runner/main.cpp && rm -f windows/runner/main.cpp.bak
fi
if [ -f linux/runner/my_application.cc ]; then
  sed -i.bak 's/"b_proxy"/"B-Proxy"/g' linux/runner/my_application.cc && rm -f linux/runner/my_application.cc.bak
fi

flutter pub get
echo "Готово. Дальше: ./scripts/build_libxray.sh <android|windows|linux>"
