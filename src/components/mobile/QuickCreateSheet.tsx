import { useState } from 'react';
import type { Subject } from '../../types';
import { Sheet } from './Sheet';
import { formatDuration, timeFromDate } from '../../utils/time';
import { parseEstimate } from '../../utils/estimate';

const LENGTHS = [30, 45, 60, 90];
const STEP = 15;
/** A typed length may go below the chips' step. */
const MIN_CUSTOM = 5;

interface QuickCreateSheetProps {
  start: Date;
  end: Date;
  kind: 'real' | 'plan';
  subjects: Subject[];
  /** New length or kind; the draft block on the timeline follows. */
  onChange: (next: { end: Date; kind: 'real' | 'plan' }) => void;
  /** One tap on a subject saves the block straight away. */
  onPick: (subjectId: string) => void;
  /** Open the full editor (notes, reminders, repeat, custom title). */
  onMore: (custom: boolean) => void;
  onClose: () => void;
}

/**
 * Phone: a tap on an empty slot (or the + button) opens this instead of the
 * full form. Length chips, Plan / Real, and one tap on a subject creates the
 * block; anything else goes through "More".
 */
export function QuickCreateSheet({ start, end, kind, subjects, onChange, onPick, onMore, onClose }: QuickCreateSheetProps) {
  const minutes = Math.max(MIN_CUSTOM, Math.round((end.getTime() - start.getTime()) / 60000));
  const setLength = (m: number, min = STEP) => onChange({ end: new Date(start.getTime() + Math.max(min, m) * 60000), kind });
  const day = start.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });
  const title = kind === 'plan' ? 'New plan' : 'New session';
  // Custom length: the Custom chip turns into a field ("80", "1h20", "1:20").
  const [custom, setCustom] = useState<string | null>(null);
  const applyCustom = () => {
    const m = custom === null ? undefined : parseEstimate(custom);
    if (m) setLength(m, MIN_CUSTOM);
    setCustom(null);
  };

  return (
    <Sheet label={title} onClose={onClose}>
      <div className="m-shd">
        <div className="flex flex-col min-w-0">
          <h2 className="m-h2">{title}</h2>
          <span className="m-sm m-mut m-num">
            {day} · {timeFromDate(start.toISOString())} - {timeFromDate(end.toISOString())}
          </span>
        </div>
        <button type="button" className="m-ib" aria-label="Close" onClick={onClose}>
          <span className="material-symbols-outlined m-ic">close</span>
        </button>
      </div>

      <div className="m-seg" role="radiogroup" aria-label="Event kind">
        {(['plan', 'real'] as const).map((k) => (
          <button key={k} type="button" role="radio" aria-checked={kind === k} className={kind === k ? 'on' : ''} onClick={() => onChange({ end, kind: k })}>
            {k === 'plan' ? 'Plan' : 'Real'}
          </button>
        ))}
      </div>

      <div className="m-fld">
        <span className="m-lbl m-mut">Length</span>
        <div className="m-scx">
          <button type="button" className="m-chip sq" aria-label="Shorter by 15 minutes" disabled={minutes <= STEP} onClick={() => setLength(minutes - STEP)}>
            <span className="material-symbols-outlined m-ic s">remove</span>
          </button>
          {LENGTHS.map((m) => (
            <button key={m} type="button" className={`m-chip ${minutes === m ? 'on' : ''}`} aria-pressed={minutes === m} onClick={() => setLength(m)}>
              {formatDuration(m)}
            </button>
          ))}
          {custom !== null ? (
            <form
              className="m-chip on"
              style={{ padding: '0 10px' }}
              onSubmit={(e) => {
                e.preventDefault();
                applyCustom();
              }}
            >
              <input
                autoFocus
                value={custom}
                onChange={(e) => setCustom(e.target.value)}
                onBlur={applyCustom}
                onKeyDown={(e) => e.key === 'Escape' && setCustom(null)}
                placeholder="1h 20m"
                aria-label="Custom length"
                enterKeyHint="done"
                className="m-num bg-transparent border-0 outline-none text-[16px] text-inherit placeholder:text-on-surface-variant"
                style={{ width: 72 }}
              />
            </form>
          ) : (
            <button
              type="button"
              className={`m-chip ${LENGTHS.includes(minutes) ? '' : 'on'}`}
              aria-label={LENGTHS.includes(minutes) ? 'Custom length' : `Length ${formatDuration(minutes)}, change`}
              onClick={() => setCustom(LENGTHS.includes(minutes) ? '' : formatDuration(minutes))}
            >
              {LENGTHS.includes(minutes) ? (
                <>
                  <span className="material-symbols-outlined m-ic s m-mut">edit</span>
                  Custom
                </>
              ) : (
                formatDuration(minutes)
              )}
            </button>
          )}
          <button type="button" className="m-chip sq" aria-label="Longer by 15 minutes" onClick={() => setLength(minutes + STEP)}>
            <span className="material-symbols-outlined m-ic s">add</span>
          </button>
        </div>
      </div>

      <div className="m-fld">
        <span className="m-lbl m-mut">Tap a subject to add</span>
        <div className="m-wrap">
          {subjects.map((s) => (
            <button key={s.id} type="button" className="m-chip" onClick={() => onPick(s.id)}>
              <span className="m-sw" style={{ background: s.color }} />
              {s.name}
            </button>
          ))}
          <button type="button" className="m-chip" onClick={() => onMore(true)}>
            <span className="material-symbols-outlined m-ic s m-mut">edit</span>
            Custom event
          </button>
        </div>
      </div>

      <button type="button" className="m-btn wide" style={{ justifyContent: 'space-between' }} onClick={() => onMore(false)}>
        <span>More: notes, reminders, repeat</span>
        <span className="material-symbols-outlined m-ic s">expand_less</span>
      </button>
    </Sheet>
  );
}
