import { Hono } from 'hono';
import { existsSync, readFileSync, writeFileSync, readdirSync } from 'fs';
import { join, basename } from 'path';
import { validateProjectPath } from '../security.js';

export const envApi = new Hono();

// ─────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────

interface EnvVariable {
  key: string;
  value: string;
  line: number;
  isComment: boolean;
  isBlank: boolean;
}

interface EnvFile {
  filename: string;
  path: string;
  variables: EnvVariable[];
  raw: string;
}

// ─────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────

const ENV_FILE_PATTERNS = [
  '.env',
  '.env.local',
  '.env.development',
  '.env.development.local',
  '.env.production',
  '.env.production.local',
  '.env.preview',
  '.env.staging',
  '.env.test',
  '.env.example',
  '.env.sample',
  '.env.template',
  '.dev.vars',           // Cloudflare Workers
  'wrangler.toml',       // listed but NOT parsed as env — just flagged
];

/** Parse a .env file into structured variables */
function parseEnvFile(content: string): EnvVariable[] {
  const lines = content.split('\n');
  return lines.map((line, i) => {
    const trimmed = line.trim();

    if (trimmed === '') {
      return { key: '', value: '', line: i + 1, isComment: false, isBlank: true };
    }
    if (trimmed.startsWith('#')) {
      return { key: trimmed, value: '', line: i + 1, isComment: true, isBlank: false };
    }

    const eqIdx = trimmed.indexOf('=');
    if (eqIdx === -1) {
      return { key: trimmed, value: '', line: i + 1, isComment: false, isBlank: false };
    }

    const key = trimmed.slice(0, eqIdx).trim();
    let value = trimmed.slice(eqIdx + 1).trim();

    // Strip surrounding quotes
    if ((value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }

    return { key, value, line: i + 1, isComment: false, isBlank: false };
  });
}

/** Reconstruct .env file from variables */
function serializeEnvFile(variables: EnvVariable[]): string {
  return variables.map((v) => {
    if (v.isBlank) return '';
    if (v.isComment) return v.key;
    if (!v.key) return '';
    // Quote values that contain spaces, #, or special chars
    const needsQuotes = /[\s#"'\\$`]/.test(v.value) || v.value === '';
    const quotedValue = needsQuotes ? `"${v.value.replace(/"/g, '\\"')}"` : v.value;
    return `${v.key}=${quotedValue}`;
  }).join('\n');
}

/** Classify sensitivity of a key name */
function classifySensitivity(key: string): 'secret' | 'config' | 'public' {
  const upper = key.toUpperCase();
  const secretPatterns = [
    'SECRET', 'KEY', 'TOKEN', 'PASSWORD', 'PASS', 'AUTH',
    'PRIVATE', 'CREDENTIAL', 'API_KEY', 'APIKEY', 'ACCESS_KEY',
    'JWT', 'SIGNING', 'ENCRYPTION', 'HMAC', 'SALT', 'HASH',
    'DATABASE_URL', 'DB_URL', 'MONGO', 'REDIS_URL', 'SUPABASE',
    'STRIPE', 'SENDGRID', 'TWILIO', 'AWS_', 'GCP_', 'AZURE_',
    'OPENAI', 'ANTHROPIC', 'REPLICATE',
  ];
  if (secretPatterns.some((p) => upper.includes(p))) return 'secret';

  const configPatterns = [
    'URL', 'HOST', 'PORT', 'DOMAIN', 'ENDPOINT', 'REGION',
    'BUCKET', 'PROJECT', 'ORG', 'TEAM', 'WORKSPACE',
  ];
  if (configPatterns.some((p) => upper.includes(p))) return 'config';

  return 'public';
}

// ─────────────────────────────────────────────
// Endpoints
// ─────────────────────────────────────────────

// GET /api/env/files?path=/path/to/project — list all .env files in a project
envApi.get('/files', async (c) => {
  const projectPath = c.req.query('path');
  const check = validateProjectPath(projectPath || '');
  if (!check.valid) return c.json({ error: check.error }, 400);

  const files: { filename: string; path: string; isExample: boolean; varCount: number }[] = [];

  try {
    const entries = readdirSync(check.resolved);
    for (const entry of entries) {
      if (ENV_FILE_PATTERNS.includes(entry) || entry.match(/^\.env\./)) {
        const fullPath = join(check.resolved, entry);
        try {
          const content = readFileSync(fullPath, 'utf-8');
          const vars = parseEnvFile(content).filter((v) => !v.isComment && !v.isBlank && v.key);
          files.push({
            filename: entry,
            path: fullPath,
            isExample: entry.includes('example') || entry.includes('sample') || entry.includes('template'),
            varCount: vars.length,
          });
        } catch { /* unreadable */ }
      }
    }
  } catch { /* dir unreadable */ }

  return c.json(files);
});

// GET /api/env/read?path=/path/to/project&file=.env — read a specific env file
// Values are MASKED by default unless ?reveal=true
envApi.get('/read', async (c) => {
  const projectPath = c.req.query('path');
  const filename = c.req.query('file') || '.env';
  const reveal = c.req.query('reveal') === 'true';

  const check = validateProjectPath(projectPath || '');
  if (!check.valid) return c.json({ error: check.error }, 400);

  // Validate filename — must be a known env file pattern, no path traversal
  if (filename.includes('/') || filename.includes('\\') || filename.includes('..')) {
    return c.json({ error: 'Invalid filename' }, 400);
  }

  const filePath = join(check.resolved, filename);
  if (!existsSync(filePath)) {
    return c.json({ error: 'File not found' }, 404);
  }

  try {
    const content = readFileSync(filePath, 'utf-8');
    const variables = parseEnvFile(content);

    // Mask secret values unless reveal=true
    const masked = variables.map((v) => {
      if (v.isComment || v.isBlank || !v.value) return { ...v, sensitivity: 'public' as const };
      const sensitivity = classifySensitivity(v.key);
      return {
        ...v,
        value: (!reveal && sensitivity === 'secret')
          ? v.value.slice(0, 4) + '•'.repeat(Math.min(v.value.length - 4, 20))
          : v.value,
        sensitivity,
        masked: !reveal && sensitivity === 'secret',
      };
    });

    return c.json({
      filename,
      path: filePath,
      variables: masked,
    });
  } catch {
    return c.json({ error: 'Failed to read file' }, 500);
  }
});

// PUT /api/env/variable — set or update a single variable
envApi.put('/variable', async (c) => {
  const { path: projectPath, file: filename = '.env', key, value } = await c.req.json<{
    path: string;
    file?: string;
    key: string;
    value: string;
  }>();

  const check = validateProjectPath(projectPath);
  if (!check.valid) return c.json({ error: check.error }, 400);

  if (filename.includes('/') || filename.includes('\\') || filename.includes('..')) {
    return c.json({ error: 'Invalid filename' }, 400);
  }
  if (!key || typeof key !== 'string' || !/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) {
    return c.json({ error: 'Invalid variable name' }, 400);
  }
  if (typeof value !== 'string') {
    return c.json({ error: 'Value must be a string' }, 400);
  }

  const filePath = join(check.resolved, filename);

  try {
    let content = '';
    if (existsSync(filePath)) {
      content = readFileSync(filePath, 'utf-8');
    }

    const variables = parseEnvFile(content);
    const existing = variables.findIndex((v) => v.key === key && !v.isComment);

    if (existing >= 0) {
      variables[existing].value = value;
    } else {
      // Add at end
      variables.push({ key, value, line: variables.length + 1, isComment: false, isBlank: false });
    }

    writeFileSync(filePath, serializeEnvFile(variables));
    return c.json({ ok: true, action: existing >= 0 ? 'updated' : 'added' });
  } catch {
    return c.json({ error: 'Failed to write file' }, 500);
  }
});

// DELETE /api/env/variable — remove a variable
envApi.delete('/variable', async (c) => {
  const { path: projectPath, file: filename = '.env', key } = await c.req.json<{
    path: string;
    file?: string;
    key: string;
  }>();

  const check = validateProjectPath(projectPath);
  if (!check.valid) return c.json({ error: check.error }, 400);

  if (filename.includes('/') || filename.includes('\\') || filename.includes('..')) {
    return c.json({ error: 'Invalid filename' }, 400);
  }

  const filePath = join(check.resolved, filename);
  if (!existsSync(filePath)) return c.json({ error: 'File not found' }, 404);

  try {
    const content = readFileSync(filePath, 'utf-8');
    const variables = parseEnvFile(content);
    const filtered = variables.filter((v) => v.key !== key || v.isComment);

    writeFileSync(filePath, serializeEnvFile(filtered));
    return c.json({ ok: true });
  } catch {
    return c.json({ error: 'Failed to write file' }, 500);
  }
});

// GET /api/env/compare?path=/project&base=.env.example&target=.env
// Compare two env files — find missing, extra, and changed keys
envApi.get('/compare', async (c) => {
  const projectPath = c.req.query('path');
  const baseFile = c.req.query('base') || '.env.example';
  const targetFile = c.req.query('target') || '.env';

  const check = validateProjectPath(projectPath || '');
  if (!check.valid) return c.json({ error: check.error }, 400);

  for (const f of [baseFile, targetFile]) {
    if (f.includes('/') || f.includes('\\') || f.includes('..')) {
      return c.json({ error: 'Invalid filename' }, 400);
    }
  }

  const basePath = join(check.resolved, baseFile);
  const targetPath = join(check.resolved, targetFile);

  if (!existsSync(basePath)) return c.json({ error: `${baseFile} not found` }, 404);
  if (!existsSync(targetPath)) return c.json({ error: `${targetFile} not found` }, 404);

  const baseVars = parseEnvFile(readFileSync(basePath, 'utf-8'))
    .filter((v) => !v.isComment && !v.isBlank && v.key);
  const targetVars = parseEnvFile(readFileSync(targetPath, 'utf-8'))
    .filter((v) => !v.isComment && !v.isBlank && v.key);

  const baseKeys = new Set(baseVars.map((v) => v.key));
  const targetKeys = new Set(targetVars.map((v) => v.key));

  const missing = baseVars.filter((v) => !targetKeys.has(v.key)).map((v) => v.key);
  const extra = targetVars.filter((v) => !baseKeys.has(v.key)).map((v) => v.key);
  const shared = baseVars.filter((v) => targetKeys.has(v.key)).map((v) => v.key);

  return c.json({
    base: baseFile,
    target: targetFile,
    missing,   // in base but not target
    extra,     // in target but not base
    shared,    // in both
    missingCount: missing.length,
    extraCount: extra.length,
  });
});

// GET /api/env/audit — scan ALL projects for env issues
envApi.get('/audit', async (c) => {
  const db = (await import('../db/schema.js')).getDb();
  const projects = db.prepare('SELECT id, name, path FROM projects').all() as {
    id: string; name: string; path: string;
  }[];

  const issues: {
    projectId: string;
    projectName: string;
    issue: string;
    severity: 'warning' | 'error' | 'info';
    detail: string;
  }[] = [];

  for (const project of projects) {
    const projectPath = project.path;

    // Check: has .env.example but no .env
    const hasExample = existsSync(join(projectPath, '.env.example'));
    const hasEnv = existsSync(join(projectPath, '.env'));

    if (hasExample && !hasEnv) {
      issues.push({
        projectId: project.id,
        projectName: project.name,
        issue: 'missing-env',
        severity: 'warning',
        detail: '.env.example exists but no .env — project may not run',
      });
    }

    // Check: .env exists, compare with .env.example for missing keys
    if (hasExample && hasEnv) {
      try {
        const exampleVars = parseEnvFile(readFileSync(join(projectPath, '.env.example'), 'utf-8'))
          .filter((v) => !v.isComment && !v.isBlank && v.key);
        const envVars = parseEnvFile(readFileSync(join(projectPath, '.env'), 'utf-8'))
          .filter((v) => !v.isComment && !v.isBlank && v.key);
        const envKeys = new Set(envVars.map((v) => v.key));
        const missing = exampleVars.filter((v) => !envKeys.has(v.key));

        if (missing.length > 0) {
          issues.push({
            projectId: project.id,
            projectName: project.name,
            issue: 'missing-keys',
            severity: 'warning',
            detail: `${missing.length} keys in .env.example missing from .env: ${missing.map((v) => v.key).join(', ')}`,
          });
        }
      } catch { /* skip */ }
    }

    // Check: .env has empty values for secret keys
    if (hasEnv) {
      try {
        const envVars = parseEnvFile(readFileSync(join(projectPath, '.env'), 'utf-8'))
          .filter((v) => !v.isComment && !v.isBlank && v.key);
        const emptySecrets = envVars.filter((v) =>
          classifySensitivity(v.key) === 'secret' && (!v.value || v.value === '""' || v.value === "''")
        );
        if (emptySecrets.length > 0) {
          issues.push({
            projectId: project.id,
            projectName: project.name,
            issue: 'empty-secrets',
            severity: 'error',
            detail: `${emptySecrets.length} secret keys have empty values: ${emptySecrets.map((v) => v.key).join(', ')}`,
          });
        }
      } catch { /* skip */ }
    }

    // Check: .env in git (check .gitignore)
    if (hasEnv) {
      const gitignorePath = join(projectPath, '.gitignore');
      if (existsSync(gitignorePath)) {
        try {
          const gitignore = readFileSync(gitignorePath, 'utf-8');
          const lines = gitignore.split('\n').map((l) => l.trim());
          const envIgnored = lines.some((l) =>
            l === '.env' || l === '.env*' || l === '.env.*' || l === '*.env'
          );
          if (!envIgnored) {
            issues.push({
              projectId: project.id,
              projectName: project.name,
              issue: 'env-not-gitignored',
              severity: 'error',
              detail: '.env exists but is not in .gitignore — secrets may be committed',
            });
          }
        } catch { /* skip */ }
      } else {
        issues.push({
          projectId: project.id,
          projectName: project.name,
          issue: 'no-gitignore',
          severity: 'warning',
          detail: 'No .gitignore found — .env files may be committed',
        });
      }
    }
  }

  // Sort by severity
  const order = { error: 0, warning: 1, info: 2 };
  issues.sort((a, b) => order[a.severity] - order[b.severity]);

  return c.json({
    issues,
    totalProjects: projects.length,
    projectsWithIssues: new Set(issues.map((i) => i.projectId)).size,
  });
});
