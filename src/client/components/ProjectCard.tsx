import { useState, useRef, useCallback } from 'react';
import type { Project } from '../types/project';
import {
  PROJECT_TYPE_LABELS,
  PROJECT_TYPE_COLORS,
  STATUS_COLORS,
  PRIORITY_LABELS,
  PRIORITY_COLORS,
  priorityToTier,
} from '../types/project';
import { useProjectActions, useToggleFavorite, useUpdateOverride } from '../hooks/useProjects';
import { StatusPopover } from './StatusPopover';
import { useGitHubStatus } from '../hooks/useGitHub';
import { IconVSCode, IconCursor, IconGitHub, IconFolder, IconTerminal, IconPlay, IconClaude, IconExternalLink, IconStar } from './Icons';
import { Tooltip } from './Tooltip';
import { ContextMenu, type MenuItem } from './ContextMenu';
import { QuickPeek } from './QuickPeek';
import { useToast } from './Toast';
import { loadSetting } from './SettingsPanel';

interface ContextAction { id: string; label: string; enabled: boolean }

function getEnabledActions(): Set<string> {
  const actions = loadSetting<ContextAction[]>('context-actions', []);
  if (actions.length === 0) return new Set(['vscode','cursor','claude','terminal','finder','open-localhost','open-github','open-deploy','favorite','copy-path','copy-github','git-pull','start-dev','npm-install','notes']);
  return new Set(actions.filter(a => a.enabled).map(a => a.id));
}

const TYPE_ICONS: Record<string, string> = {
  'cep-plugin': 'Ae',
  'nextjs': 'N',
  'vite-react': 'V',
  'framer-plugin': 'F',
  'cloudflare-worker': 'CF',
  'hono-server': 'H',
  'static-site': 'S',
  'node-package': 'np',
  'swift-app': 'Sw',
  'unknown': '?',
};

function shortenPath(path: string): string {
  const home = path.match(/^\/Users\/[^/]+/)?.[0] || '/home/' + path.split('/')[2];
  return path.replace(home, '~');
}

function timeAgo(dateStr: string): string {
  if (!dateStr) return '';
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  return `${Math.floor(days / 30)}mo ago`;
}

interface ProjectCardProps {
  project: Project;
  onClick: () => void;
  onOpenNotes?: () => void;
  isServerRunning?: boolean;
}

export function ProjectCard({ project, onClick, onOpenNotes, isServerRunning }: ProjectCardProps) {
  const actions = useProjectActions();
  const toggleFav = useToggleFavorite();
  const updateOverride = useUpdateOverride();
  const { toast } = useToast();
  const { data: ghStatus } = useGitHubStatus(project.githubRepo);
  const [showPeek, setShowPeek] = useState(false);
  const peekTimer = useRef<ReturnType<typeof setTimeout>>(null);

  const handleMouseEnter = useCallback(() => {
    peekTimer.current = setTimeout(() => setShowPeek(true), 600);
  }, []);

  const handleMouseLeave = useCallback(() => {
    if (peekTimer.current) clearTimeout(peekTimer.current);
    peekTimer.current = null;
    setShowPeek(false);
  }, []);

  const handleClick = useCallback(() => {
    if (peekTimer.current) clearTimeout(peekTimer.current);
    setShowPeek(false);
    onClick();
  }, [onClick]);
  const typeColor = PROJECT_TYPE_COLORS[project.type] || '#6b7280';
  const statusColor = STATUS_COLORS[project.status] || '#6b7280';

  const copyPath = (e: React.MouseEvent) => {
    e.stopPropagation();
    navigator.clipboard.writeText(project.path);
    toast('Path copied to clipboard', 'success');
  };

  const enabled = getEnabledActions();

  // Build "Open In" submenu from enabled editor/terminal actions
  const openInChildren: MenuItem[] = [
    enabled.has('vscode') ? { label: 'VS Code', icon: <IconVSCode size={14} />, onClick: () => actions.openEditor(project.path, 'vscode') } : null,
    enabled.has('cursor') ? { label: 'Cursor', icon: <IconCursor size={14} />, onClick: () => actions.openEditor(project.path, 'cursor') } : null,
    enabled.has('claude') ? { label: 'Claude Code Terminal', icon: <IconClaude size={14} />, onClick: () => actions.openClaudeTerminal(project.path) } : null,
    enabled.has('terminal') ? { label: 'Terminal', icon: <IconTerminal size={14} />, onClick: () => actions.openTerminal(project.path) } : null,
    enabled.has('finder') ? { label: 'Finder', icon: <IconFolder size={14} />, onClick: () => actions.openFinder(project.path) } : null,
  ].filter(Boolean) as MenuItem[];

  const allItems: { id: string; label: string; icon?: React.ReactNode; onClick: () => void; separator?: boolean; condition?: boolean; children?: MenuItem[] }[] = [
    { id: '_open-in', label: 'Open In...', icon: <IconExternalLink size={13} />, onClick: () => {}, children: openInChildren, condition: openInChildren.length > 0 },
    { id: 'open-localhost', label: `Open Localhost :${project.devPort}`, icon: <IconExternalLink size={13} />, onClick: () => actions.openUrl(`http://localhost:${project.devPort}`), condition: !!project.devPort },
    { id: 'open-github', label: 'Open on GitHub', icon: <IconGitHub size={13} />, onClick: () => actions.openUrl(project.githubUrl!), condition: !!project.githubUrl },
    { id: 'open-deploy', label: 'Open Deploy URL', icon: <IconExternalLink size={13} />, onClick: () => actions.openUrl(project.deployUrl!), condition: !!project.deployUrl },
    { id: '_sep1', label: '', separator: true, onClick: () => {} },
    { id: 'favorite', label: project.isFavorite ? 'Remove from Favorites' : 'Add to Favorites', icon: <IconStar size={13} filled={project.isFavorite} color="var(--p-warning)" />, onClick: () => toggleFav.mutate(project.id) },
    { id: 'copy-path', label: 'Copy Path', onClick: () => { navigator.clipboard.writeText(project.path); toast('Path copied', 'success'); } },
    { id: 'copy-github', label: 'Copy GitHub URL', onClick: () => { navigator.clipboard.writeText(project.githubUrl!); toast('GitHub URL copied', 'success'); }, condition: !!project.githubRepo },
    { id: 'notes', label: 'Project Notes', icon: <svg width={13} height={13} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/></svg>, onClick: () => onOpenNotes?.(), condition: !!onOpenNotes },
    { id: '_sep2', label: '', separator: true, onClick: () => {} },
    { id: 'git-pull', label: 'Git Pull', icon: <svg width={12} height={12} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="12" y1="5" x2="12" y2="19" /><polyline points="19 12 12 19 5 12" /></svg>, onClick: () => { fetch('/api/actions/git-pull', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ path: project.path }) }).then((r) => r.json()).then((d) => toast(d.ok ? 'Pulled successfully' : 'Pull failed', d.ok ? 'success' : 'error')); }, condition: !!project.hasGit },
    { id: 'start-dev', label: 'Start Dev Server', icon: <IconPlay size={12} color="var(--p-success)" />, onClick: () => { actions.startDev(project.path, project.devCommand!, project.id); toast('Dev server starting...', 'info'); }, condition: !!project.devCommand },
    { id: 'npm-install', label: 'npm install', onClick: () => { fetch('/api/actions/batch', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'npm-install', projectIds: [project.id] }) }).then((r) => r.json()).then(() => toast('npm install complete', 'success')).catch(() => toast('npm install failed', 'error')); } },
  ];

  const contextItems = allItems.filter(item => {
    if (item.separator) return true;
    if (item.condition === false) return false;
    // Submenu items handle their own filtering, skip settings check for the group trigger
    if (item.id.startsWith('_')) return true;
    return enabled.has(item.id);
  });

  return (
    <ContextMenu items={contextItems}>
      <div
        className={`project-card${project.gitDirty ? ' project-card-dirty' : ''}`}
        onClick={handleClick}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
        style={{ position: 'relative' }}
      >
        {showPeek && <QuickPeek project={project} isServerRunning={isServerRunning} />}
        <div className="project-card-header">
          <div
            className="project-type-icon"
            style={{
              background: `${typeColor}18`,
              color: typeColor,
              border: `1px solid ${typeColor}30`,
            }}
          >
            {TYPE_ICONS[project.type] || '?'}
          </div>
          <div className="project-card-info">
            <div className="project-card-name">
              {project.isFavorite && <IconStar size={11} color="var(--p-warning)" filled className="project-fav-star" />}
              {project.name}
            </div>
            <div className="project-card-path-row">
              <Tooltip content="Copy path">
                <button
                  className="copy-path-btn"
                  onClick={copyPath}
                >
                  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                    <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                  </svg>
                </button>
              </Tooltip>
              <span className="project-card-path">
                {shortenPath(project.path)}
              </span>
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            {isServerRunning && (
              <Tooltip content={`Dev server running on :${project.devPort}`}>
                <span className="port-status-badge">
                  <span className="lh-dot lh-dot-running" />
                  :{project.devPort}
                </span>
              </Tooltip>
            )}
            {ghStatus && ghStatus.ci !== 'none' && (
              <Tooltip content={`CI: ${ghStatus.ci}`}>
                <span className={`gh-ci-dot-card gh-ci-${ghStatus.ci}`} />
              </Tooltip>
            )}
            {ghStatus && (ghStatus.stars > 0 || ghStatus.forks > 0) && (
              <>
                {ghStatus.stars > 0 && (
                  <Tooltip content={`${ghStatus.stars} star${ghStatus.stars !== 1 ? 's' : ''}`}>
                    <span className="gh-stat-badge">
                      <svg width={10} height={10} viewBox="0 0 24 24" fill="var(--p-warning)" stroke="none"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26" /></svg>
                      {ghStatus.stars}
                    </span>
                  </Tooltip>
                )}
                {ghStatus.forks > 0 && (
                  <Tooltip content={`${ghStatus.forks} fork${ghStatus.forks !== 1 ? 's' : ''}`}>
                    <span className="gh-stat-badge">
                      <svg width={10} height={10} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="12" cy="18" r="3"/><circle cx="6" cy="6" r="3"/><circle cx="18" cy="6" r="3"/><path d="M18 9v2c0 .6-.4 1-1 1H7c-.6 0-1-.4-1-1V9"/><path d="M12 12v3"/></svg>
                      {ghStatus.forks}
                    </span>
                  </Tooltip>
                )}
              </>
            )}
            {(() => {
              const tier = priorityToTier(project.priority);
              return (
                <Tooltip content={`Priority: ${PRIORITY_LABELS[tier]}`}>
                  <span className="priority-tier-badge" style={{ color: PRIORITY_COLORS[tier], borderColor: `${PRIORITY_COLORS[tier]}40` }}>
                    {PRIORITY_LABELS[tier]}
                  </span>
                </Tooltip>
              );
            })()}
            <StatusPopover
              currentStatus={project.status}
              onChangeStatus={(s) => updateOverride.mutate({ projectId: project.id, overrides: { customStatus: s } })}
              triggerStyle="dot"
            />
          </div>
        </div>

        {project.description && (
          <div className="project-card-desc">{project.description}</div>
        )}

        <div className="project-card-meta">
          <span className="p-badge p-badge-subtle">
            {PROJECT_TYPE_LABELS[project.type]}
          </span>
          {project.techStack.slice(0, 3).map((tech) => (
            <span key={tech} className="p-badge p-badge-subtle">
              {tech}
            </span>
          ))}
          {project.techStack.length > 3 && (
            <span className="p-badge p-badge-subtle">
              +{project.techStack.length - 3}
            </span>
          )}
        </div>

        <div className="project-card-footer">
          <div className="project-card-git">
            {project.hasGit && (
              <>
                <span>{project.gitBranch || 'no branch'}</span>
                {project.gitDirty && (
                  <Tooltip content={`${project.gitDirtyCount || '?'} uncommitted change${project.gitDirtyCount !== 1 ? 's' : ''}`}>
                    <span className="dirty-badge">{project.gitDirtyCount || '*'}</span>
                  </Tooltip>
                )}
              </>
            )}
            {project.lastModified && (
              <span style={{ color: 'var(--p-text-muted)' }}>
                {timeAgo(project.lastModified)}
              </span>
            )}
          </div>

          <div className="project-card-actions">
            <Tooltip content="Open in VS Code">
              <button
                className="card-action-btn"
                onClick={(e) => { e.stopPropagation(); actions.openEditor(project.path, 'vscode'); }}
              >
                <IconVSCode size={14} />
              </button>
            </Tooltip>
            <Tooltip content="Terminal">
              <button
                className="card-action-btn"
                onClick={(e) => { e.stopPropagation(); actions.openTerminal(project.path); }}
              >
                <IconTerminal size={14} />
              </button>
            </Tooltip>
            <Tooltip content="Finder">
              <button
                className="card-action-btn"
                onClick={(e) => { e.stopPropagation(); actions.openFinder(project.path); }}
              >
                <IconFolder size={14} />
              </button>
            </Tooltip>
            {project.githubUrl && (
              <Tooltip content="Open GitHub">
                <button
                  className="card-action-btn"
                  onClick={(e) => { e.stopPropagation(); actions.openUrl(project.githubUrl!); }}
                >
                  <IconGitHub size={14} />
                </button>
              </Tooltip>
            )}
            {project.devCommand && (
              <Tooltip content={`Start: ${project.devCommand}`}>
                <button
                  className="card-action-btn"
                  onClick={(e) => {
                    e.stopPropagation();
                    actions.startDev(project.path, project.devCommand!, project.id);
                  }}
                  style={{ color: 'var(--p-success)' }}
                >
                  <IconPlay size={12} />
                </button>
              </Tooltip>
            )}
          </div>
        </div>
      </div>
    </ContextMenu>
  );
}
