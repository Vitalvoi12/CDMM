import { useState, useCallback, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { getUsername, getToken, logoutRemote, clearSession } from '../services/auth';
import { clearAllLocalData } from '../services/repositories';
import { syncOnce } from '../services/serverSync';
import { useTheme } from '../hooks/useTheme';
import { SettingsNav } from '../components/settings/SettingsNav';
import type { ThemeMode } from '../types';

const THEME_OPTIONS: { value: ThemeMode; label: string; hint: string }[] = [
  { value: 'light', label: 'Light', hint: 'Warm paper' },
  { value: 'dark', label: 'Dark', hint: 'Focus room' },
];

interface SettingsPageProps {
  onLogout: () => void;
}

export function SettingsPage({ onLogout }: SettingsPageProps) {
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
        setSyncMessage(`Synced ${new Date().toLocaleTimeString()}`);
      } catch (err) {
        setSyncError(err instanceof Error ? err.message : 'Sync failed');
      } finally {
        setSyncing(false);
      }
    })();
  }, []);

  return (
    <div className="flex flex-col w-full h-full relative overflow-anchor-none max-lg:flex-1 max-lg:min-h-0 max-lg:overflow-y-auto">
      <div className="grid grid-cols-12 gap-6 lg:grid-cols-[260px_minmax(0,1fr)] lg:gap-10 lg:items-start relative">
        <div className="col-span-12 lg:col-span-1 lg:sticky lg:top-[96px] lg:self-start mb-10 lg:mb-0 overflow-anchor-none">
          <h2 className="font-headline-lg text-[30px] leading-[36px] text-on-surface mb-10">Settings</h2>
          <SettingsNav active={activeSection} onChange={setActiveSection} />
        </div>
        <div className="col-span-12 lg:col-span-1 lg:mt-12 overflow-anchor-none">
          {activeSection === 'account' && (
            <div className="mb-20 flex flex-col gap-6">
              <h1 className="font-headline-lg text-[30px] leading-[36px] text-on-surface">Account</h1>
              <div className="bg-surface-container-lowest rounded-2xl shadow-elev-1 p-8 flex flex-col gap-7 max-w-xl">
                <div className="flex flex-col gap-1">
                  <span className="text-[12px] leading-[16px] text-on-surface-variant uppercase tracking-[0.16em]">
                    Username
                  </span>
                  <span className="font-body-lg text-[16px] leading-[23px] text-on-surface">{getUsername() ?? '—'}</span>
                </div>
                <div className="flex flex-wrap items-center gap-3">
                  <button
                    type="button"
                    onClick={handleSync}
                    disabled={syncing}
                    className="px-6 py-3 rounded-full bg-surface-container-high text-on-surface font-label-md text-[13px] leading-[18px] uppercase tracking-[0.1em] flex items-center gap-2 hover:bg-surface-container-highest disabled:opacity-50 transition-colors"
                  >
                    <span className={`material-symbols-outlined text-[14px] ${syncing ? 'animate-spin' : ''}`}>
                      sync
                    </span>
                    {syncing ? 'Syncing…' : 'Sync'}
                  </button>
                  <button
                    type="button"
                    onClick={handleLogout}
                    className="px-6 py-3 rounded-full bg-error-container text-on-error-container font-label-md text-[13px] leading-[18px] uppercase tracking-[0.1em] hover:opacity-80 transition-opacity"
                  >
                    Logout
                  </button>
                </div>
                {syncMessage && (
                  <p className="font-body-sm text-[13px] leading-[19px] text-success">{syncMessage}</p>
                )}
                {syncError && (
                  <p role="alert" className="font-body-sm text-[13px] leading-[19px] text-error">{syncError}</p>
                )}
                <p className="font-body-sm text-[13px] leading-[19px] text-on-surface-variant">
                  Your data syncs across devices under this account.
                </p>
              </div>
            </div>
          )}
          {activeSection === 'general' && (
            <div className="mb-20 flex flex-col gap-6">
              <h1 className="font-headline-lg text-[30px] leading-[36px] text-on-surface">General</h1>
              <div className="bg-surface-container-lowest rounded-2xl shadow-elev-1 p-8 flex flex-col gap-4 max-w-xl">
                <label className="font-label-sm text-[12px] leading-[16px] text-on-surface-variant uppercase tracking-[0.16em]">
                  Appearance
                </label>
                <div className="flex flex-col gap-3 mt-1">
                  {THEME_OPTIONS.map((option) => {
                    const isSelected = theme === option.value;
                    return (
                      <button
                        key={option.value}
                        type="button"
                        onClick={() => setTheme(option.value)}
                        aria-pressed={isSelected}
                        className={`flex items-center justify-between gap-2 px-6 py-4 rounded-2xl border border-outline-variant text-left transition-colors ${
                          isSelected
                            ? 'border-outline bg-surface-container'
                            : 'border-outline-variant hover:border-outline bg-transparent'
                        }`}
                      >
                        <span className="flex items-center gap-3 font-body-md text-[15px] leading-[22px] text-on-surface">
                          <span
                            className={`w-4 h-4 rounded-full border flex items-center justify-center ${isSelected ? 'border-primary' : 'border-outline'}`}
                          >
                            {isSelected && <span className="w-2 h-2 rounded-full bg-primary" />}
                          </span>
                          {option.label}
                        </span>
                        {isSelected && (
                          <span className="font-label-sm text-[12px] leading-[16px] text-on-surface-variant uppercase tracking-[0.14em]">
                            Active
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="bg-surface-container-lowest rounded-2xl shadow-elev-1 p-8 flex flex-col gap-4 max-w-xl">
                <label className="font-label-sm text-[12px] leading-[16px] text-on-surface-variant uppercase tracking-[0.16em]">
                  Synchronization
                </label>
                <div className="flex flex-wrap items-center gap-3">
                  <button
                    type="button"
                    onClick={handleSync}
                    disabled={syncing}
                    className="px-6 py-3 rounded-full bg-primary text-on-primary font-label-md text-[13px] leading-[18px] uppercase tracking-[0.1em] flex items-center gap-2 disabled:opacity-50 hover:opacity-90 transition-opacity"
                  >
                    <span className={`material-symbols-outlined text-[14px] ${syncing ? 'animate-spin' : ''}`}>
                      sync
                    </span>
                    {syncing ? 'Syncing…' : 'Sync'}
                  </button>
                  {syncMessage && (
                    <span className="font-body-sm text-[13px] leading-[19px] text-success">{syncMessage}</span>
                  )}
                  {syncError && (
                    <span role="alert" className="font-body-sm text-[13px] leading-[19px] text-error">{syncError}</span>
                  )}
                </div>
                <p className="font-body-sm text-[13px] leading-[19px] text-on-surface-variant">
                  Force push/pull all local changes right now.
                </p>
              </div>
            </div>
          )}
          {(activeSection === 'study-preferences' || activeSection === 'notifications') && (
            <div className="mb-20 flex flex-col gap-4">
              <h1 className="font-headline-lg text-[30px] leading-[36px] text-on-surface capitalize">
                {activeSection.replace('-', ' ')}
              </h1>
              <p className="font-body-lg text-[16px] leading-[23px] text-on-surface-variant max-w-2xl">
                Coming soon.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
