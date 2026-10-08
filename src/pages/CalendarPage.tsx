import { useMemo, useCallback, useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate, useLocation } from 'react-router-dom';
import { DateHeader } from '../components/calendar/DateHeader';
import { Timeline } from '../components/calendar/Timeline';
import { MultiDayView } from '../components/calendar/MultiDayView';
import { MonthView } from '../components/calendar/MonthView';
import { YearView } from '../components/calendar/YearView';
import { StatsSidebar } from '../components/calendar/StatsSidebar';
import { SubjectTasksPanel } from '../components/calendar/SubjectTasksPanel';
import { DayNotesPanel } from '../components/calendar/DayNotesPanel';
import { useOverscrollSpring } from '../hooks/useOverscrollSpring';
import { EventForm } from '../components/calendar/EventForm';
import { useCalendarNavigation } from '../hooks/useCalendarNavigation';
import { useActiveSession } from '../hooks/useActiveSession';
import { useIsMobile } from '../hooks/useIsMobile';
import { useSyncRefresh } from '../hooks/useServerSync';
import { useSwipeNav } from '../hooks/useSwipeNav';
import { useButtonSwipe } from '../hooks/useViewSwipe';
import { eventRepo, subjectRepo, tombstoneRepo, genId } from '../services/repositories';
import { getEventsForDate, calculateDailyStats, liveEventForDate } from '../utils/stats';
import { expandRecurrence, dateKey } from '../utils/time';
import type { EventRecurrence } from '../components/calendar/EventForm';
import { RecurrenceScopeDialog, type RecurrenceScope } from '../components/calendar/RecurrenceScopeDialog';
import { ViewSettingsSheet } from '../components/calendar/ViewSettingsSheet';
import { checkpoint } from '../services/history';
import type { CalendarEvent, EventChecklistItem, EventFilter } from '../types';

/** Mobile day panels in tab order (the vertical swipe walks this list). */
const DAY_PANELS = ['timeline', 'stats', 'tasks', 'notes'] as const;

const VIEWS: { id: 'day' | '3day' | 'week' | 'month' | 'year'; label: string }[] = [
  { id: 'day', label: 'Day' },
  { id: '3day', label: '3D' },
  { id: 'week', label: 'Week' },
  { id: 'month', label: 'Month' },
  { id: 'year', label: 'Year' },
];

const FILTERS: { id: EventFilter; label: string; title: string }[] = [
  { id: 'real', label: 'Real', title: 'Show real sessions only' },
  { id: 'plan', label: 'Plan', title: 'Show planned events only' },
  // On timelines 'all' splits a day into Real|Plan columns; the month grid has
  // no room to split, so it lists both kinds in one column by start time.
  { id: 'all', label: 'All', title: 'Show real & plan together' },
];

function loadEventFilter(): EventFilter {
  const saved = localStorage.getItem('cdmm.event-filter');
  return saved === 'real' || saved === 'plan' || saved === 'all' ? saved : 'all';
}

/** Other occurrences of the same repeating series (empty for standalone events). */
function getSeriesSiblings(event: CalendarEvent): CalendarEvent[] {
  if (!event.recurrenceId) return [];
  return eventRepo
    .getAll()
    .filter((e) => e.id !== event.id && e.recurrenceId && e.recurrenceId === event.recurrenceId)
    .sort((a, b) => new Date(a.start).getTime() - new Date(b.start).getTime());
}

interface PendingRecurrence {
  mode: 'save' | 'delete';
  eventId: string;
  /** Baseline start of the target at dialog-open (for the shift delta). */
  targetStart: number;
  /** Baseline end of the target at dialog-open (for duration changes). */
  targetEnd: number;
  /** Series mates at/after the target, snapshotted at dialog-open. */
  followingIds: string[];
  data: {
    subjectId: string;
    title: string;
    description?: string;
    start: Date;
    end: Date;
    kind: 'real' | 'plan';
    countInStats: boolean;
    color?: string;
    checklist?: EventChecklistItem[];
    notifyBefore: number | null;
  } | null;
}

/** Ids of same-series occurrences at/after `targetStartMs` (excluding target id). */
function followingIdsOf(target: CalendarEvent, targetStartMs: number): string[] {
  if (!target.recurrenceId) return [];
  return eventRepo
    .getAll()
    .filter(
      (e) =>
        e.id !== target.id &&
        e.recurrenceId &&
        e.recurrenceId === target.recurrenceId &&
        new Date(e.start).getTime() >= targetStartMs
    )
    .sort((a, b) => new Date(a.start).getTime() - new Date(b.start).getTime())
    .map((e) => e.id);
}

export function CalendarPage() {
  const springRef = useOverscrollSpring<HTMLDivElement>();
  const { currentDate, setCurrentDate, view, setView, goToToday, goToPrevious, goToNext } =
    useCalendarNavigation();
  const isMobile = useIsMobile();
  const location = useLocation();
  const [events, setEvents] = useState<CalendarEvent[]>(eventRepo.getAll());
  const { isActive, subjectId, startTime, elapsed } = useActiveSession();
  // When the last panel swipe was decided — see panelSwipe below.
  const panelSwipeAtRef = useRef(0);
  const navigate = useNavigate();

  // Deep link from the Statistics heatmap: jump to the tapped day.
  useEffect(() => {
    const state = location.state as { selectedDate?: number } | null;
    if (state?.selectedDate) {
      setCurrentDate(new Date(state.selectedDate));
      setView('day');
      navigate('.', { replace: true, state: null });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.state]);

  const subjects = subjectRepo.getAll();

  const [editingEvent, setEditingEvent] = useState<CalendarEvent | null>(null);
  const [creatingEvent, setCreatingEvent] = useState<{ start: Date; end?: Date; kind: 'real' | 'plan' } | null>(null);
  const [pendingRecurrence, setPendingRecurrence] = useState<PendingRecurrence | null>(null);
  // Snapshot of the event before a drag/resize committed it, so the editor's
  // Cancel can roll the change back — and so a series-wide edit can measure
  // its shift against the pre-drag time (not the already-moved repo copy).
  const [dragUndo, setDragUndo] = useState<{
    id: string;
    start: string;
    end: string;
    recurrenceId?: string | null;
  } | null>(null);
  const [dayPanel, setDayPanel] = useState<(typeof DAY_PANELS)[number]>('timeline');
  // Mobile view-settings sheet (tune icon next to Today).
  const [viewSettingsOpen, setViewSettingsOpen] = useState(false);
  // Desktop day view: the right column shows either statistics or tasks.
  const [asidePanel, setAsidePanel] = useState<'stats' | 'tasks' | 'notes'>('stats');
  // Which event kinds the calendars show. 'all' splits timeline days into
  // Real|Plan halves and lists the month cells in one column; 'real'/'plan'
  // renders a single full-width column. Persisted.
  const [eventFilter, setEventFilterState] = useState<EventFilter>(loadEventFilter);
  const setEventFilter = useCallback((f: EventFilter) => {
    setEventFilterState(f);
    try {
      localStorage.setItem('cdmm.event-filter', f);
    } catch {
      // storage unavailable — ignore
    }
  }, []);
  const modalOpen = Boolean(editingEvent || creatingEvent || pendingRecurrence);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const isEditing = target && (
        target.tagName === 'INPUT' ||
        target.tagName === 'TEXTAREA' ||
        target.tagName === 'SELECT' ||
        target.isContentEditable
      );
      if (isEditing || modalOpen || e.ctrlKey || e.metaKey || e.altKey) return;

      // Day view: Up/Down cycle the panels and wrap around, so holding one
      // key keeps going. Desktop walks the side panel Stat → Tasks → Notes →
      // Stat; the mobile layout (iPad keyboard) walks Day → Stat → Tasks →
      // Notes → Day. Up goes forward, Down back (like swiping up on mobile).
      if (view === 'day' && (e.key === 'ArrowUp' || e.key === 'ArrowDown')) {
        e.preventDefault();
        const step = e.key === 'ArrowUp' ? 1 : -1;
        const cycle = <T,>(order: readonly T[], p: T) => order[(order.indexOf(p) + step + order.length) % order.length];
        if (isMobile) setDayPanel((p) => cycle(DAY_PANELS, p));
        else setAsidePanel((p) => cycle(['stats', 'tasks', 'notes'] as const, p));
        return;
      }

      if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
        e.preventDefault();
        goToPrevious();
        return;
      }
      if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
        e.preventDefault();
        goToNext();
        return;
      }

      // Layout-independent letters/digits: e.code is the physical key, so the
      // shortcuts keep working on the Russian layout (r → к, p → з, a → ф).
      // e.key stays as the fallback for layouts without a usable code.
      const letter = /^Key[A-Z]$/.test(e.code) ? e.code.slice(3).toLowerCase() : '';
      const digit = /^Digit[0-9]$/.test(e.code) ? e.code.slice(5) : '';
      const key = letter || digit || e.key.toLowerCase();
      if (!isMobile && key === '3') setView('3day');
      // D: first jump to the day view, then cycle the side panel Stat → Tasks → Notes.
      // On mobile it cycles the same tabs (from the timeline it lands on Stat).
      else if (key === 'd') {
        if (!isMobile && view !== 'day') setView('day');
        else if (!isMobile) setAsidePanel((p) => (p === 'stats' ? 'tasks' : p === 'tasks' ? 'notes' : 'stats'));
        else setDayPanel((p) => (p === 'stats' ? 'tasks' : p === 'tasks' ? 'notes' : 'stats'));
      }
      // Week stays desktop-only: the view is not in the mobile set, so an
      // unguarded press would set it and immediately be bounced back to day.
      else if (!isMobile && key === 'w') setView('week');
      // Month is available on mobile too (the sheet's View row mirrors this),
      // so the shortcut is not gated like week.
      else if (key === 'm') setView('month');
      else if (key === 'r') setEventFilter('real');
      else if (key === 'p') setEventFilter('plan');
      else if (key === 'a') setEventFilter('all');
      // N opens a new event, same defaults as the New event button.
      else if (key === 'n') {
        setCreatingEvent({ start: new Date(currentDate), kind: eventFilter === 'all' ? 'plan' : eventFilter });
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isMobile, modalOpen, view, eventFilter, currentDate, setEventFilter, setView, goToPrevious, goToNext]);

  const dayEvents = useMemo(() => getEventsForDate(events, currentDate), [events, currentDate]);

  // Comes from the synced session record, so the running block shows up on
  // every signed-in device — including one that only ever opens the calendar.
  const activeSession = useMemo(
    () => (isActive && subjectId && startTime ? { subjectId, start: startTime } : null),
    [isActive, subjectId, startTime]
  );

  // The day's statistics must include the running session: it has no stored
  // event yet (Finish writes it), so stats built from `dayEvents` alone would
  // stand still while the clock runs. Built separately because the timeline
  // renders the live session itself via LiveEventBlock — adding it to
  // `dayEvents` would draw the same block twice.
  const statsEvents = useMemo(() => {
    // The live end comes from the hook's own clock (start + elapsed), so the
    // total ticks with the timer instead of going stale until the next render.
    const now = activeSession ? new Date(activeSession.start).getTime() + elapsed : Date.now();
    const live = liveEventForDate(activeSession, currentDate, now);
    return live ? [...dayEvents, live] : dayEvents;
  }, [dayEvents, currentDate, activeSession, elapsed]);

  const stats = useMemo(
    () => calculateDailyStats(statsEvents, currentDate),
    [statsEvents, currentDate]
  );

  const refreshEvents = useCallback(() => {
    setEvents(eventRepo.getAll());
  }, []);

  // Checkbox in the day task panel: toggles one checklist item on its event.
  const handleChecklistToggle = useCallback(
    (eventId: string, itemId: string, done: boolean) => {
      // A completed swipe is followed by the browser's synthesized click on
      // the element under the finger. If that is the checkbox being flicked
      // over, it must not tick itself — the gesture was navigation.
      if (Date.now() - panelSwipeAtRef.current < 400) return;
      const stored = eventRepo.getById(eventId);
      if (!stored || !stored.checklist) return;
      checkpoint(done ? 'Complete event task' : 'Reopen event task');
      eventRepo.update(eventId, {
        checklist: stored.checklist.map((t) => (t.id === itemId ? { ...t, done } : t)),
      });
      refreshEvents();
    },
    [refreshEvents]
  );

  useSyncRefresh(
    useCallback(() => {
      refreshEvents();
    }, [refreshEvents])
  );

  useEffect(() => {
    refreshEvents();
  }, [refreshEvents]);

  // Month and year are reachable on mobile too: their grids are what fits a
  // narrow screen, and a tap on a day drops into the day view. The week
  // timeline stays desktop-only — seven columns cannot be read on a phone.
  useEffect(() => {
    if (isMobile && view !== 'day' && view !== '3day' && view !== 'month' && view !== 'year') {
      setView('day');
    }
  }, [isMobile, view, setView]);

  const handleEventClick = useCallback((event: CalendarEvent) => {
    setEditingEvent(event);
  }, []);

  const handleDaySelect = useCallback(
    (d: Date) => {
      setCurrentDate(d);
      setView('day');
    },
    [setCurrentDate, setView]
  );

  const handleTimelineBackgroundClick = useCallback(
    (start: Date, kind: 'real' | 'plan', end?: Date) => {
      setCreatingEvent({ start, end, kind });
    },
    []
  );

  const handleEventSave = useCallback(
    (data: { subjectId: string; title: string; description?: string; start: Date; end: Date; kind: 'real' | 'plan'; countInStats: boolean; recurrence?: EventRecurrence; color?: string; checklist?: EventChecklistItem[]; notifyBefore: number | null }) => {
      if (editingEvent) {
        const stored = eventRepo.getById(editingEvent.id);
        const series = stored?.recurrenceId ? getSeriesSiblings(stored) : [];
        if (stored?.recurrenceId && series.length > 0) {
          // Member of a repeating series — ask whether to touch one or many.
          // Snapshot the series composition NOW so the pick below applies
          // deterministically even if the repo changes while the dialog is open.
          // Baseline the shift against the PRE-DRAG time when this editor
          // session followed a drag/resize: the move is already committed to
          // the repo copy, so measuring against it would yield a zero delta
          // and the following occurrences would never move. Same for duration:
          // a resize is already committed, so compare against pre-drag end.
          // "Following" membership is also measured from the baseline: after a
          // drag the target may sit exactly on (or past) a sibling that still
          // belongs to its series tail (e.g. dropped onto day 2 onto the old
          // day-2 occurrence) — judging by post-drag times would wrongly
          // exclude it and leave it frozen.
          const fromDrag = dragUndo && dragUndo.id === stored.id;
          const targetStart = fromDrag
            ? new Date(dragUndo.start).getTime()
            : new Date(stored.start).getTime();
          const targetEnd = fromDrag
            ? new Date(dragUndo.end).getTime()
            : new Date(stored.end).getTime();
          setPendingRecurrence({
            mode: 'save',
            eventId: stored.id,
            targetStart,
            targetEnd,
            followingIds: followingIdsOf(stored, targetStart),
            data,
          });
          return;
        }
        // A post-drag editor session is covered by the drag's checkpoint —
        // one Ctrl+Z must revert the whole move+edit gesture, not half of it.
        if (!(dragUndo && dragUndo.id === editingEvent.id)) checkpoint('Edit event');
        eventRepo.update(editingEvent.id, {
          subjectId: data.subjectId,
          title: data.title,
          description: data.description,
          start: data.start.toISOString(),
          end: data.end.toISOString(),
          kind: data.kind,
          countInStats: data.countInStats,
          color: data.color,
          checklist: data.checklist,
          notifyBefore: data.notifyBefore,
        });
      } else if (data.recurrence && data.recurrence.freq !== 'none') {
        const occurrences = expandRecurrence(
          data.start,
          data.end,
          data.recurrence.freq,
          data.recurrence.until
        );
        // Link occurrences into one series so later edits can target the group.
        const recurrenceId = occurrences.length > 1 ? genId() : undefined;
        checkpoint(occurrences.length > 1 ? `Create ${occurrences.length} events` : 'Create event');
        for (const occ of occurrences) {
          eventRepo.create({
            subjectId: data.subjectId,
            title: data.title,
            description: data.description,
            start: occ.start.toISOString(),
            end: occ.end.toISOString(),
            kind: data.kind,
            countInStats: data.countInStats,
            color: data.color,
            recurrenceId,
            checklist: data.checklist?.map((t) => ({ ...t, id: genId() })),
            notifyBefore: data.notifyBefore,
          });
        }
      } else {
        checkpoint('Create event');
        eventRepo.create({
          subjectId: data.subjectId,
          title: data.title,
          description: data.description,
          start: data.start.toISOString(),
          end: data.end.toISOString(),
          kind: data.kind,
          countInStats: data.countInStats,
          color: data.color,
          checklist: data.checklist,
          notifyBefore: data.notifyBefore,
        });
      }
      setEditingEvent(null);
      setCreatingEvent(null);
      setDragUndo(null);
      refreshEvents();
    },
    [editingEvent, dragUndo, refreshEvents]
  );

  const handleEventDelete = useCallback(
    (id: string) => {
      const event = eventRepo.getById(id);
      if (!event) return;
      if (event.recurrenceId && getSeriesSiblings(event).length > 0) {
        // Member of a repeating series — ask whether to delete one or many.
        // Membership from the pre-drag baseline, same as for save.
        const fromDrag = dragUndo && dragUndo.id === event.id;
        const targetStart = fromDrag
          ? new Date(dragUndo.start).getTime()
          : new Date(event.start).getTime();
        setPendingRecurrence({
          mode: 'delete',
          eventId: event.id,
          targetStart,
          targetEnd: new Date(event.end).getTime(),
          followingIds: followingIdsOf(event, targetStart),
          data: null,
        });
        return;
      }
      checkpoint('Delete event');
      tombstoneRepo.add('events', event.id);
      eventRepo.delete(id);
      setEditingEvent(null);
      setDragUndo(null);
      refreshEvents();
    },
    [refreshEvents, dragUndo]
  );

  /** Apply the scope chosen in the recurrence dialog, then close everything. */
  const handleRecurrencePick = useCallback(
    (scope: RecurrenceScope) => {
      const pending = pendingRecurrence;
      if (!pending) return;
      // Resolve against the snapshot taken at dialog-open: whatever still
      // exists gets updated, so a repo change behind the dialog can't result
      // in a silent no-op. The shift delta is measured against the snapshot
      // baseline (pre-drag when the editor followed a drag/resize), never
      // against the possibly already-moved repo copy.
      const target = eventRepo.getById(pending.eventId) || null;
      const baseStartMs = pending.targetStart;
      const following = pending.followingIds.flatMap((id) => {
        const rec = eventRepo.getById(id);
        return rec ? [rec] : [];
      });
      // A post-drag editor session is covered by the drag's checkpoint —
      // one Ctrl+Z must revert the whole move+edit gesture, not half of it.
      const precededByDrag = dragUndo != null && dragUndo.id === pending.eventId;
      if (!precededByDrag) {
        checkpoint(
          pending.mode === 'delete'
            ? (scope === 'following' ? `Delete ${following.length + (target ? 1 : 0)} events` : 'Delete event')
            : (scope === 'following' ? `Edit ${following.length + (target ? 1 : 0)} events` : 'Edit event')
        );
      }

      if (pending.mode === 'delete') {
        const victims = scope === 'following'
          ? [...(target ? [target] : []), ...following]
          : [...(target ? [target] : [])];
        for (const v of victims) {
          tombstoneRepo.add('events', v.id);
          eventRepo.delete(v.id);
        }
      } else if (pending.data) {
        const data = pending.data;
        if (scope === 'single') {
          // Detach from the series so later series-wide edits skip it.
          if (target) {
            eventRepo.update(target.id, {
              subjectId: data.subjectId,
              title: data.title,
              description: data.description,
              start: data.start.toISOString(),
              end: data.end.toISOString(),
              kind: data.kind,
              countInStats: data.countInStats,
              color: data.color,
              checklist: data.checklist,
              notifyBefore: data.notifyBefore,
              recurrenceId: null,
            });
          }
        } else {
          // Shift this and every later occurrence by the same delta,
          // keeping each one's start offset; if the edit also changed the
          // duration (resize), apply the new duration to all of them.
          const deltaMs = data.start.getTime() - baseStartMs;
          const newDurationMs = data.end.getTime() - data.start.getTime();
          const oldDurationMs = pending.targetEnd - pending.targetStart;
          const durationChanged = newDurationMs !== oldDurationMs;
          if (target) {
            eventRepo.update(target.id, {
              subjectId: data.subjectId,
              title: data.title,
              description: data.description,
              start: data.start.toISOString(),
              end: data.end.toISOString(),
              kind: data.kind,
              countInStats: data.countInStats,
              color: data.color,
              checklist: data.checklist,
              notifyBefore: data.notifyBefore,
            });
          }
          for (const s of following) {
            const shiftedStart = new Date(s.start).getTime() + deltaMs;
            const shiftedEnd = durationChanged
              ? shiftedStart + newDurationMs
              : new Date(s.end).getTime() + deltaMs;
            eventRepo.update(s.id, {
              subjectId: data.subjectId,
              title: data.title,
              description: data.description,
              start: new Date(shiftedStart).toISOString(),
              end: new Date(shiftedEnd).toISOString(),
              kind: data.kind,
              countInStats: data.countInStats,
              color: data.color,
              checklist: data.checklist?.map((t) => ({ ...t, id: genId() })),
              notifyBefore: data.notifyBefore,
            });
          }
        }
      }
      setPendingRecurrence(null);
      setEditingEvent(null);
      setDragUndo(null);
      refreshEvents();
    },
    [pendingRecurrence, dragUndo, refreshEvents]
  );

  const handleEventDuplicate = useCallback(
    (id: string) => {
      const source = eventRepo.getById(id);
      if (!source) return;
      checkpoint('Duplicate event');
      const copy = eventRepo.create({
        subjectId: source.subjectId,
        title: source.title,
        description: source.description,
        start: source.start,
        end: source.end,
        kind: source.kind || 'plan',
        countInStats: source.countInStats,
        // A copy starts its own life — never join the source's series.
        recurrenceId: null,
        // Same tasks as a fresh list: new ids, nothing pre-checked.
        checklist: source.checklist?.map((t) => ({ ...t, id: genId(), done: false })),
        notifyBefore: source.notifyBefore ?? null,
      });
      // Open the copy so the new time can be adjusted right away.
      setEditingEvent(copy);
      setDragUndo(null);
      refreshEvents();
    },
    [refreshEvents]
  );

  const handleEventMove = useCallback(
    (eventId: string, newStart: Date, newEnd: Date, source?: 'mouse' | 'touch') => {
      const before = eventRepo.getById(eventId);
      if (!before) return;
      // Touch drags skip the undo snapshot and never auto-open the editor:
      // the modal would cover the moved block and its Cancel rolls the drag
      // back (that read as "long-press drag does not work" on mobile).
      if (source !== 'touch') {
        setDragUndo({ id: eventId, start: before.start, end: before.end, recurrenceId: before.recurrenceId });
      }
      // Drag/resize moves only this occurrence but keeps its series link, so
      // later series-wide edits still include it (a "following" edit shifts
      // every occurrence by the same delta, preserving individual offsets).
      // Detaching happens only via an explicit "Only this event" choice.
      checkpoint('Move event');
      eventRepo.update(eventId, {
        start: newStart.toISOString(),
        end: newEnd.toISOString(),
      });
      refreshEvents();
      // Open the editor explicitly with fresh data: relying on the mouse-up
      // click is fragile (e.g. after shrinking, the cursor often ends up off
      // the now-short block and the click lands on empty space instead).
      if (source !== 'touch') {
        const fresh = eventRepo.getById(eventId);
        if (fresh) setEditingEvent(fresh);
      }
    },
    [refreshEvents]
  );

  const handleEventResize = useCallback(
    (eventId: string, newEnd: Date) => {
      const before = eventRepo.getById(eventId);
      if (!before) return;
      setDragUndo({ id: eventId, start: before.start, end: before.end, recurrenceId: before.recurrenceId });
      checkpoint('Resize event');
      eventRepo.update(eventId, {
        end: newEnd.toISOString(),
      });
      refreshEvents();
      // Same as move: open explicitly so a release off the block still lands
      // in the editor (a stray background click is suppressed in Timeline).
      const fresh = eventRepo.getById(eventId);
      if (fresh) setEditingEvent(fresh);
    },
    [refreshEvents]
  );

  const handleEditorCancel = useCallback(() => {
    // If this editor session followed a drag/resize, undo the committed change.
    if (editingEvent && dragUndo && dragUndo.id === editingEvent.id) {
      // A rollback, not a replan: the block ends up on the slot it started on,
      // so it must not land in the plan-stability log as a second correction.
      eventRepo.update(
        dragUndo.id,
        {
          start: dragUndo.start,
          end: dragUndo.end,
          recurrenceId: dragUndo.recurrenceId,
        },
        { restoring: true }
      );
      setDragUndo(null);
      refreshEvents();
    }
    setEditingEvent(null);
  }, [editingEvent, dragUndo, refreshEvents]);

  const renderViewSegmented = () => (
    <div className="flex gap-1 border border-outline-variant rounded-full p-1 bg-surface-container-low">
      {VIEWS.map((v) => (
        <button
          key={v.id}
          title={`Shortcut: ${v.id === '3day' ? '3' : v.id}`}
          onClick={() => setView(v.id)}
          className={`px-5 py-1.5 rounded-full font-label-sm text-label-sm uppercase tracking-[0.12em] transition-colors ${
            view === v.id
              ? 'bg-secondary-container text-on-secondary-container'
              : 'text-on-surface-variant hover:text-on-surface'
          }`}
        >
          {v.label}
        </button>
      ))}
    </div>
  );

  const renderEventFilter = () => (
    <div className="flex gap-1 border border-outline-variant rounded-full p-1 bg-surface-container-low" role="group" aria-label="Event kind filter">
      {FILTERS.map((f) => (
        <button
          key={f.id}
          title={`${f.title} (Shortcut: ${f.id === 'real' ? 'R' : f.id === 'plan' ? 'P' : 'A'})`}
          onClick={() => setEventFilter(f.id)}
          className={`px-3 py-1.5 rounded-full font-label-sm text-label-sm max-lg:!text-[9px] uppercase tracking-[0.12em] transition-colors ${
            eventFilter === f.id
              ? 'bg-secondary-container text-on-secondary-container'
              : 'text-on-surface-variant hover:text-on-surface'
          }`}
        >
          {f.label}
        </button>
      ))}
    </div>
  );

  // Mobile swipe mapping (per request): swipe left → next period,
  // swipe right → previous period. Wired only on mobile timelines.
  const swipePrev = isMobile ? goToPrevious : undefined;
  const swipeNext = isMobile ? goToNext : undefined;

  // Same navigation for the mobile Stat and Tasks panels, so a day change is
  // one flick whichever tab is open. `pan-y` on their scroll containers is what
  // lets this differ from a plain listener: without it the browser may claim a
  // horizontal flick as a scroll and the gesture arrives as touchcancel.
  //
  // markGesture stamps the panel guard rather than the timeline's: a swipe ends
  // with a synthesized click on whatever is under the finger, and here that can
  // be a checkbox. The Stat panel has no controls, so it needs no guard.
  const panelSwipe = useSwipeNav({
    enabled: isMobile,
    onSwipeLeft: swipeNext,
    onSwipeRight: swipePrev,
    markGesture: () => {
      panelSwipeAtRef.current = Date.now();
    },
  });

  // Swipes that start on the view-settings button (mobile): left/right go to
  // the previous/next day, 3 days, week or month (opposite of the timeline
  // swipe). In the day view only, up/down also walk the day panels in tab
  // order (up → next, down → previous).
  // The handle's drag feedback is written straight to the DOM: it changes
  // every touchmove, and a re-render per move would be wasted work.
  const handleBarRef = useRef<HTMLSpanElement>(null);
  const handleIconRef = useRef<HTMLSpanElement>(null);
  const onHandleDrag = useCallback((offset: { dx: number; dy: number } | null) => {
    const bar = handleBarRef.current;
    const icon = handleIconRef.current;
    if (!bar || !icon) return;
    if (!offset) {
      bar.style.transition = '';
      bar.style.transform = '';
      bar.style.opacity = '';
      bar.style.width = '';
      icon.style.opacity = '';
      return;
    }
    // Only the dominant axis moves, matching how the swipe resolves. The
    // offset is rubber-banded so the bar strains toward the finger but stays
    // put near home (at most ~12px).
    // Outside the day view there is no up/down, so a vertical drag stays put.
    const horizontal = Math.abs(offset.dx) > Math.abs(offset.dy);
    const d = horizontal ? offset.dx : view === 'day' ? offset.dy : 0;
    const pull = Math.sign(d) * 12 * (1 - Math.exp(-Math.abs(d) / 50));
    // Past the swipe threshold (40px) the bar grows and firms up: letting go
    // here will do something.
    const armed = Math.abs(d) >= 40;
    bar.style.transition = 'width 150ms, opacity 150ms';
    bar.style.transform = horizontal ? `translateX(${pull}px)` : `translateY(${pull}px)`;
    bar.style.opacity = armed ? '0.9' : '0.55';
    bar.style.width = armed ? '72px' : '';
    icon.style.opacity = armed ? '0' : '1';
  }, [view]);

  const buttonSwipe = useButtonSwipe({
    enabled: isMobile && (view === 'day' || view === '3day' || view === 'week' || view === 'month'),
    onDrag: onHandleDrag,
    onSwipeUp: view === 'day'
      ? () => setDayPanel((p) => DAY_PANELS[Math.min(DAY_PANELS.length - 1, DAY_PANELS.indexOf(p) + 1)])
      : undefined,
    onSwipeDown: view === 'day'
      ? () => setDayPanel((p) => DAY_PANELS[Math.max(0, DAY_PANELS.indexOf(p) - 1)])
      : undefined,
    onSwipeLeft: goToPrevious,
    onSwipeRight: goToNext,
  });

  const swipeHandlers = {
    onTouchStart: panelSwipe.onTouchStart,
    onTouchMove: panelSwipe.onTouchMove,
    onTouchEnd: panelSwipe.onTouchEnd,
    onTouchCancel: panelSwipe.onTouchCancel,
  };

  return (
    <div className="flex flex-col w-full flex-1 min-h-0 relative overflow-hidden">
      <DateHeader
        currentDate={currentDate}
        onPrev={goToPrevious}
        onNext={goToNext}
        onToday={goToToday}
        view={view}
        center={!isMobile ? renderViewSegmented() : undefined}
        right={!isMobile && view !== 'year' ? renderEventFilter() : undefined}
      />
      {viewSettingsOpen && (
        <ViewSettingsSheet
          view={view}
          onViewChange={setView}
          dayPanel={dayPanel}
          onDayPanelChange={setDayPanel}
          eventFilter={eventFilter}
          onEventFilterChange={setEventFilter}
          onClose={() => setViewSettingsOpen(false)}
        />
      )}

      {view === 'day' &&
        (isMobile ? (
          <div className="flex-1 min-h-0 flex flex-col">
          {dayPanel === 'timeline' ? (
            <div ref={springRef} className="flex-1 min-h-0 overflow-y-auto">
              <Timeline
                events={dayEvents}
                subjects={subjects}
                date={currentDate}
                activeSession={activeSession}
                onEventClick={handleEventClick}
                onEventMove={handleEventMove}
                onEventResize={handleEventResize}
                onBackgroundClick={handleTimelineBackgroundClick}
                mode={eventFilter}
                onSwipeLeft={swipeNext}
                onSwipeRight={swipePrev}
              />
            </div>
          ) : dayPanel === 'stats' ? (
            <div
              className="flex-1 min-h-0 overflow-y-auto flex flex-col gap-4 pb-40 [touch-action:pan-y]"
              onTouchStart={panelSwipe.onTouchStart}
              onTouchMove={panelSwipe.onTouchMove}
              onTouchEnd={panelSwipe.onTouchEnd}
              onTouchCancel={panelSwipe.onTouchCancel}
            >
              <StatsSidebar
                events={statsEvents}
                subjects={subjects}
                totalMinutes={stats.totalMinutes}
              />
            </div>
          ) : dayPanel === 'notes' ? (
            <div className="flex-1 min-h-0 flex flex-col pb-40">
              <DayNotesPanel key={dateKey(currentDate)} date={currentDate} dateKey={dateKey(currentDate)} />
            </div>
          ) : (
            <div
              className="flex-1 min-h-0 overflow-y-auto flex flex-col gap-4 pb-40 [touch-action:pan-y]"
              onTouchStart={panelSwipe.onTouchStart}
              onTouchMove={panelSwipe.onTouchMove}
              onTouchEnd={panelSwipe.onTouchEnd}
              onTouchCancel={panelSwipe.onTouchCancel}
            >
              <SubjectTasksPanel date={currentDate} events={dayEvents} subjects={subjects} onToggleTask={handleChecklistToggle} />
            </div>
          )}
          </div>
        ) : (
          <div className="grid grid-cols-12 gap-16 flex-1 min-h-0 lg:pb-4">
            <Timeline
              events={dayEvents}
              subjects={subjects}
              date={currentDate}
              activeSession={activeSession}
              onEventClick={handleEventClick}
              onEventMove={handleEventMove}
              onEventResize={handleEventResize}
              onBackgroundClick={handleTimelineBackgroundClick}
              mode={eventFilter}
            />
            {/* Right column: statistics or per-subject tasks, switched like Real/Plan. */}
            {/* Bottom clearance: the action bar floats over this corner, so the
                filling card must end above it at any zoom level. */}
            <aside className="col-span-12 lg:col-span-4 min-h-0 overflow-y-auto flex flex-col gap-4 max-lg:mt-1 pb-32">
              <div className="flex gap-1 border border-outline-variant rounded-full p-1 bg-surface-container-low self-start flex-shrink-0" role="group" aria-label="Side panel">
                {(['stats', 'tasks', 'notes'] as const).map((p) => (
                  <button
                    key={p}
                    onClick={() => setAsidePanel(p)}
                    title="Switch Stat/Tasks/Notes (Shortcut: D, ↑/↓)"
                    className={`px-3 py-1.5 rounded-full font-label-sm text-label-sm uppercase tracking-[0.12em] transition-colors whitespace-nowrap ${
                      asidePanel === p
                        ? 'bg-secondary-container text-on-secondary-container'
                        : 'text-on-surface-variant hover:text-on-surface'
                    }`}
                  >
                    {p === 'stats' ? 'Stat' : p === 'tasks' ? 'Tasks' : 'Notes'}
                  </button>
                ))}
              </div>
              {asidePanel === 'stats' ? (
                <StatsSidebar
                  events={statsEvents}
                  subjects={subjects}
                  totalMinutes={stats.totalMinutes}
                />
              ) : asidePanel === 'tasks' ? (
                <SubjectTasksPanel date={currentDate} events={dayEvents} subjects={subjects} onToggleTask={handleChecklistToggle} />
              ) : (
                <DayNotesPanel key={dateKey(currentDate)} date={currentDate} dateKey={dateKey(currentDate)} />
              )}
            </aside>
          </div>
        ))}

      {view === '3day' && (
        <MultiDayView days={3} date={currentDate} events={events} subjects={subjects} onEventClick={handleEventClick} onEventMove={handleEventMove} onEventResize={handleEventResize} onDateSelect={handleDaySelect} onBackgroundClick={handleTimelineBackgroundClick} mode={eventFilter} activeSession={activeSession} onSwipeLeft={swipeNext} onSwipeRight={swipePrev} />
      )}

      {view === 'week' && (
        <MultiDayView days={7} date={currentDate} events={events} subjects={subjects} onEventClick={handleEventClick} onEventMove={handleEventMove} onEventResize={handleEventResize} onDateSelect={handleDaySelect} onBackgroundClick={handleTimelineBackgroundClick} mode={eventFilter} onSwipeLeft={swipeNext} onSwipeRight={swipePrev} />
      )}

      {view === 'month' && (
        <div className="flex flex-col flex-1 min-h-0 [touch-action:pan-y]" {...swipeHandlers}>
        <MonthView
          key={`month-${currentDate.getFullYear()}-${currentDate.getMonth()}`}
          date={currentDate}
          events={events}
          subjects={subjects}
          mode={eventFilter}
          onDateSelect={handleDaySelect}
          onEventClick={handleEventClick}
          liveSession={activeSession}
        />
        </div>
      )}

      {view === 'year' && (
        <div className="flex flex-col flex-1 min-h-0 [touch-action:pan-y]" {...swipeHandlers}>
          <YearView key={`year-${currentDate.getFullYear()}`} date={currentDate} onDateSelect={handleDaySelect} />
        </div>
      )}

      {/* Portalled to body: the page-enter animation transforms an ancestor,
          which would re-anchor `fixed` to it mid-animation and snap the bar
          back to the viewport once the animation ends.

          On mobile every view carries this bar for the tune button alone — it
          is the only way back to another view from there, since the day
          panel's own actions do not exist outside the day view. */}
      {(view === 'day' || isMobile) &&
        createPortal(
          <div
            className="mt-auto pt-8 max-lg:pt-2 flex items-center gap-4 z-20 max-lg:fixed max-lg:bottom-28 max-lg:left-0 max-lg:right-0 max-lg:px-4 max-lg:pb-4 max-lg:justify-end max-lg:pointer-events-none lg:fixed lg:bottom-14 lg:right-8 lg:z-10"
          >
            {/* Desktop only. On a phone this bar is the tune button alone, so
                the bar has no backing and lets taps through to the timeline
                around it — see the container's pointer-events above. */}
            {view === 'day' && (
              <button
                onClick={() => setCreatingEvent({ start: new Date(currentDate), kind: eventFilter === 'all' ? 'plan' : eventFilter })}
                title="New event (Shortcut: N)"
                aria-label="New event"
                className="hidden lg:flex items-center justify-center bg-surface-container-high text-on-surface rounded-full hover:bg-surface-container-highest transition-colors w-16 h-16"
              >
                <span className="material-symbols-outlined text-[26px] leading-none">add</span>
              </button>
            )}
            <button
              type="button"
              {...buttonSwipe.handlers}
              onClick={() => {
                if (!buttonSwipe.wasSwipe()) setViewSettingsOpen(true);
              }}
              aria-label="View settings"
              title="View settings"
              // A grab handle at the bottom right: the visible bar is small, the
              // touch area around it is much larger so swipes are easy to
              // start. No backing — the bar sits straight on the timeline. The
              // tune icon shows while a finger is down, hinting that a tap
              // opens view settings.
              className="group lg:hidden pointer-events-auto [touch-action:none] [-webkit-tap-highlight-color:transparent] w-40 h-20 flex items-center justify-end flex-shrink-0"
            >
              <span className="flex flex-col items-center gap-1.5">
                <span
                  ref={handleIconRef}
                  className="material-symbols-outlined text-[20px] leading-none text-on-surface-variant opacity-0 group-active:opacity-100 transition-opacity"
                >
                  tune
                </span>
                <span
                  ref={handleBarRef}
                  className="block w-16 h-[7px] rounded-full bg-on-surface-variant opacity-40 group-active:opacity-55 transition-[transform,width,opacity] duration-300 ease-[cubic-bezier(.34,1.56,.64,1)]"
                />
              </span>
            </button>
          </div>,
          document.body
        )}

      {creatingEvent && (
        <EventForm
          event={null}
          defaultSubjectId={subjects[0]?.id || ''}
          defaultDate={creatingEvent.start}
          defaultEnd={creatingEvent.end}
          defaultKind={creatingEvent.kind}
          subjects={subjects}
          onSave={handleEventSave}
          onCancel={() => setCreatingEvent(null)}
        />
      )}

      {editingEvent && (
        <EventForm
          event={editingEvent}
          defaultSubjectId={editingEvent.subjectId}
          defaultDate={currentDate}
          subjects={subjects}
          onSave={handleEventSave}
          onDelete={handleEventDelete}
          onDuplicate={handleEventDuplicate}
          onCancel={handleEditorCancel}
        />
      )}

      {pendingRecurrence &&
        (() => {
          const target = eventRepo.getById(pendingRecurrence.eventId);
          const liveFollowing = pendingRecurrence.followingIds.flatMap((id) => {
            const rec = eventRepo.getById(id);
            return rec ? [rec] : [];
          });
          if (!target && liveFollowing.length === 0) return null;
          const totalCount = target
            ? getSeriesSiblings(target).length + 1
            : liveFollowing.length;
          return (
            <RecurrenceScopeDialog
              mode={pendingRecurrence.mode === 'save' ? 'edit' : 'delete'}
              totalCount={totalCount}
              followingCount={liveFollowing.length}
              onPick={handleRecurrencePick}
              onCancel={() => setPendingRecurrence(null)}
            />
          );
        })()}
    </div>
  );
}
