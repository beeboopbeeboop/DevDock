// swift-tools-version: 5.9
import PackageDescription

let package = Package(
    name: "DevDock",
    platforms: [.macOS(.v14)],
    dependencies: [
        .package(url: "https://github.com/httpswift/swifter.git", from: "1.5.0"),
        .package(url: "https://github.com/groue/GRDB.swift.git", from: "6.29.0"),
    ],
    targets: [
        .executableTarget(
            name: "DevDock",
            dependencies: [
                .product(name: "Swifter", package: "swifter"),
                .product(name: "GRDB", package: "GRDB.swift"),
            ],
            path: "Sources/DevDock"
        ),
    ]
)
