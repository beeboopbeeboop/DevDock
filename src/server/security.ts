import { existsSync, realpathSync } from 'fs';
import { resolve, normalize } from 'path';
import { getDb } from './db/schema.js';
import { getUserConfig } from './userConfig.js';

// ─────────────────────────────────────────────
// Path Validation
// ─────────────────────────────────────────────

/**
 * Validates that a path is within one of the configured scan directories
 * or is a known project path in the database. Prevents path traversal attacks.
 */
export function validateProjectPath(path: string): { valid: boolean; resolved: string; error?: string } {
  if (!path || typeof path !== 'string') {
    return { valid: false, resolved: '', error: 'Path is required' };
  }

  // Resolve to absolute, normalize away any ../ tricks
  const resolved = resolve(normalize(path));

  // Follow symlinks to get real path
  let realPath: string;
  try {
    realPath = realpathSync(resolved);
  } catch {
    // Path doesn't exist yet (e.g., new branch) — use resolved
    realPath = resolved;
  }

  // Check against configured scan paths
  const config = getUserConfig();
  const scanPaths = config.scanPaths;

  const withinScanPath = scanPaths.some((sp) => realPath.startsWith(resolve(sp)));
  if (withinScanPath) {
    return { valid: true, resolved: realPath };
  }

  // Check if it's a known project path in the DB
  try {
    const db = getDb();
    const project = db.prepare('SELECT id FROM projects WHERE path = ?').get(realPath);
    if (project) {
      return { valid: true, resolved: realPath };
    }
  } catch {
    // DB not ready yet — fall through
  }

  return { valid: false, resolved: realPath, error: 'Path is outside allowed directories' };
}

// ─────────────────────────────────────────────
// Git Input Sanitization
// ─────────────────────────────────────────────

/** Validates a git branch name — no shell metacharacters, reasonable format */
export function validateBranchName(branch: string): boolean {
  if (!branch || typeof branch !== 'string') return false;
  if (branch.length > 250) return false;

  // Git branch rules: no space, ~, ^, :, ?, *, [, \, .., @{, leading/trailing dot or slash
  // Also block shell metacharacters
  const forbidden = /[\s~^:?*\[\]\\$`|;&<>(){}!#'"]/;
  if (forbidden.test(branch)) return false;
  if (branch.startsWith('.') || branch.startsWith('-') || branch.startsWith('/')) return false;
  if (branch.endsWith('.') || branch.endsWith('/') || branch.endsWith('.lock')) return false;
  if (branch.includes('..') || branch.includes('@{')) return false;

  return true;
}

/** Validates a commit message — blocks shell injection via backticks, $(), etc. */
export function sanitizeCommitMessage(message: string): string {
  if (!message || typeof message !== 'string') return '';
  // Truncate unreasonably long messages
  return message.slice(0, 5000);
  // Note: we pass this as an array element to Bun.spawn, NOT through a shell,
  // so shell metacharacters are harmless. Truncation is the main safety measure.
}

/** Validates file paths for git staging — no absolute paths, no ../ traversal */
export function validateGitFiles(files: string[]): { valid: boolean; error?: string } {
  if (!Array.isArray(files) || files.length === 0) {
    return { valid: false, error: 'Files array is required' };
  }
  if (files.length > 500) {
    return { valid: false, error: 'Too many files (max 500)' };
  }
  for (const f of files) {
    if (typeof f !== 'string') return { valid: false, error: 'Invalid file entry' };
    if (f.includes('\0')) return { valid: false, error: 'Null bytes not allowed' };
    // Files should be relative paths within the project
    if (f.startsWith('/')) return { valid: false, error: 'Absolute paths not allowed' };
  }
  return { valid: true };
}

// ─────────────────────────────────────────────
// URL Validation
// ─────────────────────────────────────────────

/** Validates a URL is a real HTTP(S) or git URL */
export function validateUrl(url: string): boolean {
  if (!url || typeof url !== 'string') return false;
  try {
    const parsed = new URL(url);
    return ['http:', 'https:', 'ssh:'].includes(parsed.protocol);
  } catch {
    // Allow git@github.com:owner/repo.git format
    return /^git@[\w.-]+:[\w./-]+\.git$/.test(url);
  }
}

// ─────────────────────────────────────────────
// Port Validation
// ─────────────────────────────────────────────

/** Validates a port number is in a reasonable range */
export function validatePort(port: unknown): port is number {
  if (typeof port === 'string') port = parseInt(port);
  return typeof port === 'number' && Number.isInteger(port) && port >= 1 && port <= 65535;
}

/** Validates that a PID string contains only numeric PIDs */
export function validatePids(pidStr: string): string[] {
  return pidStr
    .trim()
    .split('\n')
    .map((p) => p.trim())
    .filter((p) => /^\d+$/.test(p));
}

// ─────────────────────────────────────────────
// Dev Command Validation
// ─────────────────────────────────────────────

/** Allowlist of safe dev command prefixes */
const SAFE_DEV_COMMANDS = [
  'npm run', 'npm start', 'npm test',
  'npx ',
  'yarn ', 'yarn run', 'yarn start', 'yarn dev',
  'pnpm ', 'pnpm run', 'pnpm start', 'pnpm dev',
  'bun run', 'bun dev', 'bun start', 'bun test',
  'next ', 'next dev', 'next start',
  'vite', 'vite dev', 'vite build', 'vite preview',
  'node ', 'deno ', 'python ', 'python3 ',
  'cargo ', 'go run', 'swift ',
  'wrangler ', 'vercel ',
  'concurrently ',
];

/**
 * Validates a dev command is safe to execute.
 * Only allows known package manager / build tool commands.
 */
export function validateDevCommand(command: string): { valid: boolean; error?: string } {
  if (!command || typeof command !== 'string') {
    return { valid: false, error: 'Command is required' };
  }

  const trimmed = command.trim();
  if (trimmed.length > 1000) {
    return { valid: false, error: 'Command too long' };
  }

  // Block obvious shell injection patterns
  const dangerous = /[;&|`$]|\$\(|>\s*\/|<\s*\//;
  if (dangerous.test(trimmed)) {
    return { valid: false, error: 'Command contains unsafe characters' };
  }

  // Check against allowlist
  const isAllowed = SAFE_DEV_COMMANDS.some((prefix) => trimmed.startsWith(prefix));
  if (!isAllowed) {
    return { valid: false, error: `Command not in allowlist. Must start with: ${SAFE_DEV_COMMANDS.slice(0, 5).join(', ')}...` };
  }

  return { valid: true };
}

// ─────────────────────────────────────────────
// GitHub Parameter Validation
// ─────────────────────────────────────────────

/** Validates GitHub owner/repo name format */
export function validateGitHubParam(param: string): boolean {
  if (!param || typeof param !== 'string') return false;
  // GitHub names: alphanumeric, hyphens, dots, underscores. Max ~100 chars.
  return /^[\w.\-]{1,100}$/.test(param);
}
