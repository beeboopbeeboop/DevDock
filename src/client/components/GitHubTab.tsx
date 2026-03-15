import { useState } from 'react';
import { useGitHubActions, useGitHubIssues, useGitHubPRsDetail } from '../hooks/useGitHub';
import { useToast } from './Toast';
import type { GitHubWorkflowRun, GitHubIssue, GitHubPRDetail } from '../types/project';

interface GitHubTabProps {
  githubRepo: string;
  projectPath?: string;
}

function CIIcon({ run }: { run: GitHubWorkflowRun }) {
  if (run.status === 'in_progress' || run.status === 'queued') {
    return <span className="gh-ci-dot gh-ci-running" title="In progress" />;
  }
  if (run.conclusion === 'success') {
    return <span className="gh-ci-dot gh-ci-pass" title="Passed" />;
  }
  if (run.conclusion === 'failure') {
    return <span className="gh-ci-dot gh-ci-fail" title="Failed" />;
  }
  return <span className="gh-ci-dot gh-ci-none" title={run.conclusion || 'Unknown'} />;
}

function ReviewBadge({ decision }: { decision: string }) {
  if (decision === 'APPROVED') {
    return <span className="gh-review-badge gh-review-approved">Approved</span>;
  }
  if (decision === 'CHANGES_REQUESTED') {
    return <span className="gh-review-badge gh-review-changes">Changes</span>;
  }
  if (decision === 'REVIEW_REQUIRED') {
    return <span className="gh-review-badge gh-review-pending">Review needed</span>;
  }
  return null;
}

function timeAgo(dateStr: string): string {
  if (!dateStr) return '';
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

export function GitHubTab({ githubRepo, projectPath }: GitHubTabProps) {
  const { toast } = useToast();
  const { data: actions = [], isLoading: loadingActions } = useGitHubActions(githubRepo);
  const { data: issues = [], isLoading: loadingIssues, refetch: refetchIssues } = useGitHubIssues(githubRepo);
  const { data: prs = [], isLoading: loadingPRs, refetch: refetchPRs } = useGitHubPRsDetail(githubRepo);

  const [showCreatePR, setShowCreatePR] = useState(false);
  const [prTitle, setPrTitle] = useState('');
  const [prBody, setPrBody] = useState('');
  const [prBase, setPrBase] = useState('');
  const [creatingPR, setCreatingPR] = useState(false);

  const [showCreateIssue, setShowCreateIssue] = useState(false);
  const [issueTitle, setIssueTitle] = useState('');
  const [issueBody, setIssueBody] = useState('');
  const [creatingIssue, setCreatingIssue] = useState(false);

  const handleCreatePR = async () => {
    if (!prTitle.trim() || !projectPath) return;
    setCreatingPR(true);
    try {
      const res = await fetch('/api/github/create-pr', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          path: projectPath,
          title: prTitle,
          body: prBody || undefined,
          base: prBase || undefined,
        }),
      });
      const data = await res.json();
      if (data.ok) {
        toast('PR created!', 'success');
        setPrTitle('');
        setPrBody('');
        setPrBase('');
        setShowCreatePR(false);
        refetchPRs();
      } else {
        toast(data.error || 'Failed to create PR', 'error');
      }
    } catch {
      toast('Failed to create PR', 'error');
    } finally {
      setCreatingPR(false);
    }
  };

  const handleCreateIssue = async () => {
    if (!issueTitle.trim()) return;
    setCreatingIssue(true);
    try {
      const res = await fetch('/api/github/create-issue', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          repo: githubRepo,
          title: issueTitle,
          body: issueBody || undefined,
        }),
      });
      const data = await res.json();
      if (data.ok) {
        toast('Issue created!', 'success');
        setIssueTitle('');
        setIssueBody('');
        setShowCreateIssue(false);
        refetchIssues();
      } else {
        toast(data.error || 'Failed to create issue', 'error');
      }
    } catch {
      toast('Failed to create issue', 'error');
    } finally {
      setCreatingIssue(false);
    }
  };

  return (
    <div>
      {/* CI / Workflow Runs */}
      <div className="detail-section">
        <div className="detail-section-title">
          CI / Actions
          {!loadingActions && actions.length > 0 && (
            <span style={{ marginLeft: 6, fontSize: 10, color: 'var(--p-text-muted)' }}>
              {actions.length}
            </span>
          )}
        </div>
        {loadingActions ? (
          <div className="scanning-indicator">Loading...</div>
        ) : actions.length === 0 ? (
          <div className="pm-centered-state">
            <div className="empty-state-title">No workflow runs</div>
            <div className="empty-state-desc">No CI/CD runs found. Add a .github/workflows YAML file to enable GitHub Actions for this repo.</div>
          </div>
        ) : (
          <div className="gh-runs-list">
            {actions.map((run: GitHubWorkflowRun) => (
              <div key={run.databaseId} className="gh-run-row">
                <CIIcon run={run} />
                <span className="gh-run-title">{run.displayTitle}</span>
                <span className="gh-run-branch">{run.headBranch}</span>
                <span className="gh-run-time">{timeAgo(run.createdAt)}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Pull Requests */}
      <div className="detail-section">
        <div className="detail-section-title" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span>
            Pull Requests
            {!loadingPRs && prs.length > 0 && (
              <span style={{ marginLeft: 6, fontSize: 10, color: 'var(--p-text-muted)' }}>
                {prs.length}
              </span>
            )}
          </span>
          {projectPath && (
            <button
              className="git-action-btn-sm"
              onClick={() => setShowCreatePR(!showCreatePR)}
            >
              {showCreatePR ? 'Cancel' : '+ New PR'}
            </button>
          )}
        </div>
        {showCreatePR && (
          <div className="gh-create-form">
            <input
              type="text"
              placeholder="PR title..."
              value={prTitle}
              onChange={(e) => setPrTitle(e.target.value)}
              className="gh-create-input"
              onKeyDown={(e) => e.key === 'Enter' && handleCreatePR()}
            />
            <textarea
              placeholder="Description (optional)"
              value={prBody}
              onChange={(e) => setPrBody(e.target.value)}
              className="gh-create-textarea"
              rows={3}
            />
            <input
              type="text"
              placeholder="Base branch (default: main)"
              value={prBase}
              onChange={(e) => setPrBase(e.target.value)}
              className="gh-create-input"
            />
            <button
              className="gh-setup-submit"
              onClick={handleCreatePR}
              disabled={!prTitle.trim() || creatingPR}
            >
              {creatingPR ? 'Creating...' : 'Create Pull Request'}
            </button>
          </div>
        )}
        {loadingPRs ? (
          <div className="scanning-indicator">Loading...</div>
        ) : prs.length === 0 ? (
          <div className="pm-centered-state">
            <div className="empty-state-title">No open pull requests</div>
            <div className="empty-state-desc">Push a branch and open a PR on GitHub, or use the "+ New PR" button above to create one from here.</div>
          </div>
        ) : (
          <div className="gh-pr-list">
            {prs.map((pr: GitHubPRDetail) => (
              <div key={pr.number} className="gh-pr-row">
                <span className="gh-pr-number">#{pr.number}</span>
                <span className="gh-pr-title">{pr.title}</span>
                <span className="gh-pr-branch">{pr.headRefName}</span>
                <ReviewBadge decision={pr.reviewDecision} />
                <span className="gh-pr-time">{timeAgo(pr.updatedAt)}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Issues */}
      <div className="detail-section">
        <div className="detail-section-title" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span>
            Issues
            {!loadingIssues && issues.length > 0 && (
              <span style={{ marginLeft: 6, fontSize: 10, color: 'var(--p-text-muted)' }}>
                {issues.length}
              </span>
            )}
          </span>
          <button
            className="git-action-btn-sm"
            onClick={() => setShowCreateIssue(!showCreateIssue)}
          >
            {showCreateIssue ? 'Cancel' : '+ New Issue'}
          </button>
        </div>
        {showCreateIssue && (
          <div className="gh-create-form">
            <input
              type="text"
              placeholder="Issue title..."
              value={issueTitle}
              onChange={(e) => setIssueTitle(e.target.value)}
              className="gh-create-input"
              onKeyDown={(e) => e.key === 'Enter' && handleCreateIssue()}
            />
            <textarea
              placeholder="Description (optional)"
              value={issueBody}
              onChange={(e) => setIssueBody(e.target.value)}
              className="gh-create-textarea"
              rows={3}
            />
            <button
              className="gh-setup-submit"
              onClick={handleCreateIssue}
              disabled={!issueTitle.trim() || creatingIssue}
            >
              {creatingIssue ? 'Creating...' : 'Create Issue'}
            </button>
          </div>
        )}
        {loadingIssues ? (
          <div className="scanning-indicator">Loading...</div>
        ) : issues.length === 0 ? (
          <div className="pm-centered-state">
            <div className="empty-state-title">No open issues</div>
            <div className="empty-state-desc">All clear -- no open issues on this repo. Use "+ New Issue" to create one.</div>
          </div>
        ) : (
          <div className="gh-issue-list">
            {issues.map((issue: GitHubIssue) => (
              <div key={issue.number} className="gh-issue-row">
                <span className="gh-issue-number">#{issue.number}</span>
                <span className="gh-issue-title">{issue.title}</span>
                <div className="gh-issue-labels">
                  {issue.labels.slice(0, 3).map((l) => (
                    <span
                      key={l.name}
                      className="gh-label"
                      style={{ background: `#${l.color}30`, color: `#${l.color}`, borderColor: `#${l.color}50` }}
                    >
                      {l.name}
                    </span>
                  ))}
                </div>
                <span className="gh-issue-time">{timeAgo(issue.createdAt)}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
