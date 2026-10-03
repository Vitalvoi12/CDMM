import type { ReactNode } from 'react';

interface SectionProps {
  title: string;
  /** Small print on the right of the heading (controls, period echo, …). */
  aside?: ReactNode;
  children: ReactNode;
  delay?: number;
}

/**
 * The one section frame of the Statistics screen. Keeping the heading, the
 * rhythm of the spacing and the entrance animation here is what makes the page
 * read as a single analytical screen instead of a pile of unrelated cards.
 */
export function Section({ title, aside, children, delay = 0 }: SectionProps) {
  return (
    <section className="mb-12 animate-fade-up" style={{ animationDelay: `${delay}ms` }}>
      <div className="flex justify-between items-end mb-6 flex-wrap gap-3">
        <h2 className="font-label-md text-label-md text-on-surface uppercase tracking-widest">
          {title}
        </h2>
        {aside}
      </div>
      {children}
    </section>
  );
}

interface StatTileProps {
  value: ReactNode;
  label: string;
  hint?: string;
  delay?: number;
  className?: string;
}

/** A single number with its caption — the smallest unit of the page. */
export function StatTile({ value, label, hint, delay = 0, className = '' }: StatTileProps) {
  return (
    <div
      className={`border-l-2 border-outline-variant pl-4 animate-fade-up ${className}`}
      style={{ animationDelay: `${delay}ms` }}
    >
      <p className="font-headline-md text-headline-md text-on-surface tabular-nums">{value}</p>
      <p className="font-label-sm text-label-sm text-on-surface-variant uppercase tracking-widest mt-1">
        {label}
      </p>
      {hint && <p className="font-body-sm text-body-sm text-on-surface-variant mt-0.5">{hint}</p>}
    </div>
  );
}

interface EmptyProps {
  text: string;
  hint?: string;
}

/** Shared empty state: quiet, centred, never an alarming red box. */
export function EmptyState({ text, hint }: EmptyProps) {
  return (
    <div className="rounded-2xl border border-dashed border-outline-variant bg-surface-container-low/40 px-6 py-7 flex flex-col items-center gap-1 text-center">
      <p className="font-body-md text-body-md text-on-surface-variant">{text}</p>
      {hint && (
        <p className="font-body-sm text-body-sm text-on-surface-variant/80 max-w-md">{hint}</p>
      )}
    </div>
  );
}

interface TooltipProps {
  x: number;
  y: number;
  /** Render under the anchor instead of above it (near the top of the screen). */
  below?: boolean;
  children: ReactNode;
}

/** Fixed-position readout shared by the chart and the heatmaps. */
export function Tooltip({ x, y, below = false, children }: TooltipProps) {
  return (
    <div
      className={`fixed z-50 -translate-x-1/2 pointer-events-none ${below ? 'translate-y-2' : '-translate-y-full pb-2'}`}
      style={{ left: x, top: y }}
    >
      <div className="px-3 py-2 rounded bg-inverse-surface text-inverse-on-surface shadow-elev-3">
        {children}
      </div>
    </div>
  );
}

/** Anchor a tooltip to the element the pointer is on, flipping near the top. */
export function anchorOf(target: HTMLElement): { x: number; y: number; below: boolean } {
  const rect = target.getBoundingClientRect();
  const below = rect.top < 120;
  return {
    x: rect.left + rect.width / 2,
    y: below ? rect.bottom : rect.top,
    below,
  };
}
