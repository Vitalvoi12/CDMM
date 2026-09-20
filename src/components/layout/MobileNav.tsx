import { NavLink } from 'react-router-dom';

const navItems = [
  { path: '/', label: 'Calendar', icon: 'calendar_today' },
  { path: '/study', label: 'Focus Room', icon: 'menu_book' },
  { path: '/todo', label: 'Todo', icon: 'checklist' },
  { path: '/statistics', label: 'Stats', icon: 'bar_chart' },
  { path: '/subjects', label: 'Subjects', icon: 'category' },
  { path: '/settings', label: 'Settings', icon: 'settings' },
];

export function MobileNav() {
  return (
    <nav className="fixed bottom-0 left-0 right-0 bg-surface-container-lowest border-t border-outline-variant z-50 lg:hidden safe-area-bottom">
      <div className="flex items-center justify-around h-16">
        {navItems.map((item) => (
          <NavLink
            key={item.path}
            to={item.path}
            end={item.path === '/'}
            className={({ isActive }) =>
              `relative flex flex-col items-center justify-center gap-1 px-1.5 py-1 transition-colors ${
                isActive ? 'text-on-surface' : 'text-on-surface-variant'
              }`
            }
          >
            {({ isActive }) => (
              <>
                <span className={`flex items-center justify-center px-4 py-1 rounded-full transition-colors ${isActive ? 'bg-secondary-container' : ''}`}>
                  <span className="material-symbols-outlined max-lg:!text-[17px]">{item.icon}</span>
                </span>
                <span className="font-label-sm text-label-sm max-lg:!text-[8px] max-lg:leading-none max-[400px]:!text-[8px] uppercase tracking-[0.08em]">{item.label}</span>
              </>
            )}
          </NavLink>
        ))}
      </div>
    </nav>
  );
}
