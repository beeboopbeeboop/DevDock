import { getDb } from './schema.js';
import type { Project, ProjectFilters } from '../../shared/types.js';

interface ProjectRow {
  id: string;
  name: string;
  path: string;
  type: string;
  status: string;
  priority: number;
  tags: string;
  description: string | null;
  tech_stack: string;
  dev_command: string | null;
  dev_port: number | null;
  has_git: number;
  git_branch: string | null;
  git_dirty: number;
  git_dirty_count: number;
  github_repo: string | null;
  github_url: string | null;
  deploy_target: string;
  deploy_url: string | null;
  has_hanlan_core: number;
  last_modified: string | null;
  last_scanned: string;
  // Override fields
  custom_name?: string | null;
  custom_status?: string | null;
  custom_tags?: string | null;
  custom_dev_port?: number | null;
  custom_deploy_url?: string | null;
  notes?: string | null;
  is_favorite?: number | null;
  custom_dev_command?: string | null;
  aliases?: string | null;
}

function rowToProject(row: ProjectRow): Project {
  return {
    id: row.id,
    name: row.custom_name || row.name,
    path: row.path,
    type: row.type as Project['type'],
    status: (row.custom_status || row.status) as Project['status'],
    priority: row.priority,
    tags: mergeJson(row.tags, row.custom_tags),
    description: row.description,
    techStack: JSON.parse(row.tech_stack || '[]'),
    devCommand: row.custom_dev_command || row.dev_command,
    detectedDevCommand: row.dev_command,
    devPort: row.custom_dev_port ?? row.dev_port,
    hasGit: Boolean(row.has_git),
    gitBranch: row.git_branch,
    gitDirty: Boolean(row.git_dirty),
    gitDirtyCount: row.git_dirty_count || 0,
    githubRepo: row.github_repo,
    githubUrl: row.github_url,
    deployTarget: row.deploy_target as Project['deployTarget'],
    deployUrl: row.custom_deploy_url || row.deploy_url,
    hasSharedLib: Boolean(row.has_hanlan_core),
    lastModified: row.last_modified || '',
    lastScanned: row.last_scanned,
    isFavorite: Boolean(row.is_favorite),
    aliases: JSON.parse(row.aliases || '[]'),
  };
}

function mergeJson(base: string, override?: string | null): string[] {
  const baseArr = JSON.parse(base || '[]');
  if (!override) return baseArr;
  const overrideArr = JSON.parse(override);
  return [...new Set([...baseArr, ...overrideArr])];
}

export function getProjects(filters?: ProjectFilters): Project[] {
  const db = getDb();
  let sql = `
    SELECT p.*, o.custom_name, o.custom_status, o.custom_tags,
           o.custom_dev_port, o.custom_deploy_url, o.custom_dev_command, o.notes, o.is_favorite, o.aliases
    FROM projects p
    LEFT JOIN user_overrides o ON p.id = o.project_id
    WHERE 1=1
  `;
  const params: unknown[] = [];

  if (filters?.search) {
    sql += ` AND (p.name LIKE ? OR p.path LIKE ? OR p.description LIKE ?)`;
    const term = `%${filters.search}%`;
    params.push(term, term, term);
  }
  if (filters?.type) {
    sql += ` AND p.type = ?`;
    params.push(filters.type);
  }
  if (filters?.status) {
    sql += ` AND COALESCE(o.custom_status, p.status) = ?`;
    params.push(filters.status);
  }
  if (filters?.tag) {
    sql += ` AND (p.tags LIKE ? OR o.custom_tags LIKE ?)`;
    const tagTerm = `%${JSON.stringify(filters.tag).slice(1, -1)}%`;
    params.push(tagTerm, tagTerm);
  }

  const sortMap: Record<string, string> = {
    priority: 'COALESCE(o.is_favorite, 0) DESC, COALESCE(o.sort_order, p.priority, 9999) ASC, p.name ASC',
    name: 'COALESCE(o.is_favorite, 0) DESC, p.name ASC',
    lastModified: 'COALESCE(o.is_favorite, 0) DESC, p.last_modified DESC',
    type: 'COALESCE(o.is_favorite, 0) DESC, p.type ASC, p.name ASC',
    custom: 'COALESCE(o.sort_order, 9999) ASC, p.name ASC',
  };
  sql += ` ORDER BY ${sortMap[filters?.sort || 'priority'] || sortMap.priority}`;

  const rows = db.prepare(sql).all(...params) as ProjectRow[];
  return rows.map(rowToProject);
}

export function upsertProject(project: Partial<Project> & { id: string; path: string; name: string }) {
  const db = getDb();
  db.prepare(`
    INSERT INTO projects (id, name, path, type, tech_stack, dev_command, dev_port,
      has_git, git_branch, git_dirty, git_dirty_count, github_repo, github_url,
      deploy_target, deploy_url, has_hanlan_core, last_modified, last_scanned, description)
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
  `).run(
    project.id,
    project.name,
    project.path,
    project.type || 'unknown',
    JSON.stringify(project.techStack || []),
    project.devCommand || null,
    project.devPort || null,
    project.hasGit ? 1 : 0,
    project.gitBranch || null,
    project.gitDirty ? 1 : 0,
    project.gitDirtyCount || 0,
    project.githubRepo || null,
    project.githubUrl || null,
    project.deployTarget || 'none',
    project.deployUrl || null,
    project.hasSharedLib ? 1 : 0,
    project.lastModified || null,
    project.description || null,
  );
}

export function updateProjectOverride(projectId: string, overrides: {
  customName?: string;
  customStatus?: string;
  customTags?: string[];
  customDevCommand?: string | null;
  notes?: string;
}) {
  const db = getDb();
  db.prepare(`
    INSERT INTO user_overrides (project_id, custom_name, custom_status, custom_tags, custom_dev_command, notes)
    VALUES (?, ?, ?, ?, ?, ?)
    ON CONFLICT(project_id) DO UPDATE SET
      custom_name = COALESCE(excluded.custom_name, user_overrides.custom_name),
      custom_status = COALESCE(excluded.custom_status, user_overrides.custom_status),
      custom_tags = COALESCE(excluded.custom_tags, user_overrides.custom_tags),
      custom_dev_command = CASE WHEN excluded.custom_dev_command = '' THEN NULL ELSE COALESCE(excluded.custom_dev_command, user_overrides.custom_dev_command) END,
      notes = COALESCE(excluded.notes, user_overrides.notes)
  `).run(
    projectId,
    overrides.customName || null,
    overrides.customStatus || null,
    overrides.customTags ? JSON.stringify(overrides.customTags) : null,
    overrides.customDevCommand === null ? '' : (overrides.customDevCommand || null),
    overrides.notes || null,
  );
}

export function updateProjectPriority(projectId: string, priority: number) {
  const db = getDb();
  db.prepare('UPDATE projects SET priority = ? WHERE id = ?').run(priority, projectId);
  // Also set sort_order in user_overrides for custom sorting
  db.prepare(`
    INSERT INTO user_overrides (project_id, sort_order)
    VALUES (?, ?)
    ON CONFLICT(project_id) DO UPDATE SET sort_order = excluded.sort_order
  `).run(projectId, priority);
}

// ──────────────────────────────────────
// Filter Presets
// ──────────────────────────────────────

export interface FilterPresetRow {
  id: string;
  name: string;
  filters: string;
  created_at: string;
}

export function getPresets(): FilterPresetRow[] {
  const db = getDb();
  return db.prepare('SELECT * FROM filter_presets ORDER BY created_at DESC').all() as FilterPresetRow[];
}

export function createPreset(name: string, filters: object): FilterPresetRow {
  const db = getDb();
  const id = `preset-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
  db.prepare('INSERT INTO filter_presets (id, name, filters) VALUES (?, ?, ?)').run(id, name, JSON.stringify(filters));
  return { id, name, filters: JSON.stringify(filters), created_at: new Date().toISOString() };
}

export function deletePreset(id: string): void {
  const db = getDb();
  db.prepare('DELETE FROM filter_presets WHERE id = ?').run(id);
}

// ──────────────────────────────────────
// Snapshots (for Insights)
// ──────────────────────────────────────

export function captureSnapshot() {
  const db = getDb();

  const total = (db.prepare('SELECT COUNT(*) as c FROM projects').get() as { c: number }).c;
  const dirtyRepos = (db.prepare('SELECT COUNT(*) as c FROM projects WHERE git_dirty = 1').get() as { c: number }).c;
  const totalDirtyFiles = (db.prepare('SELECT COALESCE(SUM(git_dirty_count), 0) as c FROM projects').get() as { c: number }).c;
  const totalDeps = (db.prepare('SELECT COUNT(*) as c FROM project_deps').get() as { c: number }).c;

  const typeRows = db.prepare('SELECT type, COUNT(*) as c FROM projects GROUP BY type').all() as { type: string; c: number }[];
  const typeBreakdown: Record<string, number> = {};
  for (const r of typeRows) typeBreakdown[r.type] = r.c;

  const statusRows = db.prepare(`
    SELECT COALESCE(o.custom_status, p.status) as s, COUNT(*) as c
    FROM projects p LEFT JOIN user_overrides o ON p.id = o.project_id
    GROUP BY s
  `).all() as { s: string; c: number }[];
  const statusBreakdown: Record<string, number> = {};
  for (const r of statusRows) statusBreakdown[r.s] = r.c;

  db.prepare(`
    INSERT INTO snapshots (total_projects, dirty_repos, total_dirty_files, total_dependencies, type_breakdown, status_breakdown)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(total, dirtyRepos, totalDirtyFiles, totalDeps, JSON.stringify(typeBreakdown), JSON.stringify(statusBreakdown));
}

export interface SnapshotRow {
  id: number;
  captured_at: string;
  total_projects: number;
  dirty_repos: number;
  total_dirty_files: number;
  total_dependencies: number;
  type_breakdown: string;
  status_breakdown: string;
}

export function getSnapshots(range: '24h' | '7d' | '30d' | '90d' = '7d'): SnapshotRow[] {
  const db = getDb();
  const offsetMap: Record<string, string> = {
    '24h': '-24 hours',
    '7d': '-7 days',
    '30d': '-30 days',
    '90d': '-90 days',
  };

  const rows = db.prepare(`
    SELECT * FROM snapshots
    WHERE captured_at >= datetime('now', ?)
    ORDER BY captured_at ASC
  `).all(offsetMap[range]) as SnapshotRow[];

  // Downsample for large ranges to keep chart smooth (~100 points max)
  if (rows.length > 120) {
    const step = Math.ceil(rows.length / 100);
    const sampled: SnapshotRow[] = [];
    for (let i = 0; i < rows.length; i += step) {
      sampled.push(rows[i]);
    }
    // Always include the last point
    if (sampled[sampled.length - 1] !== rows[rows.length - 1]) {
      sampled.push(rows[rows.length - 1]);
    }
    return sampled;
  }

  return rows;
}

// ──────────────────────────────────────
// Startup Profiles
// ──────────────────────────────────────

export interface StartupProfileRow {
  id: string;
  name: string;
  project_ids: string;
  created_at: string;
}

export function getStartupProfiles(): StartupProfileRow[] {
  const db = getDb();
  return db.prepare('SELECT * FROM startup_profiles ORDER BY created_at DESC').all() as StartupProfileRow[];
}

export function createStartupProfile(name: string, projectIds: string[]): StartupProfileRow {
  const db = getDb();
  const id = `profile-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
  db.prepare('INSERT INTO startup_profiles (id, name, project_ids) VALUES (?, ?, ?)').run(id, name, JSON.stringify(projectIds));
  return { id, name, project_ids: JSON.stringify(projectIds), created_at: new Date().toISOString() };
}

export function updateStartupProfile(id: string, name: string, projectIds: string[]): void {
  const db = getDb();
  db.prepare('UPDATE startup_profiles SET name = ?, project_ids = ? WHERE id = ?').run(name, JSON.stringify(projectIds), id);
}

export function deleteStartupProfile(id: string): void {
  const db = getDb();
  db.prepare('DELETE FROM startup_profiles WHERE id = ?').run(id);
}

// ──────────────────────────────────────
// Aliases (AKA System)
// ──────────────────────────────────────

export function getProjectAliases(): Map<string, string> {
  const db = getDb();
  const rows = db.prepare(
    `SELECT project_id, aliases FROM user_overrides WHERE aliases != '[]' AND aliases IS NOT NULL`
  ).all() as { project_id: string; aliases: string }[];
  const map = new Map<string, string>();
  for (const row of rows) {
    const arr: string[] = JSON.parse(row.aliases);
    for (const alias of arr) map.set(alias.toLowerCase(), row.project_id);
  }
  return map;
}

export function getAllAliases(): { alias: string; projectId: string; projectName: string }[] {
  const db = getDb();
  const rows = db.prepare(`
    SELECT o.project_id, o.aliases, COALESCE(o.custom_name, p.name) as name
    FROM user_overrides o
    JOIN projects p ON o.project_id = p.id
    WHERE o.aliases != '[]' AND o.aliases IS NOT NULL
  `).all() as { project_id: string; aliases: string; name: string }[];
  const result: { alias: string; projectId: string; projectName: string }[] = [];
  for (const row of rows) {
    const arr: string[] = JSON.parse(row.aliases);
    for (const alias of arr) {
      result.push({ alias, projectId: row.project_id, projectName: row.name });
    }
  }
  return result;
}

export function setProjectAlias(projectId: string, alias: string): { ok: boolean; error?: string } {
  const db = getDb();
  const key = alias.toLowerCase();
  // Check uniqueness across all projects
  const existing = getProjectAliases();
  const owner = existing.get(key);
  if (owner && owner !== projectId) {
    return { ok: false, error: `Alias "${alias}" already used by project ${owner}` };
  }
  // Get current aliases for this project
  const row = db.prepare('SELECT aliases FROM user_overrides WHERE project_id = ?').get(projectId) as { aliases: string } | undefined;
  const current: string[] = row ? JSON.parse(row.aliases || '[]') : [];
  if (!current.includes(alias)) current.push(alias);
  db.prepare(`
    INSERT INTO user_overrides (project_id, aliases) VALUES (?, ?)
    ON CONFLICT(project_id) DO UPDATE SET aliases = excluded.aliases
  `).run(projectId, JSON.stringify(current));
  return { ok: true };
}

export function removeProjectAlias(alias: string): boolean {
  const db = getDb();
  const rows = db.prepare(
    `SELECT project_id, aliases FROM user_overrides WHERE aliases LIKE ?`
  ).all(`%${alias}%`) as { project_id: string; aliases: string }[];
  for (const row of rows) {
    const arr: string[] = JSON.parse(row.aliases);
    const filtered = arr.filter(a => a.toLowerCase() !== alias.toLowerCase());
    if (filtered.length !== arr.length) {
      db.prepare('UPDATE user_overrides SET aliases = ? WHERE project_id = ?').run(JSON.stringify(filtered), row.project_id);
      return true;
    }
  }
  return false;
}

// ──────────────────────────────────────
// Command Audit Log
// ──────────────────────────────────────

export function logCommand(entry: {
  projectId?: string;
  verb: string;
  args?: string;
  source?: string;
  status?: string;
  message?: string;
  durationMs?: number;
}): void {
  const db = getDb();
  db.prepare(`
    INSERT INTO command_logs (project_id, verb, args, source, status, message, duration_ms)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(
    entry.projectId || null,
    entry.verb,
    entry.args || null,
    entry.source || 'cli',
    entry.status || 'ok',
    entry.message || null,
    entry.durationMs || null,
  );
}

export function getCommandLogs(filters?: {
  projectId?: string;
  verb?: string;
  limit?: number;
  since?: string;
}): { id: number; projectId: string | null; projectName: string | null; verb: string; args: string | null; source: string; status: string; message: string | null; durationMs: number | null; createdAt: string }[] {
  const db = getDb();
  let sql = `
    SELECT cl.*, COALESCE(o.custom_name, p.name) as project_name
    FROM command_logs cl
    LEFT JOIN projects p ON cl.project_id = p.id
    LEFT JOIN user_overrides o ON cl.project_id = o.project_id
    WHERE 1=1
  `;
  const params: unknown[] = [];
  if (filters?.projectId) { sql += ' AND cl.project_id = ?'; params.push(filters.projectId); }
  if (filters?.verb) { sql += ' AND cl.verb = ?'; params.push(filters.verb); }
  if (filters?.since) { sql += ' AND cl.created_at >= ?'; params.push(filters.since); }
  sql += ' ORDER BY cl.created_at DESC LIMIT ?';
  params.push(filters?.limit || 50);

  const rows = db.prepare(sql).all(...params) as { id: number; project_id: string | null; project_name: string | null; verb: string; args: string | null; source: string; status: string; message: string | null; duration_ms: number | null; created_at: string }[];
  return rows.map(r => ({
    id: r.id,
    projectId: r.project_id,
    projectName: r.project_name,
    verb: r.verb,
    args: r.args,
    source: r.source,
    status: r.status,
    message: r.message,
    durationMs: r.duration_ms,
    createdAt: r.created_at,
  }));
}
