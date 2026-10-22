import { useLayoutEffect, useRef, useState } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { todoRepo } from '../../services/repositories';
import { useSyncRefresh } from '../../hooks/useServerSync';
import { hasTodoDueToday } from '../todo/TodoRows';

// Tab order, left to right; pages slide in from the side of their tab (AppShell).
// No Focus Room on the phone either: the live session is started and finished
// from the session bar right above this nav.
export const navItems = [
  { path: '/', label: 'Calendar', icon: 'calendar_today' },
  { path: '/todo', label: 'Todo', icon: 'checklist' },
  { path: '/statistics', label: 'Stats', icon: 'bar_chart' },
  { path: '/subjects', label: 'Subjects', icon: 'layers' },
  { path: '/settings', label: 'Settings', icon: 'settings' },
];

export function MobileNav() {
  const [todos, setTodos] = useState(() => todoRepo.getAll());
  useSyncRefresh(() => setTodos(todoRepo.getAll()));
  const todoDueToday = hasTodoDueToday(todos);
  const { pathname } = useLocation();
  const navRef = useRef<HTMLElement>(null);
  const pillRef = useRef<HTMLSpanElement>(null);

  // One pill behind the icons slides to the active tab. A press moves it at
  // once, before the new page renders; the route then confirms it.
  const placePill = (path: string, animate = true) => {
    const nav = navRef.current;
    const pill = pillRef.current;
    const ic = nav?.querySelector<HTMLElement>(`[data-nav="${path}"] .m-nav-ic`);
    if (!pill || !ic) {
      if (pill) pill.style.opacity = '0';
      return;
    }
    const link = ic.parentElement!;
    if (!animate) pill.style.transition = 'none';
    pill.style.opacity = '1';
    pill.style.transform = `translate(${link.offsetLeft + ic.offsetLeft}px, ${link.offsetTop + ic.offsetTop}px)`;
    if (!animate) {
      void pill.offsetWidth;
      pill.style.transition = '';
    }
  };
  const placed = useRef(false);
  useLayoutEffect(() => {
    placePill(pathname, placed.current);
    placed.current = true;
  }, [pathname]);
  useLayoutEffect(() => {
    const nav = navRef.current;
    if (!nav || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(() => placePill(window.location.pathname, false));
    ro.observe(nav);
    return () => ro.disconnect();
  }, []);

  return (
    <nav ref={navRef} aria-label="Sections" className="m-nav relative flex-none flex bg-surface-container-lowest border-t border-outline-variant lg:hidden safe-area-bottom" style={{ paddingInline: 4 }}>
      <span ref={pillRef} aria-hidden="true" className="m-nav-pill absolute left-0 top-0 bg-secondary-container pointer-events-none" style={{ width: 56, height: 30, borderRadius: 9.6, opacity: 0 }} />
      {navItems.map((item) => (
        <NavLink
          key={item.path}
          to={item.path}
          end={item.path === '/'}
          data-nav={item.path}
          onPointerDown={() => placePill(item.path)}
          onPointerCancel={() => placePill(pathname)}
          className={({ isActive }) =>
            `relative flex-1 flex flex-col items-center justify-center ${isActive ? 'text-on-surface' : 'text-on-surface-variant'}`
          }
          style={{ height: 56, gap: 2 }}
        >
          {({ isActive }) => (
            <>
              <span
                className={`m-nav-ic relative flex items-center justify-center ${isActive ? 'text-on-secondary-container' : ''}`}
                style={{ width: 56, height: 30, borderRadius: 9.6 }}
              >
                <span className="material-symbols-outlined m-ic">{item.icon}</span>
                {item.path === '/todo' && todoDueToday && (
                  <span
                    aria-label="Tasks due today"
                    className="absolute rounded-full bg-error"
                    style={{ top: 2, right: 12, width: 8, height: 8, boxShadow: '0 0 0 2px var(--color-surface-container-lowest)' }}
                  />
                )}
              </span>
              <span className="m-lbl">{item.label}</span>
            </>
          )}
        </NavLink>
      ))}
    </nav>
  );
}
