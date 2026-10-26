import { useState, type ReactNode } from 'react';

interface ExpandRowProps {
  icon: string;
  /** What the field is set to, or a prompt when it is empty. */
  text: string;
  /** Muted text: nothing set yet. */
  empty?: boolean;
  /** Icon at the right while closed (default expand_more). */
  closedIcon?: string;
  /** Open from the start (e.g. when the field already has an error). */
  defaultOpen?: boolean;
  children: ReactNode;
}

/**
 * A phone form field folded into one row (icon, current value, chevron);
 * a tap unfolds the full controls under it. Keeps long editors short.
 */
export function ExpandRow({ icon, text, empty = false, closedIcon = 'expand_more', defaultOpen = false, children }: ExpandRowProps) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="m-fld">
      <button type="button" className="m-in justify-between text-left" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
        <span className="flex items-center min-w-0" style={{ gap: 10 }}>
          <span className="material-symbols-outlined m-ic s m-mut">{icon}</span>
          <span className={`m-tr ${empty ? 'm-mut' : ''}`}>{text}</span>
        </span>
        <span className="material-symbols-outlined m-ic s m-mut">{open ? 'expand_less' : closedIcon}</span>
      </button>
      {open && children}
    </div>
  );
}
