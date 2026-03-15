import { useGitDiff } from '../hooks/useDiff';

interface DiffViewerProps {
  path: string;
  file: string;
  staged?: boolean;
}

interface DiffHunk {
  header: string;
  lines: { type: 'add' | 'del' | 'context' | 'header'; text: string; oldNum?: number; newNum?: number }[];
}

function parseHunks(diff: string): DiffHunk[] {
  const hunks: DiffHunk[] = [];
  const lines = diff.split('\n');
  let current: DiffHunk | null = null;
  let oldLine = 0;
  let newLine = 0;

  for (const line of lines) {
    // Skip file headers
    if (line.startsWith('diff --git') || line.startsWith('index ') || line.startsWith('---') || line.startsWith('+++')) {
      continue;
    }

    if (line.startsWith('@@')) {
      const match = line.match(/@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@(.*)/);
      if (match) {
        oldLine = parseInt(match[1]);
        newLine = parseInt(match[2]);
        current = { header: line, lines: [] };
        hunks.push(current);
      }
      continue;
    }

    if (!current) continue;

    if (line.startsWith('+')) {
      current.lines.push({ type: 'add', text: line.slice(1), newNum: newLine });
      newLine++;
    } else if (line.startsWith('-')) {
      current.lines.push({ type: 'del', text: line.slice(1), oldNum: oldLine });
      oldLine++;
    } else {
      current.lines.push({ type: 'context', text: line.startsWith(' ') ? line.slice(1) : line, oldNum: oldLine, newNum: newLine });
      oldLine++;
      newLine++;
    }
  }

  return hunks;
}

export function DiffViewer({ path, file, staged }: DiffViewerProps) {
  const { data, isLoading } = useGitDiff(path, file, staged);

  if (isLoading) {
    return <div className="diff-loading">Loading diff...</div>;
  }

  if (!data?.diff) {
    return <div className="diff-empty">No changes</div>;
  }

  const hunks = parseHunks(data.diff);

  return (
    <div className="diff-viewer">
      {hunks.map((hunk, i) => (
        <div key={i} className="diff-hunk">
          <div className="diff-hunk-header">{hunk.header}</div>
          {hunk.lines.map((line, j) => (
            <div key={j} className={`diff-line diff-line-${line.type}`}>
              <span className="diff-line-num diff-line-num-old">
                {line.type !== 'add' ? line.oldNum : ''}
              </span>
              <span className="diff-line-num diff-line-num-new">
                {line.type !== 'del' ? line.newNum : ''}
              </span>
              <span className="diff-line-indicator">
                {line.type === 'add' ? '+' : line.type === 'del' ? '-' : ' '}
              </span>
              <span className="diff-line-text">{line.text || '\u00a0'}</span>
            </div>
          ))}
        </div>
      ))}
      {data.truncated && (
        <div className="diff-truncated">Diff truncated (too large to display fully)</div>
      )}
    </div>
  );
}
