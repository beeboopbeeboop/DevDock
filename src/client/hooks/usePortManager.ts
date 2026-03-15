import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import type { PortEntry, PortConflict } from '../types/project';

export function useAllPorts() {
  return useQuery<PortEntry[]>({
    queryKey: ['ports-all'],
    queryFn: async () => {
      const res = await fetch('/api/ports/all');
      if (!res.ok) return [];
      return res.json();
    },
    staleTime: 30_000,
    refetchInterval: false,
  });
}

export function usePortConflicts() {
  return useQuery<PortConflict[]>({
    queryKey: ['port-conflicts'],
    queryFn: async () => {
      const res = await fetch('/api/ports/conflicts');
      if (!res.ok) return [];
      return res.json();
    },
    staleTime: 30_000,
    refetchInterval: false,
  });
}

export function usePortSuggestions(range = '5100-5199', count = 5, enabled = false) {
  return useQuery<number[]>({
    queryKey: ['port-suggestions', range, count],
    queryFn: async () => {
      const res = await fetch(`/api/ports/suggestions?range=${range}&count=${count}`);
      return res.json();
    },
    enabled,
  });
}

export function useKillPort() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (port: number) => {
      const res = await fetch('/api/actions/port-kill', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ port }),
      });
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['ports-all'] });
      qc.invalidateQueries({ queryKey: ['port-status'] });
    },
  });
}
