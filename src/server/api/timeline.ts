import { Hono } from 'hono';
import { getActiveProjects, getTimeline } from '../db/queries.js';

export const timelineApi = new Hono();

// GET /api/timeline?range=today|week&project=<id>
timelineApi.get('/', (c) => {
  const range = (c.req.query('range') as 'today' | 'week') || 'today';
  const project = c.req.query('project') || undefined;
  const entries = getTimeline(range, project);
  return c.json(entries);
});

// GET /api/context/active?range=today|week|month
timelineApi.get('/active', (c) => {
  const range = (c.req.query('range') as 'today' | 'week' | 'month') || 'today';
  const projects = getActiveProjects(range);
  return c.json(projects);
});
