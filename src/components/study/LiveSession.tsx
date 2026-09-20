import { formatTimerDuration, timeFromDate } from '../../utils/time';
import type { Subject } from '../../types';

interface LiveSessionProps {
  isActive: boolean;
  subjectName: string;
  startTime: string | null;
  elapsed: number;
  subjects?: Subject[];
  onStop?: () => void;
  onStart?: () => void;
  onQuickStart?: (subjectId: string) => void;
}

export function LiveSession({ isActive, subjectName, startTime, elapsed, subjects = [], onStop, onStart, onQuickStart }: LiveSessionProps) {
  if (!isActive) {
    return (
      <div className="flex-1 p-8 lg:p-12 max-lg:p-4 flex flex-col justify-center items-center min-h-0">
        <div className="w-full max-w-2xl bg-surface-container-lowest border border-outline-variant rounded-2xl px-8 py-14 max-lg:px-4 max-lg:py-8 flex flex-col items-center text-center">
          <div className="w-16 h-16 max-lg:w-12 max-lg:h-12 rounded-full border border-outline-variant flex items-center justify-center mb-6 max-lg:mb-4">
            <span className="material-symbols-outlined text-[22px] max-lg:text-[18px] text-on-surface-variant block">timer</span>
          </div>
          <h2 className="font-headline-lg text-headline-lg max-lg:!text-[14px] text-on-surface mb-2">No Active Session</h2>
          <p className="font-body-md text-body-md max-lg:!text-[10px] text-on-surface-variant mb-6 max-lg:mb-4">
            Start studying to begin tracking your time
          </p>
          <p className="font-label-sm text-label-sm text-on-surface-variant uppercase tracking-[0.2em] mb-6 max-lg:mb-4 tabular-nums">
            Ready · 00:00:00
          </p>
          <button
            onClick={onStart}
            className="bg-primary text-on-primary px-10 py-3.5 max-lg:px-8 max-lg:py-3 rounded-full font-label-md text-label-md uppercase tracking-[0.12em] hover:opacity-90 transition-opacity"
          >
            Start Session
          </button>
          {subjects.length > 0 && (
            <div className="hidden lg:flex flex-wrap items-center justify-center gap-2.5 mt-8 max-lg:mt-5">
              {subjects.map((s) => (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => onQuickStart?.(s.id)}
                  title={`Start ${s.name}`}
                  className="flex items-center gap-2 px-4 py-2 rounded-full border border-outline-variant text-on-surface-variant hover:text-on-surface hover:border-outline transition-colors font-body-md text-body-md max-lg:!text-[10px]"
                >
                  <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: s.color }} />
                  {s.name}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 p-8 lg:p-12 max-lg:p-4 flex flex-col justify-center items-center min-h-0">
      <div className="w-full max-w-2xl bg-surface-container-lowest border border-outline-variant rounded-2xl px-8 py-14 max-lg:px-4 max-lg:py-8 flex flex-col items-center text-center relative overflow-hidden">
        <div className="flex items-center gap-2 mb-8 max-lg:mb-5">
          <span className="relative flex w-2.5 h-2.5">
            <span className="absolute w-full h-full bg-now rounded-full opacity-40 animate-ping" />
            <span className="w-2.5 h-2.5 bg-now rounded-full" />
          </span>
          <span className="font-label-md text-label-md text-error uppercase tracking-[0.2em]">
            Live Session
          </span>
        </div>
        <h2 className="font-display-lg text-display-lg max-lg:!text-[22px] max-lg:leading-none text-on-surface tracking-tight leading-none break-words mb-2">
          {subjectName}
        </h2>
        <p className="font-label-sm text-label-sm max-lg:!text-[8px] text-on-surface-variant uppercase tracking-[0.2em] mb-8 max-lg:mb-5">
          Started at {startTime ? timeFromDate(startTime) : '--:--'}
        </p>
        <div className="study-timer font-display-lg text-on-surface leading-none tracking-tighter whitespace-nowrap tabular-nums mb-10 max-lg:mb-6">
          {formatTimerDuration(elapsed)}
        </div>
        <button
          onClick={onStop}
          className="bg-error-container text-on-error-container px-10 py-3.5 max-lg:px-6 max-lg:py-2.5 rounded-full font-label-md text-label-md uppercase tracking-[0.12em] hover:opacity-90 transition-opacity flex items-center gap-2"
        >
          <span className="material-symbols-outlined text-[14px]" style={{ fontVariationSettings: "'FILL' 1" }}>
            stop
          </span>
          Stop Session
        </button>
      </div>
    </div>
  );
}
