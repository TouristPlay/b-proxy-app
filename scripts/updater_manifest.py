#!/usr/bin/env python3
"""latest.json для обновления приложения (tauri-plugin-updater) из файлов релиза.

    updater_manifest.py <папка с файлами> <тег vX.Y.Z> <owner/repo> > latest.json

Берёт каждый установщик, рядом с которым лежит подпись .sig, и записывает его под ключом
{os}-{arch}-{установщик}: так deb обновляется через deb, AppImage — через AppImage.
"""
import datetime
import json
import pathlib
import sys

root, tag, repo = pathlib.Path(sys.argv[1]), sys.argv[2], sys.argv[3]
base = f"https://github.com/{repo}/releases/download/{tag}/"

# суффикс файла → ключи в manifest (первый — общий ключ платформы по умолчанию)
kinds = [
    (".AppImage", ["linux-x86_64-appimage", "linux-x86_64"]),
    (".deb", ["linux-x86_64-deb"]),
    (".rpm", ["linux-x86_64-rpm"]),
    ("-setup.exe", ["windows-x86_64-nsis", "windows-x86_64"]),
    (".msi", ["windows-x86_64-msi"]),
    (".app.tar.gz", ["darwin-aarch64-app", "darwin-x86_64-app", "darwin-aarch64", "darwin-x86_64"]),
]

platforms = {}
for sig in sorted(root.rglob("*.sig")):
    name = sig.name[: -len(".sig")]
    for suffix, keys in kinds:
        if name.endswith(suffix):
            for key in keys:
                platforms.setdefault(key, {"signature": sig.read_text().strip(), "url": base + name})
            break

if not platforms:
    sys.exit("нет файлов .sig — ключ подписи обновлений не задан в секретах")

json.dump(
    {
        "version": tag.lstrip("v"),
        "notes": f"B-Proxy {tag}",
        "pub_date": datetime.datetime.now(datetime.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "platforms": platforms,
    },
    sys.stdout,
    indent=2,
    ensure_ascii=False,
)
print()
