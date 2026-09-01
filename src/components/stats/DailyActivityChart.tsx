import { formatDuration } from '../../utils/time';

interface DailyActivityChartProps {
  dailyMinutes: number[];
}

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

export function DailyActivityChart({ dailyMinutes }: DailyActivityChartProps) {
  const maxMinutes = Math.max(...dailyMinutes, 1);
  const maxIdx = dailyMinutes.indexOf(Math.max(...dailyMinutes));

  return (
    <div className="flex-1 flex items-end justify-between gap-4 relative z-10 mt-16 h-48">
      {dailyMinutes.map((minutes, i) => {
        const percent = Math.round((minutes / maxMinutes) * 100);
        const isMax = i === maxIdx && minutes > 0;
        const label = formatDuration(minutes);
        const dayLabel = WEEKDAYS[i];

        return (
          <div key={i} className="flex flex-col items-center gap-2 flex-1 group relative">
            <span className="font-label-sm text-label-sm text-on-surface-variant opacity-0 group-hover:opacity-100 transition-opacity absolute -top-8">
              {label}
            </span>
            <div
              className={`w-full rounded-t-sm relative overflow-hidden group-hover:opacity-80 transition-colors ${
                isMax
                  ? 'bg-primary shadow-md'
                  : 'bg-surface-container-highest'
              }`}
              style={{ height: `${Math.max(percent, 5)}%` }}
            >
              {isMax && (
                <div className="absolute inset-0 bg-gradient-to-t from-transparent to-white/10" />
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
