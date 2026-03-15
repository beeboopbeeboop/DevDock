import { Hono } from 'hono';
import { validateProjectPath, validateGitHubParam, validateUrl } from '../security.js';

export const githubApi = new Hono();

async function runGh(args: string[]): Promise<string> {
  const proc = Bun.spawn(['gh', ...args], {
    stdout: 'pipe',
    stderr: 'pipe',
  });
  const output = await new Response(proc.stdout).text();
  const exitCode = await proc.exited;
  if (exitCode !== 0) {
    const err = await new Response(proc.stderr).text();
    throw new Error(`gh failed: ${err}`);
  }
  return output.trim();
}

/** Validate owner/repo from URL params */
function requireGitHubParams(c: { req: { param: () => { owner: string; repo: string } } }) {
  const { owner, repo } = c.req.param();
  if (!validateGitHubParam(owner) || !validateGitHubParam(repo)) {
    return { valid: false as const, error: 'Invalid owner or repo name' };
  }
  return { valid: true as const, owner, repo };
}

githubApi.get('/repo/:owner/:repo', async (c) => {
  const check = requireGitHubParams(c);
  if (!check.valid) return c.json({ error: check.error }, 400);
  try {
    const output = await runGh([
      'repo', 'view', `${check.owner}/${check.repo}`, '--json',
      'name,isPrivate,updatedAt,primaryLanguage,url',
    ]);
    return c.json(JSON.parse(output));
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : 'Unknown error';
    return c.json({ error: message }, 500);
  }
});

githubApi.get('/repo/:owner/:repo/commits', async (c) => {
  const check = requireGitHubParams(c);
  if (!check.valid) return c.json({ error: check.error }, 400);
  try {
    const output = await runGh([
      'api', `repos/${check.owner}/${check.repo}/commits`,
      '--jq', '.[0:5] | map({sha: .sha[0:7], message: .commit.message[0:80], date: .commit.author.date})',
    ]);
    return c.json(JSON.parse(output));
  } catch {
    return c.json([], 200);
  }
});

githubApi.get('/repo/:owner/:repo/prs', async (c) => {
  const check = requireGitHubParams(c);
  if (!check.valid) return c.json({ error: check.error }, 400);
  try {
    const output = await runGh([
      'pr', 'list', '--repo', `${check.owner}/${check.repo}`,
      '--json', 'number,title,state,updatedAt',
      '--limit', '5',
    ]);
    return c.json(JSON.parse(output));
  } catch {
    return c.json([], 200);
  }
});

githubApi.get('/repo/:owner/:repo/actions', async (c) => {
  const check = requireGitHubParams(c);
  if (!check.valid) return c.json({ error: check.error }, 400);
  try {
    const output = await runGh([
      'run', 'list', '--repo', `${check.owner}/${check.repo}`,
      '--json', 'databaseId,displayTitle,status,conclusion,event,headBranch,createdAt',
      '--limit', '10',
    ]);
    return c.json(JSON.parse(output));
  } catch {
    return c.json([], 200);
  }
});

githubApi.get('/repo/:owner/:repo/issues', async (c) => {
  const check = requireGitHubParams(c);
  if (!check.valid) return c.json({ error: check.error }, 400);
  try {
    const output = await runGh([
      'issue', 'list', '--repo', `${check.owner}/${check.repo}`,
      '--json', 'number,title,state,createdAt,labels,assignees',
      '--limit', '10',
    ]);
    return c.json(JSON.parse(output));
  } catch {
    return c.json([], 200);
  }
});

githubApi.get('/repo/:owner/:repo/prs-detail', async (c) => {
  const check = requireGitHubParams(c);
  if (!check.valid) return c.json({ error: check.error }, 400);
  try {
    const output = await runGh([
      'pr', 'list', '--repo', `${check.owner}/${check.repo}`,
      '--json', 'number,title,state,updatedAt,reviewDecision,author,headRefName',
      '--limit', '10',
    ]);
    return c.json(JSON.parse(output));
  } catch {
    return c.json([], 200);
  }
});

// Create a new GitHub repo from local project
githubApi.post('/create-repo', async (c) => {
  const { name, visibility, description, path } = await c.req.json<{
    name: string;
    visibility: 'public' | 'private';
    description?: string;
    path: string;
  }>();

  // Validate inputs
  if (!validateGitHubParam(name)) return c.json({ error: 'Invalid repo name' }, 400);
  if (!['public', 'private'].includes(visibility)) return c.json({ error: 'Invalid visibility' }, 400);

  const pathCheck = validateProjectPath(path);
  if (!pathCheck.valid) return c.json({ error: pathCheck.error }, 400);

  try {
    // Ensure there's at least one commit (gh repo create --push requires it)
    const logProc = Bun.spawn(['git', 'log', '--oneline', '-1'], {
      cwd: pathCheck.resolved, stdout: 'pipe', stderr: 'pipe',
    });
    await logProc.exited;
    if (logProc.exitCode !== 0) {
      // No commits yet — create an initial commit
      const addProc = Bun.spawn(['git', 'add', '-A'], {
        cwd: pathCheck.resolved, stdout: 'pipe', stderr: 'pipe',
      });
      await addProc.exited;
      const commitProc = Bun.spawn(['git', 'commit', '-m', 'initial commit'], {
        cwd: pathCheck.resolved, stdout: 'pipe', stderr: 'pipe',
      });
      await commitProc.exited;
    }

    const args = [
      'repo', 'create', name,
      `--${visibility}`,
      '--source', pathCheck.resolved,
      '--remote', 'origin',
      '--push',
    ];
    if (description) args.push('--description', description);
    const output = await runGh(args);

    const urlMatch = output.match(/https:\/\/github\.com\/[^\s]+/);
    const repoUrl = urlMatch ? urlMatch[0] : `https://github.com/${name}`;

    // Extract owner/repo from URL for proper github_repo format
    const repoMatch = repoUrl.match(/github\.com\/([^/]+\/[^/\s]+)/);
    const fullRepo = repoMatch ? repoMatch[1].replace(/\.git$/, '') : name;

    const db = (await import('../db/schema.js')).getDb();
    db.prepare(
      'UPDATE projects SET github_repo = ?, github_url = ? WHERE path = ?'
    ).run(fullRepo, repoUrl, pathCheck.resolved);

    return c.json({ ok: true, url: repoUrl, repo: fullRepo });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : 'Unknown error';
    return c.json({ ok: false, error: message }, 500);
  }
});

// Connect existing remote to a project
githubApi.post('/connect-remote', async (c) => {
  const { path, url } = await c.req.json<{ path: string; url: string }>();

  const pathCheck = validateProjectPath(path);
  if (!pathCheck.valid) return c.json({ error: pathCheck.error }, 400);
  if (!validateUrl(url)) return c.json({ error: 'Invalid URL' }, 400);

  try {
    // Use array-based spawn instead of Bun.$ template
    const proc = Bun.spawn(['git', '-C', pathCheck.resolved, 'remote', 'add', 'origin', url], {
      stdout: 'pipe', stderr: 'pipe',
    });
    await proc.exited;

    const match = url.match(/github\.com[:/]([^/]+\/[^/.]+)/);
    const repo = match ? match[1].replace(/\.git$/, '') : null;

    if (repo) {
      const db = (await import('../db/schema.js')).getDb();
      db.prepare(
        'UPDATE projects SET github_repo = ?, github_url = ? WHERE path = ?'
      ).run(repo, `https://github.com/${repo}`, pathCheck.resolved);
    }

    return c.json({ ok: true, repo });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : 'Unknown error';
    return c.json({ ok: false, error: message }, 500);
  }
});

// Create a pull request
githubApi.post('/create-pr', async (c) => {
  const { path, title, body, base } = await c.req.json<{
    path: string;
    title: string;
    body?: string;
    base?: string;
  }>();

  const pathCheck = validateProjectPath(path);
  if (!pathCheck.valid) return c.json({ error: pathCheck.error }, 400);
  if (!title?.trim()) return c.json({ error: 'Title is required' }, 400);

  try {
    const args = ['pr', 'create', '--title', title.trim()];
    if (body?.trim()) args.push('--body', body.trim());
    if (base?.trim()) args.push('--base', base.trim());

    const proc = Bun.spawn(['gh', ...args], {
      cwd: pathCheck.resolved,
      stdout: 'pipe',
      stderr: 'pipe',
    });
    const output = await new Response(proc.stdout).text();
    const stderr = await new Response(proc.stderr).text();
    const exitCode = await proc.exited;

    if (exitCode !== 0) {
      return c.json({ ok: false, error: (stderr || output).trim() }, 500);
    }

    const urlMatch = output.match(/https:\/\/github\.com\/[^\s]+/);
    return c.json({ ok: true, url: urlMatch?.[0] || output.trim() });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : 'Unknown error';
    return c.json({ ok: false, error: message }, 500);
  }
});

// Create an issue
githubApi.post('/create-issue', async (c) => {
  const { repo, title, body, labels } = await c.req.json<{
    repo: string;
    title: string;
    body?: string;
    labels?: string[];
  }>();

  if (!repo || !validateGitHubParam(repo.split('/')[0]) || !validateGitHubParam(repo.split('/')[1])) {
    return c.json({ error: 'Invalid repo' }, 400);
  }
  if (!title?.trim()) return c.json({ error: 'Title is required' }, 400);

  try {
    const args = ['issue', 'create', '--repo', repo, '--title', title.trim()];
    if (body?.trim()) args.push('--body', body.trim());
    if (labels && labels.length > 0) args.push('--label', labels.join(','));

    const output = await runGh(args);
    const urlMatch = output.match(/https:\/\/github\.com\/[^\s]+/);
    return c.json({ ok: true, url: urlMatch?.[0] || output.trim() });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : 'Unknown error';
    return c.json({ ok: false, error: message }, 500);
  }
});

githubApi.get('/repo/:owner/:repo/status', async (c) => {
  const check = requireGitHubParams(c);
  if (!check.valid) return c.json({ error: check.error }, 400);
  try {
    let ci: 'pass' | 'fail' | 'running' | 'none' = 'none';
    try {
      const runsOutput = await runGh([
        'run', 'list', '--repo', `${check.owner}/${check.repo}`,
        '--json', 'conclusion,status',
        '--limit', '1',
      ]);
      const runs = JSON.parse(runsOutput);
      if (runs.length > 0) {
        const run = runs[0];
        if (run.status === 'in_progress' || run.status === 'queued') ci = 'running';
        else if (run.conclusion === 'success') ci = 'pass';
        else if (run.conclusion === 'failure') ci = 'fail';
      }
    } catch { /* no actions */ }

    let openPrs = 0;
    let openIssues = 0;
    try {
      const prOutput = await runGh([
        'pr', 'list', '--repo', `${check.owner}/${check.repo}`,
        '--json', 'number', '--limit', '100',
      ]);
      openPrs = JSON.parse(prOutput).length;
    } catch { /* ok */ }
    try {
      const issueOutput = await runGh([
        'issue', 'list', '--repo', `${check.owner}/${check.repo}`,
        '--json', 'number', '--limit', '100',
      ]);
      openIssues = JSON.parse(issueOutput).length;
    } catch { /* ok */ }

    return c.json({ ci, openPrs, openIssues });
  } catch {
    return c.json({ ci: 'none', openPrs: 0, openIssues: 0 });
  }
});
