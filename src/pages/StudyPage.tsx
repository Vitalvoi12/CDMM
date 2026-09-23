import { useMemo, useCallback, useState, useEffect } from 'react';
import { useTimer } from '../hooks/useTimer';
import { useActiveSession } from '../hooks/useActiveSession';
import { useSyncRefresh } from '../hooks/useServerSync';
import { eventRepo, settingsRepo, subjectRepo } from '../services/repositories';
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
  const settings = useMemo(() => settingsRepo.get(), [events]);
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

  // Today's plan vs real per subject:
  // percent = real minutes (subject) / plan minutes (subject) * 100.
  // Live elapsed counts toward real of its subject.
  const todayPlanStats = useMemo(() => {
    const planBySubject: Record<string, number> = {};
    const realBySubject: Record<string, number> = {};
    let totalPlan = 0;
    for (const e of todayEvents) {
      if (e.kind !== 'plan') continue;
      const mins = Math.max(0, Math.round((new Date(e.end).getTime() - new Date(e.start).getTime()) / 60000));
      planBySubject[e.subjectId] = (planBySubject[e.subjectId] || 0) + mins;
      totalPlan += mins;
    }
    for (const e of todayRealEvents) {
      const mins = Math.max(0, Math.round((new Date(e.end).getTime() - new Date(e.start).getTime()) / 60000));
      realBySubject[e.subjectId] = (realBySubject[e.subjectId] || 0) + mins;
    }
    if (isActive && subjectId) {
      realBySubject[subjectId] = (realBySubject[subjectId] || 0) + liveMinutes;
    }
    const ids = new Set([...Object.keys(planBySubject), ...Object.keys(realBySubject)]);
    const stats = [...ids]
      .map((subjectId) => {
        const plan = planBySubject[subjectId] || 0;
        const real = realBySubject[subjectId] || 0;
        return {
          subjectId,
          planMinutes: plan,
          realMinutes: real,
          percentage: plan > 0 ? Math.round((real / plan) * 100) : 0,
          hasPlan: plan > 0,
        };
      })
      .sort((a, b) => b.planMinutes + b.realMinutes - (a.planMinutes + a.realMinutes));
    return { stats, total: totalPlan };
  }, [todayEvents, todayRealEvents, isActive, subjectId, liveMinutes]);

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
          dailyGoalMinutes={settings.dailyGoalMinutes}
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
          planStats={todayPlanStats.stats}
          totalPlanMinutes={todayPlanStats.total}
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
