#!/usr/bin/env python3
"""Добавляет в проект iOS от Tauri (gen/apple/project.yml) всё, что нужно VPN:

- расширение PacketTunnel (ui/src-tauri/apple/PacketTunnel), в нём работает ядро;
- ядро LibXray.xcframework в приложение (разбор ссылок, пинг) и в расширение;
- права Network Extension и общую группу приложений.

Запуск после `tauri ios init`, затем `xcodegen generate` в gen/apple.
С флагом --unsigned отключает подпись (сборка в CI без аккаунта Apple).
Повторный запуск ничего не ломает.
"""
import sys
from pathlib import Path

import yaml

ROOT = Path(__file__).resolve().parent.parent
GEN = ROOT / "ui/src-tauri/gen/apple"
PROJECT = GEN / "project.yml"

BUNDLE_ID = "com.baobabproxy.bproxy"
GROUP = f"group.{BUNDLE_ID}"
IOS_VERSION = "15.0"
XCFRAMEWORK = "../../resources/ios/LibXray.xcframework"
EXTENSION_DIR = "../../apple/PacketTunnel"
# Не дают компоновщику выбросить C-интерфейс ядра: плагин находит его через dlsym.
LINKER_FLAGS = ["$(inherited)", "-lresolv", "-Wl,-u,_CGoInvoke", "-Wl,-u,_CGoFree"]
VPN_ENTITLEMENTS = {
    "com.apple.developer.networking.networkextension": ["packet-tunnel-provider"],
    "com.apple.security.application-groups": [GROUP],
}


def add_dependency(target: dict, dep: dict) -> None:
    deps = target.setdefault("dependencies", [])
    if dep not in deps:
        deps.append(dep)


def main() -> int:
    if not PROJECT.exists():
        print(f"Нет {PROJECT}: сначала выполните `npx tauri ios init`", file=sys.stderr)
        return 1
    project = yaml.safe_load(PROJECT.read_text())
    targets = project["targets"]

    app_name = next(
        (name for name, t in targets.items() if t.get("type") == "application"), None
    )
    if app_name is None:
        print("В project.yml не найдено приложение", file=sys.stderr)
        return 1
    app = targets[app_name]

    # --- Приложение ---
    add_dependency(app, {"framework": XCFRAMEWORK, "embed": False})
    add_dependency(app, {"sdk": "NetworkExtension.framework"})
    add_dependency(app, {"target": "PacketTunnel", "embed": True, "codeSign": True})
    base = app.setdefault("settings", {}).setdefault("base", {})
    base["OTHER_LDFLAGS"] = LINKER_FLAGS
    entitlements = app.setdefault("entitlements", {"path": f"{app_name}/{app_name}.entitlements"})
    entitlements.setdefault("properties", {}).update(VPN_ENTITLEMENTS)

    # --- Расширение PacketTunnel ---
    archs = base.get("ARCHS", ["arm64"])
    targets["PacketTunnel"] = {
        "type": "app-extension",
        "platform": "iOS",
        "deploymentTarget": IOS_VERSION,
        "sources": [{"path": EXTENSION_DIR, "excludes": ["*.entitlements"]}],
        "info": {"path": f"{EXTENSION_DIR}/Info.plist"},
        "entitlements": {
            "path": f"{EXTENSION_DIR}/PacketTunnel.entitlements",
            "properties": VPN_ENTITLEMENTS,
        },
        "settings": {
            "base": {
                "PRODUCT_NAME": "PacketTunnel",
                "PRODUCT_BUNDLE_IDENTIFIER": f"{BUNDLE_ID}.PacketTunnel",
                "INFOPLIST_FILE": f"{EXTENSION_DIR}/Info.plist",
                "SWIFT_VERSION": "5.0",
                "ARCHS": archs,
                "ENABLE_BITCODE": False,
                "SKIP_INSTALL": True,
                "OTHER_LDFLAGS": ["$(inherited)", "-lresolv"],
                "MARKETING_VERSION": base.get("MARKETING_VERSION", "$(MARKETING_VERSION)"),
                "CURRENT_PROJECT_VERSION": base.get(
                    "CURRENT_PROJECT_VERSION", "$(CURRENT_PROJECT_VERSION)"
                ),
            }
        },
        "dependencies": [
            {"framework": XCFRAMEWORK, "embed": False},
            {"sdk": "NetworkExtension.framework"},
        ],
    }

    if "--unsigned" in sys.argv:
        for target in (app, targets["PacketTunnel"]):
            target_base = target.setdefault("settings", {}).setdefault("base", {})
            target_base.update(
                {
                    "CODE_SIGNING_ALLOWED": "NO",
                    "CODE_SIGNING_REQUIRED": "NO",
                    "CODE_SIGN_IDENTITY": "",
                }
            )

    PROJECT.write_text(yaml.safe_dump(project, sort_keys=False, allow_unicode=True))
    print(f"PacketTunnel добавлен в {PROJECT.relative_to(ROOT)} (приложение {app_name})")
    return 0


if __name__ == "__main__":
    sys.exit(main())
