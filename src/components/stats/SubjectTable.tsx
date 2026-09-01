import type { Subject } from '../../types';
import { formatDuration } from '../../utils/time';

interface SubjectTableProps {
  subjectStats: { subjectId: string; minutes: number; percentage: number }[];
  subjectMap: Record<string, Subject>;
}

export function SubjectTable({ subjectStats, subjectMap }: SubjectTableProps) {
  return (
    <div className="grid grid-cols-12 gap-6">
      <div className="col-span-12">
        <div className="flex justify-between items-end mb-6">
          <h2 className="font-headline-md text-headline-md text-on-surface">By Subject</h2>
        </div>
        <div className="bg-surface-container rounded-xl shadow-sm overflow-hidden">
          <div className="grid grid-cols-12 gap-4 p-4 bg-surface-container-high/50 font-label-sm text-label-sm text-on-surface-variant uppercase tracking-widest border-b border-surface-variant">
            <div className="col-span-5 pl-sm">Subject</div>
            <div className="col-span-5">Progress</div>
            <div className="col-span-2 text-right pr-sm">Time</div>
          </div>
          <div className="flex flex-col">
            {subjectStats.map((stat) => {
              const subject = subjectMap[stat.subjectId];
              return (
                <div
                  key={stat.subjectId}
                  className="grid grid-cols-12 gap-4 p-4 items-center hover:bg-surface-container-high transition-colors group"
                >
                  <div className="col-span-5 flex items-center gap-4 pl-sm">
                    <div
                      className="w-3 h-3 rounded-full"
                      style={{ backgroundColor: subject?.color || '#999' }}
                    />
                    <span className="font-body-md text-body-md text-on-surface font-medium">
                      {subject?.name || stat.subjectId}
                    </span>
                  </div>
                  <div className="col-span-5 flex items-center gap-4">
                    <div className="flex-1 h-1.5 bg-surface-variant rounded-full overflow-hidden">
                      <div
                        className="h-full rounded-full group-hover:scale-x-[1.02] origin-left transition-transform"
                        style={{
                          width: `${stat.percentage}%`,
                          backgroundColor: subject?.color || '#999',
                        }}
                      />
                    </div>
                    <span className="font-label-sm text-label-sm text-on-surface-variant w-8">
                      {stat.percentage}%
                    </span>
                  </div>
                  <div className="col-span-2 text-right pr-sm font-label-md text-label-md text-on-surface">
                    {formatDuration(stat.minutes)}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
