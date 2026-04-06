import { Hono } from 'hono';
import { serveStatic } from 'hono/bun';
import { cors } from 'hono/cors';
import { config } from './config.js';
import { getDb } from './db/schema.js';
import { projectsApi } from './api/projects.js';
import { githubApi } from './api/github.js';
import { actionsApi } from './api/actions.js';
import { scanApi } from './api/scan.js';
import { portsApi } from './api/ports.js';
import { deployApi } from './api/deploy.js';
import { graphApi } from './api/graph.js';
import { configApi } from './api/configApi.js';
import { envApi } from './api/envManager.js';
import { secretsApi } from './api/secretsScanner.js';
import { dockerApi } from './api/docker.js';
import { insightsApi } from './api/insights.js';
import { presetsApi } from './api/presets.js';
import { profilesApi } from './api/profiles.js';
import { verbApi } from './api/verbApi.js';
import { runScan } from './scanner/discover.js';
import { setupAutoScan } from './api/scan.js';
import { cleanup } from './processManager.js';
import { getUserConfig, getConfigPath } from './userConfig.js';

const app = new Hono();

// CORS: only allow requests from localhost (the DevDock client)
app.use('*', cors({
  origin: (origin) => {
    if (!origin) return ''; // same-origin requests (no Origin header)
    // Tauri webview origins
    if (origin === 'tauri://localhost' || origin === 'https://tauri.localhost') {
      return origin;
    }
    try {
      const url = new URL(origin);
      if (url.hostname === 'localhost' || url.hostname === '127.0.0.1') {
        return origin;
      }
    } catch {}
    return ''; // reject all other origins
  },
}));

// Request body size limit (1MB) — prevents abuse of POST endpoints
app.use('/api/*', async (c, next) => {
  const contentLength = c.req.header('content-length');
  if (contentLength && parseInt(contentLength) > 1_048_576) {
    return c.json({ error: 'Request body too large (max 1MB)' }, 413);
  }
  await next();
});

// API routes
app.route('/api/projects', projectsApi);
app.route('/api/github', githubApi);
app.route('/api/actions', actionsApi);
app.route('/api/scan', scanApi);
app.route('/api/ports', portsApi);
app.route('/api/deploy', deployApi);
app.route('/api/graph', graphApi);
app.route('/api/config', configApi);
app.route('/api/env', envApi);
app.route('/api/secrets', secretsApi);
app.route('/api/docker', dockerApi);
app.route('/api/insights', insightsApi);
app.route('/api/presets', presetsApi);
app.route('/api/profiles', profilesApi);
app.route('/api/verbs', verbApi);

app.get('/api/health', (c) => {
  return c.json({ status: 'ok', name: 'DevDock', version: '0.1.0' });
});

// Serve built client in production
app.use('/*', serveStatic({ root: './dist' }));

// Init
getDb();

// Auto-scan on startup, then start interval if configured
runScan().then((count) => {
  console.log(`  Scanned ${count} projects`);
  setupAutoScan();
});

const uc = getUserConfig();
console.log(`
  ╔═══════════════════════════════════════╗
  ║           DevDock v0.1.0              ║
  ║   http://${uc.host}:${uc.port}              ║
  ╚═══════════════════════════════════════╝
  Config: ${getConfigPath()}
  Scanning: ${uc.scanPaths.join(', ')}
`);

// Clean up managed processes on shutdown
process.on('SIGINT', () => { cleanup(); process.exit(0); });
process.on('SIGTERM', () => { cleanup(); process.exit(0); });

export default {
  port: config.port,
  hostname: config.host,
  fetch: app.fetch,
};
