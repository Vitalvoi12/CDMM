import { useCallback, useMemo, useState } from 'react';
import { eventEditRepo, eventRepo, subjectRepo, todoRepo } from '../services/repositories';
import {
  bucketSizeFor,
  buildDaySeries,
  buildFocusBuckets,
  buildRhythm,
  calculateConsistency,
  calculateFocusQuality,
  calculatePlanStability,
  calculateTaskStats,
  resolvePeriod,
  splitStudySlices,
  toISODate,
  type PeriodPreset,
} from '../utils/analytics';
import { addDays, endOfDay, startOfDay } from '../utils/time';
import { goalProgress } from '../utils/goals';
import type { Subject } from '../types';

export type SubjectMetric = 'time' | 'share';

export interface SubjectRow {
  subjectId: string;
  name: string;
  color: string;
  minutes: number;
  sessions: number;
  /** Share of the period's studied time, 0-100. */
  timeShare: number;
  /** Planned minutes this subject was given over the period. */
  planMinutes: number;
  /**
   * How much of this subject's own plan was actually studied: real / planned,
   * 0-100 (uncapped — studying past the plan shows over 100). Null when the
   * subject has no plan in the period, so the reader sees "—" instead of a
   * percentage that would mean nothing.
   */
  planShare: number | null;
  /** Length of the largest bar in the current metric, 0-100. */
  barWidth: number;
}

/**
 * The single data source of the Statistics screen.
 *
 * One period selection feeds every block, so switching the range in the header
 * recomputes subjects, focus time, rhythm, consistency, tasks and plan
 * stability together — they can never drift out of sync with each other.
 * Studied time is always derived from real focus sessions; planned blocks are
 * read only where a metric explicitly compares against the plan.
 */
export function useStatisticsPeriod() {
  const [preset, setPreset] = useState<PeriodPreset>('7d');
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

  /**
   * Planned minutes per subject over the period — the denominator of the plan
   * percentage in the Time view.
   *
   * Only planned blocks count, and only while they are both inside the period
   * and opted into statistics: an excluded block was never part of the plan
   * this metric describes. `slices` cannot answer this because it is built
   * from real focus sessions only (plans are filtered out before slicing).
   */
  const planBySubject = useMemo(() => {
    const acc = new Map<string, number>();
    // `period.to` is the midnight of the last day — the range has to be closed
    // with endOfDay or the final day's plan would be dropped.
    const fromMs = period.from.getTime();
    const toMs = endOfDay(period.to).getTime();
    for (const e of eventRepo.getAll()) {
      if ((e.kind ?? 'real') !== 'plan' || e.countInStats === false) continue;
      const s = new Date(e.start).getTime();
      const en = new Date(e.end).getTime();
      if (!Number.isFinite(s) || !Number.isFinite(en) || en <= s) continue;
      // Clip to the period: a block that runs past either edge contributes
      // only the minutes that actually fall inside it.
      const start = Math.max(s, fromMs);
      const end = Math.min(en, toMs);
      if (end <= start) continue;
      acc.set(e.subjectId, (acc.get(e.subjectId) || 0) + Math.round((end - start) / 60000));
    }
    return acc;
  }, [period]);

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
      const plan = planBySubject.get(subjectId) || 0;
      return {
        subjectId,
        name: subject?.name || 'No subject',
        color: subject?.color || 'var(--color-on-surface-variant)',
        minutes: v.minutes,
        sessions: v.sessions,
        timeShare: totalMinutes > 0 ? (v.minutes / totalMinutes) * 100 : 0,
        planMinutes: plan,
        planShare: plan > 0 ? (v.minutes / plan) * 100 : null,
        barWidth: 0,
      };
    });
    // Both remaining metrics describe time, so the order follows it. Rows
    // share the peak bar of the time column — the plan percentage is a label,
    // not a length.
    rows.sort((a, b) => b.minutes - a.minutes || b.sessions - a.sessions);
    const peak = Math.max(1, ...rows.map((r) => r.minutes));
    for (const r of rows) {
      r.barWidth = (r.minutes / peak) * 100;
    }
    return rows;
  }, [inPeriod, subjects, subjectMap, planBySubject, totalMinutes]);

  const days = useMemo(() => buildDaySeries(slices, period.from, period.to), [slices, period]);
  const bucketSize = useMemo(
    () => bucketSizeFor(period.preset, period.days),
    [period]
  );
  const buckets = useMemo(
    () => buildFocusBuckets(days, period.from, period.to, bucketSize),
    [days, period, bucketSize]
  );
  // Mean per bucket, empty buckets included: the chart's reference line.
  const averageMinutes = buckets.length > 0 ? totalMinutes / buckets.length : 0;
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

  // Weekly goals stretched to the period: a 6h/week goal asks 12h of 14 days.
  const goals = useMemo(
    () =>
      goalProgress(
        eventRepo.getAll(),
        subjects,
        period.from.getTime(),
        endOfDay(period.to).getTime() + 1,
        period.days / 7
      ),
    [subjects, period]
  );
  const focus = useMemo(
    () => calculateFocusQuality(eventRepo.getAll(), period.from, period.to),
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
    averageMinutes,
    rhythm,
    consistency,
    tasks,
    stability,
    goals,
    focus,
  };
}
