import { Hono } from 'hono';
import { readdirSync, readFileSync, statSync } from 'fs';
import { join, extname } from 'path';
import { validateProjectPath } from '../security.js';

export const secretsApi = new Hono();

// ─────────────────────────────────────────────
// Secret Patterns — regex + description
// ─────────────────────────────────────────────

interface SecretPattern {
  id: string;
  name: string;
  pattern: RegExp;
  severity: 'critical' | 'high' | 'medium';
}

const SECRET_PATTERNS: SecretPattern[] = [
  // API Keys
  { id: 'aws-access-key', name: 'AWS Access Key', pattern: /AKIA[0-9A-Z]{16}/, severity: 'critical' },
  { id: 'aws-secret-key', name: 'AWS Secret Key', pattern: /(?:aws_secret_access_key|AWS_SECRET)\s*[=:]\s*['"]?([A-Za-z0-9/+=]{40})['"]?/, severity: 'critical' },
  { id: 'stripe-secret', name: 'Stripe Secret Key', pattern: /sk_live_[A-Za-z0-9]{20,}/, severity: 'critical' },
  { id: 'stripe-restricted', name: 'Stripe Restricted Key', pattern: /rk_live_[A-Za-z0-9]{20,}/, severity: 'critical' },
  { id: 'github-token', name: 'GitHub Token', pattern: /gh[ps]_[A-Za-z0-9_]{36,}/, severity: 'critical' },
  { id: 'github-fine', name: 'GitHub Fine-Grained Token', pattern: /github_pat_[A-Za-z0-9_]{22,}/, severity: 'critical' },
  { id: 'openai-key', name: 'OpenAI API Key', pattern: /sk-[A-Za-z0-9]{20,}T3BlbkFJ[A-Za-z0-9]{20,}/, severity: 'critical' },
  { id: 'anthropic-key', name: 'Anthropic API Key', pattern: /sk-ant-[A-Za-z0-9\-_]{80,}/, severity: 'critical' },
  { id: 'slack-token', name: 'Slack Token', pattern: /xox[bprs]-[A-Za-z0-9\-]{10,}/, severity: 'critical' },
  { id: 'sendgrid-key', name: 'SendGrid API Key', pattern: /SG\.[A-Za-z0-9_\-]{22}\.[A-Za-z0-9_\-]{43}/, severity: 'critical' },
  { id: 'twilio-key', name: 'Twilio API Key', pattern: /SK[a-f0-9]{32}/, severity: 'high' },
  { id: 'mailgun-key', name: 'Mailgun API Key', pattern: /key-[A-Za-z0-9]{32}/, severity: 'high' },

  // Database URLs with credentials
  { id: 'db-url-password', name: 'Database URL with Password', pattern: /(?:postgres|mysql|mongodb|redis):\/\/[^:]+:[^@\s]{8,}@/, severity: 'critical' },

  // Private Keys
  { id: 'private-key', name: 'Private Key', pattern: /-----BEGIN (?:RSA |EC |DSA )?PRIVATE KEY-----/, severity: 'critical' },

  // Generic patterns (lower confidence)
  { id: 'generic-secret-assign', name: 'Hardcoded Secret Assignment', pattern: /(?:password|secret|api_key|apikey|access_token|auth_token)\s*[=:]\s*['"][A-Za-z0-9+/=_\-]{16,}['"]/i, severity: 'high' },
  { id: 'bearer-token', name: 'Hardcoded Bearer Token', pattern: /['"]Bearer\s+[A-Za-z0-9_\-\.]{20,}['"]/, severity: 'high' },
  { id: 'basic-auth', name: 'Hardcoded Basic Auth', pattern: /['"]Basic\s+[A-Za-z0-9+/=]{20,}['"]/, severity: 'high' },

  // Cloud-specific
  { id: 'vercel-token', name: 'Vercel Token', pattern: /(?:VERCEL_TOKEN|vercel_token)\s*[=:]\s*['"]?[A-Za-z0-9]{24,}['"]?/, severity: 'high' },
  { id: 'cloudflare-token', name: 'Cloudflare API Token', pattern: /(?:CF_API_TOKEN|CLOUDFLARE_API_TOKEN)\s*[=:]\s*['"]?[A-Za-z0-9_\-]{40,}['"]?/, severity: 'high' },
  { id: 'supabase-key', name: 'Supabase Service Key', pattern: /eyJ[A-Za-z0-9_\-]{100,}\.[A-Za-z0-9_\-]{100,}/, severity: 'medium' },
];

// ─────────────────────────────────────────────
// File Scanner
// ─────────────────────────────────────────────

const SCAN_EXTENSIONS = new Set([
  '.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs',
  '.py', '.rb', '.go', '.rs', '.java', '.kt',
  '.json', '.yaml', '.yml', '.toml', '.xml',
  '.sh', '.bash', '.zsh',
  '.env', '.cfg', '.conf', '.ini',
  '.tf', '.hcl',
]);

const IGNORE_DIRS = new Set([
  'node_modules', '.git', '.next', 'dist', 'build', '.cache',
  '__pycache__', 'coverage', '.turbo', '.vercel', 'vendor',
  'target', '.cargo', 'venv', '.venv',
]);

const IGNORE_FILES = new Set([
  'package-lock.json', 'yarn.lock', 'bun.lockb', 'pnpm-lock.yaml',
  '.DS_Store',
]);

interface SecretFinding {
  file: string;
  line: number;
  column: number;
  patternId: string;
  patternName: string;
  severity: 'critical' | 'high' | 'medium';
  snippet: string; // masked excerpt
}

function scanFile(filePath: string, relativePath: string): SecretFinding[] {
  const findings: SecretFinding[] = [];

  try {
    const stat = statSync(filePath);
    if (stat.size > 512_000) return []; // skip files > 500KB

    const content = readFileSync(filePath, 'utf-8');
    const lines = content.split('\n');

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];

      // Skip comments in most languages
      const trimmed = line.trim();
      if (trimmed.startsWith('//') && trimmed.includes('example')) continue;
      if (trimmed.startsWith('#') && trimmed.includes('example')) continue;

      for (const pattern of SECRET_PATTERNS) {
        const match = line.match(pattern.pattern);
        if (match) {
          // Mask the matched value for safe display
          const matchStr = match[0];
          const masked = matchStr.length > 8
            ? matchStr.slice(0, 6) + '•'.repeat(Math.min(matchStr.length - 6, 16)) + matchStr.slice(-2)
            : '••••••••';

          findings.push({
            file: relativePath,
            line: i + 1,
            column: (match.index || 0) + 1,
            patternId: pattern.id,
            patternName: pattern.name,
            severity: pattern.severity,
            snippet: masked,
          });
          break; // one finding per line per pattern is enough
        }
      }
    }
  } catch {
    // File unreadable — skip
  }

  return findings;
}

function scanDirectory(dir: string, rootPath: string, depth = 0): SecretFinding[] {
  if (depth > 6) return [];
  const findings: SecretFinding[] = [];

  try {
    const entries = readdirSync(dir);
    for (const entry of entries) {
      if (entry.startsWith('.') && !entry.startsWith('.env')) continue;
      if (IGNORE_DIRS.has(entry)) continue;
      if (IGNORE_FILES.has(entry)) continue;

      const fullPath = join(dir, entry);
      try {
        const stat = statSync(fullPath);
        if (stat.isDirectory()) {
          findings.push(...scanDirectory(fullPath, rootPath, depth + 1));
        } else if (stat.isFile()) {
          const ext = extname(entry);
          // Scan known code/config extensions, plus extensionless files like Dockerfile
          if (SCAN_EXTENSIONS.has(ext) || entry.startsWith('.env')) {
            const relativePath = fullPath.replace(rootPath + '/', '');
            findings.push(...scanFile(fullPath, relativePath));
          }
        }
      } catch { /* skip */ }
    }
  } catch { /* skip */ }

  return findings;
}

// ─────────────────────────────────────────────
// Endpoints
// ─────────────────────────────────────────────

// GET /api/secrets/scan?path=/project — scan a single project
secretsApi.get('/scan', async (c) => {
  const projectPath = c.req.query('path');
  const check = validateProjectPath(projectPath || '');
  if (!check.valid) return c.json({ error: check.error }, 400);

  const findings = scanDirectory(check.resolved, check.resolved);

  // Sort by severity
  const order = { critical: 0, high: 1, medium: 2 };
  findings.sort((a, b) => order[a.severity] - order[b.severity]);

  return c.json({
    path: check.resolved,
    findings,
    total: findings.length,
    critical: findings.filter((f) => f.severity === 'critical').length,
    high: findings.filter((f) => f.severity === 'high').length,
    medium: findings.filter((f) => f.severity === 'medium').length,
  });
});

// GET /api/secrets/audit — scan ALL projects
secretsApi.get('/audit', async (c) => {
  const db = (await import('../db/schema.js')).getDb();
  const projects = db.prepare('SELECT id, name, path FROM projects').all() as {
    id: string; name: string; path: string;
  }[];

  const results: {
    projectId: string;
    projectName: string;
    findings: SecretFinding[];
    total: number;
    critical: number;
  }[] = [];

  for (const project of projects) {
    const findings = scanDirectory(project.path, project.path);
    if (findings.length > 0) {
      results.push({
        projectId: project.id,
        projectName: project.name,
        findings,
        total: findings.length,
        critical: findings.filter((f) => f.severity === 'critical').length,
      });
    }
  }

  results.sort((a, b) => b.critical - a.critical || b.total - a.total);

  return c.json({
    projects: results,
    totalFindings: results.reduce((sum, r) => sum + r.total, 0),
    projectsWithSecrets: results.length,
    totalProjects: projects.length,
  });
});

// GET /api/secrets/patterns — list all patterns (for UI documentation)
secretsApi.get('/patterns', (c) => {
  return c.json(SECRET_PATTERNS.map((p) => ({
    id: p.id,
    name: p.name,
    severity: p.severity,
  })));
});
