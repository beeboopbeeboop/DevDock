import { useState, useRef, useCallback, useEffect } from 'react';
import type { Project } from '../types/project';
import { ProjectCard } from './ProjectCard';
import { useReorder } from '../hooks/useProjects';

interface ProjectGridProps {
  projects: Project[];
  onSelectProject: (project: Project) => void;
  onOpenNotes?: (project: Project) => void;
  runningPorts: Set<number>;
  isCustomSort?: boolean;
  focusedIndex?: number;
  batchMode?: boolean;
  selectedIds?: Set<string>;
  onToggleSelect?: (id: string) => void;
}

export function ProjectGrid({ projects, onSelectProject, onOpenNotes, runningPorts, isCustomSort, focusedIndex = -1, batchMode, selectedIds, onToggleSelect }: ProjectGridProps) {
  const [dragIdx, setDragIdx] = useState<number | null>(null);
  const [overIdx, setOverIdx] = useState<number | null>(null);
  const reorder = useReorder();
  const dragNode = useRef<HTMLDivElement | null>(null);
  const focusedRef = useRef<HTMLDivElement | null>(null);
  const ghostRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (focusedIndex >= 0 && focusedRef.current) {
      focusedRef.current.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }
  }, [focusedIndex]);

  // Clean up ghost element on unmount
  useEffect(() => {
    return () => {
      if (ghostRef.current) {
        document.body.removeChild(ghostRef.current);
        ghostRef.current = null;
      }
    };
  }, []);

  const handleDragStart = useCallback((e: React.DragEvent, idx: number) => {
    setDragIdx(idx);
    dragNode.current = e.currentTarget as HTMLDivElement;
    e.dataTransfer.effectAllowed = 'move';

    // Create a clean ghost preview
    const card = e.currentTarget.querySelector('.project-card') as HTMLElement;
    if (card) {
      const ghost = card.cloneNode(true) as HTMLDivElement;
      const w = card.offsetWidth;
      ghost.style.cssText = `
        position: fixed;
        top: -9999px;
        left: -9999px;
        width: ${w}px;
        transform: scale(0.95);
        opacity: 0.95;
        border-radius: 12px;
        box-shadow: 0 12px 40px rgba(0,0,0,0.5), 0 0 0 2px var(--p-accent), inset 0 1px 0 rgba(255,255,255,0.06);
        pointer-events: none;
        z-index: 99999;
        background: var(--p-bg-panel);
        backdrop-filter: blur(8px);
      `;
      // Hide footer actions and meta in ghost for cleaner look
      ghost.querySelectorAll('.project-card-actions, .project-card-meta').forEach(el => {
        (el as HTMLElement).style.display = 'none';
      });
      document.body.appendChild(ghost);
      ghostRef.current = ghost;
      e.dataTransfer.setDragImage(ghost, w / 2, 30);
    }

    // Fade the source card
    requestAnimationFrame(() => {
      if (dragNode.current) {
        dragNode.current.style.opacity = '0.3';
        dragNode.current.style.transform = 'scale(0.97)';
      }
    });
  }, []);

  const handleDragEnd = useCallback(() => {
    // Clean up ghost
    if (ghostRef.current) {
      document.body.removeChild(ghostRef.current);
      ghostRef.current = null;
    }

    // Restore source card
    if (dragNode.current) {
      dragNode.current.style.opacity = '1';
      dragNode.current.style.transform = '';
    }

    if (dragIdx !== null && overIdx !== null && dragIdx !== overIdx) {
      const reordered = [...projects];
      const [moved] = reordered.splice(dragIdx, 1);
      reordered.splice(overIdx, 0, moved);
      reorder.mutate(reordered.map((p) => p.id));
    }

    setDragIdx(null);
    setOverIdx(null);
    dragNode.current = null;
  }, [dragIdx, overIdx, projects, reorder]);

  const handleDragOver = useCallback((e: React.DragEvent, idx: number) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    setOverIdx(idx);
  }, []);

  const getDropPosition = (idx: number): 'before' | 'after' | null => {
    if (dragIdx === null || overIdx === null || dragIdx === overIdx) return null;
    if (idx !== overIdx) return null;
    return dragIdx < overIdx ? 'after' : 'before';
  };

  return (
    <div className={`project-grid${dragIdx !== null ? ' grid-dragging' : ''}`}>
      {projects.map((project, idx) => {
        const dropPos = getDropPosition(idx);
        return (
          <div
            key={project.id}
            ref={focusedIndex === idx ? focusedRef : undefined}
            className={[
              'drag-wrapper',
              isCustomSort && 'drag-enabled',
              dragIdx === idx && 'drag-source',
              dropPos === 'before' && 'drop-before',
              dropPos === 'after' && 'drop-after',
              focusedIndex === idx && 'project-card-focused',
              batchMode && selectedIds?.has(project.id) && 'project-card-selected',
            ].filter(Boolean).join(' ')}
            draggable={isCustomSort}
            onDragStart={(e) => isCustomSort && handleDragStart(e, idx)}
            onDragEnd={isCustomSort ? handleDragEnd : undefined}
            onDragOver={(e) => isCustomSort && handleDragOver(e, idx)}
            onDragEnter={(e) => { e.preventDefault(); isCustomSort && setOverIdx(idx); }}
          >
            {batchMode && (
              <label className="batch-checkbox" onClick={(e) => e.stopPropagation()}>
                <input
                  type="checkbox"
                  checked={selectedIds?.has(project.id) || false}
                  onChange={() => onToggleSelect?.(project.id)}
                />
              </label>
            )}
            <ProjectCard
              project={project}
              onClick={() => batchMode ? onToggleSelect?.(project.id) : onSelectProject(project)}
              onOpenNotes={onOpenNotes ? () => onOpenNotes(project) : undefined}
              isServerRunning={!!project.devPort && runningPorts.has(project.devPort)}
            />
          </div>
        );
      })}
    </div>
  );
}
