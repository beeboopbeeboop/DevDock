import { useState } from 'react';
import { IconVSCode, IconCursor, IconTerminal, IconFolder } from './Icons';
import { useToast } from './Toast';
import type { Project } from '../types/project';

interface BatchActionBarProps {
  selectedCount: number;
  selectedIds: Set<string>;
  onDeselectAll: () => void;
  projects?: Project[];
}

export function BatchActionBar({ selectedCount, selectedIds, onDeselectAll, projects = [] }: BatchActionBarProps) {
  const { toast } = useToast();
  const [loading, setLoading] = useState<string | null>(null);

  const runBatch = async (action: string, label: string) => {
    setLoading(action);
    try {
      const res = await fetch('/api/actions/batch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, projectIds: [...selectedIds] }),
      });
      const data = await res.json();
      if (data.results) {
        const ok = data.results.filter((r: { ok: boolean }) => r.ok).length;
        const fail = data.results.length - ok;
        toast(
          fail > 0 ? `${label}: ${ok} succeeded, ${fail} failed` : `${label}: ${ok} succeeded`,
          fail > 0 ? 'error' : 'success',
        );
      }
    } catch {
      toast(`${label} failed`, 'error');
    } finally {
      setLoading(null);
    }
  };

  return (
    <div className="batch-action-bar">
      <span className="batch-count">{selectedCount} selected</span>
      <div className="batch-actions">
        <button
          className="batch-btn"
          onClick={() => runBatch('pull', 'Git Pull')}
          disabled={loading !== null}
        >
          <svg width={12} height={12} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <line x1="12" y1="5" x2="12" y2="19" /><polyline points="19 12 12 19 5 12" />
          </svg>
          {loading === 'pull' ? 'Pulling...' : 'Pull All'}
        </button>
        <button
          className="batch-btn"
          onClick={() => runBatch('open-vscode', 'Open VS Code')}
          disabled={loading !== null}
        >
          <IconVSCode size={12} />
          Open in VS Code
        </button>
        <button
          className="batch-btn"
          onClick={() => runBatch('open-cursor', 'Open Cursor')}
          disabled={loading !== null}
        >
          <IconCursor size={12} />
          Open in Cursor
        </button>
        <button
          className="batch-btn"
          onClick={() => runBatch('open-terminal', 'Open Terminal')}
          disabled={loading !== null}
        >
          <IconTerminal size={12} />
          Open Terminals
        </button>
        <button
          className="batch-btn"
          onClick={() => runBatch('open-finder', 'Open Finder')}
          disabled={loading !== null}
        >
          <IconFolder size={12} />
          Finder
        </button>
        <button
          className="batch-btn"
          onClick={() => runBatch('npm-install', 'npm install')}
          disabled={loading !== null}
        >
          {loading === 'npm-install' ? 'Installing...' : 'npm install'}
        </button>
        <button
          className="batch-btn"
          onClick={() => runBatch('git-fetch', 'Git Fetch')}
          disabled={loading !== null}
        >
          {loading === 'git-fetch' ? 'Fetching...' : 'Git Fetch'}
        </button>
      </div>
      <button className="batch-btn batch-btn-deselect" onClick={onDeselectAll}>
        Deselect All
      </button>
    </div>
  );
}
