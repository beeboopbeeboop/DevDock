import { Hono } from 'hono';
import { getSnapshots, type SnapshotRow } from '../db/queries.js';

export const insightsApi = new Hono();

function rowToSnapshot(row: SnapshotRow) {
  return {
    id: row.id,
    capturedAt: row.captured_at,
    totalProjects: row.total_projects,
    dirtyRepos: row.dirty_repos,
    totalDirtyFiles: row.total_dirty_files,
    totalDependencies: row.total_dependencies,
    typeBreakdown: JSON.parse(row.type_breakdown),
    statusBreakdown: JSON.parse(row.status_breakdown),
  };
}

// GET /api/insights?range=7d
insightsApi.get('/', (c) => {
  const range = (c.req.query('range') || '7d') as '24h' | '7d' | '30d' | '90d';
  const valid = ['24h', '7d', '30d', '90d'];
  if (!valid.includes(range)) {
    return c.json({ error: 'range must be 24h, 7d, 30d, or 90d' }, 400);
  }

  const rows = getSnapshots(range);
  return c.json(rows.map(rowToSnapshot));
});

// GET /api/insights/latest
insightsApi.get('/latest', (c) => {
  const rows = getSnapshots('24h');
  if (rows.length === 0) {
    return c.json(null);
  }
  return c.json(rowToSnapshot(rows[rows.length - 1]));
});
