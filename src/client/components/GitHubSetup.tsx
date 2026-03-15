import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { IconGitHub, IconExternalLink } from './Icons';
import { useToast } from './Toast';

interface GitHubSetupProps {
  projectName: string;
  projectPath: string;
  hasGit: boolean;
}

export function GitHubSetup({ projectName, projectPath, hasGit }: GitHubSetupProps) {
  const { toast } = useToast();
  const qc = useQueryClient();

  const [mode, setMode] = useState<'choose' | 'create' | 'connect' | 'success'>('choose');
  const [repoName, setRepoName] = useState(projectName);
  const [visibility, setVisibility] = useState<'private' | 'public'>('private');
  const [description, setDescription] = useState('');
  const [remoteUrl, setRemoteUrl] = useState('');
  const [createdUrl, setCreatedUrl] = useState('');
  const [createdRepo, setCreatedRepo] = useState('');

  const createMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch('/api/github/create-repo', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: repoName,
          visibility,
          description: description || undefined,
          path: projectPath,
        }),
      });
      return res.json();
    },
    onSuccess: (data) => {
      if (data.ok) {
        setCreatedUrl(data.url);
        setCreatedRepo(data.repo);
        setMode('success');
      } else {
        toast(data.error || 'Failed to create repo', 'error');
      }
    },
  });

  const connectMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch('/api/github/connect-remote', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: projectPath, url: remoteUrl }),
      });
      return res.json();
    },
    onSuccess: (data) => {
      if (data.ok) {
        setCreatedRepo(data.repo || remoteUrl);
        setCreatedUrl(data.repo ? `https://github.com/${data.repo}` : remoteUrl);
        setMode('success');
      } else {
        toast(data.error || 'Failed to connect remote', 'error');
      }
    },
  });

  const initGitMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch('/api/actions/git-init', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: projectPath }),
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

  if (!hasGit) {
    return (
      <div className="pm-centered-state">
        <IconGitHub size={32} />
        <div className="empty-state-title">Not a git repository</div>
        <div className="empty-state-desc">Initialize git first to connect GitHub</div>
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

  if (mode === 'success') {
    return (
      <div className="gh-setup">
        <div className="gh-setup-icon">
          <svg width={40} height={40} viewBox="0 0 24 24" fill="none" stroke="var(--p-success)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
            <polyline points="22 4 12 14.01 9 11.01" />
          </svg>
        </div>
        <div className="gh-setup-title">Repository Created</div>
        <div className="gh-setup-desc" style={{ fontFamily: 'var(--p-font-mono, monospace)', fontSize: 12 }}>{createdRepo}</div>
        <div className="gh-setup-actions">
          <button
            className="gh-setup-btn"
            onClick={() => window.open(createdUrl, '_blank')}
          >
            <IconExternalLink size={14} />
            Open on GitHub
          </button>
          <button
            className="gh-setup-btn gh-setup-btn-secondary"
            onClick={() => qc.invalidateQueries({ queryKey: ['projects'] })}
          >
            View Details
          </button>
        </div>
      </div>
    );
  }

  if (mode === 'choose') {
    return (
      <div className="gh-setup">
        <div className="gh-setup-icon">
          <IconGitHub size={32} />
        </div>
        <div className="gh-setup-title">Connect to GitHub</div>
        <div className="gh-setup-desc">
          Create a new repository or connect an existing one
        </div>
        <div className="gh-setup-actions">
          <button className="gh-setup-btn" onClick={() => setMode('create')}>
            <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <line x1="12" y1="5" x2="12" y2="19" />
              <line x1="5" y1="12" x2="19" y2="12" />
            </svg>
            Create new repo
          </button>
          <button className="gh-setup-btn gh-setup-btn-secondary" onClick={() => setMode('connect')}>
            <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
              <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
            </svg>
            Connect existing repo
          </button>
        </div>
      </div>
    );
  }

  if (mode === 'create') {
    return (
      <div className="gh-setup-form">
        <button className="gh-setup-back" onClick={() => setMode('choose')}>
          <svg width={12} height={12} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <polyline points="15 18 9 12 15 6" />
          </svg>
          Back
        </button>
        <div className="detail-section-title" style={{ marginTop: 8 }}>Create GitHub Repository</div>

        <div className="gh-setup-field">
          <label>Repository name</label>
          <input
            type="text"
            value={repoName}
            onChange={(e) => setRepoName(e.target.value)}
            placeholder="my-project"
          />
        </div>

        <div className="gh-setup-field">
          <label>Visibility</label>
          <div className="gh-setup-toggle">
            <button
              className={`gh-setup-toggle-btn${visibility === 'private' ? ' active' : ''}`}
              onClick={() => setVisibility('private')}
            >
              Private
            </button>
            <button
              className={`gh-setup-toggle-btn${visibility === 'public' ? ' active' : ''}`}
              onClick={() => setVisibility('public')}
            >
              Public
            </button>
          </div>
        </div>

        <div className="gh-setup-field">
          <label>Description <span style={{ color: 'var(--p-text-muted)' }}>(optional)</span></label>
          <input
            type="text"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="A short description..."
          />
        </div>

        <button
          className="gh-setup-submit"
          onClick={() => createMutation.mutate()}
          disabled={!repoName.trim() || createMutation.isPending}
        >
          {createMutation.isPending ? 'Creating...' : 'Create & Push'}
        </button>
      </div>
    );
  }

  // connect mode
  return (
    <div className="gh-setup-form">
      <button className="gh-setup-back" onClick={() => setMode('choose')}>
        <svg width={12} height={12} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
          <polyline points="15 18 9 12 15 6" />
        </svg>
        Back
      </button>
      <div className="detail-section-title" style={{ marginTop: 8 }}>Connect Existing Repository</div>

      <div className="gh-setup-field">
        <label>Remote URL</label>
        <input
          type="text"
          value={remoteUrl}
          onChange={(e) => setRemoteUrl(e.target.value)}
          placeholder="https://github.com/user/repo.git"
        />
      </div>

      <button
        className="gh-setup-submit"
        onClick={() => connectMutation.mutate()}
        disabled={!remoteUrl.trim() || connectMutation.isPending}
      >
        {connectMutation.isPending ? 'Connecting...' : 'Connect Remote'}
      </button>
    </div>
  );
}
