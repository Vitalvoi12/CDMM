import { useState, useCallback, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { settingsRepo } from '../services/repositories';
import { getUsername, getToken, logoutRemote, clearSession } from '../services/auth';
import { clearAllLocalData } from '../services/repositories';
import { syncOnce } from '../services/serverSync';
import { useTheme } from '../hooks/useTheme';
import { useSyncRefresh } from '../hooks/useServerSync';
import { SettingsNav } from '../components/settings/SettingsNav';
import type { UserSettings, ThemeMode } from '../types';

const THEME_OPTIONS: { value: ThemeMode; label: string; hint: string }[] = [
  { value: 'light', label: 'Light', hint: 'Bright surfaces, dark text' },
  { value: 'dark', label: 'Dark', hint: 'Deep surfaces, light text' },
];

interface SettingsPageProps {
  onLogout: () => void;
}

export function SettingsPage({ onLogout }: SettingsPageProps) {
  const [settings, setSettings] = useState<UserSettings>(settingsRepo.get());
  const [searchParams] = useSearchParams();
  const [activeSection, setActiveSection] = useState(
    searchParams.get('section') ?? 'general'
  );
  const { theme, setTheme } = useTheme();
  const [syncing, setSyncing] = useState(false);
  const [syncMessage, setSyncMessage] = useState<string | null>(null);
  const [syncError, setSyncError] = useState<string | null>(null);

  useEffect(() => {
    const section = searchParams.get('section');
    if (section) setActiveSection(section);
  }, [searchParams]);

  const refreshSettings = useCallback(() => setSettings(settingsRepo.get()), []);
  useSyncRefresh(refreshSettings);

  const handleSave = useCallback(
    (data: Partial<UserSettings>) => {
      const updated = settingsRepo.update(data);
      setSettings(updated);
    },
    []
  );

  const handleLogout = useCallback(() => {
    void logoutRemote();
    clearSession();
    clearAllLocalData();
    onLogout();
  }, [onLogout]);

  const handleSync = useCallback(() => {
    if (!getToken()) {
      setSyncError('Not signed in');
      return;
    }
    setSyncing(true);
    setSyncMessage(null);
    setSyncError(null);
    void (async () => {
      try {
        await syncOnce();
        setSettings(settingsRepo.get());
        setSyncMessage(`Synced ${new Date().toLocaleTimeString()}`);
      } catch (err) {
        setSyncError(err instanceof Error ? err.message : 'Sync failed');
      } finally {
        setSyncing(false);
      }
    })();
  }, []);

  return (
    <div className="flex flex-col w-full h-full relative">
      <div className="grid grid-cols-12 gap-6 relative">
        <div className="col-span-12 lg:col-span-3 mb-8 lg:mb-0">
          <div className="sticky top-[112px]">
            <h2 className="font-headline-md text-headline-md text-on-surface mb-6">Settings</h2>
            <SettingsNav active={activeSection} onChange={setActiveSection} />
          </div>
        </div>
        <div className="col-span-12 lg:col-span-8 lg:col-start-5">
          {activeSection === 'account' && (
            <div className="mb-16 flex flex-col gap-2">
              <h1 className="font-display-lg text-display-lg text-on-background">Account</h1>
              <p className="font-body-lg text-body-lg text-on-surface-variant max-w-2xl">
                Your data syncs across devices under this account.
              </p>
              <div className="mt-8 bg-surface-container-lowest border border-outline-variant rounded p-8 flex flex-col gap-6 max-w-xl">
                <div className="flex flex-col gap-1">
                  <span className="font-label-md text-label-md text-on-surface-variant uppercase tracking-wider">
                    Username
                  </span>
                  <span className="font-body-lg text-body-lg text-on-surface">{getUsername() ?? '—'}</span>
                </div>
                <div className="flex flex-wrap items-center gap-4">
                  <button
                    type="button"
                    onClick={handleSync}
                    disabled={syncing}
                    className="px-6 py-2 rounded bg-primary text-on-primary font-label-md text-label-md uppercase tracking-widest flex items-center gap-2 disabled:opacity-50"
                  >
                    <span className={`material-symbols-outlined text-[18px] ${syncing ? 'animate-spin' : ''}`}>
                      sync
                    </span>
                    {syncing ? 'Syncing…' : 'Sync'}
                  </button>
                  <button
                    type="button"
                    onClick={handleLogout}
                    className="px-6 py-2 rounded bg-error text-on-error font-label-md text-label-md uppercase tracking-widest"
                  >
                    Logout
                  </button>
                </div>
                {syncMessage && (
                  <p className="font-body-sm text-body-sm text-success">{syncMessage}</p>
                )}
                {syncError && (
                  <p role="alert" className="font-body-sm text-body-sm text-error">{syncError}</p>
                )}
              </div>
            </div>
          )}
          {activeSection === 'general' && (
            <div className="mb-16 flex flex-col gap-2">
              <h1 className="font-display-lg text-display-lg text-on-background">General</h1>
              <p className="font-body-lg text-body-lg text-on-surface-variant max-w-2xl">
                General application settings.
              </p>
              <div className="mt-8 bg-surface-container-lowest border border-outline-variant rounded p-8 flex flex-col gap-8 max-w-xl">
                <div className="flex flex-col gap-4">
                  <label className="font-label-md text-label-md text-on-surface-variant uppercase tracking-wider">
                    Appearance
                  </label>
                  <div className="grid grid-cols-2 gap-3">
                    {THEME_OPTIONS.map((option) => {
                      const isSelected = theme === option.value;
                      return (
                        <button
                          key={option.value}
                          type="button"
                          onClick={() => setTheme(option.value)}
                          aria-pressed={isSelected}
                          className={`flex flex-col items-start gap-1 p-4 rounded border text-left transition-colors ${
                            isSelected
                              ? 'border-primary bg-surface-container'
                              : 'border-outline-variant hover:border-outline bg-surface-container-lowest'
                          }`}
                        >
                          <span className="flex items-center gap-2 font-label-md text-label-md text-on-surface">
                            <span
                              className={`material-symbols-outlined text-[18px] ${isSelected ? 'text-primary' : 'text-on-surface-variant'}`}
                            >
                              {isSelected ? 'radio_button_checked' : 'radio_button_unchecked'}
                            </span>
                            {option.label}
                          </span>
                          <span className="font-body-sm text-body-sm text-on-surface-variant pl-[26px]">
                            {option.hint}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div className="flex flex-col gap-1">
                  <label className="font-label-md text-label-md text-on-surface-variant uppercase tracking-wider">
                    Daily Study Goal
                  </label>
                    <div className="flex items-center gap-4">
                      <input
                        type="number"
                        min="0"
                        max="24"
                        value={Math.floor(settings.dailyGoalMinutes / 60)}
                        onChange={(e) => {
                          const h = Number(e.target.value);
                          const m = settings.dailyGoalMinutes % 60;
                          handleSave({ dailyGoalMinutes: h * 60 + m });
                        }}
                        className="w-20 bg-surface-container-lowest border border-outline-variant focus:border-primary rounded py-2 px-4 font-body-md text-body-md text-on-surface outline-none transition-colors"
                      />
                      <span className="font-body-md text-body-md text-on-surface-variant">h</span>
                      <input
                        type="number"
                        min="0"
                        max="59"
                        value={settings.dailyGoalMinutes % 60}
                        onChange={(e) => {
                          const m = Number(e.target.value);
                          const h = Math.floor(settings.dailyGoalMinutes / 60);
                          handleSave({ dailyGoalMinutes: h * 60 + m });
                        }}
                        className="w-20 bg-surface-container-lowest border border-outline-variant focus:border-primary rounded py-2 px-4 font-body-md text-body-md text-on-surface outline-none transition-colors"
                      />
                      <span className="font-body-md text-body-md text-on-surface-variant">min</span>
                    </div>
                </div>

                <div className="flex flex-col gap-3">
                  <label className="font-label-md text-label-md text-on-surface-variant uppercase tracking-wider">
                    Synchronization
                  </label>
                  <div className="flex flex-wrap items-center gap-4">
                    <button
                      type="button"
                      onClick={handleSync}
                      disabled={syncing}
                      className="px-6 py-2 rounded bg-primary text-on-primary font-label-md text-label-md uppercase tracking-widest flex items-center gap-2 disabled:opacity-50"
                    >
                      <span className={`material-symbols-outlined text-[18px] ${syncing ? 'animate-spin' : ''}`}>
                        sync
                      </span>
                      {syncing ? 'Syncing…' : 'Sync'}
                    </button>
                    {syncMessage && (
                      <span className="font-body-sm text-body-sm text-success">{syncMessage}</span>
                    )}
                    {syncError && (
                      <span role="alert" className="font-body-sm text-body-sm text-error">{syncError}</span>
                    )}
                  </div>
                  <p className="font-body-sm text-body-sm text-on-surface-variant">
                    Force push/pull all local changes right now.
                  </p>
                </div>
              </div>
            </div>
          )}
          {(activeSection === 'study-preferences' || activeSection === 'notifications') && (
            <div className="mb-16 flex flex-col gap-2">
              <h1 className="font-display-lg text-display-lg text-on-background capitalize">
                {activeSection.replace('-', ' ')}
              </h1>
              <p className="font-body-lg text-body-lg text-on-surface-variant max-w-2xl">
                Coming soon.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
