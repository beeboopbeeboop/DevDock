import { useState, useEffect } from 'react';
import { IconX, IconExternalLink, IconGitHub, IconVercel, IconCloudflare, IconNeon, IconSupabase } from './Icons';
import { useIntegrations } from '../hooks/useIntegrations';
import type { IntegrationStatus } from '../hooks/useIntegrations';
import { Tooltip } from './Tooltip';

interface QuickLink {
  label: string;
  url: string;
  enabled: boolean;
}

interface ContextAction {
  id: string;
  label: string;
  enabled: boolean;
}

const DEFAULT_QUICK_LINKS: QuickLink[] = [
  { label: 'GitHub Dashboard', url: 'https://github.com', enabled: true },
  { label: 'GitHub Settings', url: 'https://github.com/settings/profile', enabled: true },
  { label: 'Vercel Dashboard', url: 'https://vercel.com/dashboard', enabled: true },
  { label: 'Cloudflare Dashboard', url: 'https://dash.cloudflare.com', enabled: true },
  { label: 'Supabase Dashboard', url: 'https://supabase.com/dashboard', enabled: true },
  { label: 'Neon Console', url: 'https://console.neon.tech', enabled: true },
  { label: 'Netlify Dashboard', url: 'https://app.netlify.com', enabled: true },
  { label: 'Railway Dashboard', url: 'https://railway.app/dashboard', enabled: true },
  { label: 'npm Registry', url: 'https://www.npmjs.com', enabled: true },
  { label: 'Bundlephobia', url: 'https://bundlephobia.com', enabled: true },
  { label: 'Can I Use', url: 'https://caniuse.com', enabled: true },
];

const DEFAULT_CONTEXT_ACTIONS: ContextAction[] = [
  { id: 'vscode', label: 'Open in VS Code', enabled: true },
  { id: 'cursor', label: 'Open in Cursor', enabled: true },
  { id: 'claude', label: 'Open Claude Code Terminal', enabled: true },
  { id: 'terminal', label: 'Open Terminal', enabled: true },
  { id: 'finder', label: 'Show in Finder', enabled: true },
  { id: 'open-localhost', label: 'Open Localhost', enabled: true },
  { id: 'open-github', label: 'Open on GitHub', enabled: true },
  { id: 'open-deploy', label: 'Open Deploy URL', enabled: true },
  { id: 'favorite', label: 'Toggle Favorite', enabled: true },
  { id: 'copy-path', label: 'Copy Path', enabled: true },
  { id: 'copy-github', label: 'Copy GitHub URL', enabled: true },
  { id: 'git-pull', label: 'Git Pull', enabled: true },
  { id: 'start-dev', label: 'Start Dev Server', enabled: true },
  { id: 'npm-install', label: 'npm install', enabled: true },
  { id: 'notes', label: 'Project Notes', enabled: true },
];

type SettingsTab = 'integrations' | 'quick-links' | 'context-menu' | 'shortcuts';

const INTEGRATION_ICONS: Record<string, React.ComponentType<{ size?: number; color?: string }>> = {
  github: IconGitHub,
  vercel: IconVercel,
  cloudflare: IconCloudflare,
  neon: IconNeon,
  supabase: IconSupabase,
};

const INTEGRATION_AUTH_HINTS: Record<string, string> = {
  github: 'gh auth login',
  vercel: 'vercel login',
  cloudflare: 'wrangler login',
  neon: 'neonctl auth',
  supabase: 'supabase login',
  netlify: 'netlify login',
  railway: 'railway login',
  flyio: 'flyctl auth login',
  planetscale: 'pscale auth login',
  turso: 'turso auth login',
};

const INTEGRATION_COLORS: Record<string, string> = {
  github: '#f0f0f0',
  vercel: '#f0f0f0',
  cloudflare: '#f6821f',
  neon: '#00e599',
  supabase: '#3ecf8e',
  netlify: '#00c7b7',
  railway: '#a855f7',
  flyio: '#8b5cf6',
  planetscale: '#f0f0f0',
  turso: '#4ff8d2',
};

const INTEGRATION_INSTALL_URLS: Record<string, string> = {
  github: 'https://cli.github.com',
  vercel: 'https://vercel.com/docs/cli',
  cloudflare: 'https://developers.cloudflare.com/workers/wrangler/install-and-update/',
  neon: 'https://neon.tech/docs/reference/neon-cli',
  supabase: 'https://supabase.com/docs/guides/cli/getting-started',
  netlify: 'https://docs.netlify.com/cli/get-started/',
  railway: 'https://docs.railway.com/guides/cli',
  flyio: 'https://fly.io/docs/flyctl/install/',
  planetscale: 'https://planetscale.com/docs/concepts/planetscale-environment-setup',
  turso: 'https://docs.turso.tech/cli/introduction',
};

export function loadSetting<T>(key: string, fallback: T): T {
  try {
    const stored = localStorage.getItem(`devdock-${key}`);
    return stored ? JSON.parse(stored) : fallback;
  } catch {
    return fallback;
  }
}

export function saveSetting<T>(key: string, value: T) {
  localStorage.setItem(`devdock-${key}`, JSON.stringify(value));
}

export function getQuickLinks(): QuickLink[] {
  return loadSetting('quick-links', DEFAULT_QUICK_LINKS).filter((l: QuickLink) => l.enabled);
}

export function getContextActions(): ContextAction[] {
  return loadSetting('context-actions', DEFAULT_CONTEXT_ACTIONS);
}

interface SettingsPanelProps {
  isOpen: boolean;
  onClose: () => void;
}

interface ShortcutConfig {
  cmdPalette: string;
}

const DEFAULT_SHORTCUTS: ShortcutConfig = {
  cmdPalette: navigator.platform.includes('Mac') ? '⌘K' : 'Ctrl+K',
};

export function getShortcuts(): ShortcutConfig {
  return loadSetting('shortcuts', DEFAULT_SHORTCUTS);
}

export function SettingsPanel({ isOpen, onClose }: SettingsPanelProps) {
  const [tab, setTab] = useState<SettingsTab>('integrations');
  const { data: integrations, isLoading: integrationsLoading, refetch: refetchIntegrations } = useIntegrations();
  const [quickLinks, setQuickLinks] = useState<QuickLink[]>(() =>
    loadSetting('quick-links', DEFAULT_QUICK_LINKS),
  );
  const [contextActions, setContextActions] = useState<ContextAction[]>(() =>
    loadSetting('context-actions', DEFAULT_CONTEXT_ACTIONS),
  );
  const [shortcuts, setShortcuts] = useState<ShortcutConfig>(() =>
    loadSetting('shortcuts', DEFAULT_SHORTCUTS),
  );
  const [showRecents, setShowRecents] = useState<boolean>(() =>
    loadSetting('show-recent-commands', true),
  );
  const [recording, setRecording] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [newLabel, setNewLabel] = useState('');
  const [newUrl, setNewUrl] = useState('');

  useEffect(() => {
    saveSetting('quick-links', quickLinks);
  }, [quickLinks]);

  useEffect(() => {
    saveSetting('context-actions', contextActions);
  }, [contextActions]);

  useEffect(() => {
    saveSetting('shortcuts', shortcuts);
  }, [shortcuts]);

  useEffect(() => {
    saveSetting('show-recent-commands', showRecents);
  }, [showRecents]);

  // Keyboard shortcut recording
  useEffect(() => {
    if (!recording) return;
    const handler = (e: KeyboardEvent) => {
      e.preventDefault();
      e.stopPropagation();
      const parts: string[] = [];
      if (e.metaKey) parts.push('⌘');
      if (e.ctrlKey) parts.push('Ctrl');
      if (e.altKey) parts.push('Alt');
      if (e.shiftKey) parts.push('Shift');
      // Only accept if there's a modifier + a key
      const key = e.key.length === 1 ? e.key.toUpperCase() : e.key;
      if (!['Meta', 'Control', 'Alt', 'Shift'].includes(e.key)) {
        parts.push(key);
        setShortcuts((prev) => ({ ...prev, [recording]: parts.join('+') }));
        setRecording(null);
      }
    };
    window.addEventListener('keydown', handler, true);
    return () => window.removeEventListener('keydown', handler, true);
  }, [recording]);

  const [closing, setClosing] = useState(false);

  const handleClose = () => {
    setClosing(true);
    setTimeout(() => { setClosing(false); onClose(); }, 180);
  };

  if (!isOpen) return null;

  const toggleLink = (idx: number) => {
    setQuickLinks((links) =>
      links.map((l, i) => (i === idx ? { ...l, enabled: !l.enabled } : l)),
    );
  };

  const removeLink = (idx: number) => {
    setQuickLinks((links) => links.filter((_, i) => i !== idx));
  };

  const addLink = () => {
    if (!newLabel.trim() || !newUrl.trim()) return;
    setQuickLinks((links) => [...links, { label: newLabel.trim(), url: newUrl.trim(), enabled: true }]);
    setNewLabel('');
    setNewUrl('');
    setAdding(false);
  };

  const toggleAction = (id: string) => {
    setContextActions((actions) =>
      actions.map((a) => (a.id === id ? { ...a, enabled: !a.enabled } : a)),
    );
  };

  return (
    <div className={`detail-backdrop${closing ? ' closing' : ''}`} style={{ zIndex: 700 }} onClick={handleClose}>
      <div className="settings-panel" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="modal-header">
          <span className="modal-title">Settings</span>
          <button className="p-icon-btn" onClick={handleClose}>
            <IconX size={16} />
          </button>
        </div>

        {/* Pill tabs */}
        <div className="detail-tabs">
          <button
            className="detail-tab"
            data-active={tab === 'integrations' ? 'true' : undefined}
            onClick={() => setTab('integrations')}
          >
            Integrations
          </button>
          <button
            className="detail-tab"
            data-active={tab === 'quick-links' ? 'true' : undefined}
            onClick={() => setTab('quick-links')}
          >
            Quick Links
          </button>
          <button
            className="detail-tab"
            data-active={tab === 'context-menu' ? 'true' : undefined}
            onClick={() => setTab('context-menu')}
          >
            Context Menu
          </button>
          <button
            className="detail-tab"
            data-active={tab === 'shortcuts' ? 'true' : undefined}
            onClick={() => setTab('shortcuts')}
          >
            Shortcuts
          </button>
          <button
            className="detail-tab"
            data-active={tab === 'data' ? 'true' : undefined}
            onClick={() => setTab('data')}
          >
            Data
          </button>
        </div>

        <div className="detail-body">
          {tab === 'integrations' && (
            <div>
              <div style={{ fontSize: 11, color: 'var(--p-text-muted)', marginBottom: 12 }}>
                Connected services detected via CLI tools on your machine.
              </div>
              {integrationsLoading ? (
                <div className="scanning-indicator" style={{ padding: 16, fontSize: 12 }}>
                  Checking integrations...
                </div>
              ) : (
                <div className="integration-grid">
                  {(integrations || []).map((svc) => (
                    <IntegrationCard key={svc.id} service={svc} onRefresh={refetchIntegrations} />
                  ))}
                </div>
              )}
            </div>
          )}

          {tab === 'quick-links' && (
            <div>
              <div className="settings-list">
                {quickLinks.map((link, i) => (
                  <div key={i} className="settings-link-row">
                    <label className="settings-toggle">
                      <input
                        type="checkbox"
                        checked={link.enabled}
                        onChange={() => toggleLink(i)}
                      />
                      <span className="settings-toggle-track" />
                    </label>
                    <div className="settings-link-info">
                      <span className="settings-link-label">{link.label}</span>
                      <a
                        href={link.url}
                        target="_blank"
                        rel="noopener"
                        className="settings-link-url"
                        onClick={(e) => e.stopPropagation()}
                      >
                        {link.url.replace(/^https?:\/\//, '')}
                        <IconExternalLink size={9} />
                      </a>
                    </div>
                    <button
                      className="p-icon-btn settings-link-remove"
                      onClick={() => removeLink(i)}
                    >
                      <IconX size={11} />
                    </button>
                  </div>
                ))}
              </div>

              {adding ? (
                <div className="settings-add-form">
                  <input
                    className="p-input"
                    placeholder="Label (e.g. NPM)"
                    value={newLabel}
                    onChange={(e) => setNewLabel(e.target.value)}
                    autoFocus
                  />
                  <input
                    className="p-input"
                    placeholder="URL (e.g. https://npmjs.com)"
                    value={newUrl}
                    onChange={(e) => setNewUrl(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && addLink()}
                  />
                  <div style={{ display: 'flex', gap: 6 }}>
                    <button
                      className="p-btn p-btn-accent p-btn-sm"
                      onClick={addLink}
                      disabled={!newLabel.trim() || !newUrl.trim()}
                    >
                      Add
                    </button>
                    <button
                      className="p-btn p-btn-ghost p-btn-sm"
                      onClick={() => { setAdding(false); setNewLabel(''); setNewUrl(''); }}
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  className="settings-add-btn"
                  onClick={() => setAdding(true)}
                >
                  + Add Quick Link
                </button>
              )}
            </div>
          )}

          {tab === 'context-menu' && (
            <div>
              <div style={{ fontSize: 11, color: 'var(--p-text-muted)', marginBottom: 12 }}>
                Toggle which actions appear when you right-click a project.
              </div>
              <div className="settings-list">
                {contextActions.map((action) => (
                  <div key={action.id} className="settings-link-row">
                    <label className="settings-toggle">
                      <input
                        type="checkbox"
                        checked={action.enabled}
                        onChange={() => toggleAction(action.id)}
                      />
                      <span className="settings-toggle-track" />
                    </label>
                    <span className="settings-link-label">{action.label}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {tab === 'shortcuts' && (
            <div>
              <div style={{ fontSize: 11, color: 'var(--p-text-muted)', marginBottom: 12 }}>
                Click a shortcut to re-record it. Press your desired key combination.
              </div>
              <div className="settings-list">
                <div className="settings-link-row">
                  <span className="settings-link-label" style={{ flex: 1 }}>Command Palette</span>
                  <button
                    className={`shortcut-key-btn ${recording === 'cmdPalette' ? 'shortcut-recording' : ''}`}
                    onClick={() => setRecording(recording === 'cmdPalette' ? null : 'cmdPalette')}
                  >
                    {recording === 'cmdPalette' ? 'Press keys...' : shortcuts.cmdPalette}
                  </button>
                </div>
              </div>
              <button
                className="settings-add-btn"
                style={{ marginTop: 12 }}
                onClick={() => {
                  setShortcuts(DEFAULT_SHORTCUTS);
                  setRecording(null);
                }}
              >
                Reset to Defaults
              </button>

              <div style={{ marginTop: 20, fontSize: 11, color: 'var(--p-text-muted)', marginBottom: 8 }}>
                Command Palette
              </div>
              <div className="settings-list">
                <div className="settings-link-row">
                  <label className="settings-toggle">
                    <input
                      type="checkbox"
                      checked={showRecents}
                      onChange={() => setShowRecents(!showRecents)}
                    />
                    <span className="settings-toggle-track" />
                  </label>
                  <span className="settings-link-label">Show recent commands</span>
                </div>
              </div>
            </div>
          )}

          {tab === 'data' && (
            <div>
              <div style={{ fontSize: 11, color: 'var(--p-text-muted)', marginBottom: 12 }}>
                Export and manage your DevDock data.
              </div>

              <div style={{ marginBottom: 16 }}>
                <div className="detail-section-title" style={{ marginBottom: 8 }}>Export</div>
                <button
                  className="git-action-btn"
                  style={{ padding: '6px 16px' }}
                  onClick={() => {
                    const a = document.createElement('a');
                    a.href = '/api/projects/export';
                    a.download = `devdock-export-${new Date().toISOString().slice(0, 10)}.json`;
                    a.click();
                  }}
                >
                  Export Projects as JSON
                </button>
                <div style={{ fontSize: 11, color: 'var(--p-text-muted)', marginTop: 6 }}>
                  Downloads all projects, overrides, favorites, and notes as a JSON file.
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function IntegrationCard({ service, onRefresh }: { service: IntegrationStatus; onRefresh: () => void }) {
  const Icon = INTEGRATION_ICONS[service.id];
  const hint = INTEGRATION_AUTH_HINTS[service.id];
  const accentColor = INTEGRATION_COLORS[service.id] || 'var(--p-text)';

  return (
    <div className={`integration-card ${service.authenticated ? 'integration-card-connected' : ''}`}>
      <div className="integration-card-header">
        <div className="integration-logo" style={{ color: service.authenticated ? accentColor : 'var(--p-text-muted)' }}>
          {Icon && <Icon size={20} />}
        </div>
        <div className="integration-info">
          <span className="integration-name">{service.name}</span>
          {service.authenticated && service.account ? (
            <span className="integration-account">@{service.account}</span>
          ) : !service.cliInstalled ? (
            <span className="integration-account">CLI not installed</span>
          ) : (
            <span className="integration-account">Not connected</span>
          )}
        </div>
        <div className="integration-status-area">
          {service.authenticated ? (
            <>
              <span className="integration-status-label">Connected</span>
              <span className="integration-dot integration-dot-connected" />
            </>
          ) : (
            <span className="integration-dot integration-dot-disconnected" />
          )}
        </div>
      </div>
      {!service.authenticated && service.cliInstalled && hint && (
        <div className="integration-help">
          Run: <code>{hint}</code>
        </div>
      )}
      {!service.cliInstalled && (
        <div className="integration-help">
          Install the <code>{service.id === 'cloudflare' ? 'wrangler' : service.id === 'github' ? 'gh' : service.id === 'neon' ? 'neonctl' : service.id === 'flyio' ? 'flyctl' : service.id === 'planetscale' ? 'pscale' : service.id}</code> CLI to connect
          {INTEGRATION_INSTALL_URLS[service.id] && (
            <> &mdash; <a href={INTEGRATION_INSTALL_URLS[service.id]} target="_blank" rel="noopener noreferrer" className="integration-install-link">Install guide ↗</a></>
          )}
        </div>
      )}
    </div>
  );
}
