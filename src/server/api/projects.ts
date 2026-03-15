import { Hono } from 'hono';
import { getProjects, updateProjectOverride, updateProjectPriority } from '../db/queries.js';
import type { ProjectFilters } from '../../shared/types.js';

export const projectsApi = new Hono();

projectsApi.get('/', (c) => {
  const filters: ProjectFilters = {
    search: c.req.query('search') || undefined,
    type: c.req.query('type') as ProjectFilters['type'],
    status: c.req.query('status') as ProjectFilters['status'],
    sort: (c.req.query('sort') as ProjectFilters['sort']) || 'priority',
  };
  const projects = getProjects(filters);
  return c.json(projects);
});

projectsApi.patch('/:id/override', async (c) => {
  const id = c.req.param('id');
  const body = await c.req.json();
  updateProjectOverride(id, body);
  return c.json({ ok: true });
});

projectsApi.patch('/:id/priority', async (c) => {
  const id = c.req.param('id');
  const { priority } = await c.req.json();
  updateProjectPriority(id, priority);
  return c.json({ ok: true });
});

projectsApi.post('/reorder', async (c) => {
  const { ids } = await c.req.json<{ ids: string[] }>();
  ids.forEach((id, i) => updateProjectPriority(id, i));
  return c.json({ ok: true });
});

projectsApi.post('/:id/favorite', async (c) => {
  const id = c.req.param('id');
  const db = (await import('../db/schema.js')).getDb();
  // Upsert into user_overrides, toggle is_favorite
  db.prepare(`
    INSERT INTO user_overrides (project_id, is_favorite)
    VALUES (?, 1)
    ON CONFLICT(project_id) DO UPDATE SET is_favorite = CASE WHEN is_favorite = 1 THEN 0 ELSE 1 END
  `).run(id);
  const row = db.prepare('SELECT is_favorite FROM user_overrides WHERE project_id = ?').get(id) as { is_favorite: number } | undefined;
  return c.json({ ok: true, isFavorite: Boolean(row?.is_favorite) });
});
