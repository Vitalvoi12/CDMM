import { heatmapCellClass } from './heatmapShared';

export function HeatmapLegend() {
  return (
    <div className="flex items-center gap-1.5">
      <span className="font-label-sm text-label-sm text-on-surface-variant mr-1">Less</span>
      {[0, 1, 2, 3, 4].map((level) => (
        <span
          key={level}
          className={`w-3 h-3 rounded-[4px] ${heatmapCellClass(level as 0 | 1 | 2 | 3 | 4)}`}
        />
      ))}
      <span className="font-label-sm text-label-sm text-on-surface-variant ml-1">More</span>
    </div>
  );
}
