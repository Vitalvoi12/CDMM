import { useMemo, useState, useCallback } from 'react';
import { eventRepo, subjectRepo } from '../services/repositories';
import {
  buildYearHeatmap,
  calculateYearStats,
  calculateWeeklyStats,
  calculateSubjectStats,
} from '../utils/stats';
import type { Subject } from '../types';

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

  const heatmapDays = useMemo(() => buildYearHeatmap(events, year), [events, year]);
  const yearStats = useMemo(() => calculateYearStats(heatmapDays), [heatmapDays]);
  const weekStats = useMemo(() => calculateWeeklyStats(events, weekDate), [events, weekDate]);
  const subjectStats = useMemo(
    () => calculateSubjectStats(events, yearStats.totalMinutes),
    [events, yearStats.totalMinutes]
  );

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
    subjectStats,
    subjectMap,
  };
}
