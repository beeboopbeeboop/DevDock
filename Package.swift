// swift-tools-version: 5.9
import PackageDescription

let package = Package(
    name: "DevDock",
    platforms: [.macOS(.v14)],
    dependencies: [
        .package(url: "https://github.com/httpswift/swifter.git", from: "1.5.0"),
    ],
    targets: [
        .executableTarget(
            name: "DevDock",
            dependencies: [
                .product(name: "Swifter", package: "swifter"),
            ],
            path: "Sources/DevDock"
        ),
    ]
)
