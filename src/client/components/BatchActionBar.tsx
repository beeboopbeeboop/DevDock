import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { IconVSCode, IconCursor, IconTerminal, IconFolder } from './Icons';
import { useToast } from './Toast';
import { STATUS_COLORS } from '../types/project';
import type { Project, ProjectStatus } from '../types/project';

const ALL_STATUSES: ProjectStatus[] = ['active', 'maintenance', 'paused', 'archived', 'idea'];

interface BatchActionBarProps {
  selectedCount: number;
  selectedIds: Set<string>;
  onDeselectAll: () => void;
  projects?: Project[];
}

export function BatchActionBar({ selectedCount, selectedIds, onDeselectAll, projects = [] }: BatchActionBarProps) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [loading, setLoading] = useState<string | null>(null);
  const [statusOpen, setStatusOpen] = useState(false);
  const [tagInput, setTagInput] = useState('');

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

  const runBatchOverride = async (overrides: Record<string, unknown>, label: string) => {
    setLoading(label);
    try {
      const results = await Promise.allSettled(
        [...selectedIds].map((id) =>
          fetch(`/api/projects/${id}/override`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(overrides),
          })
        )
      );
      const ok = results.filter((r) => r.status === 'fulfilled').length;
      toast(`${label}: ${ok}/${results.length} updated`, ok === results.length ? 'success' : 'error');
      qc.invalidateQueries({ queryKey: ['projects'] });
    } catch {
      toast(`${label} failed`, 'error');
    } finally {
      setLoading(null);
    }
  };

  const handleBatchAddTag = () => {
    const val = tagInput.trim().toLowerCase();
    if (!val) return;
    // For each project, append the tag to its existing custom tags
    setLoading('add-tag');
    const ids = [...selectedIds];
    Promise.allSettled(
      ids.map(async (id) => {
        const proj = projects.find((p) => p.id === id);
        const autoTags = new Set([...(proj?.techStack || []), proj?.type || '']);
        const existingCustom = (proj?.tags || []).filter((t) => !autoTags.has(t));
        if (existingCustom.includes(val)) return; // already has it
        return fetch(`/api/projects/${id}/override`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ customTags: [...existingCustom, val] }),
        });
      })
    ).then((results) => {
      const ok = results.filter((r) => r.status === 'fulfilled').length;
      toast(`Add tag "${val}": ${ok}/${results.length} updated`, 'success');
      qc.invalidateQueries({ queryKey: ['projects'] });
      setTagInput('');
      setLoading(null);
    });
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
          VS Code
        </button>
        <button
          className="batch-btn"
          onClick={() => runBatch('open-cursor', 'Open Cursor')}
          disabled={loading !== null}
        >
          <IconCursor size={12} />
          Cursor
        </button>
        <button
          className="batch-btn"
          onClick={() => runBatch('open-terminal', 'Open Terminal')}
          disabled={loading !== null}
        >
          <IconTerminal size={12} />
          Terminals
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

        {/* Separator */}
        <span style={{ width: 1, height: 16, background: 'var(--p-border)', margin: '0 4px' }} />

        {/* Set Status */}
        <div style={{ position: 'relative' }}>
          <button
            className="batch-btn"
            onClick={() => setStatusOpen((v) => !v)}
            disabled={loading !== null}
          >
            Set Status
          </button>
          {statusOpen && (
            <div className="status-popover" style={{ bottom: '100%', marginBottom: 4, left: 0 }}>
              {ALL_STATUSES.map((s) => (
                <button
                  key={s}
                  className="status-popover-option"
                  onClick={() => {
                    runBatchOverride({ customStatus: s }, `Set ${s}`);
                    setStatusOpen(false);
                  }}
                >
                  <span style={{ width: 8, height: 8, borderRadius: '50%', background: STATUS_COLORS[s], flexShrink: 0 }} />
                  {s.charAt(0).toUpperCase() + s.slice(1)}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Add Tag */}
        <form
          style={{ display: 'flex', gap: 4 }}
          onSubmit={(e) => { e.preventDefault(); handleBatchAddTag(); }}
        >
          <input
            type="text"
            placeholder="+ tag"
            value={tagInput}
            onChange={(e) => setTagInput(e.target.value)}
            disabled={loading !== null}
            style={{
              width: 70,
              fontSize: 11,
              padding: '3px 6px',
              background: 'var(--p-bg-elevated)',
              border: '1px solid var(--p-border)',
              borderRadius: 4,
              color: 'var(--p-text)',
            }}
          />
          <button
            type="submit"
            className="batch-btn"
            disabled={loading !== null || !tagInput.trim()}
          >
            Tag
          </button>
        </form>
      </div>
      <button className="batch-btn batch-btn-deselect" onClick={onDeselectAll}>
        Deselect All
      </button>
    </div>
  );
}
