import { useEffect } from 'react';
import { Outlet, useLocation, useNavigate } from 'react-router-dom';
import { Sidebar } from './Sidebar';
import { MobileNav } from './MobileNav';
import { requestSessionStart, requestSessionStartEdit } from '../../services/liveSession';
import { settingsRepo } from '../../services/repositories';
import { hasOpenOverlay } from '../../services/overlays';

export function AppShell() {
  const navigate = useNavigate();
  const { pathname } = useLocation();

  // Section shortcuts: C → change the live session's start (calendar when none runs),
  // S → statistics, T → todo, F → start a session (or, while one runs, ask
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
      if (e.code === 'KeyC') {
        if (settingsRepo.get().activeSession) requestSessionStartEdit();
        else navigate('/');
      } else if (e.code === 'KeyS') navigate('/statistics');
      else if (e.code === 'KeyT') navigate('/todo');
      else if (e.code === 'KeyF') requestSessionStart();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [navigate]);

  return (
    <div className="h-dvh bg-background flex flex-col overflow-hidden">
      <Sidebar />
      <div className="pl-[19rem] max-lg:pl-0 max-lg:pb-16 flex flex-col flex-1 min-h-0">
        <main className="px-10 max-lg:px-4 py-8 max-lg:py-4 flex-1 flex flex-col min-h-0 overflow-y-auto max-lg:overflow-hidden">
          {/* Keyed by route so every page switch replays the enter animation. */}
          <div key={pathname} className="animate-view-enter flex flex-col flex-1 min-h-0">
            <Outlet />
          </div>
        </main>
      </div>
      <MobileNav />
    </div>
  );
}
