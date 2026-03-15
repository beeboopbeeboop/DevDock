import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import type { DeployStatus, DeploymentEntry, DeployHealth } from '../types/project';

export function useDeployStatus(projectId: string | null, enabled = true) {
  return useQuery<DeployStatus>({
    queryKey: ['deploy-status', projectId],
    queryFn: async () => {
      const res = await fetch(`/api/deploy/${projectId}/status`);
      return res.json();
    },
    enabled: enabled && !!projectId,
    staleTime: 30_000,
  });
}

export function useDeployHistory(projectId: string | null, enabled = true) {
  return useQuery<DeploymentEntry[]>({
    queryKey: ['deploy-history', projectId],
    queryFn: async () => {
      const res = await fetch(`/api/deploy/${projectId}/history`);
      return res.json();
    },
    enabled: enabled && !!projectId,
    staleTime: 30_000,
  });
}

export function useDeployHealth(projectId: string | null, enabled = true) {
  return useQuery<DeployHealth>({
    queryKey: ['deploy-health', projectId],
    queryFn: async () => {
      const res = await fetch(`/api/deploy/${projectId}/health`);
      return res.json();
    },
    enabled: enabled && !!projectId,
    staleTime: 60_000,
  });
}

export function useTriggerDeploy() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ projectId, environment }: { projectId: string; environment: string }) => {
      const res = await fetch(`/api/deploy/${projectId}/trigger`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ environment }),
      });
      return res.json();
    },
    onSuccess: (_, { projectId }) => {
      qc.invalidateQueries({ queryKey: ['deploy-status', projectId] });
      qc.invalidateQueries({ queryKey: ['deploy-history', projectId] });
    },
  });
}
