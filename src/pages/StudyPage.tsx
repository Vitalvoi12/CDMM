import { useMemo, useCallback, useState, useEffect } from 'react';
import { useActiveSession } from '../hooks/useActiveSession';
import { useSyncRefresh } from '../hooks/useServerSync';
import { eventRepo, subjectRepo } from '../services/repositories';
import { checkpoint } from '../services/history';
import { buildYearHeatmap, calculateYearStats, getEventsForDate, calculateDailyStats, liveSessionSubject } from '../utils/stats';
import { SubjectPickerModal } from '../components/subjects/SubjectPickerModal';
import { FocusRoom } from '../components/study/FocusRoom';
import { SessionStartEditor } from '../components/study/SessionStartEditor';
import { TodaySessions } from '../components/study/TodaySessions';
import { SessionRatingPrompt } from '../components/study/SessionRatingPrompt';
import { rateSession } from '../services/sessionRating';
import type { CalendarEvent, Subject } from '../types';

export function StudyPage() {
  const {
    isActive,
    subjectId,
    live,
    startTime,
    elapsed,
    startSession,
    setStartTime,
    stopSession,
  } = useActiveSession();
  const [showSubjectPicker, setShowSubjectPicker] = useState(false);
  const [showStartEditor, setShowStartEditor] = useState(false);
  // The session just saved, waiting for its focus rating.
  const [rating, setRating] = useState<{ id: string; name: string; minutes: number } | null>(null);
  const [events, setEvents] = useState<CalendarEvent[]>(eventRepo.getAll());
  // Subjects live in state (not a bare getAll() during render) so the object
  // identity is stable between refreshes — the session-save callback below
  // depends on the resolved subject and must not change every tick.
  const [subjects, setSubjects] = useState<Subject[]>(() => subjectRepo.getAll());

  const refresh = useCallback(() => {
    setEvents(eventRepo.getAll());
    setSubjects(subjectRepo.getAll());
  }, []);

  useSyncRefresh(refresh);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const currentStreakDays = useMemo(() => {
    const heatmap = buildYearHeatmap(events, new Date().getFullYear());
    return calculateYearStats(heatmap).longestStreakDays;
  }, [events]);

  const liveTitle = live?.title;
  const liveColor = live?.color;
  const subject = useMemo(
    () =>
      liveSessionSubject(
        subjectId !== null || liveTitle ? { subjectId: subjectId || '', start: '', title: liveTitle, color: liveColor } : null,
        Object.fromEntries(subjects.map((s) => [s.id, s]))
      ),
    [subjects, subjectId, liveTitle, liveColor]
  );

  const todayEvents = useMemo(() => getEventsForDate(events, new Date()), [events]);

  const todayStats = useMemo(() => calculateDailyStats(events, new Date()), [events]);

  /** Close the running session and persist it as a real event. */
  const saveSession = useCallback(() => {
    const event = stopSession();
    if (!event) return;
    checkpoint('Stop session');
    eventRepo.create({
      id: event.id,
      subjectId: event.subjectId,
      title: subject?.name || event.title,
      color: event.color,
      start: event.start,
      end: event.end,
      kind: 'real',
      countInStats: true,
    });
    setRating({
      id: event.id,
      name: subject?.name || event.title,
      minutes: Math.round((new Date(event.end).getTime() - new Date(event.start).getTime()) / 60000),
    });
    refresh();
  }, [stopSession, refresh, subject]);

  const handleStart = useCallback(() => {
    setShowSubjectPicker(true);
  }, []);

  const handleSubjectSelected = useCallback(
    (id: string, custom?: { title: string; color: string }) => {
      setShowSubjectPicker(false);
      startSession(id, custom);
    },
    [startSession]
  );

  

  // Today list: ALL real sessions of today that count toward statistics —
  // including future ones. No planned events, no stats-excluded events.
  // Plus the running live session (if any).
  // Total = full durations of all real events today + live elapsed.
  const todayRealEvents = useMemo(
    () =>
      todayEvents
        .filter((e) => e.kind !== 'plan' && e.countInStats !== false)
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
          dailyMinutes={todayTotalMinutes}
          streakDays={currentStreakDays}
          onEditStart={isActive ? () => setShowStartEditor(true) : undefined}
          onStop={isActive ? saveSession : undefined}
          onStart={!isActive ? handleStart : undefined}
        />

        <TodaySessions
          events={todayRealEvents}
          subjects={subjects}
          totalMinutes={todayTotalMinutes}
          currentEventId={todayStats.currentEvent?.id}
          liveSession={
            isActive && live
              ? { ...live, elapsedMs: elapsed }
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

      {showStartEditor && (
        <SessionStartEditor
          startTime={startTime}
          elapsed={elapsed}
          onApply={(ms) => {
            setStartTime(ms);
            setShowStartEditor(false);
          }}
          onCancel={() => setShowStartEditor(false)}
        />
      )}

      {rating && (
        <SessionRatingPrompt
          subjectName={rating.name}
          minutes={rating.minutes}
          onRate={(value, note) => {
            rateSession(rating.id, value, note);
            setRating(null);
            refresh();
          }}
          onSkip={() => setRating(null)}
        />
      )}
    </div>
  );
}
