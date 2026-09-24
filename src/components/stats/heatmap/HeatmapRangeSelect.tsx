import { useEffect, useRef, useState } from 'react';
import type { HeatmapRangeMode } from '../../../utils/stats';

interface HeatmapRangeSelectProps {
  mode: HeatmapRangeMode;
  year: number;
  availableYears: number[];
  onPickRolling: () => void;
  onPickYear: (year: number) => void;
}

/**
 * App-styled dropdown replacing the old year arrows: "From today" (rolling
 * last-12-months window) plus every year that has at least one counted event.
 */
export function HeatmapRangeSelect({
  mode,
  year,
  availableYears,
  onPickRolling,
  onPickYear,
}: HeatmapRangeSelectProps) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: PointerEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  const label = mode === 'rolling' ? 'From today' : String(year);

  const itemClass = (active: boolean) =>
    `flex items-center justify-between gap-3 w-full px-4 py-2.5 text-left font-label-sm text-label-sm uppercase tracking-[0.12em] transition-colors ${
      active
        ? 'bg-surface-container text-on-surface'
        : 'text-on-surface-variant hover:bg-surface-container hover:text-on-surface'
    }`;

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="listbox"
        aria-expanded={open}
        className="flex items-center gap-2 px-4 h-10 rounded-xl border border-outline-variant bg-surface-container-lowest hover:border-outline transition-colors text-on-surface"
      >
        <span className="font-label-sm text-label-sm uppercase tracking-[0.12em] tabular-nums">
          {label}
        </span>
        <span
          className={`material-symbols-outlined text-[16px] text-on-surface-variant transition-transform ${open ? 'rotate-180' : ''}`}
        >
          expand_more
        </span>
      </button>
      {open && (
        <div
          role="listbox"
          className="absolute right-0 z-50 mt-2 min-w-[11rem] py-1.5 rounded-2xl border border-outline-variant bg-surface-container-lowest shadow-elev-3 overflow-hidden"
        >
          <button
            type="button"
            role="option"
            aria-selected={mode === 'rolling'}
            onClick={() => {
              onPickRolling();
              setOpen(false);
            }}
            className={itemClass(mode === 'rolling')}
          >
            <span>From today</span>
            {mode === 'rolling' && (
              <span className="material-symbols-outlined text-[14px] text-primary">check</span>
            )}
          </button>
          <div className="mx-4 my-1.5 border-t border-outline-variant" />
          {availableYears.map((y) => (
            <button
              key={y}
              type="button"
              role="option"
              aria-selected={mode === 'year' && y === year}
              onClick={() => {
                onPickYear(y);
                setOpen(false);
              }}
              className={itemClass(mode === 'year' && y === year)}
            >
              <span className="tabular-nums">{y}</span>
              {mode === 'year' && y === year && (
                <span className="material-symbols-outlined text-[14px] text-primary">check</span>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
