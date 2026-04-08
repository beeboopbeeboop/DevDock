import Foundation
import GRDB

enum Queries {

    struct ProjectResponse: Codable {
        let id: String
        let name: String
        let path: String
        let type: String
        let status: String
        let priority: Int?
        let tags: [String]
        let description: String?
        let techStack: [String]
        let devCommand: String?
        let detectedDevCommand: String?
        let devPort: Int?
        let hasGit: Bool
        let gitBranch: String?
        let gitDirty: Bool
        let gitDirtyCount: Int
        let githubRepo: String?
        let githubUrl: String?
        let deployTarget: String
        let deployUrl: String?
        let hasSharedLib: Bool
        let lastModified: String
        let lastScanned: String
        let isFavorite: Bool
        let aliases: [String]
    }

    struct ProjectFilters {
        var search: String?
        var type: String?
        var status: String?
        var tag: String?
        var sort: String?
    }

    struct ProjectLookup: Codable {
        let id: String
        let name: String
        let path: String
        let type: String
        let devCommand: String?
        let devPort: Int?
        let deployTarget: String
        let deployUrl: String?
        let aliases: [String]
    }

    struct Snapshot: Codable {
        let id: Int
        let capturedAt: String
        let totalProjects: Int
        let dirtyRepos: Int
        let totalDirtyFiles: Int
        let totalDependencies: Int
        let typeBreakdown: [String: Int]
        let statusBreakdown: [String: Int]
    }

    struct StartupProfileRecord: Codable {
        let id: String
        let name: String
        let projectIds: [String]
        let createdAt: String
    }

    struct AliasRecord: Codable {
        let alias: String
        let projectId: String
        let projectName: String
    }

    struct CommandLogEntry: Codable {
        let id: Int
        let projectId: String?
        let projectName: String?
        let verb: String
        let args: String?
        let source: String
        let status: String
        let message: String?
        let durationMs: Int?
        let createdAt: String
    }

    struct ActiveProjectScore: Codable {
        let projectId: String
        let projectName: String
        let score: Double
        let lastSignal: String
        let lastActivity: Int64
    }

    struct TimelineEntry: Codable {
        let timestamp: Int64
        let type: String
        let projectId: String
        let projectName: String
        let summary: String
    }

    struct OverrideInput {
        var customName: String? = nil
        var customStatus: String? = nil
        var customTags: [String]? = nil
        var customDevCommand: String?? = nil
        var customDevPort: Int? = nil
        var clearCustomDevPort = false
        var customDeployUrl: String? = nil
        var notes: String? = nil
    }

    struct CommandLogFilters {
        var projectId: String?
        var verb: String?
        var limit = 50
        var since: String?
    }

    private static let signalWeights: [String: Double] = [
        "git_commit": 5,
        "server_start": 3,
        "server_stop": 2,
        "palette_use": 2,
        "verb_exec": 3,
        "file_change": 1,
    ]

    private static func parseJSONArray(_ string: String?) -> [String] {
        guard let string,
              let data = string.data(using: .utf8),
              let result = try? JSONDecoder().decode([String].self, from: data) else {
            return []
        }
        return result
    }

    private static func parseJSONDictionary(_ string: String?) -> [String: Int] {
        guard let string,
              let data = string.data(using: .utf8),
              let result = try? JSONDecoder().decode([String: Int].self, from: data) else {
            return [:]
        }
        return result
    }

    private static func jsonString<T: Encodable>(_ value: T) -> String {
        guard let data = try? JSONEncoder().encode(value),
              let string = String(data: data, encoding: .utf8) else {
            return "{}"
        }
        return string
    }

    private static func mergeTags(base: String?, override: String?) -> [String] {
        let baseValues = parseJSONArray(base)
        guard let override else { return baseValues }
        let overrideValues = parseJSONArray(override)
        var seen = Set<String>()
        var merged: [String] = []
        for value in baseValues + overrideValues where seen.insert(value).inserted {
            merged.append(value)
        }
        return merged
    }

    private static func rowToProject(_ row: Row) -> ProjectResponse {
        let customName: String? = row["custom_name"]
        let customStatus: String? = row["custom_status"]
        let customTags: String? = row["custom_tags"]
        let customDevPort: Int? = row["custom_dev_port"]
        let customDeployUrl: String? = row["custom_deploy_url"]
        let customDevCommand: String? = row["custom_dev_command"]
        let aliases: String? = row["aliases"]
        let favoriteValue: Int? = row["is_favorite"]

        let name: String = row["name"]
        let status: String = row["status"]
        let deployTarget: String = row["deploy_target"] ?? "none"
        let lastModified: String = row["last_modified"] ?? ""
        let lastScanned: String = row["last_scanned"] ?? ""

        return ProjectResponse(
            id: row["id"],
            name: customName?.isEmpty == false ? customName! : name,
            path: row["path"],
            type: row["type"],
            status: customStatus?.isEmpty == false ? customStatus! : status,
            priority: row["priority"],
            tags: mergeTags(base: row["tags"], override: customTags),
            description: row["description"],
            techStack: parseJSONArray(row["tech_stack"]),
            devCommand: customDevCommand?.isEmpty == false ? customDevCommand : (row["dev_command"] as String?),
            detectedDevCommand: row["dev_command"],
            devPort: customDevPort ?? (row["dev_port"] as Int?),
            hasGit: (row["has_git"] as Int? ?? 0) != 0,
            gitBranch: row["git_branch"],
            gitDirty: (row["git_dirty"] as Int? ?? 0) != 0,
            gitDirtyCount: row["git_dirty_count"] ?? 0,
            githubRepo: row["github_repo"],
            githubUrl: row["github_url"],
            deployTarget: deployTarget,
            deployUrl: customDeployUrl?.isEmpty == false ? customDeployUrl : (row["deploy_url"] as String?),
            hasSharedLib: (row["has_hanlan_core"] as Int? ?? 0) != 0,
            lastModified: lastModified,
            lastScanned: lastScanned,
            isFavorite: (favoriteValue ?? 0) != 0,
            aliases: parseJSONArray(aliases)
        )
    }

    private static func rowToProjectLookup(_ row: Row) -> ProjectLookup {
        ProjectLookup(
            id: row["id"],
            name: row["name"],
            path: row["path"],
            type: row["type"],
            devCommand: row["dev_command"],
            devPort: row["dev_port"],
            deployTarget: row["deploy_target"] ?? "none",
            deployUrl: row["deploy_url"],
            aliases: parseJSONArray(row["aliases"])
        )
    }

    static func getProjects(filters: ProjectFilters = ProjectFilters()) throws -> [ProjectResponse] {
        try Database.shared.pool.read { db in
            var sql = """
                SELECT p.*, o.custom_name, o.custom_status, o.custom_tags,
                       o.custom_dev_port, o.custom_deploy_url, o.custom_dev_command,
                       o.notes, o.is_favorite, o.sort_order, o.aliases
                FROM projects p
                LEFT JOIN user_overrides o ON p.id = o.project_id
                WHERE 1=1
                """
            var arguments: [DatabaseValueConvertible] = []

            if let search = filters.search, !search.isEmpty {
                sql += " AND (p.name LIKE ? OR p.path LIKE ? OR p.description LIKE ?)"
                let term = "%\(search)%"
                arguments += [term, term, term]
            }
            if let type = filters.type, !type.isEmpty {
                sql += " AND p.type = ?"
                arguments.append(type)
            }
            if let status = filters.status, !status.isEmpty {
                sql += " AND COALESCE(o.custom_status, p.status) = ?"
                arguments.append(status)
            }
            if let tag = filters.tag, !tag.isEmpty {
                sql += " AND (p.tags LIKE ? OR o.custom_tags LIKE ?)"
                let term = "%\"\(tag)\"%"
                arguments += [term, term]
            }

            let sortSQL: String
            switch filters.sort ?? "priority" {
            case "name":
                sortSQL = "COALESCE(o.is_favorite, 0) DESC, p.name ASC"
            case "lastModified":
                sortSQL = "COALESCE(o.is_favorite, 0) DESC, p.last_modified DESC"
            case "type":
                sortSQL = "COALESCE(o.is_favorite, 0) DESC, p.type ASC, p.name ASC"
            case "custom":
                sortSQL = "COALESCE(o.sort_order, 9999) ASC, p.name ASC"
            default:
                sortSQL = "COALESCE(o.is_favorite, 0) DESC, COALESCE(o.sort_order, p.priority, 9999) ASC, p.name ASC"
            }
            sql += " ORDER BY \(sortSQL)"

            let rows = try Row.fetchAll(db, sql: sql, arguments: StatementArguments(arguments))
            return rows.map(rowToProject)
        }
    }

    static func getProject(id: String) throws -> ProjectResponse? {
        try Database.shared.pool.read { db in
            let row = try Row.fetchOne(db, sql: """
                SELECT p.*, o.custom_name, o.custom_status, o.custom_tags,
                       o.custom_dev_port, o.custom_deploy_url, o.custom_dev_command,
                       o.notes, o.is_favorite, o.sort_order, o.aliases
                FROM projects p
                LEFT JOIN user_overrides o ON p.id = o.project_id
                WHERE p.id = ?
                """, arguments: [id])
            return row.map(rowToProject)
        }
    }

    static func getProjectLookup(id: String) throws -> ProjectLookup? {
        try Database.shared.pool.read { db in
            let row = try Row.fetchOne(db, sql: """
                SELECT p.id, COALESCE(o.custom_name, p.name) AS name, p.path, p.type,
                       COALESCE(o.custom_dev_command, p.dev_command) AS dev_command,
                       COALESCE(o.custom_dev_port, p.dev_port) AS dev_port,
                       p.deploy_target, COALESCE(o.custom_deploy_url, p.deploy_url) AS deploy_url,
                       o.aliases
                FROM projects p
                LEFT JOIN user_overrides o ON p.id = o.project_id
                WHERE p.id = ?
                """, arguments: [id])
            return row.map(rowToProjectLookup)
        }
    }

    static func getProjectByPath(_ path: String) throws -> ProjectLookup? {
        try Database.shared.pool.read { db in
            let row = try Row.fetchOne(db, sql: """
                SELECT p.id, COALESCE(o.custom_name, p.name) AS name, p.path, p.type,
                       COALESCE(o.custom_dev_command, p.dev_command) AS dev_command,
                       COALESCE(o.custom_dev_port, p.dev_port) AS dev_port,
                       p.deploy_target, COALESCE(o.custom_deploy_url, p.deploy_url) AS deploy_url,
                       o.aliases
                FROM projects p
                LEFT JOIN user_overrides o ON p.id = o.project_id
                WHERE p.path = ?
                """, arguments: [path])
            return row.map(rowToProjectLookup)
        }
    }

    static func getProjectPaths() throws -> [String] {
        try Database.shared.pool.read { db in
            try String.fetchAll(db, sql: "SELECT path FROM projects")
        }
    }

    struct UpsertInput {
        var id: String
        var name: String
        var path: String
        var type: String
        var techStack: [String]
        var devCommand: String?
        var devPort: Int?
        var hasGit: Bool
        var gitBranch: String?
        var gitDirty: Bool
        var gitDirtyCount: Int
        var githubRepo: String?
        var githubUrl: String?
        var deployTarget: String
        var deployUrl: String?
        var hasSharedLib: Bool
        var lastModified: String?
        var description: String?
    }

    static func upsertProject(_ input: UpsertInput) throws {
        try Database.shared.pool.write { db in
            try db.execute(sql: """
                INSERT INTO projects (
                    id, name, path, type, tech_stack, dev_command, dev_port,
                    has_git, git_branch, git_dirty, git_dirty_count,
                    github_repo, github_url, deploy_target, deploy_url,
                    has_hanlan_core, last_modified, last_scanned, description
                )
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), ?)
                ON CONFLICT(path) DO UPDATE SET
                    name = excluded.name,
                    type = excluded.type,
                    tech_stack = excluded.tech_stack,
                    dev_command = excluded.dev_command,
                    dev_port = excluded.dev_port,
                    has_git = excluded.has_git,
                    git_branch = excluded.git_branch,
                    git_dirty = excluded.git_dirty,
                    git_dirty_count = excluded.git_dirty_count,
                    github_repo = excluded.github_repo,
                    github_url = excluded.github_url,
                    deploy_target = excluded.deploy_target,
                    deploy_url = excluded.deploy_url,
                    has_hanlan_core = excluded.has_hanlan_core,
                    last_modified = excluded.last_modified,
                    last_scanned = datetime('now'),
                    description = COALESCE(excluded.description, projects.description)
                """, arguments: [
                    input.id, input.name, input.path, input.type, jsonString(input.techStack),
                    input.devCommand, input.devPort,
                    input.hasGit ? 1 : 0, input.gitBranch, input.gitDirty ? 1 : 0, input.gitDirtyCount,
                    input.githubRepo, input.githubUrl, input.deployTarget, input.deployUrl,
                    input.hasSharedLib ? 1 : 0, input.lastModified, input.description,
                ])
        }
    }

    static func existingProjectPath(forId id: String) throws -> String? {
        try Database.shared.pool.read { db in
            try String.fetchOne(db, sql: "SELECT path FROM projects WHERE id = ?", arguments: [id])
        }
    }

    static func pruneMissing() throws -> Int {
        try Database.shared.pool.write { db in
            let rows = try Row.fetchAll(db, sql: "SELECT id, path FROM projects")
            var removed = 0
            for row in rows {
                let path: String = row["path"]
                guard !FileManager.default.fileExists(atPath: path) else { continue }
                let id: String = row["id"]
                try db.execute(sql: "DELETE FROM projects WHERE id = ?", arguments: [id])
                try db.execute(sql: "DELETE FROM user_overrides WHERE project_id = ?", arguments: [id])
                try db.execute(sql: "DELETE FROM project_deps WHERE project_id = ?", arguments: [id])
                removed += 1
            }
            return removed
        }
    }

    static func replaceProjectDeps(projectId: String, deps: [(name: String, type: String)]) throws {
        try Database.shared.pool.write { db in
            try db.execute(sql: "DELETE FROM project_deps WHERE project_id = ?", arguments: [projectId])
            for dep in deps {
                try db.execute(
                    sql: "INSERT OR IGNORE INTO project_deps (project_id, dep_name, dep_type) VALUES (?, ?, ?)",
                    arguments: [projectId, dep.name, dep.type]
                )
            }
        }
    }

    static func updateProjectOverride(projectId: String, input: OverrideInput) throws {
        try Database.shared.pool.write { db in
            try db.execute(
                sql: "INSERT OR IGNORE INTO user_overrides (project_id) VALUES (?)",
                arguments: [projectId]
            )

            if let value = input.customName {
                try db.execute(sql: "UPDATE user_overrides SET custom_name = ? WHERE project_id = ?", arguments: [value, projectId])
            }
            if let value = input.customStatus {
                try db.execute(sql: "UPDATE user_overrides SET custom_status = ? WHERE project_id = ?", arguments: [value, projectId])
            }
            if let tags = input.customTags {
                try db.execute(sql: "UPDATE user_overrides SET custom_tags = ? WHERE project_id = ?", arguments: [jsonString(tags), projectId])
            }
            if let wrapped = input.customDevCommand {
                let value: String? = wrapped
                try db.execute(sql: "UPDATE user_overrides SET custom_dev_command = ? WHERE project_id = ?", arguments: [value, projectId])
            }
            if input.clearCustomDevPort {
                try db.execute(sql: "UPDATE user_overrides SET custom_dev_port = NULL WHERE project_id = ?", arguments: [projectId])
            } else if let value = input.customDevPort {
                try db.execute(sql: "UPDATE user_overrides SET custom_dev_port = ? WHERE project_id = ?", arguments: [value, projectId])
            }
            if let value = input.customDeployUrl {
                try db.execute(sql: "UPDATE user_overrides SET custom_deploy_url = ? WHERE project_id = ?", arguments: [value, projectId])
            }
            if let value = input.notes {
                try db.execute(sql: "UPDATE user_overrides SET notes = ? WHERE project_id = ?", arguments: [value, projectId])
            }
        }
    }

    @discardableResult
    static func toggleFavorite(projectId: String) throws -> Bool {
        try Database.shared.pool.write { db in
            try db.execute(sql: "INSERT OR IGNORE INTO user_overrides (project_id) VALUES (?)", arguments: [projectId])
            let current = try Int.fetchOne(db, sql: "SELECT is_favorite FROM user_overrides WHERE project_id = ?", arguments: [projectId]) ?? 0
            let next = current == 0 ? 1 : 0
            try db.execute(sql: "UPDATE user_overrides SET is_favorite = ? WHERE project_id = ?", arguments: [next, projectId])
            return next == 1
        }
    }

    static func setSortOrder(ids: [String]) throws {
        try Database.shared.pool.write { db in
            for (index, id) in ids.enumerated() {
                try db.execute(sql: "INSERT OR IGNORE INTO user_overrides (project_id) VALUES (?)", arguments: [id])
                try db.execute(sql: "UPDATE user_overrides SET sort_order = ? WHERE project_id = ?", arguments: [index, id])
            }
        }
    }

    static func captureSnapshot() throws {
        try Database.shared.pool.write { db in
            let totalProjects = try Int.fetchOne(db, sql: "SELECT COUNT(*) FROM projects") ?? 0
            let dirtyRepos = try Int.fetchOne(db, sql: "SELECT COUNT(*) FROM projects WHERE git_dirty = 1") ?? 0
            let totalDirtyFiles = try Int.fetchOne(db, sql: "SELECT COALESCE(SUM(git_dirty_count), 0) FROM projects") ?? 0
            let totalDependencies = try Int.fetchOne(db, sql: "SELECT COUNT(*) FROM project_deps") ?? 0

            let typeRows = try Row.fetchAll(db, sql: "SELECT type, COUNT(*) AS count FROM projects GROUP BY type")
            let statusRows = try Row.fetchAll(db, sql: """
                SELECT COALESCE(o.custom_status, p.status) AS status, COUNT(*) AS count
                FROM projects p
                LEFT JOIN user_overrides o ON p.id = o.project_id
                GROUP BY status
                """)

            var typeBreakdown: [String: Int] = [:]
            for row in typeRows {
                let type: String = row["type"]
                let count: Int = row["count"]
                typeBreakdown[type] = count
            }

            var statusBreakdown: [String: Int] = [:]
            for row in statusRows {
                let status: String = row["status"]
                let count: Int = row["count"]
                statusBreakdown[status] = count
            }

            try db.execute(sql: """
                INSERT INTO snapshots (
                    total_projects, dirty_repos, total_dirty_files, total_dependencies,
                    type_breakdown, status_breakdown
                ) VALUES (?, ?, ?, ?, ?, ?)
                """, arguments: [
                    totalProjects, dirtyRepos, totalDirtyFiles, totalDependencies,
                    jsonString(typeBreakdown), jsonString(statusBreakdown),
                ])
        }
    }

    static func getSnapshots(range: String = "7d") throws -> [Snapshot] {
        let offsets = [
            "24h": "-24 hours",
            "7d": "-7 days",
            "30d": "-30 days",
            "90d": "-90 days",
        ]
        let offset = offsets[range] ?? "-7 days"

        return try Database.shared.pool.read { db in
            let rows = try Row.fetchAll(db, sql: """
                SELECT * FROM snapshots
                WHERE captured_at >= datetime('now', ?)
                ORDER BY captured_at ASC
                """, arguments: [offset])

            var snapshots = rows.map { row in
                Snapshot(
                    id: row["id"],
                    capturedAt: row["captured_at"],
                    totalProjects: row["total_projects"] ?? 0,
                    dirtyRepos: row["dirty_repos"] ?? 0,
                    totalDirtyFiles: row["total_dirty_files"] ?? 0,
                    totalDependencies: row["total_dependencies"] ?? 0,
                    typeBreakdown: parseJSONDictionary(row["type_breakdown"]),
                    statusBreakdown: parseJSONDictionary(row["status_breakdown"])
                )
            }

            if snapshots.count > 120 {
                let step = Int(ceil(Double(snapshots.count) / 100.0))
                var sampled: [Snapshot] = []
                var index = 0
                while index < snapshots.count {
                    sampled.append(snapshots[index])
                    index += step
                }
                if let last = snapshots.last, sampled.last?.id != last.id {
                    sampled.append(last)
                }
                snapshots = sampled
            }

            return snapshots
        }
    }

    static func getStartupProfiles() throws -> [StartupProfileRecord] {
        try Database.shared.pool.read { db in
            let rows = try Row.fetchAll(db, sql: "SELECT * FROM startup_profiles ORDER BY created_at DESC")
            return rows.map {
                StartupProfileRecord(
                    id: $0["id"],
                    name: $0["name"],
                    projectIds: parseJSONArray($0["project_ids"]),
                    createdAt: $0["created_at"]
                )
            }
        }
    }

    static func createStartupProfile(name: String, projectIds: [String]) throws -> StartupProfileRecord {
        let id = "profile-\(Int(Date().timeIntervalSince1970 * 1000))-\(UUID().uuidString.prefix(4))"
        return try Database.shared.pool.write { db in
            try db.execute(
                sql: "INSERT INTO startup_profiles (id, name, project_ids) VALUES (?, ?, ?)",
                arguments: [id, name, jsonString(projectIds)]
            )
            let createdAt = try String.fetchOne(db, sql: "SELECT created_at FROM startup_profiles WHERE id = ?", arguments: [id]) ?? ISO8601DateFormatter().string(from: Date())
            return StartupProfileRecord(id: id, name: name, projectIds: projectIds, createdAt: createdAt)
        }
    }

    static func updateStartupProfile(id: String, name: String, projectIds: [String]) throws {
        try Database.shared.pool.write { db in
            try db.execute(
                sql: "UPDATE startup_profiles SET name = ?, project_ids = ? WHERE id = ?",
                arguments: [name, jsonString(projectIds), id]
            )
        }
    }

    static func deleteStartupProfile(id: String) throws {
        try Database.shared.pool.write { db in
            try db.execute(sql: "DELETE FROM startup_profiles WHERE id = ?", arguments: [id])
        }
    }

    static func getProjectAliases() throws -> [String: String] {
        try Database.shared.pool.read { db in
            let rows = try Row.fetchAll(db, sql: """
                SELECT project_id, aliases
                FROM user_overrides
                WHERE aliases IS NOT NULL AND aliases != '[]'
                """)
            var map: [String: String] = [:]
            for row in rows {
                let projectId: String = row["project_id"]
                for alias in parseJSONArray(row["aliases"]) {
                    map[alias.lowercased()] = projectId
                }
            }
            return map
        }
    }

    static func getAllAliases() throws -> [AliasRecord] {
        try Database.shared.pool.read { db in
            let rows = try Row.fetchAll(db, sql: """
                SELECT o.project_id, o.aliases, COALESCE(o.custom_name, p.name) AS project_name
                FROM user_overrides o
                JOIN projects p ON p.id = o.project_id
                WHERE o.aliases IS NOT NULL AND o.aliases != '[]'
                """)
            var results: [AliasRecord] = []
            for row in rows {
                let projectId: String = row["project_id"]
                let projectName: String = row["project_name"]
                for alias in parseJSONArray(row["aliases"]) {
                    results.append(AliasRecord(alias: alias, projectId: projectId, projectName: projectName))
                }
            }
            return results
        }
    }

    static func setProjectAlias(projectId: String, alias: String) throws -> (ok: Bool, error: String?) {
        let aliases = try getProjectAliases()
        if let owner = aliases[alias.lowercased()], owner != projectId {
            return (false, "Alias \"\(alias)\" already used by project \(owner)")
        }

        return try Database.shared.pool.write { db in
            let row = try Row.fetchOne(db, sql: "SELECT aliases FROM user_overrides WHERE project_id = ?", arguments: [projectId])
            var values = parseJSONArray(row?["aliases"])
            if !values.contains(alias) {
                values.append(alias)
            }
            try db.execute(
                sql: """
                    INSERT INTO user_overrides (project_id, aliases) VALUES (?, ?)
                    ON CONFLICT(project_id) DO UPDATE SET aliases = excluded.aliases
                    """,
                arguments: [projectId, jsonString(values)]
            )
            return (true, nil)
        }
    }

    static func removeProjectAlias(_ alias: String) throws -> Bool {
        try Database.shared.pool.write { db in
            let rows = try Row.fetchAll(db, sql: "SELECT project_id, aliases FROM user_overrides WHERE aliases LIKE ?", arguments: ["%\(alias)%"])
            for row in rows {
                let projectId: String = row["project_id"]
                let aliases = parseJSONArray(row["aliases"])
                let filtered = aliases.filter { $0.caseInsensitiveCompare(alias) != .orderedSame }
                guard filtered.count != aliases.count else { continue }
                try db.execute(sql: "UPDATE user_overrides SET aliases = ? WHERE project_id = ?", arguments: [jsonString(filtered), projectId])
                return true
            }
            return false
        }
    }

    static func logCommand(
        projectId: String? = nil,
        verb: String,
        args: String? = nil,
        source: String = "api",
        status: String = "ok",
        message: String? = nil,
        durationMs: Int? = nil
    ) {
        try? Database.shared.pool.write { db in
            try db.execute(sql: """
                INSERT INTO command_logs (project_id, verb, args, source, status, message, duration_ms)
                VALUES (?, ?, ?, ?, ?, ?, ?)
                """, arguments: [projectId, verb, args, source, status, message, durationMs])
        }
    }

    static func getCommandLogs(filters: CommandLogFilters = CommandLogFilters()) throws -> [CommandLogEntry] {
        try Database.shared.pool.read { db in
            var sql = """
                SELECT cl.*, COALESCE(o.custom_name, p.name) AS project_name
                FROM command_logs cl
                LEFT JOIN projects p ON cl.project_id = p.id
                LEFT JOIN user_overrides o ON cl.project_id = o.project_id
                WHERE 1=1
                """
            var arguments: [DatabaseValueConvertible] = []

            if let projectId = filters.projectId, !projectId.isEmpty {
                sql += " AND cl.project_id = ?"
                arguments.append(projectId)
            }
            if let verb = filters.verb, !verb.isEmpty {
                sql += " AND cl.verb = ?"
                arguments.append(verb)
            }
            if let since = filters.since, !since.isEmpty {
                sql += " AND cl.created_at >= ?"
                arguments.append(since)
            }
            sql += " ORDER BY cl.created_at DESC LIMIT ?"
            arguments.append(filters.limit)

            let rows = try Row.fetchAll(db, sql: sql, arguments: StatementArguments(arguments))
            return rows.map {
                CommandLogEntry(
                    id: $0["id"],
                    projectId: $0["project_id"],
                    projectName: $0["project_name"],
                    verb: $0["verb"],
                    args: $0["args"],
                    source: $0["source"],
                    status: $0["status"],
                    message: $0["message"],
                    durationMs: $0["duration_ms"],
                    createdAt: $0["created_at"]
                )
            }
        }
    }

    static func recordActivity(projectId: String, signal: String, metadata: [String: Any]? = nil) {
        let metadataString: String?
        if let metadata,
           let data = try? JSONSerialization.data(withJSONObject: metadata, options: [.sortedKeys]) {
            metadataString = String(data: data, encoding: .utf8)
        } else {
            metadataString = nil
        }

        let now = Int64(Date().timeIntervalSince1970 * 1000)
        let cutoff = now - Int64(30 * 24 * 60 * 60 * 1000)

        try? Database.shared.pool.write { db in
            try db.execute(
                sql: "INSERT INTO project_activity (project_id, signal, timestamp, metadata) VALUES (?, ?, ?, ?)",
                arguments: [projectId, signal, now, metadataString]
            )
            try db.execute(sql: "DELETE FROM project_activity WHERE timestamp < ?", arguments: [cutoff])
        }
    }

    static func getActiveProjects(range: String = "today") throws -> [ActiveProjectScore] {
        let now = Int64(Date().timeIntervalSince1970 * 1000)
        let cutoff: Int64
        switch range {
        case "week":
            cutoff = now - Int64(7 * 24 * 60 * 60 * 1000)
        case "month":
            cutoff = now - Int64(30 * 24 * 60 * 60 * 1000)
        default:
            cutoff = now - Int64(24 * 60 * 60 * 1000)
        }

        return try Database.shared.pool.read { db in
            let rows = try Row.fetchAll(db, sql: """
                SELECT pa.project_id, pa.signal, pa.timestamp, COALESCE(o.custom_name, p.name) AS project_name
                FROM project_activity pa
                LEFT JOIN projects p ON p.id = pa.project_id
                LEFT JOIN user_overrides o ON o.project_id = pa.project_id
                WHERE pa.timestamp > ?
                ORDER BY pa.timestamp DESC
                """, arguments: [cutoff])

            struct Accumulator {
                var score: Double
                var projectName: String
                var lastSignal: String
                var lastActivity: Int64
            }

            var scores: [String: Accumulator] = [:]
            for row in rows {
                let projectId: String = row["project_id"]
                let signal: String = row["signal"]
                let timestamp: Int64 = row["timestamp"]
                let projectName: String = row["project_name"] ?? projectId

                let ageDays = Double(now - timestamp) / Double(24 * 60 * 60 * 1000)
                let decay: Double
                switch ageDays {
                case ..<1: decay = 1.0
                case ..<2: decay = 0.7
                case ..<7: decay = 0.4
                default: decay = 0.1
                }
                let weight = signalWeights[signal] ?? 1

                if var existing = scores[projectId] {
                    existing.score += weight * decay
                    scores[projectId] = existing
                } else {
                    scores[projectId] = Accumulator(score: weight * decay, projectName: projectName, lastSignal: signal, lastActivity: timestamp)
                }
            }

            return scores.map { key, value in
                ActiveProjectScore(
                    projectId: key,
                    projectName: value.projectName,
                    score: (value.score * 10).rounded() / 10,
                    lastSignal: value.lastSignal,
                    lastActivity: value.lastActivity
                )
            }
            .sorted { $0.score > $1.score }
            .prefix(20)
            .map { $0 }
        }
    }

    static func getTimeline(range: String = "today", projectId: String? = nil) throws -> [TimelineEntry] {
        let now = Int64(Date().timeIntervalSince1970 * 1000)
        let cutoff: Int64 = range == "week" ? now - Int64(7 * 24 * 60 * 60 * 1000) : now - Int64(24 * 60 * 60 * 1000)

        return try Database.shared.pool.read { db in
            var activitySQL = """
                SELECT pa.project_id, pa.signal, pa.timestamp, pa.metadata,
                       COALESCE(o.custom_name, p.name, pa.project_id) AS project_name
                FROM project_activity pa
                LEFT JOIN projects p ON p.id = pa.project_id
                LEFT JOIN user_overrides o ON o.project_id = pa.project_id
                WHERE pa.timestamp > ?
                """
            var activityArgs: [DatabaseValueConvertible] = [cutoff]
            if let projectId, !projectId.isEmpty {
                activitySQL += " AND pa.project_id = ?"
                activityArgs.append(projectId)
            }
            activitySQL += " ORDER BY pa.timestamp DESC LIMIT 200"

            var logSQL = """
                SELECT cl.project_id, cl.verb, cl.status, cl.created_at,
                       CAST(strftime('%s', cl.created_at) AS INTEGER) * 1000 AS timestamp,
                       COALESCE(o.custom_name, p.name, cl.project_id) AS project_name
                FROM command_logs cl
                LEFT JOIN projects p ON p.id = cl.project_id
                LEFT JOIN user_overrides o ON o.project_id = cl.project_id
                WHERE CAST(strftime('%s', cl.created_at) AS INTEGER) * 1000 > ?
                """
            var logArgs: [DatabaseValueConvertible] = [cutoff]
            if let projectId, !projectId.isEmpty {
                logSQL += " AND cl.project_id = ?"
                logArgs.append(projectId)
            }
            logSQL += " ORDER BY cl.created_at DESC LIMIT 200"

            let activityRows = try Row.fetchAll(db, sql: activitySQL, arguments: StatementArguments(activityArgs))
            let logRows = try Row.fetchAll(db, sql: logSQL, arguments: StatementArguments(logArgs))

            var merged: [TimelineEntry] = activityRows.map { row in
                let signal: String = row["signal"]
                return TimelineEntry(
                    timestamp: row["timestamp"],
                    type: signal,
                    projectId: row["project_id"],
                    projectName: row["project_name"],
                    summary: formatActivitySummary(signal: signal, metadataString: row["metadata"])
                )
            }

            merged += logRows.map { row in
                let verb: String = row["verb"]
                let status: String = row["status"]
                let projectId: String = row["project_id"] ?? ""
                let projectName: String = row["project_name"] ?? projectId
                return TimelineEntry(
                    timestamp: row["timestamp"],
                    type: "verb",
                    projectId: projectId,
                    projectName: projectName,
                    summary: "\(verb) \(projectId) -> \(status)"
                )
            }

            return merged.sorted { $0.timestamp > $1.timestamp }.prefix(100).map { $0 }
        }
    }

    private static func formatActivitySummary(signal: String, metadataString: String?) -> String {
        let metadata: [String: Any]
        if let metadataString,
           let data = metadataString.data(using: .utf8),
           let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any] {
            metadata = json
        } else {
            metadata = [:]
        }

        switch signal {
        case "file_change":
            let count = metadata["files_changed"] ?? metadata["filesChanged"] ?? "?"
            return "\(count) files changed"
        case "git_commit":
            return metadata["message"] as? String ?? "Git commit"
        case "server_start":
            return "Dev server started"
        case "server_stop":
            return "Dev server stopped"
        case "verb_exec":
            return "Ran \(metadata["verb"] as? String ?? "command")"
        case "palette_use":
            return "Opened in palette"
        default:
            return signal
        }
    }
}
