import { createRoot } from 'react-dom/client';
import { useState, useEffect, useRef, useCallback, useLayoutEffect } from 'react';
import { getCurrentWindow } from '@tauri-apps/api/window';
import './styles/devdock-base.css';
import './styles/app.css';

// Standalone command palette for the floating Tauri window.
// Talks directly to the DevDock API on :3070.

interface Project {
  id: string;
  name: string;
  path: string;
  type: string;
  status: string;
  devPort: number | null;
  gitDirty: boolean;
  isFavorite: boolean;
  aliases: string[];
}

interface VerbResponse {
  ok?: boolean;
  message?: string;
  error?: string;
}

const API = '/api';
const KNOWN_VERBS = ['reset', 'start', 'stop', 'status', 'logs', 'pull', 'push', 'commit', 'deploy'];

const TYPE_COLORS: Record<string, string> = {
  'cep-plugin': '#a78bfa', 'nextjs': '#f8f8f8', 'vite-react': '#818cf8',
  'framer-plugin': '#60a5fa', 'cloudflare-worker': '#fbbf24', 'hono-server': '#f97316',
  'static-site': '#86efac', 'node-package': '#f87171', 'swift-app': '#ff6b6b',
  'unknown': '#6b7280',
};

const VERB_COLORS: Record<string, string> = {
  reset: '#fbbf24', start: '#57cd6a', stop: '#f87171', deploy: '#818cf8',
  commit: '#a78bfa', push: '#60a5fa', pull: '#60a5fa',
};

const VERB_ICONS: Record<string, string> = {
  reset: '↻', start: '▶', stop: '■', status: 'ℹ', logs: '☰',
  pull: '↓', push: '↑', commit: '✓', deploy: '✈',
};

function fuzzyMatch(text: string, query: string): boolean {
  const t = text.toLowerCase(), q = query.toLowerCase();
  if (t.includes(q)) return true;
  let ti = 0;
  for (const c of q) {
    const idx = t.indexOf(c, ti);
    if (idx === -1) return false;
    ti = idx + 1;
  }
  return true;
}

function StandalonePalette() {
  const [query, setQuery] = useState('');
  const [projects, setProjects] = useState<Project[]>([]);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; msg: string } | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const itemRefs = useRef<Map<number, HTMLDivElement>>(new Map());
  const arrowNav = useRef(false);

  // Load projects on mount
  useEffect(() => {
    fetch(`${API}/projects`).then(r => r.json()).then(setProjects).catch(() => {});
    inputRef.current?.focus();
  }, []);

  // Global Escape key to dismiss
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') dismiss();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [dismiss]);

  // Listen for Tauri show event to refocus
  useEffect(() => {
    if (!(window as any).__TAURI_INTERNALS__) return;
    let unlisten: (() => void) | undefined;
    import('@tauri-apps/api/event').then(({ listen }) => {
      listen('palette-shown', () => {
        setQuery('');
        setSelectedIndex(0);
        setResult(null);
        inputRef.current?.focus();
        // Refresh projects
        fetch(`${API}/projects`).then(r => r.json()).then(setProjects).catch(() => {});
      }).then(fn => { unlisten = fn; });
    });
    return () => unlisten?.();
  }, []);

  const dismiss = useCallback(async () => {
    try {
      const win = getCurrentWindow();
      await win.hide();
    } catch {}
  }, []);

  const firstWord = query.trim().split(' ')[0]?.toLowerCase() || '';
  const isVerbMode = KNOWN_VERBS.includes(firstWord);

  // Build filtered items
  const items = (() => {
    const q = query.trim().toLowerCase();

    if (!q) {
      // Show verbs + all projects
      const verbItems = KNOWN_VERBS.map(v => ({
        id: `verb-${v}`, label: v, desc: `Type '${v} <project>'`,
        color: VERB_COLORS[v] || '#6b7280', type: 'verb' as const, verb: v, target: '',
      }));
      const projItems = projects.map(p => ({
        id: `proj-${p.id}`, label: p.name, desc: `${p.type} · ${p.status}`,
        color: TYPE_COLORS[p.type] || '#6b7280', type: 'project' as const, project: p,
      }));
      return [...verbItems, ...projItems];
    }

    if (isVerbMode) {
      const parts = q.split(/\s+/);
      const verb = parts[0];
      const target = parts.slice(1).join(' ');
      const matched = target
        ? projects.filter(p => fuzzyMatch(p.name, target) || p.aliases.some(a => fuzzyMatch(a, target)))
        : projects;
      return matched.map(p => ({
        id: `target-${p.id}`, label: `${verb} ${p.name}`, desc: p.type,
        color: VERB_COLORS[verb] || '#6b7280', type: 'verb-target' as const, verb, project: p,
      }));
    }

    return projects
      .filter(p => fuzzyMatch(p.name, q) || p.aliases.some(a => fuzzyMatch(a, q)) || fuzzyMatch(p.type, q))
      .map(p => ({
        id: `search-${p.id}`, label: p.name, desc: `${p.type} · ${p.status}${p.gitDirty ? ' (dirty)' : ''}`,
        color: TYPE_COLORS[p.type] || '#6b7280', type: 'project' as const, project: p,
      }));
  })();

  const execute = useCallback(async (item: any) => {
    if (item.type === 'verb') return; // just a hint row
    if (item.type === 'verb-target') {
      setLoading(true);
      setResult(null);
      try {
        const r = await fetch(`${API}/verbs/do`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ verb: item.verb, target: item.project.name, source: 'palette' }),
        });
        const data: VerbResponse = await r.json();
        setResult({ ok: data.ok ?? !data.error, msg: data.message || data.error || 'Done' });
      } catch (e) {
        setResult({ ok: false, msg: 'Request failed' });
      }
      setLoading(false);
      return;
    }
    if (item.type === 'project') {
      // Open in VS Code
      try {
        await fetch(`${API}/actions/open-editor`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ projectId: item.project.id, editor: 'code' }),
        });
      } catch {}
      dismiss();
    }
  }, [dismiss]);

  // Only scroll when selected item is fully outside the visible area
  useLayoutEffect(() => {
    if (!arrowNav.current) return;
    arrowNav.current = false;
    const el = itemRefs.current.get(selectedIndex);
    const container = listRef.current;
    if (!el || !container) return;

    const elRect = el.getBoundingClientRect();
    const containerRect = container.getBoundingClientRect();

    // Item is below visible area
    if (elRect.bottom > containerRect.bottom) {
      container.scrollTop += elRect.bottom - containerRect.bottom;
    }
    // Item is above visible area
    if (elRect.top < containerRect.top) {
      container.scrollTop -= containerRect.top - elRect.top;
    }
  }, [selectedIndex]);

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); arrowNav.current = true; setSelectedIndex(i => (i + 1) % Math.max(items.length, 1)); }
    if (e.key === 'ArrowUp') { e.preventDefault(); arrowNav.current = true; setSelectedIndex(i => (i - 1 + items.length) % Math.max(items.length, 1)); }
    if (e.key === 'Escape') { e.preventDefault(); dismiss(); }
    if (e.key === 'Tab' && isVerbMode) {
      e.preventDefault();
      const first = items[0];
      if (first && 'project' in first) setQuery(`${firstWord} ${first.project.name}`);
    }
    if (e.key === 'Enter' && items[selectedIndex]) {
      execute(items[selectedIndex]);
    }
  };

  return (
    <div style={{
      background: 'rgba(30, 30, 30, 0.95)',
      backdropFilter: 'blur(20px)',
      borderRadius: 12,
      border: '1px solid rgba(255,255,255,0.08)',
      boxShadow: '0 25px 60px rgba(0,0,0,0.5)',
      overflow: 'hidden',
      display: 'flex',
      flexDirection: 'column',
      height: '100%',
    }}>
      {/* Search */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '14px 16px', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
        <span style={{ color: '#666', fontSize: 16 }}>⌘</span>
        <input
          ref={inputRef}
          value={query}
          onChange={e => { setQuery(e.target.value); setSelectedIndex(0); }}
          onKeyDown={onKeyDown}
          placeholder="Type a verb or project name..."
          style={{
            flex: 1, background: 'none', border: 'none', outline: 'none',
            color: '#e5e5e5', fontSize: 17, fontWeight: 300, fontFamily: 'Inter, system-ui, sans-serif',
          }}
        />
        {loading && <span style={{ color: '#666', fontSize: 12 }}>...</span>}
        {query && (
          <button onClick={() => setQuery('')} style={{ background: 'none', border: 'none', color: '#555', cursor: 'pointer', fontSize: 14 }}>✕</button>
        )}
        {isVerbMode && (
          <span style={{ fontSize: 9, fontWeight: 700, color: '#f97316', background: 'rgba(249,115,22,0.15)', padding: '2px 6px', borderRadius: 4 }}>VERB</span>
        )}
      </div>

      {/* Result banner */}
      {result && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: 8, padding: '10px 16px',
          background: result.ok ? 'rgba(34,197,94,0.08)' : 'rgba(239,68,68,0.08)',
          borderBottom: '1px solid rgba(255,255,255,0.06)',
        }}>
          <span style={{ color: result.ok ? '#22c55e' : '#ef4444' }}>{result.ok ? '✓' : '✕'}</span>
          <span style={{ color: '#ccc', fontSize: 12, flex: 1 }}>{result.msg}</span>
          <button onClick={() => setResult(null)} style={{ background: 'none', border: 'none', color: '#555', cursor: 'pointer', fontSize: 11 }}>dismiss</button>
        </div>
      )}

      {/* Items */}
      <div ref={listRef} style={{ flex: 1, overflowY: 'auto', overflowX: 'hidden', padding: '4px 8px' }}>
        {items.map((item, i) => (
          <div
            key={item.id}
            ref={el => { if (el) itemRefs.current.set(i, el); else itemRefs.current.delete(i); }}
            onClick={() => { setSelectedIndex(i); execute(item); }}
            style={{
              display: 'flex', alignItems: 'center', gap: 10,
              padding: '7px 12px', marginBottom: 2, borderRadius: 8, cursor: 'pointer',
              background: i === selectedIndex ? `${item.color}22` : `${item.color}08`,
              border: `1px solid ${i === selectedIndex ? `${item.color}44` : 'transparent'}`,
              transition: 'background 0.1s, border-color 0.1s',
            }}
          >
            <div style={{
              width: 28, height: 28, borderRadius: 6, display: 'flex', alignItems: 'center', justifyContent: 'center',
              background: i === selectedIndex ? `${item.color}44` : `${item.color}18`,
              color: i === selectedIndex ? '#fff' : item.color, fontSize: 13, fontWeight: 500,
            }}>
              {item.type === 'verb' ? (VERB_ICONS[item.label] || '⚡') :
               item.type === 'verb-target' ? (VERB_ICONS[(item as any).verb] || '⚡') : '◆'}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ color: i === selectedIndex ? '#fff' : '#e5e5e5', fontSize: 13, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {item.label}
              </div>
              <div style={{ color: i === selectedIndex ? 'rgba(255,255,255,0.6)' : '#666', fontSize: 10 }}>
                {item.desc}
              </div>
            </div>
          </div>
        ))}
        {items.length === 0 && query && (
          <div style={{ textAlign: 'center', padding: 40, color: '#555', fontSize: 13 }}>No matches</div>
        )}
      </div>

      {/* Footer */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 14, padding: '8px 16px',
        borderTop: '1px solid rgba(255,255,255,0.06)', fontSize: 10, color: '#444',
      }}>
        <span><kbd style={{ background: 'rgba(255,255,255,0.06)', padding: '1px 4px', borderRadius: 3, fontFamily: 'monospace', fontSize: 9 }}>↑↓</kbd> navigate</span>
        <span><kbd style={{ background: 'rgba(255,255,255,0.06)', padding: '1px 4px', borderRadius: 3, fontFamily: 'monospace', fontSize: 9 }}>↩</kbd> select</span>
        {isVerbMode && <span><kbd style={{ background: 'rgba(255,255,255,0.06)', padding: '1px 4px', borderRadius: 3, fontFamily: 'monospace', fontSize: 9 }}>tab</kbd> complete</span>}
        <span><kbd style={{ background: 'rgba(255,255,255,0.06)', padding: '1px 4px', borderRadius: 3, fontFamily: 'monospace', fontSize: 9 }}>esc</kbd> close</span>
        <span style={{ marginLeft: 'auto', color: '#555' }}>{items.length} items · ⇧Space D</span>
      </div>
    </div>
  );
}

createRoot(document.getElementById('palette-root')!).render(<StandalonePalette />);
