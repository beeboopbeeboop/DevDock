import { useState } from 'react';
import { useAllPorts, usePortConflicts, useKillPort } from '../hooks/usePortManager';
import { useProjectActions } from '../hooks/useProjects';
import { IconExternalLink, IconX, IconRefresh } from './Icons';
import { Tooltip } from './Tooltip';
import { useToast } from './Toast';
import type { PortEntry } from '../types/project';

type FilterMode = 'all' | 'project' | 'conflicts';

interface PortManagerProps {
  onSelectProjectById?: (id: string) => void;
}

export function PortManager({ onSelectProjectById }: PortManagerProps) {
  const [filter, setFilter] = useState<FilterMode>('project');
  const { data: ports = [], isLoading, refetch } = useAllPorts();
  const { data: conflicts = [] } = usePortConflicts();
  const killPort = useKillPort();
  const actions = useProjectActions();
  const { toast } = useToast();

  const conflictPorts = new Set(conflicts.map((c) => c.port));

  let filtered: PortEntry[] = ports;
  if (filter === 'project') {
    filtered = ports.filter((p) => p.projectId);
  } else if (filter === 'conflicts') {
    // Show conflict ports even if not actively listening
    const conflictEntries = conflicts.flatMap((c) =>
      c.projects.map((proj) => {
        const listening = ports.find((p) => p.port === c.port);
        return {
          port: c.port,
          pid: listening?.pid || 0,
          command: listening?.command || '--',
          user: listening?.user || '--',
          projectId: proj.id,
          projectName: proj.name,
        } as PortEntry;
      })
    );
    // Dedupe by port+project
    const seen = new Set<string>();
    filtered = conflictEntries.filter((e) => {
      const key = `${e.port}-${e.projectId}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  const handleKill = async (port: number) => {
    await killPort.mutateAsync(port);
    toast(`Killed process on port ${port}`, 'success');
  };

  return (
    <div className="port-manager">
      <div className="pm-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <h2 className="pm-title">Port Manager</h2>
          <span className="topbar-meta">{filtered.length} ports</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div className="pm-filter-group">
            {(['all', 'project', 'conflicts'] as FilterMode[]).map((mode) => (
              <button
                key={mode}
                className={`pm-filter-btn${filter === mode ? ' pm-filter-active' : ''}`}
                onClick={() => setFilter(mode)}
              >
                {mode === 'all' ? 'All' : mode === 'project' ? 'Projects' : 'Conflicts'}
                {mode === 'conflicts' && conflicts.length > 0 && (
                  <span className="pm-conflict-count">{conflicts.length}</span>
                )}
              </button>
            ))}
          </div>
          <Tooltip content="Refresh">
            <button className={`p-icon-btn${isLoading ? ' is-spinning' : ''}`} onClick={() => refetch()}>
              <IconRefresh size={14} />
            </button>
          </Tooltip>
        </div>
      </div>

      {isLoading ? (
        <div className="empty-state">
          <div className="scanning-indicator">Scanning ports...</div>
        </div>
      ) : filtered.length === 0 ? (
        <div className="empty-state">
          <div className="empty-state-title">
            {filter === 'conflicts' ? 'No port conflicts detected' : filter === 'project' ? 'No project ports active' : 'No listening ports'}
          </div>
          <div className="empty-state-desc">
            {filter === 'conflicts'
              ? 'All project ports are clear -- no two projects are fighting over the same port'
              : filter === 'project'
                ? 'Start a dev server in one of your projects to see its port here'
                : 'No TCP servers detected on this machine -- start a dev server or service to see active ports'}
          </div>
        </div>
      ) : (
        <div className="pm-table-wrap">
          <table className="pm-table">
            <thead>
              <tr>
                <th>Port</th>
                <th>Process</th>
                <th>PID</th>
                <th>Project</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((entry) => (
                <tr
                  key={entry.port}
                  className={conflictPorts.has(entry.port) ? 'pm-row-conflict' : ''}
                >
                  <td className="pm-port">
                    <span className="lh-dot lh-dot-running" />
                    :{entry.port}
                  </td>
                  <td className="pm-process">{entry.command}</td>
                  <td className="pm-pid">{entry.pid}</td>
                  <td>
                    {entry.projectName ? (
                      <button
                        className="pm-project-link"
                        onClick={() => onSelectProjectById?.(entry.projectId!)}
                      >
                        {entry.projectName}
                      </button>
                    ) : (
                      <span className="pm-no-project">--</span>
                    )}
                  </td>
                  <td>
                    <div className="pm-actions">
                      <Tooltip content="Open in browser">
                        <button
                          className="p-icon-btn"
                          onClick={() => actions.openUrl(`http://localhost:${entry.port}`)}
                        >
                          <IconExternalLink size={13} />
                        </button>
                      </Tooltip>
                      <Tooltip content="Kill process">
                        <button
                          className="p-icon-btn pm-kill-btn"
                          onClick={() => handleKill(entry.port)}
                        >
                          <IconX size={13} />
                        </button>
                      </Tooltip>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
