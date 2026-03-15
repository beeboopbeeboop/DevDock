import { useState, useRef, useMemo, useCallback } from 'react';

interface DataPoint {
  time: number;
  value: number;
}

interface InsightsChartProps {
  data: DataPoint[];
  label: string;
  color: string;
  height?: number;
  formatValue?: (v: number) => string;
  formatTime?: (t: number) => string;
}

const PADDING = { top: 20, right: 16, bottom: 28, left: 44 };

/** Convert Catmull-Rom control points to smooth cubic bezier SVG path */
function smoothPath(points: { x: number; y: number }[], tension = 0.3): string {
  if (points.length < 2) return '';
  if (points.length === 2) {
    return `M${points[0].x},${points[0].y} L${points[1].x},${points[1].y}`;
  }

  let d = `M${points[0].x},${points[0].y}`;

  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[Math.max(i - 1, 0)];
    const p1 = points[i];
    const p2 = points[i + 1];
    const p3 = points[Math.min(i + 2, points.length - 1)];

    const cp1x = p1.x + (p2.x - p0.x) * tension;
    const cp1y = p1.y + (p2.y - p0.y) * tension;
    const cp2x = p2.x - (p3.x - p1.x) * tension;
    const cp2y = p2.y - (p3.y - p1.y) * tension;

    d += ` C${cp1x},${cp1y} ${cp2x},${cp2y} ${p2.x},${p2.y}`;
  }

  return d;
}

export function InsightsChart({
  data,
  label,
  color,
  height = 200,
  formatValue = (v) => String(v),
  formatTime,
}: InsightsChartProps) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);
  const [dimensions, setDimensions] = useState({ width: 400 });

  // Measure container width
  const containerRef = useCallback((node: HTMLDivElement | null) => {
    if (!node) return;
    const observer = new ResizeObserver((entries) => {
      const w = entries[0]?.contentRect.width;
      if (w && w > 0) setDimensions({ width: w });
    });
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  const width = dimensions.width;
  const chartW = width - PADDING.left - PADDING.right;
  const chartH = height - PADDING.top - PADDING.bottom;

  const { points, yMin, yMax, yTicks, xLabels } = useMemo(() => {
    if (!data.length) return { points: [], yMin: 0, yMax: 1, yTicks: [], xLabels: [] };

    const values = data.map((d) => d.value);
    let min = Math.min(...values);
    let max = Math.max(...values);

    // Add 10% padding, ensure non-zero range
    const range = max - min || 1;
    min = Math.max(0, min - range * 0.1);
    max = max + range * 0.1;

    const pts = data.map((d, i) => ({
      x: PADDING.left + (data.length === 1 ? chartW / 2 : (i / (data.length - 1)) * chartW),
      y: PADDING.top + (1 - (d.value - min) / (max - min)) * chartH,
    }));

    // Y-axis ticks (4 levels)
    const ticks: { y: number; label: string }[] = [];
    for (let i = 0; i <= 3; i++) {
      const val = min + (i / 3) * (max - min);
      ticks.push({
        y: PADDING.top + (1 - i / 3) * chartH,
        label: val >= 1000 ? `${(val / 1000).toFixed(1)}k` : String(Math.round(val)),
      });
    }

    // X-axis labels (up to 6)
    const labels: { x: number; label: string }[] = [];
    const step = Math.max(1, Math.floor(data.length / 5));
    for (let i = 0; i < data.length; i += step) {
      const d = data[i];
      labels.push({
        x: pts[i].x,
        label: formatTime
          ? formatTime(d.time)
          : new Date(d.time).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
      });
    }

    return { points: pts, yMin: min, yMax: max, yTicks: ticks, xLabels: labels };
  }, [data, chartW, chartH, formatTime]);

  const pathD = useMemo(() => smoothPath(points), [points]);

  // Area fill path (line path + close to bottom)
  const areaD = useMemo(() => {
    if (!pathD || !points.length) return '';
    const bottom = PADDING.top + chartH;
    return `${pathD} L${points[points.length - 1].x},${bottom} L${points[0].x},${bottom} Z`;
  }, [pathD, points, chartH]);

  const handleMouseMove = useCallback(
    (e: React.MouseEvent<SVGSVGElement>) => {
      if (!svgRef.current || !points.length) return;
      const rect = svgRef.current.getBoundingClientRect();
      const mouseX = e.clientX - rect.left;

      // Find nearest point
      let closest = 0;
      let minDist = Infinity;
      for (let i = 0; i < points.length; i++) {
        const dist = Math.abs(points[i].x - mouseX);
        if (dist < minDist) {
          minDist = dist;
          closest = i;
        }
      }
      setHoveredIndex(closest);
    },
    [points],
  );

  const gradientId = `grad-${label.replace(/\s/g, '')}`;
  const glowId = `glow-${label.replace(/\s/g, '')}`;

  const hasData = data.length > 0;

  return (
    <div className="insights-chart-card" ref={containerRef}>
      <div className="insights-chart-title">{label}</div>
      {hasData && (
        <div className="insights-chart-current" style={{ color }}>
          {formatValue(data[data.length - 1].value)}
        </div>
      )}
      <svg
        ref={svgRef}
        width={width}
        height={height}
        className="insights-chart-svg"
        onMouseMove={handleMouseMove}
        onMouseLeave={() => setHoveredIndex(null)}
      >
        <defs>
          <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity={0.25} />
            <stop offset="100%" stopColor={color} stopOpacity={0} />
          </linearGradient>
          <filter id={glowId}>
            <feGaussianBlur stdDeviation="4" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        {/* Y-axis gridlines + labels */}
        {yTicks.map((tick, i) => (
          <g key={i}>
            <line
              x1={PADDING.left}
              y1={tick.y}
              x2={width - PADDING.right}
              y2={tick.y}
              stroke="var(--p-border)"
              strokeOpacity={0.3}
              strokeDasharray="4 3"
            />
            <text
              x={PADDING.left - 8}
              y={tick.y + 3}
              textAnchor="end"
              fill="var(--p-text-muted)"
              fontSize={9}
              fontFamily="var(--p-font)"
            >
              {tick.label}
            </text>
          </g>
        ))}

        {/* X-axis labels */}
        {xLabels.map((lbl, i) => (
          <text
            key={i}
            x={lbl.x}
            y={height - 4}
            textAnchor="middle"
            fill="var(--p-text-muted)"
            fontSize={9}
            fontFamily="var(--p-font)"
          >
            {lbl.label}
          </text>
        ))}

        {hasData && (
          <>
            {/* Area fill */}
            <path d={areaD} fill={`url(#${gradientId})`} />

            {/* Glow line */}
            <path
              d={pathD}
              fill="none"
              stroke={color}
              strokeWidth={2.5}
              strokeOpacity={0.3}
              filter={`url(#${glowId})`}
            />

            {/* Main line */}
            <path
              d={pathD}
              fill="none"
              stroke={color}
              strokeWidth={2}
              strokeLinecap="round"
              strokeLinejoin="round"
            />

            {/* Last point dot */}
            <circle
              cx={points[points.length - 1].x}
              cy={points[points.length - 1].y}
              r={3}
              fill={color}
            />
            <circle
              cx={points[points.length - 1].x}
              cy={points[points.length - 1].y}
              r={6}
              fill={color}
              opacity={0.2}
              className="insights-dot-pulse"
            />

            {/* Hover crosshair + tooltip */}
            {hoveredIndex !== null && points[hoveredIndex] && (
              <>
                <line
                  x1={points[hoveredIndex].x}
                  y1={PADDING.top}
                  x2={points[hoveredIndex].x}
                  y2={PADDING.top + chartH}
                  stroke="var(--p-border)"
                  strokeOpacity={0.6}
                  strokeDasharray="4 3"
                />
                <line
                  x1={PADDING.left}
                  y1={points[hoveredIndex].y}
                  x2={width - PADDING.right}
                  y2={points[hoveredIndex].y}
                  stroke="var(--p-border)"
                  strokeOpacity={0.4}
                  strokeDasharray="4 3"
                />
                <circle
                  cx={points[hoveredIndex].x}
                  cy={points[hoveredIndex].y}
                  r={4}
                  fill={color}
                  stroke="var(--p-bg-panel)"
                  strokeWidth={2}
                />
                <circle
                  cx={points[hoveredIndex].x}
                  cy={points[hoveredIndex].y}
                  r={8}
                  fill={color}
                  opacity={0.15}
                />
                <foreignObject
                  x={Math.min(
                    points[hoveredIndex].x - 60,
                    width - PADDING.right - 130,
                  )}
                  y={Math.max(points[hoveredIndex].y - 52, 0)}
                  width={120}
                  height={44}
                >
                  <div className="insights-tooltip">
                    <span className="insights-tooltip-value" style={{ color }}>
                      {formatValue(data[hoveredIndex].value)}
                    </span>
                    <span className="insights-tooltip-time">
                      {new Date(data[hoveredIndex].time).toLocaleString('en-US', {
                        month: 'short',
                        day: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </span>
                  </div>
                </foreignObject>
              </>
            )}
          </>
        )}

        {!hasData && (
          <text
            x={width / 2}
            y={height / 2}
            textAnchor="middle"
            fill="var(--p-text-muted)"
            fontSize={12}
            fontFamily="var(--p-font)"
          >
            No data yet — run a scan to start tracking
          </text>
        )}
      </svg>
    </div>
  );
}
