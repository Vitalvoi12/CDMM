import type { ReactNode } from 'react';
import { PERIOD_PRESETS, type PeriodPreset } from '../../utils/analytics';

export const JUMPS = [
  { id: 'subjects', label: 'Subjects' },
  { id: 'goals', label: 'Goals' },
  { id: 'rhythm', label: 'Rhythm' },
  { id: 'focus', label: 'Focus' },
  { id: 'streak', label: 'Streak' },
  { id: 'tasks', label: 'Tasks' },
  { id: 'plan', label: 'Plan' },
] as const;

export type JumpId = (typeof JUMPS)[number]['id'];

interface StatisticsProps {
  summary: string;
  preset: PeriodPreset;
  onPreset: (p: PeriodPreset) => void;
  customFrom: string;
  customTo: string;
  onCustom: (from: string, to: string) => void;
  panels: Record<JumpId, ReactNode>;
}

/**
 * Phone Statistics: period chips over the same blocks as the desktop.
 */
export function Statistics({ summary, preset, onPreset, customFrom, customTo, onCustom, panels }: StatisticsProps) {
  return (
    <div className="flex flex-col w-full flex-1 min-h-0 relative overflow-hidden">
      <header className="m-hdr" style={{ paddingLeft: 16, paddingBottom: 4, alignItems: 'flex-end' }}>
        <div className="flex flex-col flex-1 min-w-0">
          <h1 className="m-h1">Statistics</h1>
          <span className="m-sm m-mut m-tr">{summary}</span>
        </div>
      </header>

      <div className="m-scx" role="radiogroup" aria-label="Statistics period" style={{ padding: '8px 12px 0' }}>
        {PERIOD_PRESETS.map((p) => (
          <button key={p.id} type="button" role="radio" aria-checked={preset === p.id} className={`m-chip ${preset === p.id ? 'on' : ''}`} onClick={() => onPreset(p.id)}>
            {p.label}
          </button>
        ))}
      </div>
      {preset === 'custom' && (
        <div className="flex flex-none animate-fade-in" style={{ gap: 8, padding: '8px 12px 0' }}>
          <label className="m-fld flex-1">
            <span className="m-lbl m-mut">From</span>
            <input type="date" className="m-in" value={customFrom} max={customTo} onChange={(e) => e.target.value && onCustom(e.target.value, customTo)} />
          </label>
          <label className="m-fld flex-1">
            <span className="m-lbl m-mut">To</span>
            <input type="date" className="m-in" value={customTo} min={customFrom} onChange={(e) => e.target.value && onCustom(customFrom, e.target.value)} />
          </label>
        </div>
      )}
      <div className="relative flex-1 min-h-0 overflow-y-auto overscroll-contain" style={{ padding: '16px 16px 24px', marginTop: 4 }}>
        {JUMPS.map((j) => (
          <div key={j.id}>{panels[j.id]}</div>
        ))}
      </div>
    </div>
  );
}
