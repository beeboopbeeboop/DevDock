import type { Subprocess } from 'bun';
import { validateDevCommand } from './security.js';

interface ManagedProcess {
  proc: Subprocess;
  projectId: string;
  buffer: string[];
  listeners: Set<ReadableStreamDefaultController>;
  startedAt: number;
}

const MAX_BUFFER = 500;
const MAX_CONCURRENT = 20;
const processes = new Map<string, ManagedProcess>();

export function startProcess(projectId: string, path: string, command: string): boolean {
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

  const proc = Bun.spawn(['sh', '-c', command], {
    cwd: path,
    stdout: 'pipe',
    stderr: 'pipe',
    stdin: 'ignore',
  });

  const managed: ManagedProcess = {
    proc,
    projectId,
    buffer: [],
    listeners: new Set(),
    startedAt: Date.now(),
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

  // Clean up on exit
  proc.exited.then(() => {
    pushLines(managed, '\n[Process exited]\n');
    // Close all SSE listeners
    for (const ctrl of managed.listeners) {
      try { ctrl.close(); } catch { /* ok */ }
    }
    managed.listeners.clear();
  });

  return true;
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

export function getStatus(projectId: string): { running: boolean; pid: number | null; startedAt: number | null } {
  const managed = processes.get(projectId);
  if (!managed) return { running: false, pid: null, startedAt: null };
  return {
    running: !managed.proc.killed,
    pid: managed.proc.pid,
    startedAt: managed.startedAt,
  };
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
