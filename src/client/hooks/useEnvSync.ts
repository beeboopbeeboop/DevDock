import { useQuery } from '@tanstack/react-query';

const API = '/api';

async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${res.status}: ${res.statusText}`);
  return res.json();
}

export interface EnvIssue {
  projectId: string;
  projectName: string;
  issue: string;
  severity: 'warning' | 'error' | 'info';
  detail: string;
}

export interface EnvAuditResult {
  issues: EnvIssue[];
  totalProjects: number;
  projectsWithIssues: number;
}

export interface CrossSyncResult {
  keys: string[];
  projects: { id: string; name: string }[];
  matrix: Record<string, Record<string, 'present' | 'empty' | 'missing'>>;
}

export function useEnvAudit() {
  return useQuery<EnvAuditResult>({
    queryKey: ['env-audit'],
    queryFn: () => fetchJson(`${API}/env/audit`),
    staleTime: 60_000,
  });
}

export function useEnvCrossSync() {
  return useQuery<CrossSyncResult>({
    queryKey: ['env-cross-sync'],
    queryFn: () => fetchJson(`${API}/env/cross-sync`),
    staleTime: 60_000,
  });
}
