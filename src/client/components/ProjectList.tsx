import { useRef, useEffect } from 'react';
import type { Project } from '../types/project';
import {
  PROJECT_TYPE_LABELS,
  PROJECT_TYPE_COLORS,
  STATUS_COLORS,
} from '../types/project';
import { ContextMenu } from './ContextMenu';
import { IconVSCode, IconCursor, IconTerminal, IconFolder, IconPlay, IconClaude, IconGitHub, IconExternalLink } from './Icons';
import { useProjectActions } from '../hooks/useProjects';
import { useToast } from './Toast';
import { loadSetting } from './SettingsPanel';

interface CtxAction { id: string; label: string; enabled: boolean }
function getEnabledActions(): Set<string> {
  const actions = loadSetting<CtxAction[]>('context-actions', []);
  if (actions.length === 0) return new Set(['vscode','cursor','claude','terminal','finder','open-localhost','open-github','open-deploy','favorite','copy-path','copy-github','git-pull','start-dev','npm-install','notes']);
  return new Set(actions.filter(a => a.enabled).map(a => a.id));
}

function timeAgo(dateStr: string): string {
  if (!dateStr) return '';
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${mins}m`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  return `${days}d`;
}

interface ProjectListProps {
  projects: Project[];
  onSelectProject: (project: Project) => void;
  runningPorts: Set<number>;
  focusedIndex?: number;
  batchMode?: boolean;
  selectedIds?: Set<string>;
  onToggleSelect?: (id: string) => void;
}

export function ProjectList({ projects, onSelectProject, runningPorts, focusedIndex = -1, batchMode, selectedIds, onToggleSelect }: ProjectListProps) {
  const focusedRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (focusedIndex >= 0 && focusedRef.current) {
      focusedRef.current.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }
  }, [focusedIndex]);
  const actions = useProjectActions();
  const { toast } = useToast();

  const getContextItems = (project: Project) => {
    const enabled = getEnabledActions();
    const all: { id: string; label: string; icon?: React.ReactNode; onClick: () => void; separator?: boolean; condition?: boolean }[] = [
      { id: 'vscode', label: 'Open in VS Code', icon: <IconVSCode size={14} />, onClick: () => actions.openEditor(project.path, 'vscode') },
      { id: 'cursor', label: 'Open in Cursor', icon: <IconCursor size={14} />, onClick: () => actions.openEditor(project.path, 'cursor') },
      { id: 'claude', label: 'Open Claude Code', icon: <IconClaude size={14} />, onClick: () => actions.openClaudeTerminal(project.path) },
      { id: 'terminal', label: 'Open Terminal', icon: <IconTerminal size={14} />, onClick: () => actions.openTerminal(project.path) },
      { id: 'finder', label: 'Show in Finder', icon: <IconFolder size={14} />, onClick: () => actions.openFinder(project.path) },
      { id: 'open-localhost', label: `Open Localhost :${project.devPort}`, icon: <IconExternalLink size={13} />, onClick: () => actions.openUrl(`http://localhost:${project.devPort}`), condition: !!project.devPort },
      { id: 'open-github', label: 'Open on GitHub', icon: <IconGitHub size={13} />, onClick: () => actions.openUrl(project.githubUrl!), condition: !!project.githubUrl },
      { id: 'open-deploy', label: 'Open Deploy URL', icon: <IconExternalLink size={13} />, onClick: () => actions.openUrl(project.deployUrl!), condition: !!project.deployUrl },
      { id: '_sep1', label: '', separator: true, onClick: () => {} },
      { id: 'copy-path', label: 'Copy Path', onClick: () => { navigator.clipboard.writeText(project.path); toast('Path copied', 'success'); } },
      { id: 'copy-github', label: 'Copy GitHub URL', onClick: () => { navigator.clipboard.writeText(project.githubUrl!); toast('GitHub URL copied', 'success'); }, condition: !!project.githubRepo },
      { id: '_sep2', label: '', separator: true, onClick: () => {} },
      { id: 'git-pull', label: 'Git Pull', icon: <svg width={12} height={12} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="12" y1="5" x2="12" y2="19" /><polyline points="19 12 12 19 5 12" /></svg>, onClick: () => { fetch('/api/actions/git-pull', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ path: project.path }) }).then((r) => r.json()).then((d) => toast(d.ok ? 'Pulled successfully' : 'Pull failed', d.ok ? 'success' : 'error')); }, condition: !!project.hasGit },
      { id: 'start-dev', label: 'Start Dev Server', icon: <IconPlay size={12} color="var(--p-success)" />, onClick: () => { actions.startDev(project.path, project.devCommand!, project.id); toast('Dev server starting...', 'info'); }, condition: !!project.devCommand },
      { id: 'npm-install', label: 'npm install', onClick: () => { fetch('/api/actions/batch', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'npm-install', projectIds: [project.id] }) }).then((r) => r.json()).then(() => toast('npm install complete', 'success')).catch(() => toast('npm install failed', 'error')); } },
    ];
    return all.filter(item => {
      if (item.separator) return true;
      if (item.condition === false) return false;
      return enabled.has(item.id);
    });
  };

  return (
    <div className="project-list">
      <div
        className="project-row"
        style={{
          fontWeight: 600, fontSize: 10, color: 'var(--p-text-muted)',
          textTransform: 'uppercase', letterSpacing: '0.06em', cursor: 'default',
        }}
      >
        <span />
        <span>Name</span>
        <span>Type</span>
        <span>Branch</span>
        <span>Status</span>
        <span>Modified</span>
      </div>
      {projects.map((project, idx) => (
        <ContextMenu key={project.id} items={getContextItems(project)}>
          <div
            ref={focusedIndex === idx ? focusedRef : undefined}
            className={`project-row${focusedIndex === idx ? ' project-row-focused' : ''}${batchMode && selectedIds?.has(project.id) ? ' project-row-selected' : ''}`}
            onClick={() => batchMode ? onToggleSelect?.(project.id) : onSelectProject(project)}
          >
            {batchMode ? (
              <input
                type="checkbox"
                checked={selectedIds?.has(project.id) || false}
                onChange={() => onToggleSelect?.(project.id)}
                onClick={(e) => e.stopPropagation()}
                style={{ accentColor: 'var(--p-accent)' }}
              />
            ) : (
              <span
                style={{
                  width: 8, height: 8, borderRadius: '50%',
                  background: STATUS_COLORS[project.status],
                }}
              />
            )}
            <span className="project-row-name">
              {project.name}
              {project.devPort && runningPorts.has(project.devPort) && (
                <span className="port-status-badge">
                  <span className="lh-dot lh-dot-running" />
                  :{project.devPort}
                </span>
              )}
            </span>
            <span className="project-row-type" style={{ color: PROJECT_TYPE_COLORS[project.type] }}>
              {PROJECT_TYPE_LABELS[project.type]}
            </span>
            <span className="project-row-branch">
              {project.gitBranch || '-'}
              {project.gitDirty ? ' *' : ''}
            </span>
            <span style={{ fontSize: 11, color: 'var(--p-text-dim)' }}>
              {project.status}
            </span>
            <span className="project-row-modified">
              {project.lastModified ? timeAgo(project.lastModified) : '-'}
            </span>
          </div>
        </ContextMenu>
      ))}
    </div>
  );
}
