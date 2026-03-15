import { Hono } from 'hono';
import { readdirSync, statSync } from 'fs';
import { join, extname, resolve, normalize } from 'path';
import { startProcess, stopProcess, getBuffer, getStatus, subscribe } from '../processManager';
import {
  validateProjectPath,
  validateBranchName,
  sanitizeCommitMessage,
  validateGitFiles,
  validateUrl,
  validatePort,
  validatePids,
  validateDevCommand,
} from '../security.js';

export const actionsApi = new Hono();

// ─────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────

/** Run a git command safely using array args (no shell interpolation) */
async function runGit(args: string[], cwd: string): Promise<{ ok: boolean; output: string; exitCode: number }> {
  const proc = Bun.spawn(['git', ...args], {
    cwd,
    stdout: 'pipe',
    stderr: 'pipe',
  });
  const output = await new Response(proc.stdout).text();
  const stderr = await new Response(proc.stderr).text();
  const exitCode = await proc.exited;
  return {
    ok: exitCode === 0,
    output: (output + stderr).trim(),
    exitCode,
  };
}

/** Validate path from request and return resolved path or error */
function requireValidPath(path: string | undefined | null) {
  if (!path) return { valid: false as const, error: 'path required' };
  const result = validateProjectPath(path);
  if (!result.valid) return { valid: false as const, error: result.error || 'Invalid path' };
  return { valid: true as const, resolved: result.resolved };
}

// ─────────────────────────────────────────────
// Editor / Launcher Actions
// ─────────────────────────────────────────────

const EDITORS: Record<string, string[]> = {
  vscode: [
    '/Applications/Visual Studio Code.app/Contents/Resources/app/bin/code',
    '/usr/local/bin/code',
  ],
  cursor: [
    '/Applications/Cursor.app/Contents/Resources/app/bin/cursor',
    '/usr/local/bin/cursor',
  ],
};

function findEditor(name: string): string | null {
  const paths = EDITORS[name];
  if (!paths) return null;
  for (const p of paths) {
    try { statSync(p); return p; } catch { /* next */ }
  }
  return null;
}

actionsApi.post('/open-editor', async (c) => {
  const { path, editor = 'vscode' } = await c.req.json();
  const check = requireValidPath(path);
  if (!check.valid) return c.json({ error: check.error }, 400);
  const bin = findEditor(editor);
  if (!bin) return c.json({ error: `${editor} not found` }, 404);
  Bun.spawn([bin, check.resolved]);
  return c.json({ ok: true });
});

actionsApi.post('/open-terminal', async (c) => {
  const { path } = await c.req.json();
  const check = requireValidPath(path);
  if (!check.valid) return c.json({ error: check.error }, 400);
  // Open an integrated terminal in VS Code at the project path
  const code = findEditor('vscode');
  if (code) {
    // Open the folder first (noop if already open), then open a new terminal via keybinding
    Bun.spawn([code, check.resolved]);
    // Small delay then send ctrl+` via AppleScript to toggle/open terminal panel
    setTimeout(() => {
      const script = `tell application "Visual Studio Code" to activate
delay 0.3
tell application "System Events"
  keystroke "\`" using control down
end tell`;
      Bun.spawn(['osascript', '-e', script]);
    }, 500);
  } else {
    Bun.spawn(['open', '-a', 'Terminal', check.resolved]);
  }
  return c.json({ ok: true });
});

actionsApi.post('/open-claude-terminal', async (c) => {
  const { path } = await c.req.json();
  const check = requireValidPath(path);
  if (!check.valid) return c.json({ error: check.error }, 400);

  // Use AppleScript's own "quoted form of" to safely escape the path.
  // We pass the path as a separate osascript argument to avoid embedding it
  // in the script string where it could break out of quotes.
  const script = `on run argv
    set dirPath to item 1 of argv
    tell application "Terminal"
      activate
      do script "cd " & quoted form of dirPath & " && claude"
    end tell
  end run`;
  Bun.spawn(['osascript', '-e', script, check.resolved]);
  return c.json({ ok: true });
});

actionsApi.post('/open-finder', async (c) => {
  const { path } = await c.req.json();
  const check = requireValidPath(path);
  if (!check.valid) return c.json({ error: check.error }, 400);
  Bun.spawn(['open', check.resolved]);
  return c.json({ ok: true });
});

actionsApi.post('/open-url', async (c) => {
  const { url } = await c.req.json();
  if (!validateUrl(url)) return c.json({ error: 'Invalid URL — must be http(s) or git SSH' }, 400);
  Bun.spawn(['open', url]);
  return c.json({ ok: true });
});

// ─────────────────────────────────────────────
// Dev Server Management
// ─────────────────────────────────────────────

actionsApi.post('/start-dev', async (c) => {
  const { path, command, projectId } = await c.req.json();
  if (!command) return c.json({ error: 'No dev command found' }, 400);

  const check = requireValidPath(path);
  if (!check.valid) return c.json({ error: check.error }, 400);

  const cmdCheck = validateDevCommand(command);
  if (!cmdCheck.valid) return c.json({ error: cmdCheck.error }, 400);

  if (projectId) {
    startProcess(projectId, check.resolved, command);
  } else {
    Bun.spawn(['sh', '-c', command], {
      cwd: check.resolved,
      stdout: 'ignore',
      stderr: 'ignore',
      stdin: 'ignore',
    });
  }
  return c.json({ ok: true });
});

// Terminal SSE stream
actionsApi.get('/terminal-stream/:projectId', async (c) => {
  const projectId = c.req.param('projectId');
  const stream = subscribe(projectId);
  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    },
  });
});

actionsApi.get('/terminal-buffer/:projectId', async (c) => {
  const projectId = c.req.param('projectId');
  return c.json({ lines: getBuffer(projectId) });
});

actionsApi.post('/terminal-stop/:projectId', async (c) => {
  const projectId = c.req.param('projectId');
  const stopped = stopProcess(projectId);
  return c.json({ ok: stopped });
});

actionsApi.get('/terminal-status/:projectId', async (c) => {
  const projectId = c.req.param('projectId');
  return c.json(getStatus(projectId));
});

// ─────────────────────────────────────────────
// Port Operations
// ─────────────────────────────────────────────

actionsApi.get('/port-check/:port', async (c) => {
  const port = parseInt(c.req.param('port'));
  if (!validatePort(port)) return c.json({ error: 'Invalid port' }, 400);
  try {
    const res = await fetch(`http://localhost:${port}`, {
      signal: AbortSignal.timeout(1500),
    });
    return c.json({ port, running: res.ok || res.status < 500 });
  } catch {
    return c.json({ port, running: false });
  }
});

actionsApi.get('/port-check-batch', async (c) => {
  const portsStr = c.req.query('ports') || '';
  const ports = portsStr.split(',').map(Number).filter((n) => validatePort(n));
  if (ports.length > 50) return c.json({ error: 'Too many ports (max 50)' }, 400);

  const results = await Promise.all(
    ports.map(async (port) => {
      try {
        const res = await fetch(`http://localhost:${port}`, {
          signal: AbortSignal.timeout(1200),
        });
        return { port, running: res.ok || res.status < 500 };
      } catch {
        return { port, running: false };
      }
    }),
  );
  return c.json(results);
});

actionsApi.post('/set-port', async (c) => {
  const { projectId, port } = await c.req.json();
  if (port && !validatePort(port)) return c.json({ error: 'Invalid port' }, 400);
  const db = (await import('../db/schema.js')).getDb();
  db.prepare(`
    INSERT INTO user_overrides (project_id, custom_dev_port)
    VALUES (?, ?)
    ON CONFLICT(project_id) DO UPDATE SET custom_dev_port = excluded.custom_dev_port
  `).run(projectId, port || null);
  if (port) {
    db.prepare('UPDATE projects SET dev_port = ? WHERE id = ?').run(port, projectId);
  }
  return c.json({ ok: true });
});

actionsApi.get('/port-info/:port', async (c) => {
  const port = parseInt(c.req.param('port'));
  if (!validatePort(port)) return c.json({ error: 'Invalid port' }, 400);
  try {
    const proc = Bun.spawn(['lsof', '-i', `:${port}`, '-P', '-n', '-sTCP:LISTEN'], {
      stdout: 'pipe', stderr: 'pipe',
    });
    const output = await new Response(proc.stdout).text();
    await proc.exited;
    const lines = output.trim().split('\n').slice(1);
    if (lines.length === 0) return c.json({ port, process: null });

    const parts = lines[0].split(/\s+/);
    return c.json({
      port,
      process: {
        command: parts[0] || null,
        pid: parts[1] ? parseInt(parts[1]) : null,
        user: parts[2] || null,
      },
    });
  } catch {
    return c.json({ port, process: null });
  }
});

actionsApi.post('/port-kill', async (c) => {
  const { port } = await c.req.json();
  if (!validatePort(port)) return c.json({ error: 'Invalid port' }, 400);
  try {
    const proc = Bun.spawn(['lsof', '-ti', `:${port}`], { stdout: 'pipe', stderr: 'pipe' });
    const raw = (await new Response(proc.stdout).text()).trim();
    await proc.exited;

    // Only allow validated numeric PIDs
    const pids = validatePids(raw);
    if (pids.length === 0) return c.json({ ok: true, killed: 0 });

    Bun.spawn(['kill', '-9', ...pids]);
    return c.json({ ok: true, killed: pids.length });
  } catch {
    return c.json({ ok: false, error: 'Failed to kill process' }, 500);
  }
});

// ─────────────────────────────────────────────
// File Explorer
// ─────────────────────────────────────────────

actionsApi.get('/files', async (c) => {
  const projectPath = c.req.query('path');
  const check = requireValidPath(projectPath);
  if (!check.valid) return c.json({ error: check.error }, 400);

  interface FileEntry {
    name: string;
    path: string;
    size: number;
    isDir: boolean;
    ext: string;
    children?: FileEntry[];
  }

  const IGNORE = new Set([
    'node_modules', '.git', '.next', 'dist', 'build', '.cache',
    '.turbo', '.vercel', '.DS_Store', '__pycache__', 'coverage',
  ]);

  const rootPath = check.resolved;

  function scanDir(dir: string, depth = 0): FileEntry[] {
    if (depth > 3) return [];

    // Prevent traversal outside project root via symlinks
    const resolvedDir = resolve(normalize(dir));
    if (!resolvedDir.startsWith(rootPath)) return [];

    try {
      const entries = readdirSync(resolvedDir);
      return entries
        .filter((e) => !e.startsWith('.') || e === '.env.example')
        .filter((e) => !IGNORE.has(e))
        .map((e) => {
          const fullPath = join(resolvedDir, e);
          try {
            const stat = statSync(fullPath);
            const entry: FileEntry = {
              name: e,
              path: fullPath.replace(rootPath, ''),
              size: stat.size,
              isDir: stat.isDirectory(),
              ext: stat.isDirectory() ? '' : extname(e).slice(1),
            };
            if (stat.isDirectory()) {
              entry.children = scanDir(fullPath, depth + 1);
              entry.size = entry.children.reduce((sum, ch) => sum + ch.size, 0);
            }
            return entry;
          } catch {
            return null;
          }
        })
        .filter(Boolean)
        .sort((a, b) => {
          if (a!.isDir !== b!.isDir) return a!.isDir ? -1 : 1;
          return a!.name.localeCompare(b!.name);
        }) as FileEntry[];
    } catch {
      return [];
    }
  }

  const files = scanDir(rootPath);

  const extStats: Record<string, { count: number; size: number }> = {};
  function countExts(entries: FileEntry[]) {
    for (const e of entries) {
      if (e.isDir && e.children) {
        countExts(e.children);
      } else if (e.ext) {
        if (!extStats[e.ext]) extStats[e.ext] = { count: 0, size: 0 };
        extStats[e.ext].count++;
        extStats[e.ext].size += e.size;
      }
    }
  }
  countExts(files);

  return c.json({ files, extStats });
});

// ─────────────────────────────────────────────
// Git Init
// ─────────────────────────────────────────────

actionsApi.post('/git-init', async (c) => {
  const { path } = await c.req.json<{ path: string }>();
  const check = requireValidPath(path);
  if (!check.valid) return c.json({ error: check.error }, 400);

  try {
    const result = await runGit(['init'], check.resolved);
    if (!result.ok) return c.json({ ok: false, error: result.output }, 500);

    // Update project in DB to reflect git status
    const db = (await import('../db/schema.js')).getDb();
    db.prepare('UPDATE projects SET has_git = 1, git_branch = ? WHERE path = ?')
      .run('main', check.resolved);

    return c.json({ ok: true, output: result.output });
  } catch {
    return c.json({ ok: false, error: 'Failed to initialize git' }, 500);
  }
});

// ─────────────────────────────────────────────
// Git Operations — all use array-based spawn (no shell interpolation)
// ─────────────────────────────────────────────

actionsApi.get('/git-log', async (c) => {
  const projectPath = c.req.query('path');
  const check = requireValidPath(projectPath);
  if (!check.valid) return c.json({ error: check.error }, 400);

  try {
    const result = await runGit(
      ['log', '--oneline', '--shortstat', '-n', '15', '--format=%H|%h|%s|%an|%ar'],
      check.resolved,
    );
    if (!result.ok) return c.json([]);

    const lines = result.output.trim().split('\n');
    const commits: Array<{
      hash: string; short: string; message: string;
      author: string; ago: string;
      insertions: number; deletions: number; filesChanged: number;
    }> = [];

    let current: (typeof commits)[0] | null = null;
    for (const line of lines) {
      if (line.includes('|')) {
        if (current) commits.push(current);
        const [hash, short, message, author, ago] = line.split('|');
        current = { hash, short, message, author, ago, insertions: 0, deletions: 0, filesChanged: 0 };
      } else if (line.trim() && current) {
        const filesMatch = line.match(/(\d+) files? changed/);
        const insMatch = line.match(/(\d+) insertions?\(\+\)/);
        const delMatch = line.match(/(\d+) deletions?\(-\)/);
        current.filesChanged = filesMatch ? parseInt(filesMatch[1]) : 0;
        current.insertions = insMatch ? parseInt(insMatch[1]) : 0;
        current.deletions = delMatch ? parseInt(delMatch[1]) : 0;
      }
    }
    if (current) commits.push(current);

    return c.json(commits);
  } catch {
    return c.json([]);
  }
});

actionsApi.get('/git-status', async (c) => {
  const path = c.req.query('path');
  const check = requireValidPath(path);
  if (!check.valid) return c.json({ error: check.error }, 400);

  try {
    const result = await runGit(['status', '--porcelain'], check.resolved);
    const staged: { file: string; status: string }[] = [];
    const unstaged: { file: string; status: string }[] = [];

    for (const line of result.output.trim().split('\n')) {
      if (!line) continue;
      const x = line[0];
      const y = line[1];
      const file = line.slice(3).trim();
      const displayFile = file.includes(' -> ') ? file.split(' -> ')[1] : file;

      if (x !== ' ' && x !== '?') staged.push({ file: displayFile, status: x });
      if (y !== ' ' && y !== '?') unstaged.push({ file: displayFile, status: y });
      if (x === '?' && y === '?') unstaged.push({ file: displayFile, status: '?' });
    }

    return c.json({ staged, unstaged });
  } catch {
    return c.json({ staged: [], unstaged: [] });
  }
});

actionsApi.post('/git-stage', async (c) => {
  const { path, files, unstage } = await c.req.json<{ path: string; files: string[]; unstage?: boolean }>();
  const check = requireValidPath(path);
  if (!check.valid) return c.json({ error: check.error }, 400);

  const filesCheck = validateGitFiles(files);
  if (!filesCheck.valid) return c.json({ error: filesCheck.error }, 400);

  try {
    if (unstage) {
      await runGit(['restore', '--staged', '--', ...files], check.resolved);
    } else {
      await runGit(['add', '--', ...files], check.resolved);
    }
    return c.json({ ok: true });
  } catch {
    return c.json({ ok: false, error: 'Failed to stage files' }, 500);
  }
});

actionsApi.post('/git-commit', async (c) => {
  const { path, message } = await c.req.json<{ path: string; message: string }>();
  const check = requireValidPath(path);
  if (!check.valid) return c.json({ error: check.error }, 400);

  const sanitized = sanitizeCommitMessage(message);
  if (!sanitized.trim()) return c.json({ error: 'Message required' }, 400);

  try {
    const result = await runGit(['commit', '-m', sanitized], check.resolved);
    const hashMatch = result.output.match(/\[.+? ([a-f0-9]+)\]/);
    return c.json({ ok: result.ok, hash: hashMatch?.[1] || null, output: result.output });
  } catch {
    return c.json({ ok: false, error: 'Commit failed' }, 500);
  }
});

actionsApi.post('/git-push', async (c) => {
  const { path } = await c.req.json<{ path: string }>();
  const check = requireValidPath(path);
  if (!check.valid) return c.json({ error: check.error }, 400);
  try {
    const result = await runGit(['push'], check.resolved);
    return c.json({ ok: result.ok, output: result.output });
  } catch {
    return c.json({ ok: false, error: 'Push failed' }, 500);
  }
});

actionsApi.post('/git-pull', async (c) => {
  const { path } = await c.req.json<{ path: string }>();
  const check = requireValidPath(path);
  if (!check.valid) return c.json({ error: check.error }, 400);
  try {
    const result = await runGit(['pull'], check.resolved);
    return c.json({ ok: result.ok, output: result.output });
  } catch {
    return c.json({ ok: false, error: 'Pull failed' }, 500);
  }
});

actionsApi.get('/git-branches', async (c) => {
  const path = c.req.query('path');
  const check = requireValidPath(path);
  if (!check.valid) return c.json({ error: check.error }, 400);

  try {
    const result = await runGit(
      ['branch', '-a', '--format=%(refname:short)|%(HEAD)'],
      check.resolved,
    );
    if (!result.ok) return c.json({ current: '', branches: [] });

    let current = '';
    const branches: { name: string; isRemote: boolean; isCurrent: boolean }[] = [];

    for (const line of result.output.trim().split('\n')) {
      if (!line) continue;
      const [name, head] = line.split('|');
      const cleanName = name.trim().replace(/^'|'$/g, '');
      const isCurrent = head?.trim() === '*';
      if (isCurrent) current = cleanName;
      if (cleanName.includes('HEAD')) continue;

      const isRemote = cleanName.startsWith('origin/');
      if (isRemote) {
        const localName = cleanName.replace('origin/', '');
        if (branches.some((b) => b.name === localName)) continue;
      }

      branches.push({
        name: isRemote ? cleanName.replace('origin/', '') : cleanName,
        isRemote,
        isCurrent,
      });
    }

    return c.json({ current, branches });
  } catch {
    return c.json({ current: '', branches: [] });
  }
});

actionsApi.post('/git-checkout', async (c) => {
  const { path, branch, create } = await c.req.json<{ path: string; branch: string; create?: boolean }>();
  const check = requireValidPath(path);
  if (!check.valid) return c.json({ error: check.error }, 400);

  if (!validateBranchName(branch)) {
    return c.json({ error: 'Invalid branch name' }, 400);
  }

  try {
    const args = create ? ['checkout', '-b', branch] : ['checkout', branch];
    const result = await runGit(args, check.resolved);
    return c.json({ ok: result.ok, output: result.output });
  } catch {
    return c.json({ ok: false, error: 'Checkout failed' }, 500);
  }
});

// ═══════════════════════════════════
// Integrations Status
// ═══════════════════════════════════

interface IntegrationDef {
  id: string;
  name: string;
  cli: string;
  authCmd: string[];
  parseAccount: (output: string) => string | undefined;
}

const INTEGRATIONS: IntegrationDef[] = [
  {
    id: 'github',
    name: 'GitHub',
    cli: 'gh',
    authCmd: ['gh', 'auth', 'status'],
    parseAccount: (out) => {
      const match = out.match(/Logged in to github\.com account (\S+)/i)
        || out.match(/Logged in to github\.com as (\S+)/i)
        || out.match(/account (\S+)/i);
      return match?.[1]?.replace(/\(.*\)/, '').trim();
    },
  },
  {
    id: 'vercel',
    name: 'Vercel',
    cli: 'vercel',
    authCmd: ['vercel', 'whoami'],
    parseAccount: (out) => out.trim() || undefined,
  },
  {
    id: 'cloudflare',
    name: 'Cloudflare',
    cli: 'wrangler',
    authCmd: ['wrangler', 'whoami'],
    parseAccount: (out) => {
      const match = out.match(/(\S+@\S+\.\S+)/) || out.match(/👋\s+You are logged in with .+?\((.+?)\)/);
      return match?.[1]?.trim();
    },
  },
  {
    id: 'neon',
    name: 'Neon',
    cli: 'neonctl',
    authCmd: ['neonctl', 'me'],
    parseAccount: (out) => {
      const match = out.match(/(\S+@\S+\.\S+)/);
      return match?.[1]?.trim();
    },
  },
  {
    id: 'supabase',
    name: 'Supabase',
    cli: 'supabase',
    authCmd: ['supabase', 'projects', 'list'],
    parseAccount: () => 'connected',
  },
  {
    id: 'netlify',
    name: 'Netlify',
    cli: 'netlify',
    authCmd: ['netlify', 'status'],
    parseAccount: (out) => {
      const match = out.match(/Email:\s+(\S+)/i) || out.match(/Logged in as\s+(\S+)/i);
      return match?.[1]?.trim();
    },
  },
  {
    id: 'railway',
    name: 'Railway',
    cli: 'railway',
    authCmd: ['railway', 'whoami'],
    parseAccount: (out) => out.trim() || undefined,
  },
  {
    id: 'flyio',
    name: 'Fly.io',
    cli: 'flyctl',
    authCmd: ['flyctl', 'auth', 'whoami'],
    parseAccount: (out) => out.trim() || undefined,
  },
  {
    id: 'planetscale',
    name: 'PlanetScale',
    cli: 'pscale',
    authCmd: ['pscale', 'auth', 'check'],
    parseAccount: (out) => {
      const match = out.match(/(\S+@\S+\.\S+)/);
      return match?.[1]?.trim() || (out.includes('authenticated') ? 'connected' : undefined);
    },
  },
  {
    id: 'turso',
    name: 'Turso',
    cli: 'turso',
    authCmd: ['turso', 'auth', 'whoami'],
    parseAccount: (out) => out.trim() || undefined,
  },
];

async function checkCliInstalled(name: string): Promise<boolean> {
  try {
    const proc = Bun.spawn(['which', name], { stdout: 'pipe', stderr: 'pipe' });
    await proc.exited;
    return proc.exitCode === 0;
  } catch {
    return false;
  }
}

async function checkAuth(def: IntegrationDef): Promise<{ authenticated: boolean; account?: string }> {
  try {
    const proc = Bun.spawn(def.authCmd, {
      stdout: 'pipe',
      stderr: 'pipe',
      env: { ...process.env, NO_COLOR: '1' },
    });
    const [stdout, stderr] = await Promise.all([
      new Response(proc.stdout).text(),
      new Response(proc.stderr).text(),
    ]);
    await proc.exited;
    const output = stdout + '\n' + stderr;

    if (proc.exitCode !== 0) {
      return { authenticated: false };
    }

    const account = def.parseAccount(output);
    return { authenticated: true, account };
  } catch {
    return { authenticated: false };
  }
}

actionsApi.get('/integrations/status', async (c) => {
  const results = await Promise.all(
    INTEGRATIONS.map(async (def) => {
      const cliInstalled = await checkCliInstalled(def.cli);
      if (!cliInstalled) {
        return { id: def.id, name: def.name, cliInstalled: false, authenticated: false };
      }
      const auth = await checkAuth(def);
      return { id: def.id, name: def.name, cliInstalled: true, ...auth };
    }),
  );
  return c.json(results);
});

// ═══════════════════════════════════
// Dependency Health
// ═══════════════════════════════════

actionsApi.get('/deps-outdated', async (c) => {
  const projectPath = c.req.query('path');
  const check = requireValidPath(projectPath);
  if (!check.valid) return c.json({ error: check.error }, 400);

  try {
    // npm outdated --json returns exit code 1 when outdated deps exist, so use nothrow
    const proc = Bun.spawn(['npm', 'outdated', '--json'], {
      cwd: check.resolved,
      stdout: 'pipe',
      stderr: 'pipe',
    });
    const output = await new Response(proc.stdout).text();
    await proc.exited;

    if (!output.trim()) return c.json({ packages: [], total: 0, major: 0, minor: 0, patch: 0 });

    const data = JSON.parse(output);
    const packages: Array<{
      name: string;
      current: string;
      wanted: string;
      latest: string;
      type: string;
      severity: 'major' | 'minor' | 'patch';
    }> = [];

    let major = 0, minor = 0, patch = 0;

    for (const [name, info] of Object.entries(data)) {
      const d = info as Record<string, string>;
      const cur = d.current || '0.0.0';
      const lat = d.latest || cur;
      const curMajor = parseInt(cur.split('.')[0]) || 0;
      const latMajor = parseInt(lat.split('.')[0]) || 0;
      const curMinor = parseInt(cur.split('.')[1]) || 0;
      const latMinor = parseInt(lat.split('.')[1]) || 0;

      let severity: 'major' | 'minor' | 'patch' = 'patch';
      if (latMajor > curMajor) { severity = 'major'; major++; }
      else if (latMinor > curMinor) { severity = 'minor'; minor++; }
      else { patch++; }

      packages.push({
        name,
        current: cur,
        wanted: d.wanted || cur,
        latest: lat,
        type: d.type || 'dependencies',
        severity,
      });
    }

    // Sort: major first, then minor, then patch
    packages.sort((a, b) => {
      const order = { major: 0, minor: 1, patch: 2 };
      return order[a.severity] - order[b.severity];
    });

    return c.json({ packages, total: packages.length, major, minor, patch });
  } catch {
    return c.json({ packages: [], total: 0, major: 0, minor: 0, patch: 0 });
  }
});

// ═══════════════════════════════════
// Git Diff
// ═══════════════════════════════════

actionsApi.get('/git-diff', async (c) => {
  const path = c.req.query('path');
  const check = requireValidPath(path);
  if (!check.valid) return c.json({ error: check.error }, 400);

  const staged = c.req.query('staged') === 'true';
  const file = c.req.query('file');

  if (file) {
    const fileCheck = validateGitFiles([file]);
    if (!fileCheck.valid) return c.json({ error: fileCheck.error }, 400);
  }

  try {
    const args = ['diff', ...(staged ? ['--cached'] : []), '--', ...(file ? [file] : [])];
    const result = await runGit(args, check.resolved);
    const maxLen = 50_000;
    const truncated = result.output.length > maxLen;
    return c.json({
      diff: truncated ? result.output.slice(0, maxLen) : result.output,
      truncated,
    });
  } catch {
    return c.json({ diff: '', truncated: false });
  }
});

// ═══════════════════════════════════
// Auto Commit Message Generation
// ═══════════════════════════════════

actionsApi.post('/generate-commit-msg', async (c) => {
  const { path } = await c.req.json();
  const check = requireValidPath(path);
  if (!check.valid) return c.json({ error: check.error }, 400);

  try {
    // Get name-status for add/modify/delete classification
    const nameStatus = await runGit(['diff', '--cached', '--name-status'], check.resolved);
    const stat = await runGit(['diff', '--cached', '--stat'], check.resolved);

    if (!nameStatus.output.trim()) {
      return c.json({ message: '' });
    }

    const files: { status: string; file: string; ext: string }[] = [];
    for (const line of nameStatus.output.trim().split('\n')) {
      if (!line.trim()) continue;
      const [status, ...rest] = line.split('\t');
      const file = rest.join('\t').trim();
      const ext = file.includes('.') ? file.split('.').pop()! : '';
      files.push({ status: status.charAt(0), file, ext });
    }

    if (files.length === 0) return c.json({ message: '' });

    // Parse insertions/deletions from stat
    const statMatch = stat.output.match(/(\d+) files? changed(?:, (\d+) insertions?\(\+\))?(?:, (\d+) deletions?\(-\))?/);
    const insertions = statMatch?.[2] ? parseInt(statMatch[2]) : 0;
    const deletions = statMatch?.[3] ? parseInt(statMatch[3]) : 0;

    // Classify changes
    const added = files.filter((f) => f.status === 'A');
    const deleted = files.filter((f) => f.status === 'D');
    const modified = files.filter((f) => f.status === 'M');
    const allExts = [...new Set(files.map((f) => f.ext).filter(Boolean))];

    // Determine prefix
    let prefix = 'chore';
    const allPaths = files.map((f) => f.file);
    const isTest = allPaths.every((f) => f.includes('test') || f.includes('spec') || f.includes('__tests__'));
    const isStyle = allExts.every((e) => ['css', 'scss', 'less', 'sass'].includes(e));
    const isDocs = allExts.every((e) => ['md', 'txt', 'rst'].includes(e));
    const isConfig = allPaths.every((f) => f.includes('config') || f.includes('.rc') || f.startsWith('.'));

    if (isTest) prefix = 'test';
    else if (isStyle) prefix = 'style';
    else if (isDocs) prefix = 'docs';
    else if (isConfig) prefix = 'chore';
    else if (added.length > 0 && modified.length === 0 && deleted.length === 0) prefix = 'feat';
    else if (deleted.length > modified.length && added.length === 0) prefix = 'refactor';
    else if (deletions > insertions * 1.5) prefix = 'refactor';

    // Generate message
    let message: string;
    if (files.length === 1) {
      const f = files[0];
      const action = f.status === 'A' ? 'add' : f.status === 'D' ? 'remove' : 'update';
      message = `${prefix}: ${action} ${f.file}`;
    } else if (allExts.length === 1 && allExts[0]) {
      message = `${prefix}: update ${files.length} ${allExts[0]} files`;
    } else {
      // Group by directory
      const dirs = [...new Set(files.map((f) => f.file.split('/').slice(0, -1).join('/') || '.'))];
      if (dirs.length === 1 && dirs[0] !== '.') {
        message = `${prefix}: update ${dirs[0]} (${files.length} files)`;
      } else {
        const parts: string[] = [];
        if (added.length > 0) parts.push(`${added.length} added`);
        if (modified.length > 0) parts.push(`${modified.length} modified`);
        if (deleted.length > 0) parts.push(`${deleted.length} deleted`);
        message = `${prefix}: ${parts.join(', ')}`;
      }
    }

    return c.json({ message });
  } catch {
    return c.json({ message: 'chore: update files' });
  }
});

// ─────────────────────────────────────────────
// Cross-Project Search (native — no external dependencies)
// ─────────────────────────────────────────────

const SEARCH_IGNORE = new Set([
  'node_modules', '.git', 'dist', 'build', '.next', '.cache',
  '.turbo', '.vercel', 'coverage', '__pycache__', '.DS_Store',
]);

const SEARCH_SKIP_EXT = new Set([
  '.lock', '.min.js', '.min.css', '.map', '.woff', '.woff2',
  '.ttf', '.otf', '.eot', '.png', '.jpg', '.jpeg', '.gif',
  '.svg', '.ico', '.mp3', '.mp4', '.webm', '.zip', '.tar',
  '.gz', '.pdf', '.db', '.sqlite', '.sqlite3',
]);

const MAX_FILE_SIZE = 1_000_000; // 1MB
const MAX_RESULTS = 100;
const MAX_MATCHES_PER_FILE = 3;

function matchesGlob(filename: string, glob: string): boolean {
  // Simple glob: *.ext
  if (glob.startsWith('*.')) {
    return filename.endsWith(glob.slice(1));
  }
  return filename === glob;
}

async function searchDir(
  dir: string,
  query: string,
  queryLower: string,
  glob: string | undefined,
  proj: { id: string; name: string; type: string },
  projRoot: string,
  results: { project: string; projectId: string; projectType: string; file: string; line: number; text: string }[],
  depth: number,
) {
  if (depth > 8 || results.length >= MAX_RESULTS) return;

  let entries: import('fs').Dirent[];
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }

  for (const entry of entries) {
    if (results.length >= MAX_RESULTS) return;
    if (SEARCH_IGNORE.has(entry.name) || entry.name.startsWith('.')) continue;

    const fullPath = join(dir, entry.name);

    if (entry.isDirectory()) {
      await searchDir(fullPath, query, queryLower, glob, proj, projRoot, results, depth + 1);
      continue;
    }

    if (!entry.isFile()) continue;

    // Skip binary/large extensions
    const ext = extname(entry.name).toLowerCase();
    if (SEARCH_SKIP_EXT.has(ext)) continue;

    // Apply glob filter
    if (glob && !matchesGlob(entry.name, glob)) continue;

    // Check file size
    try {
      const stat = statSync(fullPath);
      if (stat.size > MAX_FILE_SIZE || stat.size === 0) continue;
    } catch {
      continue;
    }

    // Read and search file
    try {
      const content = await Bun.file(fullPath).text();
      const lines = content.split('\n');
      let matchCount = 0;

      for (let i = 0; i < lines.length && matchCount < MAX_MATCHES_PER_FILE; i++) {
        if (lines[i].toLowerCase().includes(queryLower)) {
          results.push({
            project: proj.name,
            projectId: proj.id,
            projectType: proj.type,
            projectPath: projRoot,
            file: fullPath.slice(projRoot.length + 1),
            line: i + 1,
            text: lines[i].trim().slice(0, 200),
          });
          matchCount++;
          if (results.length >= MAX_RESULTS) return;
        }
      }
    } catch {
      // Skip unreadable files
    }
  }
}

actionsApi.get('/search', async (c) => {
  const q = c.req.query('q')?.trim();
  const glob = c.req.query('glob')?.trim();
  if (!q || q.length < 2) return c.json({ results: [], total: 0, truncated: false });

  const db = (await import('../db/schema.js')).getDb();
  const projects = db.prepare('SELECT id, name, path, type FROM projects').all() as {
    id: string; name: string; path: string; type: string;
  }[];
  if (projects.length === 0) return c.json({ results: [], total: 0, truncated: false });

  const results: {
    project: string; projectId: string; projectType: string;
    projectPath: string; file: string; line: number; text: string;
  }[] = [];

  const queryLower = q.toLowerCase();

  // Search all projects concurrently
  await Promise.all(
    projects.map((p) =>
      searchDir(p.path, q, queryLower, glob, { id: p.id, name: p.name, type: p.type }, p.path, results, 0)
    ),
  );

  // Sort: exact matches first, then alphabetically by project
  results.sort((a, b) => {
    const aExact = a.text.includes(q) ? 0 : 1;
    const bExact = b.text.includes(q) ? 0 : 1;
    if (aExact !== bExact) return aExact - bExact;
    return a.project.localeCompare(b.project) || a.file.localeCompare(b.file) || a.line - b.line;
  });

  return c.json({ results, total: results.length, truncated: results.length >= MAX_RESULTS });
});

// ─────────────────────────────────────────────
// Project Notes
// ─────────────────────────────────────────────

actionsApi.get('/notes/:projectId', async (c) => {
  const projectId = c.req.param('projectId');
  if (!projectId) return c.json({ error: 'projectId required' }, 400);

  const db = (await import('../db/schema.js')).getDb();
  const row = db.prepare('SELECT notes FROM user_overrides WHERE project_id = ?').get(projectId) as { notes: string | null } | undefined;
  return c.json({ notes: row?.notes || '' });
});

actionsApi.post('/save-notes', async (c) => {
  const { projectId, notes } = await c.req.json<{ projectId: string; notes: string }>();
  if (!projectId) return c.json({ error: 'projectId required' }, 400);

  const db = (await import('../db/schema.js')).getDb();
  db.prepare(`
    INSERT INTO user_overrides (project_id, notes)
    VALUES (?, ?)
    ON CONFLICT(project_id) DO UPDATE SET notes = excluded.notes
  `).run(projectId, notes);

  return c.json({ ok: true });
});

// ─────────────────────────────────────────────
// Batch Actions
// ─────────────────────────────────────────────

const BATCH_ACTIONS = new Set(['pull', 'open-vscode', 'open-terminal', 'npm-install']);

actionsApi.post('/batch', async (c) => {
  const { action, projectIds } = await c.req.json();

  if (!action || !BATCH_ACTIONS.has(action)) {
    return c.json({ error: 'Invalid action' }, 400);
  }
  if (!Array.isArray(projectIds) || projectIds.length === 0 || projectIds.length > 50) {
    return c.json({ error: 'Invalid project list (1-50)' }, 400);
  }

  const db = (await import('../db/schema.js')).getDb();
  const projects = projectIds.map((id: string) => {
    const row = db.prepare('SELECT id, path FROM projects WHERE id = ?').get(id) as { id: string; path: string } | undefined;
    return row;
  }).filter(Boolean) as { id: string; path: string }[];

  if (projects.length === 0) {
    return c.json({ error: 'No valid projects found' }, 400);
  }

  const results = await Promise.allSettled(
    projects.map(async (p) => {
      const pathCheck = requireValidPath(p.path);
      if (!pathCheck.valid) return { projectId: p.id, ok: false, output: pathCheck.error };

      switch (action) {
        case 'pull': {
          const git = await runGit(['pull'], pathCheck.resolved);
          return { projectId: p.id, ok: git.ok, output: git.output.slice(0, 200) };
        }
        case 'open-vscode': {
          const bin = findEditor('vscode');
          if (!bin) return { projectId: p.id, ok: false, output: 'VS Code not found' };
          Bun.spawn([bin, pathCheck.resolved]);
          return { projectId: p.id, ok: true };
        }
        case 'open-terminal': {
          Bun.spawn(['open', '-a', 'Terminal', pathCheck.resolved]);
          return { projectId: p.id, ok: true };
        }
        case 'npm-install': {
          const proc = Bun.spawn(['npm', 'install'], {
            cwd: pathCheck.resolved,
            stdout: 'pipe',
            stderr: 'pipe',
          });
          const output = await new Response(proc.stdout).text();
          const exitCode = await proc.exited;
          return { projectId: p.id, ok: exitCode === 0, output: output.slice(0, 200) };
        }
        default:
          return { projectId: p.id, ok: false, output: 'Unknown action' };
      }
    }),
  );

  return c.json({
    results: results.map((r) =>
      r.status === 'fulfilled' ? r.value : { projectId: '', ok: false, output: 'Failed' },
    ),
  });
});
