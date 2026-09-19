import { NavLink } from 'react-router-dom';

const navItems = [
  { path: '/', label: 'CALENDAR', icon: 'calendar_today' },
  { path: '/study', label: 'STUDY', icon: 'timer' },
  { path: '/todo', label: 'TODO', icon: 'checklist' },
  { path: '/statistics', label: 'STATISTICS', icon: 'bar_chart' },
  { path: '/subjects', label: 'SUBJECTS', icon: 'layers' },
];

function navClass({ isActive }: { isActive: boolean }): string {
  return `relative flex items-center gap-4 px-4 py-2.5 rounded-lg transition-colors font-label-md text-label-md uppercase ${
    isActive ? 'bg-surface-container text-on-surface font-semibold' : 'text-on-surface-variant hover:text-on-surface hover:bg-surface-container-low'
  }`;
}

export function Sidebar() {
  return (
    <aside className="fixed left-0 top-0 h-full w-72 bg-surface-dim border-r border-outline-variant z-50 flex flex-col max-lg:hidden">
      <div className="px-8 pt-8 pb-6 flex flex-col gap-1 border-b border-outline-variant">
        <span className="font-headline-lg text-headline-lg text-on-surface tracking-tight">
          CDMM
        </span>
        <span className="font-label-sm text-label-sm text-on-surface-variant tracking-[0.18em] uppercase">
          Carpe diem, memento mori
        </span>
      </div>

      <nav className="flex-1 px-4 pt-4 flex flex-col gap-1">
        {navItems.map((item) => (
          <NavLink key={item.path} to={item.path} end={item.path === '/'} className={navClass}>
            {({ isActive }) => (
              <>
                {isActive && <span className="absolute left-1 top-3 bottom-3 w-[2px] rounded-full bg-primary" />}
                <span className={`material-symbols-outlined text-[16px] ${isActive ? 'text-primary' : ''}`}>{item.icon}</span>
                {item.label}
              </>
            )}
          </NavLink>
        ))}
        <div className="mt-auto pb-6">
          <NavLink to="/settings" className={navClass}>
            {({ isActive }) => (
              <>
                {isActive && <span className="absolute left-1 top-3 bottom-3 w-[2px] rounded-full bg-primary" />}
                <span className={`material-symbols-outlined text-[16px] ${isActive ? 'text-primary' : ''}`}>settings</span>
                SETTINGS
              </>
            )}
          </NavLink>
        </div>
      </nav>
    </aside>
  );
}
