import { useQuery } from '@tanstack/react-query';

interface DiffResult {
  diff: string;
  truncated: boolean;
}

export function useGitDiff(path: string, file?: string, staged?: boolean) {
  const params = new URLSearchParams({ path });
  if (file) params.set('file', file);
  if (staged) params.set('staged', 'true');

  return useQuery<DiffResult>({
    queryKey: ['git-diff', path, file, staged],
    queryFn: async () => {
      const res = await fetch(`/api/actions/git-diff?${params}`);
      if (!res.ok) return { diff: '', truncated: false };
      return res.json();
    },
    enabled: !!path && !!file,
    staleTime: 10_000,
  });
}
