import { useState, type ReactNode } from 'react';
import { PERIOD_PRESETS, type PeriodPreset } from '../../utils/analytics';
import { Sheet } from './Sheet';

const STAT_TABS = [
  { id: 'overview', label: 'Overview' },
  { id: 'focus', label: 'Focus' },
  { id: 'rhythm', label: 'Rhythm' },
  { id: 'tasks', label: 'Tasks' },
] as const;

export type StatTab = (typeof STAT_TABS)[number]['id'];

const TAB_KEY = 'cdmm.stats-tab';

function loadTab(): StatTab {
  try {
    const v = localStorage.getItem(TAB_KEY);
    return STAT_TABS.some((t) => t.id === v) ? (v as StatTab) : 'overview';
  } catch {
    return 'overview';
  }
}

export interface StatTile {
  label: string;
  value: ReactNode;
}

interface StatisticsProps {
  /** The period's dates, e.g. "Oct 21 – Oct 27". */
  range: string;
  preset: PeriodPreset;
  onPreset: (p: PeriodPreset) => void;
  customFrom: string;
  customTo: string;
  onCustom: (from: string, to: string) => void;
  tiles: StatTile[];
  panels: Record<StatTab, ReactNode>;
}

/**
 * Phone Statistics: the period behind a chip in the header, and the desktop's
 * blocks split over four tabs (the last one picked is remembered).
 */
export function Statistics({ range, preset, onPreset, customFrom, customTo, onCustom, tiles, panels }: StatisticsProps) {
  const [tab, setTabState] = useState<StatTab>(loadTab);
  const [periodOpen, setPeriodOpen] = useState(false);
  const presetLabel = PERIOD_PRESETS.find((p) => p.id === preset)?.label ?? '';

  const setTab = (t: StatTab) => {
    setTabState(t);
    try {
      localStorage.setItem(TAB_KEY, t);
    } catch {
      // storage unavailable — the pick just isn't remembered
    }
  };

  return (
    <div className="flex flex-col w-full flex-1 min-h-0 relative overflow-hidden">
      <header className="m-hdr" style={{ paddingLeft: 16, paddingBottom: 0, alignItems: 'center' }}>
        <div className="flex flex-col flex-1 min-w-0">
          <h1 className="m-h1">Statistics</h1>
          <span className="m-sm m-mut m-tr">{range}</span>
        </div>
        <button type="button" className="m-chip m-chip-period" aria-label={`Statistics period: ${presetLabel}. Change`} onClick={() => setPeriodOpen(true)}>
          {presetLabel}
          <span className="material-symbols-outlined m-ic s">expand_more</span>
        </button>
      </header>

      <div style={{ padding: '8px 12px 0', flex: 'none' }}>
        <div className="m-seg" role="tablist" aria-label="Statistics section">
          {STAT_TABS.map((t) => (
            <button key={t.id} type="button" role="tab" aria-selected={tab === t.id} className={tab === t.id ? 'on' : ''} onClick={() => setTab(t.id)}>
              {t.label}
            </button>
          ))}
        </div>
      </div>

      <div key={tab} className="relative flex-1 min-h-0 overflow-y-auto overscroll-contain" style={{ padding: '16px 16px 24px', marginTop: 4 }}>
        {tab === 'overview' && (
          <div className="m-stat-tiles">
            {tiles.map((t) => (
              <div key={t.label} className="m-tile">
                <span className="m-lbl m-mut">{t.label}</span>
                <b className="m-num">{t.value}</b>
              </div>
            ))}
          </div>
        )}
        {panels[tab]}
      </div>

      {periodOpen && (
        <PeriodSheet
          preset={preset}
          customFrom={customFrom}
          customTo={customTo}
          onPreset={(p) => {
            onPreset(p);
            setPeriodOpen(false);
          }}
          onCustom={(from, to) => {
            onCustom(from, to);
            onPreset('custom');
            setPeriodOpen(false);
          }}
          onClose={() => setPeriodOpen(false)}
        />
      )}
    </div>
  );
}

interface PeriodSheetProps {
  preset: PeriodPreset;
  customFrom: string;
  customTo: string;
  onPreset: (p: PeriodPreset) => void;
  onCustom: (from: string, to: string) => void;
  onClose: () => void;
}

function PeriodSheet({ preset, customFrom, customTo, onPreset, onCustom, onClose }: PeriodSheetProps) {
  const [from, setFrom] = useState(customFrom);
  const [to, setTo] = useState(customTo);

  return (
    <Sheet label="Statistics period" onClose={onClose}>
      <div className="m-shd">
        <h2 className="m-h2">Period</h2>
        <button type="button" className="m-ib" aria-label="Close" onClick={onClose}>
          <span className="material-symbols-outlined m-ic">close</span>
        </button>
      </div>
      <div className="m-seg" role="radiogroup" aria-label="Period">
        {PERIOD_PRESETS.filter((p) => p.id !== 'custom').map((p) => (
          <button key={p.id} type="button" role="radio" aria-checked={preset === p.id} className={preset === p.id ? 'on' : ''} onClick={() => onPreset(p.id)}>
            {p.label}
          </button>
        ))}
      </div>
      <div className="m-fld">
        <span className="m-lbl m-mut">Custom range</span>
        <div className="flex" style={{ gap: 8 }}>
          <input type="date" className="m-in" aria-label="From" value={from} max={to} onChange={(e) => e.target.value && setFrom(e.target.value)} />
          <input type="date" className="m-in" aria-label="To" value={to} min={from} onChange={(e) => e.target.value && setTo(e.target.value)} />
        </div>
      </div>
      <button type="button" className="m-btn wide" disabled={from > to} onClick={() => onCustom(from, to)}>
        Show custom range
      </button>
    </Sheet>
  );
}
