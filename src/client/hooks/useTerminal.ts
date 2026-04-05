import { useState, useEffect, useRef, useCallback } from 'react';

const MAX_LINES = 1000;

export function useTerminal(projectId: string | null) {
  const [lines, setLines] = useState<string[]>([]);
  const [isConnected, setIsConnected] = useState(false);
  const eventSourceRef = useRef<EventSource | null>(null);

  // Load buffer + connect SSE
  useEffect(() => {
    if (!projectId) {
      setLines([]);
      setIsConnected(false);
      return;
    }

    // Fetch existing buffer
    fetch(`/api/actions/terminal-buffer/${projectId}`)
      .then((r) => r.ok ? r.json() : { lines: [] })
      .then((data) => setLines((data.lines || []).slice(-MAX_LINES)))
      .catch(() => {});

    // Connect SSE
    const es = new EventSource(`/api/actions/terminal-stream/${projectId}`);
    eventSourceRef.current = es;

    es.onopen = () => setIsConnected(true);

    es.onmessage = (e) => {
      try {
        const line = JSON.parse(e.data);
        setLines((prev) => {
          const next = [...prev, line];
          return next.length > MAX_LINES ? next.slice(-MAX_LINES) : next;
        });
      } catch { /* ignore parse errors */ }
    };

    es.onerror = () => {
      setIsConnected(false);
    };

    return () => {
      es.close();
      eventSourceRef.current = null;
      setIsConnected(false);
    };
  }, [projectId]);

  const clear = useCallback(() => setLines([]), []);

  return { lines, isConnected, clear };
}

export function useTerminalStatus(projectId: string | null) {
  const [status, setStatus] = useState<{ running: boolean; pid: number | null; startedAt: number | null; autoRestart: boolean; restartCount: number }>({
    running: false, pid: null, startedAt: null, autoRestart: false, restartCount: 0,
  });

  useEffect(() => {
    if (!projectId) return;
    const check = () => {
      fetch(`/api/actions/terminal-status/${projectId}`)
        .then((r) => r.ok ? r.json() : { running: false, pid: null, startedAt: null, autoRestart: false, restartCount: 0 })
        .then(setStatus)
        .catch(() => {});
    };
    check();
    const interval = setInterval(check, 3000);
    return () => clearInterval(interval);
  }, [projectId]);

  return status;
}
