import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import type { DockerStatus, ComposeService } from '../../shared/types';

export function useDockerContainers() {
  return useQuery<DockerStatus>({
    queryKey: ['docker-containers'],
    queryFn: async () => {
      const res = await fetch('/api/docker/containers');
      if (!res.ok) return { available: false, containers: [] };
      return res.json();
    },
    refetchInterval: 8000,
    staleTime: 5000,
  });
}

export function useComposeServices(path: string | null) {
  return useQuery<{ available: boolean; services: ComposeService[] }>({
    queryKey: ['compose-services', path],
    queryFn: async () => {
      const res = await fetch(`/api/docker/compose-services?path=${encodeURIComponent(path!)}`);
      if (!res.ok) return { available: false, services: [] };
      return res.json();
    },
    enabled: !!path,
    refetchInterval: 8000,
    staleTime: 5000,
  });
}

export function useDockerAction() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async ({ action, path, containerId }: {
      action: 'compose-up' | 'compose-down' | 'compose-restart' | 'container-stop' | 'container-restart';
      path?: string;
      containerId?: string;
    }) => {
      const body = action.startsWith('compose')
        ? { path }
        : { containerId };
      const res = await fetch(`/api/docker/${action}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      return res.json();
    },
    onSuccess: () => {
      // Refetch container status after any action
      setTimeout(() => {
        qc.invalidateQueries({ queryKey: ['docker-containers'] });
        qc.invalidateQueries({ queryKey: ['compose-services'] });
      }, 1000);
    },
  });
}

export function useDockerLogs() {
  return {
    start: async (containerId: string) => {
      const res = await fetch('/api/docker/logs-start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ containerId }),
      });
      return res.json() as Promise<{ ok: boolean; key: string }>;
    },
    stop: async (containerId: string) => {
      await fetch('/api/docker/logs-stop', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ containerId }),
      });
    },
  };
}
