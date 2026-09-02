import { formatDuration } from '../../utils/time';

interface DailyActivityChartProps {
  dailyMinutes: number[];
}

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

export function DailyActivityChart({ dailyMinutes }: DailyActivityChartProps) {
  const maxMinutes = Math.max(...dailyMinutes, 1);
  const maxIdx = dailyMinutes.indexOf(Math.max(...dailyMinutes));

  return (
    <div className="w-full flex items-end justify-between gap-4 relative z-10 h-48">
      {dailyMinutes.map((minutes, i) => {
        const percent = Math.round((minutes / maxMinutes) * 100);
        const isMax = Math.max(...dailyMinutes) > 0 && i === maxIdx;
        const label = formatDuration(minutes);
        const dayLabel = WEEKDAYS[i];

        return (
          <div key={i} className="flex flex-col items-center justify-end gap-2 flex-1 h-full group relative">
            <span className="font-label-sm text-label-sm text-on-surface-variant opacity-0 group-hover:opacity-100 transition-opacity absolute -top-8">
              {label}
            </span>
            <div
              className={`w-full rounded-t-sm relative overflow-hidden group-hover:opacity-80 transition-colors ${
                isMax
                  ? 'bg-primary shadow-md'
                  : 'bg-surface-container-highest'
              }`}
              style={{ height: `${Math.max(percent, 4)}%` }}
            >
              {isMax && (
                <div className="absolute inset-0 bg-gradient-to-t from-transparent to-on-surface/10" />
              )}
            </div>
            <span
              className={`font-label-sm text-label-sm ${
                isMax ? 'font-label-md text-primary' : 'text-on-surface'
              }`}
            >
              {dayLabel}
            </span>
          </div>
        );
      })}
    </div>
  );
}
