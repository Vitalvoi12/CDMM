import { useEffect, useRef, useState, type ReactNode } from 'react';
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
 * Phone Statistics: period chips, then a row of jump chips — one per block,
 * the one in view highlighted — over the same blocks as the desktop.
 */
export function Statistics({ summary, preset, onPreset, customFrom, customTo, onCustom, panels }: StatisticsProps) {
  const paneRef = useRef<HTMLDivElement>(null);
  const sectionRefs = useRef<Partial<Record<JumpId, HTMLDivElement | null>>>({});
  const chipRefs = useRef<Partial<Record<JumpId, HTMLButtonElement | null>>>({});
  const [active, setActive] = useState<JumpId>('subjects');
  // Blocks that rendered nothing (e.g. no weekly goals) get no chip.
  const [present, setPresent] = useState<JumpId[]>(JUMPS.map((j) => j.id));
  // While a jump scrolls the pane, the scroll spy must not fight it.
  const jumpingUntil = useRef(0);

  useEffect(() => {
    const next = JUMPS.map((j) => j.id).filter((id) => (sectionRefs.current[id]?.childElementCount ?? 0) > 0);
    setPresent((prev) => (prev.join() === next.join() ? prev : next));
  });

  useEffect(() => {
    const pane = paneRef.current;
    if (!pane) return;
    const onScroll = () => {
      if (Date.now() < jumpingUntil.current) return;
      let current: JumpId = present[0] ?? 'subjects';
      for (const id of present) {
        const el = sectionRefs.current[id];
        if (el && el.offsetTop - pane.scrollTop <= 40) current = id;
      }
      // At the very bottom the last block counts as in view.
      if (pane.scrollTop + pane.clientHeight >= pane.scrollHeight - 4) current = present[present.length - 1] ?? current;
      setActive(current);
    };
    pane.addEventListener('scroll', onScroll, { passive: true });
    return () => pane.removeEventListener('scroll', onScroll);
  }, [present]);

  // Keep the highlighted chip in sight within its own row.
  useEffect(() => {
    const chip = chipRefs.current[active];
    const row = chip?.parentElement;
    if (!chip || !row) return;
    const left = chip.offsetLeft - row.offsetLeft;
    if (left < row.scrollLeft || left + chip.offsetWidth > row.scrollLeft + row.clientWidth) {
      row.scrollTo({ left: Math.max(0, left - 12), behavior: 'smooth' });
    }
  }, [active]);

  const jump = (id: JumpId) => {
    const pane = paneRef.current;
    const el = sectionRefs.current[id];
    if (!pane || !el) return;
    setActive(id);
    jumpingUntil.current = Date.now() + 700;
    pane.scrollTo({ top: el.offsetTop - 8, behavior: 'smooth' });
  };

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
      <nav className="m-scx" aria-label="Jump to" style={{ padding: '8px 12px 0' }}>
        {JUMPS.filter((j) => present.includes(j.id)).map((j) => (
          <button
            key={j.id}
            ref={(el) => {
              chipRefs.current[j.id] = el;
            }}
            type="button"
            aria-current={active === j.id ? 'true' : undefined}
            onClick={() => jump(j.id)}
            className="m-lbl flex-none flex items-center"
            style={{
              height: 44,
              padding: '0 14px',
              borderRadius: 9.6,
              border: `1px solid ${active === j.id ? 'var(--color-outline)' : 'var(--color-outline-variant)'}`,
              background: active === j.id ? 'var(--color-secondary-container)' : 'none',
              color: active === j.id ? 'var(--color-on-secondary-container)' : 'var(--color-on-surface-variant)',
            }}
          >
            {j.label}
          </button>
        ))}
      </nav>

      <div ref={paneRef} className="relative flex-1 min-h-0 overflow-y-auto overscroll-contain" style={{ padding: '16px 16px 24px', marginTop: 4 }}>
        {JUMPS.map((j) => (
          <div
            key={j.id}
            ref={(el) => {
              sectionRefs.current[j.id] = el;
            }}
          >
            {panels[j.id]}
          </div>
        ))}
      </div>
    </div>
  );
}
