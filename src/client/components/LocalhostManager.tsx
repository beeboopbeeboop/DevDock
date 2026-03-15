import { useState, useCallback, useRef } from 'react';
import type { Project } from '../types/project';
import { usePortStatus, usePortInfo } from '../hooks/usePortStatus';
import { useProjectActions } from '../hooks/useProjects';
import { useQueryClient } from '@tanstack/react-query';
import { useTerminal, useTerminalStatus } from '../hooks/useTerminal';
import { TerminalView } from './TerminalView';
import { IconPlay, IconExternalLink, IconRefresh, IconX, IconTerminal, IconCopy } from './Icons';
import { Tooltip } from './Tooltip';
import { useToast } from './Toast';

type ViewTab = 'preview' | 'terminal' | 'split';

interface LocalhostManagerProps {
  project: Project;
}

export function LocalhostManager({ project }: LocalhostManagerProps) {
  const [editingPort, setEditingPort] = useState(false);
  const [portValue, setPortValue] = useState(String(project.devPort || ''));
  const [iframeKey, setIframeKey] = useState(0);
  const [viewTab, setViewTab] = useState<ViewTab>('preview');
  const [splitRatio, setSplitRatio] = useState(40); // preview %
  const dividerRef = useRef<HTMLDivElement>(null);

  const { toast } = useToast();
  const port = project.devPort;
  const { data: status, isLoading: statusLoading } = usePortStatus(port);
  const { data: portInfo } = usePortInfo(port && status?.running ? port : null);
  const actions = useProjectActions();
  const qc = useQueryClient();
  const { lines, isConnected, clear: clearTerminal } = useTerminal(project.id);
  const termStatus = useTerminalStatus(project.id);

  const isRunning = status?.running ?? false;
  const localhostUrl = port ? `http://localhost:${port}` : null;

  const savePort = useCallback(async () => {
    const newPort = parseInt(portValue);
    if (isNaN(newPort) || newPort < 1 || newPort > 65535) return;
    await fetch('/api/actions/set-port', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ projectId: project.id, port: newPort }),
    });
    setEditingPort(false);
    qc.invalidateQueries({ queryKey: ['projects'] });
  }, [portValue, project.id, qc]);

  const killPort = useCallback(async () => {
    if (!port) return;
    await fetch('/api/actions/port-kill', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ port }),
    });
    qc.invalidateQueries({ queryKey: ['port-status-single', port] });
  }, [port, qc]);

  const startManaged = useCallback(() => {
    if (!project.devCommand) return;
    fetch('/api/actions/start-dev', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path: project.path, command: project.devCommand, projectId: project.id }),
    });
  }, [project]);

  const stopManaged = useCallback(() => {
    fetch(`/api/actions/terminal-stop/${project.id}`, { method: 'POST' });
  }, [project.id]);

  // Drag to resize split
  const startDrag = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    const container = dividerRef.current?.parentElement;
    if (!container) return;
    const rect = container.getBoundingClientRect();
    const onMove = (ev: MouseEvent) => {
      const pct = ((ev.clientY - rect.top) / rect.height) * 100;
      setSplitRatio(Math.max(20, Math.min(80, pct)));
    };
    const onUp = () => {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
    };
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  }, []);

  return (
    <div>
      {/* Port Status Header */}
      <div className="detail-section">
        <div className="detail-section-title">Dev Server</div>

        <div className="lh-status-card">
          <div className="lh-status-row">
            <div className="lh-status-indicator">
              {statusLoading ? (
                <span className="lh-dot lh-dot-checking" />
              ) : isRunning ? (
                <span className="lh-dot lh-dot-running" />
              ) : (
                <span className="lh-dot lh-dot-stopped" />
              )}
              <span style={{ fontWeight: 500 }}>
                {statusLoading ? 'Checking...' : isRunning ? 'Running' : 'Stopped'}
              </span>
            </div>

            {isRunning && portInfo?.process && (
              <span style={{ fontSize: 10, color: 'var(--p-text-muted)', fontFamily: 'var(--p-font-mono)' }}>
                {portInfo.process.command} (PID {portInfo.process.pid})
              </span>
            )}
          </div>

          {/* Port display/edit */}
          <div className="lh-port-row">
            <span style={{ color: 'var(--p-text-muted)', fontSize: 11 }}>Port</span>
            {editingPort ? (
              <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                <input
                  type="number"
                  className="p-input"
                  style={{ width: 80, padding: '3px 6px', fontSize: 12 }}
                  value={portValue}
                  onChange={(e) => setPortValue(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && savePort()}
                  autoFocus
                  min={1}
                  max={65535}
                />
                <button className="p-btn p-btn-accent p-btn-sm" onClick={savePort}>Save</button>
                <button className="p-btn p-btn-ghost p-btn-sm" onClick={() => setEditingPort(false)}>Cancel</button>
              </div>
            ) : (
              <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                <span style={{ fontFamily: 'var(--p-font-mono)', fontWeight: 500, fontSize: 13 }}>
                  {port || 'Not set'}
                </span>
                <button
                  className="p-btn p-btn-ghost p-btn-sm"
                  onClick={() => { setPortValue(String(port || '')); setEditingPort(true); }}
                >
                  Edit
                </button>
              </div>
            )}
          </div>

          {/* URL display */}
          {localhostUrl && (
            <div className="lh-url-row">
              <span
                className="lh-url"
                onClick={() => { navigator.clipboard.writeText(localhostUrl); toast('URL copied', 'success'); }}
                title="Click to copy"
              >
                {localhostUrl}
              </span>
              <div style={{ display: 'flex', gap: 2 }}>
                <Tooltip content="Copy URL">
                  <button
                    className="p-icon-btn"
                    onClick={() => { navigator.clipboard.writeText(localhostUrl); toast('URL copied', 'success'); }}
                  >
                    <IconCopy size={14} />
                  </button>
                </Tooltip>
                <Tooltip content="Open in browser">
                  <button
                    className="p-icon-btn"
                    onClick={() => actions.openUrl(localhostUrl)}
                  >
                    <IconExternalLink size={14} />
                  </button>
                </Tooltip>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Actions */}
      <div className="detail-section">
        <div className="detail-section-title">Actions</div>
        <div className="lh-actions">
          {!isRunning && !termStatus.running && project.devCommand ? (
            <button
              className="lh-action-btn lh-action-start"
              onClick={startManaged}
            >
              <IconPlay size={14} />
              Start Dev Server
              <span style={{ fontSize: 10, color: 'var(--p-text-muted)', fontFamily: 'var(--p-font-mono)' }}>
                {project.devCommand}
              </span>
            </button>
          ) : (isRunning || termStatus.running) ? (
            <button className="lh-action-btn lh-action-stop" onClick={() => { killPort(); stopManaged(); }}>
              <IconX size={14} />
              Stop Server
              {port && <span style={{ fontSize: 10, color: 'var(--p-text-muted)' }}>Kill port {port}</span>}
            </button>
          ) : (
            <div style={{ fontSize: 12, color: 'var(--p-text-muted)' }}>
              No dev command detected. Set a port above to track a manually started server.
            </div>
          )}

          {localhostUrl && (
            <>
              <button
                className="lh-action-btn"
                onClick={() => actions.openUrl(localhostUrl)}
              >
                <IconExternalLink size={14} />
                Open in Browser
              </button>
              <button
                className="lh-action-btn"
                onClick={() => actions.openTerminal(project.path)}
              >
                <IconTerminal size={14} />
                Open Terminal Here
              </button>
            </>
          )}
        </div>
      </div>

      {/* View mode tabs */}
      {(isRunning || termStatus.running || lines.length > 0) && (
        <div className="detail-section">
          <div className="lh-view-tabs">
            {localhostUrl && isRunning && (
              <button
                className={`lh-view-tab${viewTab === 'preview' ? ' active' : ''}`}
                onClick={() => setViewTab('preview')}
              >
                Preview
              </button>
            )}
            <button
              className={`lh-view-tab${viewTab === 'terminal' ? ' active' : ''}`}
              onClick={() => setViewTab('terminal')}
            >
              Terminal
              {isConnected && <span className="lh-tab-dot" />}
            </button>
            {localhostUrl && isRunning && (
              <button
                className={`lh-view-tab${viewTab === 'split' ? ' active' : ''}`}
                onClick={() => setViewTab('split')}
              >
                Split
              </button>
            )}
            {viewTab !== 'preview' && (
              <button className="lh-view-tab lh-view-tab-action" onClick={clearTerminal}>
                Clear
              </button>
            )}
            {viewTab === 'preview' && localhostUrl && (
              <Tooltip content="Refresh preview">
                <button
                  className="lh-view-tab lh-view-tab-action"
                  onClick={() => setIframeKey((k) => k + 1)}
                >
                  <IconRefresh size={12} />
                </button>
              </Tooltip>
            )}
          </div>

          {/* Content */}
          {viewTab === 'preview' && localhostUrl && (
            <div className="lh-preview-frame">
              <iframe
                key={iframeKey}
                src={localhostUrl}
                title={`${project.name} preview`}
                className="lh-iframe"
              />
            </div>
          )}

          {viewTab === 'terminal' && (
            <TerminalView lines={lines} isConnected={isConnected} />
          )}

          {viewTab === 'split' && localhostUrl && (
            <div className="lh-split-container">
              <div className="lh-split-top" style={{ height: `${splitRatio}%` }}>
                <iframe
                  key={iframeKey}
                  src={localhostUrl}
                  title={`${project.name} preview`}
                  className="lh-iframe"
                />
              </div>
              <div
                ref={dividerRef}
                className="lh-split-divider"
                onMouseDown={startDrag}
              />
              <div className="lh-split-bottom" style={{ height: `${100 - splitRatio}%` }}>
                <TerminalView lines={lines} isConnected={isConnected} />
              </div>
            </div>
          )}
        </div>
      )}

      {/* Dev Command Reference */}
      {project.devCommand && (
        <div className="detail-section">
          <div className="detail-section-title">Dev Command</div>
          <div className="lh-command-block">
            <code>{project.devCommand}</code>
            <button
              className="p-btn p-btn-ghost p-btn-sm"
              onClick={() => { navigator.clipboard.writeText(project.devCommand!); toast('Command copied', 'success'); }}
              style={{ flexShrink: 0 }}
            >
              Copy
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
