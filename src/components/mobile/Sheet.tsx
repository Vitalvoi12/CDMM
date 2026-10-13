import { useEffect, useRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { useEscapeOverlay } from '../../services/overlays';
import { useSheetExit } from '../../hooks/useSheetExit';

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
 * Phone bottom sheet: scrim, grab bar, slides up from the nav. Escape, a tap
 * on the scrim or a pull down on the grab bar closes it; closing fades it
 * out (useSheetExit). Portalled to body so
 * an animated page ancestor cannot re-anchor it. Sits in `.overlay-root`, so
 * it stays above the on-screen keyboard.
 */
export function Sheet({ label, onClose, children, z = 100, above, focusSelf = true, className = '', tall = false, role = 'dialog' }: SheetProps) {
  const ref = useRef<HTMLDivElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const pull = useRef<{ y: number; dy: number } | null>(null);
  useEscapeOverlay(onClose);
  useSheetExit(rootRef, ref);

  useEffect(() => {
    if (focusSelf) ref.current?.focus({ preventScroll: true });
  }, [focusSelf]);

  // Pull-to-close on the grab bar: the sheet follows the finger down and
  // closes past 80px (the exit fade starts from there), otherwise springs
  // back.
  const onTouchStart = (e: React.TouchEvent) => {
    pull.current = { y: e.touches[0].clientY, dy: 0 };
  };
  const onTouchMove = (e: React.TouchEvent) => {
    const p = pull.current;
    const el = ref.current;
    if (!p || !el) return;
    p.dy = Math.max(0, e.touches[0].clientY - p.y);
    el.style.transition = 'none';
    el.style.transform = `translateY(${p.dy}px)`;
  };
  const onTouchEnd = () => {
    const p = pull.current;
    const el = ref.current;
    pull.current = null;
    if (!p || !el) return;
    if (p.dy > 80) {
      onClose();
      return;
    }
    el.style.transition = 'transform 180ms ease-out';
    el.style.transform = '';
  };

  return createPortal(
    <div
      ref={rootRef}
      className="overlay-root animate-fade-in"
      style={{ zIndex: z }}
      // React bubbles portal events to the page behind: keep its day swipe
      // and double tap from seeing touches made in the sheet.
      onTouchStart={(e) => e.stopPropagation()}
      onTouchMove={(e) => e.stopPropagation()}
      onTouchEnd={(e) => e.stopPropagation()}
      onTouchCancel={(e) => e.stopPropagation()}
    >
      <div className="m-scrim" onClick={onClose} />
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
        <div
          className="flex-none [touch-action:none]"
          style={{ margin: '-8px -16px 0', padding: '8px 0 6px' }}
          onTouchStart={onTouchStart}
          onTouchMove={onTouchMove}
          onTouchEnd={onTouchEnd}
          onTouchCancel={onTouchEnd}
        >
          <div className="m-grab" />
        </div>
        {children}
      </div>
    </div>,
    document.body
  );
}
