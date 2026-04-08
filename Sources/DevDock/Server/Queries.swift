import Foundation
import GRDB

/// Project CRUD + filter queries.
///
/// Ported from `src/server/db/queries.ts`. Returns `ProjectResponse` structs
/// that JSON-encode into the exact shape `DevDockProject` in the Swift UI
/// expects — camelCase keys, merged overrides, all optional fields preserved.
enum Queries {

    // MARK: - Response shape (matches Swift UI's DevDockProject)

    struct ProjectResponse: Encodable {
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
        var sort: String? // priority, name, lastModified, type, custom
    }

    // MARK: - Helpers

    private static func parseJSONArray(_ s: String?) -> [String] {
        guard let s, let data = s.data(using: .utf8),
              let arr = try? JSONDecoder().decode([String].self, from: data)
        else { return [] }
        return arr
    }

    private static func mergeTags(base: String?, override: String?) -> [String] {
        let baseArr = parseJSONArray(base)
        guard let override else { return baseArr }
        let overrideArr = parseJSONArray(override)
        var seen = Set<String>()
        var out: [String] = []
        for t in baseArr + overrideArr where seen.insert(t).inserted {
            out.append(t)
        }
        return out
    }

    private static func rowToProject(_ row: Row) -> ProjectResponse {
        let customName: String? = row["custom_name"]
        let customStatus: String? = row["custom_status"]
        let customTags: String? = row["custom_tags"]
        let customDevCommand: String? = row["custom_dev_command"]
        let customDevPort: Int? = row["custom_dev_port"]
        let customDeployUrl: String? = row["custom_deploy_url"]
        let isFavorite: Int? = row["is_favorite"]
        let aliases: String? = row["aliases"]

        let baseDevCmd: String? = row["dev_command"]
        let baseDevPort: Int? = row["dev_port"]

        return ProjectResponse(
            id: row["id"],
            name: (customName?.isEmpty == false ? customName! : row["name"]),
            path: row["path"],
            type: row["type"],
            status: (customStatus?.isEmpty == false ? customStatus! : row["status"]),
            priority: row["priority"],
            tags: mergeTags(base: row["tags"], override: customTags),
            description: row["description"],
            techStack: parseJSONArray(row["tech_stack"]),
            devCommand: (customDevCommand?.isEmpty == false ? customDevCommand : baseDevCmd),
            detectedDevCommand: baseDevCmd,
            devPort: customDevPort ?? baseDevPort,
            hasGit: (row["has_git"] as Int? ?? 0) != 0,
            gitBranch: row["git_branch"],
            gitDirty: (row["git_dirty"] as Int? ?? 0) != 0,
            gitDirtyCount: row["git_dirty_count"] ?? 0,
            githubRepo: row["github_repo"],
            githubUrl: row["github_url"],
            deployTarget: row["deploy_target"] ?? "none",
            deployUrl: (customDeployUrl?.isEmpty == false ? customDeployUrl : row["deploy_url"]),
            hasSharedLib: (row["has_hanlan_core"] as Int? ?? 0) != 0,
            lastModified: row["last_modified"] ?? "",
            lastScanned: row["last_scanned"] ?? "",
            isFavorite: (isFavorite ?? 0) != 0,
            aliases: parseJSONArray(aliases)
        )
    }

    // MARK: - Reads

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

            let sortSql: String
            switch filters.sort ?? "priority" {
            case "name":
                sortSql = "COALESCE(o.is_favorite, 0) DESC, p.name ASC"
            case "lastModified":
                sortSql = "COALESCE(o.is_favorite, 0) DESC, p.last_modified DESC"
            case "type":
                sortSql = "COALESCE(o.is_favorite, 0) DESC, p.type ASC, p.name ASC"
            case "custom":
                sortSql = "COALESCE(o.sort_order, 9999) ASC, p.name ASC"
            default: // priority
                sortSql = "COALESCE(o.is_favorite, 0) DESC, COALESCE(o.sort_order, p.priority, 9999) ASC, p.name ASC"
            }
            sql += " ORDER BY \(sortSql)"

            let rows = try Row.fetchAll(db, sql: sql, arguments: StatementArguments(arguments))
            return rows.map(rowToProject)
        }
    }

    // MARK: - Writes

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

    static func upsertProject(_ p: UpsertInput) throws {
        try Database.shared.pool.write { db in
            let techStackJSON = (try? String(data: JSONEncoder().encode(p.techStack), encoding: .utf8)) ?? "[]"
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
                    p.id, p.name, p.path, p.type, techStackJSON,
                    p.devCommand, p.devPort,
                    p.hasGit ? 1 : 0, p.gitBranch, p.gitDirty ? 1 : 0, p.gitDirtyCount,
                    p.githubRepo, p.githubUrl, p.deployTarget, p.deployUrl,
                    p.hasSharedLib ? 1 : 0, p.lastModified, p.description
                ])
        }
    }

    /// Check whether a project ID is already taken by a *different* path.
    static func existingProjectPath(forId id: String) throws -> String? {
        try Database.shared.pool.read { db in
            try String.fetchOne(db, sql: "SELECT path FROM projects WHERE id = ?", arguments: [id])
        }
    }

    /// Prune projects whose filesystem path no longer exists.
    static func pruneMissing() throws -> Int {
        try Database.shared.pool.write { db in
            let rows = try Row.fetchAll(db, sql: "SELECT id, path FROM projects")
            var removed = 0
            for row in rows {
                let path: String = row["path"]
                if !FileManager.default.fileExists(atPath: path) {
                    let id: String = row["id"]
                    try db.execute(sql: "DELETE FROM projects WHERE id = ?", arguments: [id])
                    try db.execute(sql: "DELETE FROM user_overrides WHERE project_id = ?", arguments: [id])
                    try db.execute(sql: "DELETE FROM project_deps WHERE project_id = ?", arguments: [id])
                    removed += 1
                }
            }
            return removed
        }
    }

    // MARK: - Deps

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

    // MARK: - User overrides

    struct OverrideInput {
        var customName: String? = nil
        var customStatus: String? = nil
        var customTags: [String]? = nil
        /// Triple-optional: outer nil = unchanged, .some(nil) = clear, .some("x") = set
        var customDevCommand: String?? = nil
        var notes: String? = nil
    }

    static func updateProjectOverride(projectId: String, input: OverrideInput) throws {
        try Database.shared.pool.write { db in
            // Ensure row exists
            try db.execute(
                sql: "INSERT OR IGNORE INTO user_overrides (project_id) VALUES (?)",
                arguments: [projectId]
            )

            if let v = input.customName {
                try db.execute(sql: "UPDATE user_overrides SET custom_name = ? WHERE project_id = ?", arguments: [v, projectId])
            }
            if let v = input.customStatus {
                try db.execute(sql: "UPDATE user_overrides SET custom_status = ? WHERE project_id = ?", arguments: [v, projectId])
            }
            if let tags = input.customTags {
                let json = (try? String(data: JSONEncoder().encode(tags), encoding: .utf8)) ?? "[]"
                try db.execute(sql: "UPDATE user_overrides SET custom_tags = ? WHERE project_id = ?", arguments: [json, projectId])
            }
            if let wrapped = input.customDevCommand {
                try db.execute(sql: "UPDATE user_overrides SET custom_dev_command = ? WHERE project_id = ?", arguments: [wrapped, projectId])
            }
            if let v = input.notes {
                try db.execute(sql: "UPDATE user_overrides SET notes = ? WHERE project_id = ?", arguments: [v, projectId])
            }
        }
    }

    /// Toggle favorite state for a project. Returns the new value.
    @discardableResult
    static func toggleFavorite(projectId: String) throws -> Bool {
        try Database.shared.pool.write { db in
            try db.execute(
                sql: "INSERT OR IGNORE INTO user_overrides (project_id) VALUES (?)",
                arguments: [projectId]
            )
            let current: Int = try Int.fetchOne(
                db, sql: "SELECT is_favorite FROM user_overrides WHERE project_id = ?",
                arguments: [projectId]
            ) ?? 0
            let next = current == 0 ? 1 : 0
            try db.execute(
                sql: "UPDATE user_overrides SET is_favorite = ? WHERE project_id = ?",
                arguments: [next, projectId]
            )
            return next == 1
        }
    }

    /// Set explicit sort order for a list of project IDs (for drag-to-reorder).
    static func setSortOrder(ids: [String]) throws {
        try Database.shared.pool.write { db in
            for (index, id) in ids.enumerated() {
                try db.execute(
                    sql: "INSERT OR IGNORE INTO user_overrides (project_id) VALUES (?)",
                    arguments: [id]
                )
                try db.execute(
                    sql: "UPDATE user_overrides SET sort_order = ? WHERE project_id = ?",
                    arguments: [index, id]
                )
            }
        }
    }
}
