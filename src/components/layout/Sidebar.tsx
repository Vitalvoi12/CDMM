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
      <div className="p-8 flex items-center gap-4 border-b border-outline-variant h-20">
        <span className="material-symbols-outlined text-primary text-[28px]">school</span>
        <span className="font-headline-md text-headline-md text-primary uppercase tracking-tighter">
          StudyCore
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
