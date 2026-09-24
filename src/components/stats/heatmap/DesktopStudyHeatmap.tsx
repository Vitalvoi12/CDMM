import { useMemo, useState } from 'react';
import type { StudyHeatmapDay, HeatmapRange } from '../../../utils/stats';
import { heatmapLevel } from '../../../utils/stats';
import { dateKey } from '../../../utils/time';
import { HeatmapDayTooltip, HEATMAP_MONTHS, heatmapCellClass } from './heatmapShared';
import { HeatmapLegend } from './HeatmapLegend';
import type { ThemeMode } from '../../../types';

interface DesktopStudyHeatmapProps {
  days: StudyHeatmapDay[];
  range: HeatmapRange;
  theme: ThemeMode;
}

const WEEKDAY_LABELS = ['', 'Mon', '', 'Wed', '', 'Fri', ''];

interface Cell {
  day: StudyHeatmapDay;
  level: 0 | 1 | 2 | 3 | 4;
  row: number; // 0 = Monday .. 6 = Sunday
  col: number;
  inRange: boolean;
}

export function DesktopStudyHeatmap({ days, range, theme }: DesktopStudyHeatmapProps) {
  const [hovered, setHovered] = useState<{ cell: Cell; x: number; y: number; flipBelow: boolean } | null>(null);

  const columns = useMemo(() => {
    const byDate = new Map(days.map((d) => [d.date, d]));
    const from = range.from;
    const to = range.to;
    const fromDate = new Date(from.getFullYear(), from.getMonth(), from.getDate());
    const toDate = new Date(to.getFullYear(), to.getMonth(), to.getDate());
    const firstMondayOffset = (from.getDay() + 6) % 7; // days since Monday
    const gridStart = new Date(from.getFullYear(), from.getMonth(), from.getDate() - firstMondayOffset);
    const totalDays = Math.round(
      (toDate.getTime() - gridStart.getTime()) / 86400000
    ) + 1;
    const cells: Cell[][] = [];
    for (let i = 0; i < totalDays; i++) {
      const d = new Date(gridStart.getFullYear(), gridStart.getMonth(), gridStart.getDate() + i);
      const col = Math.floor(i / 7);
      const row = i % 7;
      if (!cells[col]) cells[col] = [];
      const inRange = d.getTime() >= fromDate.getTime() && d.getTime() <= toDate.getTime();
      const key = dateKey(d);
      const day = byDate.get(key);
      cells[col][row] = {
        day: day || { date: key, totalMinutes: 0, sessionCount: 0 },
        level: day ? heatmapLevel(day.totalMinutes) : 0,
        row,
        col,
        inRange,
      };
    }
    return cells;
  }, [days, range]);

  const monthLabels = useMemo(() => {
    const labels: { col: number; label: string }[] = [];
    let lastMonth = -1;
    columns.forEach((week, col) => {
      const firstInRange = week.find((c) => c.inRange);
      if (!firstInRange) return;
      const [m] = firstInRange.day.date.split('-').map(Number);
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
          {/* Month labels — aligned with the first cell column (gutter, no gap) */}
          <div className="flex gap-[3px] lg:gap-[3px] ml-[23px] lg:ml-[25px]">
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
          <div className="flex">
            {/* Weekday labels — dedicated gutter wide enough for Mon/Wed/Fri,
                cells start right after it and never paint over the text */}
            <div className="flex flex-col gap-[3px] lg:gap-[3px] w-[23px] lg:w-[25px]">
              {WEEKDAY_LABELS.map((label, row) => (
                <div key={row} className="h-[9px] lg:h-[10px] flex items-center">
                  <span className="font-label-sm text-[8px] leading-none tracking-[0.02em] text-on-surface-variant whitespace-nowrap">
                    {label}
                  </span>
                </div>
              ))}
            </div>
            {/* Cells */}
            <div className="flex gap-[3px] lg:gap-[3px]">
              {columns.map((week, col) => (
                <div key={col} className="flex flex-col gap-[3px] lg:gap-[3px]">
                  {Array.from({ length: 7 }, (_, row) => {
                    const cell = week[row];
                    if (!cell) return <div key={row} className="w-[9px] h-[9px] lg:w-[10px] lg:h-[10px]" />;
                    if (!cell.inRange) return <div key={row} className="w-[9px] h-[9px] lg:w-[10px] lg:h-[10px]" />;
                    return (
                      <button
                        key={row}
                        type="button"
                        tabIndex={0}
                        aria-label={`${cell.day.date}: ${cell.day.totalMinutes} minutes, ${cell.day.sessionCount} sessions`}
                        className={`w-[9px] h-[9px] lg:w-[10px] lg:h-[10px] rounded-[3px] lg:rounded-[4px] border border-outline/80 transition-transform ${heatmapCellClass(
                          cell.level
                        )} hover:scale-125 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary`}
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
