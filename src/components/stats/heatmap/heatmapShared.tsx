import { formatDurationLong } from '../../../utils/time';
import type { StudyHeatmapDay } from '../../../utils/stats';

export const HEATMAP_MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export function heatmapCellClass(level: 0 | 1 | 2 | 3 | 4): string {
  return ['bg-heatmap-0', 'bg-heatmap-1', 'bg-heatmap-2', 'bg-heatmap-3', 'bg-heatmap-4'][level];
}

export function formatHeatmapDate(dateKeyStr: string): string {
  const [y, m, d] = dateKeyStr.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

export function HeatmapDayTooltip({ day }: { day: StudyHeatmapDay }) {
  return (
    <div className="px-3 py-2 rounded bg-inverse-surface text-inverse-on-surface shadow-lg pointer-events-none">
      <p className="font-label-sm text-label-sm font-semibold whitespace-nowrap">
        {formatHeatmapDate(day.date)}
      </p>
      <p className="font-body-sm text-body-sm whitespace-nowrap opacity-90">
        {day.totalMinutes > 0
          ? `${formatDurationLong(day.totalMinutes)} studied`
          : 'No study'}
        {day.sessionCount > 0 && ` · ${day.sessionCount} session${day.sessionCount > 1 ? 's' : ''}`}
      </p>
    </div>
  );
}
