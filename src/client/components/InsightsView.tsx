import { useState } from 'react';
import { useInsights, useLatestSnapshot } from '../hooks/useInsights';
import { InsightsChart } from './InsightsChart';
import { AnimatedNumber } from './AnimatedNumber';
import type { InsightsRange } from '../../shared/types';

const RANGES: { value: InsightsRange; label: string }[] = [
  { value: '24h', label: '24h' },
  { value: '7d', label: '7d' },
  { value: '30d', label: '30d' },
  { value: '90d', label: '90d' },
];

const CHART_COLORS = {
  totalProjects: '#6366f1',  // accent / indigo
  dirtyRepos: '#fbbf24',     // warning / amber
  dirtyFiles: '#f87171',     // danger / red
  dependencies: '#86efac',   // success / green
};

export function InsightsView() {
  const [range, setRange] = useState<InsightsRange>('7d');
  const { data: snapshots = [], isLoading } = useInsights(range);
  const { data: latest } = useLatestSnapshot();

  const chartData = (key: 'totalProjects' | 'dirtyRepos' | 'totalDirtyFiles' | 'totalDependencies') =>
    snapshots.map((s) => ({
      time: new Date(s.capturedAt).getTime(),
      value: s[key],
    }));

  const delta = (current: number, key: 'totalProjects' | 'dirtyRepos' | 'totalDirtyFiles' | 'totalDependencies') => {
    if (snapshots.length < 2) return null;
    const first = snapshots[0][key];
    const diff = current - first;
    if (diff === 0) return null;
    return diff > 0 ? `+${diff}` : String(diff);
  };

  return (
    <div className="insights-page">
      {/* Header */}
      <div className="insights-header">
        <h2 className="insights-title">Insights</h2>
        <div className="insights-range-pills">
          {RANGES.map((r) => (
            <button
              key={r.value}
              className="insights-range-pill"
              data-active={range === r.value ? 'true' : undefined}
              onClick={() => setRange(r.value)}
            >
              {r.label}
            </button>
          ))}
        </div>
      </div>

      {/* Summary stat cards */}
      {latest && (
        <div className="insights-stats-row">
          <StatCard
            label="Projects"
            value={latest.totalProjects}
            delta={delta(latest.totalProjects, 'totalProjects')}
            color={CHART_COLORS.totalProjects}
          />
          <StatCard
            label="Dirty Repos"
            value={latest.dirtyRepos}
            delta={delta(latest.dirtyRepos, 'dirtyRepos')}
            color={CHART_COLORS.dirtyRepos}
          />
          <StatCard
            label="Dirty Files"
            value={latest.totalDirtyFiles}
            delta={delta(latest.totalDirtyFiles, 'totalDirtyFiles')}
            color={CHART_COLORS.dirtyFiles}
          />
          <StatCard
            label="Dependencies"
            value={latest.totalDependencies}
            delta={delta(latest.totalDependencies, 'totalDependencies')}
            color={CHART_COLORS.dependencies}
          />
        </div>
      )}

      {/* Charts grid */}
      {isLoading && (
        <div className="insights-loading">Loading insights...</div>
      )}

      {!isLoading && snapshots.length === 0 && (
        <div className="insights-empty">
          No snapshots yet. Each scan captures a data point — run a scan or enable auto-scan in Settings.
        </div>
      )}

      <div className="insights-chart-grid">
        <InsightsChart
          data={chartData('totalProjects')}
          label="Total Projects"
          color={CHART_COLORS.totalProjects}
        />
        <InsightsChart
          data={chartData('dirtyRepos')}
          label="Dirty Repos"
          color={CHART_COLORS.dirtyRepos}
        />
        <InsightsChart
          data={chartData('totalDirtyFiles')}
          label="Dirty Files"
          color={CHART_COLORS.dirtyFiles}
        />
        <InsightsChart
          data={chartData('totalDependencies')}
          label="Dependencies"
          color={CHART_COLORS.dependencies}
        />
      </div>
    </div>
  );
}

function StatCard({
  label,
  value,
  delta,
  color,
}: {
  label: string;
  value: number;
  delta: string | null;
  color: string;
}) {
  return (
    <div className="insights-stat-card">
      <div className="insights-stat-label">{label}</div>
      <div className="insights-stat-value" style={{ color }}>
        <AnimatedNumber value={value} />
        {delta && (
          <span
            className="insights-stat-delta"
            style={{
              color: delta.startsWith('+') ? 'var(--p-success)' : 'var(--p-danger)',
            }}
          >
            {delta}
          </span>
        )}
      </div>
    </div>
  );
}
