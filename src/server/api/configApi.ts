import { Hono } from 'hono';
import { getUserConfig, saveConfig, reloadConfig, getConfigPath } from '../userConfig.js';

export const configApi = new Hono();

// GET /api/config — return current config + file path
configApi.get('/', (c) => {
  const config = getUserConfig();
  return c.json({ config, configPath: getConfigPath() });
});

// PATCH /api/config — update specific config fields
configApi.patch('/', async (c) => {
  const updates = await c.req.json();
  const current = getUserConfig();
  const merged = { ...current, ...updates };

  // Validate scan paths are strings
  if (merged.scanPaths && !Array.isArray(merged.scanPaths)) {
    return c.json({ error: 'scanPaths must be an array' }, 400);
  }
  if (merged.ignoreDirs && !Array.isArray(merged.ignoreDirs)) {
    return c.json({ error: 'ignoreDirs must be an array' }, 400);
  }

  saveConfig(merged);
  return c.json({ ok: true, config: merged });
});

// POST /api/config/reload — reload from disk
configApi.post('/reload', (c) => {
  const config = reloadConfig();
  return c.json({ ok: true, config });
});
