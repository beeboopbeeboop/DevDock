import type { Subprocess } from 'bun';
import { validateDevCommand } from './security.js';

interface ManagedProcess {
  proc: Subprocess;
  projectId: string;
  projectPath: string;
  command: string;
  buffer: string[];
  listeners: Set<ReadableStreamDefaultController>;
  startedAt: number;
  autoRestart: boolean;
  restartCount: number;
  crashTimes: number[];
  restarting: boolean;
}

export interface ProcessInfo {
  projectId: string;
  running: boolean;
  pid: number | null;
  startedAt: number;
  autoRestart: boolean;
  restartCount: number;
}

const MAX_BUFFER = 500;
const MAX_CONCURRENT = 20;
const MAX_RESTARTS = 3;
const RESTART_WINDOW_MS = 5 * 60 * 1000; // 5 minutes
const processes = new Map<string, ManagedProcess>();

export function startProcess(
  projectId: string,
  path: string,
  command: string,
  options?: { autoRestart?: boolean }
): boolean {
  // Validate command against allowlist
  const cmdCheck = validateDevCommand(command);
  if (!cmdCheck.valid) {
    console.warn(`[processManager] Blocked unsafe command: ${command}`);
    return false;
  }

  // Limit concurrent processes
  if (processes.size >= MAX_CONCURRENT) {
    console.warn(`[processManager] Max concurrent processes (${MAX_CONCURRENT}) reached`);
    return false;
  }

  // Kill existing if any
  stopProcess(projectId);

  // Inherit full PATH so node/npm/bun/etc are available even when launched via LaunchAgent
  const env = {
    ...process.env,
    PATH: [
      '/Users/jon/.bun/bin',
      '/Users/jon/.npm-global/bin',
      '/opt/homebrew/bin',
      '/usr/local/bin',
      process.env.PATH,
    ].filter(Boolean).join(':'),
  };

  const proc = Bun.spawn(['sh', '-c', command], {
    cwd: path,
    stdout: 'pipe',
    stderr: 'pipe',
    stdin: 'ignore',
    env,
  });

  const managed: ManagedProcess = {
    proc,
    projectId,
    projectPath: path,
    command,
    buffer: [],
    listeners: new Set(),
    startedAt: Date.now(),
    autoRestart: options?.autoRestart ?? false,
    restartCount: 0,
    crashTimes: [],
    restarting: false,
  };

  processes.set(projectId, managed);

  // Pipe stdout
  if (proc.stdout) {
    const reader = proc.stdout.getReader();
    const decoder = new TextDecoder();
    (async () => {
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          const text = decoder.decode(value, { stream: true });
          pushLines(managed, text);
        }
      } catch { /* process ended */ }
    })();
  }

  // Pipe stderr
  if (proc.stderr) {
    const reader = (proc.stderr as ReadableStream<Uint8Array>).getReader();
    const decoder = new TextDecoder();
    (async () => {
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          const text = decoder.decode(value, { stream: true });
          pushLines(managed, text);
        }
      } catch { /* process ended */ }
    })();
  }

  // Handle exit
  proc.exited.then((exitCode) => {
    const current = processes.get(projectId);
    if (!current || current.proc !== proc) return; // stale reference

    if (exitCode !== 0 && !current.restarting) {
      // Unexpected crash
      pushEvent(current, 'crash', { projectId, exitCode, restartCount: current.restartCount });
      pushLines(current, `\n[Process crashed with exit code ${exitCode}]\n`);

      if (current.autoRestart) {
        handleCrash(current);
        return;
      }
    } else if (!current.restarting) {
      pushLines(current, '\n[Process exited]\n');
    }

    // Close SSE listeners if not restarting
    if (!current.restarting) {
      for (const ctrl of current.listeners) {
        try { ctrl.close(); } catch { /* ok */ }
      }
      current.listeners.clear();
    }
  });

  return true;
}

function handleCrash(managed: ManagedProcess) {
  const now = Date.now();
  managed.crashTimes.push(now);

  // Filter to crashes within the restart window
  managed.crashTimes = managed.crashTimes.filter(t => now - t < RESTART_WINDOW_MS);

  if (managed.crashTimes.length > MAX_RESTARTS) {
    pushEvent(managed, 'restart-failed', {
      projectId: managed.projectId,
      reason: `Too many restarts (${MAX_RESTARTS}) within ${RESTART_WINDOW_MS / 60000} minutes`,
    });
    pushLines(managed, `\n[Auto-restart disabled — ${MAX_RESTARTS} crashes in ${RESTART_WINDOW_MS / 60000} min]\n`);
    // Close listeners
    for (const ctrl of managed.listeners) {
      try { ctrl.close(); } catch { /* ok */ }
    }
    managed.listeners.clear();
    return;
  }

  managed.restartCount++;
  const delay = Math.min(1000 * Math.pow(2, managed.restartCount - 1), 30000);

  pushEvent(managed, 'restart', {
    projectId: managed.projectId,
    attempt: managed.restartCount,
    delayMs: delay,
  });
  pushLines(managed, `\n[Auto-restarting in ${delay}ms (attempt ${managed.restartCount})...]\n`);

  managed.restarting = true;

  setTimeout(() => {
    managed.restarting = false;
    const current = processes.get(managed.projectId);
    if (!current || current !== managed) return; // another start happened

    // Preserve listeners and state, spawn new process
    const cmdCheck = validateDevCommand(managed.command);
    if (!cmdCheck.valid) return;

    const restartEnv = {
      ...process.env,
      PATH: ['/Users/jon/.bun/bin', '/Users/jon/.npm-global/bin', '/opt/homebrew/bin', '/usr/local/bin', process.env.PATH].filter(Boolean).join(':'),
    };
    const proc = Bun.spawn(['sh', '-c', managed.command], {
      cwd: managed.projectPath,
      stdout: 'pipe',
      stderr: 'pipe',
      env: restartEnv,
      stdin: 'ignore',
    });

    managed.proc = proc;
    managed.startedAt = Date.now();

    // Re-pipe stdout
    if (proc.stdout) {
      const reader = proc.stdout.getReader();
      const decoder = new TextDecoder();
      (async () => {
        try {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            pushLines(managed, decoder.decode(value, { stream: true }));
          }
        } catch { /* process ended */ }
      })();
    }

    // Re-pipe stderr
    if (proc.stderr) {
      const reader = (proc.stderr as ReadableStream<Uint8Array>).getReader();
      const decoder = new TextDecoder();
      (async () => {
        try {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            pushLines(managed, decoder.decode(value, { stream: true }));
          }
        } catch { /* process ended */ }
      })();
    }

    // Re-attach exit handler
    proc.exited.then((exitCode) => {
      const cur = processes.get(managed.projectId);
      if (!cur || cur.proc !== proc) return;

      if (exitCode !== 0 && !cur.restarting) {
        pushEvent(cur, 'crash', { projectId: cur.projectId, exitCode, restartCount: cur.restartCount });
        pushLines(cur, `\n[Process crashed with exit code ${exitCode}]\n`);
        if (cur.autoRestart) {
          handleCrash(cur);
          return;
        }
      } else if (!cur.restarting) {
        pushLines(cur, '\n[Process exited]\n');
      }

      if (!cur.restarting) {
        for (const ctrl of cur.listeners) {
          try { ctrl.close(); } catch { /* ok */ }
        }
        cur.listeners.clear();
      }
    });
  }, delay);
}

function pushEvent(managed: ManagedProcess, event: string, data: Record<string, unknown>) {
  const sseData = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  for (const ctrl of managed.listeners) {
    try {
      ctrl.enqueue(new TextEncoder().encode(sseData));
    } catch {
      managed.listeners.delete(ctrl);
    }
  }
}

function pushLines(managed: ManagedProcess, text: string) {
  const lines = text.split('\n');
  for (const line of lines) {
    if (line.length === 0 && lines.length > 1) continue;
    managed.buffer.push(line);
    if (managed.buffer.length > MAX_BUFFER) {
      managed.buffer.shift();
    }
    // Fan out to SSE listeners
    const sseData = `data: ${JSON.stringify(line)}\n\n`;
    for (const ctrl of managed.listeners) {
      try {
        ctrl.enqueue(new TextEncoder().encode(sseData));
      } catch {
        managed.listeners.delete(ctrl);
      }
    }
  }
}

export function stopProcess(projectId: string): boolean {
  const managed = processes.get(projectId);
  if (!managed) return false;
  managed.restarting = false; // prevent auto-restart on intentional stop
  managed.autoRestart = false;
  try { managed.proc.kill(); } catch { /* already dead */ }
  for (const ctrl of managed.listeners) {
    try { ctrl.close(); } catch { /* ok */ }
  }
  managed.listeners.clear();
  processes.delete(projectId);
  return true;
}

export function getBuffer(projectId: string): string[] {
  return processes.get(projectId)?.buffer || [];
}

export function getStatus(projectId: string): { running: boolean; pid: number | null; startedAt: number | null; autoRestart: boolean; restartCount: number } {
  const managed = processes.get(projectId);
  if (!managed) return { running: false, pid: null, startedAt: null, autoRestart: false, restartCount: 0 };
  return {
    running: !managed.proc.killed,
    pid: managed.proc.pid,
    startedAt: managed.startedAt,
    autoRestart: managed.autoRestart,
    restartCount: managed.restartCount,
  };
}

export function setAutoRestart(projectId: string, enabled: boolean): boolean {
  const managed = processes.get(projectId);
  if (!managed) return false;
  managed.autoRestart = enabled;
  return true;
}

export function getAllProcesses(): ProcessInfo[] {
  const result: ProcessInfo[] = [];
  for (const [, managed] of processes) {
    result.push({
      projectId: managed.projectId,
      running: !managed.proc.killed,
      pid: managed.proc.pid,
      startedAt: managed.startedAt,
      autoRestart: managed.autoRestart,
      restartCount: managed.restartCount,
    });
  }
  return result;
}

export function subscribe(projectId: string): ReadableStream<Uint8Array> {
  const managed = processes.get(projectId);

  return new ReadableStream<Uint8Array>({
    start(controller) {
      if (managed) {
        managed.listeners.add(controller);
      }
    },
    cancel() {
      if (managed) {
        managed.listeners.delete(this as unknown as ReadableStreamDefaultController);
      }
    },
  });
}

export function cleanup() {
  for (const [id] of processes) {
    stopProcess(id);
  }
}
