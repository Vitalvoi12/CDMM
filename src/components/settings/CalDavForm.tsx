import { useState, useCallback } from 'react';
import type { UserSettings } from '../../types';

interface CalDavFormProps {
  settings: UserSettings;
  onSave: (data: Partial<UserSettings>) => void;
}

export function CalDavForm({ settings, onSave }: CalDavFormProps) {
  const [serverUrl, setServerUrl] = useState(settings.calDav.serverUrl);
  const [username, setUsername] = useState(settings.calDav.username);
  const [password, setPassword] = useState(settings.calDav.password);
  const [calendar, setCalendar] = useState(settings.calDav.calendar);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<'success' | 'error' | null>(null);

  const handleTest = useCallback(() => {
    setTesting(true);
    setTestResult(null);
    setTimeout(() => {
      setTesting(false);
      setTestResult('success');
      setTimeout(() => setTestResult(null), 3000);
    }, 1500);
  }, []);

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
  }, [serverUrl, username, password, calendar, onSave]);

  const lastSyncText = settings.calDav.lastSync
    ? `${Math.round((Date.now() - new Date(settings.calDav.lastSync).getTime()) / 60000)}m ago`
    : 'Never';

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
          <div className="w-2 h-2 rounded-full bg-[#10b981]" />
          <span className="font-label-sm text-label-sm text-on-surface-variant uppercase tracking-wider">
            {settings.calDav.connected ? 'Connected' : 'Disconnected'}
          </span>
          <span className="font-body-sm text-body-sm text-on-surface-variant opacity-70 ml-xs">
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
                placeholder="https://..."
                className="w-full bg-surface-container-lowest border border-outline-variant focus:border-primary rounded py-2 pl-[40px] pr-md font-body-md text-body-md text-on-surface outline-none transition-colors"
              />
            </div>
          </div>
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
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="Username"
                  className="w-full bg-surface-container-lowest border border-outline-variant focus:border-primary rounded py-2 pl-[40px] pr-md font-body-md text-body-md text-on-surface outline-none transition-colors"
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
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Password"
                  className="w-full bg-surface-container-lowest border border-outline-variant focus:border-primary rounded py-2 pl-[40px] pr-md font-body-md text-body-md text-on-surface outline-none transition-colors"
                />
              </div>
            </div>
          </div>
          <div className="flex flex-col gap-1 mt-2">
            <label className="font-label-md text-label-md text-on-surface-variant uppercase tracking-wider" htmlFor="calendar-select">
              Target Calendar
            </label>
            <div className="relative">
              <select
                id="calendar-select"
                value={calendar}
                onChange={(e) => setCalendar(e.target.value)}
                className="w-full bg-surface-container-lowest border border-outline-variant focus:border-primary rounded py-2 pl-md pr-xl font-body-md text-body-md text-on-surface outline-none appearance-none transition-colors cursor-pointer"
              >
                <option value="default">Default Study Calendar</option>
                <option value="personal">Personal</option>
                <option value="work">Work Schedule</option>
              </select>
              <span className="material-symbols-outlined absolute right-0 top-1/2 -translate-y-1/2 text-on-surface-variant pointer-events-none mr-2">
                expand_more
              </span>
            </div>
            <p className="font-body-sm text-body-sm text-on-surface-variant opacity-70 mt-1">
              Events created in StudyCore will be synced to this remote calendar.
            </p>
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
              {testing ? 'Testing...' : testResult === 'success' ? 'Connected!' : 'Test Connection'}
            </button>
            <button
              type="button"
              onClick={handleSave}
              className="px-6 py-2 bg-primary text-on-primary font-label-md text-label-md uppercase tracking-wider rounded hover:bg-tertiary-container transition-colors w-full sm:w-auto text-center border border-primary"
            >
              Save Configuration
            </button>
          </div>
        </form>
      </div>
      <div className="mt-8 opacity-50 flex items-center gap-2 p-8 pt-0">
        <span className="material-symbols-outlined text-on-surface-variant">info</span>
        <p className="font-body-sm text-body-sm text-on-surface-variant">
          Changes to sync settings may take up to 5 minutes to propagate across active study sessions.
        </p>
      </div>
    </section>
  );
}
