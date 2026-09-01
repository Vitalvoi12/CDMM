import type { Subject } from '../../types';
import { formatDuration } from '../../utils/time';

interface MostStudiedCardProps {
  subject: Subject | null;
  minutes: number;
}

export function MostStudiedCard({ subject, minutes }: MostStudiedCardProps) {
  return (
    <div className="bg-surface-container rounded-xl p-6 shadow-sm flex flex-col justify-between h-full">
      <h3 className="font-label-md text-label-md uppercase tracking-widest text-on-surface-variant mb-2">
        Most Studied
      </h3>
      {subject ? (
        <div className="flex items-center gap-4 mt-auto">
          <div
            className="w-12 h-12 rounded-full bg-surface flex items-center justify-center shadow-sm"
            style={{ color: subject.color }}
          >
            <span className="material-symbols-outlined">{subject.icon || 'school'}</span>
          </div>
          <div>
            <p className="font-headline-md text-headline-md text-on-surface">{subject.name}</p>
            <p className="font-body-sm text-body-sm text-on-surface-variant">
              {formatDuration(minutes)} total
            </p>
          </div>
        </div>
      ) : (
        <div className="flex items-center justify-center mt-auto h-12">
          <p className="font-body-sm text-body-sm text-on-surface-variant">No data yet</p>
        </div>
      )}
    </div>
  );
}
