import { useEffect } from 'react';
import { Outlet, useLocation, useNavigate } from 'react-router-dom';
import { Sidebar } from './Sidebar';
import { MobileNav, navItems } from './MobileNav';
import { useSlideIn } from '../../hooks/useSlideIn';
import { LiveSessionCard } from './LiveSessionCard';
import { useIsMobile } from '../../hooks/useIsMobile';
import { NotificationPrompt } from './NotificationPrompt';
import { requestSessionStart, requestSessionStartEdit } from '../../services/liveSession';
import { settingsRepo } from '../../services/repositories';
import { hasOpenOverlay } from '../../services/overlays';
import { matchShortcut } from '../../services/shortcuts';
import { startEventNotifications } from '../../services/notifications';
import { BELOW_DOCK_ID, useDockHidden } from '../mobile/belowDock';
import { UndoToast } from '../mobile/UndoToast';

const NAV_ORDER = navItems.map((i) => i.path);

/** Routes whose phone layout comes from the mobile redesign. */
const FULL_BLEED = new Set(['/', '/todo', '/subjects', '/statistics', '/settings']);

export function AppShell() {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const dockHidden = useDockHidden();
  const isMobile = useIsMobile();
  const slideIn = useSlideIn(pathname, NAV_ORDER);

  // Event reminders run while the app is open in any tab or as the PWA.
  useEffect(() => {
    startEventNotifications();
  }, []);

  // Section shortcuts (keys from services/shortcuts, C/T/S by default):
  // open Calendar, Todo, Statistics or Subjects; B → change the live
  // session's start (only while one runs); F → start a session (or, while
  // one runs, ask to end it). Physical keys (e.code) so they work on any
  // layout; skipped while typing or with a modal open so they never hijack
  // a form or dismiss an editor.
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
      if (matchShortcut(e, 'go-calendar')) navigate('/');
      else if (matchShortcut(e, 'session-start')) {
        if (settingsRepo.get().activeSession) requestSessionStartEdit();
      } else if (matchShortcut(e, 'go-stats')) navigate('/statistics');
      else if (matchShortcut(e, 'go-todo')) navigate('/todo');
      else if (matchShortcut(e, 'go-subjects')) navigate('/subjects');
      else if (matchShortcut(e, 'session')) requestSessionStart();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [navigate]);

  // The shell is pinned to the viewport with insets rather than sized with
  // dvh — under a body zoom (0.88 on phones, any interface size) 100dvh would
  // fill only part of the screen. On phones the session bar and the nav sit
  // in the column under the page.
  return (
    <div className="fixed inset-0 bg-background flex flex-col overflow-hidden">
      <Sidebar />
      <div className="relative pl-[19rem] max-lg:pl-0 flex flex-col flex-1 min-h-0">
        {/* Redesigned phone pages draw their own full-bleed header and gutters. */}
        <main className={`px-10 py-8 flex-1 flex flex-col min-h-0 overflow-y-auto max-lg:overflow-hidden ${FULL_BLEED.has(pathname) ? 'max-lg:p-0' : 'max-lg:px-4 max-lg:py-4'}`}>
          {/* Keyed by route so every page switch replays the enter animation. */}
          {/* On the phone the page slides in from its tab's side. */}
          <div key={pathname} className={`animate-view-enter ${slideIn} flex flex-col flex-1 min-h-0`}>
            <Outlet />
          </div>
        </main>
        {isMobile && <UndoToast />}
      </div>
      {/* The phone shows the session bar on the calendar's views only (not its
          Check / Notes panels); elsewhere it stays mounted, hidden, for
          its dialogs and the Subjects page's Finish. */}
      {isMobile && <LiveSessionCard variant="dock" shortcuts hidden={pathname !== '/' || dockHidden} />}
      {/* Phone pages can portal a bar here to sit under the session dock (see BELOW_DOCK_ID). */}
      {isMobile && <div id={BELOW_DOCK_ID} className="flex-none" />}
      <MobileNav />
      <NotificationPrompt />
    </div>
  );
}
