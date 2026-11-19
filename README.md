# B-Proxy

VPN-клиент на ядре [Xray-core](https://github.com/XTLS/Xray-core) для Windows, Linux, Android, iOS и macOS.
Добавляете ссылку на подписку от провайдера — серверы, срок и трафик приложение подтягивает само.
Подписки в формате Remnawave, Marzban и других панелей, совместимые с Happ и INCY.

## Скачать и установить

Готовые сборки — в [релизах](https://github.com/TouristPlay/b-proxy-app/releases/latest).

| Система | Файл | Как поставить |
| --- | --- | --- |
| Windows 10/11 | `B-Proxy_…_x64-setup.exe` | Запустить установщик. Он ставит службу «B-Proxy Helper», поэтому VPN включается без окна администратора. Пока у установщика нет подписи, Windows может показать «Неизвестный издатель» → «Подробнее» → «Выполнить в любом случае». |
| Ubuntu, Debian, Mint | `B-Proxy_…_amd64.deb` | `sudo apt install ./B-Proxy_…_amd64.deb`. VPN включается без пароля. |
| Fedora, openSUSE | `B-Proxy-…x86_64.rpm` | `sudo dnf install ./B-Proxy-…x86_64.rpm`. VPN включается без пароля. |
| Другой Linux | `B-Proxy_…_amd64.AppImage` | `chmod +x` и запустить. При подключении попросит пароль администратора. |
| Android 7+ | `b-proxy-arm64.apk` (почти все телефоны), `b-proxy-arm.apk` (старые), `b-proxy-x86_64.apk` (эмуляторы) | Открыть файл на телефоне и разрешить установку из этого источника. Сборки подписаны тестовым ключом. |
| iOS | `b-proxy-ios-unsigned.ipa` | Без подписи Apple на iPhone не ставится — нужна учётная запись разработчика (TestFlight). |
| macOS | — | Пока собирается только вручную (см. «Выпуск»). |

Приложение на компьютере обновляется само: проверяет новую версию после запуска и раз в 12 часов,
ставит её по кнопке.

## Что умеет

- **Подписки.** По ссылке, QR-коду (камера телефона, картинка или вставленный снимок экрана) и ссылкой
  `bproxy://add/<ссылка>`. Срок, трафик, объявления и поддержка провайдера, автообновление по расписанию.
- **Серверы.** Пинг (TCP или настоящий запрос через сервер), автовыбор самого быстрого, избранное, переименование и
  скрытие, сортировка, проверка скорости через выбранный сервер.
- **Маршруты.** Российские сайты напрямую, блокировка рекламы, свои исключения, профили маршрутизации в формате
  Happ/INCY (например RoscomVPN) с базами geoip/geosite, свой DNS, фрагментация TLS против DPI.
- **Защита.** Kill switch — при обрыве VPN интернет закрывается, пока туннель не поднимется. VPN по приложениям —
  выбрать, какие программы идут через VPN (Android и компьютер).
- **Компьютер.** Значок в трее, автозапуск, локальный прокси SOCKS5/HTTP для других программ.
- **Телефон.** Уведомления об обрыве и сроке подписки, «Живая активность» на iOS.
- Темы оформления, светлый и тёмный режим, русский и английский язык.

## Для провайдеров

B-Proxy понимает те же заголовки подписки, что Happ и INCY:
`profile-title`, `subscription-userinfo`, `announce`, `support-url`, `profile-web-page-url`, `hide-url`,
`sort-order`, `new-url`, `profile-update-interval`, `fragmentation-*`, а также строки `#ключ: значение` в теле.
Для лимита устройств отправляет `x-hwid`, `x-device-os`, `x-ver-os`, `x-device-model`
(пользователь может выключить в «Настройках провайдеров»).

Ссылки для сайта и бота:

| Ссылка | Что делает |
| --- | --- |
| `bproxy://add/https://…` | Добавить подписку (с подтверждением) |
| `bproxy://routing/onadd/<base64>` | Добавить профиль маршрутизации |
| `bproxy://connect`, `bproxy://disconnect`, `bproxy://toggle` | Включить / выключить VPN |

## Где что лежит

```
ui/                     приложение: интерфейс React + TypeScript (src/), оболочка Tauri на Rust (src-tauri/)
  src/backend/          подписки, маршруты, сборка конфига Xray, тесты (__tests__/)
  src/screens/          экраны: главная, серверы, настройки и листы настроек
  src-tauri/plugins/bproxy/   VPN на всех платформах: Rust, Kotlin (Android), Swift (iOS)
  src-tauri/apple/      расширения iOS: туннель и «Живая активность»
core/                   наши изменения ядра libXray (Go): процесс bproxy-core, помощник, kill switch
scripts/                сборка ядра, файлы обновления, настройка проекта iOS
catalog/                формат списка «Рекомендуемые VPN» и пример
.github/workflows/      сборка всех платформ, тесты и релизы
```

Подробности для разработки — в [CLAUDE.md](CLAUDE.md).

## Собрать самому

Нужны Node 22, Rust, Go и для Linux — `libwebkit2gtk-4.1-dev libayatana-appindicator3-dev librsvg2-dev`.

```bash
./scripts/build_core.sh linux          # ядро Xray → ui/src-tauri/resources/linux
cd ui
npm install
npx tauri icon src-tauri/app-icon.png
npx tauri dev                          # приложение с горячей перезагрузкой
npx tauri build                        # установщики → src-tauri/target/release/bundle
```

Только интерфейс в браузере, на тестовых данных: `npm run dev` (http://localhost:1420).

## Тесты

```bash
cd ui && npm test                      # логика: подписки, маршруты, ссылки, конфиг Xray
../scripts/build_core.sh test          # ядро (Go) и проверка конфигов самим Xray
cd src-tauri && cargo test -p tauri-plugin-bproxy
```

На GitHub тесты идут перед каждой сборкой.

## Выпуск

Релиз выходит коммитом в `main` с сообщением `Релиз vX.Y.Z` (или тегом `vX.Y.Z`): GitHub собирает Linux, Windows,
Android и iOS, выкладывает релиз и файл обновления. macOS — вручную: Actions → «Сборка B-Proxy» →
Run workflow → «Собрать и macOS».

Настройки репозитория (Settings → Secrets and variables → Actions):

| Имя | Вид | Зачем |
| --- | --- | --- |
| `TAURI_SIGNING_PRIVATE_KEY` | секрет | Подпись обновлений. Без него релиз выходит без автообновления. |
| `SENTRY_DSN` | секрет | Сервер отчётов о сбоях (Sentry или свой GlitchTip). Без него отчёты не отправляются. |
| `CATALOG_URL` | переменная | Адрес списка «Рекомендуемые VPN» (формат — `catalog/README.md`). Без него раздела нет. |

## Благодарности

Ядро — [Xray-core](https://github.com/XTLS/Xray-core) и [libXray](https://github.com/XTLS/libXray) (MPL-2.0),
виртуальный адаптер Windows — [Wintun](https://www.wintun.net/), оболочка — [Tauri](https://tauri.app/).
