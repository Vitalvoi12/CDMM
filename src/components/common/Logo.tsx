/**
 * The B3 mark: logged blocks on the left (muted, with a spine), planned
 * blocks on the right, the "now" line across. Colours come from the --logo-*
 * variables in index.css, so the bare mark follows the theme; the tile is
 * always the near-black app icon and pins the dark set (.logo-tile).
 */
interface LogoProps {
  variant?: 'mark' | 'tile';
  size?: number;
  className?: string;
  /** Accessible name; omit when text beside the logo already says CDMM. */
  label?: string;
}

function MarkShapes() {
  return (
    <>
      <rect x="25" y="22" width="22" height="16" rx="3.5" fill="var(--logo-done-a)" />
      <rect x="25" y="22" width="4" height="16" rx="2" fill="var(--logo-a)" />
      <rect x="25" y="41" width="22" height="15" rx="3.5" fill="var(--logo-done-b)" />
      <rect x="25" y="41" width="4" height="15" rx="2" fill="var(--logo-b)" />
      <rect x="53" y="22" width="22" height="18" rx="3.5" fill="var(--logo-a)" />
      <rect x="53" y="43" width="22" height="17" rx="3.5" fill="var(--logo-b)" />
      <rect x="53" y="63" width="22" height="15" rx="3.5" fill="var(--logo-c)" />
      <line x1="18" y1="59" x2="82" y2="59" stroke="var(--logo-now)" strokeWidth="2.8" strokeLinecap="round" />
      <circle cx="18" cy="59" r="3.8" fill="var(--logo-now)" />
    </>
  );
}

export function Logo({ variant = 'mark', size = 30, className = '', label }: LogoProps) {
  const tile = variant === 'tile';
  const a11y = label ? { role: 'img', 'aria-label': label } : { 'aria-hidden': true };
  return (
    <svg
      width={size}
      height={size}
      // The bare mark is cropped to its blocks; the tile keeps the full icon.
      viewBox={tile ? '0 0 100 100' : '16 16 68 68'}
      className={`flex-none ${tile ? 'logo-tile' : ''} ${className}`}
      {...a11y}
    >
      {tile && <rect width="100" height="100" rx="22" fill="#0B0B0A" />}
      <MarkShapes />
    </svg>
  );
}

/** Mark + wordmark, as in the sidebar header. */
export function LogoLockup({ className = '' }: { className?: string }) {
  return (
    <span className={`flex items-center gap-3 ${className}`}>
      <Logo size={30} />
      <span className="font-display text-[22px] leading-[28px] font-bold tracking-[-0.025em] text-on-surface">CDMM</span>
    </span>
  );
}
