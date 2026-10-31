import { Logo } from './Logo';

/** Shown while the first sync runs (Claude Design Loading-Next). */
export function LoadingScreen() {
  return (
    <div
      role="status"
      aria-label="Syncing your data"
      className="min-h-dvh bg-background text-on-background flex flex-col items-center justify-center gap-[1.4rem]"
    >
      <Logo variant="tile" size={96} sweep />
      <span className="font-display text-[28px] leading-[34px] font-bold tracking-[-0.025em] text-on-surface">CDMM</span>
      <div className="w-40 h-[3px] rounded-[3px] bg-surface-container-high overflow-hidden">
        <div className="load-run w-2/5 h-full rounded-[3px] bg-primary" />
      </div>
      <p className="text-meta text-on-surface-variant">Syncing your data…</p>
    </div>
  );
}
