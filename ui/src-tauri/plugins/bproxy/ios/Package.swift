// swift-tools-version:5.5
import PackageDescription

let package = Package(
    name: "tauri-plugin-bproxy",
    platforms: [
        .macOS(.v10_13),
        .iOS(.v15),
    ],
    products: [
        .library(name: "tauri-plugin-bproxy", type: .static, targets: ["tauri-plugin-bproxy"]),
    ],
    dependencies: [
        .package(name: "Tauri", path: "../.tauri/tauri-api"),
    ],
    targets: [
        .target(
            name: "tauri-plugin-bproxy",
            dependencies: [.byName(name: "Tauri")],
            path: "Sources"
        ),
    ]
)
