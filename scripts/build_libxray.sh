#!/usr/bin/env bash
# Собирает ядро libXray (обёртка над Xray-core) и кладёт его в проект.
#
#   ./scripts/build_libxray.sh android   -> app/android/app/libs/libXray.aar
#   ./scripts/build_libxray.sh windows   -> app/windows/deps/{libXray.dll,wintun.dll}
#   ./scripts/build_libxray.sh linux     -> app/linux/deps/{libXray.so,xray}
#   ./scripts/build_libxray.sh apple     -> app/packages/b_proxy_apple/darwin/LibXray.xcframework
#
# Нужны git, go и python3; для Android ещё Android SDK/NDK (ANDROID_NDK_HOME),
# для Windows и Linux — gcc, для apple — macOS с Xcode.
set -euo pipefail

TARGET="${1:?Укажите платформу: android | windows | linux | apple}"
LIBXRAY_VERSION="${LIBXRAY_VERSION:-v26.11.9}"
WINTUN_VERSION="${WINTUN_VERSION:-0.14.1}"
PYTHON="${PYTHON:-python3}"

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
WORK="$ROOT/.build"
SRC="$WORK/libXray-$LIBXRAY_VERSION"
mkdir -p "$WORK"

if [ ! -d "$SRC/.git" ]; then
  git clone --depth 1 --branch "$LIBXRAY_VERSION" https://github.com/XTLS/libXray "$SRC"
fi

cd "$SRC"
if [ "$TARGET" = "apple" ]; then
  # Статические библиотеки с C-интерфейсом (CGoInvoke) для iOS, симулятора и macOS.
  "$PYTHON" build/main.py apple go
else
  "$PYTHON" build/main.py "$TARGET"
fi

case "$TARGET" in
  android)
    mkdir -p "$ROOT/app/android/app/libs"
    cp libXray.aar "$ROOT/app/android/app/libs/libXray.aar"
    ;;
  windows)
    DEST="$ROOT/app/windows/deps"
    mkdir -p "$DEST"
    cp windows_dll/libXray.dll "$DEST/"
    # Драйвер виртуального адаптера. Подписанная DLL от авторов WireGuard.
    curl -fsSL -o "$WORK/wintun.zip" "https://www.wintun.net/builds/wintun-$WINTUN_VERSION.zip"
    rm -rf "$WORK/wintun" && mkdir -p "$WORK/wintun"
    (cd "$WORK/wintun" && unzip -q ../wintun.zip)
    cp "$WORK/wintun/wintun/bin/amd64/wintun.dll" "$DEST/"
    ;;
  linux)
    DEST="$ROOT/app/linux/deps"
    mkdir -p "$DEST"
    cp linux_so/libXray.so "$DEST/"
    cp bin/xray "$DEST/xray"
    chmod +x "$DEST/xray"
    ;;
  apple)
    DEST="$ROOT/app/packages/b_proxy_apple/darwin"
    rm -rf "$DEST/LibXray.xcframework"
    cp -R LibXray.xcframework "$DEST/"
    ;;
  *)
    echo "Неизвестная платформа: $TARGET" >&2
    exit 1
    ;;
esac

echo "libXray $LIBXRAY_VERSION для $TARGET готов."
