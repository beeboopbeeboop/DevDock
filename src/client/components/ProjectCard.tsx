import type { Project } from '../types/project';
import {
  PROJECT_TYPE_LABELS,
  PROJECT_TYPE_COLORS,
  STATUS_COLORS,
} from '../types/project';
import { useProjectActions, useToggleFavorite } from '../hooks/useProjects';
import { useGitHubStatus } from '../hooks/useGitHub';
import { IconVSCode, IconCursor, IconGitHub, IconFolder, IconTerminal, IconPlay, IconClaude, IconExternalLink, IconStar } from './Icons';
import { Tooltip } from './Tooltip';
import { ContextMenu } from './ContextMenu';
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
  const { toast } = useToast();
  const { data: ghStatus } = useGitHubStatus(project.githubRepo);
  const typeColor = PROJECT_TYPE_COLORS[project.type] || '#6b7280';
  const statusColor = STATUS_COLORS[project.status] || '#6b7280';

  const copyPath = (e: React.MouseEvent) => {
    e.stopPropagation();
    navigator.clipboard.writeText(project.path);
    toast('Path copied to clipboard', 'success');
  };

  const enabled = getEnabledActions();

  const allItems: { id: string; label: string; icon?: React.ReactNode; onClick: () => void; separator?: boolean; condition?: boolean }[] = [
    { id: 'vscode', label: 'Open in VS Code', icon: <IconVSCode size={14} />, onClick: () => actions.openEditor(project.path, 'vscode') },
    { id: 'cursor', label: 'Open in Cursor', icon: <IconCursor size={14} />, onClick: () => actions.openEditor(project.path, 'cursor') },
    { id: 'claude', label: 'Open Claude Code Terminal', icon: <IconClaude size={14} />, onClick: () => actions.openClaudeTerminal(project.path) },
    { id: 'terminal', label: 'Open Terminal', icon: <IconTerminal size={14} />, onClick: () => actions.openTerminal(project.path) },
    { id: 'finder', label: 'Show in Finder', icon: <IconFolder size={14} />, onClick: () => actions.openFinder(project.path) },
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
    { id: 'start-dev', label: 'Start Dev Server', icon: <IconPlay size={12} color="var(--p-success)" />, onClick: () => { actions.startDev(project.path, project.devCommand!); toast('Dev server starting...', 'info'); }, condition: !!project.devCommand },
    { id: 'npm-install', label: 'npm install', onClick: () => { fetch('/api/actions/batch', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'npm-install', projectIds: [project.id] }) }).then((r) => r.json()).then(() => toast('npm install complete', 'success')).catch(() => toast('npm install failed', 'error')); } },
  ];

  const contextItems = allItems.filter(item => {
    if (item.separator) return true;
    if (item.condition === false) return false;
    return enabled.has(item.id);
  });

  return (
    <ContextMenu items={contextItems}>
      <div className="project-card" onClick={onClick}>
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
            <Tooltip content={project.status}>
              <div
                className="project-status-dot"
                style={{ background: statusColor }}
              />
            </Tooltip>
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
                  <Tooltip content="Uncommitted changes">
                    <span className="dirty-dot" />
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
                    actions.startDev(project.path, project.devCommand!);
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
