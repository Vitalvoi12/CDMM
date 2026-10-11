import { useState, useCallback, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { getUsername, getToken, logoutRemote, clearSession } from '../services/auth';
import { clearAllLocalData } from '../services/repositories';
import { syncOnce } from '../services/serverSync';
import { useTheme } from '../hooks/useTheme';
import { useOverscrollSpring } from '../hooks/useOverscrollSpring';
import { SettingsNav } from '../components/settings/SettingsNav';
import type { ThemeMode } from '../types';
import { useIsMobile } from '../hooks/useIsMobile';
import { ensurePushSubscription, notificationPermission, pushEndpoint, requestNotificationPermission, sendTestPush, showNotification, type NotifyPermission } from '../services/notifications';

const THEME_OPTIONS: { value: ThemeMode; label: string; hint: string }[] = [
  { value: 'light', label: 'Light', hint: 'Warm paper' },
  { value: 'dark', label: 'Dark', hint: 'Focus room' },
];

interface SettingsPageProps {
  onLogout: () => void;
}

export function SettingsPage({ onLogout }: SettingsPageProps) {
  const isMobile = useIsMobile();
  const springRef = useOverscrollSpring<HTMLDivElement>();
  const [searchParams] = useSearchParams();
  const [activeSection, setActiveSection] = useState(
    searchParams.get('section') ?? 'general'
  );
  const { theme, setTheme } = useTheme();
  const [syncing, setSyncing] = useState(false);
  const [syncMessage, setSyncMessage] = useState<string | null>(null);
  const [syncError, setSyncError] = useState<string | null>(null);
  const [permission, setPermission] = useState<NotifyPermission>(notificationPermission);
  const [pushOn, setPushOn] = useState(() => pushEndpoint() !== null);
  const [testMessage, setTestMessage] = useState<string | null>(null);

  useEffect(() => {
    if (permission === 'granted') void ensurePushSubscription().then(setPushOn);
  }, [permission]);

  const handleTestNotification = useCallback(async () => {
    setTestMessage(null);
    if (!pushOn) {
      const shown = await showNotification('CDMM', { body: 'Test reminder — notifications work.', tag: 'cdmm-test' });
      setTestMessage(shown ? 'Shown on this device (push is not set up here).' : 'Could not show a notification.');
      return;
    }
    const result = await sendTestPush();
    if (!result) setTestMessage('Server could not send the test.');
    else setTestMessage(`Sent via push to ${result.delivered} of ${result.devices} device${result.devices === 1 ? '' : 's'}.`);
  }, [pushOn]);

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

  // Phone: every section in one grouped list instead of a section menu.
  if (isMobile) {
    const reminderStatus =
      permission === 'granted'
        ? pushOn
          ? 'Push is on for this device.'
          : 'Allowed, but push is unavailable here: reminders show only while CDMM is open.'
        : permission === 'denied'
          ? 'Blocked. Allow notifications for this site in the browser settings.'
          : permission === 'unsupported'
            ? 'This browser does not support notifications.'
            : 'Off. Turn on to get reminders even when CDMM is closed.';
    const remindersOn = permission === 'granted';
    const row = 'm-li w-full text-left !bg-transparent border-0 border-b border-outline-variant last:border-b-0';
    const group = 'flex flex-col overflow-hidden';
    const groupStyle = { border: '1px solid var(--color-outline-variant)', borderRadius: 12, background: 'var(--color-surface-container-lowest)' };
    return (
      <div className="flex flex-col w-full flex-1 min-h-0 relative overflow-hidden">
        <header className="m-hdr" style={{ paddingLeft: 16 }}>
          <h1 className="m-h1 flex-1">Settings</h1>
        </header>
        <div ref={springRef} className="flex-1 min-h-0 overflow-y-auto overscroll-contain flex flex-col" style={{ padding: '8px 16px 16px', gap: 18 }}>
          <section className="flex flex-col" style={{ gap: 8 }}>
            <span className="m-lbl m-mut" id="m-set-theme">Theme</span>
            <div className="m-seg" role="radiogroup" aria-labelledby="m-set-theme">
              {THEME_OPTIONS.map((o) => (
                <button key={o.value} type="button" role="radio" aria-checked={theme === o.value} className={theme === o.value ? 'on' : ''} onClick={() => setTheme(o.value)}>
                  {o.label}
                </button>
              ))}
            </div>
          </section>

          <section className="flex flex-col" style={{ gap: 8 }}>
            <span className="m-lbl m-mut">Synchronization</span>
            <div className={group} style={groupStyle}>
              <div className={row}>
                <span className="material-symbols-outlined m-ic s m-mut">person</span>
                <div className="flex flex-col flex-1 min-w-0" style={{ padding: '8px 0' }}>
                  <span className="m-tr">{getUsername() ?? '—'}</span>
                  <span className="m-sm m-mut">Your data syncs across devices under this account.</span>
                </div>
              </div>
              <button type="button" className={row} onClick={handleSync} disabled={syncing}>
                <span className={`material-symbols-outlined m-ic s m-mut ${syncing ? 'animate-spin' : ''}`}>sync</span>
                <div className="flex flex-col flex-1 min-w-0" style={{ padding: '8px 0' }}>
                  <span>{syncing ? 'Syncing…' : 'Sync now'}</span>
                  {syncError ? (
                    <span role="alert" className="m-sm" style={{ color: 'var(--color-error)' }}>{syncError}</span>
                  ) : syncMessage ? (
                    <span className="m-sm" style={{ color: 'var(--color-now)' }}>{syncMessage}</span>
                  ) : (
                    <span className="m-sm m-mut">Push and pull all local changes right now.</span>
                  )}
                </div>
                <span className="material-symbols-outlined m-ic s m-mut">chevron_right</span>
              </button>
            </div>
          </section>

          <section className="flex flex-col" style={{ gap: 8 }}>
            <span className="m-lbl m-mut">Notifications</span>
            <div className={group} style={groupStyle}>
              <button
                type="button"
                role="switch"
                aria-checked={remindersOn}
                className={row}
                disabled={permission !== 'default'}
                onClick={() => void requestNotificationPermission().then(setPermission)}
              >
                <span className="material-symbols-outlined m-ic s m-mut">notifications</span>
                <div className="flex flex-col flex-1 min-w-0" style={{ padding: '8px 0' }}>
                  <span>Event reminders</span>
                  <span className="m-sm m-mut">{reminderStatus}</span>
                </div>
                <span
                  className="material-symbols-outlined flex-none"
                  style={{ fontSize: 40, width: 40, height: 40, lineHeight: 1, color: remindersOn ? 'var(--color-primary)' : 'var(--color-outline)' }}
                  aria-hidden="true"
                >
                  {remindersOn ? 'toggle_on' : 'toggle_off'}
                </span>
              </button>
              {remindersOn && (
                <button type="button" className={row} onClick={() => void handleTestNotification()}>
                  <span className="material-symbols-outlined m-ic s m-mut">send</span>
                  <div className="flex flex-col flex-1 min-w-0" style={{ padding: '8px 0' }}>
                    <span>Send a test reminder</span>
                    {testMessage && <span className="m-sm m-mut">{testMessage}</span>}
                  </div>
                  <span className="material-symbols-outlined m-ic s m-mut">chevron_right</span>
                </button>
              )}
            </div>
            <span className="m-sm m-mut">
              Pick a reminder per event in the event editor, or per task in the task editor.
            </span>
          </section>

          <section className="flex flex-col" style={{ gap: 8 }}>
            <span className="m-lbl m-mut">Study preferences</span>
            <div className={group} style={groupStyle}>
              <div className={row} aria-disabled="true">
                <span className="material-symbols-outlined m-ic s m-mut">tune</span>
                <span className="flex-1">Study preferences</span>
                <span className="m-sm m-mut">Coming soon</span>
              </div>
            </div>
          </section>

          <button type="button" className="m-btn err wide" style={{ marginTop: 'auto' }} onClick={handleLogout}>
            <span className="material-symbols-outlined m-ic s">logout</span>
            Logout
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col w-full h-full relative overflow-anchor-none flex-1 min-h-0 overflow-hidden lg:flex-none lg:h-[calc(100dvh-4rem)]">
      <div className="grid grid-cols-12 gap-6 lg:grid-cols-[260px_minmax(0,1fr)] lg:gap-10 lg:grid-rows-[minmax(0,1fr)] lg:items-start relative max-lg:flex max-lg:flex-col flex-1 min-h-0 lg:h-full">
        <div className="col-span-12 lg:col-span-1 lg:self-start mb-10 max-lg:mb-3 lg:mb-0 overflow-anchor-none max-lg:flex-shrink-0">
          <h2 className="font-headline-lg text-[30px] leading-[36px] text-on-surface mb-10 max-lg:mb-3">Settings</h2>
          <SettingsNav active={activeSection} onChange={setActiveSection} />
        </div>
        <div ref={springRef} className="col-span-12 lg:col-span-1 overflow-anchor-none flex-1 min-h-0 overflow-y-auto overscroll-contain lg:h-full">
          {activeSection === 'account' && (
            <div className="mb-20 flex flex-col gap-6">
              <h1 className="font-headline-lg text-[30px] leading-[36px] text-on-surface lg:sticky lg:top-0 lg:z-10 lg:bg-background lg:pt-12 lg:pb-2">Account</h1>
              <div className="bg-surface-container-lowest rounded-2xl border border-outline-variant shadow-elev-1 p-8 flex flex-col gap-7 max-w-xl">
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
              <h1 className="font-headline-lg text-[30px] leading-[36px] text-on-surface lg:sticky lg:top-0 lg:z-10 lg:bg-background lg:pt-12 lg:pb-2">General</h1>
              <div className="bg-surface-container-lowest rounded-2xl border border-outline-variant shadow-elev-1 p-8 flex flex-col gap-4 max-w-xl">
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

              <div className="bg-surface-container-lowest rounded-2xl border border-outline-variant shadow-elev-1 p-8 flex flex-col gap-4 max-w-xl">
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
          {activeSection === 'notifications' && (
            <div className="mb-20 flex flex-col gap-4">
              <h1 className="font-headline-lg text-[30px] leading-[36px] text-on-surface lg:sticky lg:top-0 lg:z-10 lg:bg-background lg:pt-12 lg:pb-2">
                Notifications
              </h1>
              <div className="bg-surface-container-lowest rounded-2xl border border-outline-variant shadow-elev-1 p-8 flex flex-col gap-4 max-w-xl">
                <label className="font-label-sm text-[12px] leading-[16px] text-on-surface-variant uppercase tracking-[0.16em]">
                  Reminders
                </label>
                <p className="font-body-sm text-[13px] leading-[19px] text-on-surface-variant">
                  Pick a reminder per event in the event editor, or per task in the task editor. With push enabled, the server sends reminders even when CDMM is closed.
                </p>
                <p className="font-body-md text-[14px] leading-[20px] text-on-surface">
                  {permission === 'granted'
                    ? pushOn
                      ? 'Push notifications are on for this device.'
                      : 'Notifications are allowed, but push is unavailable here — reminders show only while CDMM is open.'
                    : permission === 'denied'
                      ? 'Notifications are blocked — allow them for this site in the browser settings.'
                      : permission === 'unsupported'
                        ? 'This browser does not support notifications.'
                        : 'Notifications are not enabled yet.'}
                </p>
                <div className="flex flex-wrap items-center gap-3">
                  {permission === 'default' && (
                    <button
                      type="button"
                      onClick={() => void requestNotificationPermission().then(setPermission)}
                      className="px-6 py-3 rounded-full bg-primary text-on-primary font-label-md text-[13px] leading-[18px] uppercase tracking-[0.1em] hover:opacity-90 transition-opacity"
                    >
                      Enable
                    </button>
                  )}
                  {permission === 'granted' && (
                    <button
                      type="button"
                      onClick={() => void handleTestNotification()}
                      className="px-6 py-3 rounded-full border border-outline-variant text-on-surface-variant font-label-md text-[13px] leading-[18px] uppercase tracking-[0.1em] hover:bg-surface-container hover:text-on-surface transition-colors"
                    >
                      Send test
                    </button>
                  )}
                  {testMessage && (
                    <span className="font-body-sm text-[13px] leading-[19px] text-on-surface-variant">{testMessage}</span>
                  )}
                </div>
              </div>
            </div>
          )}
          {activeSection === 'study-preferences' && (
            <div className="mb-20 flex flex-col gap-4">
              <h1 className="font-headline-lg text-[30px] leading-[36px] text-on-surface capitalize lg:sticky lg:top-0 lg:z-10 lg:bg-background lg:pt-12 lg:pb-2">
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
