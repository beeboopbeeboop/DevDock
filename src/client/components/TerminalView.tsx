import { useEffect, useRef, useState } from 'react';

// Basic ANSI color map (30-37 foreground)
const ANSI_COLORS: Record<number, string> = {
  30: '#4a4a4a', 31: '#ef4444', 32: '#22c55e', 33: '#eab308',
  34: '#3b82f6', 35: '#a855f7', 36: '#06b6d4', 37: '#e5e5e5',
  90: '#737373', 91: '#f87171', 92: '#4ade80', 93: '#facc15',
  94: '#60a5fa', 95: '#c084fc', 96: '#22d3ee', 97: '#ffffff',
};

function parseAnsi(text: string): { text: string; color?: string }[] {
  const parts: { text: string; color?: string }[] = [];
  // Strip unknown escape sequences, keep basic colors
  const regex = /\x1b\[([0-9;]*)m/g;
  let lastIndex = 0;
  let currentColor: string | undefined;
  let match;

  // Strip carriage returns and other control sequences
  const cleaned = text.replace(/\x1b\[[0-9;]*[A-Za-z]/g, (m) => {
    // Keep color codes (ending with 'm'), strip everything else
    return m.endsWith('m') ? m : '';
  }).replace(/\r/g, '');

  const colorRegex = /\x1b\[([0-9;]*)m/g;
  while ((match = colorRegex.exec(cleaned)) !== null) {
    if (match.index > lastIndex) {
      parts.push({ text: cleaned.slice(lastIndex, match.index), color: currentColor });
    }
    const codes = match[1].split(';').map(Number);
    for (const code of codes) {
      if (code === 0 || code === 39) currentColor = undefined;
      else if (ANSI_COLORS[code]) currentColor = ANSI_COLORS[code];
      else if (code === 1) { /* bold — skip */ }
    }
    lastIndex = match.index + match[0].length;
  }

  if (lastIndex < cleaned.length) {
    parts.push({ text: cleaned.slice(lastIndex), color: currentColor });
  }

  return parts.length > 0 ? parts : [{ text: cleaned }];
}

interface TerminalViewProps {
  lines: string[];
  isConnected: boolean;
}

export function TerminalView({ lines, isConnected }: TerminalViewProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [autoScroll, setAutoScroll] = useState(true);

  // Auto-scroll to bottom
  useEffect(() => {
    if (autoScroll && containerRef.current) {
      containerRef.current.scrollTop = containerRef.current.scrollHeight;
    }
  }, [lines, autoScroll]);

  // Detect user scroll
  const handleScroll = () => {
    if (!containerRef.current) return;
    const { scrollTop, scrollHeight, clientHeight } = containerRef.current;
    const atBottom = scrollHeight - scrollTop - clientHeight < 30;
    setAutoScroll(atBottom);
  };

  return (
    <div className="terminal-view" ref={containerRef} onScroll={handleScroll}>
      <div className="terminal-status-dot" data-connected={isConnected ? 'true' : undefined} />
      {lines.map((line, i) => (
        <div key={i} className="terminal-line">
          {parseAnsi(line).map((part, j) => (
            <span key={j} style={part.color ? { color: part.color } : undefined}>
              {part.text}
            </span>
          ))}
        </div>
      ))}
      {!autoScroll && (
        <button
          className="terminal-scroll-btn"
          onClick={() => {
            setAutoScroll(true);
            containerRef.current?.scrollTo({ top: containerRef.current.scrollHeight, behavior: 'smooth' });
          }}
        >
          ↓ Scroll to bottom
        </button>
      )}
    </div>
  );
}
