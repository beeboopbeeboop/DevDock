import { useState, useEffect, useCallback, useRef, type ReactNode } from 'react';

// Global close signal — when any context menu opens, it fires this to close all others
let globalCloseCallback: (() => void) | null = null;

export interface MenuItem {
  label: string;
  icon?: ReactNode;
  onClick: () => void;
  danger?: boolean;
  disabled?: boolean;
  separator?: boolean;
  children?: MenuItem[];
}

interface ContextMenuProps {
  items: MenuItem[];
  children: ReactNode;
}

function stripEdgeSeparators(items: MenuItem[]): MenuItem[] {
  const result: MenuItem[] = [];
  for (const item of items) {
    if (item.separator) {
      if (result.length === 0 || result[result.length - 1].separator) continue;
      result.push(item);
    } else {
      result.push(item);
    }
  }
  if (result.length > 0 && result[result.length - 1].separator) {
    result.pop();
  }
  return result;
}

function SubMenu({ items, onClose }: { items: MenuItem[]; onClose: () => void }) {
  const [focused, setFocused] = useState(-1);
  const actionItems = items.filter((i) => !i.separator);

  return (
    <div className="context-menu context-menu-submenu" onClick={(e) => e.stopPropagation()}>
      {items.map((item, i) =>
        item.separator ? (
          <div key={i} className="context-menu-sep" />
        ) : (
          <button
            key={i}
            className={`context-menu-item${focused === actionItems.indexOf(item) ? ' context-menu-item-focused' : ''}${item.danger ? ' context-menu-danger' : ''}`}
            onClick={() => { item.onClick(); onClose(); }}
            disabled={item.disabled}
            onMouseEnter={() => setFocused(actionItems.indexOf(item))}
            onMouseLeave={() => setFocused(-1)}
          >
            {item.icon && <span className="context-menu-icon">{item.icon}</span>}
            {item.label}
          </button>
        ),
      )}
    </div>
  );
}

export function ContextMenu({ items, children }: ContextMenuProps) {
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null);
  const [adjusted, setAdjusted] = useState<{ x: number; y: number } | null>(null);
  const [focused, setFocused] = useState(-1);
  const [openSubmenu, setOpenSubmenu] = useState(-1);
  const menuRef = useRef<HTMLDivElement>(null);
  const submenuTimerRef = useRef<ReturnType<typeof setTimeout>>();

  const close = useCallback(() => {
    setPos(null);
    setAdjusted(null);
    setFocused(-1);
    setOpenSubmenu(-1);
  }, []);

  const handleContext = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (globalCloseCallback) globalCloseCallback();
    setPos({ x: e.clientX, y: e.clientY });
    setAdjusted(null);
    setFocused(-1);
    setOpenSubmenu(-1);
  }, []);

  // Register/unregister as the active context menu
  useEffect(() => {
    if (!pos) return;
    globalCloseCallback = close;
    return () => {
      if (globalCloseCallback === close) globalCloseCallback = null;
    };
  }, [pos, close]);

  // Adjust position after render to keep menu on screen
  useEffect(() => {
    if (!pos || !menuRef.current) return;
    const el = menuRef.current;
    const rect = el.getBoundingClientRect();
    let { x, y } = pos;

    if (y + rect.height > window.innerHeight - 8) {
      y = Math.max(8, window.innerHeight - rect.height - 8);
    }
    if (x + rect.width > window.innerWidth - 8) {
      x = Math.max(8, x - rect.width);
    }

    if (x !== pos.x || y !== pos.y) {
      setAdjusted({ x, y });
    }
  }, [pos]);

  // Close on click/contextmenu/scroll
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

  const finalPos = adjusted || pos;
  const cleanItems = stripEdgeSeparators(items);
  // Actionable items only (for keyboard nav indexing)
  const actionItems = cleanItems.filter((i) => !i.separator && !i.disabled);

  // Keyboard navigation
  useEffect(() => {
    if (!pos) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        close();
        return;
      }
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setFocused((f) => (f + 1) % actionItems.length);
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setFocused((f) => (f <= 0 ? actionItems.length - 1 : f - 1));
        return;
      }
      if (e.key === 'Enter' && focused >= 0 && focused < actionItems.length) {
        e.preventDefault();
        const item = actionItems[focused];
        if (item.children) {
          setOpenSubmenu(cleanItems.indexOf(item));
        } else {
          item.onClick();
          close();
        }
        return;
      }
      if (e.key === 'ArrowRight' && focused >= 0) {
        const item = actionItems[focused];
        if (item.children) {
          e.preventDefault();
          setOpenSubmenu(cleanItems.indexOf(item));
        }
        return;
      }
      if (e.key === 'ArrowLeft') {
        e.preventDefault();
        setOpenSubmenu(-1);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [pos, close, focused, actionItems, cleanItems]);

  const handleSubmenuEnter = (index: number) => {
    clearTimeout(submenuTimerRef.current);
    submenuTimerRef.current = setTimeout(() => setOpenSubmenu(index), 150);
  };

  const handleSubmenuLeave = () => {
    clearTimeout(submenuTimerRef.current);
    submenuTimerRef.current = setTimeout(() => setOpenSubmenu(-1), 200);
  };

  return (
    <>
      <div onContextMenu={handleContext} style={{ display: 'contents' }} data-context-open={pos ? 'true' : undefined}>
        {children}
      </div>
      {pos && (
        <div
          ref={menuRef}
          className="context-menu"
          style={{
            position: 'fixed',
            left: finalPos!.x,
            top: finalPos!.y,
            zIndex: 700,
            maxHeight: 'calc(100vh - 16px)',
            overflowY: 'auto',
          }}
          onClick={(e) => e.stopPropagation()}
        >
          {cleanItems.map((item, i) => {
            if (item.separator) {
              return <div key={i} className="context-menu-sep" />;
            }

            const actionIdx = actionItems.indexOf(item);
            const isFocused = focused === actionIdx;
            const hasChildren = item.children && item.children.length > 0;

            return (
              <div key={i} style={{ position: 'relative' }}
                onMouseEnter={() => {
                  setFocused(actionIdx);
                  if (hasChildren) handleSubmenuEnter(i);
                  else setOpenSubmenu(-1);
                }}
                onMouseLeave={() => {
                  if (hasChildren) handleSubmenuLeave();
                }}
              >
                <button
                  className={`context-menu-item${isFocused ? ' context-menu-item-focused' : ''}${item.danger ? ' context-menu-danger' : ''}${hasChildren ? ' context-menu-submenu-trigger' : ''}`}
                  onClick={() => {
                    if (hasChildren) {
                      setOpenSubmenu(openSubmenu === i ? -1 : i);
                    } else {
                      item.onClick();
                      close();
                    }
                  }}
                  disabled={item.disabled}
                >
                  {item.icon && <span className="context-menu-icon">{item.icon}</span>}
                  {item.label}
                  {hasChildren && (
                    <span className="context-menu-chevron">
                      <svg width={10} height={10} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="9 18 15 12 9 6" />
                      </svg>
                    </span>
                  )}
                </button>
                {hasChildren && openSubmenu === i && (
                  <SubMenu items={item.children!} onClose={close} />
                )}
              </div>
            );
          })}
        </div>
      )}
    </>
  );
}
