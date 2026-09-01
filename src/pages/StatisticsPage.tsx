import { useMemo, useState, useCallback } from 'react';
import { eventRepo, subjectRepo } from '../services/repositories';
import { calculateWeeklyStats, calculateSubjectStats } from '../utils/stats';
import { addDays, formatDurationLong } from '../utils/time';
import { DailyActivityChart } from '../components/stats/DailyActivityChart';
import { AverageCard } from '../components/stats/AverageCard';
import { MostStudiedCard } from '../components/stats/MostStudiedCard';
import { SubjectTable } from '../components/stats/SubjectTable';

export function StatisticsPage() {
  const allEvents = eventRepo.getAll();
  const subjects = subjectRepo.getAll();
  const [weekDate, setWeekDate] = useState(new Date());

  const stats = useMemo(() => calculateWeeklyStats(allEvents, weekDate), [allEvents, weekDate]);

  const subjectStats = useMemo(
    () => calculateSubjectStats(allEvents, stats.totalMinutes),
    [allEvents, stats.totalMinutes]
  );

  const subjectMap = useMemo(() => {
    const m: Record<string, typeof subjects[0]> = {};
    subjects.forEach((s) => (m[s.id] = s));
    return m;
  }, [subjects]);

  const mostStudiedSubject = stats.mostStudiedSubject
    ? subjectMap[stats.mostStudiedSubject.subjectId]
    : null;

  const goToPrevWeek = useCallback(() => setWeekDate((d) => addDays(d, -7)), []);
  const goToNextWeek = useCallback(() => setWeekDate((d) => addDays(d, 7)), []);

  return (
    <div className="flex flex-col w-full h-full relative">
      <div className="flex items-end justify-between mb-8">
        <div>
          <h1 className="font-headline-lg text-headline-lg text-on-surface mb-1">This Week</h1>
          <p className="font-display-lg text-display-lg text-primary tracking-tighter">
            {formatDurationLong(stats.totalMinutes)}
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={goToPrevWeek}
            className="w-10 h-10 flex items-center justify-center rounded bg-surface-container hover:bg-surface-container-high transition-colors text-on-surface"
          >
            <span className="material-symbols-outlined text-[20px]">chevron_left</span>
          </button>
          <button
            onClick={goToNextWeek}
            className="w-10 h-10 flex items-center justify-center rounded bg-surface-container hover:bg-surface-container-high transition-colors text-on-surface"
          >
            <span className="material-symbols-outlined text-[20px]">chevron_right</span>
          </button>
        </div>
      </div>

      <div className="grid grid-cols-12 gap-6 mb-16">
        <div className="col-span-8 max-lg:col-span-12 bg-surface-container rounded-xl p-6 flex flex-col justify-between shadow-sm relative overflow-hidden">
          <div className="absolute -right-20 -top-20 w-64 h-64 bg-primary/5 rounded-full blur-3xl" />
          <div className="flex justify-between items-center mb-8 relative z-10">
            <h2 className="font-label-md text-label-md text-on-surface uppercase tracking-widest">Daily Activity</h2>
          </div>
          <DailyActivityChart dailyMinutes={stats.dailyMinutes} />
        </div>
        <div className="col-span-4 max-lg:col-span-12 flex flex-col gap-6">
          <AverageCard averageMinutes={stats.dailyAverage} />
          <MostStudiedCard subject={mostStudiedSubject} minutes={stats.mostStudiedSubject?.minutes || 0} />
        </div>
      </div>

      <SubjectTable subjectStats={subjectStats} subjectMap={subjectMap} />
    </div>
  );
}
