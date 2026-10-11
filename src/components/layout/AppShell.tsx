import { useEffect } from 'react';
import { Outlet, useLocation, useNavigate } from 'react-router-dom';
import { Sidebar } from './Sidebar';
import { MobileNav } from './MobileNav';
import { LiveSessionCard } from './LiveSessionCard';
import { useIsMobile } from '../../hooks/useIsMobile';
import { NotificationPrompt } from './NotificationPrompt';
import { requestSessionStart, requestSessionStartEdit } from '../../services/liveSession';
import { settingsRepo } from '../../services/repositories';
import { hasOpenOverlay } from '../../services/overlays';
import { startEventNotifications } from '../../services/notifications';

/** Routes whose phone layout comes from the mobile redesign. */
const FULL_BLEED = new Set(['/', '/todo']);

export function AppShell() {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const isMobile = useIsMobile();

  // Event reminders run while the app is open in any tab or as the PWA.
  useEffect(() => {
    startEventNotifications();
  }, []);

  // Section shortcuts: C → calendar, B → change the live session's start
  // (only while one runs), S → statistics, T → todo, F → start a session (or, while one runs, ask
  // to end it). Physical keys
  // (e.code) so they work on any layout; skipped while typing or with a modal
  // open so they never hijack a form or dismiss an editor.
  //
  // F no longer navigates anywhere: with the Focus Room tab gone, the sidebar
  // panel is the single place a session is started, so the shortcut asks that
  // panel to open its subject picker instead.
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      const target = e.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.tagName === 'SELECT' ||
          target.isContentEditable)
      ) {
        return;
      }
      // Single-letter shortcuts must not fire behind a dialog. Asks the overlay
      // stack rather than guessing at markup with a DOM query.
      if (hasOpenOverlay()) return;
      if (e.code === 'KeyC') navigate('/');
      else if (e.code === 'KeyB') {
        if (settingsRepo.get().activeSession) requestSessionStartEdit();
      } else if (e.code === 'KeyS') navigate('/statistics');
      else if (e.code === 'KeyT') navigate('/todo');
      else if (e.code === 'KeyF') requestSessionStart();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [navigate]);

  // Phone: the shell is pinned to the viewport with insets rather than sized
  // with dvh — under the 0.8 body zoom 100dvh would fill only 80% of the
  // screen. The session bar and the nav sit in the column under the page.
  return (
    <div className="h-dvh max-lg:h-auto max-lg:fixed max-lg:inset-0 bg-background flex flex-col overflow-hidden">
      <Sidebar />
      <div className="pl-[19rem] max-lg:pl-0 flex flex-col flex-1 min-h-0">
        {/* Redesigned phone pages draw their own full-bleed header and gutters. */}
        <main className={`px-10 py-8 flex-1 flex flex-col min-h-0 overflow-y-auto max-lg:overflow-hidden ${FULL_BLEED.has(pathname) ? 'max-lg:p-0' : 'max-lg:px-4 max-lg:py-4'}`}>
          {/* Keyed by route so every page switch replays the enter animation. */}
          <div key={pathname} className="animate-view-enter flex flex-col flex-1 min-h-0">
            <Outlet />
          </div>
        </main>
      </div>
      {isMobile && <LiveSessionCard variant="dock" shortcuts />}
      <MobileNav />
      <NotificationPrompt />
    </div>
  );
}
