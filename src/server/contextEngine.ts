import { recordActivity } from './db/queries.js';
import { getProjects } from './db/queries.js';
import { getUserConfig } from './userConfig.js';

let watcherProcess: ReturnType<typeof Bun.spawn> | null = null;

// Debounce: track last recorded time per project to avoid flooding
const lastRecorded = new Map<string, number>();
const DEBOUNCE_MS = 5000; // One event per project per 5 seconds

/**
 * Start watching scan paths for file changes.
 * Uses macOS fswatch to detect modifications, then maps changed paths
 * back to known projects.
 */
export function startFileWatcher(): void {
  const config = getUserConfig();
  const scanPaths = config.scanPaths || [];

  if (scanPaths.length === 0) {
    console.log('  [Context] No scan paths configured, skipping file watcher');
    return;
  }

  // Check if fswatch is available
  try {
    const check = Bun.spawnSync(['which', 'fswatch']);
    if (check.exitCode !== 0) {
      console.log('  [Context] fswatch not found, install via: brew install fswatch');
      return;
    }
  } catch {
    console.log('  [Context] Could not check for fswatch');
    return;
  }

  // Build ignore patterns
  const ignorePatterns = [
    'node_modules', '.git', '.next', 'dist', 'build', '.cache',
    '.vscode', '.claude', '__pycache__', 'coverage', '.build',
    '.DS_Store', '.swp', '.swo',
  ];

  const args = [
    '--recursive',
    '--batch-marker',
    '--latency', '2', // 2-second batching
    ...ignorePatterns.flatMap(p => ['--exclude', p]),
    ...scanPaths,
  ];

  try {
    watcherProcess = Bun.spawn(['fswatch', ...args], {
      stdout: 'pipe',
      stderr: 'pipe',
    });

    console.log(`  [Context] File watcher started on ${scanPaths.length} paths`);

    // Read stdout line by line
    const reader = watcherProcess.stdout.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    (async () => {
      const projects = getProjects();
      const projectPaths = projects.map(p => ({ id: p.id, path: p.path }));

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        // Track which projects had changes in this batch
        const changedProjects = new Set<string>();

        for (const line of lines) {
          if (!line.trim() || line.includes('NoOp')) continue;

          // Map file path to project
          for (const proj of projectPaths) {
            if (line.startsWith(proj.path)) {
              changedProjects.add(proj.id);
              break;
            }
          }
        }

        // Record debounced activity for each changed project
        const now = Date.now();
        for (const projectId of changedProjects) {
          const last = lastRecorded.get(projectId) || 0;
          if (now - last > DEBOUNCE_MS) {
            lastRecorded.set(projectId, now);
            recordActivity(projectId, 'file_change', { files_changed: 1 });
          }
        }
      }
    })().catch(() => {
      // Watcher died, that's ok
    });
  } catch (e) {
    console.log(`  [Context] Failed to start file watcher: ${e}`);
  }
}

export function stopFileWatcher(): void {
  if (watcherProcess) {
    watcherProcess.kill();
    watcherProcess = null;
  }
}
