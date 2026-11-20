#!/usr/bin/env bash
# Собирает ядро (libXray + Xray-core) для приложения на Tauri и кладёт его
# в ui/src-tauri/resources/<платформа>/.
#
#   ./scripts/build_core.sh linux     -> libXray.so, bproxy-core
#   ./scripts/build_core.sh windows   -> libXray.dll, wintun.dll
#   ./scripts/build_core.sh macos     -> libXray.dylib, bproxy-core (arm64 + x86_64)
#   ./scripts/build_core.sh android   -> libXray.aar (gomobile, нужен ANDROID_NDK_HOME)
#   ./scripts/build_core.sh ios       -> LibXray.xcframework (C-интерфейс CGoInvoke)
#   ./scripts/build_core.sh test      -> тесты bproxy-core и проверка конфигов из ui/.test-configs ядром Xray
#
# Перед сборкой в libXray подкладываются наши файлы из core/:
#   core/memory/memory.go — настраиваемый лимит памяти вместо жёстких 30 МБ на iOS;
#   core/runner/main.go   — процесс bproxy-core для Linux и macOS;
#   core/nodep/measure.go — пинг «реальной задержкой» запросом HEAD или GET.
# И одна правка в самом Xray-core (копия в .build/Xray-core, core/xray_patch.py):
#   в журнале соединений — имя сайта из sniffing (TLS SNI, HTTP Host), а не только IP из TUN.
set -euo pipefail

TARGET="${1:?Укажите платформу: linux | windows | macos | android | ios | test}"
LIBXRAY_VERSION="${LIBXRAY_VERSION:-v26.11.9}"
WINTUN_VERSION="${WINTUN_VERSION:-0.14.1}"
PYTHON="${PYTHON:-python3}"

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
WORK="$ROOT/.build"
SRC="$WORK/libXray-$LIBXRAY_VERSION"
DEST="$ROOT/ui/src-tauri/resources/$TARGET"
mkdir -p "$WORK"
[ "$TARGET" = test ] || mkdir -p "$DEST"

if [ ! -d "$SRC/.git" ]; then
  git clone --depth 1 --branch "$LIBXRAY_VERSION" https://github.com/XTLS/libXray "$SRC"
fi

# --- Наши изменения в libXray ---
rm -f "$SRC"/memory/*.go
cp "$ROOT/core/memory/memory.go" "$SRC/memory/memory.go"
cp "$ROOT/core/nodep/measure.go" "$SRC/nodep/measure.go"
mkdir -p "$SRC/bproxy_core"
rm -f "$SRC"/bproxy_core/*.go
cp "$ROOT"/core/runner/*.go "$SRC/bproxy_core/"

# --- Наша правка в Xray-core: та же версия, что требует libXray, копией рядом ---
XRAY_MOD=github.com/xtls/xray-core
XRAY_VERSION="$(cd "$SRC" && awk -v m="$XRAY_MOD" '$1 == m && $2 ~ /^v/ { print $2; exit }' go.mod)"
XRAY_DIR="$WORK/Xray-core"
if [ ! -f "$XRAY_DIR/.bproxy-$XRAY_VERSION" ]; then
  XRAY_CACHE="$(cd "$SRC" && go mod download -json "$XRAY_MOD@$XRAY_VERSION" | "$PYTHON" -c 'import json,sys; print(json.load(sys.stdin)["Dir"])')"
  rm -rf "$XRAY_DIR"
  cp -R "$XRAY_CACHE" "$XRAY_DIR"
  chmod -R u+w "$XRAY_DIR"
  "$PYTHON" "$ROOT/core/xray_patch.py" "$XRAY_DIR"
  touch "$XRAY_DIR/.bproxy-$XRAY_VERSION"
fi
(cd "$SRC" && go mod edit "-replace=$XRAY_MOD=../Xray-core")

cd "$SRC"
export CGO_ENABLED=1
LDFLAGS="-s -w -buildid="

case "$TARGET" in
  test)
    BPROXY_TEST_CONFIGS="${BPROXY_TEST_CONFIGS:-$ROOT/ui/.test-configs}" CGO_ENABLED=0 go test -count=1 ./bproxy_core
    exit 0
    ;;
  linux)
    go build -trimpath -ldflags "$LDFLAGS" -buildmode=c-shared -o "$DEST/libXray.so" ./cgo_bridge
    # Без cgo: права (capabilities) меняются во всех потоках только так.
    CGO_ENABLED=0 go build -trimpath -ldflags "$LDFLAGS" -o "$DEST/bproxy-core" ./bproxy_core
    rm -f "$DEST/libXray.h"
    chmod 755 "$DEST/bproxy-core"
    ;;
  windows)
    go build -trimpath -ldflags "$LDFLAGS" -buildmode=c-shared -o "$DEST/libXray.dll" ./cgo_bridge
    rm -f "$DEST/libXray.h"
    # Помощник-служба (VPN без UAC) и запасной запуск ядра с правами администратора.
    CGO_ENABLED=0 GOOS=windows GOARCH=amd64 go build -trimpath -ldflags "$LDFLAGS" -o "$DEST/bproxy-core.exe" ./bproxy_core
    # Драйвер виртуального адаптера — подписанная DLL от авторов WireGuard.
    curl -fsSL -o "$WORK/wintun.zip" "https://www.wintun.net/builds/wintun-$WINTUN_VERSION.zip"
    rm -rf "$WORK/wintun" && mkdir -p "$WORK/wintun"
    (cd "$WORK/wintun" && unzip -q ../wintun.zip)
    cp "$WORK/wintun/wintun/bin/amd64/wintun.dll" "$DEST/"
    ;;
  macos)
    export MACOSX_DEPLOYMENT_TARGET=13.0
    for arch in arm64 amd64; do
      clang_arch=$([ "$arch" = amd64 ] && echo x86_64 || echo arm64)
      export CC="clang -arch $clang_arch"
      GOOS=darwin GOARCH=$arch go build -trimpath -ldflags "$LDFLAGS" -buildmode=c-shared \
        -o "$WORK/libXray-$arch.dylib" ./cgo_bridge
      GOOS=darwin GOARCH=$arch go build -trimpath -ldflags "$LDFLAGS" \
        -o "$WORK/bproxy-core-$arch" ./bproxy_core
    done
    lipo -create "$WORK/libXray-arm64.dylib" "$WORK/libXray-amd64.dylib" -output "$DEST/libXray.dylib"
    install_name_tool -id "@rpath/libXray.dylib" "$DEST/libXray.dylib"
    lipo -create "$WORK/bproxy-core-arm64" "$WORK/bproxy-core-amd64" -output "$DEST/bproxy-core"
    chmod 755 "$DEST/bproxy-core"
    ;;
  android)
    "$PYTHON" build/main.py android local
    cp libXray.aar "$DEST/libXray.aar"
    # Классы для компиляции плагина (сама библиотека подключается в приложении).
    rm -rf "$WORK/aar" && mkdir -p "$WORK/aar"
    (cd "$WORK/aar" && unzip -q -o "$DEST/libXray.aar" classes.jar)
    cp "$WORK/aar/classes.jar" "$DEST/libXray-classes.jar"
    ;;
  ios)
    # Статические библиотеки с C-интерфейсом для iOS и симулятора.
    "$PYTHON" build/main.py apple go local
    rm -rf "$DEST/LibXray.xcframework"
    cp -R LibXray.xcframework "$DEST/"
    ;;
  *)
    echo "Неизвестная платформа: $TARGET" >&2
    exit 1
    ;;
esac

echo "Ядро libXray $LIBXRAY_VERSION для $TARGET лежит в ${DEST#$ROOT/}."
