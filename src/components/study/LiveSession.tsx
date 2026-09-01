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
      <div className="flex-1 p-8 lg:p-16 flex flex-col justify-center items-center border-b 2xl:border-b-0 2xl:border-r border-outline-variant">
        <div className="text-center">
          <span className="material-symbols-outlined text-[64px] text-on-surface-variant mb-6 block">timer</span>
          <h2 className="font-headline-lg text-headline-lg text-on-surface mb-4">No Active Session</h2>
          <p className="font-body-md text-body-md text-on-surface-variant mb-8">Start studying to begin tracking your time</p>
          <button
            onClick={onStart}
            className="bg-primary text-on-primary px-16 py-6 rounded font-label-md text-label-md uppercase tracking-widest hover:bg-tertiary-container transition-colors flex items-center gap-2 mx-auto"
          >
            <span className="material-symbols-outlined text-[20px]">play_arrow</span>
            START SESSION
          </button>
        </div>
      </div>
    );
  }

  return (
      <div className="flex-1 p-8 lg:p-16 flex flex-col justify-center items-start border-b 2xl:border-b-0 2xl:border-r border-outline-variant relative overflow-hidden">
      {/* Live indicator */}
      <div className="absolute top-8 left-8 lg:top-16 lg:left-16 flex items-center gap-2 z-10">
        <div className="relative flex items-center justify-center w-4 h-4">
          <div className="absolute w-full h-full bg-primary-container rounded-full opacity-20 animate-ping" />
          <div className="w-2 h-2 bg-primary-container rounded-full" />
        </div>
        <span className="font-label-md text-label-md text-primary-container tracking-widest uppercase">
          Live Session
        </span>
      </div>

      <div className="flex flex-col gap-4 lg:gap-8 w-full mt-24 lg:mt-28 lg:justify-center min-h-0">
        <div>
          <h2 className="font-headline-md text-headline-md lg:font-display-lg lg:text-display-lg text-primary uppercase tracking-tighter leading-none break-words">
            {subjectName}
          </h2>
          <p className="font-body-sm text-body-sm lg:font-body-md lg:text-body-md text-on-secondary-container mt-2 uppercase tracking-wide">
            Started at {startTime ? timeFromDate(startTime) : '--:--'}
          </p>
        </div>
        <div
          className="font-display-lg text-primary leading-none tracking-tighter whitespace-nowrap tabular-nums w-full text-center 2xl:text-left"
          style={{ fontSize: 'clamp(3rem, min(calc((100vw - 26rem) / 9.5), 14vh), 11rem)' }}
        >
          {formatTimerDuration(elapsed)}
        </div>
        <div className="flex w-full mt-4">
          <button
            onClick={onStop}
            className="bg-primary-container text-on-primary px-10 lg:px-16 py-4 lg:py-6 rounded font-label-md text-label-md uppercase tracking-widest hover:bg-primary transition-colors flex items-center gap-2"
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
