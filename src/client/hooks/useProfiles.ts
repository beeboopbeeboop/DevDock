import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import type { StartupProfile } from '../../shared/types.js';

const API = '/api/profiles';

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

export function useProfiles() {
  return useQuery<StartupProfile[]>({
    queryKey: ['profiles'],
    queryFn: () => fetchJson(API),
  });
}

export function useCreateProfile() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ name, projectIds }: { name: string; projectIds: string[] }) =>
      postJson(API, { name, projectIds }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['profiles'] }),
  });
}

export function useUpdateProfile() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, name, projectIds }: { id: string; name: string; projectIds: string[] }) =>
      fetchJson(`${API}/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, projectIds }),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['profiles'] }),
  });
}

export function useDeleteProfile() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      fetchJson(`${API}/${id}`, { method: 'DELETE' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['profiles'] }),
  });
}

export function useStartProfile() {
  return useMutation({
    mutationFn: (id: string) =>
      postJson(`${API}/${id}/start`, {}),
  });
}

export function useStopProfile() {
  return useMutation({
    mutationFn: (id: string) =>
      postJson(`${API}/${id}/stop`, {}),
  });
}
