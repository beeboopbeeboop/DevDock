import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import type { Project } from '../types/project';
import { PROJECT_TYPE_LABELS, PROJECT_TYPE_COLORS } from '../types/project';
import { IconVSCode, IconCursor, IconTerminal, IconFolder, IconGitHub, IconPlay, IconClaude, IconGitCommit } from './Icons';
import { useProjectActions } from '../hooks/useProjects';
import { useToast } from './Toast';
import { loadSetting, saveSetting } from './SettingsPanel';
import type { AppView, ViewMode } from '../App';

interface CommandPaletteProps {
  projects: Project[];
  isOpen: boolean;
  onClose: () => void;
  onSelectProject: (project: Project) => void;
  shortcut: string;
  onChangeView: (view: AppView) => void;
  onChangeViewMode: (mode: ViewMode) => void;
  onFilterDirty: () => void;
}

interface Command {
  id: string;
  label: string;
  description?: string;
  icon?: React.ReactNode;
  category: 'recent' | 'project' | 'action' | 'navigation' | 'git' | 'view' | 'environment' | 'deploy';
  action: () => void | Promise<void>;
  keywords?: string;
  async?: boolean;
}

type PaletteMode = 'search' | 'project-actions' | 'commit-input' | 'branch-select';

const CATEGORY_ORDER: Command['category'][] = [
  'recent', 'project', 'action', 'git', 'environment', 'deploy', 'navigation', 'view',
];

const CATEGORY_LABELS: Record<Command['category'], string> = {
  recent: 'Recent',
  project: 'Projects',
  action: 'Actions',
  git: 'Git',
  environment: 'Environment',
  deploy: 'Deploy',
  navigation: 'Navigation',
  view: 'Views',
};

interface RecentEntry {
  id: string;
  label: string;
  category: string;
}

function loadRecents(): RecentEntry[] {
  return loadSetting<RecentEntry[]>('recent-commands', []);
}

function saveRecent(cmd: { id: string; label: string; category: string }) {
  const recents = loadRecents().filter((r) => r.id !== cmd.id);
  recents.unshift({ id: cmd.id, label: cmd.label, category: cmd.category });
  if (recents.length > 8) recents.length = 8;
  saveSetting('recent-commands', recents);
}

export function CommandPalette({
  projects, isOpen, onClose, onSelectProject, shortcut,
  onChangeView, onChangeViewMode, onFilterDirty,
}: CommandPaletteProps) {
  const [query, setQuery] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);
  const [mode, setMode] = useState<PaletteMode>('search');
  const [focusedProject, setFocusedProject] = useState<Project | null>(null);
  const [commitMsg, setCommitMsg] = useState('');
  const [branches, setBranches] = useState<{ name: string; isRemote: boolean; isCurrent: boolean }[]>([]);
  const [stagedCount, setStagedCount] = useState(0);
  const [loadingId, setLoadingId] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const actions = useProjectActions();
  const { toast } = useToast();

  // ─── Execute with loading + toast ───
  const executeCommand = useCallback(async (cmd: Command) => {
    // Save to recents (skip project drill-in since those open sub-menus)
    if (cmd.category !== 'project' || mode !== 'search') {
      saveRecent({ id: cmd.id, label: cmd.label, category: cmd.category });
    }

    if (!cmd.async) {
      try {
        cmd.action();
      } catch (err: unknown) {
        toast(err instanceof Error ? err.message : 'Action failed', 'error');
      }
      return;
    }

    setLoadingId(cmd.id);
    try {
      await cmd.action();
    } catch (err: unknown) {
      toast(err instanceof Error ? err.message : 'Action failed', 'error');
    } finally {
      setLoadingId(null);
    }
  }, [toast, mode]);

  // ─── Helpers ───
  const goBack = useCallback(() => {
    if (mode === 'commit-input' || mode === 'branch-select') {
      setMode('project-actions');
      setQuery('');
      setTimeout(() => inputRef.current?.focus(), 30);
    } else if (mode === 'project-actions') {
      setMode('search');
      setFocusedProject(null);
      setQuery('');
    }
    setActiveIndex(0);
  }, [mode]);

  const drillIntoProject = useCallback((p: Project) => {
    setFocusedProject(p);
    setMode('project-actions');
    setQuery('');
    setActiveIndex(0);
    fetch(`/api/actions/git-status?path=${encodeURIComponent(p.path)}`)
      .then((r) => r.ok ? r.json() : { staged: [], unstaged: [] })
      .then((d) => setStagedCount(d.staged?.length || 0))
      .catch(() => setStagedCount(0));
  }, []);

  const startCommitFlow = useCallback(() => {
    setMode('commit-input');
    setCommitMsg('');
    setTimeout(() => textareaRef.current?.focus(), 30);
  }, []);

  const startBranchFlow = useCallback((p: Project) => {
    setMode('branch-select');
    setQuery('');
    setActiveIndex(0);
    fetch(`/api/actions/git-branches?path=${encodeURIComponent(p.path)}`)
      .then((r) => r.ok ? r.json() : { branches: [] })
      .then((d) => setBranches(d.branches || []))
      .catch(() => setBranches([]));
  }, []);

  const doCommit = useCallback(async () => {
    if (!focusedProject || !commitMsg.trim()) return;
    try {
      const statusRes = await fetch(`/api/actions/git-status?path=${encodeURIComponent(focusedProject.path)}`);
      const statusData = await statusRes.json();
      const unstaged = statusData.unstaged?.map((f: { file: string }) => f.file) || [];
      if (unstaged.length > 0) {
        await fetch('/api/actions/git-stage', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ path: focusedProject.path, files: unstaged }),
        });
      }
      const res = await fetch('/api/actions/git-commit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: focusedProject.path, message: commitMsg }),
      });
      const data = await res.json();
      if (res.ok) {
        toast(`Committed: ${(data.output || '').slice(0, 60)}`, 'success');
      } else {
        toast(data.error || 'Commit failed', 'error');
      }
    } catch {
      toast('Commit failed', 'error');
    }
    onClose();
  }, [focusedProject, commitMsg, onClose, toast]);

  const doBranchSwitch = useCallback(async (branch: string) => {
    if (!focusedProject) return;
    try {
      const res = await fetch('/api/actions/git-checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: focusedProject.path, branch }),
      });
      if (res.ok) {
        toast(`Switched to ${branch}`, 'success');
      } else {
        const data = await res.json();
        toast(data.error || 'Branch switch failed', 'error');
      }
    } catch {
      toast('Branch switch failed', 'error');
    }
    onClose();
  }, [focusedProject, onClose, toast]);

  // ─── Build commands ───
  const commands = useMemo((): Command[] => {
    if (mode === 'project-actions' && focusedProject) {
      const p = focusedProject;
      const cmds: Command[] = [
        {
          id: 'pa-open-detail',
          label: 'Open project detail',
          icon: <IconFolder size={14} />,
          category: 'action',
          action: () => { onSelectProject(p); onClose(); },
        },
        {
          id: 'pa-vscode',
          label: 'Open in VS Code',
          icon: <IconVSCode size={14} />,
          category: 'action',
          action: () => { actions.openEditor(p.path, 'vscode'); onClose(); },
        },
        {
          id: 'pa-cursor',
          label: 'Open in Cursor',
          icon: <IconCursor size={14} />,
          category: 'action',
          action: () => { actions.openEditor(p.path, 'cursor'); onClose(); },
        },
        {
          id: 'pa-terminal',
          label: 'Open Terminal',
          icon: <IconTerminal size={14} />,
          category: 'action',
          action: () => { actions.openTerminal(p.path); onClose(); },
        },
        {
          id: 'pa-claude',
          label: 'Open Claude in Terminal',
          icon: <IconClaude size={14} />,
          category: 'action',
          action: () => { actions.openClaudeTerminal(p.path); onClose(); },
        },
        {
          id: 'pa-finder',
          label: 'Reveal in Finder',
          icon: <IconFolder size={14} />,
          category: 'action',
          action: () => { actions.openFinder(p.path); onClose(); },
        },
        {
          id: 'pa-copy-path',
          label: 'Copy path',
          category: 'action',
          action: () => { navigator.clipboard.writeText(p.path); toast('Path copied', 'info'); onClose(); },
          keywords: 'clipboard',
        },
      ];

      if (p.devCommand) {
        cmds.push({
          id: 'pa-dev',
          label: 'Start dev server',
          icon: <IconPlay size={12} color="var(--p-success)" />,
          category: 'action',
          action: () => { actions.startDev(p.path, p.devCommand!); toast('Dev server starting', 'info'); onClose(); },
          keywords: 'run start',
        });
      }

      if (p.devPort) {
        cmds.push({
          id: 'pa-open-localhost',
          label: `Open localhost:${p.devPort}`,
          category: 'navigation',
          action: () => { window.open(`http://localhost:${p.devPort}`, '_blank'); onClose(); },
        });
      }

      if (p.githubUrl) {
        cmds.push({
          id: 'pa-github',
          label: 'Open on GitHub',
          icon: <IconGitHub size={14} />,
          category: 'navigation',
          action: () => { window.open(p.githubUrl!, '_blank'); onClose(); },
        });
      }

      if (p.hasGit) {
        cmds.push(
          {
            id: 'pa-commit',
            label: `Quick commit${stagedCount > 0 ? ` (${stagedCount} staged)` : ''}`,
            icon: <IconGitCommit size={14} />,
            category: 'git',
            action: startCommitFlow,
            keywords: 'commit message',
          },
          {
            id: 'pa-push',
            label: 'Push to remote',
            category: 'git',
            async: true,
            action: async () => {
              const res = await fetch('/api/actions/git-push', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ path: p.path }),
              });
              const data = await res.json();
              if (res.ok) {
                toast('Pushed to remote', 'success');
              } else {
                toast(data.error || 'Push failed', 'error');
              }
              onClose();
            },
          },
          {
            id: 'pa-pull',
            label: 'Pull from remote',
            category: 'git',
            async: true,
            action: async () => {
              const res = await fetch('/api/actions/git-pull', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ path: p.path }),
              });
              const data = await res.json();
              if (res.ok) {
                toast('Pulled from remote', 'success');
              } else {
                toast(data.error || 'Pull failed', 'error');
              }
              onClose();
            },
          },
          {
            id: 'pa-branch',
            label: 'Switch branch',
            category: 'git',
            action: () => startBranchFlow(p),
            keywords: 'checkout branch',
          },
        );
      }

      // Project-scoped: secrets scan
      cmds.push({
        id: 'pa-secrets-scan',
        label: 'Scan for secrets',
        category: 'environment',
        async: true,
        action: async () => {
          const res = await fetch(`/api/secrets/scan?path=${encodeURIComponent(p.path)}`);
          const data = await res.json();
          const count = data.findings?.length || 0;
          toast(count > 0 ? `Found ${count} potential secret${count !== 1 ? 's' : ''}` : 'No secrets found', count > 0 ? 'error' : 'success');
          onClose();
        },
        keywords: 'secrets keys tokens',
      });

      // Project-scoped: outdated deps
      cmds.push({
        id: 'pa-deps-outdated',
        label: 'Check outdated deps',
        category: 'environment',
        async: true,
        action: async () => {
          const res = await fetch(`/api/actions/deps-outdated?path=${encodeURIComponent(p.path)}`);
          const data = await res.json();
          if (data.error) {
            toast(data.error, 'error');
          } else {
            const count = data.outdated?.length || 0;
            toast(count > 0 ? `${count} outdated dep${count !== 1 ? 's' : ''} found` : 'All deps up to date', count > 0 ? 'info' : 'success');
          }
          onClose();
        },
        keywords: 'dependencies outdated update npm',
      });

      // Project-scoped: deploy (only if deploy target configured)
      if (p.deployTarget && p.deployTarget !== 'none') {
        cmds.push(
          {
            id: 'pa-deploy-trigger',
            label: `Deploy to ${p.deployTarget}`,
            category: 'deploy',
            async: true,
            action: async () => {
              const res = await fetch(`/api/deploy/${p.id}/trigger`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ environment: 'preview' }),
              });
              const data = await res.json();
              if (res.ok && data.triggered) {
                toast(`Deploy triggered (${p.deployTarget})`, 'success');
              } else {
                toast(data.error || 'Deploy failed', 'error');
              }
              onClose();
            },
            keywords: 'deploy ship publish',
          },
          {
            id: 'pa-deploy-status',
            label: 'Check deploy status',
            category: 'deploy',
            async: true,
            action: async () => {
              const res = await fetch(`/api/deploy/${p.id}/status`);
              const data = await res.json();
              if (data.lastDeploy) {
                toast(`Last deploy: ${data.lastDeploy.status} (${data.lastDeploy.environment || 'preview'})`, 'info');
              } else if (data.cliMissing) {
                toast(`CLI not installed for ${p.deployTarget}`, 'error');
              } else {
                toast('No deployments found', 'info');
              }
              onClose();
            },
            keywords: 'deploy status check',
          },
        );
      }

      return cmds;
    }

    // Top-level search mode
    const cmds: Command[] = [];

    // All projects
    const TYPE_ICONS: Record<string, string> = {
      'cep-plugin': 'Ae', 'nextjs': 'N', 'vite-react': 'V', 'framer-plugin': 'F',
      'cloudflare-worker': 'CF', 'hono-server': 'H', 'static-site': 'S',
      'node-package': 'np', 'swift-app': 'Sw', 'unknown': '?',
    };
    const now = Date.now();
    const RECENT_THRESHOLD = 24 * 60 * 60 * 1000; // 24h

    projects.forEach((p) => {
      const isRecent = p.lastModified && (now - new Date(p.lastModified).getTime()) < RECENT_THRESHOLD;
      const extraKw = `${p.gitDirty ? ' dirty' : ''}${isRecent ? ' recent' : ''}`;
      const typeIcon = TYPE_ICONS[p.type] || '?';

      cmds.push({
        id: `project-${p.id}`,
        label: p.name,
        description: PROJECT_TYPE_LABELS[p.type],
        icon: (
          <span
            style={{
              width: 20, height: 20, borderRadius: 4, display: 'flex',
              alignItems: 'center', justifyContent: 'center', fontSize: 9,
              fontWeight: 600, background: `${PROJECT_TYPE_COLORS[p.type]}18`,
              color: PROJECT_TYPE_COLORS[p.type],
            }}
          >
            {typeIcon}
          </span>
        ),
        category: 'project',
        action: () => drillIntoProject(p),
        keywords: `${p.path} ${p.techStack.join(' ')} ${p.type}${extraKw}`,
      });

      // Direct action commands (top-level, no drill-in needed)
      if (p.devCommand) {
        cmds.push({
          id: `da-start-${p.id}`,
          label: `Start Dev: ${p.name}`,
          icon: <IconPlay size={12} color="var(--p-success)" />,
          category: 'action',
          action: () => { actions.startDev(p.path, p.devCommand!); toast('Dev server starting', 'info'); onClose(); },
          keywords: `${p.name} start dev run server${extraKw}`,
        });
      }
      if (p.hasGit) {
        cmds.push({
          id: `da-pull-${p.id}`,
          label: `Git Pull: ${p.name}`,
          icon: <IconGitCommit size={13} />,
          category: 'git',
          async: true,
          action: async () => {
            const res = await fetch('/api/actions/git-pull', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ path: p.path }) });
            const data = await res.json();
            toast(data.ok ? 'Pulled successfully' : 'Pull failed', data.ok ? 'success' : 'error');
            onClose();
          },
          keywords: `${p.name} pull git fetch${extraKw}`,
        });
      }
      cmds.push({
        id: `da-code-${p.id}`,
        label: `Open in VS Code: ${p.name}`,
        icon: <IconVSCode size={14} />,
        category: 'action',
        action: () => { actions.openEditor(p.path, 'vscode'); onClose(); },
        keywords: `${p.name} vscode code open editor${extraKw}`,
      });
    });

    // Global view actions
    cmds.push(
      {
        id: 'view-projects',
        label: 'Switch to Projects view',
        category: 'view',
        action: () => { onChangeView('projects'); onClose(); },
        keywords: 'projects home',
      },
      {
        id: 'view-ports',
        label: 'Switch to Ports view',
        category: 'view',
        action: () => { onChangeView('ports'); onClose(); },
        keywords: 'ports localhost',
      },
      {
        id: 'view-graph',
        label: 'Switch to Dependency Graph',
        category: 'view',
        action: () => { onChangeView('graph'); onClose(); },
        keywords: 'graph dependencies',
      },
      {
        id: 'view-grid',
        label: 'Grid view',
        category: 'view',
        action: () => { onChangeViewMode('grid'); onClose(); },
      },
      {
        id: 'view-list',
        label: 'List view',
        category: 'view',
        action: () => { onChangeViewMode('list'); onClose(); },
      },
      {
        id: 'view-dirty',
        label: 'Show uncommitted projects',
        category: 'view',
        action: () => { onFilterDirty(); onClose(); },
        keywords: 'dirty uncommitted git',
      },
    );

    // Global actions
    cmds.push(
      {
        id: 'action-scan',
        label: 'Rescan Projects',
        description: 'Re-discover all projects',
        category: 'action',
        async: true,
        action: async () => {
          await fetch('/api/scan', { method: 'POST' });
          toast('Rescan complete', 'success');
          onClose();
        },
      },
      {
        id: 'nav-github',
        label: 'Open GitHub',
        icon: <IconGitHub size={16} />,
        category: 'navigation',
        action: () => { window.open('https://github.com', '_blank'); onClose(); },
      },
      {
        id: 'nav-vercel',
        label: 'Open Vercel Dashboard',
        category: 'navigation',
        action: () => { window.open('https://vercel.com/dashboard', '_blank'); onClose(); },
      },
      {
        id: 'nav-cloudflare',
        label: 'Open Cloudflare Dashboard',
        category: 'navigation',
        action: () => { window.open('https://dash.cloudflare.com', '_blank'); onClose(); },
      },
      {
        id: 'nav-netlify',
        label: 'Open Netlify Dashboard',
        category: 'navigation',
        action: () => { window.open('https://app.netlify.com', '_blank'); onClose(); },
      },
      {
        id: 'nav-railway',
        label: 'Open Railway Dashboard',
        category: 'navigation',
        action: () => { window.open('https://railway.app/dashboard', '_blank'); onClose(); },
      },
      {
        id: 'nav-flyio',
        label: 'Open Fly.io Dashboard',
        category: 'navigation',
        action: () => { window.open('https://fly.io/dashboard', '_blank'); onClose(); },
      },
    );

    // Environment / secrets global commands
    cmds.push(
      {
        id: 'env-audit',
        label: 'Audit env files',
        description: 'Check all projects for env issues',
        category: 'environment',
        async: true,
        action: async () => {
          const res = await fetch('/api/env/audit');
          const data = await res.json();
          const issues = data.projects?.filter((p: { issues: string[] }) => p.issues.length > 0).length || 0;
          toast(issues > 0 ? `${issues} project${issues !== 1 ? 's' : ''} with env issues` : 'All env files look good', issues > 0 ? 'info' : 'success');
          onClose();
        },
        keywords: 'environment variables dotenv',
      },
      {
        id: 'secrets-audit',
        label: 'Audit all secrets',
        description: 'Scan all projects for hardcoded secrets',
        category: 'environment',
        async: true,
        action: async () => {
          const res = await fetch('/api/secrets/audit');
          const data = await res.json();
          const total = data.projects?.reduce((sum: number, p: { findings: unknown[] }) => sum + (p.findings?.length || 0), 0) || 0;
          toast(total > 0 ? `Found ${total} potential secret${total !== 1 ? 's' : ''} across projects` : 'No secrets found', total > 0 ? 'error' : 'success');
          onClose();
        },
        keywords: 'secrets keys tokens scan',
      },
    );

    return cmds;
  }, [
    mode, focusedProject, projects, stagedCount, actions,
    onSelectProject, onClose, onChangeView, onChangeViewMode, onFilterDirty,
    drillIntoProject, startCommitFlow, startBranchFlow, toast,
  ]);

  // ─── Filter with multi-word search ───
  const filtered = useMemo(() => {
    if (mode === 'branch-select') {
      const q = query.toLowerCase();
      return branches
        .filter((b) => !q || b.name.toLowerCase().includes(q))
        .map((b) => ({
          id: `branch-${b.name}`,
          label: b.name,
          description: b.isCurrent ? 'current' : b.isRemote ? 'remote' : undefined,
          category: 'git' as const,
          action: () => !b.isCurrent && doBranchSwitch(b.name),
        }));
    }

    if (!query.trim()) {
      if (mode === 'project-actions') return commands;

      // Show recents first if enabled, then projects, then other commands
      const showRecents = loadSetting('show-recent-commands', true);
      const result: Command[] = [];

      if (showRecents) {
        const savedRecents = loadRecents();
        const recentCmds: Command[] = [];
        for (const r of savedRecents) {
          const match = commands.find((c) => c.id === r.id);
          if (match) {
            recentCmds.push({ ...match, category: 'recent' });
          }
        }
        if (recentCmds.length > 0) {
          result.push(...recentCmds);
        }
      }

      result.push(...commands.filter((c) => c.category === 'project').slice(0, 10));
      result.push(...commands.filter((c) => c.category !== 'project').slice(0, 8));
      return result;
    }

    const q = query.toLowerCase();
    const words = q.split(/\s+/).filter(Boolean);
    return commands
      .map((c) => {
        const hay = `${c.label} ${c.description || ''} ${c.keywords || ''}`.toLowerCase();
        if (!words.every((w) => hay.includes(w))) return null;
        let score = 0;
        const label = c.label.toLowerCase();
        if (label === q) score += 100;
        else if (label.startsWith(words[0])) score += 50;
        else if (label.includes(q)) score += 25;
        if (c.keywords?.includes('dirty')) score += 10;
        if (c.keywords?.includes('recent')) score += 5;
        // Boost project entries over direct actions when searching by name
        if (c.category === 'project') score += 3;
        return { ...c, _score: score };
      })
      .filter(Boolean)
      .sort((a, b) => b!._score - a!._score)
      .slice(0, 20) as Command[];
  }, [query, commands, mode, branches, doBranchSwitch]);

  // ─── Group filtered results by category ───
  const grouped = useMemo(() => {
    const groups: { category: Command['category']; label: string; items: (Command & { flatIndex: number })[] }[] = [];
    const byCategory = new Map<Command['category'], Command[]>();

    for (const cmd of filtered) {
      const cat = (cmd as Command).category || 'action';
      if (!byCategory.has(cat)) byCategory.set(cat, []);
      byCategory.get(cat)!.push(cmd as Command);
    }

    let flatIndex = 0;
    for (const cat of CATEGORY_ORDER) {
      const items = byCategory.get(cat);
      if (!items || items.length === 0) continue;
      groups.push({
        category: cat,
        label: CATEGORY_LABELS[cat],
        items: items.map((item) => ({ ...item, flatIndex: flatIndex++ })),
      });
    }

    // Catch any categories not in CATEGORY_ORDER
    for (const [cat, items] of byCategory) {
      if (CATEGORY_ORDER.includes(cat)) continue;
      groups.push({
        category: cat,
        label: CATEGORY_LABELS[cat] || cat,
        items: items.map((item) => ({ ...item, flatIndex: flatIndex++ })),
      });
    }

    return { groups, totalItems: flatIndex };
  }, [filtered]);

  // ─── Reset on open ───
  useEffect(() => {
    if (isOpen) {
      setQuery('');
      setActiveIndex(0);
      setMode('search');
      setFocusedProject(null);
      setCommitMsg('');
      setLoadingId(null);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [isOpen]);

  // ─── Keyboard navigation ───
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (mode === 'commit-input') {
        if (e.key === 'Escape') { goBack(); return; }
        if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { doCommit(); return; }
        return;
      }

      switch (e.key) {
        case 'ArrowDown':
          e.preventDefault();
          setActiveIndex((i) => Math.min(i + 1, grouped.totalItems - 1));
          break;
        case 'ArrowUp':
          e.preventDefault();
          setActiveIndex((i) => Math.max(i - 1, 0));
          break;
        case 'Enter':
          e.preventDefault();
          {
            // Find the command at activeIndex
            for (const g of grouped.groups) {
              for (const item of g.items) {
                if (item.flatIndex === activeIndex) {
                  executeCommand(item);
                  return;
                }
              }
            }
          }
          break;
        case 'Escape':
          if (mode !== 'search') {
            e.preventDefault();
            goBack();
          } else {
            onClose();
          }
          break;
        case 'Backspace':
          if (query === '' && mode !== 'search') {
            e.preventDefault();
            goBack();
          }
          break;
      }
    },
    [grouped, activeIndex, onClose, mode, query, goBack, doCommit, executeCommand],
  );

  // Scroll active item into view
  useEffect(() => {
    const el = listRef.current?.querySelector('[data-active="true"]') as HTMLElement | undefined;
    el?.scrollIntoView({ block: 'nearest' });
  }, [activeIndex]);

  if (!isOpen) return null;

  const breadcrumb = mode === 'project-actions' && focusedProject
    ? focusedProject.name
    : mode === 'commit-input' && focusedProject
      ? `${focusedProject.name} › Commit`
      : mode === 'branch-select' && focusedProject
        ? `${focusedProject.name} › Branches`
        : null;

  return (
    <div className="cmdp-backdrop" onClick={onClose}>
      <div className="cmdp-container" onClick={(e) => e.stopPropagation()}>
        {/* Breadcrumb */}
        {breadcrumb && (
          <div className="cmdp-breadcrumb">
            <button className="cmdp-breadcrumb-back" onClick={goBack}>
              <svg width={10} height={10} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <polyline points="15 18 9 12 15 6" />
              </svg>
            </button>
            <span>{breadcrumb}</span>
          </div>
        )}

        {/* Commit input mode */}
        {mode === 'commit-input' ? (
          <div className="cmdp-commit-wrap">
            <textarea
              ref={textareaRef}
              className="cmdp-commit-input"
              placeholder="Commit message..."
              value={commitMsg}
              onChange={(e) => setCommitMsg(e.target.value)}
              onKeyDown={handleKeyDown}
              rows={3}
            />
            <div className="cmdp-commit-footer">
              <span className="cmdp-commit-hint">
                {stagedCount > 0
                  ? `${stagedCount} staged file${stagedCount !== 1 ? 's' : ''}`
                  : 'All changes will be staged'}
              </span>
              <button
                className="cmdp-commit-btn"
                onClick={doCommit}
                disabled={!commitMsg.trim()}
              >
                Commit <kbd>⌘↵</kbd>
              </button>
            </div>
          </div>
        ) : (
          <>
            <div className="cmdp-input-wrap">
              <input
                ref={inputRef}
                className="cmdp-input"
                placeholder={
                  mode === 'branch-select'
                    ? 'Search branches...'
                    : mode === 'project-actions'
                      ? 'Search actions...'
                      : 'Search projects, actions, or type a command...'
                }
                value={query}
                onChange={(e) => { setQuery(e.target.value); setActiveIndex(0); }}
                onKeyDown={handleKeyDown}
              />
              {mode === 'search' && <kbd className="cmdp-shortcut">{shortcut}</kbd>}
            </div>

            <div className="cmdp-list" ref={listRef}>
              {grouped.totalItems === 0 ? (
                <div className="cmdp-empty">No results found</div>
              ) : (
                grouped.groups.map((group) => (
                  <div key={group.category}>
                    {/* Section header — only show when there's a query or multiple groups */}
                    {(query.trim() || grouped.groups.length > 1) && (
                      <div className="cmdp-section-header">{group.label}</div>
                    )}
                    {group.items.map((cmd) => (
                      <button
                        key={cmd.id}
                        className="cmdp-item"
                        data-active={cmd.flatIndex === activeIndex ? 'true' : undefined}
                        onClick={() => executeCommand(cmd)}
                        onMouseEnter={() => setActiveIndex(cmd.flatIndex)}
                      >
                        {cmd.icon && (
                          <span className="cmdp-item-icon">{cmd.icon}</span>
                        )}
                        <span className="cmdp-item-label">{cmd.label}</span>
                        {cmd.description && (
                          <span className="cmdp-item-desc">{cmd.description}</span>
                        )}
                        {loadingId === cmd.id ? (
                          <span className="cmdp-spinner" />
                        ) : (
                          <span className="cmdp-item-category">{cmd.category === 'recent' ? '' : cmd.category}</span>
                        )}
                        {mode === 'search' && cmd.category === 'project' && (
                          <svg className="cmdp-item-chevron" width={10} height={10} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                            <polyline points="9 6 15 12 9 18" />
                          </svg>
                        )}
                      </button>
                    ))}
                  </div>
                ))
              )}
            </div>
          </>
        )}

        <div className="cmdp-footer">
          <span><kbd>&#8593;&#8595;</kbd> navigate</span>
          <span><kbd>&#9166;</kbd> select</span>
          {mode !== 'search' && <span><kbd>&#9003;</kbd> back</span>}
          <span><kbd>esc</kbd> {mode !== 'search' ? 'back' : 'close'}</span>
        </div>
      </div>
    </div>
  );
}
