import { useState, useCallback, useRef, useEffect } from 'react';
import { useCrossSearch } from '../hooks/useSearch';
import { PROJECT_TYPE_COLORS } from '../types/project';
import { IconSearch, IconVSCode, IconCursor, IconFolder, IconTerminal, IconCopy, IconFile, IconStar, IconX } from './Icons';
import { useProjectActions } from '../hooks/useProjects';
import { ContextMenu } from './ContextMenu';
import { useToast } from './Toast';
import { loadSetting, saveSetting } from './SettingsPanel';

const FILTER_OPTIONS = [
  { label: 'All', glob: undefined },
  { label: '.ts', glob: '*.ts' },
  { label: '.tsx', glob: '*.tsx' },
  { label: '.css', glob: '*.css' },
  { label: '.json', glob: '*.json' },
  { label: '.jsx', glob: '*.jsx' },
];

interface CrossSearchProps {
  onSelectProjectById: (id: string) => void;
}

interface SavedSearch {
  query: string;
  glob?: string;
}

export function CrossSearch({ onSelectProjectById }: CrossSearchProps) {
  const [query, setQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [activeGlob, setActiveGlob] = useState<string | undefined>(undefined);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>();
  const inputRef = useRef<HTMLInputElement>(null);
  const actions = useProjectActions();
  const { toast } = useToast();
  const [recentSearches, setRecentSearches] = useState<string[]>(() => loadSetting('recent-searches', []));
  const [savedSearches, setSavedSearches] = useState<SavedSearch[]>(() => loadSetting('saved-searches', []));

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  // Save to recent on search execution
  useEffect(() => {
    if (debouncedQuery && debouncedQuery.length >= 2) {
      setRecentSearches((prev) => {
        const next = [debouncedQuery, ...prev.filter((s) => s !== debouncedQuery)].slice(0, 10);
        saveSetting('recent-searches', next);
        return next;
      });
    }
  }, [debouncedQuery]);

  const handleChange = useCallback((val: string) => {
    setQuery(val);
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => setDebouncedQuery(val.trim()), 300);
  }, []);

  const applySavedSearch = (s: SavedSearch) => {
    setQuery(s.query);
    setDebouncedQuery(s.query);
    if (s.glob !== undefined) setActiveGlob(s.glob);
  };

  const toggleBookmark = () => {
    if (!debouncedQuery) return;
    const exists = savedSearches.some((s) => s.query === debouncedQuery && s.glob === activeGlob);
    let next: SavedSearch[];
    if (exists) {
      next = savedSearches.filter((s) => !(s.query === debouncedQuery && s.glob === activeGlob));
      toast('Search removed from bookmarks', 'info');
    } else {
      next = [...savedSearches, { query: debouncedQuery, glob: activeGlob }];
      toast('Search bookmarked', 'success');
    }
    setSavedSearches(next);
    saveSetting('saved-searches', next);
  };

  const isBookmarked = savedSearches.some((s) => s.query === debouncedQuery && s.glob === activeGlob);

  const { data, isLoading, isFetching } = useCrossSearch(debouncedQuery, activeGlob);

  // Group results by project
  const grouped = new Map<string, typeof data extends { results: infer R } ? (R extends (infer T)[] ? T[] : never) : never>();
  if (data?.results) {
    for (const r of data.results) {
      const existing = grouped.get(r.project) || [];
      existing.push(r);
      grouped.set(r.project, existing);
    }
  }

  const openFileInEditor = (projectPath: string, file: string, editor: 'vscode' | 'cursor') => {
    const fullPath = `${projectPath}/${file}`;
    fetch('/api/actions/open-editor', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path: fullPath, editor }),
    });
  };

  const getResultContextItems = (r: { projectId: string; projectPath: string; file: string; line: number }) => [
    {
      label: 'Open in VS Code',
      icon: <IconVSCode size={13} />,
      onClick: () => openFileInEditor(r.projectPath, r.file, 'vscode'),
    },
    {
      label: 'Open in Cursor',
      icon: <IconCursor size={13} />,
      onClick: () => openFileInEditor(r.projectPath, r.file, 'cursor'),
    },
    { label: '', separator: true, onClick: () => {} },
    {
      label: 'Show in Finder',
      icon: <IconFolder size={13} />,
      onClick: () => actions.openFinder(r.projectPath),
    },
    {
      label: 'Open Terminal Here',
      icon: <IconTerminal size={13} />,
      onClick: () => actions.openTerminal(r.projectPath),
    },
    { label: '', separator: true, onClick: () => {} },
    {
      label: 'Copy File Path',
      icon: <IconCopy size={13} />,
      onClick: () => {
        navigator.clipboard.writeText(`${r.projectPath}/${r.file}`);
        toast('Path copied', 'success');
      },
    },
    {
      label: 'View Project',
      icon: <IconFile size={13} />,
      onClick: () => onSelectProjectById(r.projectId),
    },
  ];

  const highlightMatch = (text: string, q: string) => {
    if (!q) return text;
    const idx = text.toLowerCase().indexOf(q.toLowerCase());
    if (idx === -1) return text;
    return (
      <>
        {text.slice(0, idx)}
        <mark className="search-highlight">{text.slice(idx, idx + q.length)}</mark>
        {text.slice(idx + q.length)}
      </>
    );
  };

  return (
    <div className="cross-search">
      <div className="topbar">
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <span className="topbar-title">Search</span>
          {data && debouncedQuery && (
            <span className="topbar-meta">
              {data.total} result{data.total !== 1 ? 's' : ''}
              {data.truncated ? ' (truncated)' : ''}
            </span>
          )}
        </div>
      </div>

      <div className="search-input-bar">
        <IconSearch size={14} color="var(--p-text-muted)" />
        <input
          ref={inputRef}
          type="text"
          className="search-input"
          placeholder="Search across all projects..."
          value={query}
          onChange={(e) => handleChange(e.target.value)}
        />
        {isFetching && <span className="scanning-indicator" style={{ fontSize: 11 }}>Searching...</span>}
        {debouncedQuery && (
          <button
            className="p-icon-btn"
            onClick={toggleBookmark}
            title={isBookmarked ? 'Remove bookmark' : 'Bookmark this search'}
            style={{ flexShrink: 0 }}
          >
            <IconStar size={13} filled={isBookmarked} color={isBookmarked ? 'var(--p-warning)' : 'currentColor'} />
          </button>
        )}
      </div>

      <div className="search-filter-bar">
        {FILTER_OPTIONS.map((opt) => (
          <button
            key={opt.label}
            className={`type-pill${activeGlob === opt.glob ? ' type-pill-active' : ''}`}
            onClick={() => setActiveGlob(activeGlob === opt.glob ? undefined : opt.glob)}
          >
            {opt.label}
          </button>
        ))}
      </div>

      <div className="content-area">
        {!debouncedQuery ? (
          <div>
            {savedSearches.length > 0 && (
              <div style={{ padding: '12px 16px' }}>
                <div className="detail-section-title" style={{ marginBottom: 8 }}>Saved Searches</div>
                {savedSearches.map((s, i) => (
                  <div key={i} className="search-history-item">
                    <button className="search-history-btn" onClick={() => applySavedSearch(s)}>
                      <IconStar size={11} filled color="var(--p-warning)" />
                      <span>{s.query}</span>
                      {s.glob && <span className="topbar-meta">{s.glob}</span>}
                    </button>
                    <button className="p-icon-btn" style={{ opacity: 0.4, flexShrink: 0 }} onClick={() => {
                      const next = savedSearches.filter((_, j) => j !== i);
                      setSavedSearches(next);
                      saveSetting('saved-searches', next);
                    }}>
                      <IconX size={10} />
                    </button>
                  </div>
                ))}
              </div>
            )}
            {recentSearches.length > 0 && (
              <div style={{ padding: '12px 16px' }}>
                <div className="detail-section-title" style={{ marginBottom: 8 }}>Recent Searches</div>
                {recentSearches.map((s, i) => (
                  <button key={i} className="search-history-btn" onClick={() => { setQuery(s); setDebouncedQuery(s); }}>
                    <IconSearch size={11} color="var(--p-text-muted)" />
                    <span>{s}</span>
                  </button>
                ))}
              </div>
            )}
            {savedSearches.length === 0 && recentSearches.length === 0 && (
              <div className="empty-state">
                <div className="empty-state-icon">
                  <IconSearch size={32} color="var(--p-text-muted)" />
                </div>
                <div className="empty-state-title">Search across all projects</div>
                <div className="empty-state-desc">Type a query to search file contents across every project. Use the file type filters to narrow results.</div>
              </div>
            )}
          </div>
        ) : isLoading ? (
          <div className="empty-state">
            <div className="scanning-indicator" style={{ fontSize: 14 }}>Searching projects...</div>
          </div>
        ) : data && data.results.length === 0 ? (
          <div className="empty-state">
            <div className="empty-state-icon">
              <IconSearch size={32} color="var(--p-text-muted)" />
            </div>
            <div className="empty-state-title">No matches found</div>
            <div className="empty-state-desc">
              No files matched "{debouncedQuery}"{activeGlob ? ` in ${activeGlob} files` : ''}. Try a different search term or remove the file type filter.
            </div>
          </div>
        ) : (
          <div className="search-results">
            {[...grouped.entries()].map(([projectName, results], groupIdx) => (
              <div key={projectName} className="search-group fade-in-up" style={{ animationDelay: `${groupIdx * 60}ms` }}>
                <div className="search-group-header">
                  <span
                    className="search-project-badge"
                    style={{
                      background: `${PROJECT_TYPE_COLORS[results[0].projectType as keyof typeof PROJECT_TYPE_COLORS] || 'var(--p-accent)'}20`,
                      color: PROJECT_TYPE_COLORS[results[0].projectType as keyof typeof PROJECT_TYPE_COLORS] || 'var(--p-accent)',
                    }}
                  >
                    {projectName}
                  </span>
                  <span className="search-group-count">{results.length} match{results.length !== 1 ? 'es' : ''}</span>
                </div>
                {results.map((r, rIdx) => (
                  <ContextMenu key={`${r.file}-${r.line}`} items={getResultContextItems(r)}>
                    <div
                      className="search-result-row fade-in-up"
                      style={{ animationDelay: `${groupIdx * 60 + rIdx * 40}ms` }}
                      onClick={() => openFileInEditor(r.projectPath, r.file, 'vscode')}
                    >
                      <div className="search-result-file">
                        <span className="search-result-path">{r.file}</span>
                        <span className="search-result-line">:{r.line}</span>
                      </div>
                      <div className="search-result-text">
                        {highlightMatch(r.text, debouncedQuery)}
                      </div>
                    </div>
                  </ContextMenu>
                ))}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
