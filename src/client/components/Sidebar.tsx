import {
  STATUS_COLORS,
} from '../types/project';
import type { Project, ProjectStatus } from '../types/project';
import type { AppView } from '../App';
import { IconRefresh, IconGitHub, IconExternalLink, IconGitCommit, IconSearch, IconDocker, IconShield, IconChart } from './Icons';
import { AnimatedNumber } from './AnimatedNumber';

interface RunningServer {
  name: string;
  port: number;
}

interface SidebarProps {
  onFilterStatus: (status?: ProjectStatus) => void;
  activeStatus?: ProjectStatus;
  statusCounts: Record<string, number>;
  onScan: () => void;
  isScanning: boolean;
  onOpenCommandPalette: () => void;
  onOpenSettings: () => void;
  runningServers?: RunningServer[];
  recentProjects?: Project[];
  dirtyCount?: number;
  showDirtyOnly?: boolean;
  onSelectProject?: (project: Project) => void;
  appView?: AppView;
  onChangeView?: (view: AppView) => void;
  onFilterDirty?: () => void;
}

const ALL_STATUSES: ProjectStatus[] = ['active', 'maintenance', 'paused', 'archived', 'idea'];

const QUICK_LINKS = [
  { label: 'GitHub Dashboard', url: 'https://github.com', icon: <IconGitHub size={13} /> },
  { label: 'Vercel Dashboard', url: 'https://vercel.com/dashboard', icon: <IconExternalLink size={13} /> },
  { label: 'Cloudflare Dashboard', url: 'https://dash.cloudflare.com', icon: <IconExternalLink size={13} /> },
];

const isMac = typeof navigator !== 'undefined' && navigator.platform.includes('Mac');

export function Sidebar({
  onFilterStatus,
  activeStatus,
  statusCounts,
  onScan,
  isScanning,
  onOpenCommandPalette,
  onOpenSettings,
  runningServers = [],
  recentProjects = [],
  dirtyCount = 0,
  showDirtyOnly = false,
  onSelectProject,
  appView = 'projects',
  onChangeView,
  onFilterDirty,
}: SidebarProps) {
  return (
    <aside className="sidebar">
      <div className="sidebar-header">
        <div className="sidebar-logo">
          <span>&#9670;</span> DevDock
        </div>

        <button
          className="cmdp-trigger"
          onClick={onOpenCommandPalette}
        >
          <span style={{ color: 'var(--p-text-muted)' }}>Search or command...</span>
          <kbd className="cmdp-shortcut">{isMac ? '⌘K' : 'Ctrl+K'}</kbd>
        </button>
      </div>

      <div className="sidebar-body">
        {/* Navigation */}
        <div className="sidebar-section">
          <div className="sidebar-section-title">Views</div>
          <button
            className="sidebar-item"
            data-active={appView === 'projects' ? 'true' : undefined}
            onClick={() => onChangeView?.('projects')}
          >
            <svg width={13} height={13} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
              <rect x="3" y="3" width="7" height="7" rx="1" />
              <rect x="14" y="3" width="7" height="7" rx="1" />
              <rect x="3" y="14" width="7" height="7" rx="1" />
              <rect x="14" y="14" width="7" height="7" rx="1" />
            </svg>
            Projects
          </button>
          <button
            className="sidebar-item"
            data-active={appView === 'ports' ? 'true' : undefined}
            onClick={() => onChangeView?.('ports')}
          >
            <svg width={13} height={13} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
              <circle cx="12" cy="12" r="10" />
              <line x1="12" y1="8" x2="12" y2="12" />
              <line x1="12" y1="12" x2="16" y2="14" />
            </svg>
            Ports
            {runningServers.length > 0 && (
              <span className="sidebar-item-count" style={{ color: 'var(--p-success)' }}>
                <AnimatedNumber value={runningServers.length} />
              </span>
            )}
          </button>
          <button
            className="sidebar-item"
            data-active={appView === 'docker' ? 'true' : undefined}
            onClick={() => onChangeView?.('docker')}
          >
            <IconDocker size={13} />
            Docker
          </button>
          <button
            className="sidebar-item"
            data-active={appView === 'graph' ? 'true' : undefined}
            onClick={() => onChangeView?.('graph')}
          >
            <svg width={13} height={13} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
              <circle cx="6" cy="6" r="3" />
              <circle cx="18" cy="6" r="3" />
              <circle cx="12" cy="18" r="3" />
              <line x1="8.5" y1="7.5" x2="10" y2="16" />
              <line x1="15.5" y1="7.5" x2="14" y2="16" />
            </svg>
            Graph
          </button>
          <button
            className="sidebar-item"
            data-active={appView === 'env' ? 'true' : undefined}
            onClick={() => onChangeView?.('env')}
          >
            <IconShield size={13} />
            Env Sync
          </button>
          <button
            className="sidebar-item"
            data-active={appView === 'insights' ? 'true' : undefined}
            onClick={() => onChangeView?.('insights')}
          >
            <IconChart size={13} />
            Insights
          </button>
          <button
            className="sidebar-item"
            data-active={appView === 'search' ? 'true' : undefined}
            onClick={() => onChangeView?.('search')}
          >
            <IconSearch size={13} />
            Search
          </button>
        </div>

        {/* Filters */}
        <div className="sidebar-section">
          <div className="sidebar-section-title">Filters</div>
          {ALL_STATUSES.map((status) => {
            const count = statusCounts[status] || 0;
            if (count === 0) return null;
            return (
              <button
                key={status}
                className="sidebar-item"
                data-active={activeStatus === status ? 'true' : undefined}
                onClick={() => onFilterStatus(activeStatus === status ? undefined : status)}
              >
                <span
                  style={{
                    width: 8, height: 8, borderRadius: '50%',
                    background: STATUS_COLORS[status], flexShrink: 0,
                  }}
                />
                {status.charAt(0).toUpperCase() + status.slice(1)}
                <span className="sidebar-item-count"><AnimatedNumber value={count} /></span>
              </button>
            );
          })}
          {dirtyCount > 0 && (
            <button
              className="sidebar-item"
              data-active={showDirtyOnly && appView === 'projects' ? 'true' : undefined}
              onClick={() => onFilterDirty?.()}
            >
              <IconGitCommit size={12} color="var(--p-warning)" />
              Uncommitted
              <span className="sidebar-item-count" style={{ color: 'var(--p-warning)' }}><AnimatedNumber value={dirtyCount} /></span>
            </button>
          )}
          {activeStatus && (
            <button
              className="sidebar-item"
              style={{ color: 'var(--p-text-muted)', fontSize: 11 }}
              onClick={() => onFilterStatus(undefined)}
            >
              Clear filter
            </button>
          )}
        </div>

        {/* Recently Modified */}
        {recentProjects.length > 0 && (
          <div className="sidebar-section">
            <div className="sidebar-section-title">Recently Modified</div>
            {recentProjects.map((p) => (
              <button
                key={p.id}
                className="sidebar-item"
                onClick={() => onSelectProject?.(p)}
              >
                <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {p.name}
                </span>
                <span className="sidebar-item-count">
                  {timeAgoShort(p.lastModified)}
                </span>
              </button>
            ))}
          </div>
        )}

        {/* Quick Links */}
        <div className="sidebar-section">
          <div className="sidebar-section-title">Quick Links</div>
          <div className="quick-links">
            {QUICK_LINKS.map((link) => (
              <a key={link.url} href={link.url} target="_blank" rel="noopener">
                {link.icon}
                {link.label}
              </a>
            ))}
          </div>
        </div>
      </div>

      <div className="sidebar-footer">
        <button
          className={`p-btn p-btn-accent${isScanning ? ' is-scanning' : ''}`}
          style={{ flex: 1, justifyContent: 'center' }}
          onClick={onScan}
          disabled={isScanning}
        >
          <IconRefresh size={13} />
          {isScanning ? 'Scanning...' : 'Rescan'}
        </button>
      </div>
    </aside>
  );
}

function timeAgoShort(dateStr: string): string {
  if (!dateStr) return '';
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${mins}m`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d`;
  return `${Math.floor(days / 30)}mo`;
}
