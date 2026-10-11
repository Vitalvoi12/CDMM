import { useState } from 'react';
import { NavLink } from 'react-router-dom';
import { todoRepo } from '../../services/repositories';
import { useSyncRefresh } from '../../hooks/useServerSync';
import { hasTodoDueToday } from '../todo/TodoRows';

// No Focus Room on the phone either: the live session is started and finished
// from the session bar right above this nav.
const navItems = [
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

  return (
    <nav aria-label="Sections" className="flex-none flex bg-surface-container-lowest border-t border-outline-variant lg:hidden safe-area-bottom" style={{ paddingInline: 4 }}>
      {navItems.map((item) => (
        <NavLink
          key={item.path}
          to={item.path}
          end={item.path === '/'}
          className={({ isActive }) =>
            `relative flex-1 flex flex-col items-center justify-center ${isActive ? 'text-on-surface' : 'text-on-surface-variant'}`
          }
          style={{ height: 56, gap: 2 }}
        >
          {({ isActive }) => (
            <>
              <span
                className={`relative flex items-center justify-center ${isActive ? 'bg-secondary-container text-on-secondary-container' : ''}`}
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
