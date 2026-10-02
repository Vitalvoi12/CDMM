import { Link } from 'react-router-dom';
import { useActiveSession } from '../../hooks/useActiveSession';
import { subjectRepo } from '../../services/repositories';
import { formatTimerDuration } from '../../utils/time';

/**
 * Live session card pinned above Settings in the desktop sidebar.
 * Inverse-surface so it stands out in both themes; English labels.
 */
export function LiveSessionCard() {
  const { isActive, isPaused, subjectId, elapsed } = useActiveSession();
  const subject = subjectId ? subjectRepo.getById(subjectId) : undefined;
  const status = !isActive ? 'Idle' : isPaused ? 'Paused' : 'Live session';

  return (
    <div
      key={isActive ? 'live' : 'idle'}
      className="rounded-2xl bg-surface-container-lowest text-on-surface border border-outline-variant px-5 py-4 flex flex-col gap-2 animate-fade-in"
    >
      <span className="font-label-sm text-label-sm tracking-[0.18em] opacity-60">
        {status}
      </span>
      {isActive ? (
        <>
          <span className="flex items-center gap-2.5 min-w-0">
            <span className="relative flex w-2.5 h-2.5 flex-shrink-0">
              {!isPaused && (
                <span
                  className="absolute w-full h-full rounded-full opacity-40 animate-ping"
                  style={{ backgroundColor: subject?.color || 'currentColor' }}
                />
              )}
              <span
                className="w-2.5 h-2.5 rounded-full"
                style={{ backgroundColor: subject?.color || 'currentColor' }}
              />
            </span>
            <span className="font-headline-md text-headline-md truncate">
              {subject?.name || 'Studying'}
            </span>
          </span>
          <span className="font-headline-lg text-headline-lg tabular-nums leading-none">
            {formatTimerDuration(elapsed)}
          </span>
        </>
      ) : (
        <span className="font-body-md text-body-md opacity-70">
          No active session
        </span>
      )}
      <Link
        to="/study"
        className="mt-1 font-label-md text-label-md tracking-[0.12em] opacity-70 hover:opacity-100 transition-opacity flex items-center gap-1.5"
      >
        Open Focus Room
        <span className="material-symbols-outlined text-[14px] leading-none">arrow_forward</span>
      </Link>
    </div>
  );
}
