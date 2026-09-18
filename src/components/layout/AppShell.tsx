import { Outlet } from 'react-router-dom';
import { Sidebar } from './Sidebar';
import { TopHeader } from './TopHeader';
import { MobileNav } from './MobileNav';

export function AppShell() {
  return (
    <div className="h-dvh bg-background flex flex-col overflow-hidden">
      <Sidebar />
      <TopHeader />
      <div className="pl-72 max-lg:pl-0 max-lg:pb-16 pt-20 max-lg:pt-0 flex flex-col flex-1 min-h-0">
        <main className="px-16 max-lg:px-4 py-16 max-lg:py-6 flex-1 flex flex-col min-h-0 overflow-y-auto">
          <Outlet />
        </main>
      </div>
      <MobileNav />
    </div>
  );
}
