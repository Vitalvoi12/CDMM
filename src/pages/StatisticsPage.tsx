import { useReducer } from 'react';
import { useSyncRefresh } from '../hooks/useServerSync';
import { useStudyStatistics } from '../hooks/useStudyStatistics';
import { formatDurationLong, formatDuration } from '../utils/time';
import { StudyHeatmap } from '../components/stats/heatmap/StudyHeatmap';
import { DailyActivityChart } from '../components/stats/DailyActivityChart';
import { SubjectTable } from '../components/stats/SubjectTable';

const WEEKDAY_FULL = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

export function StatisticsPage() {
  const [, forceRefresh] = useReducer((x: number) => x + 1, 0);
  useSyncRefresh(forceRefresh);
  const {
    year,
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
  } = useStudyStatistics();

  const weekStart = new Date(weekDate.getFullYear(), weekDate.getMonth(), weekDate.getDate() - ((weekDate.getDay() + 6) % 7));
  const bestDayIdx = weekStats.dailyMinutes.indexOf(Math.max(...weekStats.dailyMinutes));
  const mostStudied = yearStats.bestDay
    ? new Date(
        Number(yearStats.bestDay.date.slice(0, 4)),
        Number(yearStats.bestDay.date.slice(5, 7)) - 1,
        Number(yearStats.bestDay.date.slice(8, 10))
      )
    : null;

  return (
    <div className="flex flex-col w-full h-full relative">
      {/* Year navigation */}
      <div className="flex items-end justify-between mb-8">
        <div>
          <h1 className="font-headline-lg text-headline-lg text-on-surface mb-1">Statistics</h1>
          <p className="font-body-lg text-body-lg text-on-surface-variant">Study activity for {year}</p>
        </div>
        <div className="flex gap-2 items-center">
          <button
            onClick={goToPrevYear}
            aria-label="Previous year"
            className="w-10 h-10 flex items-center justify-center rounded bg-surface-container hover:bg-surface-container-high transition-colors text-on-surface"
          >
            <span className="material-symbols-outlined text-[20px]">chevron_left</span>
          </button>
          <span className="font-headline-md text-headline-md text-on-surface tabular-nums w-16 text-center">
            {year}
          </span>
          <button
            onClick={goToNextYear}
            aria-label="Next year"
            className="w-10 h-10 flex items-center justify-center rounded bg-surface-container hover:bg-surface-container-high transition-colors text-on-surface"
          >
            <span className="material-symbols-outlined text-[20px]">chevron_right</span>
          </button>
        </div>
      </div>

      {/* Study activity */}
      <section className="mb-12">
        <div className="flex justify-between items-end mb-6 flex-wrap gap-3">
          <h2 className="font-label-md text-label-md text-on-surface uppercase tracking-widest">
            Study activity
          </h2>
        </div>
        <StudyHeatmap days={heatmapDays} year={year} onPrevYear={goToPrevYear} onNextYear={goToNextYear} />
      </section>

      {/* Summary */}
      <section className="mb-12">
        <div className="grid grid-cols-2 max-lg:grid-cols-2 lg:grid-cols-4 gap-6">
          {[
            { value: formatDurationLong(yearStats.totalMinutes), label: 'Total study' },
            { value: String(yearStats.activeDays), label: 'Active days' },
            { value: String(yearStats.sessionCount), label: 'Sessions' },
            { value: formatDuration(yearStats.averageSessionMinutes), label: 'Average session' },
          ].map((m) => (
            <div key={m.label} className="border-l-2 border-outline-variant pl-4">
              <p className="font-headline-md text-headline-md text-on-surface tabular-nums">{m.value}</p>
              <p className="font-label-sm text-label-sm text-on-surface-variant uppercase tracking-widest mt-1">
                {m.label}
              </p>
            </div>
          ))}
        </div>
        <p className="font-body-sm text-body-sm text-on-surface-variant mt-6">
          {mostStudied
            ? `Best day ${mostStudied.toLocaleDateString('en-US', { month: 'long', day: 'numeric' })} · ${formatDurationLong(yearStats.bestDay!.minutes)} · Longest streak ${yearStats.longestStreakDays} day${yearStats.longestStreakDays === 1 ? '' : 's'}`
            : 'No study recorded this year yet.'}
        </p>
      </section>

      {/* Daily study time + weekly overview */}
      <section className="mb-12">
        <div className="flex justify-between items-end mb-6 flex-wrap gap-3">
          <h2 className="font-label-md text-label-md text-on-surface uppercase tracking-widest">
            Daily study time
          </h2>
          <div className="flex gap-2 items-center">
            <button
              onClick={goToPrevWeek}
              aria-label="Previous week"
              className="w-9 h-9 flex items-center justify-center rounded bg-surface-container hover:bg-surface-container-high transition-colors text-on-surface"
            >
              <span className="material-symbols-outlined text-[20px]">chevron_left</span>
            </button>
            <span className="font-label-md text-label-md text-on-surface tabular-nums">
              {weekStart.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} –{' '}
              {new Date(weekStart.getFullYear(), weekStart.getMonth(), weekStart.getDate() + 6).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
            </span>
            <button
              onClick={goToNextWeek}
              aria-label="Next week"
              className="w-9 h-9 flex items-center justify-center rounded bg-surface-container hover:bg-surface-container-high transition-colors text-on-surface"
            >
              <span className="material-symbols-outlined text-[20px]">chevron_right</span>
            </button>
          </div>
        </div>

        <div className="bg-surface-container rounded-xl p-6 mb-6">
          <DailyActivityChart dailyMinutes={weekStats.dailyMinutes} />
        </div>

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-6">
          {[
            { label: 'Total', value: formatDurationLong(weekStats.totalMinutes) },
            { label: 'Average', value: `${formatDuration(weekStats.dailyAverage)}/day` },
            {
              label: 'Active',
              value: `${weekStats.dailyMinutes.filter((m) => m > 0).length} / 7 days`,
            },
            {
              label: 'Best day',
              value:
                weekStats.totalMinutes > 0
                  ? `${WEEKDAY_FULL[(bestDayIdx + 1) % 7]} · ${formatDurationLong(weekStats.dailyMinutes[bestDayIdx])}`
                  : '—',
            },
          ].map((m) => (
            <div key={m.label} className="border-l-2 border-outline-variant pl-4">
              <p className="font-body-md text-body-md text-on-surface font-semibold tabular-nums">{m.value}</p>
              <p className="font-label-sm text-label-sm text-on-surface-variant uppercase tracking-widest mt-1">
                {m.label}
              </p>
            </div>
          ))}
        </div>
      </section>

      {/* Subjects */}
      <section className="mb-4">
        <h2 className="font-label-md text-label-md text-on-surface uppercase tracking-widest mb-6">
          Subjects · {year}
        </h2>
        <SubjectTable subjectStats={subjectStats} subjectMap={subjectMap} />
      </section>
    </div>
  );
}
