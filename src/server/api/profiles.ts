import { Hono } from 'hono';
import { getStartupProfiles, createStartupProfile, updateStartupProfile, deleteStartupProfile, getProjects } from '../db/queries.js';
import { startProcess, stopProcess } from '../processManager.js';
import { validateDevCommand, validateProjectPath } from '../security.js';
import type { StartupProfile } from '../../shared/types.js';

export const profilesApi = new Hono();

function rowToProfile(row: { id: string; name: string; project_ids: string; created_at: string }): StartupProfile {
  return {
    id: row.id,
    name: row.name,
    projectIds: JSON.parse(row.project_ids || '[]'),
    createdAt: row.created_at,
  };
}

profilesApi.get('/', (c) => {
  const rows = getStartupProfiles();
  return c.json(rows.map(rowToProfile));
});

profilesApi.post('/', async (c) => {
  const { name, projectIds } = await c.req.json();
  if (!name || !Array.isArray(projectIds)) return c.json({ error: 'name and projectIds required' }, 400);
  const row = createStartupProfile(name, projectIds);
  return c.json(rowToProfile(row));
});

profilesApi.patch('/:id', async (c) => {
  const id = c.req.param('id');
  const { name, projectIds } = await c.req.json();
  if (!name || !Array.isArray(projectIds)) return c.json({ error: 'name and projectIds required' }, 400);
  updateStartupProfile(id, name, projectIds);
  return c.json({ ok: true });
});

profilesApi.delete('/:id', async (c) => {
  const id = c.req.param('id');
  deleteStartupProfile(id);
  return c.json({ ok: true });
});

profilesApi.post('/:id/start', async (c) => {
  const id = c.req.param('id');
  const rows = getStartupProfiles();
  const profile = rows.find(r => r.id === id);
  if (!profile) return c.json({ error: 'Profile not found' }, 404);

  const projectIds: string[] = JSON.parse(profile.project_ids || '[]');
  const allProjects = getProjects();
  const started: string[] = [];
  const failed: string[] = [];

  for (const pid of projectIds) {
    const project = allProjects.find(p => p.id === pid);
    if (!project || !project.devCommand) {
      failed.push(pid);
      continue;
    }

    const pathCheck = validateProjectPath(project.path);
    if (!pathCheck.valid) { failed.push(pid); continue; }

    const cmdCheck = validateDevCommand(project.devCommand);
    if (!cmdCheck.valid) { failed.push(pid); continue; }

    const ok = startProcess(pid, pathCheck.resolved, project.devCommand, { autoRestart: false });
    if (ok) started.push(pid);
    else failed.push(pid);
  }

  return c.json({ started, failed });
});

profilesApi.post('/:id/stop', async (c) => {
  const id = c.req.param('id');
  const rows = getStartupProfiles();
  const profile = rows.find(r => r.id === id);
  if (!profile) return c.json({ error: 'Profile not found' }, 404);

  const projectIds: string[] = JSON.parse(profile.project_ids || '[]');
  const stopped: string[] = [];

  for (const pid of projectIds) {
    if (stopProcess(pid)) stopped.push(pid);
  }

  return c.json({ stopped });
});
