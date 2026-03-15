import { useState, useEffect, useRef, useCallback } from 'react';
import { useGraphRelationships, useSyncStatus } from '../hooks/useGraph';
import { PROJECT_TYPE_COLORS, PROJECT_TYPE_LABELS } from '../types/project';
import type { GraphNode, GraphEdge, SyncStatusEntry } from '../types/project';

interface LayoutNode extends GraphNode {
  x: number;
  y: number;
  vx: number;
  vy: number;
}

// Simple force-directed layout (no d3 needed for ~20 nodes)
function forceLayout(
  nodes: GraphNode[],
  edges: GraphEdge[],
  width: number,
  height: number,
  iterations = 120
): LayoutNode[] {
  const layout: LayoutNode[] = nodes.map((n, i) => ({
    ...n,
    x: width / 2 + (Math.cos((i / nodes.length) * Math.PI * 2) * width * 0.3),
    y: height / 2 + (Math.sin((i / nodes.length) * Math.PI * 2) * height * 0.3),
    vx: 0,
    vy: 0,
  }));

  const nodeMap = new Map(layout.map((n) => [n.id, n]));

  for (let iter = 0; iter < iterations; iter++) {
    const alpha = 1 - iter / iterations;
    const strength = alpha * 0.4;

    // Repulsion between all nodes
    for (let i = 0; i < layout.length; i++) {
      for (let j = i + 1; j < layout.length; j++) {
        const a = layout[i];
        const b = layout[j];
        let dx = b.x - a.x;
        let dy = b.y - a.y;
        const dist = Math.sqrt(dx * dx + dy * dy) || 1;
        const force = (400 * strength) / dist;
        dx = (dx / dist) * force;
        dy = (dy / dist) * force;
        a.vx -= dx;
        a.vy -= dy;
        b.vx += dx;
        b.vy += dy;
      }
    }

    // Attraction along edges
    for (const edge of edges) {
      const source = nodeMap.get(edge.source);
      const target = nodeMap.get(edge.target);
      if (!source || !target) continue;
      let dx = target.x - source.x;
      let dy = target.y - source.y;
      const dist = Math.sqrt(dx * dx + dy * dy) || 1;
      const force = (dist - 180) * strength * 0.05;
      dx = (dx / dist) * force;
      dy = (dy / dist) * force;
      source.vx += dx;
      source.vy += dy;
      target.vx -= dx;
      target.vy -= dy;
    }

    // Center gravity
    for (const node of layout) {
      node.vx += (width / 2 - node.x) * strength * 0.01;
      node.vy += (height / 2 - node.y) * strength * 0.01;
    }

    // Apply velocities with damping
    for (const node of layout) {
      node.x += node.vx * 0.8;
      node.y += node.vy * 0.8;
      node.vx *= 0.6;
      node.vy *= 0.6;
      // Bounds
      node.x = Math.max(50, Math.min(width - 50, node.x));
      node.y = Math.max(50, Math.min(height - 50, node.y));
    }
  }

  return layout;
}

const EDGE_COLORS: Record<string, string> = {
  'shared-lib': '#a78bfa',
  'shared-deps': '#4b5563',
};

interface DependencyGraphProps {
  onSelectProjectById?: (id: string) => void;
}

export function DependencyGraph({ onSelectProjectById }: DependencyGraphProps) {
  const { data: graphData, isLoading } = useGraphRelationships();
  const { data: syncStatus = [] } = useSyncStatus();
  const [hoveredNode, setHoveredNode] = useState<string | null>(null);
  const [layoutNodes, setLayoutNodes] = useState<LayoutNode[]>([]);
  const containerRef = useRef<HTMLDivElement>(null);

  const syncMap = new Map<string, SyncStatusEntry>(
    syncStatus.map((s) => [s.projectId, s])
  );

  // Compute layout when data or container size changes
  useEffect(() => {
    if (!graphData || graphData.nodes.length === 0) return;
    const el = containerRef.current;
    const width = el ? el.clientWidth : 1200;
    const height = el ? el.clientHeight : 700;
    const nodes = forceLayout(graphData.nodes, graphData.edges, width, Math.max(height, 500));
    setLayoutNodes(nodes);
  }, [graphData]);

  const handleNodeClick = useCallback(
    (id: string) => onSelectProjectById?.(id),
    [onSelectProjectById]
  );

  if (isLoading) {
    return (
      <div className="graph-page">
        <div className="empty-state">
          <div className="scanning-indicator">Loading graph...</div>
        </div>
      </div>
    );
  }

  if (!graphData || graphData.nodes.length === 0) {
    return (
      <div className="graph-page">
        <div className="empty-state">
          <div className="empty-state-title">No project relationships found</div>
          <div className="empty-state-desc">
            Projects that share libraries or dependencies will appear here as a connected graph. Click Rescan in the sidebar to discover connections.
          </div>
        </div>
      </div>
    );
  }

  const nodeMap = new Map(layoutNodes.map((n) => [n.id, n]));
  const el = containerRef.current;
  const width = el ? el.clientWidth : 1200;
  const height = el ? el.clientHeight : 700;

  return (
    <div className="graph-page">
      <div className="pm-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <h2 className="pm-title">Dependency Graph</h2>
          <span className="topbar-meta">
            {graphData.nodes.length} projects, {graphData.edges.length} connections
          </span>
        </div>
        <div className="graph-legend">
          <span className="graph-legend-item">
            <span className="graph-legend-line" style={{ background: EDGE_COLORS['shared-lib'] }} />
            Shared Library
          </span>
          <span className="graph-legend-item">
            <span className="graph-legend-line" style={{ background: EDGE_COLORS['shared-deps'] }} />
            Shared Deps
          </span>
        </div>
      </div>

      <div className="graph-content">
        <div className="graph-svg-wrap" ref={containerRef}>
          <svg width="100%" height="100%" viewBox={`0 0 ${width} ${height}`} className="graph-svg">
            {/* Edges — clipped at circle boundaries */}
            {graphData.edges.map((edge, i) => {
              const source = nodeMap.get(edge.source);
              const target = nodeMap.get(edge.target);
              if (!source || !target) return null;
              const dx = target.x - source.x;
              const dy = target.y - source.y;
              const dist = Math.sqrt(dx * dx + dy * dy) || 1;
              const srcR = source.isMaster ? 28 : 18;
              const tgtR = target.isMaster ? 28 : 18;
              const x1 = source.x + (dx / dist) * (srcR + 2);
              const y1 = source.y + (dy / dist) * (srcR + 2);
              const x2 = target.x - (dx / dist) * (tgtR + 2);
              const y2 = target.y - (dy / dist) * (tgtR + 2);
              return (
                <line
                  key={i}
                  x1={x1} y1={y1} x2={x2} y2={y2}
                  stroke={EDGE_COLORS[edge.type] || '#4b5563'}
                  strokeWidth={edge.type === 'shared-deps' ? 1 : 2}
                  strokeOpacity={0.4}
                  strokeDasharray={edge.type === 'shared-deps' ? '4 3' : undefined}
                />
              );
            })}

            {/* Nodes */}
            {layoutNodes.map((node) => {
              const color = PROJECT_TYPE_COLORS[node.type as keyof typeof PROJECT_TYPE_COLORS] || '#6b7280';
              const radius = node.isMaster ? 28 : 18;
              const isHovered = hoveredNode === node.id;
              const sync = syncMap.get(node.id);
              const isStale = sync && !sync.isFresh;
              const edgeCount = graphData.edges.filter(
                (e) => e.source === node.id || e.target === node.id
              ).length;

              return (
                <g
                  key={node.id}
                  className="graph-node"
                  onClick={() => handleNodeClick(node.id)}
                  onMouseEnter={() => setHoveredNode(node.id)}
                  onMouseLeave={() => setHoveredNode(null)}
                  style={{ cursor: 'pointer' }}
                >
                  {/* Stale sync warning ring */}
                  {isStale && (
                    <circle
                      cx={node.x}
                      cy={node.y}
                      r={radius + 5}
                      fill="none"
                      stroke="var(--p-warning)"
                      strokeWidth={2}
                      strokeDasharray="4 2"
                      opacity={0.7}
                    />
                  )}
                  {/* Node circle — opaque bg so edges don't show through */}
                  <circle cx={node.x} cy={node.y} r={radius} fill="var(--p-bg)" />
                  <circle
                    cx={node.x}
                    cy={node.y}
                    r={radius}
                    fill={`${color}25`}
                    stroke={color}
                    strokeWidth={isHovered ? 2.5 : 1.5}
                  />
                  {/* Abbreviation inside circle */}
                  <text
                    x={node.x}
                    y={node.y + 1}
                    fill={color}
                    fontSize={node.isMaster ? 11 : 8}
                    fontWeight={700}
                    textAnchor="middle"
                    dominantBaseline="middle"
                  >
                    {node.name.slice(0, node.isMaster ? 3 : 2).toUpperCase()}
                  </text>
                  {/* Name below circle */}
                  <text
                    x={node.x}
                    y={node.y + radius + 12}
                    fill={isHovered ? 'var(--p-text)' : 'var(--p-text-dim)'}
                    fontSize={isHovered ? 11 : 9}
                    fontWeight={isHovered ? 600 : 400}
                    textAnchor="middle"
                  >
                    {node.name}
                  </text>
                  {/* Hover popover */}
                  {isHovered && (
                    <foreignObject
                      x={node.x + radius + 8}
                      y={node.y - 40}
                      width={180}
                      height={80}
                      style={{ pointerEvents: 'none' }}
                    >
                      <div className="graph-tooltip">
                        <div className="graph-tooltip-name">{node.name}</div>
                        <div className="graph-tooltip-meta">
                          {PROJECT_TYPE_LABELS[node.type as keyof typeof PROJECT_TYPE_LABELS] || node.type}
                        </div>
                        <div className="graph-tooltip-meta">
                          {edgeCount} connection{edgeCount !== 1 ? 's' : ''}
                          {sync ? (sync.isFresh ? ' · In sync' : ` · ${sync.divergentFiles} files differ`) : ''}
                        </div>
                      </div>
                    </foreignObject>
                  )}
                </g>
              );
            })}
          </svg>
        </div>

        {/* Sync Status Panel */}
        {syncStatus.length > 0 && (
          <div className="graph-sync-panel">
            <div className="detail-section-title">Sync Status</div>
            {syncStatus.map((s) => (
              <div key={`${s.projectId}-${s.coreType}`} className="graph-sync-row">
                <span
                  className="lh-dot"
                  style={{
                    background: s.isFresh ? 'var(--p-success)' : s.divergentFiles < 0 ? 'var(--p-text-muted)' : 'var(--p-warning)',
                    boxShadow: s.isFresh ? '0 0 4px var(--p-success)' : undefined,
                  }}
                />
                <span className="graph-sync-name">{s.projectName}</span>
                <span className="graph-sync-core">
                  {s.libraryName || 'Lib'}
                </span>
                <span className="graph-sync-status">
                  {s.isFresh
                    ? 'In sync'
                    : s.divergentFiles < 0
                      ? 'Error'
                      : `${s.divergentFiles} files differ`}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
