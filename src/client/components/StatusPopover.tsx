import { useState, useRef, useEffect } from 'react';
import { STATUS_COLORS } from '../types/project';
import type { ProjectStatus } from '../types/project';

const ALL_STATUSES: ProjectStatus[] = ['active', 'maintenance', 'paused', 'archived', 'idea'];

interface StatusPopoverProps {
  currentStatus: ProjectStatus;
  onChangeStatus: (status: ProjectStatus) => void;
  /** 'dot' renders a small colored circle (for cards), 'badge' renders a pill (for detail panel) */
  triggerStyle?: 'dot' | 'badge';
}

export function StatusPopover({ currentStatus, onChangeStatus, triggerStyle = 'dot' }: StatusPopoverProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    window.addEventListener('mousedown', handler);
    return () => window.removeEventListener('mousedown', handler);
  }, [open]);

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      {triggerStyle === 'dot' ? (
        <div
          className="project-status-dot"
          style={{ background: STATUS_COLORS[currentStatus], cursor: 'pointer' }}
          onClick={(e) => { e.stopPropagation(); setOpen((v) => !v); }}
        />
      ) : (
        <button
          className="p-badge"
          style={{
            background: `${STATUS_COLORS[currentStatus]}20`,
            color: STATUS_COLORS[currentStatus],
            cursor: 'pointer',
            border: 'none',
          }}
          onClick={(e) => { e.stopPropagation(); setOpen((v) => !v); }}
        >
          {currentStatus}
        </button>
      )}

      {open && (
        <div className="status-popover" style={{ right: 0, top: '100%', marginTop: 4 }}>
          {ALL_STATUSES.map((status) => (
            <button
              key={status}
              className="status-popover-option"
              data-selected={currentStatus === status ? 'true' : undefined}
              onClick={(e) => {
                e.stopPropagation();
                onChangeStatus(status);
                setOpen(false);
              }}
            >
              <span style={{ width: 8, height: 8, borderRadius: '50%', background: STATUS_COLORS[status], flexShrink: 0 }} />
              {status.charAt(0).toUpperCase() + status.slice(1)}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
