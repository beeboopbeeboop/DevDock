import { useState } from 'react';
import type { Project } from '../types/project';
import { useComposeServices, useDockerAction } from '../hooks/useDocker';
import { IconDocker } from './Icons';
import { useToast } from './Toast';

interface DockerTabProps {
  project: Project;
}

const STATE_COLORS: Record<string, string> = {
  running: 'var(--p-success)',
  exited: 'var(--p-danger, #ef4444)',
  paused: 'var(--p-warning)',
  created: 'var(--p-text-muted)',
};

export function DockerTab({ project }: DockerTabProps) {
  const hasCompose = project.techStack?.includes('docker-compose');
  const hasDockerfile = project.techStack?.includes('docker');
  const { toast } = useToast();
  const action = useDockerAction();
  const { data, isLoading } = useComposeServices(hasCompose ? project.path : null);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  const handleComposeAction = async (act: 'compose-up' | 'compose-down' | 'compose-restart', label: string) => {
    setActionLoading(act);
    action.mutate({ action: act, path: project.path }, {
      onSuccess: (data) => {
        toast(data.ok ? `${label} succeeded` : `${label} failed`, data.ok ? 'success' : 'error');
        setActionLoading(null);
      },
      onError: () => {
        toast(`${label} failed`, 'error');
        setActionLoading(null);
      },
    });
  };

  // Dockerfile only — no compose
  if (!hasCompose && hasDockerfile) {
    return (
      <div className="docker-tab">
        <div className="docker-info-card">
          <IconDocker size={20} color="var(--p-accent)" />
          <div>
            <div className="docker-info-title">Docker-ready</div>
            <div className="docker-info-desc">
              This project has a Dockerfile. Add a docker-compose.yml to manage services from DevDock.
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Compose project
  if (!hasCompose) return null;

  const services = data?.services || [];
  const runningCount = services.filter((s) => s.state === 'running').length;

  return (
    <div className="docker-tab">
      {/* Compose actions */}
      <div className="docker-compose-bar">
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <IconDocker size={14} color="var(--p-accent)" />
          <span style={{ fontSize: 12, fontWeight: 600 }}>Compose</span>
          {services.length > 0 && (
            <span style={{ fontSize: 11, color: 'var(--p-text-muted)' }}>
              {runningCount}/{services.length} running
            </span>
          )}
        </div>
        <div style={{ display: 'flex', gap: 6 }}>
          <button
            className="git-action-btn"
            onClick={() => handleComposeAction('compose-up', 'Compose Up')}
            disabled={actionLoading !== null}
          >
            <svg width={10} height={10} viewBox="0 0 24 24" fill="currentColor">
              <polygon points="5 3 19 12 5 21" />
            </svg>
            {actionLoading === 'compose-up' ? 'Starting...' : 'Up'}
          </button>
          <button
            className="git-action-btn"
            onClick={() => handleComposeAction('compose-down', 'Compose Down')}
            disabled={actionLoading !== null}
          >
            <svg width={10} height={10} viewBox="0 0 24 24" fill="currentColor">
              <rect x="6" y="6" width="12" height="12" rx="1" />
            </svg>
            {actionLoading === 'compose-down' ? 'Stopping...' : 'Down'}
          </button>
          <button
            className="git-action-btn"
            onClick={() => handleComposeAction('compose-restart', 'Restart')}
            disabled={actionLoading !== null}
          >
            {actionLoading === 'compose-restart' ? 'Restarting...' : 'Restart'}
          </button>
        </div>
      </div>

      {/* Services list */}
      {isLoading ? (
        <div className="scanning-indicator" style={{ padding: 16 }}>Loading services...</div>
      ) : services.length === 0 ? (
        <div className="pm-centered-state">
          <span>No services running. Click "Up" to start compose services.</span>
        </div>
      ) : (
        <div className="docker-services">
          {services.map((svc) => (
            <div key={svc.name} className="docker-service-row">
              <span
                className="lh-dot"
                style={{ background: STATE_COLORS[svc.state] || 'var(--p-text-muted)' }}
              />
              <span className="docker-service-name">{svc.name}</span>
              <span className="docker-service-status">{svc.status}</span>
              {svc.ports && (
                <span className="docker-service-ports">{svc.ports}</span>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
