import { useMemo, useCallback, useState, useEffect, useRef } from 'react';
import { createPortal, flushSync } from 'react-dom';
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
import { eventRepo, subjectRepo, todoRepo, tombstoneRepo, dayTaskRepo, genId } from '../services/repositories';
import { getEventsForDate, calculateDailyStats, liveEventForDate } from '../utils/stats';
import { expandRecurrence, dateKey, addDays, inferRepeatFreq } from '../utils/time';
import { weeklyGoalProgress } from '../utils/goals';
import type { EventRecurrence } from '../components/calendar/EventForm';
import { RecurrenceScopeDialog, type RecurrenceScope } from '../components/calendar/RecurrenceScopeDialog';
import { DAY_PANELS, ViewSettingsSheet, type DayPanel } from '../components/calendar/ViewSettingsSheet';
import { QuickCreateSheet } from '../components/mobile/QuickCreateSheet';
import { DayStats } from '../components/mobile/DayStats';
import { Checklist } from '../components/mobile/Checklist';
import { setDockHidden } from '../components/mobile/belowDock';
import { focusStreak } from '../utils/analytics';
import { checkpoint } from '../services/history';
import { DEFAULT_TASK_MINUTES, type TaskDragPayload } from '../services/taskDrag';
import type { CalendarEvent, DayTaskList, EventFilter, TodoTask } from '../types';

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

/** Whether a touch began inside the handler's own DOM, not in a portal that
 *  React bubbles to it (portals sit elsewhere on the page). */
function inOwnDom(e: React.TouchEvent): boolean {
  return e.currentTarget.contains(e.target as Node);
}

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
    notifyBefore: number | null;
    notifyExtra: number[];
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
  // Todo tasks due on the shown day are listed at the end of the Checklist.
  const [todos, setTodos] = useState<TodoTask[]>(() => todoRepo.getAll());
  const [dayTasks, setDayTasks] = useState<DayTaskList[]>(() => dayTaskRepo.getAll());
  const { isActive, subjectId, title: sessionTitle, color: sessionColor, startTime, elapsed } = useActiveSession();
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
  // `quick`: the phone's quick-create sheet instead of the full form;
  // `custom`: the full form opens on a custom (subject-less) event.
  const [creatingEvent, setCreatingEvent] = useState<{ start: Date; end?: Date; kind: 'real' | 'plan'; quick?: boolean; custom?: boolean } | null>(null);
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
  const [dayPanel, setDayPanel] = useState<DayPanel>('timeline');
  // Phone: the session bar shows over the calendar itself, not the day's Stat / Check / Notes panels.
  const hideDock = isMobile && view === 'day' && dayPanel !== 'timeline';
  useEffect(() => {
    setDockHidden(hideDock);
    return () => setDockHidden(false);
  }, [hideDock]);
  // Mobile view sheet (the date title or the tune icon).
  const [viewSettingsOpen, setViewSettingsOpen] = useState(false);
  // Desktop day view: the right column shows either statistics or tasks.
  const [asidePanel, setAsidePanel] = useState<'stats' | 'tasks' | 'notes'>('stats');
  // The Checklist's new-task form (inline on desktop, a window on the phone).
  const [taskAdding, setTaskAdding] = useState(false);
  const taskInputRef = useRef<HTMLTextAreaElement | null>(null);
  // Set by the I shortcut; the notes panel focuses its editor once it is up.
  const [noteFocusPending, setNoteFocusPending] = useState(false);
  // Leaving the Checklist closes the form, so it does not pop back up later.
  useEffect(() => {
    if ((isMobile ? dayPanel : asidePanel) !== 'tasks' || view !== 'day') setTaskAdding(false);
  }, [isMobile, dayPanel, asidePanel, view]);
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
        target.isContentEditable ||
        // Keys pressed inside a window (e.g. on a chip of the checklist task
        // editor) belong to that window, not to the calendar behind it.
        target.closest('[role="dialog"]')
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
      // V opens a new task in the shown day's Checklist.
      else if (key === 'v') {
        e.preventDefault();
        flushSync(() => {
          if (view !== 'day') setView('day');
          if (isMobile) setDayPanel('tasks');
          else setAsidePanel('tasks');
          setTaskAdding(true);
        });
        // Also when the form was already open: autoFocus runs only on mount.
        taskInputRef.current?.focus();
      }
      // I opens the shown day's Notes and starts editing.
      else if (key === 'i') {
        e.preventDefault();
        if (view !== 'day') setView('day');
        if (isMobile) setDayPanel('notes');
        else setAsidePanel('notes');
        setNoteFocusPending(true);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isMobile, modalOpen, view, eventFilter, currentDate, setEventFilter, setView, goToPrevious, goToNext]);

  const dayEvents = useMemo(() => getEventsForDate(events, currentDate), [events, currentDate]);
  // Phone day view: the neighbouring days sit rendered beside the timeline,
  // so a swipe drags the next day in with the finger.
  const prevDate = useMemo(() => addDays(currentDate, -1), [currentDate]);
  const nextDate = useMemo(() => addDays(currentDate, 1), [currentDate]);
  const prevDayEvents = useMemo(() => getEventsForDate(events, prevDate), [events, prevDate]);
  const nextDayEvents = useMemo(() => getEventsForDate(events, nextDate), [events, nextDate]);

  // Comes from the synced session record, so the running block shows up on
  // every signed-in device — including one that only ever opens the calendar.
  const activeSession = useMemo(
    () =>
      isActive && startTime && (subjectId || sessionTitle)
        ? { subjectId: subjectId || '', start: startTime, title: sessionTitle || undefined, color: sessionColor || undefined }
        : null,
    [isActive, subjectId, sessionTitle, sessionColor, startTime]
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

  // Weekly goals from the displayed day's Monday through that day. The running session counts
  // toward today, like everywhere else on this screen.
  const weekGoals = useMemo(() => {
    const now = activeSession ? new Date(activeSession.start).getTime() + elapsed : Date.now();
    const live = liveEventForDate(activeSession, new Date(now), now);
    return weeklyGoalProgress(live ? [...events, live] : events, subjectRepo.getAll(), currentDate);
  }, [events, currentDate, activeSession, elapsed]);

  const stats = useMemo(
    () => calculateDailyStats(statsEvents, currentDate),
    [statsEvents, currentDate]
  );

  // Phone Stat tab: the running session's share of the day, and the streak
  // up to the shown day (recomputed once a minute, not every timer tick).
  const liveMinutes = useMemo(() => {
    const live = statsEvents.find((e) => e.id === '__live__');
    return live ? Math.round((new Date(live.end).getTime() - new Date(live.start).getTime()) / 60000) : 0;
  }, [statsEvents]);
  const elapsedMinute = Math.floor(elapsed / 60000);
  const streak = useMemo(() => {
    if (!isMobile) return 0;
    const now = activeSession ? new Date(activeSession.start).getTime() + elapsedMinute * 60000 : Date.now();
    const live = liveEventForDate(activeSession, new Date(now), now);
    return focusStreak(live ? [...events, live] : events, currentDate);
  }, [isMobile, events, activeSession, elapsedMinute, currentDate]);

  const refreshEvents = useCallback(() => {
    setEvents(eventRepo.getAll());
  }, []);

  // The day's own checklist (independent of events). A completed swipe is
  // followed by the browser's synthesized click on the element under the
  // finger; if that is a checkbox being flicked over, it must not tick
  // itself — the gesture was navigation.
  const handleDayTaskToggle = useCallback((id: string, done: boolean) => {
    if (Date.now() - panelSwipeAtRef.current < 400) return;
    checkpoint(done ? 'Complete checklist task' : 'Reopen checklist task');
    dayTaskRepo.toggle(dateKey(currentDate), id, done);
    setDayTasks(dayTaskRepo.getAll());
  }, [currentDate]);

  const handleDayTaskAdd = useCallback((text: string, subjectId: string, estMinutes?: number) => {
    checkpoint('Add checklist task');
    dayTaskRepo.add(dateKey(currentDate), { text, subjectId, ...(estMinutes ? { estMinutes } : {}) });
    setDayTasks(dayTaskRepo.getAll());
  }, [currentDate]);

  const handleDayTaskEdit = useCallback(
    (id: string, patch: { text: string; subjectId: string; estMinutes: number | undefined }) => {
      checkpoint('Edit checklist task');
      dayTaskRepo.edit(dateKey(currentDate), id, patch);
      setDayTasks(dayTaskRepo.getAll());
    },
    [currentDate]
  );

  const handleDayTaskDelete = useCallback((id: string) => {
    if (Date.now() - panelSwipeAtRef.current < 400) return;
    checkpoint('Delete checklist task');
    dayTaskRepo.remove(dateKey(currentDate), id);
    setDayTasks(dayTaskRepo.getAll());
  }, [currentDate]);

  // Postpone a checklist task to another day ("YYYY-MM-DD").
  const handleDayTaskMove = useCallback((id: string, to: string) => {
    if (Date.now() - panelSwipeAtRef.current < 400) return;
    const [y, m, d] = to.split('-').map(Number);
    checkpoint(`Move checklist task to ${new Date(y, m - 1, d).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`);
    dayTaskRepo.move(dateKey(currentDate), to, id);
    setDayTasks(dayTaskRepo.getAll());
  }, [currentDate]);

  // A Checklist task dropped on the day timeline becomes a planned block of
  // its subject (a custom block when it has none), linked back by `taskId` so
  // the checklist can show when it is scheduled. The task text rides in the
  // description: subject blocks are titled by their subject, and the editor
  // keeps the description through later edits.
  const handleTaskDrop = useCallback(
    (task: TaskDragPayload, start: Date, end: Date) => {
      const subject = subjectRepo.getById(task.subjectId);
      checkpoint('Plan task');
      eventRepo.create({
        subjectId: subject ? subject.id : '',
        title: subject ? subject.name : task.text,
        description: subject ? task.text : undefined,
        start: start.toISOString(),
        end: end.toISOString(),
        kind: 'plan',
        countInStats: true,
        taskId: task.taskId,
      });
      // The new block is a plan — make sure the timeline is showing plans.
      if (eventFilter === 'real') setEventFilter('all');
      refreshEvents();
    },
    [eventFilter, setEventFilter, refreshEvents]
  );

  // Phone: swipe → Plan on a checklist task. There is no timeline to drop on
  // in the Check tab, so the block goes at the next quarter hour (today) or
  // 09:00 (another day), as long as its estimate, and the Day tab opens on it
  // to be dragged into place.
  const planTaskOnPhone = useCallback(
    (task: { id: string; text: string; subjectId: string; estMinutes?: number }) => {
      const start = new Date(currentDate);
      if (dateKey(currentDate) === dateKey(new Date())) {
        const now = new Date();
        start.setHours(now.getHours(), Math.ceil(now.getMinutes() / 15) * 15, 0, 0);
      } else {
        start.setHours(9, 0, 0, 0);
      }
      const minutes = task.estMinutes || DEFAULT_TASK_MINUTES;
      handleTaskDrop({ taskId: task.id, text: task.text, subjectId: task.subjectId, minutes }, start, new Date(start.getTime() + minutes * 60000));
      setDayPanel('timeline');
    },
    [currentDate, handleTaskDrop]
  );

  // Earliest planned block per task, for the checklist's "scheduled" chip.
  const scheduledTasks = useMemo(() => {
    const out: Record<string, string> = {};
    for (const e of events) {
      if (e.kind !== 'plan' || !e.taskId) continue;
      const cur = out[e.taskId];
      if (!cur || Date.parse(e.start) < Date.parse(cur)) out[e.taskId] = e.start;
    }
    return out;
  }, [events]);

  // Checkbox on a todo task in the Checklist panel.
  const handleTodoToggle = useCallback((id: string, completed: boolean) => {
    // Same swipe guard as the checklist tasks above.
    if (Date.now() - panelSwipeAtRef.current < 400) return;
    checkpoint(completed ? 'Complete task' : 'Reopen task');
    todoRepo.update(id, { completed });
    setTodos(todoRepo.getAll());
  }, []);

  useSyncRefresh(
    useCallback(() => {
      refreshEvents();
      setTodos(todoRepo.getAll());
      setDayTasks(dayTaskRepo.getAll());
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

  // How the edited event's series repeats, for the editor's Repeat fields.
  const editingSeries = useMemo(() => {
    if (!editingEvent) return undefined;
    const starts = [editingEvent, ...getSeriesSiblings(editingEvent)].map((e) => new Date(e.start)).sort((a, b) => a.getTime() - b.getTime());
    return starts.length > 1 ? { freq: inferRepeatFreq(starts), until: dateKey(starts[starts.length - 1]) } : undefined;
  }, [editingEvent]);

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

  // On the phone a tap on an empty slot opens the quick-create sheet, an
  // hour long by default; the desktop keeps the full form.
  const handleTimelineBackgroundClick = useCallback(
    (start: Date, kind: 'real' | 'plan', end?: Date) => {
      if (isMobile) setCreatingEvent({ start, end: end ?? new Date(start.getTime() + 60 * 60000), kind, quick: true });
      else setCreatingEvent({ start, end, kind });
    },
    [isMobile]
  );

  const handleEventSave = useCallback(
    (data: { subjectId: string; title: string; description?: string; start: Date; end: Date; kind: 'real' | 'plan'; countInStats: boolean; recurrence?: EventRecurrence; color?: string; notifyBefore: number | null; notifyExtra: number[]; focus?: 1 | 2 | 3 | null }) => {
      if (editingEvent) {
        const stored = eventRepo.getById(editingEvent.id);
        if (stored && data.recurrence) {
          // The repeat was changed: this event and the occurrences after it
          // become the new series. Occurrences already on a wanted day are
          // kept (with their own focus and notes) and updated, the rest go,
          // and missing days are created. Earlier occurrences stay as they were.
          if (!(dragUndo && dragUndo.id === stored.id)) checkpoint('Edit event repeat');
          const baseStart = dragUndo && dragUndo.id === stored.id ? new Date(dragUndo.start).getTime() : new Date(stored.start).getTime();
          const following = followingIdsOf(stored, baseStart).flatMap((id) => eventRepo.getById(id) ?? []);
          const wanted = expandRecurrence(data.start, data.end, data.recurrence.freq, data.recurrence.until);
          const recurrenceId = wanted.length > 1 ? genId() : null;
          const fields = {
            subjectId: data.subjectId,
            title: data.title,
            description: data.description,
            kind: data.kind,
            countInStats: data.countInStats,
            color: data.color,
            notifyBefore: data.notifyBefore,
            notifyExtra: data.notifyExtra,
          };
          eventRepo.update(stored.id, {
            ...fields,
            start: data.start.toISOString(),
            end: data.end.toISOString(),
            recurrenceId,
            ...(data.focus !== undefined ? { focus: data.focus } : {}),
          });
          const byDay = new Map(following.map((e) => [dateKey(new Date(e.start)), e]));
          for (const occ of wanted.slice(1)) {
            const times = { start: occ.start.toISOString(), end: occ.end.toISOString() };
            const kept = byDay.get(dateKey(occ.start));
            if (kept) {
              byDay.delete(dateKey(occ.start));
              eventRepo.update(kept.id, { ...fields, ...times, recurrenceId });
            } else {
              eventRepo.create({ ...fields, ...times, ...(recurrenceId ? { recurrenceId } : {}) });
            }
          }
          for (const gone of byDay.values()) {
            tombstoneRepo.add('events', gone.id);
            eventRepo.delete(gone.id);
          }
          setEditingEvent(null);
          setDragUndo(null);
          refreshEvents();
          return;
        }
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
          notifyBefore: data.notifyBefore,
          notifyExtra: data.notifyExtra,
          ...(data.focus !== undefined ? { focus: data.focus } : {}),
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
            notifyBefore: data.notifyBefore,
            notifyExtra: data.notifyExtra,
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
          notifyBefore: data.notifyBefore,
          notifyExtra: data.notifyExtra,
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
              notifyBefore: data.notifyBefore,
              notifyExtra: data.notifyExtra,
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
              notifyBefore: data.notifyBefore,
              notifyExtra: data.notifyExtra,
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
              notifyBefore: data.notifyBefore,
              notifyExtra: data.notifyExtra,
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
        notifyBefore: source.notifyBefore ?? null,
        notifyExtra: source.notifyExtra ?? [],
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

  // Phone: a double tap anywhere in the Checklist view opens the new-task
  // window. Taps on controls (checkboxes, delete, +) don't count, nor does a
  // finger that moved (a scroll or a swipe).
  const tapRef = useRef<{ x: number; y: number; at: number } | null>(null);
  const lastTapRef = useRef<{ x: number; y: number; at: number } | null>(null);
  const onChecklistTouchStart = useCallback((e: React.TouchEvent) => {
    const t = e.touches[0];
    tapRef.current = e.touches.length === 1 ? { x: t.clientX, y: t.clientY, at: Date.now() } : null;
  }, []);
  const onChecklistTouchEnd = useCallback((e: React.TouchEvent) => {
    const start = tapRef.current;
    tapRef.current = null;
    const t = e.changedTouches[0];
    const onControl = (e.target as HTMLElement).closest('button, input, a, form');
    if (!start || !t || onControl || Math.hypot(t.clientX - start.x, t.clientY - start.y) > 10 || Date.now() - start.at > 300) {
      lastTapRef.current = null;
      return;
    }
    const tap = { x: t.clientX, y: t.clientY, at: Date.now() };
    const prev = lastTapRef.current;
    if (prev && tap.at - prev.at < 350 && Math.hypot(tap.x - prev.x, tap.y - prev.y) < 40) {
      lastTapRef.current = null;
      // No synthesized click (or zoom) after the second tap.
      e.preventDefault();
      // Render the window and focus its field inside this tap, or iOS won't
      // raise the keyboard.
      flushSync(() => setTaskAdding(true));
      taskInputRef.current?.focus();
      return;
    }
    lastTapRef.current = tap;
  }, []);

  const swipeHandlers = {
    onTouchStart: panelSwipe.onTouchStart,
    onTouchMove: panelSwipe.onTouchMove,
    onTouchEnd: panelSwipe.onTouchEnd,
    onTouchCancel: panelSwipe.onTouchCancel,
  };

  const todayKey = dateKey(new Date());
  const shownTasks = dayTasks.find((l) => l.id === dateKey(currentDate))?.tasks ?? [];
  const openTaskCount = shownTasks.filter((t) => !t.done).length;

  // Phone header: ‹ title › Today. The title names the shown range and,
  // like the tune button at the bottom right, opens the view sheet.
  const mobileTitle = (() => {
    if (view === 'day') return currentDate.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' });
    if (view === '3day') {
      const end = new Date(currentDate);
      end.setDate(end.getDate() + 2);
      const sameMonth = end.getMonth() === currentDate.getMonth();
      const from = currentDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
      return `${from} - ${sameMonth ? end.getDate() : end.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`;
    }
    if (view === 'month') return currentDate.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
    return String(currentDate.getFullYear());
  })();
  const unit = view === 'day' ? 'day' : view === '3day' ? 'days' : view === 'month' ? 'month' : 'year';

  return (
    <div className="flex flex-col w-full flex-1 min-h-0 relative overflow-hidden">
      {isMobile ? (
        <>
          <header className="m-hdr">
            <button type="button" className="m-ib" aria-label={`Previous ${unit}`} onClick={goToPrevious}>
              <span className="material-symbols-outlined m-ic">chevron_left</span>
            </button>
            <button type="button" className="m-ttl" aria-label={`${mobileTitle}. Open view settings`} onClick={() => setViewSettingsOpen(true)}>
              <span className="m-tr">{mobileTitle}</span>
              <span className="material-symbols-outlined m-ic s m-mut">{viewSettingsOpen ? 'expand_less' : 'expand_more'}</span>
            </button>
            <button type="button" className="m-ib" aria-label={`Next ${unit}`} onClick={goToNext}>
              <span className="material-symbols-outlined m-ic">chevron_right</span>
            </button>
            <button type="button" className="m-pill m-lbm" onClick={goToToday}>Today</button>
          </header>
        </>
      ) : (
        <DateHeader
          currentDate={currentDate}
          onPrev={goToPrevious}
          onNext={goToNext}
          onToday={goToToday}
          view={view}
          center={renderViewSegmented()}
          right={view !== 'year' ? renderEventFilter() : undefined}
        />
      )}
      {viewSettingsOpen && (
        <ViewSettingsSheet
          view={view}
          onViewChange={setView}
          eventFilter={eventFilter}
          onEventFilterChange={setEventFilter}
          date={currentDate}
          onDateChange={setCurrentDate}
          dayPanel={dayPanel}
          onDayPanelChange={setDayPanel}
          openTaskCount={openTaskCount}
          onClose={() => setViewSettingsOpen(false)}
        />
      )}

      {view === 'day' &&
        (isMobile ? (
          <div className="flex-1 min-h-0 flex flex-col">
          {dayPanel === 'timeline' ? (
            <div className="relative flex-1 min-h-0 flex flex-col">
            <div ref={springRef} className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden">
              <Timeline
                neighbours={
                  <>
                    <Timeline peek="prev" events={prevDayEvents} subjects={subjects} date={prevDate} activeSession={activeSession} mode={eventFilter} />
                    <Timeline peek="next" events={nextDayEvents} subjects={subjects} date={nextDate} activeSession={activeSession} mode={eventFilter} />
                  </>
                }
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
                draft={creatingEvent?.quick && creatingEvent.end && dateKey(creatingEvent.start) === dateKey(currentDate) ? { start: creatingEvent.start, end: creatingEvent.end, kind: creatingEvent.kind } : null}
              />
            </div>
            </div>
          ) : dayPanel === 'stats' ? (
            <div
              className="flex-1 min-h-0 overflow-y-auto flex flex-col [touch-action:pan-y]"
              onTouchStart={panelSwipe.onTouchStart}
              onTouchMove={panelSwipe.onTouchMove}
              onTouchEnd={panelSwipe.onTouchEnd}
              onTouchCancel={panelSwipe.onTouchCancel}
            >
              <DayStats
                events={statsEvents}
                subjects={subjects}
                totalMinutes={stats.totalMinutes}
                goals={weekGoals}
                liveMinutes={liveMinutes}
                liveSubjectId={activeSession ? activeSession.subjectId : null}
                streak={streak}
                isToday={dateKey(currentDate) === todayKey}
              />
            </div>
          ) : dayPanel === 'notes' ? (
            <div className="flex-1 min-h-0 flex flex-col">
              <DayNotesPanel key={dateKey(currentDate)} date={currentDate} dateKey={dateKey(currentDate)} autoFocus={noteFocusPending} onAutoFocused={() => setNoteFocusPending(false)} />
            </div>
          ) : (
            <div
              className="flex-1 min-h-0 flex flex-col [touch-action:pan-y]"
              // Touches in the Checklist's portals (the add bar under the dock,
              // the task window) still bubble here through the React tree. They
              // are not the page: flicking the add bar's subject chips sideways
              // must not turn the day under the task being typed.
              onTouchStart={(e) => {
                if (!inOwnDom(e)) return;
                panelSwipe.onTouchStart(e);
                onChecklistTouchStart(e);
              }}
              onTouchMove={(e) => inOwnDom(e) && panelSwipe.onTouchMove(e)}
              onTouchEnd={(e) => {
                if (!inOwnDom(e)) return;
                panelSwipe.onTouchEnd(e);
                onChecklistTouchEnd(e);
              }}
              onTouchCancel={(e) => inOwnDom(e) && panelSwipe.onTouchCancel()}
            >
              <Checklist
                date={currentDate}
                tasks={shownTasks}
                subjects={subjects}
                todos={todos}
                scheduled={scheduledTasks}
                onToggleTask={handleDayTaskToggle}
                onAddTask={handleDayTaskAdd}
                onEditTask={handleDayTaskEdit}
                onDeleteTask={handleDayTaskDelete}
                onMoveTask={handleDayTaskMove}
                onToggleTodo={handleTodoToggle}
                onPlanTask={planTaskOnPhone}
                inputRef={taskInputRef}
              />
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
              onTaskDrop={handleTaskDrop}
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
                    title="Switch Stat/Check/Notes (Shortcut: D, ↑/↓; I edits the note)"
                    className={`px-3 py-1.5 rounded-full font-label-sm text-label-sm uppercase tracking-[0.12em] transition-colors whitespace-nowrap ${
                      asidePanel === p
                        ? 'bg-secondary-container text-on-secondary-container'
                        : 'text-on-surface-variant hover:text-on-surface'
                    }`}
                  >
                    {p === 'stats' ? 'Stat' : p === 'tasks' ? 'Check' : 'Notes'}
                  </button>
                ))}
              </div>
              {asidePanel === 'stats' ? (
                <StatsSidebar
                  events={statsEvents}
                  subjects={subjects}
                  totalMinutes={stats.totalMinutes}
                  goals={weekGoals}
                />
              ) : asidePanel === 'tasks' ? (
                <SubjectTasksPanel date={currentDate} tasks={dayTasks.find((l) => l.id === dateKey(currentDate))?.tasks ?? []} subjects={subjects} onToggleTask={handleDayTaskToggle} onAddTask={handleDayTaskAdd} onDeleteTask={handleDayTaskDelete} adding={taskAdding} onAddingChange={setTaskAdding} inputRef={taskInputRef} todos={todos} onToggleTodo={handleTodoToggle} scheduled={scheduledTasks} onEditTask={handleDayTaskEdit} onMoveTask={handleDayTaskMove} />
              ) : (
                <DayNotesPanel key={dateKey(currentDate)} date={currentDate} dateKey={dateKey(currentDate)} autoFocus={noteFocusPending} onAutoFocused={() => setNoteFocusPending(false)} />
              )}
            </aside>
          </div>
        ))}

      {isMobile && (
        <button type="button" className="m-fab" aria-label="View settings" onClick={() => setViewSettingsOpen(true)}>
          <span className="material-symbols-outlined m-ic l">tune</span>
        </button>
      )}

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

      {/* Desktop day view: the floating New event button. Portalled to body:
          the page-enter animation transforms an ancestor, which would
          re-anchor `fixed` to it mid-animation and snap the button back to
          the viewport once the animation ends. The phone has its own + in
          the timeline. */}
      {view === 'day' && !isMobile &&
        createPortal(
          <div className="mt-auto pt-8 flex items-center gap-4 lg:fixed lg:bottom-14 lg:right-8 lg:z-10">
            <button
              onClick={() => setCreatingEvent({ start: new Date(currentDate), kind: eventFilter === 'all' ? 'plan' : eventFilter })}
              title="New event (Shortcut: N)"
              aria-label="New event"
              className="hidden lg:flex items-center justify-center bg-surface-container-high text-on-surface rounded-full hover:bg-surface-container-highest transition-colors w-16 h-16"
            >
              <span className="material-symbols-outlined text-[26px] leading-none">add</span>
            </button>
          </div>,
          document.body
        )}

      {creatingEvent?.quick && creatingEvent.end && (
        <QuickCreateSheet
          start={creatingEvent.start}
          end={creatingEvent.end}
          kind={creatingEvent.kind}
          subjects={subjects}
          onChange={({ end, kind }) => setCreatingEvent((c) => (c ? { ...c, end, kind } : c))}
          onPick={(id) => {
            const subject = subjects.find((s) => s.id === id);
            if (!subject || !creatingEvent.end) return;
            handleEventSave({
              subjectId: subject.id,
              title: subject.name,
              start: creatingEvent.start,
              end: creatingEvent.end,
              kind: creatingEvent.kind,
              countInStats: true,
              notifyBefore: null,
              notifyExtra: [],
            });
          }}
          onMore={(custom) => setCreatingEvent((c) => (c ? { ...c, quick: false, custom } : c))}
          onClose={() => setCreatingEvent(null)}
        />
      )}

      {creatingEvent && !creatingEvent.quick && (
        <EventForm
          event={null}
          defaultSubjectId={creatingEvent.custom ? '' : subjects[0]?.id || ''}
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
          series={editingSeries}
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
