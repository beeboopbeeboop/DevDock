// swift-tools-version: 5.9
import PackageDescription

let package = Package(
    name: "DevDockMenuBar",
    platforms: [.macOS(.v14)],
    targets: [
        .executableTarget(
            name: "DevDockMenuBar",
            path: "DevDockMenu"
        ),
    ]
)
