import { useState } from 'react';
import type { CalendarView, EventFilter } from '../../types';
import { Sheet } from '../mobile/Sheet';
import { redo, redoLabel, undo, undoLabel } from '../../services/history';
import { dateKey } from '../../utils/time';

/** Parts of the phone day view, picked with its floating switch (mobile/PanelPill). */
export const DAY_PANELS = ['timeline', 'stats', 'tasks', 'notes'] as const;
export type DayPanel = (typeof DAY_PANELS)[number];

interface ViewSettingsSheetProps {
  view: CalendarView;
  onViewChange: (view: CalendarView) => void;
  eventFilter: EventFilter;
  onEventFilterChange: (filter: EventFilter) => void;
  date: Date;
  onDateChange: (date: Date) => void;
  onClose: () => void;
}

/**
 * Views the mobile layout can render. Week stays out — its seven day columns
 * cannot be read on a phone. The month and year grids fit, and their days open
 * the day view, so the phone gets the same overview-to-detail path as a PC.
 */
const MOBILE_VIEWS = ['day', '3day', 'month', 'year'] as const;

const VIEW_LABELS: Record<(typeof MOBILE_VIEWS)[number], string> = {
  day: 'Day',
  '3day': '3 days',
  month: 'Month',
  year: 'Year',
};

/**
 * Phone view sheet, opened from the date title or a double tap on the
 * floating switch: the range, which kinds are shown, a date to jump to, and
 * Undo / Redo (the phone has no Ctrl+Z) with the name of the action they would revert.
 */
export function ViewSettingsSheet({ view, onViewChange, eventFilter, onEventFilterChange, date, onDateChange, onClose }: ViewSettingsSheetProps) {
  // Re-read the history labels after each Undo / Redo press.
  const [, setTick] = useState(0);
  const undoName = undoLabel();
  const redoName = redoLabel();

  return (
    <Sheet label="View settings" onClose={onClose}>
      <div className="m-shd">
        <h2 className="m-h2">View</h2>
        <button type="button" className="m-ib" aria-label="Close view settings" onClick={onClose}>
          <span className="material-symbols-outlined m-ic">close</span>
        </button>
      </div>

      <div className="m-fld">
        <span className="m-lbl m-mut" id="m-view-range">Range</span>
        <div className="m-seg" role="radiogroup" aria-labelledby="m-view-range">
          {MOBILE_VIEWS.map((v) => (
            <button key={v} type="button" role="radio" aria-checked={view === v} className={view === v ? 'on' : ''} onClick={() => onViewChange(v)}>
              {VIEW_LABELS[v]}
            </button>
          ))}
        </div>
      </div>

      {view !== 'year' && (
        <div className="m-fld">
          <span className="m-lbl m-mut" id="m-view-show">Show</span>
          <div className="m-seg" role="radiogroup" aria-labelledby="m-view-show">
            {(['real', 'plan', 'all'] as const).map((f) => (
              <button key={f} type="button" role="radio" aria-checked={eventFilter === f} className={eventFilter === f ? 'on' : ''} onClick={() => onEventFilterChange(f)}>
                {f === 'real' ? 'Real' : f === 'plan' ? 'Plan' : 'All'}
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="m-fld">
        <label className="m-lbl m-mut" htmlFor="m-view-date">Go to date</label>
        <input
          id="m-view-date"
          type="date"
          className="m-in"
          value={dateKey(date)}
          onChange={(e) => {
            const [y, m, d] = e.target.value.split('-').map(Number);
            if (y && m && d) onDateChange(new Date(y, m - 1, d, date.getHours(), date.getMinutes()));
          }}
        />
      </div>

      <div className="m-fld">
        <span className="m-lbl m-mut">History</span>
        <div className="flex" style={{ gap: 8 }}>
          <button
            type="button"
            className="m-btn flex-1 justify-start min-w-0"
            disabled={!undoName}
            onClick={() => {
              undo();
              setTick((t) => t + 1);
            }}
          >
            <span className="material-symbols-outlined m-ic s">undo</span>
            <span className="m-tr">{undoName ? `Undo: ${undoName.toLowerCase()}` : 'Nothing to undo'}</span>
          </button>
          <button
            type="button"
            className="m-btn"
            disabled={!redoName}
            aria-label={redoName ? `Redo: ${redoName.toLowerCase()}` : 'Redo'}
            onClick={() => {
              redo();
              setTick((t) => t + 1);
            }}
          >
            <span className="material-symbols-outlined m-ic s">redo</span>
            Redo
          </button>
        </div>
      </div>
    </Sheet>
  );
}
