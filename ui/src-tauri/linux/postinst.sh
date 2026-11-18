#!/bin/sh
# Права на сеть для ядра: с ними B-Proxy включает VPN без пароля администратора.
# Без них (setcap не найден, файловая система без xattr) приложение спросит пароль через pkexec.
CORE=/usr/lib/B-Proxy/core/bproxy-core
if [ -f "$CORE" ]; then
  if command -v setcap >/dev/null 2>&1; then
    setcap cap_net_admin,cap_net_raw+ep "$CORE" || echo "B-Proxy: не удалось выдать права ядру, VPN будет спрашивать пароль" >&2
  else
    echo "B-Proxy: нет setcap (пакет libcap2-bin / libcap), VPN будет спрашивать пароль" >&2
  fi
fi
exit 0
