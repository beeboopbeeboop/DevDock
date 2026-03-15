import { Hono } from 'hono';
import { runScan } from '../scanner/discover.js';

export const scanApi = new Hono();

let scanning = false;
let lastScanResult: { count: number; duration: number } | null = null;

scanApi.post('/', async (c) => {
  if (scanning) return c.json({ error: 'Scan already in progress' }, 409);

  scanning = true;
  const start = Date.now();
  try {
    const count = await runScan();
    lastScanResult = { count, duration: Date.now() - start };
    return c.json(lastScanResult);
  } finally {
    scanning = false;
  }
});

scanApi.get('/status', (c) => {
  return c.json({ scanning, lastResult: lastScanResult });
});
