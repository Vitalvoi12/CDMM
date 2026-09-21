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
  // Per-subject period filter (default: last 7 days).
  const [subjPeriod, setSubjPeriod] = useState<SubjectPeriod>('week');

  const heatmapDays = useMemo(() => buildYearHeatmap(events, year), [events, year]);
  const yearStats = useMemo(() => calculateYearStats(heatmapDays), [heatmapDays]);
  const weekStats = useMemo(() => calculateWeeklyStats(events, weekDate), [events, weekDate]);
  const { periodLabel, subjectStats } = useMemo(() => {
    const now = new Date();
    let from: Date;
    let label: string;
    if (subjPeriod === 'week') {
      from = addDays(startOfDay(now), -6);
      label = 'Last 7 days';
    } else if (subjPeriod === 'month') {
      from = addDays(startOfDay(now), -29);
      label = 'Last 30 days';
    } else {
      from = new Date(now.getFullYear(), 0, 1);
      label = `Year ${now.getFullYear()}`;
    }
    const rangeEvents = getEventsForRange(events, from, now);
    const total = rangeEvents
      .filter((e) => (e.kind ?? 'real') !== 'plan')
      .reduce((s, e) => s + Math.max(0, Math.round(minutesBetween(e.start, e.end))), 0);
    return { periodLabel: label, subjectStats: calculateSubjectStats(rangeEvents, total) };
  }, [events, subjPeriod]);

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
    subjPeriod,
    setSubjPeriod,
    periodLabel,
    subjectStats,
    subjectMap,
  };
}
