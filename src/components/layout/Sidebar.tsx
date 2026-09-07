import { NavLink } from 'react-router-dom';

const navItems = [
  { path: '/', label: 'CALENDAR', icon: 'calendar_today' },
  { path: '/study', label: 'STUDY', icon: 'menu_book' },
  { path: '/todo', label: 'TODO', icon: 'checklist' },
  { path: '/statistics', label: 'STATISTICS', icon: 'bar_chart' },
  { path: '/subjects', label: 'SUBJECTS', icon: 'category' },
];

export function Sidebar() {
  return (
    <aside className="fixed left-0 top-0 h-full w-72 bg-surface-container-lowest border-r border-outline-variant z-50 flex flex-col max-lg:hidden">
      <div className="px-8 flex flex-col justify-center gap-0.5 border-b border-outline-variant h-20">
        <span className="text-[28px] leading-[32px] font-display-lg text-primary uppercase tracking-tighter">
          CDMM
        </span>
        <span className="font-label-sm text-[10px] leading-[14px] text-on-surface-variant tracking-[0.22em] uppercase italic font-medium">
          carpe diem, memento mori
        </span>
      </div>
      <nav className="flex-1 px-4 py-6 flex flex-col gap-1">
        {navItems.map((item) => (
          <NavLink
            key={item.path}
            to={item.path}
            end={item.path === '/'}
            className={({ isActive }) =>
              `flex items-center px-4 py-2 rounded transition-all font-label-md text-label-md ${
                isActive
                  ? 'bg-surface-container text-on-surface font-semibold'
                  : 'text-on-surface-variant hover:bg-surface-container-low hover:text-on-surface'
              }`
            }
          >
            <span className="material-symbols-outlined mr-4">{item.icon}</span>
            {item.label}
          </NavLink>
        ))}
        <div className="mt-auto">
          <NavLink
            to="/settings"
            className={({ isActive }) =>
              `flex items-center px-4 py-2 rounded transition-all font-label-md text-label-md ${
                isActive
                  ? 'bg-surface-container text-on-surface font-semibold'
                  : 'text-on-surface-variant hover:bg-surface-container-low hover:text-on-surface'
              }`
            }
          >
            <span className="material-symbols-outlined mr-4">settings</span>
            SETTINGS
          </NavLink>
        </div>
      </nav>
    </aside>
  );
}
