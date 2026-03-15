import { useState, useEffect, useCallback, type ReactNode } from 'react';

interface MenuItem {
  label: string;
  icon?: ReactNode;
  onClick: () => void;
  danger?: boolean;
  disabled?: boolean;
  separator?: boolean;
}

interface ContextMenuProps {
  items: MenuItem[];
  children: ReactNode;
}

export function ContextMenu({ items, children }: ContextMenuProps) {
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null);

  const handleContext = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setPos({ x: e.clientX, y: e.clientY });
  }, []);

  const close = useCallback(() => setPos(null), []);

  useEffect(() => {
    if (!pos) return;
    const handler = () => close();
    window.addEventListener('click', handler);
    window.addEventListener('contextmenu', handler);
    window.addEventListener('scroll', handler, true);
    return () => {
      window.removeEventListener('click', handler);
      window.removeEventListener('contextmenu', handler);
      window.removeEventListener('scroll', handler, true);
    };
  }, [pos, close]);

  return (
    <>
      <div onContextMenu={handleContext} style={{ display: 'contents' }} data-context-open={pos ? 'true' : undefined}>
        {children}
      </div>
      {pos && (
        <div
          className="context-menu"
          style={{
            position: 'fixed',
            left: pos.x,
            top: pos.y,
            zIndex: 700,
          }}
          onClick={(e) => e.stopPropagation()}
        >
          {items.map((item, i) =>
            item.separator ? (
              <div key={i} className="context-menu-sep" />
            ) : (
              <button
                key={i}
                className={`context-menu-item ${item.danger ? 'context-menu-danger' : ''}`}
                onClick={() => { item.onClick(); close(); }}
                disabled={item.disabled}
              >
                {item.icon && <span className="context-menu-icon">{item.icon}</span>}
                {item.label}
              </button>
            ),
          )}
        </div>
      )}
    </>
  );
}
