import { useCallback, useReducer } from 'react';
import { useSyncRefresh } from '../hooks/useServerSync';
import { useStatisticsPeriod } from '../hooks/useStatisticsPeriod';
import { useOverscrollSpring } from '../hooks/useOverscrollSpring';
import { formatDurationLong } from '../utils/time';
import { PeriodSelect } from '../components/stats/PeriodSelect';
import { SubjectBreakdown } from '../components/stats/SubjectBreakdown';
import { TimeHeatmap } from '../components/stats/TimeHeatmap';
import { ConsistencyPanel } from '../components/stats/ConsistencyPanel';
import { TaskStatsPanel } from '../components/stats/TaskStatsPanel';
import { PlanStabilityPanel } from '../components/stats/PlanStabilityPanel';

/**
 * One screen, one period. The header picks the range and every block below
 * recomputes from it, so subjects, rhythm, consistency, tasks and plan
 * stability always describe the same window.
 */
export function StatisticsPage() {
  const springRef = useOverscrollSpring<HTMLDivElement>();
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
    rhythm,
    consistency,
    tasks,
    stability,
  } = useStatisticsPeriod();

  return (
    <div className="flex flex-col w-full h-full relative max-lg:flex-1 max-lg:min-h-0 max-lg:overflow-hidden">
      <div className="mb-8 max-lg:mb-3 animate-fade-up flex-shrink-0">
        <h1 className="font-headline-lg text-headline-lg max-lg:!text-[21px] max-lg:!leading-[27px] text-on-surface mb-1">Statistics</h1>
        <p className="font-body-lg text-body-lg text-on-surface-variant">
          {totalMinutes > 0
            ? `${formatDurationLong(totalMinutes)} of focus time · ${totalSessions} session${totalSessions === 1 ? '' : 's'} · ${period.label}`
            : period.label}
        </p>
        <div className="mt-6 max-lg:hidden">
          <PeriodSelect
            preset={preset}
            onChange={setPreset}
            customFrom={customFrom}
            customTo={customTo}
            onCustomChange={setCustom}
          />
        </div>
      </div>

      <div ref={springRef} className="flex flex-col flex-1 min-h-0 max-lg:flex-1 max-lg:min-h-0 max-lg:overflow-y-auto max-lg:overscroll-contain max-lg:pb-8">
      <div className="mb-6 lg:hidden">
        <PeriodSelect
          preset={preset}
          onChange={setPreset}
          customFrom={customFrom}
          customTo={customTo}
          onCustomChange={setCustom}
        />
      </div>
      <SubjectBreakdown
        rows={subjectRows}
        metric={metric}
        onMetricChange={setMetric}
        totalMinutes={totalMinutes}
        totalSessions={totalSessions}
        periodLabel={period.label}
      />

      <TimeHeatmap rhythm={rhythm} periodLabel={period.label} />

      <ConsistencyPanel stats={consistency} days={days} periodLabel={period.label} />

      <TaskStatsPanel stats={tasks} periodLabel={period.label} />

      <PlanStabilityPanel stats={stability} subjectMap={subjectMap} periodLabel={period.label} />
      </div>
    </div>
  );
}
