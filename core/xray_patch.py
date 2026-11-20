"""Правка Xray-core для B-Proxy: имя сайта в журнале соединений.

TUN знает только IP назначения, и журнал доступа Xray пишет его. Имя сайта
(SNI в TLS, Host в HTTP, QUIC) узнаёт sniffing — после него подставляем имя
в запись журнала. На маршрутизацию это не влияет.

    python3 core/xray_patch.py <папка Xray-core>
"""
import pathlib
import sys

# В Windows консоль и файлы по умолчанию не в UTF-8.
sys.stdout.reconfigure(encoding="utf-8")

path = pathlib.Path(sys.argv[1]) / "app" / "dispatcher" / "default.go"
src = path.read_text(encoding="utf-8")
old = "destination.Address = net.ParseAddress(domain)\n"
new = (
    old
    + "\t\t\t\tif am := log.AccessMessageFromContext(ctx); am != nil { // B-Proxy: site name in access log\n"
    + "\t\t\t\t\tam.To = destination\n"
    + "\t\t\t\t}\n"
)
count = src.count(old)
if count != 2:
    sys.exit(f"Xray-core изменился: ожидали 2 места sniffing в {path}, нашли {count}")
path.write_text(src.replace(old, new), encoding="utf-8", newline="")
print(f"Xray-core: правка журнала соединений в {path}")
