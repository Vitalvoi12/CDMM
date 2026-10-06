import { useCallback, useEffect, useState } from 'react';
import { useActiveSession } from '../../hooks/useActiveSession';
import { eventRepo, subjectRepo } from '../../services/repositories';
import { checkpoint } from '../../services/history';
import { subscribeSessionStart, subscribeSessionStartEdit } from '../../services/liveSession';
import { formatTimerDuration, timeFromDate } from '../../utils/time';
import { SubjectPickerModal } from '../subjects/SubjectPickerModal';
import { SessionStartEditor } from '../study/SessionStartEditor';

/**
 * The live session panel pinned above Settings in the desktop sidebar, and the
 * only place the session is driven from on a PC: start it, watch it, fix a
 * forgotten start, finish it. The Focus Room tab is gone from the desktop nav,
 * so everything needed has to live here.
 *
 * Inverse-surface so it stands out in both themes; English labels.
 */
export function LiveSessionCard() {
  const { isActive, subjectId, startTime, elapsed, startSession, setStartTime, stopSession } = useActiveSession();
  const [showPicker, setShowPicker] = useState(false);
  const [showStartEditor, setShowStartEditor] = useState(false);

  const subject = subjectId ? subjectRepo.getById(subjectId) : undefined;

  // F asks for a session start from the app shell, which cannot render the
  // picker itself. Ignored while one runs: there is only ever one live session
  // per account, so there is nothing to switch to.
  useEffect(() => {
    if (isActive) return;
    return subscribeSessionStart(() => setShowPicker(true));
  }, [isActive]);

  // C opens the start editor while a session runs.
  useEffect(() => {
    if (!isActive) return;
    return subscribeSessionStartEdit(() => setShowStartEditor(true));
  }, [isActive]);

  /**
   * Close the session and persist it as a real event — the same write the
   * Focus Room did, kept here so finishing works from the sidebar alone.
   */
  const finish = useCallback(() => {
    const event = stopSession();
    if (!event) return;
    checkpoint('Stop session');
    eventRepo.create({
      id: event.id,
      subjectId: event.subjectId,
      title: subject?.name || event.title,
      start: event.start,
      end: event.end,
      kind: 'real',
      countInStats: true,
    });
  }, [stopSession, subject]);

  const card = (
    <div
      key={isActive ? 'live' : 'idle'}
      className="rounded-2xl bg-surface-container-lowest text-on-surface border border-outline-variant px-5 py-4 flex flex-col gap-2 animate-fade-in"
    >
      <span className="font-label-sm text-label-sm tracking-[0.18em] opacity-60">
        {isActive ? 'Live session' : 'Idle'}
      </span>

      {isActive ? (
        <>
          <span className="flex items-center gap-2.5 min-w-0">
            <span className="relative flex w-2.5 h-2.5 flex-shrink-0">
              <span
                className="absolute w-full h-full rounded-full opacity-40 animate-ping"
                style={{ backgroundColor: subject?.color || 'currentColor' }}
              />
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

          {/* The forgotten-start fix lives here now, one click from the timer. */}
          <button
            type="button"
            onClick={() => setShowStartEditor(true)}
            title="Change when this session started"
            className="self-start flex items-center gap-1.5 font-label-sm text-label-sm tracking-[0.12em] opacity-70 hover:opacity-100 transition-opacity"
          >
            Started {startTime ? timeFromDate(startTime) : '--:--'}
            <span className="material-symbols-outlined text-[13px] leading-none">edit</span>
          </button>

          <button
            type="button"
            onClick={finish}
            className="mt-1 w-full py-2 rounded-full bg-error-container text-on-error-container font-label-md text-label-md tracking-[0.12em] uppercase hover:opacity-90 transition-opacity"
          >
            Finish
          </button>
        </>
      ) : (
        <>
          <span className="font-body-md text-body-md opacity-70">No active session</span>
          <button
            type="button"
            onClick={() => setShowPicker(true)}
            className="mt-1 w-full py-2 rounded-full bg-primary text-on-primary font-label-md text-label-md tracking-[0.12em] uppercase hover:opacity-90 transition-opacity"
          >
            Start
          </button>
        </>
      )}
    </div>
  );

  return (
    <>
      {card}

      {showPicker && (
        <SubjectPickerModal
          subjects={subjectRepo.getAll()}
          onSelect={(id) => {
            setShowPicker(false);
            startSession(id);
          }}
          onClose={() => setShowPicker(false)}
        />
      )}

      {showStartEditor && (
        <SessionStartEditor
          startTime={startTime}
          elapsed={elapsed}
          onApply={(ms) => {
            setStartTime(ms);
            setShowStartEditor(false);
          }}
          onCancel={() => setShowStartEditor(false)}
        />
      )}
    </>
  );
}