import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import type { Project, ProjectFilters } from '../types/project';

const API = '/api';

async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, init);
  if (!res.ok) throw new Error(`${res.status}: ${res.statusText}`);
  return res.json();
}

function postJson(url: string, body: Record<string, unknown>) {
  return fetchJson(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

export function useProjects(filters: ProjectFilters = {}) {
  const params = new URLSearchParams();
  if (filters.search) params.set('search', filters.search);
  if (filters.type) params.set('type', filters.type);
  if (filters.status) params.set('status', filters.status);
  if (filters.sort) params.set('sort', filters.sort);

  return useQuery<Project[]>({
    queryKey: ['projects', filters],
    queryFn: () => fetchJson(`${API}/projects?${params}`),
  });
}

export function useScan() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => fetchJson<{ count: number; duration: number }>(`${API}/scan`, { method: 'POST' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['projects'] }),
  });
}

export function useReorder() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (ids: string[]) => postJson(`${API}/projects/reorder`, { ids }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['projects'] }),
  });
}

export function useToggleFavorite() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (projectId: string) =>
      fetchJson(`${API}/projects/${projectId}/favorite`, { method: 'POST' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['projects'] }),
  });
}

export function useProjectActions() {
  return {
    openEditor: (path: string, editor: string = 'vscode') =>
      postJson(`${API}/actions/open-editor`, { path, editor }),
    openTerminal: (path: string) =>
      postJson(`${API}/actions/open-terminal`, { path }),
    openClaudeTerminal: (path: string) =>
      postJson(`${API}/actions/open-claude-terminal`, { path }),
    openFinder: (path: string) =>
      postJson(`${API}/actions/open-finder`, { path }),
    startDev: (path: string, command: string) =>
      postJson(`${API}/actions/start-dev`, { path, command }),
    openUrl: (url: string) =>
      postJson(`${API}/actions/open-url`, { url }),
  };
}
