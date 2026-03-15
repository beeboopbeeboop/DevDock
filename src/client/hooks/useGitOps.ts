import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';

interface FileChange {
  file: string;
  status: string;
}

interface GitStatus {
  staged: FileChange[];
  unstaged: FileChange[];
}

interface GitBranches {
  current: string;
  branches: { name: string; isRemote: boolean; isCurrent: boolean }[];
}

export function useGitStatus(path: string, enabled = true) {
  return useQuery<GitStatus>({
    queryKey: ['git-status', path],
    queryFn: async () => {
      const res = await fetch(`/api/actions/git-status?path=${encodeURIComponent(path)}`);
      if (!res.ok) return { staged: [], unstaged: [] };
      return res.json();
    },
    enabled,
    refetchInterval: 5000,
  });
}

export function useGitBranches(path: string, enabled = false) {
  return useQuery<GitBranches>({
    queryKey: ['git-branches', path],
    queryFn: async () => {
      const res = await fetch(`/api/actions/git-branches?path=${encodeURIComponent(path)}`);
      if (!res.ok) return { current: '', branches: [] };
      return res.json();
    },
    enabled,
    staleTime: 30_000,
  });
}

export function useGitStage(path: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ files, unstage }: { files: string[]; unstage?: boolean }) => {
      const res = await fetch('/api/actions/git-stage', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path, files, unstage }),
      });
      return res.json();
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['git-status', path] }),
  });
}

export function useGitCommit(path: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (message: string) => {
      const res = await fetch('/api/actions/git-commit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path, message }),
      });
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['git-status', path] });
      qc.invalidateQueries({ queryKey: ['git-log'] });
    },
  });
}

export function useGitPush(path: string) {
  return useMutation({
    mutationFn: async () => {
      const res = await fetch('/api/actions/git-push', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path }),
      });
      return res.json();
    },
  });
}

export function useGitPull(path: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const res = await fetch('/api/actions/git-pull', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path }),
      });
      return res.json();
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['git-status', path] }),
  });
}

export function useGitCheckout(path: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ branch, create }: { branch: string; create?: boolean }) => {
      const res = await fetch('/api/actions/git-checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path, branch, create }),
      });
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['git-status', path] });
      qc.invalidateQueries({ queryKey: ['git-branches', path] });
    },
  });
}
