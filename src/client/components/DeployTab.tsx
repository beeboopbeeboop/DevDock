import { useState } from 'react';
import { useDeployStatus, useDeployHistory, useDeployHealth, useTriggerDeploy } from '../hooks/useDeploy';
import { IconExternalLink, IconPlay, IconRefresh } from './Icons';
import { Tooltip } from './Tooltip';
import { useToast } from './Toast';

interface DeployTabProps {
  projectId: string;
  deployTarget: string;
}

function timeAgo(dateStr: string): string {
  if (!dateStr) return '';
  const ts = Number(dateStr) || new Date(dateStr).getTime();
  if (isNaN(ts)) return '';
  const diff = Date.now() - ts;
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

function StatusBadge({ status }: { status: string }) {
  const colors: Record<string, string> = {
    READY: 'var(--p-success)',
    ready: 'var(--p-success)',
    BUILDING: 'var(--p-warning)',
    building: 'var(--p-warning)',
    ERROR: 'var(--p-danger)',
    error: 'var(--p-danger)',
  };
  const color = colors[status] || 'var(--p-text-muted)';
  return (
    <span className="deploy-status-badge" style={{ color, borderColor: color }}>
      {status}
    </span>
  );
}

export function DeployTab({ projectId, deployTarget }: DeployTabProps) {
  const [confirmDeploy, setConfirmDeploy] = useState<string | null>(null);
  const { data: status, isLoading: loadingStatus } = useDeployStatus(projectId);
  const { data: history = [], isLoading: loadingHistory } = useDeployHistory(projectId);
  const { data: health } = useDeployHealth(projectId);
  const triggerDeploy = useTriggerDeploy();
  const { toast } = useToast();

  const handleDeploy = async (env: string) => {
    setConfirmDeploy(null);
    await triggerDeploy.mutateAsync({ projectId, environment: env });
    toast(`Deploy triggered (${env})`, 'success');
  };

  if (loadingStatus) {
    return <div className="scanning-indicator" style={{ padding: 20 }}>Loading deploy info...</div>;
  }

  if (status?.cliMissing) {
    return (
      <div className="detail-section" style={{ padding: 20 }}>
        <div className="detail-section-title">Deploy Target: {deployTarget}</div>
        <div style={{ fontSize: 12, color: 'var(--p-text-muted)', marginTop: 8 }}>
          The <code style={{ color: 'var(--p-accent)' }}>
            {deployTarget === 'vercel' ? 'vercel' : 'wrangler'}
          </code> CLI is not installed or not authenticated.
          <br />
          Install it to see deployment status here.
        </div>
      </div>
    );
  }

  return (
    <div>
      {/* Current Deployment */}
      <div className="detail-section">
        <div className="detail-section-title">Current Deployment</div>
        {status?.lastDeploy ? (
          <div className="deploy-current-card">
            <div className="deploy-current-row">
              <StatusBadge status={status.lastDeploy.status} />
              <span className="deploy-env-badge">{status.lastDeploy.environment}</span>
              <span className="deploy-time">{timeAgo(status.lastDeploy.createdAt)}</span>
            </div>
            {status.lastDeploy.url && (
              <div className="deploy-url-row">
                <code className="deploy-url">{status.lastDeploy.url}</code>
                <Tooltip content="Open">
                  <button
                    className="p-icon-btn"
                    onClick={() => {
                      const url = status.lastDeploy!.url.startsWith('http')
                        ? status.lastDeploy!.url
                        : `https://${status.lastDeploy!.url}`;
                      window.open(url, '_blank');
                    }}
                  >
                    <IconExternalLink size={13} />
                  </button>
                </Tooltip>
              </div>
            )}
            {/* Health check */}
            {health && (
              <div className="deploy-health-row">
                <span
                  className="lh-dot"
                  style={{
                    background: health.healthy ? 'var(--p-success)' : 'var(--p-danger)',
                    boxShadow: health.healthy
                      ? '0 0 6px var(--p-success)'
                      : '0 0 6px var(--p-danger)',
                  }}
                />
                <span style={{ fontSize: 11, color: 'var(--p-text-dim)' }}>
                  {health.healthy ? `Healthy` : 'Unreachable'}
                  {health.responseTime > 0 && ` (${health.responseTime}ms)`}
                </span>
              </div>
            )}
          </div>
        ) : (
          <div className="pm-centered-state">
            <span>No deployments found</span>
          </div>
        )}
      </div>

      {/* Deploy Actions */}
      <div className="detail-section">
        <div className="detail-section-title">Actions</div>
        <div className="deploy-actions">
          {confirmDeploy ? (
            <div className="deploy-confirm">
              <span style={{ fontSize: 12 }}>
                Deploy to <strong>{confirmDeploy}</strong>?
              </span>
              <button
                className="p-btn p-btn-accent p-btn-sm"
                onClick={() => handleDeploy(confirmDeploy)}
              >
                Confirm
              </button>
              <button
                className="p-btn p-btn-ghost p-btn-sm"
                onClick={() => setConfirmDeploy(null)}
              >
                Cancel
              </button>
            </div>
          ) : (
            <>
              <button
                className="lh-action-btn"
                onClick={() => setConfirmDeploy('preview')}
              >
                <IconPlay size={12} color="var(--p-accent)" />
                Deploy Preview
              </button>
              <button
                className="lh-action-btn deploy-prod-btn"
                onClick={() => setConfirmDeploy('production')}
              >
                <IconPlay size={12} color="var(--p-warning)" />
                Deploy Production
              </button>
            </>
          )}
        </div>
      </div>

      {/* Deploy History */}
      <div className="detail-section">
        <div className="detail-section-title">
          History
          {!loadingHistory && history.length > 0 && (
            <span style={{ marginLeft: 6, fontSize: 10, color: 'var(--p-text-muted)' }}>
              {history.length}
            </span>
          )}
        </div>
        {loadingHistory ? (
          <div className="scanning-indicator">Loading...</div>
        ) : history.length === 0 ? (
          <div className="pm-centered-state">
            <span>No deployment history</span>
          </div>
        ) : (
          <div className="deploy-history-list">
            {history.map((d) => (
              <div key={d.id} className="deploy-history-row">
                <StatusBadge status={d.status} />
                <span className="deploy-env-badge">{d.environment}</span>
                {d.url && (
                  <code className="deploy-history-url">{d.url}</code>
                )}
                <span className="deploy-time">{timeAgo(d.createdAt)}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
