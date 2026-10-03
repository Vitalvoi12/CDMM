import { useCallback, useMemo, useState } from 'react';
import { eventEditRepo, eventRepo, subjectRepo, todoRepo } from '../services/repositories';
import {
  bucketSizeFor,
  buildDaySeries,
  buildFocusBuckets,
  buildRhythm,
  calculateConsistency,
  calculatePlanStability,
  calculateTaskStats,
  resolvePeriod,
  splitStudySlices,
  toISODate,
  type PeriodPreset,
} from '../utils/analytics';
import { addDays, startOfDay } from '../utils/time';
import type { Subject } from '../types';

export type SubjectMetric = 'time' | 'sessions' | 'share';

export interface SubjectRow {
  subjectId: string;
  name: string;
  color: string;
  minutes: number;
  sessions: number;
  /** Share of the period's studied time, 0-100. */
  timeShare: number;
  /** Share of the period's sessions, 0-100. */
  sessionShare: number;
  /** Length of the largest bar in the current metric, 0-100. */
  barWidth: number;
}

/**
 * The single data source of the Statistics screen.
 *
 * One period selection feeds every block, so switching the range in the header
 * recomputes subjects, focus time, rhythm, consistency, tasks and plan
 * stability together — they can never drift out of sync with each other.
 * Everything is derived from real focus sessions; planned blocks never count.
 */
export function useStatisticsPeriod() {
  const [preset, setPreset] = useState<PeriodPreset>('30d');
  const [metric, setMetric] = useState<SubjectMetric>('time');
  const [customFrom, setCustomFrom] = useState(() => toISODate(addDays(startOfDay(new Date()), -29)));
  const [customTo, setCustomTo] = useState(() => toISODate(new Date()));

  const period = useMemo(
    () => resolvePeriod(preset, { from: customFrom, to: customTo }),
    [preset, customFrom, customTo]
  );

  const subjects = useMemo(() => subjectRepo.getAll(), []);
  const subjectMap = useMemo(() => {
    const m: Record<string, Subject> = {};
    for (const s of subjects) m[s.id] = s;
    return m;
  }, [subjects]);

  // One pass over the events feeds every block below.
  const slices = useMemo(() => splitStudySlices(eventRepo.getAll()), []);
  const inPeriod = useMemo(() => {
    const from = period.from.getTime();
    const to = period.to.getTime();
    return slices.filter((s) => {
      const t = new Date(`${s.date}T00:00:00`).getTime();
      return t >= from && t <= to;
    });
  }, [slices, period]);

  const totalMinutes = useMemo(
    () => inPeriod.reduce((sum, s) => sum + s.minutes, 0),
    [inPeriod]
  );
  const totalSessions = useMemo(
    () => inPeriod.filter((s) => s.sessionStart).length,
    [inPeriod]
  );

  const subjectRows = useMemo<SubjectRow[]>(() => {
    const acc = new Map<string, { minutes: number; sessions: number }>();
    for (const s of inPeriod) {
      const row = acc.get(s.subjectId) || { minutes: 0, sessions: 0 };
      row.minutes += s.minutes;
      if (s.sessionStart) row.sessions += 1;
      acc.set(s.subjectId, row);
    }
    // Start from the whole subject list, not from what was studied: a subject
    // the user planned for but never actually sat down with still belongs in
    // the breakdown (with zeroes), otherwise the plan simply disappears from
    // the statistics exactly when it was not followed.
    const ids = new Set<string>(subjects.map((s) => s.id));
    for (const id of acc.keys()) ids.add(id);
    const rows = [...ids].map((subjectId) => {
      const subject = subjectMap[subjectId];
      const v = acc.get(subjectId) || { minutes: 0, sessions: 0 };
      return {
        subjectId,
        name: subject?.name || 'No subject',
        color: subject?.color || 'var(--color-on-surface-variant)',
        minutes: v.minutes,
        sessions: v.sessions,
        timeShare: totalMinutes > 0 ? (v.minutes / totalMinutes) * 100 : 0,
        sessionShare: totalSessions > 0 ? (v.sessions / totalSessions) * 100 : 0,
        barWidth: 0,
      };
    });
    // Sort by the metric on screen: sessions make a 10-minute and a 3-hour
    // block look alike, time does not, so the order has to follow the switch.
    const byMetric = (a: SubjectRow, b: SubjectRow) =>
      metric === 'sessions'
        ? b.sessions - a.sessions || b.minutes - a.minutes
        : b.minutes - a.minutes || b.sessions - a.sessions;
    rows.sort(byMetric);
    const peak = Math.max(
      1,
      ...rows.map((r) => (metric === 'sessions' ? r.sessions : r.minutes))
    );
    for (const r of rows) {
      r.barWidth = ((metric === 'sessions' ? r.sessions : r.minutes) / peak) * 100;
    }
    return rows;
  }, [inPeriod, subjects, subjectMap, metric, totalMinutes, totalSessions]);

  const days = useMemo(() => buildDaySeries(slices, period.from, period.to), [slices, period]);
  const bucketSize = useMemo(
    () => bucketSizeFor(period.preset, period.days),
    [period]
  );
  const buckets = useMemo(
    () => buildFocusBuckets(days, period.from, period.to, bucketSize),
    [days, period, bucketSize]
  );
  const rhythm = useMemo(() => buildRhythm(inPeriod), [inPeriod]);
  const consistency = useMemo(() => calculateConsistency(days), [days]);
  const tasks = useMemo(
    () => calculateTaskStats(todoRepo.getAll(), period.from, period.to),
    [period]
  );
  const stability = useMemo(
    () => calculatePlanStability(eventEditRepo.getAll(), eventRepo.getAll(), period.from, period.to),
    [period]
  );

  const setCustom = useCallback((from: string, to: string) => {
    setCustomFrom(from);
    setCustomTo(to);
    setPreset('custom');
  }, []);

  return {
    preset,
    setPreset,
    metric,
    setMetric,
    period,
    customFrom,
    customTo,
    setCustom,
    subjectMap,
    subjectRows,
    totalMinutes,
    totalSessions,
    days,
    bucketSize,
    buckets,
    rhythm,
    consistency,
    tasks,
    stability,
  };
}
