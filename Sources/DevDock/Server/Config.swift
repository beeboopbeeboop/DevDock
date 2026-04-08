import Foundation

/// User-editable DevDock configuration.
///
/// Ported from `src/server/userConfig.ts`. Reads `~/.devdock/config.json`,
/// writing a default if missing.
struct DevDockConfig: Codable {
    var scanPaths: [String]
    var ignoreDirs: [String]
    var port: Int
    var host: String
    var sharedLibraries: [SharedLibrary]
    var projectSignals: [String]
    var autoScanInterval: Int

    struct SharedLibrary: Codable {
        var name: String
        var masterPath: String
        var subdir: String
        var compareSubdir: String?
    }

    static let `default` = DevDockConfig(
        scanPaths: [
            NSString("~/Documents").expandingTildeInPath,
            NSString("~/Projects").expandingTildeInPath,
        ],
        ignoreDirs: [
            "node_modules", ".git", ".next", "dist", "build", ".cache",
            ".claude", ".vscode", "__pycache__", "coverage",
        ],
        port: 3070,
        host: "localhost",
        sharedLibraries: [],
        projectSignals: [
            "package.json", "Cargo.toml", "go.mod", "pyproject.toml",
            "CSXS", "manifest.xml", "index.html", "Package.swift",
            "wrangler.toml", "vercel.json", ".git",
        ],
        autoScanInterval: 0
    )
}

/// Singleton reader/writer for `~/.devdock/config.json`.
///
/// Thread-safe via `DispatchQueue`. Phase 1 only reads; Phase 5+ will add write.
final class ConfigStore {
    static let shared = ConfigStore()

    private let queue = DispatchQueue(label: "devdock.config", attributes: .concurrent)
    private var cached: DevDockConfig?

    private var configDir: URL {
        FileManager.default.homeDirectoryForCurrentUser.appendingPathComponent(".devdock", isDirectory: true)
    }

    private var configFile: URL {
        configDir.appendingPathComponent("config.json")
    }

    var configPath: String { configFile.path }

    func load() -> DevDockConfig {
        if let cached = queue.sync(execute: { self.cached }) {
            return cached
        }

        let fm = FileManager.default
        if fm.fileExists(atPath: configFile.path),
           let data = try? Data(contentsOf: configFile),
           let parsed = try? JSONDecoder().decode(DevDockConfig.self, from: data) {
            // Merge with defaults so new fields are always present
            var merged = DevDockConfig.default
            merged.scanPaths = parsed.scanPaths
            merged.ignoreDirs = parsed.ignoreDirs
            merged.port = parsed.port
            merged.host = parsed.host
            merged.sharedLibraries = parsed.sharedLibraries
            merged.projectSignals = parsed.projectSignals
            merged.autoScanInterval = parsed.autoScanInterval
            queue.async(flags: .barrier) { self.cached = merged }
            return merged
        }

        // First run — write defaults
        let defaults = DevDockConfig.default
        try? fm.createDirectory(at: configDir, withIntermediateDirectories: true)
        if let data = try? JSONEncoder.pretty.encode(defaults) {
            try? data.write(to: configFile, options: .atomic)
        }
        queue.async(flags: .barrier) { self.cached = defaults }
        return defaults
    }

    func reload() -> DevDockConfig {
        queue.async(flags: .barrier) { self.cached = nil }
        return load()
    }
}

private extension JSONEncoder {
    static var pretty: JSONEncoder {
        let e = JSONEncoder()
        e.outputFormatting = [.prettyPrinted, .sortedKeys]
        return e
    }
}
