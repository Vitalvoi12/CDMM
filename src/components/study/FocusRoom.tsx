import { formatTimerDuration, timeFromDate } from '../../utils/time';
import type { Subject } from '../../types';

interface FocusRoomProps {
  isActive: boolean;
  isPaused?: boolean;
  subjectName: string;
  startTime: string | null;
  elapsed: number;
  subjects?: Subject[];
  dailyMinutes: number;
  streakDays: number;
  onStop?: () => void;
  onPause?: () => void;
  onResume?: () => void;
  onStart?: () => void;
  onQuickStart?: (subjectId: string) => void;
}

export function FocusRoom({
  isActive,
  isPaused = false,
  subjectName,
  startTime,
  elapsed,
  subjects = [],
  dailyMinutes,
  streakDays,
  onStop,
  onPause,
  onResume,
  onStart,
  onQuickStart,
}: FocusRoomProps) {
  const stats = [
    { label: 'Today', value: formatDurationLongCompact(dailyMinutes) },
    { label: 'Current streak', value: `${streakDays} day${streakDays === 1 ? '' : 's'}`.toUpperCase() },
  ];

  const status = isActive ? (isPaused ? 'Paused' : 'Live') : 'Idle';

  return (
    <div className="flex-1 min-h-0">
      <div className="mx-auto w-full max-w-6xl px-6 py-8 max-lg:px-4 max-lg:py-4 flex flex-col gap-6 max-lg:gap-3 min-h-0 h-full">
        <div className="flex items-center justify-between gap-4 flex-shrink-0 animate-fade-up">
          <h1 className="font-headline-lg text-headline-lg text-on-surface uppercase tracking-tight">
            Focus Room
          </h1>
          <span
            key={status}
            className="font-label-sm text-label-sm text-on-surface-variant uppercase tracking-[0.18em] animate-fade-in"
          >
            {status}
          </span>
        </div>

        <div className="grid grid-cols-2 max-lg:grid-cols-2 gap-4 max-lg:gap-2 flex-shrink-0">
          {stats.map((s, i) => (
            <div
              key={s.label}
              style={{ animationDelay: `${60 + i * 70}ms` }}
              className="bg-surface-container-lowest border border-outline-variant rounded-xl px-5 py-4 max-lg:px-3 max-lg:py-2.5 animate-fade-up"
            >
              <p className="font-label-sm text-label-sm max-lg:!text-[8px] text-on-surface-variant uppercase tracking-[0.18em] mb-2 max-lg:mb-1">
                {s.label}
              </p>
              <p
                key={s.value}
                className="font-headline-md text-headline-md max-lg:!text-[16px] text-on-surface tabular-nums animate-fade-in"
              >
                {s.value}
              </p>
            </div>
          ))}
        </div>

        <div className="grid grid-cols-12 gap-4 max-lg:gap-3 min-h-0 flex-1">
          {/* Live / idle card */}
          <section className="col-span-12 lg:col-span-8 bg-surface-container-lowest border border-outline-variant rounded-xl p-8 max-lg:p-4 flex flex-col min-h-0 overflow-y-auto animate-fade-up"
            style={{ animationDelay: '140ms' }}
          >
            {isActive ? (
              <div className="w-full flex flex-col min-h-0">
                <div className="flex items-center justify-between gap-3 mb-6 max-lg:mb-3">
                  <span className="font-label-sm text-label-sm text-on-surface-variant uppercase tracking-[0.18em]">
                    Live session
                  </span>
                  <span
                    className={`flex items-center gap-2 font-label-sm text-label-sm uppercase tracking-[0.18em] ${
                      isPaused ? 'text-on-surface-variant' : 'text-primary'
                    }`}
                  >
                    <span className="relative flex w-2 h-2">
                      {!isPaused && (
                        <span className="absolute w-full h-full bg-now rounded-full opacity-40 animate-ping" />
                      )}
                      <span className={`w-2 h-2 rounded-full ${isPaused ? 'bg-outline' : 'bg-now'}`} />
                    </span>
                    {isPaused ? 'Paused' : 'Recording'}
                  </span>
                </div>
                <p
                  key={isPaused ? 'paused' : 'recording'}
                  className="font-display-lg text-display-lg max-lg:!text-[34px] max-lg:leading-none text-on-surface tabular-nums leading-none tracking-tight text-center animate-fade-in"
                >
                  {formatTimerDuration(elapsed)}
                </p>
                <p className="font-label-md text-label-md text-on-surface uppercase tracking-[0.16em] text-center mt-4 max-lg:mt-2 break-words">
                  {subjectName}
                </p>
                <p className="font-label-sm text-label-sm text-on-surface-variant uppercase tracking-[0.18em] text-center mt-2">
                  Started {startTime ? timeFromDate(startTime) : '--:--'}
                </p>
                <div className="flex items-center justify-center gap-3 mt-8 max-lg:mt-4 flex-shrink-0 flex-wrap">
                  <button
                    type="button"
                    onClick={isPaused ? onResume : onPause}
                    className="px-8 py-3 max-lg:px-6 max-lg:py-2.5 rounded-xl border border-outline text-on-surface font-label-md text-label-md max-lg:!text-[10px] uppercase tracking-[0.12em] hover:bg-surface-container-low hover:-translate-y-px transition-all whitespace-nowrap"
                  >
                    {isPaused ? 'Resume' : 'Pause'}
                  </button>
                  <button
                    type="button"
                    onClick={onStop}
                    className="px-8 py-3 max-lg:px-6 max-lg:py-2.5 rounded-full bg-primary text-on-primary font-label-md text-label-md max-lg:!text-[10px] uppercase tracking-[0.12em] hover:opacity-90 hover:-translate-y-px hover:shadow-elev-2 transition-all whitespace-nowrap"
                  >
                    Finish
                  </button>
                </div>
              </div>
            ) : (
              <div className="w-full flex flex-col min-h-0">
                <p className="font-label-sm text-label-sm text-on-surface-variant uppercase tracking-[0.18em] mb-4 max-lg:mb-2">
                  Start studying
                </p>
                <p className="font-display-lg text-display-lg max-lg:!text-[34px] max-lg:leading-none text-on-surface tabular-nums leading-none tracking-tight text-center">
                  00:00:00
                </p>
                <p className="font-body-md text-body-md max-lg:!text-[10px] text-on-surface-variant text-center mt-4 max-lg:mt-2">
                  Choose a subject to begin
                </p>
                <div className="flex items-center justify-center mt-8 max-lg:mt-4 flex-shrink-0 flex-wrap">
                  <button
                    type="button"
                    onClick={onStart}
                    className="px-10 py-3.5 max-lg:px-8 max-lg:py-3 rounded-full bg-primary text-on-primary font-label-md text-label-md max-lg:!text-[10px] uppercase tracking-[0.12em] hover:opacity-90 hover:-translate-y-0.5 hover:shadow-elev-2 transition-all whitespace-nowrap"
                  >
                    Start studying
                  </button>
                </div>
              </div>
            )}
          </section>

          {/* Quick subject start */}
          <aside className="max-lg:hidden col-span-12 lg:col-span-4 bg-surface-container-lowest border border-outline-variant rounded-xl p-6 max-lg:p-4 flex flex-col min-h-0 animate-fade-up" style={{ animationDelay: '200ms' }}>
            <p className="font-label-sm text-label-sm text-on-surface-variant uppercase tracking-[0.18em] mb-4 max-lg:mb-2 flex-shrink-0">
              Quick subject start
            </p>
            <div className="flex flex-col gap-2.5 max-lg:gap-2 overflow-y-auto min-h-0">
              {subjects.map((s, i) => (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => onQuickStart?.(s.id)}
                  disabled={isActive}
                  title={isActive ? `${s.name} (session running)` : s.name}
                  style={{ animationDelay: `${260 + Math.min(i, 8) * 50}ms` }}
                  className="flex items-center gap-3 px-4 py-3 max-lg:px-3 max-lg:py-2.5 rounded-xl border border-outline-variant hover:border-primary hover:translate-x-1 transition-all text-left disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:translate-x-0 animate-fade-up"
                >
                  <span className="flex items-center gap-3 min-w-0">
                    <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: s.color }} />
                    <span className="font-body-md text-body-md max-lg:!text-[10px] text-on-surface truncate">
                      {s.name}
                    </span>
                  </span>
                </button>
              ))}
              {subjects.length === 0 && (
                <p className="font-body-md text-body-md max-lg:!text-[10px] text-on-surface-variant">
                  No subjects yet
                </p>
              )}
            </div>
          </aside>
        </div>

      </div>
    </div>
  );
}

function formatDurationLongCompact(minutes: number): string {
  // Matches the mockup: HH:MM without units ("03H 42M").
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${String(h).padStart(2, '0')}H ${String(m).padStart(2, '0')}M`;
}