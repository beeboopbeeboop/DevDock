import { useState, useRef, useCallback, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

interface TooltipProps {
  content: string;
  children: ReactNode;
  side?: 'top' | 'bottom' | 'auto';
  delay?: number;
}

export function Tooltip({ content, children, side = 'auto', delay = 400 }: TooltipProps) {
  const [visible, setVisible] = useState(false);
  const [coords, setCoords] = useState<{ x: number; y: number; side: 'top' | 'bottom' }>({ x: 0, y: 0, side: 'top' });
  const timeout = useRef<ReturnType<typeof setTimeout>>(null);
  const wrapRef = useRef<HTMLSpanElement>(null);

  const show = useCallback(() => {
    timeout.current = setTimeout(() => {
      if (!wrapRef.current) return;
      const rect = wrapRef.current.getBoundingClientRect();
      const resolvedSide = side === 'auto'
        ? (rect.top < 60 ? 'bottom' : 'top')
        : side;

      setCoords({
        x: rect.left + rect.width / 2,
        y: resolvedSide === 'top' ? rect.top - 6 : rect.bottom + 6,
        side: resolvedSide,
      });
      setVisible(true);
    }, delay);
  }, [side, delay]);

  const hide = useCallback(() => {
    if (timeout.current) clearTimeout(timeout.current);
    setVisible(false);
  }, []);

  return (
    <span
      ref={wrapRef}
      className="tooltip-wrap"
      onMouseEnter={show}
      onMouseLeave={hide}
      style={{ position: 'relative', display: 'inline-flex' }}
    >
      {children}
      {visible && createPortal(
        <span
          className={`tooltip-tip tooltip-${coords.side}`}
          style={{
            position: 'fixed',
            left: coords.x,
            transform: coords.side === 'top'
              ? 'translate(-50%, -100%)'
              : 'translateX(-50%)',
            top: coords.y,
            background: 'var(--p-bg-elevated)',
            border: '1px solid var(--p-border-hover)',
            color: 'var(--p-text)',
            padding: '4px 8px',
            borderRadius: 'var(--p-radius-sm)',
            fontSize: 11,
            whiteSpace: 'nowrap',
            maxWidth: 220,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            pointerEvents: 'none',
            zIndex: 1000,
            boxShadow: 'var(--p-shadow-dropdown)',
            animation: 'tooltip-in 120ms var(--p-ease)',
          }}
        >
          {content}
        </span>,
        document.body
      )}
    </span>
  );
}
