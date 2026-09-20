import { useMemo, useState } from 'react';
import type { StudyHeatmapDay } from '../../../utils/stats';
import { heatmapLevel } from '../../../utils/stats';
import { HeatmapDayTooltip, HEATMAP_MONTHS, heatmapCellClass } from './heatmapShared';
import { HeatmapLegend } from './HeatmapLegend';
import type { ThemeMode } from '../../../types';

interface DesktopStudyHeatmapProps {
  days: StudyHeatmapDay[];
  year: number;
  theme: ThemeMode;
}

const WEEKDAY_LABELS = ['', 'Mon', '', 'Wed', '', 'Fri', ''];

interface Cell {
  day: StudyHeatmapDay;
  level: 0 | 1 | 2 | 3 | 4;
  row: number; // 0 = Monday .. 6 = Sunday
  col: number;
  inYear: boolean;
}

export function DesktopStudyHeatmap({ days, year, theme }: DesktopStudyHeatmapProps) {
  const [hovered, setHovered] = useState<{ cell: Cell; x: number; y: number; flipBelow: boolean } | null>(null);

  const columns = useMemo(() => {
    const byDate = new Map(days.map((d) => [d.date, d]));
    const jan1 = new Date(year, 0, 1);
    const firstMondayOffset = (jan1.getDay() + 6) % 7; // days since Monday
    const gridStart = new Date(year, 0, 1 - firstMondayOffset);
    const totalDays = Math.round(
      (new Date(year + 1, 0, 1).getTime() - gridStart.getTime()) / 86400000
    );
    const cells: Cell[][] = [];
    for (let i = 0; i < totalDays; i++) {
      const d = new Date(gridStart.getFullYear(), gridStart.getMonth(), gridStart.getDate() + i);
      const col = Math.floor(i / 7);
      const row = i % 7;
      if (!cells[col]) cells[col] = [];
      const inYear = d.getFullYear() === year;
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      const day = byDate.get(key);
      cells[col][row] = {
        day: day || { date: key, totalMinutes: 0, sessionCount: 0 },
        level: day ? heatmapLevel(day.totalMinutes) : 0,
        row,
        col,
        inYear,
      };
    }
    return cells;
  }, [days, year]);

  const todayKey = useMemo(() => {
    const n = new Date();
    return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, '0')}-${String(n.getDate()).padStart(2, '0')}`;
  }, []);

  const monthLabels = useMemo(() => {
    const labels: { col: number; label: string }[] = [];
    let lastMonth = -1;
    columns.forEach((week, col) => {
      const firstInYear = week.find((c) => c.inYear);
      if (!firstInYear) return;
      const [m] = firstInYear.day.date.split('-').map(Number);
      if (m !== lastMonth) {
        labels.push({ col, label: HEATMAP_MONTHS[m - 1] });
        lastMonth = m;
      }
    });
    return labels;
  }, [columns]);

  const showTooltip = (cell: Cell, e: React.MouseEvent | React.FocusEvent) => {
    const target = e.currentTarget as HTMLElement;
    const cellRect = target.getBoundingClientRect();
    const flipBelow = cellRect.top < 120;
    setHovered({
      cell,
      x: cellRect.left + cellRect.width / 2,
      y: flipBelow ? cellRect.bottom : cellRect.top,
      flipBelow,
    });
  };

  return (
    <div className="relative">
      <div className="overflow-x-auto pb-2">
        <div className="relative inline-flex flex-col gap-[3px] lg:gap-[3px] min-w-max">
          {/* Month labels */}
          <div className="flex gap-[3px] lg:gap-[3px] ml-5 lg:ml-6">
            {columns.map((_, col) => (
              <div key={col} className="w-[9px] lg:w-[10px] relative">
                {monthLabels.find((m) => m.col === col) && (
                  <span className="absolute left-0 font-label-sm text-label-sm text-on-surface-variant whitespace-nowrap">
                    {monthLabels.find((m) => m.col === col)!.label}
                  </span>
                )}
              </div>
            ))}
          </div>
          <div className="flex gap-[3px] lg:gap-[3px]">
            {/* Weekday labels */}
            <div className="flex flex-col gap-[3px] lg:gap-[3px] w-[14px] lg:w-[17px]">
              {WEEKDAY_LABELS.map((label, row) => (
                <div key={row} className="h-[9px] lg:h-[10px] flex items-center">
                  <span className="font-label-sm text-label-sm text-on-surface-variant leading-none">
                    {label}
                  </span>
                </div>
              ))}
            </div>
            {/* Cells */}
            {columns.map((week, col) => (
              <div key={col} className="flex flex-col gap-[3px] lg:gap-[3px]">
                {Array.from({ length: 7 }, (_, row) => {
                  const cell = week[row];
                  if (!cell) return <div key={row} className="w-[9px] h-[9px] lg:w-[10px] lg:h-[10px]" />;
                  const isToday = cell.day.date === todayKey;
                  return (
                    <button
                      key={row}
                      type="button"
                      tabIndex={cell.inYear ? 0 : -1}
                      aria-label={`${cell.day.date}: ${cell.day.totalMinutes} minutes, ${cell.day.sessionCount} sessions${isToday ? ', today' : ''}`}
                      disabled={!cell.inYear}
                      className={`w-[9px] h-[9px] lg:w-[10px] lg:h-[10px] rounded-[2px] lg:rounded-[2px] ring-1 ring-inset ring-outline-variant/80 transition-transform ${heatmapCellClass(cell.level)} ${
                        !cell.inYear ? 'opacity-0 pointer-events-none' : 'hover:scale-125 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary'
                      }${isToday && cell.inYear ? ' ring-2 ring-primary ring-offset-1 ring-offset-background' : ''}`}
                      onMouseEnter={(e) => showTooltip(cell, e)}
                      onMouseLeave={() => setHovered(null)}
                      onFocus={(e) => showTooltip(cell, e)}
                      onBlur={() => setHovered(null)}
                    />
                  );
                })}
              </div>
            ))}
          </div>
        </div>
      </div>
      {hovered && (
        <div
          className={`fixed z-50 -translate-x-1/2 ${hovered.flipBelow ? 'translate-y-2' : '-translate-y-full pb-2'}`}
          style={{ left: hovered.x, top: hovered.y }}
        >
          <HeatmapDayTooltip day={hovered.cell.day} />
        </div>
      )}
      <div className="mt-3 flex justify-end">
        <HeatmapLegend />
      </div>
      {/* theme referenced so cells re-render on theme switch through parent */}
      <span hidden data-theme={theme} />
    </div>
  );
}
