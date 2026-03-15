import { useState, useEffect, useRef } from 'react';
import { useDockerContainers, useDockerAction, useDockerLogs } from '../hooks/useDocker';
import { IconDocker, IconRefresh } from './Icons';
import { useToast } from './Toast';
import type { DockerContainer } from '../../shared/types';

type FilterMode = 'all' | 'running' | 'stopped';

const STATE_COLORS: Record<string, string> = {
  running: 'var(--p-success)',
  exited: 'var(--p-danger, #ef4444)',
  paused: 'var(--p-warning)',
  created: 'var(--p-text-muted)',
};

interface DockerManagerProps {
  onSelectProjectById?: (id: string) => void;
}

export function DockerManager({ onSelectProjectById }: DockerManagerProps) {
  const [filter, setFilter] = useState<FilterMode>('all');
  const [expandedLogs, setExpandedLogs] = useState<string | null>(null);
  const { data, isLoading, refetch } = useDockerContainers();
  const action = useDockerAction();
  const logs = useDockerLogs();
  const { toast } = useToast();

  const available = data?.available ?? true;
  const containers = data?.containers ?? [];

  let filtered: DockerContainer[] = containers;
  if (filter === 'running') {
    filtered = containers.filter((c) => c.state === 'running');
  } else if (filter === 'stopped') {
    filtered = containers.filter((c) => c.state !== 'running');
  }

  const runningCount = containers.filter((c) => c.state === 'running').length;

  const handleAction = async (act: 'container-stop' | 'container-restart', containerId: string, label: string) => {
    action.mutate({ action: act, containerId }, {
      onSuccess: (data) => {
        toast(data.ok ? `${label} succeeded` : `${label} failed`, data.ok ? 'success' : 'error');
      },
    });
  };

  const handleToggleLogs = async (containerId: string) => {
    if (expandedLogs === containerId) {
      await logs.stop(containerId);
      setExpandedLogs(null);
    } else {
      if (expandedLogs) await logs.stop(expandedLogs);
      await logs.start(containerId);
      setExpandedLogs(containerId);
    }
  };

  // Cleanup logs on unmount
  useEffect(() => {
    return () => {
      if (expandedLogs) logs.stop(expandedLogs);
    };
  }, [expandedLogs]);

  return (
    <div className="pm-container">
      <div className="topbar">
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <span className="topbar-title">Docker</span>
          {available && (
            <span className="topbar-meta">
              {runningCount} running · {containers.length} total
            </span>
          )}
        </div>
        <div className="topbar-actions">
          <div className="pm-filter-group">
            {(['all', 'running', 'stopped'] as FilterMode[]).map((mode) => (
              <button
                key={mode}
                className={`pm-filter-btn${filter === mode ? ' pm-filter-active' : ''}`}
                onClick={() => setFilter(mode)}
              >
                {mode.charAt(0).toUpperCase() + mode.slice(1)}
              </button>
            ))}
          </div>
          <button className="p-icon-btn" onClick={() => refetch()} title="Refresh">
            <IconRefresh size={13} />
          </button>
        </div>
      </div>

      <div className="content-area">
        {!available ? (
          <div className="empty-state">
            <div className="empty-state-icon">
              <IconDocker size={36} color="var(--p-text-muted)" />
            </div>
            <div className="empty-state-title">Docker is not installed</div>
            <div className="empty-state-desc">
              Install Docker Desktop or Docker Engine to manage containers from DevDock
            </div>
          </div>
        ) : isLoading ? (
          <div className="empty-state">
            <div className="scanning-indicator" style={{ fontSize: 14 }}>Loading containers...</div>
          </div>
        ) : filtered.length === 0 ? (
          <div className="empty-state">
            <div className="empty-state-icon">
              <IconDocker size={36} color="var(--p-text-muted)" />
            </div>
            <div className="empty-state-title">No containers {filter !== 'all' ? 'match this filter' : 'found'}</div>
            <div className="empty-state-desc">
              {filter !== 'all'
                ? 'Try switching to "All" to see every container, or start a new one with docker compose up'
                : 'Start a container with docker compose up or docker run to see it here'}
            </div>
          </div>
        ) : (
          <div className="pm-table">
            <div className="pm-table-header">
              <span style={{ width: 20 }} />
              <span style={{ flex: 2 }}>Container</span>
              <span style={{ flex: 2 }}>Image</span>
              <span style={{ flex: 1.5 }}>Ports</span>
              <span style={{ flex: 1 }}>Status</span>
              <span style={{ flex: 1 }}>Project</span>
              <span style={{ width: 100 }}>Actions</span>
            </div>
            {filtered.map((container) => (
              <div key={container.id}>
                <div className="pm-table-row">
                  <span style={{ width: 20 }}>
                    <span
                      className="lh-dot"
                      style={{ background: STATE_COLORS[container.state] || 'var(--p-text-muted)' }}
                    />
                  </span>
                  <span style={{ flex: 2, fontWeight: 500, fontSize: 12 }}>
                    {container.name}
                    {container.composeService && (
                      <span style={{ marginLeft: 6, fontSize: 10, color: 'var(--p-text-muted)' }}>
                        {container.composeService}
                      </span>
                    )}
                  </span>
                  <span style={{ flex: 2, fontSize: 11, color: 'var(--p-text-dim)', fontFamily: 'var(--p-font-mono)' }}>
                    {container.image.length > 35 ? container.image.slice(0, 35) + '…' : container.image}
                  </span>
                  <span style={{ flex: 1.5, fontSize: 11, fontFamily: 'var(--p-font-mono)', color: 'var(--p-text-dim)' }}>
                    {container.ports || '—'}
                  </span>
                  <span style={{ flex: 1, fontSize: 11, color: 'var(--p-text-dim)' }}>
                    {container.status}
                  </span>
                  <span style={{ flex: 1 }}>
                    {container.projectName ? (
                      <button
                        className="pm-project-link"
                        onClick={() => container.projectId && onSelectProjectById?.(container.projectId)}
                      >
                        {container.projectName}
                      </button>
                    ) : (
                      <span style={{ fontSize: 11, color: 'var(--p-text-muted)' }}>—</span>
                    )}
                  </span>
                  <span style={{ width: 100, display: 'flex', gap: 4 }}>
                    {container.state === 'running' ? (
                      <button
                        className="docker-action-btn"
                        onClick={() => handleAction('container-stop', container.id, 'Stop')}
                        title="Stop"
                      >
                        <svg width={10} height={10} viewBox="0 0 24 24" fill="currentColor">
                          <rect x="6" y="6" width="12" height="12" rx="1" />
                        </svg>
                      </button>
                    ) : null}
                    <button
                      className="docker-action-btn"
                      onClick={() => handleAction('container-restart', container.id, 'Restart')}
                      title="Restart"
                    >
                      <IconRefresh size={10} />
                    </button>
                    <button
                      className={`docker-action-btn${expandedLogs === container.id ? ' docker-action-active' : ''}`}
                      onClick={() => handleToggleLogs(container.id)}
                      title="Logs"
                    >
                      <svg width={10} height={10} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                        <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" />
                        <path d="M14 2v6h6" />
                        <line x1="16" y1="13" x2="8" y2="13" />
                        <line x1="16" y1="17" x2="8" y2="17" />
                      </svg>
                    </button>
                  </span>
                </div>
                {expandedLogs === container.id && (
                  <DockerLogViewer containerId={container.id} />
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function DockerLogViewer({ containerId }: { containerId: string }) {
  const [lines, setLines] = useState<string[]>([]);
  const scrollRef = useRef<HTMLDivElement>(null);
  const key = `docker-logs-${containerId}`;

  useEffect(() => {
    // Load buffer
    fetch(`/api/docker/logs-buffer/${key}`)
      .then((r) => r.json())
      .then((data) => {
        if (data.buffer) setLines(data.buffer);
      })
      .catch(() => {});

    // Connect to SSE stream
    const es = new EventSource(`/api/docker/logs-stream/${key}`);
    es.onmessage = (e) => {
      try {
        const { text } = JSON.parse(e.data);
        setLines((prev) => {
          const next = [...prev, text];
          return next.length > 500 ? next.slice(-500) : next;
        });
      } catch { /* skip */ }
    };

    return () => es.close();
  }, [key]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [lines]);

  return (
    <div className="docker-log-viewer" ref={scrollRef}>
      {lines.length === 0 ? (
        <span style={{ color: 'var(--p-text-muted)' }}>Waiting for logs...</span>
      ) : (
        lines.map((line, i) => (
          <div key={i} className="docker-log-line">{line}</div>
        ))
      )}
    </div>
  );
}
