import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { getUsername, logoutRemote, clearSession } from '../../services/auth';
import { clearAllLocalData } from '../../services/repositories';

export function TopHeader() {
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();
  const wrapRef = useRef<HTMLDivElement>(null);
  const username = getUsername();

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: PointerEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open ]);

  const goAccount = () => {
    setOpen(false);
    navigate('/settings?section=account');
  };

  const handleLogout = () => {
    void logoutRemote();
    clearSession();
    clearAllLocalData();
    window.location.reload();
  };

  return (
    <header className="fixed top-0 left-72 right-0 h-20 bg-background/80 backdrop-blur-xl z-40 flex items-center justify-end px-16 gap-6 max-lg:hidden">
      <div
        ref={wrapRef}
        className="relative"
        onMouseEnter={() => setOpen(true)}
        onMouseLeave={() => setOpen(false)}
        onContextMenu={(e) => {
          e.preventDefault();
          setOpen(true);
        }}
      >
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-haspopup="menu"
          aria-expanded={open}
          aria-label="Account"
          className="rounded px-2 py-1 font-body-lg text-body-lg font-bold text-on-surface max-w-48 truncate hover:bg-surface-container transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
        >
          {username ?? 'Account'}
        </button>

        {open && (
          <div className="absolute right-0 top-full pt-2">
            <div
              role="menu"
              aria-label="Account"
              className="w-56 bg-surface-container-lowest border border-outline-variant rounded-xl shadow-xl p-2 flex flex-col"
            >
            <div className="px-4 py-3 border-b border-outline-variant mb-1">
              <p className="font-label-sm text-label-sm text-on-surface-variant uppercase tracking-widest">
                Signed in as
              </p>
              <p className="font-body-md text-body-md text-on-surface truncate">
                {username ?? '—'}
              </p>
            </div>
            <button
              type="button"
              role="menuitem"
              onClick={goAccount}
              className="flex items-center gap-3 px-4 py-2 rounded text-left font-label-md text-label-md text-on-surface hover:bg-surface-container transition-colors"
            >
              <span className="material-symbols-outlined text-[18px]">manage_accounts</span>
              Account settings
            </button>
            <button
              type="button"
              role="menuitem"
              onClick={handleLogout}
              className="flex items-center gap-3 px-4 py-2 rounded text-left font-label-md text-label-md text-error hover:bg-surface-container transition-colors"
            >
              <span className="material-symbols-outlined text-[18px]">logout</span>
              Logout
            </button>
            </div>
          </div>
        )}
      </div>
    </header>
  );
}
