import { useQuery } from '@tanstack/react-query';
import type { GitHubWorkflowRun, GitHubIssue, GitHubPRDetail, GitHubStatus } from '../types/project';

function parseGhRepo(repo: string | null): { owner: string; repo: string } | null {
  if (!repo) return null;
  const parts = repo.split('/');
  if (parts.length !== 2) return null;
  return { owner: parts[0], repo: parts[1] };
}

export function useGitHubActions(githubRepo: string | null, enabled = true) {
  const parsed = parseGhRepo(githubRepo);
  return useQuery<GitHubWorkflowRun[]>({
    queryKey: ['gh-actions', githubRepo],
    queryFn: async () => {
      if (!parsed) return [];
      const res = await fetch(`/api/github/repo/${parsed.owner}/${parsed.repo}/actions`);
      return res.json();
    },
    enabled: enabled && !!parsed,
    staleTime: 30_000,
  });
}

export function useGitHubIssues(githubRepo: string | null, enabled = true) {
  const parsed = parseGhRepo(githubRepo);
  return useQuery<GitHubIssue[]>({
    queryKey: ['gh-issues', githubRepo],
    queryFn: async () => {
      if (!parsed) return [];
      const res = await fetch(`/api/github/repo/${parsed.owner}/${parsed.repo}/issues`);
      return res.json();
    },
    enabled: enabled && !!parsed,
    staleTime: 30_000,
  });
}

export function useGitHubPRsDetail(githubRepo: string | null, enabled = true) {
  const parsed = parseGhRepo(githubRepo);
  return useQuery<GitHubPRDetail[]>({
    queryKey: ['gh-prs-detail', githubRepo],
    queryFn: async () => {
      if (!parsed) return [];
      const res = await fetch(`/api/github/repo/${parsed.owner}/${parsed.repo}/prs-detail`);
      return res.json();
    },
    enabled: enabled && !!parsed,
    staleTime: 30_000,
  });
}

export function useGitHubStatus(githubRepo: string | null, enabled = true) {
  const parsed = parseGhRepo(githubRepo);
  return useQuery<GitHubStatus>({
    queryKey: ['gh-status', githubRepo],
    queryFn: async () => {
      if (!parsed) return { ci: 'none' as const, openPrs: 0, openIssues: 0 };
      const res = await fetch(`/api/github/repo/${parsed.owner}/${parsed.repo}/status`);
      return res.json();
    },
    enabled: enabled && !!parsed,
    staleTime: 60_000,
  });
}
