# B-Proxy

VPN-клиент BaobabVPN на ядре [Xray-core](https://github.com/XTLS/Xray-core).
Один код интерфейса на Flutter для Android, Windows, Linux, а позже iOS и macOS.
Оформление взято с сайта [baobabproxy.com](https://baobabproxy.com): тёмная «ночная саванна»,
янтарный закат, кольца вокруг логотипа с баобабом.

## Что умеет

- Добавление подписки Remnawave по ссылке. Приложение понимает те же заголовки подписки,
  что INCY, Happ и другие клиенты: `profile-title`, `subscription-userinfo` (трафик и срок),
  `announce`, `support-url`, `profile-web-page-url`, `hide-url`, `sort-order`, `new-url`
  и `fragmentation-*`. Метаданные можно передать и строками в теле: `#profile-title: …`.
  Поэтому одна подписка из панели одинаково работает в B-Proxy и в этих клиентах.
- Протоколы, которые понимает Xray: VLESS (Reality, XHTTP, WS, gRPC), VMess, Trojan,
  Shadowsocks, Hysteria2.
- Весь трафик устройства через VPN (режим TUN).
- Автовыбор сервера по пингу или ручной выбор.
- Российские сайты напрямую, фрагментация TLS против DPI, блокировка рекламы, выбор DNS.
- Тёмная и светлая тема.

## Как устроено

```
app/lib/
  core/xray_bridge.dart        вызовы libXray (Invoke, apiVersion 3)
  core/xray_bridge_ffi.dart    то же через FFI для Windows и Linux
  core/config_builder.dart     сборка конфига Xray с TUN и маршрутами
  core/vpn_tunnel.dart         запуск и остановка VPN на каждой платформе
  core/app_controller.dart     состояние приложения
  services/                    подписки и хранение настроек
  screens/, widgets/           интерфейс
app/android/.../BProxyVpnService.kt   VpnService: TUN → дескриптор в Xray
app/android/.../MainActivity.kt       каналы между Flutter и Android
scripts/prepare.sh             досоздаёт файлы платформ и подключает ядро
scripts/build_libxray.sh       собирает libXray нужной версии
.github/workflows/build.yml    автосборка APK, Windows и Linux
```

Ядро — [libXray](https://github.com/XTLS/libXray), официальная обёртка Xray-core для приложений.
У Xray есть встроенный TUN, поэтому отдельный tun2socks не нужен:

- **Android.** `VpnService` создаёт туннель, его дескриптор уходит в Xray через `env["xray.tun.fd"]`.
  Само приложение исключено из туннеля, поэтому соединения ядра идут напрямую.
- **Windows.** Ядро работает внутри приложения через `libXray.dll`, адаптер создаёт Wintun.
  Нужны права администратора, их приложение запрашивает при запуске.
- **Linux.** Ядро запускается отдельным процессом через `pkexec`. При подключении система
  спросит пароль.

## Где взять сборки

Каждый пуш в `main` собирает приложение в GitHub Actions. Откройте вкладку **Actions**,
выберите последнюю сборку и скачайте внизу файлы `b-proxy-android`, `b-proxy-windows`
или `b-proxy-linux`.

Чтобы выпустить версию с файлами на странице **Releases**, поставьте тег:

```bash
git tag v0.1.0 && git push origin v0.1.0
```

Для Android ставьте файл `app-arm64-v8a-release.apk`: он подходит почти всем современным телефонам.

## Сборка у себя

Нужны Flutter (stable), Go, Python 3, git. Для Android также Android SDK и NDK.

```bash
./scripts/prepare.sh
./scripts/build_libxray.sh android    # или windows / linux
cd app && flutter run
```

На Windows после `flutter build windows` положите `app/windows/deps/*.dll` рядом с `b_proxy.exe`.
На Linux скопируйте `app/linux/deps/libXray.so` и `xray` в `bundle/lib/`.

## Дальше по плану

1. iOS и macOS: Network Extension. Нужен аккаунт Apple Developer.
2. Импорт подписки по QR-коду и по ссылке `bproxy://import/…` с сайта и из бота.
3. Kill switch: блокировать интернет, если VPN упал.
4. Раздельный VPN по приложениям на Android.
5. Иконка в трее на Windows и Linux.
6. Шрифты в составе приложения, чтобы не грузить их из Google Fonts.
7. Подпись релизных сборок: свой ключ для Android и сертификат для Windows.
