import { Hono } from 'hono';
import { runScan } from '../scanner/discover.js';
import { captureSnapshot } from '../db/queries.js';
import { getUserConfig, saveConfig } from '../userConfig.js';

export const scanApi = new Hono();

let scanning = false;
let lastScanResult: { count: number; duration: number } | null = null;
let autoScanTimer: ReturnType<typeof setInterval> | null = null;

async function doScan() {
  if (scanning) return;
  scanning = true;
  const start = Date.now();
  try {
    const count = await runScan();
    lastScanResult = { count, duration: Date.now() - start };
    try { captureSnapshot(); } catch { /* snapshot failure shouldn't break scans */ }
  } finally {
    scanning = false;
  }
}

/** Start or restart the auto-scan interval based on config */
export function setupAutoScan() {
  if (autoScanTimer) {
    clearInterval(autoScanTimer);
    autoScanTimer = null;
  }

  const { autoScanInterval } = getUserConfig();
  if (autoScanInterval > 0) {
    const ms = autoScanInterval * 60_000;
    autoScanTimer = setInterval(() => doScan(), ms);
  }
}

// Manual scan trigger
scanApi.post('/', async (c) => {
  if (scanning) return c.json({ error: 'Scan already in progress' }, 409);

  const start = Date.now();
  scanning = true;
  try {
    const count = await runScan();
    lastScanResult = { count, duration: Date.now() - start };
    try { captureSnapshot(); } catch { /* snapshot failure shouldn't break scans */ }
    return c.json(lastScanResult);
  } finally {
    scanning = false;
  }
});

scanApi.get('/status', (c) => {
  const { autoScanInterval } = getUserConfig();
  return c.json({ scanning, lastResult: lastScanResult, autoScanInterval });
});

// Update auto-scan interval
scanApi.patch('/auto', async (c) => {
  const { interval } = await c.req.json<{ interval: number }>();
  if (typeof interval !== 'number' || interval < 0) {
    return c.json({ error: 'interval must be a non-negative number' }, 400);
  }

  const config = getUserConfig();
  config.autoScanInterval = interval;
  saveConfig(config);
  setupAutoScan();

  return c.json({ ok: true, autoScanInterval: interval });
});
