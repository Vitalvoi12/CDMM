import { useCallback, useEffect, useRef, useState } from 'react';
import { settingsRepo, subjectRepo } from '../services/repositories';
import { syncAll, type SyncResult } from '../services/syncService';

/**
 * Runs a CalDAV sync once on app load if a connection is configured, and
 * exposes `sync()` for manual triggers. Returns the result of the last run.
 */
export function useCalDavSync(onAfterSync?: () => void) {
  const [result, setResult] = useState<SyncResult | null>(null);
  const [syncing, setSyncing] = useState(false);
  const didMount = useRef(false);
  const cbRef = useRef(onAfterSync);
  cbRef.current = onAfterSync;

  const run = useCallback(async (): Promise<SyncResult> => {
    const settings = settingsRepo.get();
    if (!settings.calDav.connected || !settings.calDav.serverUrl) {
      const idle: SyncResult = { created: 0, updated: 0, imported: 0, deleted: 0, errors: 0, message: 'CalDAV not configured', removedUids: [], remoteCount: 0 };
      setResult(idle);
      return idle;
    }
    setSyncing(true);
    const res = await syncAll(settings, subjectRepo.getAll());
    setResult(res);
    setSyncing(false);
    cbRef.current?.();
    return res;
  }, []);

  useEffect(() => {
    if (didMount.current) return;
    didMount.current = true;
    void run();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return { sync: run, result, syncing };
}