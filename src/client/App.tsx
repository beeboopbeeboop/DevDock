import { useState, useCallback, useEffect, useRef, useMemo } from 'react';
import { AppShell } from './components/AppShell';
import { Sidebar } from './components/Sidebar';
import { ProjectGrid } from './components/ProjectGrid';
import { ProjectList } from './components/ProjectList';
import { ProjectDetail } from './components/ProjectDetail';
import { CommandPalette } from './components/CommandPalette';
import { CustomSelect } from './components/CustomSelect';
import { SettingsPanel } from './components/SettingsPanel';
import { PortManager } from './components/PortManager';
import { DependencyGraph } from './components/DependencyGraph';
import { CrossSearch } from './components/CrossSearch';
import { BatchActionBar } from './components/BatchActionBar';
import { DockerManager } from './components/DockerManager';
import { useProjects, useScan, useProjectActions } from './hooks/useProjects';
import { usePortStatusBatch } from './hooks/usePortStatus';
import { useToast } from './components/Toast';
import { IconGrid, IconList, IconSettings, IconFolder } from './components/Icons';
import {
  PROJECT_TYPE_LABELS,
  PROJECT_TYPE_COLORS,
} from './types/project';
import type { Project, ProjectFilters, ProjectStatus, ProjectType } from './types/project';

export type ViewMode = 'grid' | 'list';
export type AppView = 'projects' | 'ports' | 'docker' | 'graph' | 'search';

const CMD_SHORTCUT = navigator.platform.includes('Mac') ? '⌘K' : 'Ctrl+K';

const SORT_OPTIONS = [
  { value: 'priority', label: 'Priority' },
  { value: 'name', label: 'Name' },
  { value: 'lastModified', label: 'Last Modified' },
  { value: 'type', label: 'Type' },
];

const ALL_TYPES: ProjectType[] = [
  'cep-plugin', 'nextjs', 'vite-react', 'framer-plugin',
  'hono-server', 'cloudflare-worker', 'static-site', 'node-package',
  'swift-app', 'unknown',
];

export function App() {
  const [appView, setAppView] = useState<AppView>('projects');
  const [viewMode, setViewMode] = useState<ViewMode>('grid');
  const [filters, setFilters] = useState<ProjectFilters>({ sort: 'priority' });
  const [selectedProject, setSelectedProject] = useState<Project | null>(null);
  const [initialDetailTab, setInitialDetailTab] = useState<string | undefined>(undefined);
  const [cmdPaletteOpen, setCmdPaletteOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [scanDone, setScanDone] = useState(false);
  const [showDirtyOnly, setShowDirtyOnly] = useState(false);
  const [techStackFilter, setTechStackFilter] = useState<Set<string>>(new Set());
  const [focusedIndex, setFocusedIndex] = useState(-1);
  const [batchMode, setBatchMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const { data: projects = [], isLoading } = useProjects(filters);
  const scan = useScan();
  const { toast } = useToast();
  const prevScanning = useRef(false);
  const actions = useProjectActions();

  const displayProjects = useMemo(() => {
    let result = projects;
    if (showDirtyOnly) result = result.filter((p) => p.gitDirty);
    if (techStackFilter.size > 0) {
      result = result.filter((p) =>
        p.techStack.some((t) => techStackFilter.has(t))
      );
    }
    return result;
  }, [showDirtyOnly, techStackFilter, projects]);

  // Track scan completion for toast
  useEffect(() => {
    if (prevScanning.current && !scan.isPending) {
      setScanDone(true);
      toast('Scan complete', 'success');
      setTimeout(() => setScanDone(false), 2500);
    }
    prevScanning.current = scan.isPending;
  }, [scan.isPending, toast]);

  // Reset focus on view/filter changes
  useEffect(() => { setFocusedIndex(-1); }, [appView, filters, showDirtyOnly]);

  // Global keyboard shortcuts
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      // Cmd+K: command palette
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setCmdPaletteOpen((v) => !v);
        return;
      }
      // Cmd+B: toggle batch mode
      if ((e.metaKey || e.ctrlKey) && e.key === 'b') {
        e.preventDefault();
        setBatchMode((v) => {
          if (v) setSelectedIds(new Set());
          return !v;
        });
        return;
      }
      // Cmd+1/2/3/4/5: switch views
      if ((e.metaKey || e.ctrlKey) && ['1', '2', '3', '4', '5'].includes(e.key)) {
        e.preventDefault();
        const views: AppView[] = ['projects', 'ports', 'docker', 'graph', 'search'];
        setAppView(views[parseInt(e.key) - 1] || 'projects');
        return;
      }

      if (e.key === 'Escape' && selectedProject) {
        setSelectedProject(null);
        setInitialDetailTab(undefined);
        return;
      }

      // Skip single-key shortcuts when typing in inputs
      const tag = (document.activeElement?.tagName || '').toLowerCase();
      if (tag === 'input' || tag === 'textarea' || tag === 'select') return;
      if (cmdPaletteOpen || settingsOpen || selectedProject) return;
      if (appView !== 'projects') return;

      const maxIdx = displayProjects.length - 1;
      if (maxIdx < 0) return;

      switch (e.key) {
        case 'ArrowRight':
        case 'ArrowDown':
          e.preventDefault();
          setFocusedIndex((i) => Math.min(i + 1, maxIdx));
          break;
        case 'ArrowLeft':
        case 'ArrowUp':
          e.preventDefault();
          setFocusedIndex((i) => Math.max(i - 1, 0));
          break;
        case 'Enter':
          if (focusedIndex >= 0 && focusedIndex <= maxIdx) {
            setSelectedProject(displayProjects[focusedIndex]);
          }
          break;
        case 'e':
          if (focusedIndex >= 0) actions.openEditor(displayProjects[focusedIndex].path, 'vscode');
          break;
        case 't':
          if (focusedIndex >= 0) actions.openTerminal(displayProjects[focusedIndex].path);
          break;
        case 'f':
          if (focusedIndex >= 0) actions.openFinder(displayProjects[focusedIndex].path);
          break;
        case '/':
          e.preventDefault();
          document.querySelector<HTMLInputElement>('.topbar input, .sidebar-search')?.focus();
          break;
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [selectedProject, cmdPaletteOpen, settingsOpen, appView, displayProjects, focusedIndex, actions]);

  const handleSearch = useCallback((search: string) => {
    setFilters((f) => ({ ...f, search: search || undefined }));
  }, []);

  const handleFilterType = useCallback((type?: ProjectType) => {
    setFilters((f) => ({ ...f, type }));
  }, []);

  const handleFilterStatus = useCallback((status?: ProjectStatus) => {
    setFilters((f) => ({ ...f, status }));
  }, []);

  const handleSort = useCallback((sort: string) => {
    setFilters((f) => ({ ...f, sort: sort as ProjectFilters['sort'] }));
  }, []);

  const handleScan = useCallback(() => {
    if (!scan.isPending) scan.mutate();
  }, [scan]);

  const handleToggleSelect = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }, []);

  // Unfiltered for counts
  const { data: allProjects = [] } = useProjects({ sort: 'priority' });

  const typeCounts = allProjects.reduce<Record<string, number>>((acc, p) => {
    acc[p.type] = (acc[p.type] || 0) + 1;
    return acc;
  }, {});

  const statusCounts = allProjects.reduce<Record<string, number>>((acc, p) => {
    acc[p.status] = (acc[p.status] || 0) + 1;
    return acc;
  }, {});

  const techStackCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const p of allProjects) {
      for (const t of p.techStack) {
        counts[t] = (counts[t] || 0) + 1;
      }
    }
    return Object.entries(counts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 12);
  }, [allProjects]);

  // Batch port status
  const portsToCheck = allProjects.filter((p) => p.devPort).map((p) => p.devPort!);
  const { data: portStatuses } = usePortStatusBatch(portsToCheck);
  const runningPorts = new Set(
    (portStatuses || []).filter((s) => s.running).map((s) => s.port),
  );

  const runningServers = allProjects
    .filter((p) => p.devPort && runningPorts.has(p.devPort))
    .map((p) => ({ name: p.name, port: p.devPort! }));

  const activeFilterCount =
    (filters.type ? 1 : 0) + (filters.status ? 1 : 0) + (filters.search ? 1 : 0) + (showDirtyOnly ? 1 : 0) + (techStackFilter.size > 0 ? 1 : 0);

  const selectProjectById = useCallback((id: string) => {
    const proj = allProjects.find((p) => p.id === id);
    if (proj) setSelectedProject(proj);
  }, [allProjects]);

  return (
    <AppShell>
      <Sidebar
        onFilterStatus={handleFilterStatus}
        activeStatus={filters.status}
        statusCounts={statusCounts}
        onScan={handleScan}
        isScanning={scan.isPending}
        onOpenCommandPalette={() => setCmdPaletteOpen(true)}
        onOpenSettings={() => setSettingsOpen(true)}
        runningServers={runningServers}
        recentProjects={[...allProjects].sort((a, b) =>
          new Date(b.lastModified).getTime() - new Date(a.lastModified).getTime()
        ).slice(0, 5)}
        dirtyCount={allProjects.filter((p) => p.gitDirty).length}
        showDirtyOnly={showDirtyOnly}
        onSelectProject={setSelectedProject}
        appView={appView}
        onChangeView={setAppView}
        onFilterDirty={() => { setShowDirtyOnly((v) => !v); setAppView('projects'); }}
      />

      <div className="main-content">
        {appView === 'projects' && (
          <>
            <div className="topbar">
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <span className="topbar-title">
                  {showDirtyOnly ? 'Uncommitted Projects' : 'Projects'}
                </span>
                <span className="topbar-meta">{displayProjects.length} found</span>
                {scan.isPending && (
                  <span className="scanning-indicator">Scanning...</span>
                )}
                {scanDone && !scan.isPending && (
                  <span className="scan-done-indicator">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="var(--p-success)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="20 6 9 17 4 12" />
                    </svg>
                    Scan complete
                  </span>
                )}
              </div>
              <div className="topbar-actions">
                <CustomSelect
                  options={SORT_OPTIONS}
                  value={filters.sort || 'priority'}
                  onChange={handleSort}
                  width={150}
                />
                <div className="view-toggle">
                  <button
                    data-active={viewMode === 'grid' ? 'true' : undefined}
                    onClick={() => setViewMode('grid')}
                    title="Grid view"
                  >
                    <IconGrid size={14} />
                  </button>
                  <button
                    data-active={viewMode === 'list' ? 'true' : undefined}
                    onClick={() => setViewMode('list')}
                    title="List view"
                  >
                    <IconList size={14} />
                  </button>
                </div>
                <button
                  className="p-icon-btn"
                  onClick={() => setSettingsOpen(true)}
                  title="Settings"
                  style={{ color: 'var(--p-text-muted)' }}
                >
                  <IconSettings size={15} />
                </button>
              </div>
            </div>

            {/* Type pill row */}
            <div className="type-pills-bar">
              <button
                className={`type-pill ${!filters.type ? 'type-pill-active' : ''}`}
                onClick={() => handleFilterType(undefined)}
              >
                All
                <span className="type-pill-count">{allProjects.length}</span>
              </button>
              {ALL_TYPES.map((type) => {
                const count = typeCounts[type] || 0;
                if (count === 0) return null;
                const color = PROJECT_TYPE_COLORS[type];
                const isActive = filters.type === type;
                return (
                  <button
                    key={type}
                    className={`type-pill ${isActive ? 'type-pill-active' : ''}`}
                    onClick={() => handleFilterType(isActive ? undefined : type)}
                    style={isActive ? {
                      background: `${color}20`,
                      color: color,
                      borderColor: `${color}40`,
                    } : undefined}
                  >
                    <span
                      className="type-pill-dot"
                      style={{ background: color }}
                    />
                    {PROJECT_TYPE_LABELS[type]}
                    <span className="type-pill-count">{count}</span>
                  </button>
                );
              })}
              {activeFilterCount > 0 && (
                <button
                  className="type-pill type-pill-clear"
                  onClick={() => { setFilters({ sort: filters.sort }); setShowDirtyOnly(false); setTechStackFilter(new Set()); }}
                >
                  Clear
                </button>
              )}
            </div>

            {/* Tech stack pills */}
            {techStackCounts.length > 0 && (
              <div className="type-pills-bar tech-pills-bar">
                {techStackCounts.map(([tech, count]) => {
                  const isActive = techStackFilter.has(tech);
                  return (
                    <button
                      key={tech}
                      className={`type-pill type-pill-sm${isActive ? ' type-pill-active' : ''}`}
                      onClick={() => {
                        const next = new Set(techStackFilter);
                        if (isActive) next.delete(tech); else next.add(tech);
                        setTechStackFilter(next);
                      }}
                    >
                      {tech}
                      <span className="type-pill-count">{count}</span>
                    </button>
                  );
                })}
              </div>
            )}

            <div className="content-area" key={`${viewMode}-${filters.type}-${filters.status}-${filters.search}`}>
              {isLoading ? (
                <div className="empty-state">
                  <div className="scanning-indicator" style={{ fontSize: 14 }}>
                    Loading projects...
                  </div>
                </div>
              ) : displayProjects.length === 0 ? (
                <div className="empty-state">
                  <div className="empty-state-icon">
                    <IconFolder size={36} color="var(--p-text-muted)" />
                  </div>
                  <div className="empty-state-title">No projects match your filters</div>
                  <div className="empty-state-desc">
                    {activeFilterCount > 0
                      ? 'Try removing some filters or clearing the search to see all projects'
                      : 'Click "Rescan" in the sidebar to discover projects in your workspace'}
                  </div>
                </div>
              ) : viewMode === 'grid' ? (
                <ProjectGrid projects={displayProjects} onSelectProject={setSelectedProject} onOpenNotes={(p) => { setInitialDetailTab('notes'); setSelectedProject(p); }} runningPorts={runningPorts} isCustomSort={filters.sort === 'custom' || filters.sort === 'priority' || !filters.sort} focusedIndex={focusedIndex} batchMode={batchMode} selectedIds={selectedIds} onToggleSelect={handleToggleSelect} />
              ) : (
                <ProjectList projects={displayProjects} onSelectProject={setSelectedProject} runningPorts={runningPorts} focusedIndex={focusedIndex} batchMode={batchMode} selectedIds={selectedIds} onToggleSelect={handleToggleSelect} />
              )}
            </div>

            {batchMode && selectedIds.size > 0 && (
              <BatchActionBar
                selectedCount={selectedIds.size}
                selectedIds={selectedIds}
                onDeselectAll={() => setSelectedIds(new Set())}
                projects={displayProjects}
              />
            )}
          </>
        )}

        {appView === 'ports' && (
          <PortManager onSelectProjectById={selectProjectById} />
        )}

        {appView === 'docker' && (
          <DockerManager onSelectProjectById={selectProjectById} />
        )}

        {appView === 'graph' && (
          <DependencyGraph onSelectProjectById={selectProjectById} />
        )}

        {appView === 'search' && (
          <CrossSearch onSelectProjectById={selectProjectById} />
        )}
      </div>

      {selectedProject && (
        <ProjectDetail
          project={allProjects.find((p) => p.id === selectedProject.id) || selectedProject}
          onClose={() => { setSelectedProject(null); setInitialDetailTab(undefined); }}
          initialTab={initialDetailTab as any}
        />
      )}

      <CommandPalette
        projects={allProjects}
        isOpen={cmdPaletteOpen}
        onClose={() => setCmdPaletteOpen(false)}
        onSelectProject={(p) => { setSelectedProject(p); setCmdPaletteOpen(false); }}
        shortcut={CMD_SHORTCUT}
        onChangeView={setAppView}
        onChangeViewMode={setViewMode}
        onFilterDirty={() => { setShowDirtyOnly(true); setAppView('projects'); }}
      />

      <SettingsPanel
        isOpen={settingsOpen}
        onClose={() => setSettingsOpen(false)}
      />
    </AppShell>
  );
}
