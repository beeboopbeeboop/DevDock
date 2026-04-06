import type { Project, ProjectType } from '../shared/types.js';
import { startProcess, stopProcess, getStatus, getBuffer } from './processManager.js';
import { validateDevCommand, validateProjectPath, validatePort, validatePids } from './security.js';
import { logCommand, getProjectAliases, getProjects, recordActivity } from './db/queries.js';

// ──────────────────────────────────────
// Types
// ──────────────────────────────────────

export interface VerbStep {
  action: 'kill-port' | 'rm-dirs' | 'start-dev' | 'run-command' | 'noop';
  args?: Record<string, unknown>;
  message?: string;
}

export interface StepResult {
  ok: boolean;
  message: string;
}

export interface VerbResult {
  ok: boolean;
  steps: StepResult[];
  message: string;
  projectId?: string;
  projectName?: string;
}

export interface FuzzyResult {
  project: Project;
  ambiguous?: false;
}

export interface AmbiguousResult {
  ambiguous: true;
  candidates: { id: string; name: string; score: number }[];
}

// ──────────────────────────────────────
// Kill Port (shared utility)
// ──────────────────────────────────────

export async function killPort(port: number): Promise<{ ok: boolean; killed: number }> {
  if (!validatePort(port)) return { ok: false, killed: 0 };
  try {
    const proc = Bun.spawn(['lsof', '-ti', `:${port}`], { stdout: 'pipe', stderr: 'pipe' });
    const raw = (await new Response(proc.stdout).text()).trim();
    await proc.exited; // lsof exits 1 when no matches — that's fine
    if (!raw) return { ok: true, killed: 0 };
    const pids = validatePids(raw);
    if (pids.length === 0) return { ok: true, killed: 0 };
    Bun.spawn(['kill', '-9', ...pids]);
    return { ok: true, killed: pids.length };
  } catch {
    // Even if lsof fails, port is likely clear
    return { ok: true, killed: 0 };
  }
}

// ──────────────────────────────────────
// Reset Recipes by Project Type
// ──────────────────────────────────────

const RESET_RECIPES: Record<ProjectType, VerbStep[]> = {
  'nextjs': [
    { action: 'kill-port', message: 'Killing port' },
    { action: 'rm-dirs', args: { dirs: ['.next'] }, message: 'Clearing .next cache' },
    { action: 'start-dev', message: 'Starting dev server' },
  ],
  'vite-react': [
    { action: 'kill-port', message: 'Killing port' },
    { action: 'rm-dirs', args: { dirs: ['node_modules/.vite', 'dist'] }, message: 'Clearing Vite cache' },
    { action: 'start-dev', message: 'Starting dev server' },
  ],
  'framer-plugin': [
    { action: 'kill-port', message: 'Killing port' },
    { action: 'rm-dirs', args: { dirs: ['node_modules/.vite', 'dist'] }, message: 'Clearing Vite cache' },
    { action: 'start-dev', message: 'Starting dev server' },
  ],
  'hono-server': [
    { action: 'kill-port', message: 'Killing port' },
    { action: 'rm-dirs', args: { dirs: ['node_modules/.vite'] }, message: 'Clearing Vite cache' },
    { action: 'start-dev', message: 'Starting dev server' },
  ],
  'cloudflare-worker': [
    { action: 'kill-port', message: 'Killing port' },
    { action: 'rm-dirs', args: { dirs: ['.wrangler'] }, message: 'Clearing Wrangler cache' },
    { action: 'start-dev', message: 'Starting dev server' },
  ],
  'static-site': [
    { action: 'kill-port', message: 'Killing port' },
    { action: 'rm-dirs', args: { dirs: ['dist', '.cache'] }, message: 'Clearing build output' },
    { action: 'start-dev', message: 'Starting dev server' },
  ],
  'node-package': [
    { action: 'kill-port', message: 'Killing port' },
    { action: 'rm-dirs', args: { dirs: ['dist'] }, message: 'Clearing dist' },
    { action: 'start-dev', message: 'Starting dev server' },
  ],
  'cep-plugin': [
    { action: 'noop', message: 'CEP plugin — restart manually in After Effects' },
  ],
  'swift-app': [
    { action: 'rm-dirs', args: { dirs: ['.build'] }, message: 'Clearing Swift build' },
    { action: 'run-command', args: { command: 'swift build' }, message: 'Building' },
  ],
  'unknown': [
    { action: 'kill-port', message: 'Killing port' },
    { action: 'start-dev', message: 'Starting dev server' },
  ],
};

// ──────────────────────────────────────
// Known Verbs
// ──────────────────────────────────────

const KNOWN_VERBS = new Set([
  'reset', 'start', 'stop', 'status', 'logs', 'open',
  'pull', 'push', 'commit', 'deploy',
]);

export function isKnownVerb(verb: string): boolean {
  return KNOWN_VERBS.has(verb);
}

// Levenshtein distance for typo correction
function levenshtein(a: string, b: string): number {
  const m = a.length, n = b.length;
  const d: number[][] = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0));
  for (let i = 0; i <= m; i++) d[i][0] = i;
  for (let j = 0; j <= n; j++) d[0][j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      d[i][j] = Math.min(
        d[i - 1][j] + 1,
        d[i][j - 1] + 1,
        d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1),
      );
    }
  }
  return d[m][n];
}

export function suggestVerb(input: string): string | null {
  const lower = input.toLowerCase();
  let best: string | null = null;
  let bestDist = Infinity;
  for (const verb of KNOWN_VERBS) {
    const dist = levenshtein(lower, verb);
    if (dist < bestDist && dist <= 2) { // max 2 edits
      bestDist = dist;
      best = verb;
    }
  }
  return best;
}

// ──────────────────────────────────────
// Fuzzy Project Resolution
// ──────────────────────────────────────

function fuzzyScore(query: string, target: string): number {
  const q = query.toLowerCase();
  const t = target.toLowerCase();
  if (t === q) return 100;
  if (t.startsWith(q)) return 90;
  if (t.includes(q)) return 70;
  // Word boundary matching
  const words = t.split(/[-_\s\/]+/);
  for (const word of words) {
    if (word.startsWith(q)) return 60;
  }
  // Ordered char match
  let qi = 0;
  for (let ti = 0; ti < t.length && qi < q.length; ti++) {
    if (t[ti] === q[qi]) qi++;
  }
  if (qi === q.length) return 50 + (q.length / t.length) * 20;
  return 0;
}

export function resolveProjectFuzzy(
  target: string,
  projects: Project[],
  aliasMap: Map<string, string>,
): FuzzyResult | AmbiguousResult {
  // 1. Exact alias match
  const aliasMatch = aliasMap.get(target.toLowerCase());
  if (aliasMatch) {
    const project = projects.find(p => p.id === aliasMatch);
    if (project) return { project };
  }

  // 2. Exact id or name match
  const exact = projects.find(p =>
    p.id === target || p.name.toLowerCase() === target.toLowerCase()
  );
  if (exact) return { project: exact };

  // 3. Fuzzy match
  const scored = projects
    .map(p => ({
      project: p,
      score: Math.max(
        fuzzyScore(target, p.id),
        fuzzyScore(target, p.name),
        fuzzyScore(target, p.path.split('/').pop() || ''),
      ),
    }))
    .filter(s => s.score > 0)
    .sort((a, b) => b.score - a.score);

  if (scored.length === 0) {
    return { ambiguous: true, candidates: [] };
  }

  if (scored.length > 1 && scored[0].score === scored[1].score) {
    return {
      ambiguous: true,
      candidates: scored.slice(0, 5).map(s => ({ id: s.project.id, name: s.project.name, score: s.score })),
    };
  }

  return { project: scored[0].project };
}

export function detectProjectFromCwd(cwd: string, projects: Project[]): Project | null {
  let best: Project | null = null;
  let bestLen = 0;
  for (const p of projects) {
    if ((cwd === p.path || cwd.startsWith(p.path + '/')) && p.path.length > bestLen) {
      best = p;
      bestLen = p.path.length;
    }
  }
  return best;
}

// ──────────────────────────────────────
// Verb Execution
// ──────────────────────────────────────

export async function executeVerb(
  verb: string,
  project: Project,
  options?: { args?: string[]; source?: string; message?: string },
): Promise<VerbResult> {
  const startTime = Date.now();
  const steps: StepResult[] = [];

  try {
    switch (verb) {
      case 'reset': {
        const recipe = RESET_RECIPES[project.type] || RESET_RECIPES['unknown'];
        for (const step of recipe) {
          const result = await executeStep(step, project);
          steps.push(result);
          if (!result.ok && step.action !== 'noop') break;
          // Delay between kill-port and start-dev for port release
          if (step.action === 'kill-port') await sleep(500);
        }
        break;
      }

      case 'start': {
        if (!project.devCommand) {
          steps.push({ ok: false, message: 'No dev command configured' });
          break;
        }
        const pathCheck = validateProjectPath(project.path);
        if (!pathCheck.valid) { steps.push({ ok: false, message: 'Invalid project path' }); break; }
        const ok = startProcess(project.id, pathCheck.resolved, project.devCommand);
        steps.push({ ok, message: ok ? `Started ${project.name}` : 'Failed to start' });
        break;
      }

      case 'stop': {
        const stopped = stopProcess(project.id);
        if (project.devPort) await killPort(project.devPort);
        steps.push({ ok: true, message: stopped ? `Stopped ${project.name}` : 'Not running' });
        break;
      }

      case 'status': {
        const status = getStatus(project.id);
        const msg = status.running
          ? `Running (PID ${status.pid}, since ${new Date(status.startedAt!).toLocaleTimeString()})`
          : 'Not running';
        steps.push({ ok: true, message: msg });
        break;
      }

      case 'logs': {
        const buffer = getBuffer(project.id);
        const msg = buffer.length > 0 ? buffer.join('\n') : 'No logs available';
        steps.push({ ok: true, message: msg });
        break;
      }

      case 'open': {
        const editor = options?.args?.includes('--cursor') ? 'cursor' : 'code';
        Bun.spawn([editor, project.path]);
        steps.push({ ok: true, message: `Opened ${project.name} in ${editor}` });
        break;
      }

      case 'pull': {
        const proc = Bun.spawn(['git', 'pull'], { cwd: project.path, stdout: 'pipe', stderr: 'pipe' });
        const output = await new Response(proc.stdout).text();
        const exitCode = await proc.exited;
        steps.push({ ok: exitCode === 0, message: output.trim() || (exitCode === 0 ? 'Pulled' : 'Pull failed') });
        break;
      }

      case 'push': {
        const proc = Bun.spawn(['git', 'push'], { cwd: project.path, stdout: 'pipe', stderr: 'pipe' });
        const output = await new Response(proc.stdout).text();
        const errOutput = await new Response(proc.stderr!).text();
        const exitCode = await proc.exited;
        steps.push({ ok: exitCode === 0, message: (output + errOutput).trim() || (exitCode === 0 ? 'Pushed' : 'Push failed') });
        break;
      }

      case 'commit': {
        const msg = options?.message || options?.args?.join(' ');
        if (!msg) { steps.push({ ok: false, message: 'No commit message. Use: commit <project> -m "message"' }); break; }
        // Stage all
        await Bun.spawn(['git', 'add', '-A'], { cwd: project.path }).exited;
        const proc = Bun.spawn(['git', 'commit', '-m', msg], { cwd: project.path, stdout: 'pipe', stderr: 'pipe' });
        const output = await new Response(proc.stdout).text();
        const exitCode = await proc.exited;
        steps.push({ ok: exitCode === 0, message: output.trim() || (exitCode === 0 ? 'Committed' : 'Commit failed') });
        break;
      }

      case 'deploy': {
        steps.push({ ok: false, message: 'Deploy via verb system not yet implemented — use dd deploy' });
        break;
      }

      default:
        steps.push({ ok: false, message: `Unknown verb: ${verb}` });
    }
  } catch (err) {
    steps.push({ ok: false, message: `Error: ${err}` });
  }

  const duration = Date.now() - startTime;
  const allOk = steps.every(s => s.ok);

  // Log to audit
  logCommand({
    projectId: project.id,
    verb,
    args: options?.args?.join(' '),
    source: options?.source || 'api',
    status: allOk ? 'ok' : 'error',
    message: steps.map(s => s.message).join('; '),
    durationMs: duration,
  });

  // Record activity for context engine
  try { recordActivity(project.id, 'verb_exec', { verb, ok: allOk }); } catch { /* non-critical */ }

  return {
    ok: allOk,
    steps,
    message: steps.map(s => s.message).join(' → '),
    projectId: project.id,
    projectName: project.name,
  };
}

// ──────────────────────────────────────
// Step Executor
// ──────────────────────────────────────

async function executeStep(step: VerbStep, project: Project): Promise<StepResult> {
  switch (step.action) {
    case 'kill-port': {
      if (!project.devPort) return { ok: true, message: 'No port configured, skipping' };
      const result = await killPort(project.devPort);
      return { ok: result.ok, message: result.killed > 0 ? `Killed ${result.killed} process(es) on port ${project.devPort}` : `Port ${project.devPort} clear` };
    }

    case 'rm-dirs': {
      const dirs = (step.args?.dirs as string[]) || [];
      if (dirs.length === 0) return { ok: true, message: 'No dirs to clean' };
      // Safety: all dirs must be relative, no .., no absolute
      for (const dir of dirs) {
        if (dir.startsWith('/') || dir.includes('..')) {
          return { ok: false, message: `Unsafe directory: ${dir}` };
        }
      }
      const pathCheck = validateProjectPath(project.path);
      if (!pathCheck.valid) return { ok: false, message: 'Invalid project path' };
      const proc = Bun.spawn(['rm', '-rf', ...dirs], { cwd: pathCheck.resolved });
      await proc.exited;
      return { ok: true, message: `Cleared ${dirs.join(', ')}` };
    }

    case 'start-dev': {
      if (!project.devCommand) return { ok: true, message: 'No dev command, skipping start' };
      const pathCheck = validateProjectPath(project.path);
      if (!pathCheck.valid) return { ok: false, message: 'Invalid project path' };
      const cmdCheck = validateDevCommand(project.devCommand);
      if (!cmdCheck.valid) return { ok: false, message: `Blocked command: ${cmdCheck.error}` };
      const ok = startProcess(project.id, pathCheck.resolved, project.devCommand);
      return { ok, message: ok ? `Started: ${project.devCommand}` : 'Failed to start process' };
    }

    case 'run-command': {
      const command = step.args?.command as string;
      if (!command) return { ok: false, message: 'No command specified' };
      const cmdCheck = validateDevCommand(command);
      if (!cmdCheck.valid) return { ok: false, message: `Blocked command: ${cmdCheck.error}` };
      const pathCheck = validateProjectPath(project.path);
      if (!pathCheck.valid) return { ok: false, message: 'Invalid project path' };
      const proc = Bun.spawn(['sh', '-c', command], { cwd: pathCheck.resolved, stdout: 'pipe', stderr: 'pipe' });
      const exitCode = await proc.exited;
      return { ok: exitCode === 0, message: exitCode === 0 ? `Ran: ${command}` : `Failed: ${command} (exit ${exitCode})` };
    }

    case 'noop':
      return { ok: true, message: step.message || 'No action needed' };

    default:
      return { ok: false, message: `Unknown step action: ${step.action}` };
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// ──────────────────────────────────────
// Stop All
// ──────────────────────────────────────

export async function stopAll(): Promise<VerbResult> {
  const { getAllProcesses } = await import('./processManager.js');
  const procs = getAllProcesses();
  const steps: StepResult[] = [];
  for (const p of procs) {
    stopProcess(p.projectId);
    steps.push({ ok: true, message: `Stopped ${p.projectId}` });
  }
  logCommand({ verb: 'stop', args: 'all', source: 'api', status: 'ok', message: `Stopped ${procs.length} servers` });
  return { ok: true, steps, message: `Stopped ${procs.length} server(s)` };
}

// ──────────────────────────────────────
// Status All
// ──────────────────────────────────────

export async function statusAll(): Promise<VerbResult> {
  const { getAllProcesses } = await import('./processManager.js');
  const procs = getAllProcesses();
  const steps: StepResult[] = procs.map(p => ({
    ok: true,
    message: `${p.projectId}: ${p.running ? `running (PID ${p.pid})` : 'stopped'}`,
  }));
  if (steps.length === 0) steps.push({ ok: true, message: 'No managed servers running' });
  return { ok: true, steps, message: `${procs.length} server(s) tracked` };
}
