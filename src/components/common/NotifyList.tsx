import { useState } from 'react';
import { NOTIFY_OPTIONS, notificationPermission, requestNotificationPermission, type NotifyPermission } from '../../services/notifications';

const labelClass = 'font-label-sm text-label-sm text-on-surface-variant uppercase tracking-[0.16em]';
const fieldClass =
  'w-full min-w-0 bg-surface-container-low border border-outline-variant focus:border-primary rounded-xl py-2.5 px-4 max-lg:px-3 font-body-md text-body-md text-on-surface outline-none transition-colors';

const CUSTOM = 'custom';
const MAX_ITEMS = 5;

/** Local `YYYY-MM-DDTHH:mm`, the value format of a datetime-local input. */
export function toDateTimeValue(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** True when `minutes` is one of the dropdown's preset leads. */
export function isPresetLead(minutes: number | null | undefined): boolean {
  return NOTIFY_OPTIONS.some((o) => o.value !== null && o.value === minutes);
}

/**
 * One notification row: a preset lead in minutes before the anchor, or a
 * custom moment (datetime-local value) when `customAt` is set.
 */
export interface NotifyItem {
  lead: number | null;
  customAt: string;
}

interface NotifyListProps {
  items: NotifyItem[];
  onChange: (items: NotifyItem[]) => void;
  /** What the leads count back from; null when there is nothing (presets then disabled). */
  anchor: Date | null;
  /** Label of the 0-minute option, e.g. "At the start" / "At due time". */
  zeroLabel?: string;
  /** Explains why the presets are unavailable while `anchor` is null. */
  noAnchorHint?: string;
}

function nextFullHour(): Date {
  const d = new Date();
  d.setHours(d.getHours() + 1, 0, 0, 0);
  return d;
}

/**
 * The "Notification" field shared by the event and task editors: one or more
 * rows, each a lead before the anchor or "Custom time…" with a picker.
 */
export function NotifyList({ items, onChange, anchor, zeroLabel, noAnchorHint }: NotifyListProps) {
  const [permission, setPermission] = useState<NotifyPermission>(notificationPermission);
  // With nothing set, one row still shows, reading "Don't notify".
  const rows = items.length > 0 ? items : [{ lead: null, customAt: '' }];
  const askPermission = () => {
    // Ask while the user is choosing — browsers only prompt on a gesture.
    if (permission === 'default') void requestNotificationPermission().then(setPermission);
  };

  const customDefault = (lead: number | null) => {
    const base = anchor ? new Date(anchor.getTime() - (lead ?? 15) * 60_000) : null;
    return toDateTimeValue(base && base.getTime() > Date.now() ? base : nextFullHour());
  };

  const setRow = (i: number, v: string) => {
    if (v === 'none') return onChange(items.filter((_, j) => j !== i));
    const row: NotifyItem = v === CUSTOM ? { lead: null, customAt: customDefault(rows[i].lead) } : { lead: Number(v), customAt: '' };
    const next = [...rows];
    next[i] = row;
    onChange(next);
    askPermission();
  };

  const addRow = () => {
    // A preset not used yet when there is something to count from, else a custom time.
    const used = new Set(items.filter((r) => !r.customAt).map((r) => r.lead));
    const free = anchor ? NOTIFY_OPTIONS.find((o) => o.value !== null && !used.has(o.value)) : undefined;
    onChange([...items, free ? { lead: free.value, customAt: '' } : { lead: null, customAt: customDefault(null) }]);
    askPermission();
  };

  const active = items.length > 0;

  return (
    <div className="flex flex-col gap-2">
      <label className={labelClass}>Notification</label>
      {rows.map((row, i) => {
        const selected = row.customAt ? CUSTOM : row.lead === null || !anchor ? 'none' : String(row.lead);
        return (
          <div key={i} className="flex flex-col gap-2">
            <div className="flex items-center gap-2">
              <select
                value={selected}
                aria-label={rows.length > 1 ? `Notification ${i + 1}` : 'Notification'}
                onChange={(e) => setRow(i, e.target.value)}
                className={`${fieldClass} flex-1 appearance-none cursor-pointer`}
              >
                {NOTIFY_OPTIONS.map((o) => (
                  <option
                    key={o.label}
                    value={o.value === null ? 'none' : String(o.value)}
                    disabled={o.value !== null && !anchor}
                  >
                    {o.value === null && rows.length > 1 ? 'Remove' : o.value === 0 && zeroLabel ? zeroLabel : o.label}
                  </option>
                ))}
                <option value={CUSTOM}>Custom time…</option>
              </select>
              {/* Any set row can be removed; the placeholder "Don't notify" row cannot. */}
              {active && (
                <button
                  type="button"
                  onClick={() => onChange(items.filter((_, j) => j !== i))}
                  aria-label={rows.length > 1 ? `Remove notification ${i + 1}` : 'Remove notification'}
                  className="flex-shrink-0 w-10 h-10 flex items-center justify-center rounded-xl text-on-surface-variant hover:text-error hover:bg-surface-container transition-colors"
                >
                  <span className="material-symbols-outlined text-[18px]">close</span>
                </button>
              )}
            </div>
            {row.customAt && (
              <input
                type="datetime-local"
                aria-label={rows.length > 1 ? `Notification ${i + 1} time` : 'Notification time'}
                value={row.customAt}
                // iOS "Clear" empties the field; keep the last time until the row is removed.
                onChange={(e) => {
                  if (!e.target.value) return;
                  const next = [...rows];
                  next[i] = { lead: null, customAt: e.target.value };
                  onChange(next);
                }}
                className={fieldClass}
              />
            )}
          </div>
        );
      })}
      {active && items.length < MAX_ITEMS && (
        <button
          type="button"
          onClick={addRow}
          className="self-start inline-flex items-center gap-1 font-label-sm text-label-sm text-primary uppercase tracking-[0.1em] py-1"
        >
          <span className="material-symbols-outlined text-[16px]">add</span>
          Add notification
        </button>
      )}
      {!anchor && !items.some((r) => r.customAt) && noAnchorHint && (
        <p className="font-body-sm text-body-sm text-on-surface-variant">{noAnchorHint}</p>
      )}
      {active && permission !== 'granted' && (
        <p className="font-body-sm text-body-sm text-on-surface-variant">
          {permission === 'denied'
            ? 'Notifications are blocked for this site — allow them in the browser settings.'
            : permission === 'unsupported'
              ? 'This browser does not support notifications.'
              : 'Notifications are not allowed yet — the reminder will not show.'}
          {permission === 'default' && (
            <>
              {' '}
              <button
                type="button"
                onClick={() => void requestNotificationPermission().then(setPermission)}
                className="text-primary underline underline-offset-2"
              >
                Allow
              </button>
            </>
          )}
        </p>
      )}
    </div>
  );
}
