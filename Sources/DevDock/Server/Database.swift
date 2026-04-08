import Foundation
import GRDB

/// GRDB database setup and schema migrations.
///
/// Ported from `src/server/db/schema.ts`. Uses `~/.devdock/devdock.db`
/// (cleaner location than the old `<repo>/devdock.db`).
///
/// Thread model: GRDB's `DatabasePool` allows concurrent reads + serialized writes.
/// Every Swifter handler gets a safe reference via `Database.shared.pool`.
final class Database {
    static let shared = Database()

    let pool: DatabasePool

    private init() {
        let fm = FileManager.default
        let dir = fm.homeDirectoryForCurrentUser.appendingPathComponent(".devdock", isDirectory: true)
        try? fm.createDirectory(at: dir, withIntermediateDirectories: true)
        let dbURL = dir.appendingPathComponent("devdock.db")

        do {
            var config = Configuration()
            config.prepareDatabase { db in
                try db.execute(sql: "PRAGMA foreign_keys = ON")
            }
            self.pool = try DatabasePool(path: dbURL.path, configuration: config)
            try Self.migrate(pool)
        } catch {
            fatalError("[Database] failed to open \(dbURL.path): \(error)")
        }
    }

    // MARK: - Schema migrations

    private static func migrate(_ pool: DatabasePool) throws {
        var migrator = DatabaseMigrator()

        migrator.registerMigration("v1_initial") { db in
            try db.execute(sql: """
                CREATE TABLE IF NOT EXISTS projects (
                    id TEXT PRIMARY KEY,
                    name TEXT NOT NULL,
                    path TEXT NOT NULL UNIQUE,
                    type TEXT NOT NULL DEFAULT 'unknown',
                    status TEXT NOT NULL DEFAULT 'active',
                    priority INTEGER NOT NULL DEFAULT 0,
                    tags TEXT NOT NULL DEFAULT '[]',
                    description TEXT,
                    tech_stack TEXT NOT NULL DEFAULT '[]',
                    dev_command TEXT,
                    dev_port INTEGER,
                    has_git INTEGER NOT NULL DEFAULT 0,
                    git_branch TEXT,
                    git_dirty INTEGER NOT NULL DEFAULT 0,
                    git_dirty_count INTEGER NOT NULL DEFAULT 0,
                    github_repo TEXT,
                    github_url TEXT,
                    deploy_target TEXT NOT NULL DEFAULT 'none',
                    deploy_url TEXT,
                    has_hanlan_core INTEGER NOT NULL DEFAULT 0,
                    last_modified TEXT,
                    last_scanned TEXT NOT NULL DEFAULT (datetime('now')),
                    created_at TEXT NOT NULL DEFAULT (datetime('now'))
                )
                """)

            try db.execute(sql: """
                CREATE TABLE IF NOT EXISTS user_overrides (
                    project_id TEXT PRIMARY KEY REFERENCES projects(id) ON DELETE CASCADE,
                    custom_name TEXT,
                    custom_status TEXT,
                    custom_tags TEXT,
                    custom_dev_port INTEGER,
                    custom_deploy_url TEXT,
                    custom_deploy_target TEXT,
                    notes TEXT,
                    is_favorite INTEGER NOT NULL DEFAULT 0,
                    sort_order INTEGER,
                    custom_dev_command TEXT,
                    aliases TEXT NOT NULL DEFAULT '[]'
                )
                """)

            try db.execute(sql: """
                CREATE TABLE IF NOT EXISTS project_deps (
                    project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
                    dep_name TEXT NOT NULL,
                    dep_type TEXT NOT NULL DEFAULT 'dependency',
                    PRIMARY KEY (project_id, dep_name)
                )
                """)

            try db.execute(sql: """
                CREATE TABLE IF NOT EXISTS snapshots (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    captured_at TEXT NOT NULL DEFAULT (datetime('now')),
                    total_projects INTEGER NOT NULL DEFAULT 0,
                    dirty_repos INTEGER NOT NULL DEFAULT 0,
                    total_dirty_files INTEGER NOT NULL DEFAULT 0,
                    total_dependencies INTEGER NOT NULL DEFAULT 0,
                    type_breakdown TEXT NOT NULL DEFAULT '{}',
                    status_breakdown TEXT NOT NULL DEFAULT '{}'
                )
                """)
            try db.execute(sql: "CREATE INDEX IF NOT EXISTS idx_snapshots_time ON snapshots(captured_at)")

            try db.execute(sql: """
                CREATE TABLE IF NOT EXISTS filter_presets (
                    id TEXT PRIMARY KEY,
                    name TEXT NOT NULL,
                    filters TEXT NOT NULL DEFAULT '{}',
                    created_at TEXT NOT NULL DEFAULT (datetime('now'))
                )
                """)

            try db.execute(sql: """
                CREATE TABLE IF NOT EXISTS startup_profiles (
                    id TEXT PRIMARY KEY,
                    name TEXT NOT NULL UNIQUE,
                    project_ids TEXT NOT NULL DEFAULT '[]',
                    created_at TEXT NOT NULL DEFAULT (datetime('now'))
                )
                """)

            try db.execute(sql: """
                CREATE TABLE IF NOT EXISTS project_activity (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    project_id TEXT NOT NULL,
                    signal TEXT NOT NULL,
                    timestamp INTEGER NOT NULL,
                    metadata TEXT
                )
                """)
            try db.execute(sql: "CREATE INDEX IF NOT EXISTS idx_activity_project ON project_activity(project_id, timestamp)")
            try db.execute(sql: "CREATE INDEX IF NOT EXISTS idx_activity_time ON project_activity(timestamp)")

            try db.execute(sql: """
                CREATE TABLE IF NOT EXISTS command_logs (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    project_id TEXT,
                    verb TEXT NOT NULL,
                    args TEXT,
                    source TEXT NOT NULL DEFAULT 'cli',
                    status TEXT NOT NULL DEFAULT 'ok',
                    message TEXT,
                    duration_ms INTEGER,
                    created_at TEXT NOT NULL DEFAULT (datetime('now'))
                )
                """)
            try db.execute(sql: "CREATE INDEX IF NOT EXISTS idx_cmdlog_verb ON command_logs(verb)")
            try db.execute(sql: "CREATE INDEX IF NOT EXISTS idx_cmdlog_project ON command_logs(project_id)")
            try db.execute(sql: "CREATE INDEX IF NOT EXISTS idx_cmdlog_created ON command_logs(created_at)")
        }

        try migrator.migrate(pool)
    }
}
