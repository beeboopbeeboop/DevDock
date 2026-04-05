import { Hono } from 'hono';
import { getPresets, createPreset, deletePreset } from '../db/queries.js';

export const presetsApi = new Hono();

presetsApi.get('/', (c) => {
  const presets = getPresets();
  return c.json(presets.map((p) => ({
    id: p.id,
    name: p.name,
    filters: JSON.parse(p.filters),
    createdAt: p.created_at,
  })));
});

presetsApi.post('/', async (c) => {
  const { name, filters } = await c.req.json<{ name: string; filters: object }>();
  if (!name?.trim()) return c.json({ error: 'Name is required' }, 400);
  const preset = createPreset(name.trim(), filters);
  return c.json({ id: preset.id, name: preset.name, filters: JSON.parse(preset.filters), createdAt: preset.created_at });
});

presetsApi.delete('/:id', (c) => {
  const id = c.req.param('id');
  deletePreset(id);
  return c.json({ ok: true });
});
