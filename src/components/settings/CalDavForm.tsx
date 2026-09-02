import { useState, useCallback } from 'react';
import type { UserSettings } from '../../types';
import {
  testCalDavConnection,
  discoverCalendars,
  createCalDavCalendar,
  type CalendarInfo,
} from '../../services/caldavClient';
import { syncAll } from '../../services/syncService';
import { subjectRepo } from '../../services/repositories';

interface CalDavFormProps {
  settings: UserSettings;
  onSave: (data: Partial<UserSettings>) => void;
}

function formSettings(
  settings: UserSettings,
  serverUrl: string,
  username: string,
  password: string,
  calendar: string
): UserSettings {
  return {
    ...settings,
    calDav: { ...settings.calDav, serverUrl, username, password, calendar },
  };
}

function originOf(url: string): string {
  try {
    const u = new URL(url);
    return `${u.protocol}//${u.host}`;
  } catch {
    return url;
  }
}

export function CalDavForm({ settings, onSave }: CalDavFormProps) {
  const [serverUrl, setServerUrl] = useState(settings.calDav.serverUrl);
  const [username, setUsername] = useState(settings.calDav.username);
  const [password, setPassword] = useState(settings.calDav.password);
  const [calendar, setCalendar] = useState(settings.calDav.calendar);
  const [testing, setTesting] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [creating, setCreating] = useState(false);
  const [testResult, setTestResult] = useState<'success' | 'error' | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [discovered, setDiscovered] = useState<{ isCalendar: boolean; calendars: CalendarInfo[] } | null>(null);
  const [discoveryError, setDiscoveryError] = useState<string | null>(null);
  const [pickedCalendar, setPickedCalendar] = useState('');

  const runDiscovery = useCallback(
    (fullSettings: UserSettings) => {
      void (async () => {
        try {
          const disc = await discoverCalendars(fullSettings);
          setDiscovered(disc);
          setDiscoveryError(null);
          if (disc.isCalendar) {
            setTestResult('success');
            setMessage('Connected — this URL points directly at a calendar collection.');
          } else if (disc.calendars.length > 0) {
            setTestResult('success');
            setMessage(`Connected — found ${disc.calendars.length} calendar(s). Pick one to fill the DAV URL.`);
          } else {
            setTestResult('success');
            setMessage('Connected, but no calendar here yet. Create one below.');
          }
        } catch (err) {
          setDiscoveryError(err instanceof Error ? err.message : 'Calendar discovery failed');
        }
      })();
    },
    []
  );

  const handleTest = useCallback(async () => {
    setTesting(true);
    setTestResult(null);
    setMessage(null);
    setDiscoveryError(null);
    const fullSettings = formSettings(settings, serverUrl, username, password, calendar);
    const result = await testCalDavConnection(fullSettings);
    setTesting(false);
    setTestResult(result.ok ? 'success' : 'error');
    setMessage(result.ok ? 'Connection successful' : result.message);
    if (result.ok) {
      onSave({
        calDav: {
          serverUrl,
          username,
          password,
          calendar,
          connected: true,
          lastSync: settings.calDav.lastSync,
        },
      });
      runDiscovery(fullSettings);
    }
  }, [serverUrl, username, password, calendar, onSave, settings, runDiscovery]);

  const handlePickCalendar = useCallback(
    (href: string) => {
      const abs = /^https?:\/\//.test(href)
        ? href
        : originOf(serverUrl) + (href.startsWith('/') ? href : '/' + href);
      setServerUrl(abs.replace(/\/+$/, ''));
      setCalendar('default');
      setPickedCalendar(href);
      setTestResult('success');
      setMessage(`DAV URL filled with: ${abs}. Press Test Connection to confirm.`);
    },
    [serverUrl]
  );

  const handleCreateCalendar = useCallback(async () => {
    setCreating(true);
    setTestResult(null);
    setMessage(null);
    const fullSettings = formSettings(settings, serverUrl, username, password, calendar);
    try {
      const url = await createCalDavCalendar(fullSettings, 'StudyCore');
      setServerUrl(url.replace(/\/+$/, ''));
      setCalendar('default');
      setTestResult('success');
      setMessage(`Calendar «StudyCore» created. Press Test Connection to confirm.`);
      runDiscovery(formSettings(settings, url.replace(/\/+$/, ''), username, password, 'default'));
    } catch (err) {
      setTestResult('error');
      setMessage(err instanceof Error ? err.message : 'Calendar creation failed');
    } finally {
      setCreating(false);
    }
  }, [serverUrl, username, password, calendar, settings, runDiscovery]);

  const handleSave = useCallback(() => {
    onSave({
      calDav: {
        serverUrl,
        username,
        password,
        calendar,
        connected: true,
        lastSync: new Date().toISOString(),
      },
    });
    setMessage('Configuration saved');
  }, [serverUrl, username, password, calendar, onSave]);

  const handleSync = useCallback(async () => {
    setSyncing(true);
    setMessage(null);
    const fullSettings = formSettings(settings, serverUrl, username, password, calendar);
    const subjects = subjectRepo.getAll();
    const sync = await syncAll(fullSettings, subjects);
    setSyncing(false);
    onSave({
      calDav: {
        serverUrl,
        username,
        password,
        calendar,
        connected: true,
        lastSync: new Date().toISOString(),
      },
    });
    setMessage(sync.message);
  }, [serverUrl, username, password, calendar, onSave, settings]);

  const lastSyncText = settings.calDav.lastSync
    ? `${Math.round((Date.now() - new Date(settings.calDav.lastSync).getTime()) / 60000)}m ago`
    : 'Never';

  const showError =
    testResult === 'error' || (message !== null && /failed|error|empty|denied|refused/i.test(message || ''));

  return (
    <section className="bg-surface-container-lowest border border-outline-variant rounded relative overflow-hidden group hover:border-outline transition-colors">
      <div className="absolute top-0 right-0 w-32 h-32 bg-primary/[0.02] rounded-bl-full pointer-events-none transition-transform group-hover:scale-110 duration-700" />
      <div className="p-8 border-b border-outline-variant flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded bg-surface-container flex items-center justify-center border border-outline-variant">
            <span className="material-symbols-outlined text-on-surface">sync_alt</span>
          </div>
          <div>
            <h3 className="font-headline-md text-headline-md text-on-surface">Calendar Sync</h3>
            <p className="font-body-md text-body-md text-on-surface-variant">CalDAV Protocol</p>
          </div>
        </div>
        <div className="flex items-center gap-2 bg-surface-container-low px-4 py-1 rounded border border-outline-variant">
          <div className={`w-2 h-2 rounded-full ${settings.calDav.connected ? 'bg-success' : 'bg-outline'}`} />
          <span className="font-label-sm text-label-sm text-on-surface-variant uppercase tracking-wider">
            {settings.calDav.connected ? 'Connected' : 'Disconnected'}
          </span>
          <span className="font-body-sm text-body-sm text-on-surface-variant opacity-70 ml-1">
            ({lastSyncText})
          </span>
        </div>
      </div>
      <div className="p-8 bg-surface-container-low">
        <form className="flex flex-col gap-6 max-w-xl" onSubmit={(e) => e.preventDefault()}>
          <div className="flex flex-col gap-1">
            <label className="font-label-md text-label-md text-on-surface-variant uppercase tracking-wider" htmlFor="server-url">
              DAV Server URL
            </label>
            <div className="relative">
              <span className="material-symbols-outlined absolute left-0 top-1/2 -translate-y-1/2 text-on-surface-variant opacity-50 ml-2">
                link
              </span>
              <input
                id="server-url"
                type="url"
                value={serverUrl}
                onChange={(e) => setServerUrl(e.target.value)}
                placeholder="https://cloud.vitalvoi.ru/remote.php/dav/calendars/&lt;user&gt;/&lt;calendar&gt;/"
                className="w-full bg-surface-container-lowest border border-outline-variant focus:border-primary rounded py-2 pl-[40px] pr-4 font-body-md text-body-md text-on-surface outline-none transition-colors"
              />
            </div>
            <p className="font-body-sm text-body-sm text-on-surface-variant opacity-70 mt-1">
              Can be a calendar collection, or the home of your calendars (then use discovery below).
            </p>
          </div>

          {discovered && !discovered.isCalendar && (
            <div className="flex flex-col gap-3 border border-outline-variant rounded p-4 bg-surface-container-lowest">
              <p className="font-label-md text-label-md text-on-surface uppercase tracking-wider">
                {discovered.calendars.length > 0
                  ? `Discovered ${discovered.calendars.length} calendar(s)`
                  : 'No calendars found under this URL'}
              </p>
              {discovered.calendars.length > 0 ? (
                <>
                  <div className="relative">
                    <select
                      value={pickedCalendar}
                      onChange={(e) => {
                        setPickedCalendar(e.target.value);
                        if (e.target.value) handlePickCalendar(e.target.value);
                      }}
                      className="w-full bg-surface-container-lowest border border-outline-variant focus:border-primary rounded py-2 pl-4 pr-8 font-body-md text-body-md text-on-surface outline-none appearance-none transition-colors cursor-pointer"
                    >
                      <option value="">— Choose a calendar —</option>
                      {discovered.calendars.map((c) => (
                        <option key={c.href} value={c.href}>
                          {c.displayName || c.href}
                        </option>
                      ))}
                    </select>
                    <span className="material-symbols-outlined absolute right-0 top-1/2 -translate-y-1/2 text-on-surface-variant pointer-events-none mr-2">
                      expand_more
                    </span>
                  </div>
                  <p className="font-body-sm text-body-sm text-on-surface-variant opacity-70">
                    Choosing one replaces the DAV URL with that calendar&apos;s address.
                  </p>
                </>
              ) : (
                <button
                  type="button"
                  onClick={handleCreateCalendar}
                  disabled={creating || testing}
                  className="self-start px-6 py-2 bg-primary text-on-primary font-label-md text-label-md uppercase tracking-wider rounded hover:bg-tertiary-container transition-colors border border-primary flex items-center gap-2"
                >
                  <span className="material-symbols-outlined text-[18px]">{creating ? 'progress_activity' : 'event_available'}</span>
                  {creating ? 'Creating...' : 'Create calendar «StudyCore»'}
                </button>
              )}
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
            <div className="flex flex-col gap-1">
              <label className="font-label-md text-label-md text-on-surface-variant uppercase tracking-wider" htmlFor="username">
                Username
              </label>
              <div className="relative">
                <span className="material-symbols-outlined absolute left-0 top-1/2 -translate-y-1/2 text-on-surface-variant opacity-50 ml-2">
                  person
                </span>
                <input
                  id="username"
                  type="text"
                  autoComplete="username"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="Username"
                  className="w-full bg-surface-container-lowest border border-outline-variant focus:border-primary rounded py-2 pl-[40px] pr-4 font-body-md text-body-md text-on-surface outline-none transition-colors"
                />
              </div>
            </div>
            <div className="flex flex-col gap-1">
              <label className="font-label-md text-label-md text-on-surface-variant uppercase tracking-wider" htmlFor="password">
                Password / Token
              </label>
              <div className="relative">
                <span className="material-symbols-outlined absolute left-0 top-1/2 -translate-y-1/2 text-on-surface-variant opacity-50 ml-2">
                  key
                </span>
                <input
                  id="password"
                  type="password"
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="App password / token"
                  className="w-full bg-surface-container-lowest border border-outline-variant focus:border-primary rounded py-2 pl-[40px] pr-4 font-body-md text-body-md text-on-surface outline-none transition-colors"
                />
              </div>
            </div>
          </div>

          <div className="pt-6 border-t border-outline-variant flex flex-col sm:flex-row gap-4 items-center justify-between mt-2">
            <button
              type="button"
              onClick={handleTest}
              disabled={testing}
              className="px-6 py-2 bg-surface-container-lowest border border-outline-variant hover:border-primary hover:bg-surface-container text-on-surface font-label-md text-label-md uppercase tracking-wider rounded transition-colors flex items-center gap-2 group w-full sm:w-auto justify-center"
            >
              <span className={`material-symbols-outlined text-[18px] transition-transform duration-500 ${testing ? 'animate-spin' : 'group-hover:rotate-180'}`}>
                sync
              </span>
              {testing ? 'Testing...' : 'Test Connection'}
            </button>
            <button
              type="button"
              onClick={handleSync}
              disabled={syncing || testing}
              className="px-6 py-2 bg-surface-container-low border border-outline-variant hover:border-primary text-on-surface font-label-md text-label-md uppercase tracking-wider rounded transition-colors w-full sm:w-auto text-center"
            >
              {syncing ? 'Syncing...' : 'Sync Now'}
            </button>
            <button
              type="button"
              onClick={handleSave}
              className="px-6 py-2 bg-primary text-on-primary font-label-md text-label-md uppercase tracking-wider rounded hover:bg-tertiary-container transition-colors w-full sm:w-auto text-center border border-primary"
            >
              Save Configuration
            </button>
          </div>
          {(message || testResult || discoveryError) && (
            <div
              className={`mt-4 px-4 py-3 rounded font-body-sm text-body-sm border whitespace-pre-wrap break-words ${
                showError || discoveryError
                  ? 'bg-error-container text-on-error-container border-error/20'
                  : 'bg-surface-container-low text-on-surface border-outline-variant'
              }`}
            >
              {discoveryError || message}
            </div>
          )}
        </form>
      </div>
      <div className="mt-8 opacity-50 flex items-center gap-2 p-8 pt-0">
        <span className="material-symbols-outlined text-on-surface-variant">info</span>
        <p className="font-body-sm text-body-sm text-on-surface-variant">
          Point the DAV URL at your calendar address (e.g. https://cloud.vitalvoi.ru/remote.php/dav/calendars/&lt;user&gt;/&lt;calendar&gt;/), or run Test Connection on your calendar home to auto-detect and even create a calendar.
        </p>
      </div>
    </section>
  );
}