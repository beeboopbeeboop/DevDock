import { Hono } from 'hono';
import { getProjects, getProjectAliases, getAllAliases, setProjectAlias, removeProjectAlias, getCommandLogs } from '../db/queries.js';
import { resolveProjectFuzzy, detectProjectFromCwd, executeVerb, isKnownVerb, suggestVerb, stopAll, statusAll } from '../verbEngine.js';

export const verbApi = new Hono();

// ─── Unified Verb Executor ───

verbApi.post('/do', async (c) => {
  const { verb, target, args, source, cwd, message } = await c.req.json();

  if (!verb) return c.json({ error: 'verb is required' }, 400);
  if (!isKnownVerb(verb)) {
    const suggestion = suggestVerb(verb);
    if (suggestion) {
      return c.json({ correction: true, input: verb, suggested: suggestion }, 400);
    }
    return c.json({ error: `Unknown verb: ${verb}` }, 400);
  }

  // Special: "all" target
  if (target === 'all') {
    if (verb === 'stop') return c.json(await stopAll());
    if (verb === 'status') return c.json(await statusAll());
    return c.json({ error: `"${verb} all" is not supported` }, 400);
  }

  // Resolve project
  const projects = getProjects();
  const aliasMap = getProjectAliases();
  let project;

  if (target) {
    const result = resolveProjectFuzzy(target, projects, aliasMap);
    if (result.ambiguous) {
      return c.json({ ambiguous: true, candidates: result.candidates }, 300);
    }
    project = result.project;
  } else if (cwd) {
    project = detectProjectFromCwd(cwd, projects);
    if (!project) {
      return c.json({ error: 'Could not determine project from current directory. Specify a target.' }, 400);
    }
  } else {
    return c.json({ error: 'Specify a target project or run from within a project directory' }, 400);
  }

  const result = await executeVerb(verb, project, { args, source: source || 'cli', message });
  return c.json(result);
});

// ─── Aliases ───

verbApi.get('/aliases', (c) => {
  return c.json(getAllAliases());
});

verbApi.post('/aliases', async (c) => {
  const { alias, projectId } = await c.req.json();
  if (!alias || !projectId) return c.json({ error: 'alias and projectId required' }, 400);
  const result = setProjectAlias(projectId, alias);
  if (!result.ok) return c.json({ error: result.error }, 409);
  return c.json({ ok: true });
});

verbApi.delete('/aliases/:alias', async (c) => {
  const alias = c.req.param('alias');
  const removed = removeProjectAlias(alias);
  return c.json({ ok: removed });
});

// ─── Audit Log ───

verbApi.get('/logs', (c) => {
  const projectId = c.req.query('project') || undefined;
  const verb = c.req.query('verb') || undefined;
  const limit = parseInt(c.req.query('limit') || '50');
  const since = c.req.query('since') || undefined;
  const logs = getCommandLogs({ projectId, verb, limit, since });
  return c.json(logs);
});
