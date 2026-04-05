export type ProjectType =
  | 'cep-plugin'
  | 'nextjs'
  | 'vite-react'
  | 'framer-plugin'
  | 'cloudflare-worker'
  | 'hono-server'
  | 'static-site'
  | 'node-package'
  | 'swift-app'
  | 'unknown';

export type ProjectStatus = 'active' | 'maintenance' | 'paused' | 'archived' | 'idea';

export type DeployTarget = 'vercel' | 'cloudflare' | 'netlify' | 'railway' | 'flyio' | 'none';

export interface Project {
  id: string;
  name: string;
  path: string;
  type: ProjectType;
  status: ProjectStatus;
  priority: number;
  tags: string[];
  description: string | null;

  techStack: string[];
  devCommand: string | null;
  detectedDevCommand: string | null;
  devPort: number | null;
  hasGit: boolean;
  gitBranch: string | null;
  gitDirty: boolean;
  gitDirtyCount: number;

  githubRepo: string | null;
  githubUrl: string | null;

  deployTarget: DeployTarget;
  deployUrl: string | null;

  hasSharedLib: boolean;
  lastModified: string;
  lastScanned: string;
  isFavorite: boolean;
  aliases: string[];
}

export interface GitHubInfo {
  repoName: string;
  isPrivate: boolean;
  primaryLanguage: string | null;
  updatedAt: string;
  openPrs: number;
  openIssues: number;
  lastCommitMessage: string | null;
  lastCommitDate: string | null;
}

export interface ProjectFilters {
  search?: string;
  type?: ProjectType;
  status?: ProjectStatus;
  tag?: string;
  sort?: 'priority' | 'name' | 'lastModified' | 'type' | 'custom';
}

export interface FilterPreset {
  id: string;
  name: string;
  filters: ProjectFilters & { showDirtyOnly?: boolean; techStack?: string[] };
  createdAt: string;
}

export interface StartupProfile {
  id: string;
  name: string;
  projectIds: string[];
  createdAt: string;
}

export const PROJECT_TYPE_LABELS: Record<ProjectType, string> = {
  'cep-plugin': 'CEP Plugin',
  'nextjs': 'Next.js',
  'vite-react': 'Vite + React',
  'framer-plugin': 'Framer Plugin',
  'cloudflare-worker': 'CF Worker',
  'hono-server': 'Hono Server',
  'static-site': 'Static Site',
  'node-package': 'Node Package',
  'swift-app': 'Swift App',
  'unknown': 'Unknown',
};

export const PROJECT_TYPE_COLORS: Record<ProjectType, string> = {
  'cep-plugin': '#a78bfa',
  'nextjs': '#f8f8f8',
  'vite-react': '#818cf8',
  'framer-plugin': '#60a5fa',
  'cloudflare-worker': '#fbbf24',
  'hono-server': '#f97316',
  'static-site': '#86efac',
  'node-package': '#f87171',
  'swift-app': '#ff6b6b',
  'unknown': '#6b7280',
};

export const STATUS_COLORS: Record<ProjectStatus, string> = {
  active: '#86efac',
  maintenance: '#fbbf24',
  paused: '#6b7280',
  archived: '#4b5563',
  idea: '#818cf8',
};

// ──────────────────────────────────────
// Priority Tiers
// ──────────────────────────────────────

export type PriorityTier = 1 | 2 | 3 | 4;

export const PRIORITY_LABELS: Record<PriorityTier, string> = {
  1: 'P1',
  2: 'P2',
  3: 'P3',
  4: 'P4',
};

export const PRIORITY_COLORS: Record<PriorityTier, string> = {
  1: '#f87171',
  2: '#fbbf24',
  3: '#60a5fa',
  4: '#6b7280',
};

export const PRIORITY_DESCRIPTIONS: Record<PriorityTier, string> = {
  1: 'Critical / Shipping',
  2: 'Active',
  3: 'Backlog',
  4: 'Low',
};

/** Map a raw priority number (from DB) to a display tier 1-4 */
export function priorityToTier(priority: number): PriorityTier {
  if (priority <= 1) return 1;
  if (priority <= 3) return 2;
  if (priority <= 6) return 3;
  return 4;
}

// ──────────────────────────────────────
// Port Manager types
// ──────────────────────────────────────

export interface PortEntry {
  port: number;
  pid: number;
  command: string;
  user: string;
  projectId: string | null;
  projectName: string | null;
}

export interface PortConflict {
  port: number;
  projects: { id: string; name: string }[];
  type: 'duplicate' | 'squatted';
  currentProcess: { command: string; pid: number } | null;
}

// ──────────────────────────────────────
// GitHub expanded types
// ──────────────────────────────────────

export interface GitHubWorkflowRun {
  databaseId: number;
  displayTitle: string;
  status: string;
  conclusion: string | null;
  event: string;
  headBranch: string;
  createdAt: string;
}

export interface GitHubIssue {
  number: number;
  title: string;
  state: string;
  createdAt: string;
  labels: { name: string; color: string }[];
  assignees: { login: string }[];
}

export interface GitHubPRDetail {
  number: number;
  title: string;
  state: string;
  updatedAt: string;
  reviewDecision: string;
  author: { login: string };
  headRefName: string;
}

export interface GitHubStatus {
  ci: 'pass' | 'fail' | 'running' | 'none';
  openPrs: number;
  openIssues: number;
  stars: number;
  forks: number;
}

// ──────────────────────────────────────
// Deploy types
// ──────────────────────────────────────

export interface DeploymentEntry {
  id: string;
  url: string;
  status: string;
  environment: string;
  createdAt: string;
}

export interface DeployStatus {
  target: DeployTarget;
  lastDeploy: DeploymentEntry | null;
  deployUrl: string | null;
  cliMissing?: boolean;
}

export interface DeployHealth {
  url: string | null;
  healthy: boolean;
  status: number;
  responseTime: number;
}

// ──────────────────────────────────────
// Dependency Graph types
// ──────────────────────────────────────

export interface GraphNode {
  id: string;
  name: string;
  type: string;
  status: string;
  isMaster: boolean;
  hasSharedLib: boolean;
}

export interface GraphEdge {
  source: string;
  target: string;
  type: 'shared-lib' | 'shared-deps';
  label?: string;
}

export interface GraphData {
  nodes: GraphNode[];
  edges: GraphEdge[];
}

export interface SyncStatusEntry {
  projectId: string;
  projectName: string;
  libraryName: string;
  divergentFiles: number;
  isFresh: boolean;
}

// Docker
export interface DockerContainer {
  id: string;
  name: string;
  image: string;
  state: 'running' | 'exited' | 'paused' | 'created';
  status: string;
  ports: string;
  created: string;
  projectId: string | null;
  projectName: string | null;
  composeProject: string | null;
  composeService: string | null;
}

export interface DockerStatus {
  available: boolean;
  containers: DockerContainer[];
}

export interface ComposeService {
  name: string;
  status: string;
  state: string;
  ports: string;
}

// ──────────────────────────────────────
// Insights / Analytics types
// ──────────────────────────────────────

export interface Snapshot {
  id: number;
  capturedAt: string;
  totalProjects: number;
  dirtyRepos: number;
  totalDirtyFiles: number;
  totalDependencies: number;
  typeBreakdown: Record<string, number>;
  statusBreakdown: Record<string, number>;
}

export type InsightsRange = '24h' | '7d' | '30d' | '90d';
