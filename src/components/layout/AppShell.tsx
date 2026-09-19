import { Outlet } from 'react-router-dom';
import { Sidebar } from './Sidebar';
import { MobileNav } from './MobileNav';

export function AppShell() {
  return (
    <div className="h-dvh bg-background flex flex-col overflow-hidden">
      <Sidebar />
      <div className="pl-72 max-lg:pl-0 max-lg:pb-16 flex flex-col flex-1 min-h-0">
        <main className="px-10 max-lg:px-4 py-8 max-lg:py-4 flex-1 flex flex-col min-h-0 overflow-y-auto">
          <Outlet />
        </main>
      </div>
      <MobileNav />
    </div>
  );
}
