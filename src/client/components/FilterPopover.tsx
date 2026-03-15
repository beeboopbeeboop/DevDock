import { useState, useEffect, useRef } from 'react';
import type { ProjectType, ProjectStatus } from '../types/project';
import { PROJECT_TYPE_LABELS, PROJECT_TYPE_COLORS, STATUS_COLORS } from '../types/project';
import { IconFilter } from './Icons';

const ALL_TYPES: ProjectType[] = [
  'cep-plugin', 'nextjs', 'vite-react', 'framer-plugin',
  'hono-server', 'cloudflare-worker', 'static-site', 'node-package',
  'swift-app', 'unknown',
];

const ALL_STATUSES: ProjectStatus[] = ['active', 'maintenance', 'paused', 'archived', 'idea'];

interface FilterPopoverProps {
  activeType?: ProjectType;
  activeStatus?: ProjectStatus;
  onFilterType: (type?: ProjectType) => void;
  onFilterStatus: (status?: ProjectStatus) => void;
  typeCounts: Record<string, number>;
  statusCounts: Record<string, number>;
}

export function FilterPopover({
  activeType,
  activeStatus,
  onFilterType,
  onFilterStatus,
  typeCounts,
  statusCounts,
}: FilterPopoverProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const activeCount = (activeType ? 1 : 0) + (activeStatus ? 1 : 0);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  return (
    <div className="filter-popover-wrap" ref={ref}>
      <button
        className={`p-btn p-btn-ghost p-btn-sm filter-trigger ${activeCount > 0 ? 'filter-trigger-active' : ''}`}
        onClick={() => setOpen(!open)}
      >
        <IconFilter size={13} />
        Filter
        {activeCount > 0 && (
          <span className="filter-badge">{activeCount}</span>
        )}
      </button>

      {open && (
        <div className="filter-popover">
          <div className="filter-popover-section">
            <div className="filter-popover-title">Type</div>
            <div className="filter-popover-options">
              {ALL_TYPES.map((type) => {
                const count = typeCounts[type] || 0;
                if (count === 0) return null;
                return (
                  <button
                    key={type}
                    className="filter-popover-option"
                    data-selected={activeType === type ? 'true' : undefined}
                    onClick={() => {
                      onFilterType(activeType === type ? undefined : type);
                    }}
                  >
                    <span
                      style={{
                        width: 8, height: 8, borderRadius: '50%',
                        background: PROJECT_TYPE_COLORS[type], flexShrink: 0,
                      }}
                    />
                    <span style={{ flex: 1 }}>{PROJECT_TYPE_LABELS[type]}</span>
                    <span style={{ fontSize: 10, color: 'var(--p-text-muted)' }}>{count}</span>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="filter-popover-section">
            <div className="filter-popover-title">Status</div>
            <div className="filter-popover-options">
              {ALL_STATUSES.map((status) => {
                const count = statusCounts[status] || 0;
                if (count === 0) return null;
                return (
                  <button
                    key={status}
                    className="filter-popover-option"
                    data-selected={activeStatus === status ? 'true' : undefined}
                    onClick={() => {
                      onFilterStatus(activeStatus === status ? undefined : status);
                    }}
                  >
                    <span
                      style={{
                        width: 8, height: 8, borderRadius: '50%',
                        background: STATUS_COLORS[status], flexShrink: 0,
                      }}
                    />
                    <span style={{ flex: 1 }}>
                      {status.charAt(0).toUpperCase() + status.slice(1)}
                    </span>
                    <span style={{ fontSize: 10, color: 'var(--p-text-muted)' }}>{count}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {activeCount > 0 && (
            <div className="filter-popover-footer">
              <button
                className="p-btn p-btn-ghost p-btn-sm"
                onClick={() => {
                  onFilterType(undefined);
                  onFilterStatus(undefined);
                }}
                style={{ width: '100%', justifyContent: 'center', color: 'var(--p-accent)' }}
              >
                Clear all filters
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
