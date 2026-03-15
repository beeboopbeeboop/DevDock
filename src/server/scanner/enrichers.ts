import { statSync } from 'fs';
import { join } from 'path';

interface GitInfo {
  hasGit: boolean;
  gitBranch: string | null;
  gitDirty: boolean;
  gitDirtyCount: number;
  githubRepo: string | null;
  githubUrl: string | null;
}

async function runCmd(cmd: string[], cwd: string): Promise<string> {
  try {
    const proc = Bun.spawn(cmd, { cwd, stdout: 'pipe', stderr: 'pipe' });
    const output = await new Response(proc.stdout).text();
    await proc.exited;
    return output.trim();
  } catch {
    return '';
  }
}

export async function getGitInfo(dir: string): Promise<GitInfo> {
  const result: GitInfo = {
    hasGit: false,
    gitBranch: null,
    gitDirty: false,
    gitDirtyCount: 0,
    githubRepo: null,
    githubUrl: null,
  };

  // Check if it's a git repo
  const branch = await runCmd(['git', 'rev-parse', '--abbrev-ref', 'HEAD'], dir);
  if (!branch) return result;

  result.hasGit = true;
  result.gitBranch = branch;

  // Check for dirty state
  const status = await runCmd(['git', 'status', '--porcelain'], dir);
  const statusLines = status ? status.split('\n').filter(Boolean) : [];
  result.gitDirty = statusLines.length > 0;
  result.gitDirtyCount = statusLines.length;

  // Get GitHub remote
  const remote = await runCmd(['git', 'remote', 'get-url', 'origin'], dir);
  if (remote) {
    // Parse GitHub URL from various formats:
    // https://github.com/owner/repo.git
    // git@github.com:owner/repo.git
    const httpsMatch = remote.match(/github\.com\/([^/]+\/[^/.]+)/);
    const sshMatch = remote.match(/github\.com:([^/]+\/[^/.]+)/);
    const match = httpsMatch || sshMatch;
    if (match) {
      result.githubRepo = match[1].replace(/\.git$/, '');
      result.githubUrl = `https://github.com/${result.githubRepo}`;
    }
  }

  return result;
}

export function getLastModified(dir: string): string {
  try {
    // Use the directory's own mtime as a simple heuristic
    const stat = statSync(dir);
    return stat.mtime.toISOString();
  } catch {
    return new Date().toISOString();
  }
}

export function hasSubdir(dir: string, name: string): boolean {
  try {
    const stat = statSync(join(dir, name));
    return stat.isDirectory();
  } catch {
    return false;
  }
}
