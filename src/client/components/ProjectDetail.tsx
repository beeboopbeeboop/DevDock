import { useState, useEffect, useRef, useCallback } from 'react';
import type { Project } from '../types/project';
import { PROJECT_TYPE_LABELS, PROJECT_TYPE_COLORS, STATUS_COLORS } from '../types/project';
import { IconX, IconGitHub, IconGitCommit, IconFile, IconFolder, IconExternalLink, IconVSCode, IconTerminal, IconClaude, IconPlay } from './Icons';
import { Tooltip } from './Tooltip';
import { useToast } from './Toast';
import { useProjectActions } from '../hooks/useProjects';
import { LocalhostManager } from './LocalhostManager';
import { GitHubTab } from './GitHubTab';
import { DeployTab } from './DeployTab';
import { GitOpsTab } from './GitOpsTab';
import { GitHubSetup } from './GitHubSetup';
import { DockerTab } from './DockerTab';

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

interface FileEntry {
  name: string;
  path: string;
  size: number;
  isDir: boolean;
  ext: string;
  children?: FileEntry[];
}

interface FileData {
  files: FileEntry[];
  extStats: Record<string, { count: number; size: number }>;
}

type TabId = 'overview' | 'files' | 'git' | 'github' | 'deploy' | 'localhost' | 'deps' | 'docker' | 'notes';

interface OutdatedPackage {
  name: string;
  current: string;
  wanted: string;
  latest: string;
  type: string;
  severity: 'major' | 'minor' | 'patch';
}

interface DepsData {
  packages: OutdatedPackage[];
  total: number;
  major: number;
  minor: number;
  patch: number;
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function shortenPath(path: string): string {
  const home = path.match(/^\/Users\/[^/]+/)?.[0] || '/home/' + path.split('/')[2];
  return path.replace(home, '~');
}

function FileTree({ entries, depth = 0 }: { entries: FileEntry[]; depth?: number }) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const toggle = (path: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      next.has(path) ? next.delete(path) : next.add(path);
      return next;
    });
  };

  return (
    <div style={{ paddingLeft: depth > 0 ? 16 : 0 }}>
      {entries.map((entry) => (
        <div key={entry.path}>
          <div
            className="file-tree-item"
            onClick={() => entry.isDir && toggle(entry.path)}
            style={{ cursor: entry.isDir ? 'pointer' : 'default' }}
          >
            <span style={{ color: entry.isDir ? 'var(--p-accent)' : 'var(--p-text-dim)', marginRight: 6 }}>
              {entry.isDir ? (expanded.has(entry.path) ? '&#9660;' : '&#9654;') : ''}
            </span>
            <span style={{ color: entry.isDir ? 'var(--p-text)' : 'var(--p-text-dim)' }}>
              {entry.isDir ? <IconFolder size={13} /> : <IconFile size={13} />}
            </span>
            <span className="file-tree-name">{entry.name}</span>
            <span className="file-tree-size">{formatSize(entry.size)}</span>
          </div>
          {entry.isDir && entry.children && expanded.has(entry.path) && (
            <FileTree entries={entry.children} depth={depth + 1} />
          )}
        </div>
      ))}
    </div>
  );
}

interface ProjectDetailProps {
  project: Project;
  onClose: () => void;
  initialTab?: TabId;
}

export function ProjectDetail({ project, onClose, initialTab }: ProjectDetailProps) {
  const actions = useProjectActions();
  const { toast } = useToast();
  const [tab, setTab] = useState<TabId>(initialTab || 'overview');
  const [commits, setCommits] = useState<CommitEntry[]>([]);
  const [fileData, setFileData] = useState<FileData | null>(null);
  const [loadingCommits, setLoadingCommits] = useState(false);
  const [loadingFiles, setLoadingFiles] = useState(false);
  const [depsData, setDepsData] = useState<DepsData | null>(null);
  const [loadingDeps, setLoadingDeps] = useState(false);
  const [closing, setClosing] = useState(false);
  const [notes, setNotes] = useState('');
  const [notesLoaded, setNotesLoaded] = useState(false);
  const [notesSaving, setNotesSaving] = useState(false);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const saveNotes = useCallback((text: string) => {
    setNotesSaving(true);
    fetch('/api/actions/save-notes', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ projectId: project.id, notes: text }),
    })
      .then((r) => r.json())
      .then((d) => { if (d.ok) toast('Notes saved', 'success'); })
      .catch(() => toast('Failed to save notes', 'error'))
      .finally(() => setNotesSaving(false));
  }, [project.id, toast]);

  const handleNotesChange = useCallback((text: string) => {
    setNotes(text);
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => saveNotes(text), 1000);
  }, [saveNotes]);

  const handleNotesBlur = useCallback(() => {
    if (saveTimerRef.current) {
      clearTimeout(saveTimerRef.current);
      saveTimerRef.current = null;
    }
    saveNotes(notes);
  }, [notes, saveNotes]);

  const handleClose = () => {
    if (saveTimerRef.current) {
      clearTimeout(saveTimerRef.current);
      saveNotes(notes);
    }
    setClosing(true);
    setTimeout(onClose, 180);
  };

  useEffect(() => {
    if (tab === 'notes' && !notesLoaded) {
      setNotesLoaded(true);
      fetch(`/api/actions/notes/${encodeURIComponent(project.id)}`)
        .then((r) => r.ok ? r.json() : { notes: '' })
        .then((d) => setNotes(d.notes || ''))
        .catch(() => setNotes(''));
    }
    if (tab === 'git' && commits.length === 0 && !loadingCommits) {
      setLoadingCommits(true);
      fetch(`/api/actions/git-log?path=${encodeURIComponent(project.path)}`)
        .then((r) => r.ok ? r.json() : [])
        .then((data) => setCommits(Array.isArray(data) ? data : []))
        .catch(() => setCommits([]))
        .finally(() => setLoadingCommits(false));
    }
    if (tab === 'files' && !fileData && !loadingFiles) {
      setLoadingFiles(true);
      fetch(`/api/actions/files?path=${encodeURIComponent(project.path)}`)
        .then((r) => r.ok ? r.json() : { files: [], extStats: {} })
        .then((data) => setFileData(data))
        .catch(() => setFileData({ files: [], extStats: {} }))
        .finally(() => setLoadingFiles(false));
    }
    if (tab === 'deps' && !depsData && !loadingDeps) {
      setLoadingDeps(true);
      fetch(`/api/actions/deps-outdated?path=${encodeURIComponent(project.path)}`)
        .then((r) => r.ok ? r.json() : { packages: [], total: 0, major: 0, minor: 0, patch: 0 })
        .then((data) => setDepsData(data))
        .catch(() => setDepsData({ packages: [], total: 0, major: 0, minor: 0, patch: 0 }))
        .finally(() => setLoadingDeps(false));
    }
  }, [tab, project.path, commits.length, fileData, loadingCommits, loadingFiles, depsData, loadingDeps]);

  const typeColor = PROJECT_TYPE_COLORS[project.type] || '#6b7280';

  return (
    <div className={`detail-backdrop${closing ? ' closing' : ''}`} onClick={handleClose}>
      <div className="detail-panel" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="detail-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, flex: 1, minWidth: 0 }}>
            <div
              className="project-type-icon"
              style={{
                background: `${typeColor}18`,
                color: typeColor,
                border: `1px solid ${typeColor}30`,
                width: 40,
                height: 40,
                fontSize: 16,
              }}
            >
              {PROJECT_TYPE_LABELS[project.type].slice(0, 2)}
            </div>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 16, fontWeight: 700 }}>{project.name}</div>
              <button
                className="detail-path-btn"
                onClick={() => { navigator.clipboard.writeText(project.path); toast('Path copied', 'success'); }}
                title="Click to copy path"
              >
                {shortenPath(project.path)}
              </button>
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span
              className="p-badge"
              style={{
                background: `${STATUS_COLORS[project.status]}20`,
                color: STATUS_COLORS[project.status],
              }}
            >
              {project.status}
            </span>
            {project.githubUrl && (
              <Tooltip content="Open on GitHub">
                <a
                  href={project.githubUrl}
                  target="_blank"
                  rel="noopener"
                  className="p-icon-btn"
                  style={{ color: 'var(--p-text-dim)' }}
                >
                  <IconGitHub size={16} />
                </a>
              </Tooltip>
            )}
            <button className="p-icon-btn" onClick={handleClose}>
              <IconX size={16} />
            </button>
          </div>
        </div>

        {/* Tabs */}
        <div className="detail-tabs">
          {([
            'overview',
            'files',
            'git',
            'github',
            ...(project.deployTarget !== 'none' ? ['deploy'] : []),
            'deps',
            ...(project.techStack?.includes('docker-compose') || project.techStack?.includes('docker') ? ['docker'] : []),
            'localhost',
            'notes',
          ] as TabId[]).map((t) => (
            <button
              key={t}
              className="detail-tab"
              data-active={tab === t ? 'true' : undefined}
              onClick={() => setTab(t)}
            >
              {t === 'overview' && 'Overview'}
              {t === 'files' && 'Files'}
              {t === 'git' && 'Git'}
              {t === 'github' && 'GitHub'}
              {t === 'deploy' && 'Deploy'}
              {t === 'deps' && 'Deps'}
              {t === 'docker' && 'Docker'}
              {t === 'localhost' && 'Localhost'}
              {t === 'notes' && 'Notes'}
            </button>
          ))}
        </div>

        {/* Tab content */}
        <div className="detail-body">
          {tab === 'overview' && (
            <div className="detail-overview">
              {project.description && (
                <div className="detail-section">
                  <div className="detail-section-title">Description</div>
                  <div style={{ fontSize: 12, color: 'var(--p-text-dim)', lineHeight: 1.5 }}>
                    {project.description}
                  </div>
                </div>
              )}

              <div className="detail-section">
                <div className="detail-section-title">Tech Stack</div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  <span className="p-badge" style={{ background: `${typeColor}18`, color: typeColor }}>
                    {PROJECT_TYPE_LABELS[project.type]}
                  </span>
                  {project.techStack.map((t) => (
                    <span key={t} className="p-badge p-badge-subtle">{t}</span>
                  ))}
                </div>
              </div>

              <div className="detail-section">
                <div className="detail-section-title">Quick Actions</div>
                <div className="detail-quick-actions">
                  <button className="detail-action-btn" onClick={() => actions.openEditor(project.path, 'vscode')}>
                    <IconVSCode size={14} /> VS Code
                  </button>
                  <button className="detail-action-btn" onClick={() => actions.openTerminal(project.path)}>
                    <IconTerminal size={14} /> Terminal
                  </button>
                  <button className="detail-action-btn" onClick={() => actions.openClaudeTerminal(project.path)}>
                    <IconClaude size={14} /> Claude
                  </button>
                  <button className="detail-action-btn" onClick={() => actions.openFinder(project.path)}>
                    <IconFolder size={14} /> Finder
                  </button>
                  {project.devCommand && (
                    <button
                      className="detail-action-btn"
                      style={{ color: 'var(--p-success)' }}
                      onClick={() => { actions.startDev(project.path, project.devCommand!); toast('Dev server starting...', 'info'); }}
                    >
                      <IconPlay size={12} /> Start Dev
                    </button>
                  )}
                  {project.devPort && (
                    <button className="detail-action-btn" onClick={() => actions.openUrl(`http://localhost:${project.devPort}`)}>
                      <IconExternalLink size={12} /> :{project.devPort}
                    </button>
                  )}
                  {!project.hasGit && (
                    <button
                      className="detail-action-btn"
                      style={{ color: 'var(--p-accent)' }}
                      onClick={() => {
                        fetch('/api/actions/git-init', {
                          method: 'POST',
                          headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({ path: project.path }),
                        }).then((r) => r.json()).then((d) => toast(d.ok ? 'Git initialized!' : (d.error || 'Failed'), d.ok ? 'success' : 'error'));
                      }}
                    >
                      <IconGitCommit size={14} /> Init Git
                    </button>
                  )}
                  {project.hasGit && !project.githubRepo && (
                    <button
                      className="detail-action-btn"
                      style={{ color: 'var(--p-accent)' }}
                      onClick={() => setTab('github')}
                    >
                      <IconGitHub size={14} /> Add GitHub
                    </button>
                  )}
                </div>
              </div>

              <div className="detail-section">
                <div className="detail-section-title">Project Info</div>
                <div className="detail-info-grid">
                  <div className="detail-info-label">Path</div>
                  <button
                    className="detail-info-value detail-path-btn"
                    onClick={() => { navigator.clipboard.writeText(project.path); toast('Path copied', 'success'); }}
                  >
                    {shortenPath(project.path)}
                  </button>

                  {project.hasGit && (
                    <>
                      <div className="detail-info-label">Branch</div>
                      <div className="detail-info-value" style={{ fontFamily: 'var(--p-font-mono)' }}>
                        {project.gitBranch}
                        {project.gitDirty && (
                          <span style={{ color: 'var(--p-warning)', marginLeft: 6 }}>uncommitted</span>
                        )}
                      </div>
                    </>
                  )}

                  {project.devCommand && (
                    <>
                      <div className="detail-info-label">Dev Command</div>
                      <div className="detail-info-value" style={{ fontFamily: 'var(--p-font-mono)' }}>
                        {project.devCommand}
                      </div>
                    </>
                  )}

                  {project.devPort && (
                    <>
                      <div className="detail-info-label">Dev Port</div>
                      <div className="detail-info-value" style={{ fontFamily: 'var(--p-font-mono)' }}>
                        :{project.devPort}
                      </div>
                    </>
                  )}

                  {project.deployTarget !== 'none' && (
                    <>
                      <div className="detail-info-label">Deploy</div>
                      <div className="detail-info-value">
                        {project.deployTarget}
                        {project.deployUrl && (
                          <a href={project.deployUrl} target="_blank" rel="noopener" style={{ marginLeft: 6 }}>
                            <IconExternalLink size={12} />
                          </a>
                        )}
                      </div>
                    </>
                  )}

                  {project.githubRepo && (
                    <>
                      <div className="detail-info-label">GitHub</div>
                      <div className="detail-info-value">
                        <a href={project.githubUrl!} target="_blank" rel="noopener" className="detail-link">
                          {project.githubRepo} <IconExternalLink size={11} />
                        </a>
                      </div>
                    </>
                  )}
                </div>
              </div>

              {project.hasSharedLib && (
                <div className="detail-section">
                  <span className="p-badge p-badge-accent">Shared Library</span>
                </div>
              )}
            </div>
          )}

          {tab === 'files' && (
            <div>
              {loadingFiles ? (
                <div className="scanning-indicator">Loading files...</div>
              ) : fileData ? (
                <>
                  {/* Extension summary */}
                  <div className="detail-section">
                    <div className="detail-section-title">File Types</div>
                    <div className="ext-stats-grid">
                      {Object.entries(fileData.extStats)
                        .sort(([, a], [, b]) => b.count - a.count)
                        .slice(0, 12)
                        .map(([ext, stats]) => (
                          <div key={ext} className="ext-stat">
                            <span className="ext-stat-name">.{ext}</span>
                            <span className="ext-stat-count">{stats.count} files</span>
                            <span className="ext-stat-size">{formatSize(stats.size)}</span>
                          </div>
                        ))}
                    </div>
                  </div>

                  <div className="detail-section">
                    <div className="detail-section-title">File Tree</div>
                    <FileTree entries={fileData.files} />
                  </div>
                </>
              ) : (
                <div className="pm-centered-state">
                  <IconFile size={28} color="var(--p-text-muted)" />
                  <div className="empty-state-title">No files found</div>
                  <div className="empty-state-desc">This project directory appears to be empty or inaccessible</div>
                </div>
              )}
            </div>
          )}

          {tab === 'git' && (
            <GitOpsTab project={project} />
          )}

          {tab === 'github' && (
            project.githubRepo ? (
              <GitHubTab githubRepo={project.githubRepo} projectPath={project.path} />
            ) : (
              <GitHubSetup
                projectName={project.name}
                projectPath={project.path}
                hasGit={project.hasGit}
              />
            )
          )}

          {tab === 'deploy' && project.deployTarget !== 'none' && (
            <DeployTab projectId={project.id} deployTarget={project.deployTarget} />
          )}

          {tab === 'deps' && (
            <div>
              {loadingDeps ? (
                <div className="scanning-indicator">
                  Checking dependencies...
                </div>
              ) : !depsData || depsData.total === 0 ? (
                <div className="pm-centered-state">
                  <div className="empty-state-title">All dependencies up to date</div>
                  <div className="empty-state-desc">No outdated packages found -- everything is on the latest version</div>
                </div>
              ) : (
                <div className="deps-panel">
                  <div className="deps-summary">
                    <span className="deps-total">{depsData.total} outdated</span>
                    {depsData.major > 0 && <span className="deps-badge deps-badge-major">{depsData.major} major</span>}
                    {depsData.minor > 0 && <span className="deps-badge deps-badge-minor">{depsData.minor} minor</span>}
                    {depsData.patch > 0 && <span className="deps-badge deps-badge-patch">{depsData.patch} patch</span>}
                  </div>
                  <div className="deps-table">
                    <div className="deps-header">
                      <span style={{ flex: 2 }}>Package</span>
                      <span style={{ flex: 1 }}>Current</span>
                      <span style={{ flex: 1 }}>Latest</span>
                      <span style={{ flex: 0.6 }}>Change</span>
                    </div>
                    {depsData.packages.map((pkg) => (
                      <div key={pkg.name} className={`deps-row deps-row-${pkg.severity}`}>
                        <span className="deps-pkg-name" style={{ flex: 2 }}>{pkg.name}</span>
                        <span style={{ flex: 1 }} className="deps-version">{pkg.current}</span>
                        <span style={{ flex: 1 }} className="deps-version deps-version-new">{pkg.latest}</span>
                        <span style={{ flex: 0.6 }}>
                          <span className={`deps-severity deps-severity-${pkg.severity}`}>{pkg.severity}</span>
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {tab === 'docker' && (
            <DockerTab project={project} />
          )}

          {tab === 'localhost' && (
            <LocalhostManager project={project} />
          )}

          {tab === 'notes' && (
            <div className="detail-section">
              {!notesLoaded ? (
                <div className="scanning-indicator" style={{ padding: 20, fontSize: 12 }}>Loading notes...</div>
              ) : (
                <>
                  <textarea
                    className="project-notes-editor"
                    value={notes}
                    onChange={(e) => handleNotesChange(e.target.value)}
                    onBlur={handleNotesBlur}
                    placeholder="No notes yet — click to start writing.&#10;&#10;Use this for deploy instructions, gotchas, environment setup, or anything you want to remember about this project."
                  />
                  {notesSaving && (
                    <div style={{ fontSize: 11, color: 'var(--p-text-muted)', marginTop: 6 }}>Saving...</div>
                  )}
                </>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
