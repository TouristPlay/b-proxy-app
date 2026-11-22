#!/usr/bin/env python3
"""Добавляет в проект iOS от Tauri (gen/apple/project.yml) всё, что нужно VPN:

- расширение PacketTunnel (ui/src-tauri/apple/PacketTunnel), в нём работает ядро;
- ядро LibXray.xcframework в приложение (разбор ссылок, пинг) и в расширение;
- права Network Extension и общую группу приложений;
- расширение LiveActivity (ui/src-tauri/apple/LiveActivity) — «Живая активность» на iOS 16.1+,
  виджет на рабочем столе и кнопка в Пункте управления;
- общий код apple/Shared — в приложение и в расширение виджетов (намерение «Включить/выключить VPN»
  выполняется в процессе приложения, поэтому Apple требует его в обоих таргетах).

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
ACTIVITY_DIR = "../../apple/LiveActivity"
SHARED_DIR = "../../apple/Shared"
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
    add_dependency(app, {"target": "LiveActivity", "embed": True, "codeSign": True})
    add_dependency(app, {"sdk": "WidgetKit.framework"})
    sources = app.setdefault("sources", [])
    if isinstance(sources, str):
        sources = app["sources"] = [sources]
    if not any((x.get("path") if isinstance(x, dict) else x) == SHARED_DIR for x in sources):
        sources.append({"path": SHARED_DIR})
    # «Живая активность»: без этого ключа iOS не даст приложению её показать.
    # Камера — для подписки по QR-коду.
    app_keys = {
        "NSSupportsLiveActivities": True,
        "NSCameraUsageDescription": "Камера нужна, чтобы отсканировать QR-код подписки",
    }
    info = app.setdefault("info", {})
    info.setdefault("properties", {}).update(app_keys)
    plist_path = info.get("path")
    if plist_path and (GEN / plist_path).exists():
        import plistlib

        data = plistlib.loads((GEN / plist_path).read_bytes())
        data.update(app_keys)
        (GEN / plist_path).write_bytes(plistlib.dumps(data))
    base = app.setdefault("settings", {}).setdefault("base", {})
    base["OTHER_LDFLAGS"] = LINKER_FLAGS
    base.setdefault("SWIFT_VERSION", "5.0")
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
            {"sdk": "WidgetKit.framework"},
        ],
    }

    # --- Расширение LiveActivity (виджет «Живой активности») ---
    targets["LiveActivity"] = {
        "type": "app-extension",
        "platform": "iOS",
        "deploymentTarget": "16.1",
        "sources": [{"path": ACTIVITY_DIR, "excludes": ["*.entitlements"]}, {"path": SHARED_DIR}],
        "info": {"path": f"{ACTIVITY_DIR}/Info.plist"},
        # Общие настройки группы приложений: состояние VPN для виджета.
        "entitlements": {
            "path": f"{ACTIVITY_DIR}/LiveActivity.entitlements",
            "properties": {"com.apple.security.application-groups": [GROUP]},
        },
        "settings": {
            "base": {
                "PRODUCT_NAME": "LiveActivity",
                "PRODUCT_BUNDLE_IDENTIFIER": f"{BUNDLE_ID}.LiveActivity",
                "INFOPLIST_FILE": f"{ACTIVITY_DIR}/Info.plist",
                "SWIFT_VERSION": "5.0",
                "ARCHS": archs,
                "SKIP_INSTALL": True,
                "MARKETING_VERSION": base.get("MARKETING_VERSION", "$(MARKETING_VERSION)"),
                "CURRENT_PROJECT_VERSION": base.get(
                    "CURRENT_PROJECT_VERSION", "$(CURRENT_PROJECT_VERSION)"
                ),
            }
        },
        "dependencies": [
            {"sdk": "WidgetKit.framework"},
            {"sdk": "SwiftUI.framework"},
            {"sdk": "ActivityKit.framework"},
            {"sdk": "AppIntents.framework"},
            {"sdk": "NetworkExtension.framework"},
        ],
    }

    if "--unsigned" in sys.argv:
        for target in (app, targets["PacketTunnel"], targets["LiveActivity"]):
            target_base = target.setdefault("settings", {}).setdefault("base", {})
            target_base.update(
                {
                    "CODE_SIGNING_ALLOWED": "NO",
                    "CODE_SIGNING_REQUIRED": "NO",
                    "CODE_SIGN_IDENTITY": "",
                }
            )

    PROJECT.write_text(yaml.safe_dump(project, sort_keys=False, allow_unicode=True))
    print(f"PacketTunnel и LiveActivity добавлены в {PROJECT.relative_to(ROOT)} (приложение {app_name})")
    return 0


if __name__ == "__main__":
    sys.exit(main())
