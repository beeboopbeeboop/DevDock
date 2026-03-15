import { Hono } from 'hono';
import { existsSync } from 'fs';
import { join, basename } from 'path';
import { validateProjectPath } from '../security.js';
import { startProcess, stopProcess } from '../processManager.js';

export const dockerApi = new Hono();

// ─────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────

let dockerAvailable: boolean | null = null;
let lastCheck = 0;

async function checkDockerAvailable(): Promise<boolean> {
  if (dockerAvailable !== null && Date.now() - lastCheck < 60_000) return dockerAvailable;
  try {
    const proc = Bun.spawn(['docker', 'info'], { stdout: 'pipe', stderr: 'pipe' });
    await proc.exited;
    dockerAvailable = proc.exitCode === 0;
  } catch {
    dockerAvailable = false;
  }
  lastCheck = Date.now();
  return dockerAvailable;
}

async function runDocker(
  args: string[],
  cwd?: string,
): Promise<{ ok: boolean; output: string; exitCode: number }> {
  const proc = Bun.spawn(['docker', ...args], {
    cwd,
    stdout: 'pipe',
    stderr: 'pipe',
  });
  const output = await new Response(proc.stdout).text();
  const stderr = await new Response(proc.stderr).text();
  const exitCode = await proc.exited;
  return { ok: exitCode === 0, output: (output + stderr).trim(), exitCode };
}

function requireValidPath(path: string | undefined | null) {
  if (!path) return { valid: false as const, error: 'path required' };
  const result = validateProjectPath(path);
  if (!result.valid) return { valid: false as const, error: result.error || 'Invalid path' };
  return { valid: true as const, resolved: result.resolved };
}

function validateContainerId(id: string): boolean {
  return typeof id === 'string' && /^[a-zA-Z0-9][a-zA-Z0-9_.-]{0,63}$/.test(id);
}

function findComposeFile(dir: string): string | null {
  for (const name of ['docker-compose.yml', 'docker-compose.yaml', 'compose.yml', 'compose.yaml']) {
    if (existsSync(join(dir, name))) return name;
  }
  return null;
}

// ─────────────────────────────────────────────
// Container Status
// ─────────────────────────────────────────────

interface ContainerInfo {
  id: string;
  name: string;
  image: string;
  state: 'running' | 'exited' | 'paused' | 'created';
  status: string;
  ports: string;
  created: string;
  projectId: string | null;
  projectName: string | null;
  composeProject: string | null;
  composeService: string | null;
}

dockerApi.get('/containers', async (c) => {
  if (!(await checkDockerAvailable())) {
    return c.json({ available: false, containers: [] });
  }

  try {
    const { ok, output } = await runDocker([
      'ps', '-a', '--format', '{{json .}}',
    ]);
    if (!ok || !output.trim()) {
      return c.json({ available: true, containers: [] });
    }

    const containers: ContainerInfo[] = [];
    const ids: string[] = [];

    for (const line of output.split('\n')) {
      if (!line.trim()) continue;
      try {
        const raw = JSON.parse(line);
        const state = (raw.State || '').toLowerCase();
        containers.push({
          id: raw.ID || '',
          name: (raw.Names || '').replace(/^\//, ''),
          image: raw.Image || '',
          state: ['running', 'exited', 'paused', 'created'].includes(state)
            ? (state as ContainerInfo['state'])
            : 'exited',
          status: raw.Status || '',
          ports: raw.Ports || '',
          created: raw.CreatedAt || raw.RunningFor || '',
          projectId: null,
          projectName: null,
          composeProject: null,
          composeService: null,
        });
        ids.push(raw.ID || '');
      } catch { /* skip malformed */ }
    }

    // Batch inspect for compose labels
    if (ids.length > 0) {
      try {
        const { ok: inspOk, output: inspOut } = await runDocker([
          'inspect', '--format',
          '{{.Id}}\t{{index .Config.Labels "com.docker.compose.project"}}\t{{index .Config.Labels "com.docker.compose.service"}}\t{{index .Config.Labels "com.docker.compose.project.working_dir"}}',
          ...ids,
        ]);
        if (inspOk) {
          const labelMap = new Map<string, { project: string; service: string; workDir: string }>();
          for (const line of inspOut.split('\n')) {
            const [fullId, proj, svc, workDir] = line.split('\t');
            if (fullId) {
              labelMap.set(fullId.slice(0, 12), {
                project: proj || '',
                service: svc || '',
                workDir: workDir || '',
              });
            }
          }
          for (const container of containers) {
            const labels = labelMap.get(container.id.slice(0, 12));
            if (labels) {
              container.composeProject = labels.project || null;
              container.composeService = labels.service || null;
            }
          }
        }
      } catch { /* labels optional */ }
    }

    // Cross-reference with projects DB
    try {
      const db = (await import('../db/schema.js')).getDb();
      const projects = db.prepare('SELECT id, name, path FROM projects').all() as {
        id: string; name: string; path: string;
      }[];

      const byBasename = new Map<string, { id: string; name: string }>();
      const byPath = new Map<string, { id: string; name: string }>();
      for (const p of projects) {
        byBasename.set(basename(p.path).toLowerCase(), { id: p.id, name: p.name });
        byPath.set(p.path, { id: p.id, name: p.name });
      }

      for (const container of containers) {
        if (container.projectId) continue;
        // Match by compose project name (= directory basename)
        if (container.composeProject) {
          const match = byBasename.get(container.composeProject.toLowerCase());
          if (match) {
            container.projectId = match.id;
            container.projectName = match.name;
            continue;
          }
        }
        // Match by container name
        const nameMatch = byBasename.get(container.name.toLowerCase().replace(/-\d+$/, ''));
        if (nameMatch) {
          container.projectId = nameMatch.id;
          container.projectName = nameMatch.name;
        }
      }
    } catch { /* DB optional */ }

    return c.json({ available: true, containers });
  } catch {
    return c.json({ available: true, containers: [] });
  }
});

// ─────────────────────────────────────────────
// Compose Services (per project)
// ─────────────────────────────────────────────

dockerApi.get('/compose-services', async (c) => {
  const pathCheck = requireValidPath(c.req.query('path'));
  if (!pathCheck.valid) return c.json({ error: pathCheck.error }, 400);

  if (!(await checkDockerAvailable())) {
    return c.json({ available: false, services: [] });
  }

  const composeFile = findComposeFile(pathCheck.resolved);
  if (!composeFile) {
    return c.json({ available: true, services: [], error: 'No compose file found' });
  }

  try {
    const { ok, output } = await runDocker(
      ['compose', '-f', composeFile, 'ps', '--format', 'json'],
      pathCheck.resolved,
    );

    if (!ok) return c.json({ available: true, services: [] });

    const services: { name: string; status: string; state: string; ports: string }[] = [];
    // docker compose ps --format json outputs one JSON object per line
    for (const line of output.split('\n')) {
      if (!line.trim()) continue;
      try {
        const raw = JSON.parse(line);
        services.push({
          name: raw.Service || raw.Name || '',
          status: raw.Status || '',
          state: (raw.State || 'exited').toLowerCase(),
          ports: raw.Ports || raw.Publishers?.map((p: { PublishedPort: number; TargetPort: number }) =>
            `${p.PublishedPort}->${p.TargetPort}`).join(', ') || '',
        });
      } catch { /* skip */ }
    }

    return c.json({ available: true, services });
  } catch {
    return c.json({ available: true, services: [] });
  }
});

// ─────────────────────────────────────────────
// Compose Actions
// ─────────────────────────────────────────────

dockerApi.post('/compose-up', async (c) => {
  const { path } = await c.req.json();
  const pathCheck = requireValidPath(path);
  if (!pathCheck.valid) return c.json({ error: pathCheck.error }, 400);
  if (!(await checkDockerAvailable())) return c.json({ error: 'Docker not available' }, 503);

  const composeFile = findComposeFile(pathCheck.resolved);
  if (!composeFile) return c.json({ error: 'No compose file found' }, 400);

  const result = await runDocker(['compose', '-f', composeFile, 'up', '-d'], pathCheck.resolved);
  return c.json({ ok: result.ok, output: result.output.slice(0, 500) });
});

dockerApi.post('/compose-down', async (c) => {
  const { path } = await c.req.json();
  const pathCheck = requireValidPath(path);
  if (!pathCheck.valid) return c.json({ error: pathCheck.error }, 400);
  if (!(await checkDockerAvailable())) return c.json({ error: 'Docker not available' }, 503);

  const composeFile = findComposeFile(pathCheck.resolved);
  if (!composeFile) return c.json({ error: 'No compose file found' }, 400);

  const result = await runDocker(['compose', '-f', composeFile, 'down'], pathCheck.resolved);
  return c.json({ ok: result.ok, output: result.output.slice(0, 500) });
});

dockerApi.post('/compose-restart', async (c) => {
  const { path } = await c.req.json();
  const pathCheck = requireValidPath(path);
  if (!pathCheck.valid) return c.json({ error: pathCheck.error }, 400);
  if (!(await checkDockerAvailable())) return c.json({ error: 'Docker not available' }, 503);

  const composeFile = findComposeFile(pathCheck.resolved);
  if (!composeFile) return c.json({ error: 'No compose file found' }, 400);

  const result = await runDocker(['compose', '-f', composeFile, 'restart'], pathCheck.resolved);
  return c.json({ ok: result.ok, output: result.output.slice(0, 500) });
});

// ─────────────────────────────────────────────
// Container Actions
// ─────────────────────────────────────────────

dockerApi.post('/container-stop', async (c) => {
  const { containerId } = await c.req.json();
  if (!validateContainerId(containerId)) return c.json({ error: 'Invalid container ID' }, 400);
  if (!(await checkDockerAvailable())) return c.json({ error: 'Docker not available' }, 503);

  const result = await runDocker(['stop', containerId]);
  return c.json({ ok: result.ok, output: result.output.slice(0, 200) });
});

dockerApi.post('/container-restart', async (c) => {
  const { containerId } = await c.req.json();
  if (!validateContainerId(containerId)) return c.json({ error: 'Invalid container ID' }, 400);
  if (!(await checkDockerAvailable())) return c.json({ error: 'Docker not available' }, 503);

  const result = await runDocker(['restart', containerId]);
  return c.json({ ok: result.ok, output: result.output.slice(0, 200) });
});

// ─────────────────────────────────────────────
// Container Logs (streaming via managed process)
// ─────────────────────────────────────────────

// Managed log processes (separate from processManager to avoid command validation)
const logProcesses = new Map<string, { proc: ReturnType<typeof Bun.spawn>; buffer: string[]; listeners: Set<ReadableStreamDefaultController> }>();
const MAX_LOG_BUFFER = 500;

dockerApi.post('/logs-start', async (c) => {
  const { containerId } = await c.req.json();
  if (!validateContainerId(containerId)) return c.json({ error: 'Invalid container ID' }, 400);
  if (!(await checkDockerAvailable())) return c.json({ error: 'Docker not available' }, 503);

  const key = `docker-logs-${containerId}`;

  // Kill existing
  if (logProcesses.has(key)) {
    const old = logProcesses.get(key)!;
    try { old.proc.kill(); } catch { /* ok */ }
    logProcesses.delete(key);
  }

  const proc = Bun.spawn(['docker', 'logs', '--tail', '100', '-f', containerId], {
    stdout: 'pipe',
    stderr: 'pipe',
  });

  const managed = { proc, buffer: [] as string[], listeners: new Set<ReadableStreamDefaultController>() };
  logProcesses.set(key, managed);

  // Stream stdout
  const reader = proc.stdout.getReader();
  const decoder = new TextDecoder();
  (async () => {
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const text = decoder.decode(value);
        managed.buffer.push(text);
        if (managed.buffer.length > MAX_LOG_BUFFER) managed.buffer.shift();
        for (const ctrl of managed.listeners) {
          try { ctrl.enqueue(`data: ${JSON.stringify({ text })}\n\n`); } catch { managed.listeners.delete(ctrl); }
        }
      }
    } catch { /* process ended */ }
  })();

  // Stream stderr
  const errReader = proc.stderr.getReader();
  (async () => {
    try {
      while (true) {
        const { done, value } = await errReader.read();
        if (done) break;
        const text = decoder.decode(value);
        managed.buffer.push(text);
        if (managed.buffer.length > MAX_LOG_BUFFER) managed.buffer.shift();
        for (const ctrl of managed.listeners) {
          try { ctrl.enqueue(`data: ${JSON.stringify({ text })}\n\n`); } catch { managed.listeners.delete(ctrl); }
        }
      }
    } catch { /* process ended */ }
  })();

  return c.json({ ok: true, key });
});

dockerApi.post('/logs-stop', async (c) => {
  const { containerId } = await c.req.json();
  if (!validateContainerId(containerId)) return c.json({ error: 'Invalid container ID' }, 400);

  const key = `docker-logs-${containerId}`;
  const managed = logProcesses.get(key);
  if (managed) {
    try { managed.proc.kill(); } catch { /* ok */ }
    logProcesses.delete(key);
  }
  return c.json({ ok: true });
});

dockerApi.get('/logs-stream/:key', (c) => {
  const key = c.req.param('key');
  const managed = logProcesses.get(key);

  const stream = new ReadableStream({
    start(controller) {
      // Send buffered content
      if (managed) {
        for (const text of managed.buffer) {
          controller.enqueue(`data: ${JSON.stringify({ text })}\n\n`);
        }
        managed.listeners.add(controller);
      }
    },
    cancel() {
      if (managed) managed.listeners.delete(c as unknown as ReadableStreamDefaultController);
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    },
  });
});

dockerApi.get('/logs-buffer/:key', (c) => {
  const key = c.req.param('key');
  const managed = logProcesses.get(key);
  return c.json({ buffer: managed?.buffer || [] });
});
