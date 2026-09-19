import { useMemo, useCallback, useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { DateHeader } from '../components/calendar/DateHeader';
import { Timeline } from '../components/calendar/Timeline';
import { MultiDayView } from '../components/calendar/MultiDayView';
import { MonthView } from '../components/calendar/MonthView';
import { YearView } from '../components/calendar/YearView';
import { StatsSidebar } from '../components/calendar/StatsSidebar';
import { EventForm } from '../components/calendar/EventForm';
import { SubjectPickerModal } from '../components/subjects/SubjectPickerModal';
import { useCalendarNavigation } from '../hooks/useCalendarNavigation';
import { useActiveSession } from '../hooks/useActiveSession';
import { useIsMobile } from '../hooks/useIsMobile';
import { useSyncRefresh } from '../hooks/useServerSync';
import { eventRepo, subjectRepo, tombstoneRepo, settingsRepo, genId } from '../services/repositories';
import { getEventsForDate, calculateDailyStats } from '../utils/stats';
import { expandRecurrence } from '../utils/time';
import type { EventRecurrence } from '../components/calendar/EventForm';
import { RecurrenceScopeDialog, type RecurrenceScope } from '../components/calendar/RecurrenceScopeDialog';
import { checkpoint } from '../services/history';
import type { CalendarEvent, EventFilter } from '../types';

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
  { id: 'all', label: 'All', title: 'Show real & plan side by side' },
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
    color?: string;
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
  const { currentDate, setCurrentDate, view, setView, goToToday, goToPrevious, goToNext } =
    useCalendarNavigation();
  const isMobile = useIsMobile();
  const location = useLocation();
  const [showSubjectPicker, setShowSubjectPicker] = useState(false);
  const [events, setEvents] = useState<CalendarEvent[]>(eventRepo.getAll());
  const { startSession, isActive, subjectId, startTime } = useActiveSession();
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
  const [settings, setSettings] = useState(settingsRepo.get());

  const [editingEvent, setEditingEvent] = useState<CalendarEvent | null>(null);
  const [creatingEvent, setCreatingEvent] = useState<{ start: Date; kind: 'real' | 'plan' } | null>(null);
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
  const [dayPanel, setDayPanel] = useState<'timeline' | 'stats'>('timeline');
  // Which event kinds the timelines show. 'all' splits days into Real|Plan
  // halves; 'real'/'plan' renders a single full-width column. Persisted.
  const [eventFilter, setEventFilterState] = useState<EventFilter>(loadEventFilter);
  const setEventFilter = useCallback((f: EventFilter) => {
    setEventFilterState(f);
    try {
      localStorage.setItem('cdmm.event-filter', f);
    } catch {
      // storage unavailable — ignore
    }
  }, []);

  const dayEvents = useMemo(() => getEventsForDate(events, currentDate), [events, currentDate]);

  const activeSession = useMemo(
    () => (isActive && subjectId && startTime ? { subjectId, start: startTime } : null),
    [isActive, subjectId, startTime]
  );
  const stats = useMemo(
    () => calculateDailyStats(events, currentDate),
    [events, currentDate]
  );

  const refreshEvents = useCallback(() => setEvents(eventRepo.getAll()), []);

  useSyncRefresh(
    useCallback(() => {
      refreshEvents();
      setSettings(settingsRepo.get());
    }, [refreshEvents])
  );

  useEffect(() => {
    refreshEvents();
  }, [refreshEvents]);

  useEffect(() => {
    if (isMobile && view !== 'day') setView('day');
  }, [isMobile, view, setView]);

  const handleStartStudying = useCallback(() => {
    setShowSubjectPicker(true);
  }, []);

  const handleSubjectSelected = useCallback(
    (subjectId: string) => {
      setShowSubjectPicker(false);
      startSession(subjectId);
      navigate('/study');
    },
    [startSession, navigate]
  );

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
    (start: Date, kind: 'real' | 'plan') => {
      setCreatingEvent({ start, kind });
    },
    []
  );

  const handleEventSave = useCallback(
    (data: { subjectId: string; title: string; description?: string; start: Date; end: Date; kind: 'real' | 'plan'; recurrence?: EventRecurrence; color?: string }) => {
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
          color: data.color,
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
            color: data.color,
            recurrenceId,
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
          color: data.color,
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
              color: data.color,
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
              color: data.color,
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
              color: data.color,
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
        // A copy starts its own life — never join the source's series.
        recurrenceId: null,
      });
      // Open the copy so the new time can be adjusted right away.
      setEditingEvent(copy);
      setDragUndo(null);
      refreshEvents();
    },
    [refreshEvents]
  );

  const handleEventMove = useCallback(
    (eventId: string, newStart: Date, newEnd: Date) => {
      const before = eventRepo.getById(eventId);
      if (!before) return;
      setDragUndo({ id: eventId, start: before.start, end: before.end, recurrenceId: before.recurrenceId });
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
      const fresh = eventRepo.getById(eventId);
      if (fresh) setEditingEvent(fresh);
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
      eventRepo.update(dragUndo.id, {
        start: dragUndo.start,
        end: dragUndo.end,
        recurrenceId: dragUndo.recurrenceId,
      });
      setDragUndo(null);
      refreshEvents();
    }
    setEditingEvent(null);
  }, [editingEvent, dragUndo, refreshEvents]);

  const renderViewSegmented = () => (
    <div className="flex gap-1 border border-outline-variant rounded-xl p-1 bg-surface-container-low">
      {VIEWS.map((v) => (
        <button
          key={v.id}
          onClick={() => setView(v.id)}
          className={`px-5 py-1.5 rounded-lg font-label-sm text-label-sm uppercase tracking-[0.12em] transition-colors ${
            view === v.id
              ? 'bg-surface-container-high text-on-surface'
              : 'text-on-surface-variant hover:text-on-surface'
          }`}
        >
          {v.label}
        </button>
      ))}
    </div>
  );

  const renderEventFilter = () => (
    <div className="flex gap-1 border border-outline-variant rounded-xl p-1 bg-surface-container-low" role="group" aria-label="Event kind filter">
      {FILTERS.map((f) => (
        <button
          key={f.id}
          title={f.title}
          onClick={() => setEventFilter(f.id)}
          className={`px-3 py-1.5 rounded-lg font-label-sm text-label-sm max-lg:!text-[9px] uppercase tracking-[0.12em] transition-colors ${
            eventFilter === f.id
              ? 'bg-surface-container-high text-on-surface'
              : 'text-on-surface-variant hover:text-on-surface'
          }`}
        >
          {f.label}
        </button>
      ))}
    </div>
  );

  const renderToolbar = () => {
    if (isMobile) {
      return (
        <div className="mb-3 flex gap-2 flex-wrap items-center justify-between">
          <div className="flex gap-1 flex-wrap">
          {(['timeline', 'stats'] as const).map((p) => (
            <button
              key={p}
              onClick={() => setDayPanel(p)}
              className={`px-4 py-1 rounded font-label-sm text-label-sm max-lg:!text-[9px] uppercase tracking-widest max-lg:tracking-normal transition-colors ${
                dayPanel === p
                  ? 'bg-primary text-on-primary'
                  : 'bg-surface-container hover:bg-surface-container-high text-on-surface-variant'
              }`}
            >
              {p === 'timeline' ? 'Day' : 'Stats'}
            </button>
          ))}
          </div>
          {renderEventFilter()}
        </div>
      );
    }
    return null;
  };

  const renderSubjectPicker = () =>
    showSubjectPicker && (
      <SubjectPickerModal
        subjects={subjects}
        onSelect={handleSubjectSelected}
        onClose={() => setShowSubjectPicker(false)}
      />
    );

  return (
    <div className="flex flex-col w-full flex-1 min-h-0 relative overflow-hidden">
      <DateHeader
        currentDate={currentDate}
        onPrev={goToPrevious}
        onNext={goToNext}
        onToday={goToToday}
        view={view}
        center={!isMobile ? renderViewSegmented() : undefined}
        right={!isMobile && view !== 'month' && view !== 'year' ? renderEventFilter() : undefined}
      />
      {renderToolbar()}

      {view === 'day' &&
        (isMobile ? (
          dayPanel === 'stats' ? (
            <div className="flex-1 min-h-0 overflow-y-auto">
              <StatsSidebar
                events={dayEvents}
                subjects={subjects}
                totalMinutes={stats.totalMinutes}
                dailyGoalMinutes={settings.dailyGoalMinutes}
              />
            </div>
          ) : (
            <div className="flex-1 min-h-0 overflow-y-auto">
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
            </div>
          )
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
            <StatsSidebar
              events={dayEvents}
              subjects={subjects}
              totalMinutes={stats.totalMinutes}
              dailyGoalMinutes={settings.dailyGoalMinutes}
            />
          </div>
        ))}

      {view === '3day' && (
        <MultiDayView days={3} date={currentDate} events={events} subjects={subjects} onEventClick={handleEventClick} onEventMove={handleEventMove} onEventResize={handleEventResize} onDateSelect={handleDaySelect} onBackgroundClick={handleTimelineBackgroundClick} mode={eventFilter} />
      )}

      {view === 'week' && (
        <MultiDayView days={7} date={currentDate} events={events} subjects={subjects} onEventClick={handleEventClick} onEventMove={handleEventMove} onEventResize={handleEventResize} onDateSelect={handleDaySelect} onBackgroundClick={handleTimelineBackgroundClick} mode={eventFilter} />
      )}

      {view === 'month' && (
        <MonthView
          date={currentDate}
          events={events}
          subjects={subjects}
          onDateSelect={handleDaySelect}
        />
      )}

      {view === 'year' && (
        <YearView date={currentDate} events={events} subjects={subjects} />
      )}

      {view === 'day' && (
        <div className="mt-auto pt-8 max-lg:pt-2 flex gap-4 z-20 max-lg:fixed max-lg:bottom-24 max-lg:left-0 max-lg:right-0 max-lg:px-4 max-lg:pb-4 lg:fixed lg:bottom-14 lg:right-8 lg:z-10 max-lg:bg-background/95">
          <button
            onClick={() => setCreatingEvent({ start: new Date(currentDate), kind: eventFilter === 'all' ? 'plan' : eventFilter })}
            className="px-6 py-3 bg-surface-container-high text-on-surface font-label-md text-label-md rounded-xl hover:bg-surface-container-highest transition-colors uppercase tracking-[0.12em] flex items-center justify-center gap-2"
          >
            New Event
          </button>
          <button
            onClick={handleStartStudying}
            className="max-lg:flex-1 max-lg:justify-center lg:flex-none lg:px-6 bg-primary text-on-primary font-label-md text-label-md py-3 rounded-xl hover:opacity-90 transition-opacity uppercase tracking-[0.12em] flex items-center justify-center gap-2"
          >
            Start studying
          </button>
        </div>
      )}

      {creatingEvent && (
        <EventForm
          event={null}
          defaultSubjectId={subjects[0]?.id || ''}
          defaultDate={creatingEvent.start}
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

      {renderSubjectPicker()}
    </div>
  );
}
