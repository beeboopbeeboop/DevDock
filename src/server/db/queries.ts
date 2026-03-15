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
    devCommand: row.dev_command,
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
           o.custom_dev_port, o.custom_deploy_url, o.notes, o.is_favorite
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
  notes?: string;
}) {
  const db = getDb();
  db.prepare(`
    INSERT INTO user_overrides (project_id, custom_name, custom_status, custom_tags, notes)
    VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(project_id) DO UPDATE SET
      custom_name = COALESCE(excluded.custom_name, user_overrides.custom_name),
      custom_status = COALESCE(excluded.custom_status, user_overrides.custom_status),
      custom_tags = COALESCE(excluded.custom_tags, user_overrides.custom_tags),
      notes = COALESCE(excluded.notes, user_overrides.notes)
  `).run(
    projectId,
    overrides.customName || null,
    overrides.customStatus || null,
    overrides.customTags ? JSON.stringify(overrides.customTags) : null,
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
