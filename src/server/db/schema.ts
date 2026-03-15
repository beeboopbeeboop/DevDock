import { Database } from 'bun:sqlite';
import { join } from 'path';

let db: Database | null = null;

export function getDb(): Database {
  if (db) return db;

  const dbPath = join(import.meta.dir, '..', '..', '..', 'devdock.db');
  db = new Database(dbPath, { create: true });
  db.exec('PRAGMA journal_mode = WAL');
  db.exec('PRAGMA foreign_keys = ON');

  db.exec(`
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
    );

    CREATE TABLE IF NOT EXISTS user_overrides (
      project_id TEXT PRIMARY KEY REFERENCES projects(id) ON DELETE CASCADE,
      custom_name TEXT,
      custom_status TEXT,
      custom_tags TEXT,
      custom_dev_port INTEGER,
      custom_deploy_url TEXT,
      custom_deploy_target TEXT,
      notes TEXT
    );

    CREATE TABLE IF NOT EXISTS project_deps (
      project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      dep_name TEXT NOT NULL,
      dep_type TEXT NOT NULL DEFAULT 'dependency',
      PRIMARY KEY (project_id, dep_name)
    );
  `);

  // Migrations — add columns if missing
  try {
    db.exec(`ALTER TABLE user_overrides ADD COLUMN is_favorite INTEGER NOT NULL DEFAULT 0`);
  } catch { /* column already exists */ }
  try {
    db.exec(`ALTER TABLE user_overrides ADD COLUMN sort_order INTEGER`);
  } catch { /* column already exists */ }

  return db;
}
