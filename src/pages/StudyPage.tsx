import { useMemo, useCallback, useState, useEffect } from 'react';
import { useTimer } from '../hooks/useTimer';
import { useActiveSession } from '../hooks/useActiveSession';
import { useSyncRefresh } from '../hooks/useServerSync';
import { eventRepo, subjectRepo } from '../services/repositories';
import { checkpoint } from '../services/history';
import { buildYearHeatmap, calculateYearStats, getEventsForDate, calculateDailyStats } from '../utils/stats';
import { SubjectPickerModal } from '../components/subjects/SubjectPickerModal';
import { FocusRoom } from '../components/study/FocusRoom';
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
  const currentStreakDays = useMemo(() => {
    const heatmap = buildYearHeatmap(events, new Date().getFullYear());
    return calculateYearStats(heatmap).longestStreakDays;
  }, [events]);

  const subject = useMemo(
    () => subjects.find((s) => s.id === subjectId),
    [subjects, subjectId]
  );

  const todayEvents = useMemo(() => getEventsForDate(events, new Date()), [events]);

  const todayStats = useMemo(() => calculateDailyStats(events, new Date()), [events]);  const handleStop = useCallback(() => {
    const event = stopSession();
    if (event) {
      checkpoint('Stop session');
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

  const handleQuickStart = useCallback(
    (id: string) => {
      startSession(id);
    },
    [startSession]
  );

  // Today list: ALL real sessions of today — including future ones.
  // No planned events. Plus the running live session (if any).
  // Total = full durations of all real events today + live elapsed.
  const todayRealEvents = useMemo(
    () =>
      todayEvents
        .filter((e) => e.kind !== 'plan')
        .sort((a, b) => new Date(a.start).getTime() - new Date(b.start).getTime()),
    [todayEvents]
  );

  const liveMinutes = isActive && startTime ? Math.floor(elapsed / 60000) : 0;

  const todayTotalMinutes = useMemo(() => {
    let sum = liveMinutes;
    for (const e of todayRealEvents) {
      const start = new Date(e.start).getTime();
      const end = new Date(e.end).getTime();
      sum += Math.max(0, Math.round((end - start) / 60000));
    }
    return sum;
  }, [todayRealEvents, liveMinutes]);

  return (
    <div className="flex flex-1 w-full relative min-h-0 overflow-hidden">
      <div className="flex flex-col xl:flex-row w-full h-full relative min-h-0 overflow-y-auto">
        <FocusRoom
          isActive={isActive}
          subjectName={subject?.name || ''}
          startTime={startTime || null}
          elapsed={elapsed}
          subjects={subjects}
          dailyMinutes={todayTotalMinutes}
          streakDays={currentStreakDays}
          onStop={isActive ? handleStop : undefined}
          onStart={!isActive ? handleStart : undefined}
          onQuickStart={!isActive ? handleQuickStart : undefined}
        />

        <TodaySessions
          events={todayRealEvents}
          subjects={subjects}
          totalMinutes={todayTotalMinutes}
          currentEventId={todayStats.currentEvent?.id}
          liveSession={
            isActive && subjectId && startTime
              ? { subjectId, start: startTime, elapsedMs: elapsed }
              : null
          }
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
