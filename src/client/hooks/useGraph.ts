import { useQuery } from '@tanstack/react-query';
import type { GraphData, SyncStatusEntry } from '../types/project';

export function useGraphRelationships(enabled = true) {
  return useQuery<GraphData>({
    queryKey: ['graph-relationships'],
    queryFn: async () => {
      const res = await fetch('/api/graph/relationships');
      if (!res.ok) return { nodes: [], edges: [] };
      return res.json();
    },
    enabled,
    staleTime: 60_000,
    refetchInterval: false,
  });
}

export function useSyncStatus(enabled = true) {
  return useQuery<SyncStatusEntry[]>({
    queryKey: ['graph-sync-status'],
    queryFn: async () => {
      const res = await fetch('/api/graph/sync-status');
      if (!res.ok) return [];
      return res.json();
    },
    enabled,
    staleTime: 60_000,
    refetchInterval: false,
  });
}
