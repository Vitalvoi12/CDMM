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
import { eventRepo, subjectRepo, tombstoneRepo, settingsRepo } from '../services/repositories';
import { getEventsForDate, calculateDailyStats } from '../utils/stats';
import type { CalendarEvent } from '../types';

const VIEWS: { id: 'day' | '3day' | 'week' | 'month' | 'year'; label: string }[] = [
  { id: 'day', label: 'Day' },
  { id: '3day', label: '3D' },
  { id: 'week', label: 'Week' },
  { id: 'month', label: 'Month' },
  { id: 'year', label: 'Year' },
];

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
  const [dayPanel, setDayPanel] = useState<'timeline' | 'stats'>('timeline');

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
  }, []);  const handleTimelineBackgroundClick = useCallback(
    (start: Date, kind: 'real' | 'plan') => {
      setCreatingEvent({ start, kind });
    },
    []
  );

  const handleEventSave = useCallback(
    (data: { subjectId: string; title: string; description?: string; start: Date; end: Date; kind: 'real' | 'plan' }) => {
      if (editingEvent) {
        eventRepo.update(editingEvent.id, {
          subjectId: data.subjectId,
          title: data.title,
          description: data.description,
          start: data.start.toISOString(),
          end: data.end.toISOString(),
          kind: data.kind,
        });
      } else {
        eventRepo.create({
          subjectId: data.subjectId,
          title: data.title,
          description: data.description,
          start: data.start.toISOString(),
          end: data.end.toISOString(),
          kind: data.kind,
        });
      }
      setEditingEvent(null);
      setCreatingEvent(null);
      setDragUndo(null);
      refreshEvents();
    },
    [editingEvent, refreshEvents]
  );

  const handleEventDelete = useCallback(
    (id: string) => {
      const event = eventRepo.getById(id);
      if (event) tombstoneRepo.add('events', event.id);
      eventRepo.delete(id);
      setEditingEvent(null);
      setDragUndo(null);
      refreshEvents();
    },
    [refreshEvents]
  );

  // Snapshot of the event times before a drag/resize committed them, so the
  // editor's Cancel can roll the change back.
  const [dragUndo, setDragUndo] = useState<{ id: string; start: string; end: string } | null>(null);

  const handleEventMove = useCallback(
    (eventId: string, newStart: Date, newEnd: Date) => {
      const before = eventRepo.getById(eventId);
      if (!before) return;
      setDragUndo({ id: eventId, start: before.start, end: before.end });
      eventRepo.update(eventId, { start: newStart.toISOString(), end: newEnd.toISOString() });
      refreshEvents();
    },
    [refreshEvents]
  );

  const handleEventResize = useCallback(
    (eventId: string, newEnd: Date) => {
      const before = eventRepo.getById(eventId);
      if (!before) return;
      setDragUndo({ id: eventId, start: before.start, end: before.end });
      eventRepo.update(eventId, { end: newEnd.toISOString() });
      refreshEvents();
    },
    [refreshEvents]
  );

  const handleEditorCancel = useCallback(() => {
    // If this editor session followed a drag/resize, undo the committed change.
    if (editingEvent && dragUndo && dragUndo.id === editingEvent.id) {
      eventRepo.update(dragUndo.id, { start: dragUndo.start, end: dragUndo.end });
      setDragUndo(null);
      refreshEvents();
    }
    setEditingEvent(null);
  }, [editingEvent, dragUndo, refreshEvents]);

  const renderToolbar = () => {
    if (isMobile) {
      return (
        <div className="mb-3 flex gap-1 flex-wrap">
          {(['timeline', 'stats'] as const).map((p) => (
            <button
              key={p}
              onClick={() => setDayPanel(p)}
              className={`px-4 py-1 rounded font-label-sm text-label-sm max-lg:!text-[11px] uppercase tracking-widest max-lg:tracking-normal transition-colors ${
                dayPanel === p
                  ? 'bg-primary text-on-primary'
                  : 'bg-surface-container hover:bg-surface-container-high text-on-surface-variant'
              }`}
            >
              {p === 'timeline' ? 'Day' : 'Stats'}
            </button>
          ))}
        </div>
      );
    }
    return (
      <div className="mb-8 flex gap-2 flex-wrap">
        {VIEWS.map((v) => (
        <button
          key={v.id}
          onClick={() => setView(v.id)}
          className={`px-4 py-1 rounded font-label-sm text-label-sm uppercase tracking-widest transition-colors ${
            view === v.id
              ? 'bg-primary text-on-primary'
              : 'bg-surface-container hover:bg-surface-container-high text-on-surface-variant'
          }`}
        >
          {v.label}
        </button>
      ))}
      </div>
    );
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
    <div className="flex flex-col w-full h-full relative">
      <DateHeader
        currentDate={currentDate}
        onPrev={goToPrevious}
        onNext={goToNext}
        onToday={goToToday}
        view={view}
      />
      {renderToolbar()}

      {view === 'day' &&
        (isMobile ? (
          dayPanel === 'stats' ? (
            <div className="flex-1 overflow-y-auto">
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
              />
            </div>
          )
        ) : (
          <div className="grid grid-cols-12 gap-16 flex-1 lg:pb-24">
            <Timeline
              events={dayEvents}
              subjects={subjects}
              date={currentDate}
              activeSession={activeSession}
              onEventClick={handleEventClick}
              onEventMove={handleEventMove}
              onEventResize={handleEventResize}
              onBackgroundClick={handleTimelineBackgroundClick}
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
        <MultiDayView days={3} date={currentDate} events={events} subjects={subjects} onEventMove={handleEventMove} onEventResize={handleEventResize} />
      )}

      {view === 'week' && (
        <MultiDayView days={7} date={currentDate} events={events} subjects={subjects} onEventMove={handleEventMove} onEventResize={handleEventResize} />
      )}

      {view === 'month' && (
        <MonthView
          date={currentDate}
          events={events}
          subjects={subjects}
          onDateSelect={(d) => {
            setCurrentDate(d);
            setView('day');
          }}
        />
      )}

      {view === 'year' && (
        <YearView date={currentDate} events={events} subjects={subjects} />
      )}

      {view === 'day' && (
        <div className="mt-auto pt-8 max-lg:pt-2 flex gap-4 z-20 max-lg:fixed max-lg:bottom-24 max-lg:left-0 max-lg:right-0 max-lg:px-4 max-lg:pb-4 lg:fixed lg:bottom-14 lg:right-8 lg:z-10 max-lg:bg-background/95">
          <button
            onClick={() => setCreatingEvent({ start: new Date(currentDate), kind: 'plan' })}
            className="px-6 py-3 bg-surface-container-lowest border border-outline-variant text-on-background font-label-md text-label-md rounded hover:bg-surface-container-low transition-colors uppercase tracking-widest flex items-center justify-center gap-2"
          >
            <span className="material-symbols-outlined text-[20px]">event</span>
            New Event
          </button>
          <button
            onClick={handleStartStudying}
            className="max-lg:flex-1 max-lg:justify-center lg:flex-none lg:px-6 bg-primary text-on-primary font-label-md text-label-md py-3 rounded hover:bg-tertiary-container transition-colors uppercase tracking-widest flex items-center justify-center gap-2 group"
          >
            <span className="material-symbols-outlined text-[20px] group-hover:scale-110 transition-transform">
              add
            </span>
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
          onCancel={handleEditorCancel}
        />
      )}

      {renderSubjectPicker()}
    </div>
  );
}
