import { useQuery } from '@tanstack/react-query';

interface SearchResult {
  project: string;
  projectId: string;
  projectType: string;
  projectPath: string;
  file: string;
  line: number;
  text: string;
}

interface SearchResponse {
  results: SearchResult[];
  total: number;
  truncated: boolean;
}

export function useCrossSearch(query: string, glob?: string) {
  return useQuery<SearchResponse>({
    queryKey: ['cross-search', query, glob],
    queryFn: async () => {
      const params = new URLSearchParams({ q: query });
      if (glob) params.set('glob', glob);
      const res = await fetch(`/api/actions/search?${params}`);
      return res.json();
    },
    enabled: query.length >= 2,
    staleTime: 30_000,
  });
}
