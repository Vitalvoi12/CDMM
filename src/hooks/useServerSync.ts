import { useCallback, useEffect, useRef, useState } from 'react';
import { getCursor, getToken } from '../services/auth';
import { initialSync, syncOnce } from '../services/serverSync';
import { subscribeSync } from '../services/serverSync';

const SYNC_INTERVAL_MS = 90_000;

export function useServerSync() {
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const running = useRef(false);
  const didMount = useRef(false);

  const run = useCallback(async (): Promise<void> => {
    if (!getToken()) return;
    if (running.current) return;
    running.current = true;
    setSyncing(true);
    try {
      await syncOnce();
      setError(null);
    } catch (err) {
      // 401 is handled globally (login screen); only surface other errors.
      if (err instanceof Error && !/401/.test(err.message)) {
        setError(err.message);
      }
    } finally {
      setSyncing(false);
      running.current = false;
    }
  }, []);

  useEffect(() => {
    if (didMount.current) return;
    didMount.current = true;
    if (!getToken()) {
      setReady(true);
      return;
    }
    // A device that has synced before already holds its data locally: open at
    // once and let the sync catch up, so a slow or missing connection never
    // keeps the app on the loading screen.
    if (getCursor() > 0) setReady(true);
    void (async () => {
      try {
        await initialSync();
      } catch (err) {
        if (err instanceof Error && !/401/.test(err.message)) {
          setError(err.message);
        }
      } finally {
        setReady(true);
      }
    })();
  }, []);

  useEffect(() => {
    const interval = setInterval(() => {
      void run();
    }, SYNC_INTERVAL_MS);
    const onVisible = () => {
      if (document.visibilityState === 'visible') void run();
    };
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('focus', onVisible);
    return () => {
      clearInterval(interval);
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('focus', onVisible);
    };
  }, [run]);

  return { sync: run, syncing, error, ready };
}

/** Re-run `fn` whenever the sync engine applies remote changes. */
export function useSyncRefresh(fn: () => void): void {
  useEffect(() => subscribeSync(fn), [fn]);
}
