import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { StudyHeatmapDay } from '../../../utils/stats';
import { heatmapLevel } from '../../../utils/stats';
import { formatDurationLong } from '../../../utils/time';
import { heatmapCellClass } from './heatmapShared';
import { HeatmapLegend } from './HeatmapLegend';

interface MobileStudyHeatmapProps {
  days: StudyHeatmapDay[];
  year: number;
  onPrevYear: () => void;
  onNextYear: () => void;
}

const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const WEEKDAY_HEADERS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];

export function MobileStudyHeatmap({ days, year, onPrevYear, onNextYear }: MobileStudyHeatmapProps) {
  const navigate = useNavigate();
  const [selected, setSelected] = useState<StudyHeatmapDay | null>(null);

  const byDate = useMemo(() => new Map(days.map((d) => [d.date, d])), [days]);

  const months = useMemo(() => {
    return Array.from({ length: 12 }, (_, month) => {
      const first = new Date(year, month, 1);
      const lead = (first.getDay() + 6) % 7; // Monday-start
      const dayCount = new Date(year, month + 1, 0).getDate();
      const cells: (StudyHeatmapDay | null)[] = Array.from({ length: lead }, () => null);
      for (let d = 1; d <= dayCount; d++) {
        const key = `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
        cells.push(byDate.get(key) || { date: key, totalMinutes: 0, sessionCount: 0 });
      }
      return { month, cells };
    });
  }, [days, year, byDate]);

  const todayKey = useMemo(() => {
    const n = new Date();
    return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, '0')}-${String(n.getDate()).padStart(2, '0')}`;
  }, []);

  return (
    <div className="flex flex-col gap-4 w-full min-w-0">
      <div className="flex items-center justify-center gap-2">
        <button
          onClick={onPrevYear}
          aria-label="Previous year"
          className="w-9 h-9 flex items-center justify-center rounded bg-surface-container hover:bg-surface-container-high transition-colors text-on-surface"
        >
          <span className="material-symbols-outlined text-[16px]">chevron_left</span>
        </button>
        <span className="font-headline-md text-headline-md text-on-surface tabular-nums w-16 text-center">
          {year}
        </span>
        <button
          onClick={onNextYear}
          aria-label="Next year"
          className="w-9 h-9 flex items-center justify-center rounded bg-surface-container hover:bg-surface-container-high transition-colors text-on-surface"
        >
          <span className="material-symbols-outlined text-[16px]">chevron_right</span>
        </button>
      </div>

      <div className="grid grid-cols-4 gap-x-2 gap-y-3">
        {months.map(({ month, cells }) => (
          <div key={month} className="min-w-0">
            <p className="font-label-sm text-label-sm text-on-surface-variant mb-1.5 truncate">
              {MONTH_NAMES[month]}
            </p>
            <div className="grid grid-cols-7 gap-[2px] mb-1">
              {WEEKDAY_HEADERS.map((w, i) => (
                <span key={i} className="text-center font-label-sm text-[6px] leading-none text-on-surface-variant">
                  {w}
                </span>
              ))}
            </div>
            <div className="grid grid-cols-7 gap-[2px]">
              {cells.map((cell, i) => {
                if (!cell) return <span key={`e-${i}`} className="aspect-square" />;
                const level = heatmapLevel(cell.totalMinutes);
                const isToday = cell.date === todayKey;
                const isSelected = selected?.date === cell.date;
                return (
                  <button
                    key={cell.date}
                    type="button"
                    aria-label={`${cell.date}: ${cell.totalMinutes} minutes`}
                    className={`aspect-square w-full rounded-[2px] ${heatmapCellClass(level)} transition-transform ${
                      isSelected ? 'ring-2 ring-primary scale-110' : ''
                    } ${isToday && !isSelected ? 'ring-1 ring-primary' : ''} active:scale-95`}
                    onClick={() => setSelected(isSelected ? null : cell)}
                  />
                );
              })}
            </div>
          </div>
        ))}
      </div>

      {selected && (
        <div className="bg-surface-container rounded p-4 flex items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="font-label-md text-label-md text-on-surface">
              {new Date(
                Number(selected.date.slice(0, 4)),
                Number(selected.date.slice(5, 7)) - 1,
                Number(selected.date.slice(8, 10))
              ).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
            </p>
            <p className="font-body-sm text-body-sm text-on-surface-variant">
              {selected.totalMinutes > 0
                ? `${formatDurationLong(selected.totalMinutes)} studied · ${selected.sessionCount} session${selected.sessionCount > 1 ? 's' : ''}`
                : 'No study'}
            </p>
          </div>
          <button
            onClick={() => {
              const [y, m, d] = selected.date.split('-').map(Number);
              navigate('/', { state: { selectedDate: new Date(y, m - 1, d).getTime() } });
            }}
            className="flex-shrink-0 px-3 py-2 rounded border border-outline-variant font-label-sm text-label-sm text-on-surface uppercase tracking-wider hover:border-primary transition-colors flex items-center gap-1"
          >
            Calendar
            <span className="material-symbols-outlined text-[11px]">arrow_forward</span>
          </button>
        </div>
      )}

      <div className="flex justify-end">
        <HeatmapLegend />
      </div>
    </div>
  );
}
