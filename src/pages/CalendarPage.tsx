import { useMemo, useCallback, useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
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
import { eventRepo, subjectRepo, settingsRepo } from '../services/repositories';
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
  const [showSubjectPicker, setShowSubjectPicker] = useState(false);
  const [events, setEvents] = useState<CalendarEvent[]>(eventRepo.getAll());
  const { startSession } = useActiveSession();
  const navigate = useNavigate();

  const subjects = subjectRepo.getAll();
  const settings = settingsRepo.get();

  const [editingEvent, setEditingEvent] = useState<CalendarEvent | null>(null);
  const [creatingEvent, setCreatingEvent] = useState(false);

  const dayEvents = useMemo(() => getEventsForDate(events, currentDate), [events, currentDate]);
  const stats = useMemo(
    () => calculateDailyStats(events, currentDate),
    [events, currentDate]
  );

  const refreshEvents = useCallback(() => setEvents(eventRepo.getAll()), []);

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

  const handleEventSave = useCallback(
    (data: { subjectId: string; title: string; description?: string; start: Date; end: Date }) => {
      if (editingEvent) {
        eventRepo.update(editingEvent.id, {
          subjectId: data.subjectId,
          title: data.title,
          description: data.description,
          start: data.start.toISOString(),
          end: data.end.toISOString(),
        });
      } else {
        eventRepo.create({
          subjectId: data.subjectId,
          title: data.title,
          description: data.description,
          start: data.start.toISOString(),
          end: data.end.toISOString(),
        });
      }
      setEditingEvent(null);
      setCreatingEvent(false);
      refreshEvents();
    },
    [editingEvent, refreshEvents]
  );

  const handleEventDelete = useCallback(
    (id: string) => {
      eventRepo.delete(id);
      setEditingEvent(null);
      refreshEvents();
    },
    [refreshEvents]
  );

  const handleEventMove = useCallback(
    (eventId: string, newStart: Date, newEnd: Date) => {
      eventRepo.update(eventId, { start: newStart.toISOString(), end: newEnd.toISOString() });
      refreshEvents();
    },
    [refreshEvents]
  );

  const handleEventResize = useCallback(
    (eventId: string, newEnd: Date) => {
      eventRepo.update(eventId, { end: newEnd.toISOString() });
      refreshEvents();
    },
    [refreshEvents]
  );

  const renderToolbar = () => {
    const visibleViews = isMobile ? VIEWS.filter((v) => v.id === 'day') : VIEWS;
    return (
      <div className="mb-8 max-lg:mb-3 flex gap-2 max-lg:gap-1 flex-wrap">
        {visibleViews.map((v) => (
        <button
          key={v.id}
          onClick={() => setView(v.id)}
          className={`px-4 py-1 max-lg:px-3 max-lg:py-0.5 max-lg:!text-[9px] max-lg:tracking-normal rounded font-label-sm text-label-sm uppercase tracking-widest transition-colors ${
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

      {view === 'day' && (
        <div className="grid grid-cols-12 gap-4 lg:gap-16 flex-1 lg:pb-24">
          <Timeline
            events={dayEvents}
            subjects={subjects}
            date={currentDate}
            onEventClick={handleEventClick}
            onEventMove={handleEventMove}
            onEventResize={handleEventResize}
          />
          <StatsSidebar
            events={dayEvents}
            subjects={subjects}
            totalMinutes={stats.totalMinutes}
            dailyGoalMinutes={settings.dailyGoalMinutes}
          />
        </div>
      )}

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
        <div className="mt-auto pt-8 max-lg:pt-2 flex gap-4 max-lg:fixed max-lg:bottom-24 max-lg:left-0 max-lg:right-0 max-lg:px-4 max-lg:pb-4 lg:fixed lg:bottom-14 lg:right-8 lg:z-10">
          <button
            onClick={() => setCreatingEvent(true)}
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
          defaultDate={currentDate}
          subjects={subjects}
          onSave={handleEventSave}
          onCancel={() => setCreatingEvent(false)}
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
          onCancel={() => setEditingEvent(null)}
        />
      )}

      {renderSubjectPicker()}
    </div>
  );
}
