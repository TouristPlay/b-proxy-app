# B-Proxy

VPN-клиент сервиса BaobabVPN (сайт baobabproxy.com) на ядре Xray-core для Android, iOS, Windows, macOS и Linux.
Серверы и подписки приходят из панели Remnawave, перед нодами стоит балансировщик Timeweb (обход белых списков).

Владелец проекта пишет по-русски: общение, комментарии в коде, тексты интерфейса, коммиты и README — на русском.

## Состояние и направление

- `ui/` — **новый интерфейс**: React 19 + TypeScript + Tailwind CSS v4 + компоненты в стиле shadcn/ui (Radix).
  Станет фронтендом приложения на **Tauri 2**. Сейчас работает на демо-бэкенде с тестовыми данными.
- `app/` — первая версия на Flutter. Рабочая (Android, Windows, Linux собираются), но интерфейс заменяется на `ui/`.
  Нативные части оттуда переедут в Tauri: Kotlin `VpnService`, Swift Network Extension, вызовы libXray.
- План: утвердить дизайн по демо → оболочка Tauri 2 → логика подписок и конфига Xray на TypeScript →
  настраиваемый лимит памяти в libXray → подпись iOS/macOS → QR, диплинки `bproxy://`, kill switch, VPN по приложениям, трей,
  разделы «Тарифы» и «Баланс» (нужен API панели/бота).

## Структура

```
ui/src/
  backend/types.ts      интерфейс Backend и типы: Snapshot, Subscription, ServerNode, Settings, Appearance
  backend/demo.ts       DemoBackend — имитация ядра и VPN для показа дизайна
  backend/index.ts      выбор бэкенда и хук useSnapshot(); #empty в адресе — экран без подписок
  lib/theme.ts          темы оформления, применение акцента/режима/размытия к <html>
  components/           PowerOrb, ServerList, SubscriptionCard, Backdrop, Toast, bits (Flag, Tags, SignalPing, Group, Row)
  components/ui/        примитивы: Button, Switch, Slider, RadioGroup, Sheet
  screens/              HomeScreen, ServersScreen, SettingsScreen, AppearanceGroup, CoreSettingsSheet,
                        AddSubscriptionSheet, DesktopLayout (компьютер, ширина ≥ 1024)
app/                    Flutter-версия; app/packages/b_proxy_apple — плагин iOS/macOS; app/apple/PacketTunnel — расширение
scripts/                prepare.sh, build_libxray.sh (android | windows | linux | apple), apple_extension.rb
.github/workflows/      build.yml — демо интерфейса, APK, Windows, Linux, iOS/macOS без подписи, релиз по тегу
```

## Команды

```bash
cd ui && npm install && npm run dev        # интерфейс в браузере (порт 1420)
npm run typecheck                          # проверка типов
npm run build:preview                      # один HTML-файл с демо: ui/dist-preview/index.html
```

В облачной сессии Claude npm-пакеты не ставятся (нет сети). Тогда проверка такая: пуш в `main` → GitHub Actions
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

### Доступность

- Области нажатия не меньше 44×44, видимый фокус (обводка цвета акцента), `aria-label` у кнопок-иконок.
- `prefers-reduced-motion` и выключатель анимаций в настройках отключают движение.
- Каждый экран проверять скриншотами на 390×844 (телефон) и 1440×900 (компьютер).

## Ядро и платформы

- Ядро: Xray-core через [libXray](https://github.com/XTLS/libXray) **v26.11.9**, единый вход `Invoke` (apiVersion 3):
  `convertShareLinksToXrayJson`, `pingBatch`, `runXray`, `stopXray`, `xrayVersion`.
- Встроенный TUN в Xray, tun2socks не нужен. На Android/iOS/macOS дескриптор туннеля передаётся через
  `env["xray.tun.fd"]` в конфиге. Адреса туннеля: 172.19.0.1/30, DNS 172.19.0.2.
- Android: `BProxyVpnService` (VpnService), само приложение исключено из туннеля.
- iOS/macOS: расширение PacketTunnel. LibXray линкуется в приложение и в расширение **напрямую**,
  плагин `b_proxy_apple` берёт `CGoInvoke`/`CGoFree` через `dlsym` — иначе Xcode падает с
  «Redefinition of module 'LibXray'». На iOS расширению доступно ~50 МБ памяти: лимит Go по умолчанию 30 МБ.
- Windows: libXray.dll внутри приложения + Wintun, приложение просит права администратора.
- Linux: процесс `xray` запускается через `pkexec`, остановка через файл-флаг.
- Подписки понимают те же заголовки, что INCY/Happ: `profile-title`, `subscription-userinfo`, `announce`,
  `support-url`, `profile-web-page-url`, `hide-url`, `sort-order`, `new-url`, `fragmentation-*`, метаданные `#key:` в теле.

## Правила работы

- Коммиты небольшие, сообщения по-русски: что поменялось и зачем.
- Перед пушем UI-кода — дождаться зелёного job «Интерфейс (React)»: он проверяет типы (`tsc --noEmit`).
- Не придумывать функции, которых нет в бэкенде: если в интерфейсе что-то только имитируется (демо), так и говорить.
- Код сайта лежит в репозитории TouristPlay/baobabproxy.com — его только читаем (цвета, шрифты, логотип).
