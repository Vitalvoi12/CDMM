import { useState } from 'react';
import { NavLink } from 'react-router-dom';
import { todoRepo } from '../../services/repositories';
import { useSyncRefresh } from '../../hooks/useServerSync';
import { hasTodoDueToday } from '../todo/TodoRows';
import { LiveSessionCard } from './LiveSessionCard';
import { WeeklyGoalsCard } from './WeeklyGoalsCard';

// No FOCUS ROOM: on a PC the live session is driven from the panel at the
// bottom of this sidebar, so a tab for it would be a second place to look.
const navItems = [
  { path: '/', label: 'CALENDAR', icon: 'calendar_today', shortcut: 'C' },
  { path: '/todo', label: 'TODO', icon: 'checklist', shortcut: 'T' },
  { path: '/statistics', label: 'STATISTICS', icon: 'bar_chart', shortcut: 'S' },
  { path: '/subjects', label: 'SUBJECTS', icon: 'layers', shortcut: '' },
];

function navClass({ isActive }: { isActive: boolean }): string {
  return `relative flex items-center gap-5 px-5 py-3 rounded-full transition-colors font-label-md text-[12px] leading-[16px] uppercase ${
    isActive ? 'bg-secondary-container text-on-secondary-container font-semibold' : 'text-on-surface-variant hover:text-on-surface hover:bg-surface-container-low'
  }`;
}

export function Sidebar() {
  // Red dot on Todo when something is due today; checkpoint() notifies, so the
  // dot follows toggles/creates without a page revisit.
  const [todos, setTodos] = useState(() => todoRepo.getAll());
  useSyncRefresh(() => setTodos(todoRepo.getAll()));
  const todoDueToday = hasTodoDueToday(todos);

  return (
    <aside className="fixed left-0 top-0 h-full w-[19rem] bg-surface-dim border-r border-outline-variant z-50 flex flex-col max-lg:hidden">
      <div className="px-8 pt-8 pb-6 flex flex-col gap-1 border-b border-outline-variant">
        <span className="font-headline-lg text-headline-lg text-on-surface tracking-tight">
          CDMM
        </span>
      </div>

      <nav className="flex-1 px-5 pt-5 flex flex-col gap-2">
        {navItems.map((item) => (
          <NavLink key={item.path} to={item.path} end={item.path === '/'} className={navClass} title={item.shortcut ? `${item.label} (Shortcut: ${item.shortcut})` : item.label}>
            {({ isActive }) => (
              <>
                <span className={`material-symbols-outlined text-[18px] ${isActive ? 'text-on-secondary-container' : ''}`}>{item.icon}</span>
                {item.label}
                {item.path === '/todo' && todoDueToday && (
                  <span aria-label="Tasks due today" className="ml-auto w-2 h-2 rounded-full bg-error flex-shrink-0" />
                )}
              </>
            )}
          </NavLink>
        ))}
        <div className="mt-auto pb-6 flex flex-col gap-3">
          <WeeklyGoalsCard />
          <LiveSessionCard />
          <NavLink to="/settings" className={navClass}>
            {({ isActive }) => (
              <>
                <span className={`material-symbols-outlined text-[18px] ${isActive ? 'text-on-secondary-container' : ''}`}>settings</span>
                SETTINGS
              </>
            )}
          </NavLink>
        </div>
      </nav>
    </aside>
  );
}
