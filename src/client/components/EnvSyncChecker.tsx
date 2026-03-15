import { useState, useMemo } from 'react';
import { useEnvAudit, useEnvCrossSync } from '../hooks/useEnvSync';
import { IconRefresh } from './Icons';
import { Tooltip } from './Tooltip';
import { useQueryClient } from '@tanstack/react-query';

type IssueFilter = 'all' | 'missing-env' | 'missing-keys' | 'empty-secrets' | 'env-not-gitignored';
type ViewTab = 'issues' | 'matrix';

interface EnvSyncCheckerProps {
  onSelectProjectById?: (id: string) => void;
}

const FILTER_LABELS: Record<IssueFilter, string> = {
  all: 'All',
  'missing-env': 'Missing .env',
  'missing-keys': 'Missing Keys',
  'empty-secrets': 'Empty Secrets',
  'env-not-gitignored': 'Not Gitignored',
};

const SEVERITY_COLORS: Record<string, string> = {
  error: 'var(--p-danger)',
  warning: 'var(--p-warning)',
  info: 'var(--p-accent)',
};

export function EnvSyncChecker({ onSelectProjectById }: EnvSyncCheckerProps) {
  const [filter, setFilter] = useState<IssueFilter>('all');
  const [viewTab, setViewTab] = useState<ViewTab>('issues');
  const [search, setSearch] = useState('');
  const { data: audit, isLoading: auditLoading } = useEnvAudit();
  const { data: crossSync, isLoading: crossSyncLoading } = useEnvCrossSync();
  const qc = useQueryClient();

  const filteredIssues = useMemo(() => {
    if (!audit) return [];
    let issues = audit.issues;
    if (filter !== 'all') {
      issues = issues.filter((i) => i.issue === filter);
    }
    if (search) {
      const q = search.toLowerCase();
      issues = issues.filter(
        (i) =>
          i.projectName.toLowerCase().includes(q) ||
          i.detail.toLowerCase().includes(q),
      );
    }
    return issues;
  }, [audit, filter, search]);

  const filteredMatrix = useMemo(() => {
    if (!crossSync || !search) return crossSync;
    const q = search.toLowerCase();
    const filteredKeys = crossSync.keys.filter((k) => k.toLowerCase().includes(q));
    const filteredProjects = crossSync.projects.filter((p) => p.name.toLowerCase().includes(q));
    // Show keys matching search OR all keys if only project name matches
    const keysToShow = filteredKeys.length > 0 ? filteredKeys : crossSync.keys;
    const projectsToShow = filteredProjects.length > 0 ? filteredProjects : crossSync.projects;
    return {
      keys: keysToShow,
      projects: projectsToShow,
      matrix: crossSync.matrix,
    };
  }, [crossSync, search]);

  const handleRefresh = () => {
    qc.invalidateQueries({ queryKey: ['env-audit'] });
    qc.invalidateQueries({ queryKey: ['env-cross-sync'] });
  };

  const isLoading = auditLoading || crossSyncLoading;

  return (
    <div className="es-page">
      {/* Header */}
      <div className="es-header">
        <div className="es-title-row">
          <h2 className="es-title">Env Sync</h2>
          {audit && audit.issues.length > 0 && (
            <span className="es-badge es-badge-warning">{audit.issues.length} issues</span>
          )}
          {audit && audit.issues.length === 0 && (
            <span className="es-badge es-badge-success">All clear</span>
          )}
        </div>
        <button
          className={`p-btn p-btn-ghost p-btn-sm${isLoading ? ' is-scanning' : ''}`}
          onClick={handleRefresh}
          disabled={isLoading}
        >
          <IconRefresh size={13} />
          Refresh
        </button>
      </div>

      {/* View tabs */}
      <div className="es-view-tabs">
        <button
          className="es-view-tab"
          data-active={viewTab === 'issues' ? 'true' : undefined}
          onClick={() => setViewTab('issues')}
        >
          Issues {audit ? `(${audit.issues.length})` : ''}
        </button>
        <button
          className="es-view-tab"
          data-active={viewTab === 'matrix' ? 'true' : undefined}
          onClick={() => setViewTab('matrix')}
        >
          Key Matrix {crossSync ? `(${crossSync.keys.length})` : ''}
        </button>
      </div>

      {/* Search + filters */}
      <div className="es-toolbar">
        <input
          className="es-search"
          type="text"
          placeholder={viewTab === 'issues' ? 'Search projects or issues...' : 'Search keys or projects...'}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        {viewTab === 'issues' && (
          <div className="es-filter-group">
            {(Object.keys(FILTER_LABELS) as IssueFilter[]).map((f) => (
              <button
                key={f}
                className="es-filter-btn"
                data-active={filter === f ? 'true' : undefined}
                onClick={() => setFilter(f)}
              >
                {FILTER_LABELS[f]}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Content */}
      <div className="es-body">
        {viewTab === 'issues' && (
          <>
            {isLoading && (
              <div className="es-empty">Scanning environments...</div>
            )}
            {!isLoading && filteredIssues.length === 0 && (
              <div className="es-empty">
                {filter === 'all' && !search
                  ? 'No environment issues found. Your projects look healthy.'
                  : 'No matching issues. Try adjusting your filter or search term.'}
              </div>
            )}
            {!isLoading && filteredIssues.length > 0 && (
              <div className="es-issues-list">
                {filteredIssues.map((issue, i) => (
                  <div key={`${issue.projectId}-${issue.issue}-${i}`} className="es-issue-row">
                    <span
                      className="es-severity-dot"
                      style={{ background: SEVERITY_COLORS[issue.severity] }}
                    />
                    <button
                      className="es-project-link"
                      onClick={() => onSelectProjectById?.(issue.projectId)}
                    >
                      {issue.projectName}
                    </button>
                    <span className="es-issue-badge" data-type={issue.issue}>
                      {issue.issue.replace(/-/g, ' ')}
                    </span>
                    <span className="es-issue-detail">{issue.detail}</span>
                  </div>
                ))}
              </div>
            )}
          </>
        )}

        {viewTab === 'matrix' && (
          <>
            {isLoading && (
              <div className="es-empty">Building key matrix...</div>
            )}
            {!isLoading && (!filteredMatrix || filteredMatrix.keys.length === 0) && (
              <div className="es-empty">
                No shared keys across projects. Keys that appear in 2+ project .env files will show here.
              </div>
            )}
            {!isLoading && filteredMatrix && filteredMatrix.keys.length > 0 && (
              <div className="es-matrix-wrap">
                <table className="es-matrix">
                  <thead>
                    <tr>
                      <th className="es-matrix-key-col">Key</th>
                      {filteredMatrix.projects.map((p) => (
                        <th key={p.id} className="es-matrix-proj-col">
                          <Tooltip text={p.name}>
                            <button
                              className="es-project-link"
                              onClick={() => onSelectProjectById?.(p.id)}
                            >
                              {p.name.length > 14 ? p.name.slice(0, 12) + '...' : p.name}
                            </button>
                          </Tooltip>
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {filteredMatrix.keys.map((key) => (
                      <tr key={key} className="es-matrix-row">
                        <td className="es-matrix-key">
                          <code>{key}</code>
                        </td>
                        {filteredMatrix.projects.map((p) => {
                          const status = filteredMatrix.matrix[key]?.[p.id] || 'missing';
                          return (
                            <td key={p.id} className="es-matrix-cell">
                              <Tooltip text={`${key}: ${status}`}>
                                <span className={`es-dot es-dot-${status}`} />
                              </Tooltip>
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
