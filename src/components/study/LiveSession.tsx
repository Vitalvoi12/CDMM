import { formatTimerDuration, timeFromDate } from '../../utils/time';

interface LiveSessionProps {
  isActive: boolean;
  subjectName: string;
  startTime: string | null;
  elapsed: number;
  onStop?: () => void;
  onStart?: () => void;
}

export function LiveSession({ isActive, subjectName, startTime, elapsed, onStop, onStart }: LiveSessionProps) {
  if (!isActive) {
    return (
      <div className="flex-1 p-8 lg:p-16 max-lg:p-4 flex flex-col justify-center items-center border-b 2xl:border-b-0 2xl:border-r border-outline-variant">
        <div className="text-center">
          <span className="material-symbols-outlined text-[64px] max-lg:text-[32px] text-on-surface-variant mb-6 max-lg:mb-3 block">timer</span>
          <h2 className="font-headline-lg text-headline-lg max-lg:!text-[16px] max-lg:mb-2 text-on-surface mb-4">No Active Session</h2>
          <p className="font-body-md text-body-md max-lg:!text-[11px] max-lg:mb-4 text-on-surface-variant mb-8">Start studying to begin tracking your time</p>
          <button
            onClick={onStart}
            className="bg-primary text-on-primary px-16 py-6 max-lg:px-8 max-lg:py-3 max-lg:!text-[10px] rounded font-label-md text-label-md uppercase tracking-widest hover:bg-tertiary-container transition-colors flex items-center gap-2 mx-auto"
          >
            <span className="material-symbols-outlined text-[20px] max-lg:text-[16px]">play_arrow</span>
            START SESSION
          </button>
        </div>
      </div>
    );
  }

  return (
      <div className="flex-1 p-8 lg:p-16 max-lg:p-4 flex flex-col justify-center items-start border-b 2xl:border-b-0 2xl:border-r border-outline-variant relative overflow-hidden">
      {/* Live indicator */}
      <div className="absolute top-8 left-8 lg:top-16 lg:left-16 max-lg:top-3 max-lg:left-3 flex items-center gap-2 z-10">
        <div className="relative flex items-center justify-center w-4 h-4 max-lg:w-3 max-lg:h-3">
          <div className="absolute w-full h-full bg-primary-container rounded-full opacity-20 animate-ping" />
          <div className="w-2 h-2 max-lg:w-1.5 max-lg:h-1.5 bg-primary-container rounded-full" />
        </div>
        <span className="font-label-md text-label-md max-lg:!text-[10px] text-primary-container tracking-widest uppercase">
          Live Session
        </span>
      </div>

      <div className="flex flex-col gap-4 lg:gap-8 max-lg:gap-2 w-full mt-24 lg:mt-28 max-lg:mt-12 lg:justify-center min-h-0">
        <div>
          <h2 className="font-headline-md text-headline-md lg:font-display-lg lg:text-display-lg max-lg:!text-[16px] text-primary uppercase tracking-tighter leading-none break-words">
            {subjectName}
          </h2>
          <p className="font-body-sm text-body-sm lg:font-body-md lg:text-body-md max-lg:!text-[10px] max-lg:mt-1 text-on-secondary-container mt-2 uppercase tracking-wide">
            Started at {startTime ? timeFromDate(startTime) : '--:--'}
          </p>
        </div>
        <div
          className="study-timer font-display-lg text-primary leading-none tracking-tighter whitespace-nowrap tabular-nums w-full text-center 2xl:text-left"
        >
          {formatTimerDuration(elapsed)}
        </div>
        <div className="flex w-full mt-4 max-lg:mt-2">
          <button
            onClick={onStop}
            className="bg-primary-container text-on-primary px-10 lg:px-16 py-4 lg:py-6 max-lg:px-5 max-lg:py-2 max-lg:!text-[10px] rounded font-label-md text-label-md uppercase tracking-widest hover:bg-primary transition-colors flex items-center gap-2"
          >
            <span className="material-symbols-outlined" style={{ fontVariationSettings: "'FILL' 1" }}>
              stop
            </span>
            Stop Session
          </button>
        </div>
      </div>
    </div>
  );
}
