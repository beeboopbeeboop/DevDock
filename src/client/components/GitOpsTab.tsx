import { useState, useEffect } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { Project } from '../types/project';
import { useGitStatus, useGitBranches, useGitStage, useGitCommit, useGitPush, useGitPull, useGitCheckout, useGitStashList, useGitStash, useGitStashPop } from '../hooks/useGitOps';
import { IconGitCommit, IconWand } from './Icons';
import { useToast } from './Toast';
import { DiffViewer } from './DiffViewer';

interface CommitEntry {
  hash: string;
  short: string;
  message: string;
  author: string;
  ago: string;
  insertions: number;
  deletions: number;
  filesChanged: number;
}

const STATUS_LABELS: Record<string, string> = {
  M: 'Modified',
  A: 'Added',
  D: 'Deleted',
  R: 'Renamed',
  C: 'Copied',
  '?': 'Untracked',
  U: 'Unmerged',
};

const STATUS_COLORS: Record<string, string> = {
  M: 'var(--p-warning)',
  A: 'var(--p-success)',
  D: 'var(--p-danger, #ef4444)',
  R: 'var(--p-accent)',
  '?': 'var(--p-text-muted)',
};

interface GitOpsTabProps {
  project: Project;
}

export function GitOpsTab({ project }: GitOpsTabProps) {
  const { toast } = useToast();
  const { data: status, isLoading: statusLoading } = useGitStatus(project.path, project.hasGit);
  const { data: branchData, refetch: refetchBranches } = useGitBranches(project.path, false);
  const stageMutation = useGitStage(project.path);
  const commitMutation = useGitCommit(project.path);
  const pushMutation = useGitPush(project.path);
  const pullMutation = useGitPull(project.path);
  const checkoutMutation = useGitCheckout(project.path);
  const { data: stashList = [], refetch: refetchStashes } = useGitStashList(project.path, project.hasGit);
  const stashMutation = useGitStash(project.path);
  const stashPopMutation = useGitStashPop(project.path);

  const [commitMsg, setCommitMsg] = useState('');
  const [showStash, setShowStash] = useState(false);
  const [stashMsg, setStashMsg] = useState('');
  const [showBranches, setShowBranches] = useState(false);
  const [newBranchName, setNewBranchName] = useState('');
  const [showNewBranch, setShowNewBranch] = useState(false);
  const [expandedDiff, setExpandedDiff] = useState<{ file: string; staged: boolean } | null>(null);
  const [generatingMsg, setGeneratingMsg] = useState(false);

  const handleGenerateMsg = async () => {
    setGeneratingMsg(true);
    try {
      const res = await fetch('/api/actions/generate-commit-msg', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: project.path }),
      });
      const data = await res.json();
      if (data.message) setCommitMsg(data.message);
    } catch {
      toast('Failed to generate message', 'error');
    } finally {
      setGeneratingMsg(false);
    }
  };
  const [commits, setCommits] = useState<CommitEntry[]>([]);
  const [loadingCommits, setLoadingCommits] = useState(false);

  // Load commit history
  useEffect(() => {
    if (project.hasGit && commits.length === 0 && !loadingCommits) {
      setLoadingCommits(true);
      fetch(`/api/actions/git-log?path=${encodeURIComponent(project.path)}`)
        .then((r) => r.ok ? r.json() : [])
        .then((data) => setCommits(Array.isArray(data) ? data : []))
        .catch(() => setCommits([]))
        .finally(() => setLoadingCommits(false));
    }
  }, [project.path, project.hasGit, commits.length, loadingCommits]);

  const qc = useQueryClient();
  const initGitMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch('/api/actions/git-init', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: project.path }),
      });
      return res.json();
    },
    onSuccess: (data) => {
      if (data.ok) {
        toast('Git initialized!', 'success');
        qc.invalidateQueries({ queryKey: ['projects'] });
      } else {
        toast(data.error || 'Failed to initialize git', 'error');
      }
    },
  });

  if (!project.hasGit) {
    return (
      <div className="pm-centered-state">
        <svg width={32} height={32} viewBox="0 0 24 24" fill="none" stroke="var(--p-text-muted)" strokeWidth="1.5" strokeLinecap="round">
          <line x1="6" y1="3" x2="6" y2="15" />
          <circle cx="18" cy="6" r="3" />
          <circle cx="6" cy="18" r="3" />
          <path d="M18 9a9 9 0 0 1-9 9" />
        </svg>
        <div className="empty-state-title">Not a git repository</div>
        <div className="empty-state-desc">Initialize git to start tracking changes</div>
        <button
          className="git-action-btn"
          style={{ marginTop: 12, padding: '6px 16px' }}
          onClick={() => initGitMutation.mutate()}
          disabled={initGitMutation.isPending}
        >
          {initGitMutation.isPending ? 'Initializing...' : 'Initialize Git'}
        </button>
      </div>
    );
  }

  const staged = status?.staged || [];
  const unstaged = status?.unstaged || [];
  const hasChanges = staged.length > 0 || unstaged.length > 0;

  const handleStageAll = () => {
    const files = unstaged.map((f) => f.file);
    if (files.length > 0) stageMutation.mutate({ files });
  };

  const handleUnstageAll = () => {
    const files = staged.map((f) => f.file);
    if (files.length > 0) stageMutation.mutate({ files, unstage: true });
  };

  const handleCommit = () => {
    if (!commitMsg.trim() || staged.length === 0) return;
    commitMutation.mutate(commitMsg, {
      onSuccess: (data) => {
        if (data.ok) {
          toast('Committed successfully', 'success');
          setCommitMsg('');
          setCommits([]); // trigger refetch
        } else {
          toast('Commit failed', 'error');
        }
      },
    });
  };

  const handlePush = () => {
    pushMutation.mutate(undefined, {
      onSuccess: (data) => {
        toast(data.ok ? 'Pushed to remote' : 'Push failed', data.ok ? 'success' : 'error');
      },
    });
  };

  const handlePull = () => {
    pullMutation.mutate(undefined, {
      onSuccess: (data) => {
        toast(data.ok ? 'Pulled from remote' : 'Pull failed', data.ok ? 'success' : 'error');
        if (data.ok) setCommits([]);
      },
    });
  };

  const handleSwitchBranch = (branch: string) => {
    checkoutMutation.mutate({ branch }, {
      onSuccess: () => {
        toast(`Switched to ${branch}`, 'success');
        setShowBranches(false);
        setCommits([]);
      },
    });
  };

  const handleCreateBranch = () => {
    if (!newBranchName.trim()) return;
    checkoutMutation.mutate({ branch: newBranchName.trim(), create: true }, {
      onSuccess: () => {
        toast(`Created branch ${newBranchName}`, 'success');
        setNewBranchName('');
        setShowNewBranch(false);
        setShowBranches(false);
        setCommits([]);
      },
    });
  };

  return (
    <div className="git-ops">
      {/* Branch bar */}
      <div className="git-branch-bar">
        <div className="git-branch-current">
          <svg width={12} height={12} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <line x1="6" y1="3" x2="6" y2="15" />
            <circle cx="18" cy="6" r="3" />
            <circle cx="6" cy="18" r="3" />
            <path d="M18 9a9 9 0 0 1-9 9" />
          </svg>
          <button
            className="git-branch-name"
            onClick={() => { setShowBranches(!showBranches); if (!branchData) refetchBranches(); }}
          >
            {project.gitBranch || 'main'}
            <svg width={10} height={10} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <polyline points="6 9 12 15 18 9" />
            </svg>
          </button>
        </div>
        <div style={{ display: 'flex', gap: 6 }}>
          <button className="git-action-btn" onClick={handlePull} disabled={pullMutation.isPending}>
            <svg width={12} height={12} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <line x1="12" y1="5" x2="12" y2="19" /><polyline points="19 12 12 19 5 12" />
            </svg>
            Pull
          </button>
          <button className="git-action-btn" onClick={handlePush} disabled={pushMutation.isPending}>
            <svg width={12} height={12} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <line x1="12" y1="19" x2="12" y2="5" /><polyline points="5 12 12 5 19 12" />
            </svg>
            Push
          </button>
        </div>
      </div>

      {/* Branch dropdown */}
      {showBranches && branchData && (
        <div className="git-branch-dropdown">
          {branchData.branches.map((b) => (
            <button
              key={b.name}
              className="git-branch-option"
              data-active={b.isCurrent ? 'true' : undefined}
              onClick={() => !b.isCurrent && handleSwitchBranch(b.name)}
            >
              {b.name}
              {b.isRemote && <span className="git-branch-remote">remote</span>}
              {b.isCurrent && <span className="git-branch-check">✓</span>}
            </button>
          ))}
          <div className="git-branch-divider" />
          {showNewBranch ? (
            <div className="git-new-branch-input">
              <input
                type="text"
                placeholder="Branch name..."
                value={newBranchName}
                onChange={(e) => setNewBranchName(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleCreateBranch()}
                autoFocus
              />
              <button className="git-action-btn" onClick={handleCreateBranch}>Create</button>
            </div>
          ) : (
            <button className="git-branch-option" onClick={() => setShowNewBranch(true)}>
              + New branch
            </button>
          )}
        </div>
      )}

      {/* Changed files */}
      {statusLoading ? (
        <div className="scanning-indicator" style={{ padding: 16 }}>Loading changes...</div>
      ) : hasChanges ? (
        <div className="git-changes">
          {/* Staged files */}
          {staged.length > 0 && (
            <div className="git-file-section">
              <div className="git-file-section-header">
                <span className="git-file-section-title">Staged ({staged.length})</span>
                <button className="git-action-btn-sm" onClick={handleUnstageAll}>Unstage all</button>
              </div>
              {staged.map((f) => (
                <div key={`s-${f.file}`}>
                  <div className="git-file-row git-file-row-clickable" onClick={() => setExpandedDiff(
                    expandedDiff?.file === f.file && expandedDiff?.staged ? null : { file: f.file, staged: true }
                  )}>
                    <span className="git-file-status" style={{ color: STATUS_COLORS[f.status] || 'var(--p-text-dim)' }}>
                      {f.status}
                    </span>
                    <span className="git-file-name">{f.file}</span>
                    <svg className={`git-file-chevron${expandedDiff?.file === f.file && expandedDiff?.staged ? ' git-file-chevron-open' : ''}`} width={10} height={10} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="6 9 12 15 18 9" /></svg>
                    <button
                      className="git-action-btn-sm"
                      onClick={(e) => { e.stopPropagation(); stageMutation.mutate({ files: [f.file], unstage: true }); }}
                    >
                      −
                    </button>
                  </div>
                  {expandedDiff?.file === f.file && expandedDiff?.staged && (
                    <DiffViewer path={project.path} file={f.file} staged />
                  )}
                </div>
              ))}
            </div>
          )}

          {/* Unstaged files */}
          {unstaged.length > 0 && (
            <div className="git-file-section">
              <div className="git-file-section-header">
                <span className="git-file-section-title">Changes ({unstaged.length})</span>
                <button className="git-action-btn-sm" onClick={handleStageAll}>Stage all</button>
              </div>
              {unstaged.map((f) => (
                <div key={`u-${f.file}`}>
                  <div className="git-file-row git-file-row-clickable" onClick={() => setExpandedDiff(
                    expandedDiff?.file === f.file && !expandedDiff?.staged ? null : { file: f.file, staged: false }
                  )}>
                    <span className="git-file-status" style={{ color: STATUS_COLORS[f.status] || 'var(--p-text-dim)' }}>
                      {f.status}
                    </span>
                    <span className="git-file-name">{f.file}</span>
                    <svg className={`git-file-chevron${expandedDiff?.file === f.file && !expandedDiff?.staged ? ' git-file-chevron-open' : ''}`} width={10} height={10} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="6 9 12 15 18 9" /></svg>
                    <button
                      className="git-action-btn-sm"
                      onClick={(e) => { e.stopPropagation(); stageMutation.mutate({ files: [f.file] }); }}
                    >
                      +
                    </button>
                  </div>
                  {expandedDiff?.file === f.file && !expandedDiff?.staged && (
                    <DiffViewer path={project.path} file={f.file} />
                  )}
                </div>
              ))}
            </div>
          )}

          {/* Commit section */}
          <div className="git-commit-section">
            <div className="git-commit-input-wrap">
              <textarea
                className="git-commit-input"
                placeholder="Commit message..."
                value={commitMsg}
                onChange={(e) => setCommitMsg(e.target.value)}
                rows={2}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) handleCommit();
                }}
              />
              <button
                className="git-generate-btn"
                onClick={handleGenerateMsg}
                disabled={staged.length === 0 || generatingMsg}
                title="Generate commit message"
              >
                <IconWand size={13} />
              </button>
            </div>
            <button
              className="git-commit-btn"
              onClick={handleCommit}
              disabled={!commitMsg.trim() || staged.length === 0 || commitMutation.isPending}
            >
              {commitMutation.isPending ? 'Committing...' : `Commit (${staged.length} file${staged.length !== 1 ? 's' : ''})`}
            </button>
          </div>
        </div>
      ) : (
        <div className="git-clean-state">
          <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="var(--p-success)" strokeWidth="2" strokeLinecap="round">
            <polyline points="20 6 9 17 4 12" />
          </svg>
          Working tree clean
        </div>
      )}

      {/* Stash section */}
      <div className="git-stash-section">
        <div className="git-file-section-header" style={{ marginTop: 12 }}>
          <button
            className="detail-section-title"
            style={{ background: 'none', border: 'none', color: 'inherit', cursor: 'pointer', padding: 0, font: 'inherit', display: 'flex', alignItems: 'center', gap: 6 }}
            onClick={() => { setShowStash(!showStash); if (!showStash) refetchStashes(); }}
          >
            <svg width={10} height={10} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" style={{ transform: showStash ? 'rotate(90deg)' : 'none', transition: 'transform 150ms ease' }}>
              <polyline points="9 18 15 12 9 6" />
            </svg>
            Stash {stashList.length > 0 && <span className="topbar-meta">{stashList.length}</span>}
          </button>
          {hasChanges && (
            <button
              className="git-action-btn-sm"
              onClick={() => {
                stashMutation.mutate(stashMsg || undefined, {
                  onSuccess: (data) => {
                    if (data.ok) { toast('Changes stashed', 'success'); setStashMsg(''); }
                    else toast('Stash failed', 'error');
                  },
                });
              }}
              disabled={stashMutation.isPending}
            >
              Stash changes
            </button>
          )}
        </div>
        {showStash && (
          <div style={{ padding: '0 0 8px' }}>
            {hasChanges && (
              <input
                type="text"
                className="git-commit-input"
                style={{ fontSize: 11, padding: '5px 8px', margin: '4px 0 8px', width: '100%' }}
                placeholder="Stash message (optional)..."
                value={stashMsg}
                onChange={(e) => setStashMsg(e.target.value)}
              />
            )}
            {stashList.length > 0 ? stashList.map((s, i) => (
              <div key={s.ref} className="git-file-row" style={{ justifyContent: 'space-between' }}>
                <span className="git-file-name" style={{ fontSize: 11 }}>{s.message || s.ref}</span>
                <button
                  className="git-action-btn-sm"
                  onClick={() => {
                    stashPopMutation.mutate(i, {
                      onSuccess: (data) => {
                        toast(data.ok ? 'Stash applied' : 'Stash pop failed', data.ok ? 'success' : 'error');
                      },
                    });
                  }}
                  disabled={stashPopMutation.isPending}
                >
                  Pop
                </button>
              </div>
            )) : (
              <div style={{ fontSize: 11, color: 'var(--p-text-muted)', padding: '4px 0' }}>No stashes</div>
            )}
          </div>
        )}
      </div>

      {/* Commit history */}
      <div className="git-history-section">
        <div className="detail-section-title" style={{ marginTop: 16 }}>History</div>
        {loadingCommits ? (
          <div className="scanning-indicator" style={{ padding: 12 }}>Loading commits...</div>
        ) : commits.length > 0 ? (
          <div className="commit-list">
            {commits.map((c) => (
              <div key={c.hash} className="commit-row">
                <div className="commit-main">
                  <IconGitCommit size={14} color="var(--p-text-muted)" />
                  {project.githubUrl ? (
                    <a
                      href={`${project.githubUrl}/commit/${c.hash}`}
                      target="_blank"
                      rel="noopener"
                      className="commit-hash commit-hash-link"
                    >
                      {c.short}
                    </a>
                  ) : (
                    <span className="commit-hash">{c.short}</span>
                  )}
                  <span className="commit-message">{c.message}</span>
                </div>
                <div className="commit-meta">
                  <span className="commit-ago">{c.ago}</span>
                  {(c.insertions > 0 || c.deletions > 0) && (
                    <span className="commit-stats">
                      {c.insertions > 0 && <span className="commit-plus">+{c.insertions}</span>}
                      {c.deletions > 0 && <span className="commit-minus">-{c.deletions}</span>}
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="pm-centered-state">
            <span>No commits</span>
          </div>
        )}
      </div>
    </div>
  );
}
