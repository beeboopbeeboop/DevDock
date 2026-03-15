import type { Project } from '../types/project';

interface QuickPeekProps {
  project: Project;
  isServerRunning?: boolean;
}

function timeAgo(dateStr: string): string {
  if (!dateStr) return 'unknown';
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

export function QuickPeek({ project, isServerRunning }: QuickPeekProps) {
  return (
    <div className="quick-peek" onClick={(e) => e.stopPropagation()}>
      {/* Git info */}
      {project.hasGit && (
        <div className="quick-peek-section">
          <div className="quick-peek-row">
            <span className="quick-peek-label">Branch</span>
            <span className="quick-peek-value">{project.gitBranch || 'unknown'}</span>
          </div>
          {project.gitDirty && (
            <div className="quick-peek-row">
              <span className="quick-peek-label">Dirty files</span>
              <span className="quick-peek-value" style={{ color: 'var(--p-warning)' }}>
                {project.gitDirtyCount}
              </span>
            </div>
          )}
          <div className="quick-peek-row">
            <span className="quick-peek-label">Modified</span>
            <span className="quick-peek-value">{timeAgo(project.lastModified)}</span>
          </div>
        </div>
      )}

      {/* Server status */}
      <div className="quick-peek-row">
        <span className="quick-peek-label">Dev server</span>
        <span className="quick-peek-value">
          {isServerRunning ? (
            <span style={{ color: 'var(--p-success)' }}>:{project.devPort}</span>
          ) : (
            <span style={{ color: 'var(--p-text-muted)' }}>stopped</span>
          )}
        </span>
      </div>

      {/* Tech stack */}
      {project.techStack.length > 0 && (
        <div className="quick-peek-tech">
          {project.techStack.slice(0, 5).map((t) => (
            <span key={t} className="quick-peek-tech-pill">{t}</span>
          ))}
        </div>
      )}
    </div>
  );
}
