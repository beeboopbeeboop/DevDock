import { readFileSync, readdirSync, statSync } from 'fs';
import { join, basename } from 'path';
import { config } from '../config.js';
import { upsertProject } from '../db/queries.js';
import { getDb } from '../db/schema.js';
import { detectProject } from './detectors.js';
import { getGitInfo, getLastModified, hasSubdir } from './enrichers.js';

function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

function isProjectDir(dir: string): boolean {
  // Check if directory has any project signals
  for (const signal of config.projectSignals) {
    try {
      statSync(join(dir, signal));
      return true;
    } catch { /* doesn't exist */ }
  }
  return false;
}

export async function runScan(): Promise<number> {
  let count = 0;

  for (const scanPath of config.scanPaths) {
    let entries: string[];
    try {
      entries = readdirSync(scanPath);
    } catch {
      console.warn(`  Scan path not found: ${scanPath}`);
      continue;
    }

    for (const entry of entries) {
      if (entry.startsWith('.') || config.ignoreDirs.has(entry)) continue;

      const fullPath = join(scanPath, entry);
      try {
        const stat = statSync(fullPath);
        if (!stat.isDirectory()) continue;
      } catch {
        continue;
      }

      if (!isProjectDir(fullPath)) continue;

      // Detect and enrich
      const detection = detectProject(fullPath);
      const gitInfo = await getGitInfo(fullPath);
      const lastModified = getLastModified(fullPath);
      // Check if this project contains any configured shared library subdirs
      const uc = (await import('../userConfig.js')).getUserConfig();
      const hasSharedLib = uc.sharedLibraries.some((lib) => hasSubdir(fullPath, lib.subdir));

      const id = slugify(basename(fullPath));
      const name = basename(fullPath);

      upsertProject({
        id,
        name,
        path: fullPath,
        type: detection.type,
        techStack: detection.techStack,
        devCommand: detection.devCommand,
        devPort: detection.devPort,
        hasGit: gitInfo.hasGit,
        gitBranch: gitInfo.gitBranch,
        gitDirty: gitInfo.gitDirty,
        githubRepo: gitInfo.githubRepo,
        githubUrl: gitInfo.githubUrl,
        deployTarget: detection.deployTarget,
        deployUrl: null,
        hasSharedLib,
        lastModified,
        description: detection.description,
      });

      // Populate project_deps table
      try {
        const pkgPath = join(fullPath, 'package.json');
        const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8'));
        const db = getDb();
        db.prepare('DELETE FROM project_deps WHERE project_id = ?').run(id);
        const insert = db.prepare(
          'INSERT OR IGNORE INTO project_deps (project_id, dep_name, dep_type) VALUES (?, ?, ?)'
        );
        for (const [depName] of Object.entries(pkg.dependencies || {})) {
          insert.run(id, depName, 'dependency');
        }
        for (const [depName] of Object.entries(pkg.devDependencies || {})) {
          insert.run(id, depName, 'devDependency');
        }
      } catch { /* no package.json */ }

      count++;
    }
  }

  return count;
}
