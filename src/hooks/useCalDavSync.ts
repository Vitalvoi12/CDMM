import { useCallback, useEffect, useRef, useState } from 'react';
import { settingsRepo, subjectRepo } from '../services/repositories';
import { syncAll, type SyncResult } from '../services/syncService';

const AUTO_SYNC_INTERVAL_MS = 90_000;

export function useCalDavSync(onAfterSync?: () => void) {
  const [result, setResult] = useState<SyncResult | null>(null);
  const [syncing, setSyncing] = useState(false);
  const didMount = useRef(false);
  const running = useRef(false);
  const lastResult = useRef<SyncResult | null>(null);
  const cbRef = useRef(onAfterSync);
  cbRef.current = onAfterSync;

  const run = useCallback(async (): Promise<SyncResult> => {
    const settings = settingsRepo.get();
    const idle: SyncResult = { created: 0, updated: 0, imported: 0, deleted: 0, errors: 0, message: 'CalDAV not configured', removedUids: [], remoteCount: 0 };
    if (!settings.calDav.connected || !settings.calDav.serverUrl) {
      setResult(idle);
      return idle;
    }
    if (running.current) return lastResult.current || idle;
    running.current = true;
    setSyncing(true);
    const res = await syncAll(settings, subjectRepo.getAll());
    lastResult.current = res;
    setResult(res);
    setSyncing(false);
    running.current = false;
    cbRef.current?.();
    return res;
  }, []);

  useEffect(() => {
    if (didMount.current) return;
    didMount.current = true;
    void run();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const interval = setInterval(() => { void run(); }, AUTO_SYNC_INTERVAL_MS);
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return { sync: run, result, syncing };
}
