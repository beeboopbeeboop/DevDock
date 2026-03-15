import { useQuery } from '@tanstack/react-query';
import type { Snapshot, InsightsRange } from '../../shared/types';

async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${res.status}: ${res.statusText}`);
  return res.json();
}

export function useInsights(range: InsightsRange = '7d') {
  return useQuery<Snapshot[]>({
    queryKey: ['insights', range],
    queryFn: () => fetchJson(`/api/insights?range=${range}`),
    staleTime: 60_000,
  });
}

export function useLatestSnapshot() {
  return useQuery<Snapshot | null>({
    queryKey: ['insights', 'latest'],
    queryFn: () => fetchJson(`/api/insights/latest`),
    staleTime: 60_000,
  });
}
