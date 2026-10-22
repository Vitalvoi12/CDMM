import { useEffect, useRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { useEscapeOverlay } from '../../services/overlays';
import { useSheetExit } from '../../hooks/useSheetExit';
import { useSheetDrag } from '../../hooks/useSheetDrag';

interface SheetProps {
  /** Accessible name of the dialog. */
  label: string;
  onClose: () => void;
  children: ReactNode;
  /** Stacking: later sheets (e.g. a picker over a form) go higher. */
  z?: number;
  /** Extra content above the sheet, e.g. a toast pinned to the top. */
  above?: ReactNode;
  /** Focus the sheet itself on open (off when a field autofocuses). */
  focusSelf?: boolean;
  className?: string;
  /** Fill the screen down from the top (tall forms) instead of hugging content. */
  tall?: boolean;
  role?: 'dialog' | 'alertdialog';
}

/**
 * Phone bottom sheet: scrim, grab bar, slides up from the bottom. Escape, a
 * tap on the scrim or a pull down (useSheetDrag) closes it; closing slides it
 * back down (useSheetExit). Portalled to body so
 * an animated page ancestor cannot re-anchor it. Sits in `.overlay-root`, so
 * it stays above the on-screen keyboard.
 */
export function Sheet({ label, onClose, children, z = 100, above, focusSelf = true, className = '', tall = false, role = 'dialog' }: SheetProps) {
  const ref = useRef<HTMLDivElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const scrimRef = useRef<HTMLDivElement>(null);
  useEscapeOverlay(onClose);
  useSheetExit(rootRef, ref);
  useSheetDrag(ref, onClose, scrimRef);

  useEffect(() => {
    if (focusSelf) ref.current?.focus({ preventScroll: true });
  }, [focusSelf]);

  return createPortal(
    <div
      ref={rootRef}
      className="overlay-root"
      style={{ zIndex: z }}
      // React bubbles portal events to the page behind: keep its day swipe
      // and double tap from seeing touches made in the sheet.
      onTouchStart={(e) => e.stopPropagation()}
      onTouchMove={(e) => e.stopPropagation()}
      onTouchEnd={(e) => e.stopPropagation()}
      onTouchCancel={(e) => e.stopPropagation()}
    >
      <div ref={scrimRef} className="m-scrim animate-fade-in" onClick={onClose} />
      {above}
      <div
        ref={ref}
        role={role}
        aria-modal="true"
        aria-label={label}
        tabIndex={-1}
        className={`m-sheet animate-slide-up ${className}`}
        style={tall ? { top: 24 } : undefined}
      >
        <div className="flex-none [touch-action:none]" style={{ margin: '-8px -16px 0', padding: '8px 0 6px' }}>
          <div className="m-grab" />
        </div>
        {children}
      </div>
    </div>,
    document.body
  );
}
