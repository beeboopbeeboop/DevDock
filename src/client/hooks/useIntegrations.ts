import { useQuery } from '@tanstack/react-query';

export interface IntegrationStatus {
  id: string;
  name: string;
  cliInstalled: boolean;
  authenticated: boolean;
  account?: string;
}

export function useIntegrations() {
  return useQuery<IntegrationStatus[]>({
    queryKey: ['integrations'],
    queryFn: async () => {
      const res = await fetch('/api/actions/integrations/status');
      if (!res.ok) throw new Error('Failed to fetch integrations');
      return res.json();
    },
    staleTime: 30_000,
  });
}
