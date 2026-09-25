import { useEffect } from 'react';
import { Outlet, useNavigate } from 'react-router-dom';
import { Sidebar } from './Sidebar';
import { MobileNav } from './MobileNav';

export function AppShell() {
  const navigate = useNavigate();

  // Section shortcuts: C → calendar, T → todo, F → focus room. Physical keys
  // (e.code) so they work on any layout; skipped while typing or with a modal
  // open so they never hijack a form or dismiss an editor.
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
      if (document.querySelector('.fixed.inset-0')) return;
      if (e.code === 'KeyC') navigate('/');
      else if (e.code === 'KeyT') navigate('/todo');
      else if (e.code === 'KeyF') navigate('/study');
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [navigate]);

  return (
    <div className="h-dvh bg-background flex flex-col overflow-hidden">
      <Sidebar />
      <div className="pl-[19rem] max-lg:pl-0 max-lg:pb-16 flex flex-col flex-1 min-h-0">
        <main className="px-10 max-lg:px-4 py-8 max-lg:py-4 flex-1 flex flex-col min-h-0 overflow-y-auto max-lg:overflow-hidden">
          <Outlet />
        </main>
      </div>
      <MobileNav />
    </div>
  );
}
