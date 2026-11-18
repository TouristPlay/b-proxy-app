# B-Proxy

VPN-клиент сервиса BaobabVPN (сайт baobabproxy.com) на ядре Xray-core для Android, iOS, Windows, macOS и Linux.
Серверы и подписки приходят из панели Remnawave, перед нодами стоит балансировщик Timeweb (обход белых списков).

Владелец проекта пишет по-русски: общение, комментарии в коде, тексты интерфейса, коммиты и README — на русском.

## Состояние и направление

- `ui/` — приложение на **Tauri 2**: интерфейс React 19 + TypeScript + Tailwind CSS v4 + shadcn/ui (Radix),
  `ui/src-tauri/` — оболочка на Rust и плагин `bproxy` (ядро Xray и VPN на всех платформах).
  В приложении работает `TauriBackend`, в браузере (демо дизайна) — `DemoBackend` с тестовыми данными.
- `app/` — первая версия на Flutter, больше не собирается. Оставлена как справка.
- Дальше: подпись iOS/macOS (TestFlight), проверка VPN на устройствах → QR, kill switch,
  VPN по приложениям, разделы «Тарифы» и «Баланс» (нужен API панели/бота).

## Структура

```
ui/src/
  backend/types.ts      интерфейс Backend и типы: Snapshot, Subscription, ServerNode, Settings, Appearance
  backend/tauri.ts      TauriBackend — настоящий: подписки, пинг, VPN через плагин bproxy, хранение в localStorage
  backend/subscription.ts  разбор подписки: заголовки INCY/Happ, base64/ссылки/Xray JSON, разделители
  backend/xray.ts       конфиг Xray: TUN по платформам, маршруты провайдера, фрагментация, настройки ядра → env
  backend/demo.ts       DemoBackend — имитация для показа дизайна в браузере; там же настройки по умолчанию
  backend/index.ts      выбор бэкенда и хук useSnapshot(); #empty в адресе — экран без подписок (демо)
  lib/theme.ts          темы оформления, применение акцента/режима/размытия к <html>
  components/           PowerOrb, ServerList, SubscriptionCard, Backdrop, Toast, bits (Flag, Tags, SignalPing, Group, Row)
  components/ui/        примитивы: Button, Switch, Slider, RadioGroup, Sheet
  screens/              HomeScreen, ServersScreen, SettingsScreen, AppearanceGroup, CoreSettingsSheet,
                        AddSubscriptionSheet, DesktopLayout (компьютер, ширина ≥ 1024)
ui/src-tauri/
  src/lib.rs            приложение: плагины opener и bproxy
  plugins/bproxy/       плагин: команды invoke_core, fetch_subscription, prepare, start, stop, stats; событие состояния
    src/desktop.rs      Windows — ядро в процессе (Wintun); Linux/macOS — процесс bproxy-core через pkexec/osascript
    src/mobile.rs       мост к android/ (Kotlin: BProxyPlugin, BProxyVpnService) и ios/ (Swift: BProxyPlugin)
  apple/PacketTunnel/   расширение iOS, в нём работает ядро; добавляется в проект scripts/tauri_ios_extension.py
  resources/<платформа>/  ядро из scripts/build_core.sh (не в git)
  signing/              открытый тестовый ключ подписи APK (только для тестовых сборок)
  linux/postinst.sh     после установки deb/rpm: права на сеть ядру (VPN без пароля)
core/
  memory/memory.go      замена пакета memory в libXray: лимит памяти и сборка мусора из env BPROXY_*
  runner/main.go        bproxy-core — ядро отдельным процессом для Linux и macOS (caps_linux.go — права в ambient)
  nodep/measure.go      замена nodep/measure.go: «реальная задержка» запросом HEAD или GET (#bproxy-method= в адресе)
scripts/                build_core.sh (linux | windows | macos | android | ios), tauri_ios_extension.py
app/                    Flutter-версия (не собирается)
.github/workflows/      build.yml — демо интерфейса, Linux, Windows, macOS, Android (APK), iOS без подписи, релиз по тегу
```

## Команды

```bash
cd ui && npm install && npm run dev        # интерфейс в браузере (порт 1420)
npm run typecheck                          # проверка типов
npm run build:preview                      # один HTML-файл с демо: ui/dist-preview/index.html
```

Приложение целиком (нужны Go, Rust, Node):

```bash
./scripts/build_core.sh linux              # ядро в ui/src-tauri/resources/linux
cd ui && npx tauri icon src-tauri/app-icon.png && npx tauri dev
```

Если в облачной сессии нет сети для npm, проверка такая: пуш в `main` → GitHub Actions
(job «Интерфейс (React)») собирает демо и кладёт его в ветку `ui-preview` → `git fetch origin ui-preview` →
скриншоты через Playwright и `/usr/bin/google-chrome` → публикация артефакта
«B-Proxy — демо интерфейса» (https://claude.ai/artifact/8rMwLyWDbRBxuFViNEqh9c) с тем же slug.
Скачать артефакты Actions через `gh run download` отсюда нельзя (хранилище Azure заблокировано).

## Дизайн

Подобран по примерам владельца (INCY, Aki4Net, концепт «Аква — тёмное стекло», золотой VPN-клиент)
с правилами UI UX Pro Max и frontend-design.

- Тёмное матовое стекло (`.glass`) на ночном фоне с живыми размытыми пятнами: «в покое» холодные,
  при подключении — цвета темы. Внизу еле заметный силуэт баобаба (фирменный знак).
- Главная кнопка — `PowerOrb`: концентрические кольца, при подключении кольцо цвета акцента и волны, значок щита.
- Метки протоколов цветные: VLESS, REALITY, GRPC, TLS, XHTTP, WS, TCP, HYSTERIA2, TROJAN (`Tags`).
  Пинг — полоски сигнала + число (`SignalPing`), цвет никогда не единственный носитель смысла.
- Подписка — карточка с крупным числом оставшихся дней, полосой трафика и кнопкой «Продлить».
- Телефон: плавающее меню-«пилюля» (Главная, Серверы, Настройки). Компьютер: как Aki4Net — серверы слева,
  плитки «Время / Скорость / Сеть / Подписка».
- Шрифты: **Unbounded** (заголовки, крупные цифры, как на сайте) и **Golos Text** (текст). Подключены через @fontsource,
  без загрузки из сети. Цифры табличные (`tnum`).

### Токены и темы

- Цвета — только через токены Tailwind из `ui/src/index.css` (`bg-base`, `bg-glass`, `border-edge`, `text-ink`,
  `text-ink-2`, `text-ink-3`, `bg-panel`, `text-on-accent`, `good`, `warn`, `bad`, `tag-*`). Никаких hex в компонентах.
- Акцент называется `amber` (исторически), но это **цвет выбранной темы**: `--color-amber`, `--color-amber-2`
  (светлее), `--color-amber-deep` (темнее) выставляет `useApplyAppearance` в `lib/theme.ts`.
- Темы: Янтарь (по умолчанию), Аква, Золото, Изумруд, Графит + свой цвет акцента. Режимы: тёмный, светлый,
  как в системе (`:root[data-mode="light"]` в index.css). Фоны: горизонт, пятна, звёзды, однотонный, своё фото.
  Плюс яркость фона, размытие стекла (`--glass-blur`) и выключатель анимаций (`data-motion="off"`).
- Новая тема = новая запись в `themes` в `lib/theme.ts` (accent, idle, active, base). Больше ничего менять не нужно.

### Тексты интерфейса

- Русский, предложения с заглавной только в начале, без капса в подписях и кнопках.
- Кнопка называет действие: «Добавить подписку», «Проверить пинг», «Продлить». Без «пожалуйста», «успешно», «!».
- Ошибка говорит, что случилось и что делать: «Ссылка должна начинаться с https://».
- Пустой экран — приглашение к действию, а не «Ничего нет».

### Языки

- Интерфейс на русском и английском (`lib/i18n.ts`, словарь `lib/i18n.en.ts`). Ключ перевода — русский текст:
  `t("Подписка «{0}» обновлена", [title])`. Новую строку интерфейса оборачивайте в `t()` и добавляйте в словарь.
- Язык: «Оформление» → «Язык» (как в системе / Русский / English), выбирается при запуске; смена перезагружает интерфейс.
  Даты — через `LOCALE`, склонения — `plural()` (в английском две формы). Технический журнал (`writeLog`) не переводим.

### Доступность

- Области нажатия не меньше 44×44, видимый фокус (обводка цвета акцента), `aria-label` у кнопок-иконок.
- `prefers-reduced-motion` и выключатель анимаций в настройках отключают движение.
- Каждый экран проверять скриншотами на 390×844 (телефон) и 1440×900 (компьютер).

## Ядро и платформы

- Ядро: Xray-core через [libXray](https://github.com/XTLS/libXray) **v26.11.9** (с заменой из `core/`), единый вход `Invoke` (apiVersion 3):
  `convertShareLinksToXrayJson`, `pingBatch`, `runXray`, `stopXray`, `xrayVersion`.
- Встроенный TUN в Xray, tun2socks не нужен. На Android/iOS/macOS дескриптор туннеля передаётся через
  `env["xray.tun.fd"]` в конфиге. Адреса туннеля: 172.19.0.1/30, DNS 172.19.0.2.
- Android: `BProxyVpnService` (VpnService), само приложение исключено из туннеля.
- iOS: расширение PacketTunnel. LibXray линкуется в приложение и в расширение **напрямую**,
  Swift-плагин берёт `CGoInvoke`/`CGoFree` через `dlsym` — иначе Xcode падает с
  «Redefinition of module 'LibXray'». На iOS расширению доступно ~50 МБ памяти: лимит Go по умолчанию 30 МБ,
  меняется в «Ядро Xray» (env `BPROXY_MEMORY_LIMIT_MB`, `BPROXY_AGGRESSIVE_GC`).
- «Живая активность» iOS (16.1+): расширение-виджет `apple/LiveActivity` (добавляет `scripts/tauri_ios_extension.py`),
  управляет приложение командой плагина `live_activity` (start/update/end) при смене состояния туннеля.
  Структура `BProxyActivityAttributes` объявлена и в плагине, и в расширении — поля должны совпадать.
  Если приложение выгружено, активность обновится при следующем открытии.
- Идентификатор приложения `com.baobabproxy.bproxy`, расширения — `.PacketTunnel`, группа — `group.com.baobabproxy.bproxy`.
- Windows: libXray.dll внутри приложения + Wintun, приложение просит права администратора.
- Linux и macOS: процесс `bproxy-core` с правами на сеть. Linux из deb/rpm — без пароля: `linux/postinst.sh` делает
  `setcap cap_net_admin,cap_net_raw+ep` на `/usr/lib/B-Proxy/core/bproxy-core`, приложение видит это по xattr и
  запускает ядро прямо оттуда; ядро поднимает права в ambient, чтобы их получил `resolvectl` (собирается без cgo,
  иначе нельзя `AllThreadsSyscall`). AppImage и macOS — pkexec / osascript с паролем, копия ядра в папке данных. Он пишет `core.state` (running / error: … / stopped) и выходит, когда появляется `core.stop`.
  Счётчики трафика — по интерфейсу туннеля (`bproxy0`, `utun199`, на Windows `B-Proxy`).
- Подписка Remnawave с заголовком `v2rayNG/1.9.30` приходит как Xray JSON: у каждого сервера полный конфиг,
  у «Auto» — балансировщики и burstObservatory. Берём outbound'ы, балансировщики и правила провайдера,
  выкидывая ссылки на geosite/geoip (их баз у нас нет), и ставим свой TUN, DNS и правила сверху.
- libXray `pingBatch` принимает не больше 5 конфигов за вызов. Пинг меряется по одному провайдеру:
  TCP (команда плагина `tcp_ping`) по умолчанию, HTTP HEAD или GET — через ядро.
- Компьютер (`ui/src-tauri/src/desktop.rs`): значок в трее (открыть / выйти), крестик прячет окно в трей
  (настройка «Сворачивать в трей», команда `set_close_to_tray`), `tauri-plugin-single-instance` показывает окно
  при повторном запуске, `tauri-plugin-autostart` запускает при входе с `--minimized` (окно создаётся скрытым).
  Выход из трея — `app.exit`, плагин bproxy на `RunEvent::Exit` останавливает VPN. Для сборки на Linux нужен
  `libayatana-appindicator3-dev`.
- Уведомления — `tauri-plugin-notification`: VPN отключился, срок подписки (3 дня, 1 день, закончилась),
  90% трафика, новое объявление провайдера. Что уже показано — `b-proxy.alerts` в localStorage.
  На телефонах «VPN отключился» шлёт сама служба VPN (`BProxyVpnService.alertDisconnected`, в iOS —
  `PacketTunnelProvider.stopTunnel`), флаг `notifyDisconnect` приходит в команде `start`. Напоминания о сроке
  ставятся в расписание системы (`planExpiry`, id в `b-proxy.planned`), их показывает система при закрытом приложении.
  Пушей с сервера нет.
- В приложении и демо нет связи с конкретным VPN-сервисом: демо на вымышленном «Demo VPN», example.com.
- HWID (лимит устройств Remnawave): `plugins/bproxy/src/device.rs`. При загрузке подписки уходят `x-hwid`,
  `x-device-os`, `x-ver-os`, `x-device-model` (выключается настройкой «Отправлять HWID»). HWID — SHA-256 от
  «bproxy_hwid_» + machine-id / MachineGuid / IOPlatformUUID / ANDROID_ID / identifierForVendor (iOS хранит в Keychain),
  в виде UUID. Ответы `x-hwid-max-devices-reached`, `x-hwid-limit`, `x-hwid-not-supported` превращаются в понятные ошибки.
- Профили маршрутизации (формат Happ/INCY, например RoscomVPN): `backend/routing.ts` разбирает диплинк
  `happ://routing/onadd/<base64>` / `incy://…` / `bproxy://…`, JSON или ссылку https. Правила идут в порядке
  RouteOrder (block-proxy-direct), «через VPN» — туда же, куда правило провайдера «всё остальное».
  DNS профиля: домашний (`https+local://`) для DirectSites, удалённый — для остального. Базы geoip.dat/geosite.dat
  качает плагин (`download_geo`, `geo.rs`) в папку приложения (iOS — App Group), путь уходит в env `xray.location.asset`.
  Профиль заменяет «РФ напрямую», рекламу и DNS из настроек; исключения и локальная сеть пользователя остаются выше.
- Ссылки `bproxy://` (`tauri-plugin-deep-link`, разбор в `backend/links.ts`): `add/<url>` (или `add?url=`, `import/`, `sub/`),
  `routing/onadd/<base64>`, `connect`, `disconnect`, `toggle`. Подписку и профиль добавляем только после подтверждения
  (`LinkConfirm`). На компьютере ссылку из второго запуска передаёт `tauri-plugin-single-instance` (фича deep-link),
  Windows и Linux регистрируют схему при запуске (`register_all`).
- Подписки понимают те же заголовки, что INCY/Happ: `profile-title`, `subscription-userinfo`, `announce`,
  `support-url`, `profile-web-page-url`, `hide-url`, `sort-order`, `new-url`, `fragmentation-*`, метаданные `#key:` в теле.

## Правила работы

- Коммиты небольшие, сообщения по-русски: что поменялось и зачем.
- Перед пушем UI-кода — дождаться зелёного job «Интерфейс (React)»: он проверяет типы (`tsc --noEmit`).
- Не придумывать функции, которых нет в бэкенде: если в интерфейсе что-то только имитируется (демо), так и говорить.
- Код сайта лежит в репозитории TouristPlay/baobabproxy.com — его только читаем (цвета, шрифты, логотип).
