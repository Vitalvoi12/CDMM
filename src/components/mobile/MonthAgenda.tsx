import { useMemo } from 'react';
import type { CalendarEvent, EventFilter, Subject } from '../../types';
import { getEventsForDate, calculateDailyStats, countsTowardStats, liveEventForDate, type LiveSessionRef } from '../../utils/stats';
import { dateKey, daysInMonth, formatDuration, minutesBetween, startOfMonth, timeFromDate } from '../../utils/time';
import { eventFillColor } from '../../utils/color';

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
/** Bars a day cell shows; more events still count in the agenda below. */
const MAX_BARS = 3;

interface MonthAgendaProps {
  /** The selected day; its month is the one shown. */
  date: Date;
  events: CalendarEvent[];
  subjects: Subject[];
  mode?: EventFilter;
  liveSession?: LiveSessionRef | null;
  onSelect: (day: Date) => void;
  onOpenDay: (day: Date) => void;
  onEventClick: (event: CalendarEvent) => void;
}

/**
 * The phone's month view: a compact grid where every day carries a bar per
 * event (filled = real, outlined = plan), and under it the selected day's
 * agenda with its focus total and an "Open day" button. A tap on a day
 * selects it; the agenda then lists that day.
 */
export function MonthAgenda({ date, events, subjects, mode = 'all', liveSession = null, onSelect, onOpenDay, onEventClick }: MonthAgendaProps) {
  const subjectMap = useMemo(() => new Map(subjects.map((s) => [s.id, s])), [subjects]);
  const shown = (e: CalendarEvent) => mode === 'all' || (e.kind ?? 'real') === mode;
  const todayKey = dateKey(new Date());
  const selKey = dateKey(date);

  // Whole weeks, Monday first; the neighbouring months' days fill the edges.
  const cells = useMemo(() => {
    const first = startOfMonth(date);
    const lead = (first.getDay() + 6) % 7;
    const total = Math.ceil((lead + daysInMonth(date)) / 7) * 7;
    return Array.from({ length: total }, (_, i) => new Date(first.getFullYear(), first.getMonth(), 1 - lead + i));
  }, [date]);

  const dayEvents = (day: Date) =>
    getEventsForDate(events, day)
      .filter(shown)
      .sort((a, b) => Date.parse(a.start) - Date.parse(b.start));

  // The selected day's agenda, the running session included.
  const now = Date.now();
  const live = mode !== 'plan' ? liveEventForDate(liveSession, date, now) : null;
  const agenda = live ? [...dayEvents(date), live].sort((a, b) => Date.parse(a.start) - Date.parse(b.start)) : dayEvents(date);
  const focus = calculateDailyStats(agenda, date).totalMinutes;
  const sessions = agenda.filter(countsTowardStats).length;
  const dayLabel = date.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });

  return (
    <div className="flex flex-col">
      <div className="m-mwd m-lbl m-mut" aria-hidden="true">
        {WEEKDAYS.map((d) => (
          <span key={d}>{d}</span>
        ))}
      </div>
      <div className="m-mg">
        {cells.map((d) => {
          const key = dateKey(d);
          const out = d.getMonth() !== date.getMonth();
          const evs = dayEvents(d);
          return (
            <button
              key={key}
              type="button"
              aria-label={`${d.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}${evs.length ? `, ${evs.length} event${evs.length === 1 ? '' : 's'}` : ''}`}
              aria-pressed={key === selKey}
              className={`m-mc ${out ? 'out' : ''} ${key === selKey ? 'sel' : ''} ${key === todayKey ? 'today' : ''}`}
              onClick={() => onSelect(d)}
            >
              <b>{d.getDate()}</b>
              {evs.slice(0, MAX_BARS).map((e) => (
                <i key={e.id} className={e.kind === 'plan' ? 'p' : ''} style={{ '--c': eventFillColor(e, subjectMap.get(e.subjectId)) } as React.CSSProperties} />
              ))}
            </button>
          );
        })}
      </div>

      <div className="flex items-center justify-between" style={{ minHeight: 56, padding: '0 8px 0 16px', marginTop: 10, borderTop: '1px solid var(--color-outline-variant)' }}>
        <div className="flex flex-col min-w-0">
          <span className="font-semibold">{dayLabel}</span>
          <span className="m-sm m-mut m-num">
            {sessions ? `${formatDuration(focus)} focus · ${sessions} session${sessions === 1 ? '' : 's'}` : 'No sessions'}
          </span>
        </div>
        <button type="button" className="m-btn" onClick={() => onOpenDay(date)}>
          Open day<span className="material-symbols-outlined m-ic s">arrow_forward</span>
        </button>
      </div>

      {agenda.length === 0 && (
        <p className="m-sm m-mut" style={{ padding: '12px 16px', borderTop: '1px solid var(--color-outline-variant)' }}>
          Nothing on this day.
        </p>
      )}
      {agenda.map((e) => {
        const subject = subjectMap.get(e.subjectId);
        const isLive = e.id === '__live__';
        const plan = e.kind === 'plan';
        return (
          <button key={e.id} type="button" className="m-ag" disabled={isLive} onClick={() => onEventClick(e)}>
            <span className="tm m-num">{timeFromDate(e.start)}</span>
            <span className={`bk ${plan ? 'p' : ''}`} style={{ '--c': eventFillColor(e, subject) } as React.CSSProperties} />
            <span className="flex-1 m-tr text-left">{subject?.name || e.title || 'Untitled'}</span>
            <span className="m-sm m-mut m-num" style={isLive ? { color: 'var(--color-now)' } : undefined}>
              {isLive ? 'Live' : plan ? 'Plan' : formatDuration(minutesBetween(e.start, e.end))}
            </span>
          </button>
        );
      })}
    </div>
  );
}
