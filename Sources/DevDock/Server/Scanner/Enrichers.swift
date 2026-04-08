import Foundation

/// Enrichment data pulled from the filesystem — git info, mtime, shared-lib check.
///
/// Ported from `src/server/scanner/enrichers.ts`.
enum Enrichers {

    struct GitInfo {
        var hasGit: Bool = false
        var gitBranch: String? = nil
        var gitDirty: Bool = false
        var gitDirtyCount: Int = 0
        var githubRepo: String? = nil
        var githubUrl: String? = nil
    }

    static func getGitInfo(dir: String) -> GitInfo {
        var info = GitInfo()

        let branch = runCmd(["git", "rev-parse", "--abbrev-ref", "HEAD"], cwd: dir)
        guard !branch.isEmpty else { return info }
        info.hasGit = true
        info.gitBranch = branch

        let status = runCmd(["git", "status", "--porcelain"], cwd: dir)
        if !status.isEmpty {
            let lines = status.split(separator: "\n").filter { !$0.isEmpty }
            info.gitDirty = !lines.isEmpty
            info.gitDirtyCount = lines.count
        }

        let remote = runCmd(["git", "remote", "get-url", "origin"], cwd: dir)
        if !remote.isEmpty {
            if let repo = parseGithubRepo(from: remote) {
                info.githubRepo = repo
                info.githubUrl = "https://github.com/\(repo)"
            }
        }

        return info
    }

    static func getLastModified(dir: String) -> String {
        let fm = FileManager.default
        guard let attrs = try? fm.attributesOfItem(atPath: dir),
              let mtime = attrs[.modificationDate] as? Date
        else {
            return ISO8601DateFormatter().string(from: Date())
        }
        return ISO8601DateFormatter().string(from: mtime)
    }

    static func hasSubdir(_ dir: String, _ name: String) -> Bool {
        var isDir: ObjCBool = false
        let path = (dir as NSString).appendingPathComponent(name)
        return FileManager.default.fileExists(atPath: path, isDirectory: &isDir) && isDir.boolValue
    }

    // MARK: - Private

    /// Run a command in `cwd`, return trimmed stdout. Empty string on failure.
    private static func runCmd(_ args: [String], cwd: String) -> String {
        guard let exe = args.first else { return "" }
        let process = Process()
        process.currentDirectoryURL = URL(fileURLWithPath: cwd)
        // Resolve full path via /usr/bin/env so we don't hardcode /opt/homebrew vs /usr/bin
        process.executableURL = URL(fileURLWithPath: "/usr/bin/env")
        process.arguments = args
        _ = exe

        let out = Pipe()
        let err = Pipe()
        process.standardOutput = out
        process.standardError = err

        do {
            try process.run()
            process.waitUntilExit()
        } catch {
            return ""
        }

        guard process.terminationStatus == 0 else { return "" }
        let data = out.fileHandleForReading.readDataToEndOfFile()
        return String(data: data, encoding: .utf8)?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
    }

    /// Parse `github.com/owner/repo` from https or ssh URLs.
    private static func parseGithubRepo(from url: String) -> String? {
        // https://github.com/owner/repo.git
        // git@github.com:owner/repo.git
        let patterns = [
            #"github\.com/([^/]+/[^/.]+)"#,
            #"github\.com:([^/]+/[^/.]+)"#,
        ]
        for pattern in patterns {
            if let re = try? NSRegularExpression(pattern: pattern),
               let match = re.firstMatch(in: url, range: NSRange(url.startIndex..., in: url)),
               let range = Range(match.range(at: 1), in: url) {
                var repo = String(url[range])
                if repo.hasSuffix(".git") { repo = String(repo.dropLast(4)) }
                return repo
            }
        }
        return nil
    }
}
