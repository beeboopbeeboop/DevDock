// swift-tools-version: 5.9
import PackageDescription

let package = Package(
    name: "DevDock",
    platforms: [.macOS(.v14)],
    targets: [
        .executableTarget(
            name: "DevDock",
            path: "Sources/DevDock"
        ),
    ]
)
