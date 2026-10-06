import { useState, useCallback, useEffect } from 'react';
import { settingsRepo, genId } from '../services/repositories';
import { notifySync, subscribeSync, syncOnce } from '../services/serverSync';
import type { CalendarEvent, SyncedSession } from '../types';

/**
 * How often to pull while the account has a live session vs. while it does not.
 *
 * The global background sync only fires every 90s, which is useless for "stop
 * it from my phone" AND useless for the reverse case: a device that has no
 * session of its own would then take up to 90s to even learn that one started.
 * So this polls ALWAYS — faster while something is running.
 */
const POLL_RUNNING_MS = 10_000;
const POLL_IDLE_MS = 20_000;

/** Focus ms of a session: the whole stretch from its start, always running. */
export function sessionElapsedMs(session: SyncedSession | null, now: number = Date.now()): number {
  if (!session) return 0;
  return Math.max(0, now - new Date(session.start).getTime());
}

/** Same record, only if it actually changed — keeps effects from re-running. */
function sameSession(a: SyncedSession | null, b: SyncedSession | null): boolean {
  if (a === b) return true;
  if (!a || !b) return false;
  return a.id === b.id && a.updatedAt === b.updatedAt;
}

/**
 * The account's single live study session.
 *
 * State lives in the synced settings blob, not localStorage, so every signed-in
 * device sees the running session — and can end it. `updatedAt` on the record
 * gives last-write-wins; the id doubles as the id of the event that closing the
 * session writes, so two devices hitting Finish at once collapse into one event.
 */
export function useActiveSession() {
  const [session, setSession] = useState<SyncedSession | null>(
    () => settingsRepo.get().activeSession ?? null
  );
  const [elapsed, setElapsed] = useState(() => sessionElapsedMs(settingsRepo.get().activeSession ?? null));

  // Adopt changes pushed by the sync engine (own tab, other tabs, other devices).
  useEffect(() => {
    return subscribeSync(() => {
      const remote = settingsRepo.get().activeSession ?? null;
      setSession((prev) => (sameSession(prev, remote) ? prev : remote));
    });
  }, []);

  // Other tabs on this device share localStorage but not this component tree.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const onStorage = (e: StorageEvent) => {
      if (!e.key || !e.key.includes('settings')) return;
      const remote = settingsRepo.get().activeSession ?? null;
      setSession((prev) => (sameSession(prev, remote) ? prev : remote));
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  useEffect(() => {
    if (!session) return;
    const tick = () => setElapsed(sessionElapsedMs(session, Date.now()));
    // Async first sample so a freshly started session shows 00:00:00 at once
    // without a synchronous setState during the effect.
    const first = setTimeout(tick, 0);
    const id = setInterval(tick, 1000);
    return () => {
      clearTimeout(first);
      clearInterval(id);
    };
  }, [session]);

  // Pull on a timer whatever the local state is: this is what makes a session
  // started on one device appear on the others, and an ended one disappear.
  useEffect(() => {
    const id = setInterval(() => {
      void syncOnce().catch(() => undefined);
    }, session ? POLL_RUNNING_MS : POLL_IDLE_MS);
    return () => clearInterval(id);
  }, [session]);

  const mutate = useCallback((fn: (current: SyncedSession | null) => SyncedSession | null) => {
    // Read through the repository, not the React state: another device may
    // have changed the record since the last render.
    const current = settingsRepo.get().activeSession ?? null;
    const next = fn(current);
    settingsRepo.setActiveSession(next);
    setSession(next);
    setElapsed(sessionElapsedMs(next));
    // Wake every other reader of the synced record (other tabs, the calendar).
    notifySync();
    // Push straight away — a session started on this device should be visible
    // elsewhere immediately, not on the next 90s tick.
    void syncOnce().catch(() => undefined);
  }, []);

  const startSession = useCallback(
    (subjectId: string) => {
      mutate(() => ({
        id: genId(),
        subjectId,
        start: new Date().toISOString(),
        updatedAt: 0,
      }));
    },
    [mutate]
  );

  /**
   * Move the wall-clock start of the running session.
   *
   * Everything downstream is derived from `start` — the ticking elapsed, the
   * live block in the calendar, the end written on Finish — so moving the start
   * back by X grows all of them by X: the forgotten work gets counted and the
   * block stretches backwards instead of the end jumping forward.
   *
   * A future start would run the timer backwards, so it is clamped to now.
   */
  const setStartTime = useCallback(
    (newStartMs: number) => {
      mutate((prev) => {
        if (!prev) return prev;
        const nextStartMs = Math.min(newStartMs, Date.now());
        if (nextStartMs === new Date(prev.start).getTime()) return prev;
        return { ...prev, start: new Date(nextStartMs).toISOString() };
      });
    },
    [mutate]
  );

  /**
   * Close the session and return the event to persist.
   *
   * The end is `start + elapsed`, kept in step with the timer so a moved start
   * carries into the saved event. The event reuses the session id, so a
   * simultaneous Finish on two devices writes the same row instead of two.
   */
  const stopSession = useCallback((): CalendarEvent | null => {
    const current = settingsRepo.get().activeSession ?? null;
    if (!current) return null;
    const startMs = new Date(current.start).getTime();
    const elapsedMs = sessionElapsedMs(current);
    const end = new Date(Math.max(startMs + elapsedMs, startMs));
    mutate(() => null);
    return {
      id: current.id,
      uid: `evt-${current.id}@cdmm`,
      subjectId: current.subjectId,
      title: current.subjectId,
      start: current.start,
      end: end.toISOString(),
      kind: 'real',
      countInStats: true,
      updatedAt: Date.now(),
    };
  }, [mutate]);

  return {
    isActive: session !== null,
    subjectId: session?.subjectId || null,
    startTime: session?.start || null,
    /** Focus ms, ticking every second. */
    elapsed: session ? elapsed : 0,
    startSession,
    /** Move the session's origin, e.g. to count work that began before tracking. */
    setStartTime,
    stopSession,
  };
}
