import Foundation

/// Input validation for server endpoints.
///
/// Ported from `src/server/security.ts`. Every validator returns either
/// `(valid: true, ...)` or `(valid: false, error: String)` to keep the
/// call sites uniform.
enum Security {

    // MARK: - Dev command allowlist

    private static let safeDevCommandPrefixes: [String] = [
        "npm run", "npm start", "npm test",
        "npx ",
        "yarn ", "yarn run", "yarn start", "yarn dev",
        "pnpm ", "pnpm run", "pnpm start", "pnpm dev",
        "bun run", "bun dev", "bun start", "bun test",
        "next ", "next dev", "next start",
        "vite", "vite dev", "vite build", "vite preview",
        "node ", "deno ", "python ", "python3 ",
        "cargo ", "go run", "swift ",
        "wrangler ", "vercel ",
        "concurrently ",
    ]

    static func validateDevCommand(_ command: String) -> (valid: Bool, error: String?) {
        let trimmed = command.trimmingCharacters(in: .whitespaces)
        if trimmed.isEmpty { return (false, "Command is required") }
        if trimmed.count > 1000 { return (false, "Command too long") }

        // Block shell injection characters
        let dangerous = CharacterSet(charactersIn: ";&|`$")
        if trimmed.rangeOfCharacter(from: dangerous) != nil {
            return (false, "Command contains unsafe characters")
        }
        // $(, >/, </
        if trimmed.contains("$(") || trimmed.contains("> /") || trimmed.contains("< /") {
            return (false, "Command contains unsafe characters")
        }

        let allowed = safeDevCommandPrefixes.contains { trimmed.hasPrefix($0) }
        if !allowed {
            return (false, "Command not in allowlist")
        }
        return (true, nil)
    }

    // MARK: - Path validation

    /// Validates a path is within one of the configured scan directories or
    /// is a known project path in the database. Prevents path traversal attacks.
    static func validateProjectPath(_ path: String) -> (valid: Bool, resolved: String, error: String?) {
        if path.isEmpty { return (false, "", "Path is required") }

        // Resolve to absolute, normalize away ../ tricks
        let nsPath = (path as NSString).standardizingPath
        let fm = FileManager.default

        // Follow symlinks
        var realPath = nsPath
        if let resolved = try? fm.destinationOfSymbolicLink(atPath: nsPath) {
            realPath = resolved
        }
        // If it doesn't exist yet, use the normalized path
        if !fm.fileExists(atPath: realPath) {
            realPath = nsPath
        }

        // Check against scan paths
        let config = ConfigStore.shared.load()
        for sp in config.scanPaths {
            let expanded = (sp as NSString).expandingTildeInPath
            if realPath.hasPrefix(expanded) {
                return (true, realPath, nil)
            }
        }

        // Check against known projects in the DB
        if let _ = try? Database.shared.pool.read({ db in
            try String.fetchOne(db, sql: "SELECT id FROM projects WHERE path = ?", arguments: [realPath])
        }) {
            return (true, realPath, nil)
        }

        return (false, realPath, "Path is outside allowed directories")
    }

    // MARK: - Git helpers

    static func validateBranchName(_ branch: String) -> Bool {
        if branch.isEmpty || branch.count > 250 { return false }
        let forbidden = CharacterSet(charactersIn: " ~^:?*[]\\$`|;&<>(){}!#'\"")
        if branch.rangeOfCharacter(from: forbidden) != nil { return false }
        if branch.hasPrefix(".") || branch.hasPrefix("-") || branch.hasPrefix("/") { return false }
        if branch.hasSuffix(".") || branch.hasSuffix("/") || branch.hasSuffix(".lock") { return false }
        if branch.contains("..") || branch.contains("@{") { return false }
        return true
    }

    static func validateGitFiles(_ files: [String]) -> (valid: Bool, error: String?) {
        if files.isEmpty { return (false, "Files array is required") }
        if files.count > 500 { return (false, "Too many files (max 500)") }
        for f in files {
            if f.contains("\0") { return (false, "Null bytes not allowed") }
            if f.hasPrefix("/") { return (false, "Absolute paths not allowed") }
        }
        return (true, nil)
    }

    static func sanitizeCommitMessage(_ message: String) -> String {
        String(message.prefix(5000))
    }

    // MARK: - Port / GitHub / PID validators

    static func validatePort(_ port: Int) -> Bool {
        port >= 1 && port <= 65535
    }

    static func validateGitHubParam(_ param: String) -> Bool {
        if param.isEmpty || param.count > 100 { return false }
        let allowed = CharacterSet.alphanumerics.union(CharacterSet(charactersIn: ".-_"))
        return param.unicodeScalars.allSatisfy { allowed.contains($0) }
    }
}
