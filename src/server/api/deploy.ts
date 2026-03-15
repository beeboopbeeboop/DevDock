import { Hono } from 'hono';
import { validateProjectPath } from '../security.js';
import type { DeployTarget } from '../../shared/types.js';

export const deployApi = new Hono();

interface DeploymentEntry {
  id: string;
  url: string;
  status: string;
  environment: string;
  createdAt: string;
}

const VALID_ENVIRONMENTS = new Set(['preview', 'production', 'staging']);

// ─────────────────────────────────────────────
// Shared Helpers
// ─────────────────────────────────────────────

async function runCmd(args: string[], cwd: string): Promise<{ output: string; exitCode: number }> {
  const proc = Bun.spawn(args, {
    stdout: 'pipe',
    stderr: 'pipe',
    cwd,
  });
  const output = await new Response(proc.stdout).text();
  const exitCode = await proc.exited;
  return { output: output.trim(), exitCode };
}

async function checkCli(name: string): Promise<boolean> {
  try {
    const proc = Bun.spawn(['which', name], { stdout: 'pipe', stderr: 'pipe' });
    await proc.exited;
    return proc.exitCode === 0;
  } catch {
    return false;
  }
}

async function resolveProjectById(projectId: string) {
  const db = (await import('../db/schema.js')).getDb();
  const row = db.prepare(
    'SELECT path, deploy_target, deploy_url FROM projects WHERE id = ?'
  ).get(projectId) as { path: string; deploy_target: string; deploy_url: string | null } | null;
  if (!row) return null;
  const pathCheck = validateProjectPath(row.path);
  if (!pathCheck.valid) return null;
  return { ...row, path: pathCheck.resolved };
}

// CLI name for each deploy target
const TARGET_CLI: Record<string, string> = {
  vercel: 'vercel',
  cloudflare: 'wrangler',
  netlify: 'netlify',
  railway: 'railway',
  flyio: 'flyctl',
};

// ─────────────────────────────────────────────
// Provider: Vercel
// ─────────────────────────────────────────────

async function getVercelDeployments(projectPath: string, limit: number): Promise<DeploymentEntry[]> {
  try {
    const { output } = await runCmd(
      ['vercel', 'ls', '--json', '--limit', String(Math.min(limit, 50))],
      projectPath
    );
    if (!output) return [];
    const data = JSON.parse(output);
    const deployments = Array.isArray(data) ? data : data.deployments || [];
    return deployments.map((d: Record<string, unknown>) => ({
      id: String(d.uid || d.id || ''),
      url: String(d.url || ''),
      status: String(d.state || d.readyState || 'unknown'),
      environment: String(d.target || 'preview'),
      createdAt: String(d.created || d.createdAt || ''),
    }));
  } catch { return []; }
}

function triggerVercel(path: string, environment: string) {
  const args = ['vercel'];
  if (environment === 'production') args.push('--prod');
  Bun.spawn(args, { cwd: path, stdout: 'ignore', stderr: 'ignore', stdin: 'ignore' });
}

// ─────────────────────────────────────────────
// Provider: Cloudflare (Wrangler)
// ─────────────────────────────────────────────

async function getWranglerDeployments(projectPath: string): Promise<DeploymentEntry[]> {
  try {
    const { output } = await runCmd(
      ['wrangler', 'deployments', 'list', '--json'],
      projectPath
    );
    if (!output) return [];
    const data = JSON.parse(output);
    const items = Array.isArray(data) ? data : data.items || [];
    return items.map((d: Record<string, unknown>) => ({
      id: String(d.id || ''),
      url: String(d.url || ''),
      status: 'ready',
      environment: 'production',
      createdAt: String(d.created_on || d.createdAt || ''),
    }));
  } catch { return []; }
}

function triggerCloudflare(path: string) {
  Bun.spawn(['wrangler', 'deploy'], { cwd: path, stdout: 'ignore', stderr: 'ignore', stdin: 'ignore' });
}

// ─────────────────────────────────────────────
// Provider: Netlify
// ─────────────────────────────────────────────

async function getNetlifyDeployments(projectPath: string, limit: number): Promise<DeploymentEntry[]> {
  try {
    const { output } = await runCmd(
      ['netlify', 'api', 'listSiteDeploys', '--data', JSON.stringify({ per_page: Math.min(limit, 20) })],
      projectPath
    );
    if (!output) return [];
    const deploys = JSON.parse(output);
    if (!Array.isArray(deploys)) return [];
    return deploys.map((d: Record<string, unknown>) => ({
      id: String(d.id || '').slice(0, 12),
      url: String(d.deploy_ssl_url || d.deploy_url || d.ssl_url || ''),
      status: String(d.state || 'unknown'),
      environment: d.context === 'production' ? 'production' : 'preview',
      createdAt: String(d.created_at || ''),
    }));
  } catch {
    // Fallback: parse `netlify status` output
    try {
      const { output } = await runCmd(['netlify', 'status', '--json'], projectPath);
      if (!output) return [];
      const data = JSON.parse(output);
      if (data.deploy) {
        return [{
          id: String(data.deploy.id || '').slice(0, 12),
          url: String(data.deploy.ssl_url || data.deploy.deploy_ssl_url || ''),
          status: String(data.deploy.state || 'unknown'),
          environment: 'production',
          createdAt: String(data.deploy.published_at || data.deploy.created_at || ''),
        }];
      }
    } catch { /* skip */ }
    return [];
  }
}

function triggerNetlify(path: string, environment: string) {
  const args = ['netlify', 'deploy'];
  if (environment === 'production') args.push('--prod');
  Bun.spawn(args, { cwd: path, stdout: 'ignore', stderr: 'ignore', stdin: 'ignore' });
}

// ─────────────────────────────────────────────
// Provider: Railway
// ─────────────────────────────────────────────

async function getRailwayDeployments(projectPath: string): Promise<DeploymentEntry[]> {
  try {
    const { output } = await runCmd(
      ['railway', 'status', '--json'],
      projectPath
    );
    if (!output) return [];
    const data = JSON.parse(output);
    // Railway status --json returns deployment info
    const deploys = data.deployments || (data.deployment ? [data.deployment] : []);
    if (!Array.isArray(deploys)) {
      // Single deployment object
      if (data.url || data.deploymentUrl) {
        return [{
          id: String(data.id || data.deploymentId || '').slice(0, 12),
          url: String(data.url || data.deploymentUrl || ''),
          status: String(data.status || 'unknown'),
          environment: 'production',
          createdAt: String(data.createdAt || ''),
        }];
      }
      return [];
    }
    return deploys.map((d: Record<string, unknown>) => ({
      id: String(d.id || '').slice(0, 12),
      url: String(d.url || d.staticUrl || ''),
      status: String(d.status || 'unknown'),
      environment: 'production',
      createdAt: String(d.createdAt || ''),
    }));
  } catch { return []; }
}

function triggerRailway(path: string) {
  Bun.spawn(['railway', 'up'], { cwd: path, stdout: 'ignore', stderr: 'ignore', stdin: 'ignore' });
}

// ─────────────────────────────────────────────
// Provider: Fly.io
// ─────────────────────────────────────────────

async function getFlyDeployments(projectPath: string): Promise<DeploymentEntry[]> {
  try {
    const { output } = await runCmd(
      ['flyctl', 'releases', '--json'],
      projectPath
    );
    if (!output) return [];
    const releases = JSON.parse(output);
    if (!Array.isArray(releases)) return [];
    return releases.slice(0, 10).map((d: Record<string, unknown>) => ({
      id: String(d.ID || d.id || d.Version || ''),
      url: '', // Fly doesn't include URL in releases — set from app status
      status: String(d.Status || d.status || 'unknown'),
      environment: 'production',
      createdAt: String(d.CreatedAt || d.created_at || ''),
    }));
  } catch { return []; }
}

async function getFlyAppUrl(projectPath: string): Promise<string | null> {
  try {
    const { output } = await runCmd(['flyctl', 'status', '--json'], projectPath);
    if (!output) return null;
    const data = JSON.parse(output);
    const hostname = data.Hostname || data.hostname;
    return hostname ? `https://${hostname}` : null;
  } catch { return null; }
}

function triggerFly(path: string) {
  Bun.spawn(['flyctl', 'deploy'], { cwd: path, stdout: 'ignore', stderr: 'ignore', stdin: 'ignore' });
}

// ─────────────────────────────────────────────
// Unified Deployment Functions
// ─────────────────────────────────────────────

async function getDeployments(target: string, projectPath: string, limit: number): Promise<DeploymentEntry[]> {
  switch (target) {
    case 'vercel': return getVercelDeployments(projectPath, limit);
    case 'cloudflare': return getWranglerDeployments(projectPath);
    case 'netlify': return getNetlifyDeployments(projectPath, limit);
    case 'railway': return getRailwayDeployments(projectPath);
    case 'flyio': return getFlyDeployments(projectPath);
    default: return [];
  }
}

function triggerDeploy(target: string, path: string, environment: string): { triggered: boolean; target: string; environment: string } {
  switch (target) {
    case 'vercel': triggerVercel(path, environment); break;
    case 'cloudflare': triggerCloudflare(path); break;
    case 'netlify': triggerNetlify(path, environment); break;
    case 'railway': triggerRailway(path); break;
    case 'flyio': triggerFly(path); break;
    default: return { triggered: false, target, environment };
  }
  return { triggered: true, target, environment };
}

// ─────────────────────────────────────────────
// Endpoints
// ─────────────────────────────────────────────

deployApi.get('/:projectId/status', async (c) => {
  const project = await resolveProjectById(c.req.param('projectId'));
  if (!project) return c.json({ error: 'Project not found' }, 404);
  if (project.deploy_target === 'none') return c.json({ target: 'none', lastDeploy: null });

  const cliName = TARGET_CLI[project.deploy_target];
  if (!cliName || !(await checkCli(cliName))) {
    return c.json({
      target: project.deploy_target,
      lastDeploy: null,
      cliMissing: true,
      cliName: cliName || 'unknown',
      deployUrl: project.deploy_url,
    });
  }

  const deployments = await getDeployments(project.deploy_target, project.path, 1);

  // For Fly.io, enrich with app URL
  if (project.deploy_target === 'flyio' && deployments.length > 0 && !deployments[0].url) {
    const appUrl = await getFlyAppUrl(project.path);
    if (appUrl) deployments[0].url = appUrl;
  }

  return c.json({
    target: project.deploy_target,
    lastDeploy: deployments[0] || null,
    deployUrl: project.deploy_url,
  });
});

deployApi.get('/:projectId/history', async (c) => {
  const project = await resolveProjectById(c.req.param('projectId'));
  if (!project) return c.json({ error: 'Project not found' }, 404);

  const cliName = TARGET_CLI[project.deploy_target];
  if (!cliName || !(await checkCli(cliName))) return c.json([]);

  const deployments = await getDeployments(project.deploy_target, project.path, 10);
  return c.json(deployments);
});

deployApi.post('/:projectId/trigger', async (c) => {
  const project = await resolveProjectById(c.req.param('projectId'));
  if (!project) return c.json({ error: 'Project not found' }, 404);

  const { environment = 'preview' } = await c.req.json();
  if (!VALID_ENVIRONMENTS.has(environment)) {
    return c.json({ error: 'Invalid environment — must be "preview", "production", or "staging"' }, 400);
  }

  const cliName = TARGET_CLI[project.deploy_target];
  if (!cliName || !(await checkCli(cliName))) {
    return c.json({ error: `CLI not installed: ${cliName || 'unknown'}` }, 400);
  }

  const result = triggerDeploy(project.deploy_target, project.path, environment);
  if (!result.triggered) {
    return c.json({ error: 'No deploy target configured' }, 400);
  }
  return c.json(result);
});

deployApi.get('/:projectId/health', async (c) => {
  const projectId = c.req.param('projectId');
  const db = (await import('../db/schema.js')).getDb();
  const project = db.prepare(
    'SELECT deploy_url FROM projects WHERE id = ?'
  ).get(projectId) as { deploy_url: string | null } | null;

  if (!project?.deploy_url) {
    return c.json({ url: null, healthy: false, status: 0, responseTime: 0 });
  }

  try {
    const parsed = new URL(project.deploy_url);
    if (!['http:', 'https:'].includes(parsed.protocol)) {
      return c.json({ url: project.deploy_url, healthy: false, status: 0, responseTime: 0 });
    }
  } catch {
    return c.json({ url: project.deploy_url, healthy: false, status: 0, responseTime: 0 });
  }

  try {
    const start = Date.now();
    const res = await fetch(project.deploy_url, { signal: AbortSignal.timeout(5000) });
    const responseTime = Date.now() - start;
    return c.json({
      url: project.deploy_url,
      healthy: res.ok,
      status: res.status,
      responseTime,
    });
  } catch {
    return c.json({ url: project.deploy_url, healthy: false, status: 0, responseTime: 0 });
  }
});
