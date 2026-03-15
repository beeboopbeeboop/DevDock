import { Hono } from 'hono';
import { getUserConfig } from '../userConfig.js';

export const graphApi = new Hono();

interface GraphNode {
  id: string;
  name: string;
  type: string;
  status: string;
  isMaster: boolean;
  hasSharedLib: boolean;
}

interface GraphEdge {
  source: string;
  target: string;
  type: 'shared-lib' | 'shared-deps';
  label?: string;
}

// Dependencies too common to be meaningful edges
const NOISE_DEPS = new Set([
  'react', 'react-dom', 'typescript', 'vite', 'tailwindcss',
  '@types/react', '@types/react-dom', '@types/node', 'postcss',
  'autoprefixer', 'eslint', 'prettier', 'tslib', '@vitejs/plugin-react',
  'framer-motion', 'framer', 'next', '@tanstack/react-query',
  'zod', 'clsx', 'lucide-react', 'class-variance-authority',
  'tailwind-merge', '@tailwindcss/vite', 'concurrently',
  'esbuild', 'rollup', 'terser', 'cssnano', 'sass',
]);

// GET /api/graph/relationships
graphApi.get('/relationships', async (c) => {
  const db = (await import('../db/schema.js')).getDb();
  const config = getUserConfig();

  const projects = db.prepare(
    'SELECT id, name, type, status, has_hanlan_core, path, tech_stack FROM projects'
  ).all() as {
    id: string; name: string; type: string; status: string;
    has_hanlan_core: number; path: string; tech_stack: string;
  }[];

  // Check which projects are shared library masters
  const masterPaths = new Set(config.sharedLibraries.map((lib) => lib.masterPath));

  const nodes: GraphNode[] = projects.map((p) => ({
    id: p.id,
    name: p.name,
    type: p.type,
    status: p.status,
    isMaster: masterPaths.has(p.path),
    hasSharedLib: p.has_hanlan_core === 1,
  }));

  const edges: GraphEdge[] = [];

  // Shared library edges — based on user-configured libraries
  for (const lib of config.sharedLibraries) {
    const masterProject = projects.find((p) => p.path === lib.masterPath);
    if (!masterProject) continue;

    for (const p of projects) {
      if (p.id === masterProject.id) continue;
      // Check if this project has the shared library subdir
      try {
        const stat = Bun.file(`${p.path}/${lib.subdir}`);
        // Bun.file exists check — verify via size
        if (stat.size >= 0 || p.has_hanlan_core === 1) {
          edges.push({
            source: masterProject.id,
            target: p.id,
            type: 'shared-lib',
            label: lib.name,
          });
        }
      } catch {
        // Check has_hanlan_core flag as fallback (for backward compat)
        if (p.has_hanlan_core === 1 && lib.subdir.toLowerCase().includes('core')) {
          edges.push({
            source: masterProject.id,
            target: p.id,
            type: 'shared-lib',
            label: lib.name,
          });
        }
      }
    }
  }

  // Shared dependency edges from project_deps table
  try {
    const deps = db.prepare(
      'SELECT project_id, dep_name FROM project_deps WHERE dep_name NOT IN (' +
      Array.from(NOISE_DEPS).map(() => '?').join(',') + ')'
    ).all(...Array.from(NOISE_DEPS)) as { project_id: string; dep_name: string }[];

    const depToProjects = new Map<string, string[]>();
    for (const d of deps) {
      if (!depToProjects.has(d.dep_name)) depToProjects.set(d.dep_name, []);
      depToProjects.get(d.dep_name)!.push(d.project_id);
    }

    const pairShared = new Map<string, number>();
    for (const [, projIds] of depToProjects) {
      if (projIds.length < 2 || projIds.length > 5) continue;
      for (let i = 0; i < projIds.length; i++) {
        for (let j = i + 1; j < projIds.length; j++) {
          const key = [projIds[i], projIds[j]].sort().join('::');
          pairShared.set(key, (pairShared.get(key) || 0) + 1);
        }
      }
    }

    for (const [key, count] of pairShared) {
      if (count >= 6) {
        const [source, target] = key.split('::');
        const hasExisting = edges.some(
          (e) =>
            (e.source === source && e.target === target) ||
            (e.source === target && e.target === source)
        );
        if (!hasExisting) {
          edges.push({ source, target, type: 'shared-deps', label: `${count} shared` });
        }
      }
    }
  } catch {
    // project_deps table might not exist yet
  }

  // Only include nodes that have at least one edge
  const connectedIds = new Set<string>();
  for (const e of edges) {
    connectedIds.add(e.source);
    connectedIds.add(e.target);
  }
  const connectedNodes = nodes.filter((n) => connectedIds.has(n.id));

  return c.json({ nodes: connectedNodes, edges });
});

// GET /api/graph/sync-status — check shared library sync across projects
graphApi.get('/sync-status', async (c) => {
  const config = getUserConfig();
  const db = (await import('../db/schema.js')).getDb();

  const projects = db.prepare(
    'SELECT id, name, path, has_hanlan_core, type FROM projects'
  ).all() as { id: string; name: string; path: string; has_hanlan_core: number; type: string }[];

  const results: {
    projectId: string;
    projectName: string;
    libraryName: string;
    divergentFiles: number;
    isFresh: boolean;
  }[] = [];

  for (const lib of config.sharedLibraries) {
    const masterComparePath = lib.compareSubdir
      ? `${lib.masterPath}/${lib.compareSubdir}`
      : lib.masterPath;

    for (const p of projects) {
      if (p.path === lib.masterPath) continue;

      const localPath = lib.compareSubdir
        ? `${p.path}/${lib.subdir}/${lib.compareSubdir}`
        : `${p.path}/${lib.subdir}`;

      try {
        const proc = Bun.spawn(
          ['diff', '-rq', masterComparePath, localPath],
          { stdout: 'pipe', stderr: 'pipe' }
        );
        const output = await new Response(proc.stdout).text();
        await proc.exited;
        const divergent = output.trim() ? output.trim().split('\n').length : 0;
        results.push({
          projectId: p.id,
          projectName: p.name,
          libraryName: lib.name,
          divergentFiles: divergent,
          isFresh: divergent === 0,
        });
      } catch {
        // Local path doesn't exist — skip
      }
    }
  }

  return c.json(results);
});
