import { useMemo, useCallback, useState, useEffect } from 'react';
import { useTimer } from '../hooks/useTimer';
import { useActiveSession } from '../hooks/useActiveSession';
import { useSyncRefresh } from '../hooks/useServerSync';
import { eventRepo, subjectRepo } from '../services/repositories';
import { getEventsForDate, calculateDailyStats } from '../utils/stats';
import { SubjectPickerModal } from '../components/subjects/SubjectPickerModal';
import { LiveSession } from '../components/study/LiveSession';
import { TodaySessions } from '../components/study/TodaySessions';
import type { CalendarEvent } from '../types';

export function StudyPage() {
  const { isActive, subjectId, startTime, startSession, stopSession } = useActiveSession();
  const { elapsed } = useTimer(startTime);
  const [showSubjectPicker, setShowSubjectPicker] = useState(false);
  const [events, setEvents] = useState<CalendarEvent[]>(eventRepo.getAll());

  const refreshEvents = useCallback(() => setEvents(eventRepo.getAll()), []);

  useSyncRefresh(refreshEvents);

  useEffect(() => {
    refreshEvents();
  }, [refreshEvents]);

  const subjects = subjectRepo.getAll();

  const subject = useMemo(
    () => subjects.find((s) => s.id === subjectId),
    [subjects, subjectId]
  );

  const todayEvents = useMemo(() => getEventsForDate(events, new Date()), [events]);

  const todayStats = useMemo(() => calculateDailyStats(events, new Date()), [events]);

  const handleStop = useCallback(() => {
    const event = stopSession();
    if (event) {
      eventRepo.create({
        subjectId: event.subjectId,
        title: event.title,
        start: event.start,
        end: event.end,
      });
      refreshEvents();
    }
  }, [stopSession, refreshEvents]);

  const handleStart = useCallback(() => {
    setShowSubjectPicker(true);
  }, []);

  const handleSubjectSelected = useCallback(
    (id: string) => {
      setShowSubjectPicker(false);
      startSession(id);
    },
    [startSession]
  );

  const todayTotalMinutes = useMemo(
    () =>
      todayEvents.reduce((sum, e) => {
        const start = new Date(e.start).getTime();
        const end = new Date(e.end).getTime();
        return sum + Math.round((end - start) / 60000);
      }, 0),
    [todayEvents]
  );

  return (
    <div className="flex flex-1 w-full relative min-h-0 overflow-hidden">
      <div className="absolute left-1/2 top-0 bottom-0 w-[1px] bg-outline-variant z-10 hidden 2xl:block" />

      <div className="flex flex-col 2xl:flex-row w-full h-full relative min-h-0">
        <LiveSession
          isActive={isActive}
          subjectName={subject?.name || ''}
          startTime={startTime || null}
          elapsed={elapsed}
          onStop={isActive ? handleStop : undefined}
          onStart={!isActive ? handleStart : undefined}
        />

        <TodaySessions
          events={todayEvents}
          subjects={subjects}
          totalMinutes={todayTotalMinutes}
          currentEventId={todayStats.currentEvent?.id}
        />
      </div>

      {showSubjectPicker && (
        <SubjectPickerModal
          subjects={subjects}
          onSelect={handleSubjectSelected}
          onClose={() => setShowSubjectPicker(false)}
        />
      )}
    </div>
  );
}
