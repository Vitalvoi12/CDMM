import { useMemo, useState, useCallback } from 'react';
import { eventRepo, subjectRepo } from '../services/repositories';
import {
  buildYearHeatmap,
  calculateYearStats,
  calculateWeeklyStats,
  calculateSubjectStats,
  getEventsForRange,
} from '../utils/stats';
import { addDays, minutesBetween, startOfDay } from '../utils/time';
import type { Subject } from '../types';

export type SubjectPeriod = 'week' | 'month' | 'year';

function toISODate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function parseISODate(s: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (!m) return null;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return Number.isNaN(d.getTime()) ? null : d;
}

/**
 * Single statistics data source for the Statistics page. The selected year
 * drives the heatmap and yearly summary; a separate week cursor drives the
 * daily/weekly section. Desktop and mobile presentations share this hook.
 */
export function useStudyStatistics() {
  const events = eventRepo.getAll();
  const subjects = subjectRepo.getAll();

  const [year, setYear] = useState(() => new Date().getFullYear());
  const [weekDate, setWeekDate] = useState(() => new Date());
  // Per-subject custom period picked via calendar inputs (default: last 7 days).
  const [subjFrom, setSubjFromState] = useState(() => toISODate(addDays(startOfDay(new Date()), -6)));
  const [subjTo, setSubjToState] = useState(() => toISODate(new Date()));

  const heatmapDays = useMemo(() => buildYearHeatmap(events, year), [events, year]);
  const yearStats = useMemo(() => calculateYearStats(heatmapDays), [heatmapDays]);
  const weekStats = useMemo(() => calculateWeeklyStats(events, weekDate), [events, weekDate]);
  const setSubjFrom = useCallback((v: string) => {
    if (parseISODate(v)) setSubjFromState(v);
  }, []);
  const setSubjTo = useCallback((v: string) => {
    if (parseISODate(v)) setSubjToState(v);
  }, []);
  const { periodLabel, subjectStats } = useMemo(() => {
    let from = parseISODate(subjFrom) ?? addDays(startOfDay(new Date()), -6);
    let to = parseISODate(subjTo) ?? new Date();
    if (from.getTime() > to.getTime()) [from, to] = [to, from];
    const rangeEvents = getEventsForRange(events, from, to);
    const total = rangeEvents
      .filter((e) => (e.kind ?? 'real') !== 'plan')
      .reduce((s, e) => s + Math.max(0, Math.round(minutesBetween(e.start, e.end))), 0);
    const fmt = (d: Date) => d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    const label =
      toISODate(from) === toISODate(to)
        ? fmt(from)
        : `${fmt(from)} – ${fmt(to)}`;
    return { periodLabel: label, subjectStats: calculateSubjectStats(rangeEvents, total) };
  }, [events, subjFrom, subjTo]);

  const subjectMap = useMemo(() => {
    const m: Record<string, Subject> = {};
    subjects.forEach((s) => (m[s.id] = s));
    return m;
  }, [subjects]);

  const goToPrevYear = useCallback(() => setYear((y) => y - 1), []);
  const goToNextYear = useCallback(() => setYear((y) => y + 1), []);
  const goToPrevWeek = useCallback(() => setWeekDate((d) => new Date(d.getFullYear(), d.getMonth(), d.getDate() - 7)), []);
  const goToNextWeek = useCallback(() => setWeekDate((d) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + 7)), []);

  return {
    year,
    setYear,
    goToPrevYear,
    goToNextYear,
    heatmapDays,
    yearStats,
    weekDate,
    goToPrevWeek,
    goToNextWeek,
    weekStats,
    subjFrom,
    subjTo,
    setSubjFrom,
    setSubjTo,
    // Back-compat alias: old 'week'|'month'|'year' slider removed in favor
    // of the calendar range. Kept so old imports don't break.
    subjPeriod: 'custom' as const,
    setSubjPeriod: (_p: SubjectPeriod) => {},
    periodLabel,
    subjectStats,
    subjectMap,
  };
}
