import { useCallback, useReducer } from 'react';
import { useSyncRefresh } from '../hooks/useServerSync';
import { useStatisticsPeriod } from '../hooks/useStatisticsPeriod';
import { formatDuration, formatDurationLong } from '../utils/time';
import { PeriodSelect } from '../components/stats/PeriodSelect';
import { SubjectBreakdown } from '../components/stats/SubjectBreakdown';
import { TimeHeatmap } from '../components/stats/TimeHeatmap';
import { WhenYouStudy } from '../components/stats/WhenYouStudy';
import { ConsistencyPanel } from '../components/stats/ConsistencyPanel';
import { TaskStatsPanel } from '../components/stats/TaskStatsPanel';
import { PlanStabilityPanel } from '../components/stats/PlanStabilityPanel';
import { GoalsPanel } from '../components/stats/GoalsPanel';
import { FocusQualityPanel } from '../components/stats/FocusQualityPanel';
import { FocusTimeChart } from '../components/stats/FocusTimeChart';
import { StatTile } from '../components/stats/StatParts';
import { Statistics } from '../components/mobile/Statistics';
import { useIsMobile } from '../hooks/useIsMobile';

/**
 * One screen, one period. The header picks the range and every block below
 * recomputes from it, so subjects, rhythm, consistency, tasks and plan
 * stability always describe the same window.
 */
export function StatisticsPage() {
  const [, forceRefresh] = useReducer((x: number) => x + 1, 0);
  const refresh = useCallback(() => forceRefresh(), []);
  useSyncRefresh(refresh);

  const {
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
    includesToday,
    rhythm,
    consistency,
    tasks,
    stability,
    goals,
    focus,
  } = useStatisticsPeriod();
  const isMobile = useIsMobile();

  const panels = {
    subjects: (
      <SubjectBreakdown
        rows={subjectRows}
        metric={metric}
        onMetricChange={setMetric}
        totalMinutes={totalMinutes}
        totalSessions={totalSessions}
        periodLabel={period.label}
      />
    ),
    goals: <GoalsPanel goals={goals} days={period.days} />,
    rhythm: <TimeHeatmap rhythm={rhythm} periodLabel={period.label} />,
    focus: <FocusQualityPanel stats={focus} periodLabel={period.label} />,
    streak: <ConsistencyPanel stats={consistency} days={days} periodLabel={period.label} />,
    tasks: <TaskStatsPanel stats={tasks} periodLabel={period.label} />,
    plan: <PlanStabilityPanel stats={stability} subjectMap={subjectMap} periodLabel={period.label} />,
  };

  if (isMobile) {
    return (
      <Statistics
        range={period.label}
        preset={preset}
        onPreset={setPreset}
        customFrom={customFrom}
        customTo={customTo}
        onCustom={setCustom}
        tiles={[
          { label: 'Focus', value: formatDurationLong(totalMinutes) },
          { label: 'Sessions', value: totalSessions },
          {
            label: 'Avg focus',
            value:
              focus.average === null ? (
                '—'
              ) : (
                <>
                  {focus.average.toFixed(1)} <span className="m-sm m-mut font-normal">/ 3</span>
                </>
              ),
          },
          { label: 'Streak', value: `${consistency.currentStreak} day${consistency.currentStreak === 1 ? '' : 's'}` },
        ]}
        panels={{
          overview: (
            <>
              {panels.subjects}
              {panels.goals}
            </>
          ),
          focus: panels.focus,
          rhythm: (
            <>
              {panels.rhythm}
              {panels.streak}
            </>
          ),
          tasks: (
            <>
              {panels.tasks}
              {panels.plan}
            </>
          ),
        }}
      />
    );
  }

  // Desktop: header, summary tiles, then every block as a card in one grid.
  return (
    <div className="flex flex-col w-full gap-6 pb-12">
      <header className="flex items-start justify-between gap-4 flex-wrap animate-fade-up">
        <div className="flex flex-col gap-1">
          <h1 className="font-headline-lg text-headline-lg text-on-surface">Statistics</h1>
          <p className="font-body-lg text-body-lg text-on-surface-variant tabular-nums">{period.label}</p>
        </div>
        <PeriodSelect
          preset={preset}
          onChange={setPreset}
          customFrom={customFrom}
          customTo={customTo}
          onCustomChange={setCustom}
          align="end"
        />
      </header>

      <div className="grid gap-x-8 gap-y-5 py-2" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))' }}>
        <StatTile
          value={formatDurationLong(totalMinutes)}
          label="Focus"
          hint={`${formatDuration(Math.round(totalMinutes / period.days))} a day on average`}
        />
        <StatTile
          value={totalSessions}
          label="Sessions"
          hint={totalSessions > 0 ? `${formatDuration(Math.round(totalMinutes / totalSessions))} on average` : undefined}
          delay={60}
        />
        <StatTile
          value={focus.average === null ? '—' : focus.average.toFixed(1)}
          label="Avg focus"
          hint={`${focus.rated} of ${focus.sessions} rated`}
          delay={120}
        />
        <StatTile
          value={`${consistency.currentStreak} day${consistency.currentStreak === 1 ? '' : 's'}`}
          label="Streak"
          hint={`longest ${consistency.longestStreak}`}
          delay={180}
        />
      </div>

      <div className="grid gap-6 items-start" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 440px), 1fr))' }}>
        <FocusTimeChart
          buckets={buckets}
          size={bucketSize}
          averageMinutes={averageMinutes}
          totalMinutes={totalMinutes}
          periodLabel={period.label}
          includesToday={includesToday}
        />
        <SubjectBreakdown
          rows={subjectRows}
          metric={metric}
          onMetricChange={setMetric}
          totalMinutes={totalMinutes}
          totalSessions={totalSessions}
          periodLabel={period.label}
          layout="card"
        />
        <GoalsPanel goals={goals} days={period.days} layout="card" />
        <WhenYouStudy rhythm={rhythm} periodLabel={period.label} />
        <ConsistencyPanel stats={consistency} days={days} periodLabel={period.label} layout="card" />
        <FocusQualityPanel stats={focus} periodLabel={period.label} layout="card" />
        <TaskStatsPanel stats={tasks} periodLabel={period.label} layout="card" />
        <PlanStabilityPanel stats={stability} subjectMap={subjectMap} periodLabel={period.label} layout="card" />
      </div>
    </div>
  );
}
