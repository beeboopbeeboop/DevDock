import Foundation

/// Walks `config.scanPaths`, detects projects, upserts them, prunes missing ones.
///
/// Ported from `src/server/scanner/discover.ts`. Synchronous (Phase 1) — scan
/// runs on a background dispatch queue from the HTTP handler.
enum Scanner {

    /// Walk scan paths and upsert all discovered projects. Returns count scanned.
    @discardableResult
    static func runScan() -> Int {
        let config = ConfigStore.shared.load()
        let ignoreSet = Set(config.ignoreDirs)
        let signalSet = config.projectSignals
        let fm = FileManager.default
        var count = 0

        for scanPath in config.scanPaths {
            let expanded = (scanPath as NSString).expandingTildeInPath
            guard let entries = try? fm.contentsOfDirectory(atPath: expanded) else {
                NSLog("[Scanner] scan path not found: \(expanded)")
                continue
            }

            for entry in entries {
                if entry.hasPrefix(".") { continue }
                if ignoreSet.contains(entry) { continue }

                let fullPath = (expanded as NSString).appendingPathComponent(entry)
                var isDir: ObjCBool = false
                guard fm.fileExists(atPath: fullPath, isDirectory: &isDir), isDir.boolValue else { continue }

                if !isProjectDir(fullPath, signals: signalSet) { continue }

                do {
                    try scanOne(fullPath: fullPath, scanPath: expanded)
                    count += 1
                } catch {
                    NSLog("[Scanner] skipped \(fullPath): \(error.localizedDescription)")
                }
            }
        }

        // Prune projects whose paths no longer exist
        _ = (try? Queries.pruneMissing()) ?? 0

        return count
    }

    // MARK: - Private

    private static func isProjectDir(_ dir: String, signals: [String]) -> Bool {
        for signal in signals {
            let path = (dir as NSString).appendingPathComponent(signal)
            if FileManager.default.fileExists(atPath: path) {
                return true
            }
        }
        return false
    }

    private static func scanOne(fullPath: String, scanPath: String) throws {
        let detection = Detectors.detect(dir: fullPath)
        let gitInfo = Enrichers.getGitInfo(dir: fullPath)
        let lastModified = Enrichers.getLastModified(dir: fullPath)

        // Shared library presence
        let uc = ConfigStore.shared.load()
        let hasSharedLib = uc.sharedLibraries.contains { Enrichers.hasSubdir(fullPath, $0.subdir) }

        // ID collision handling: if same slug is already owned by another path, use parent-child slug
        let dirName = (fullPath as NSString).lastPathComponent
        let parentPath = (fullPath as NSString).deletingLastPathComponent
        let parentName = (parentPath as NSString).lastPathComponent
        let rawId = slugify(dirName)
        let existingPath = try Queries.existingProjectPath(forId: rawId)
        let id = (existingPath != nil && existingPath != fullPath) ? slugify("\(parentName)-\(dirName)") : rawId

        try Queries.upsertProject(.init(
            id: id,
            name: dirName,
            path: fullPath,
            type: detection.type,
            techStack: detection.techStack,
            devCommand: detection.devCommand,
            devPort: detection.devPort,
            hasGit: gitInfo.hasGit,
            gitBranch: gitInfo.gitBranch,
            gitDirty: gitInfo.gitDirty,
            gitDirtyCount: gitInfo.gitDirtyCount,
            githubRepo: gitInfo.githubRepo,
            githubUrl: gitInfo.githubUrl,
            deployTarget: detection.deployTarget,
            deployUrl: nil,
            hasSharedLib: hasSharedLib,
            lastModified: lastModified,
            description: detection.description
        ))

        // Auto-archive projects found under _Archive paths
        if scanPath.contains("_Archive") {
            try Queries.updateProjectOverride(projectId: id, input: .init(customStatus: "archived"))
        }

        // Populate project_deps from package.json if present
        let pkgPath = (fullPath as NSString).appendingPathComponent("package.json")
        if let data = try? Data(contentsOf: URL(fileURLWithPath: pkgPath)),
           let pkg = try? JSONSerialization.jsonObject(with: data) as? [String: Any] {
            var deps: [(name: String, type: String)] = []
            if let d = pkg["dependencies"] as? [String: Any] {
                for key in d.keys { deps.append((key, "dependency")) }
            }
            if let d = pkg["devDependencies"] as? [String: Any] {
                for key in d.keys { deps.append((key, "devDependency")) }
            }
            try? Queries.replaceProjectDeps(projectId: id, deps: deps)
        }
    }

    private static func slugify(_ name: String) -> String {
        let lower = name.lowercased()
        var chars: [Character] = []
        var lastWasDash = false
        for c in lower {
            if c.isLetter || c.isNumber {
                chars.append(c)
                lastWasDash = false
            } else if !lastWasDash {
                chars.append("-")
                lastWasDash = true
            }
        }
        var result = String(chars)
        while result.hasPrefix("-") { result.removeFirst() }
        while result.hasSuffix("-") { result.removeLast() }
        return result
    }
}
