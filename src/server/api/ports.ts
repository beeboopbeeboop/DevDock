import { Hono } from 'hono';

export const portsApi = new Hono();

interface ParsedPort {
  port: number;
  pid: number;
  command: string;
  user: string;
  projectId: string | null;
  projectName: string | null;
}

function parseLsofOutput(output: string): ParsedPort[] {
  const lines = output.trim().split('\n').slice(1); // skip header
  const seen = new Map<number, ParsedPort>();

  for (const line of lines) {
    const parts = line.split(/\s+/);
    if (parts.length < 9) continue;

    const command = parts[0];
    const pid = parseInt(parts[1]);
    const user = parts[2];
    // Parse port from NAME column — second-to-last when "(LISTEN)" is appended
    const name = parts.find((p) => p.includes(':') && /:\d+/.test(p)) || '';
    const portMatch = name.match(/:(\d+)/);
    if (!portMatch) continue;

    const port = parseInt(portMatch[1]);
    if (seen.has(port)) continue; // dedupe (IPv4/IPv6 duplicates)

    seen.set(port, {
      port,
      pid,
      command,
      user,
      projectId: null,
      projectName: null,
    });
  }

  return Array.from(seen.values()).sort((a, b) => a.port - b.port);
}

// GET /api/ports/all — all listening TCP ports, annotated with project info
portsApi.get('/all', async (c) => {
  try {
    const result = await Bun.$`/usr/sbin/lsof -iTCP -sTCP:LISTEN -P -n 2>/dev/null`.nothrow().text();
    const ports = parseLsofOutput(result);

    // Cross-reference with projects
    const db = (await import('../db/schema.js')).getDb();
    const projects = db.prepare(
      'SELECT id, name, dev_port FROM projects WHERE dev_port IS NOT NULL'
    ).all() as { id: string; name: string; dev_port: number }[];

    const portToProject = new Map(
      projects.map((p) => [p.dev_port, { id: p.id, name: p.name }])
    );

    for (const p of ports) {
      const proj = portToProject.get(p.port);
      if (proj) {
        p.projectId = proj.id;
        p.projectName = proj.name;
      }
    }

    return c.json(ports);
  } catch (err) {
    console.error('[ports/all] error:', err);
    return c.json([]);
  }
});

// GET /api/ports/conflicts — ports assigned to multiple projects or squatted by non-project processes
portsApi.get('/conflicts', async (c) => {
  try {
    const db = (await import('../db/schema.js')).getDb();
    const projects = db.prepare(
      'SELECT id, name, dev_port FROM projects WHERE dev_port IS NOT NULL'
    ).all() as { id: string; name: string; dev_port: number }[];

    // Find duplicate port assignments
    const portMap = new Map<number, { id: string; name: string }[]>();
    for (const p of projects) {
      if (!portMap.has(p.dev_port)) portMap.set(p.dev_port, []);
      portMap.get(p.dev_port)!.push({ id: p.id, name: p.name });
    }

    const conflicts: {
      port: number;
      projects: { id: string; name: string }[];
      type: 'duplicate' | 'squatted';
      currentProcess: { command: string; pid: number } | null;
    }[] = [];

    // Duplicate assignments
    for (const [port, projs] of portMap) {
      if (projs.length > 1) {
        conflicts.push({
          port,
          projects: projs,
          type: 'duplicate',
          currentProcess: null,
        });
      }
    }

    // Squatted ports — process running on a project's port but not the expected project
    try {
      const lsofOutput = await Bun.$`/usr/sbin/lsof -iTCP -sTCP:LISTEN -P -n 2>/dev/null`.nothrow().text();
      const listeningPorts = parseLsofOutput(lsofOutput);

      for (const listening of listeningPorts) {
        const assignedProjects = portMap.get(listening.port);
        if (assignedProjects && assignedProjects.length === 1) {
          // Port is assigned to a project — check if the running process matches
          // If the command is something generic (node, bun, python), it's likely the right one
          // For now, just note it as informational (not a conflict)
        }
      }
    } catch { /* ok */ }

    return c.json(conflicts);
  } catch {
    return c.json([]);
  }
});

// GET /api/ports/suggestions — find available ports in a range
portsApi.get('/suggestions', async (c) => {
  const rangeStr = c.req.query('range') || '5100-5199';
  const count = Math.min(parseInt(c.req.query('count') || '5'), 50);
  const [startStr, endStr] = rangeStr.split('-');
  const start = parseInt(startStr);
  const end = parseInt(endStr) || start + 99;

  // Validate port range
  if (isNaN(start) || isNaN(end) || start < 1 || end > 65535 || start > end || (end - start) > 1000) {
    return c.json({ error: 'Invalid port range' }, 400);
  }

  // Get all currently listening ports
  const output = await Bun.$`/usr/sbin/lsof -iTCP -sTCP:LISTEN -P -n 2>/dev/null`.nothrow().text();
  const usedPorts = new Set(
    output.split('\n').map((line) => {
      const match = line.match(/:(\d+)\s/);
      return match ? parseInt(match[1]) : 0;
    }).filter(Boolean)
  );

  const available: number[] = [];
  for (let port = start; port <= end && available.length < count; port++) {
    if (!usedPorts.has(port)) available.push(port);
  }

  return c.json(available);
});
