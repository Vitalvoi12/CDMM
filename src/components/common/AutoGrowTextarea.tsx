import { forwardRef, useCallback, useLayoutEffect, useRef, type TextareaHTMLAttributes } from 'react';

type AutoGrowTextareaProps = TextareaHTMLAttributes<HTMLTextAreaElement> & {
  /**
   * Let Enter insert a line break (notes, descriptions). Otherwise the field
   * acts like a one-line <input> that wraps: Enter submits its form and
   * pasted line breaks become spaces.
   */
  multiline?: boolean;
};

/**
 * A text field that grows in height to fit everything typed into it, so long
 * text wraps onto new lines instead of scrolling sideways out of view.
 */
export const AutoGrowTextarea = forwardRef<HTMLTextAreaElement, AutoGrowTextareaProps>(function AutoGrowTextarea(
  { multiline = false, rows = 1, onKeyDown, onChange, className = '', ...rest },
  ref
) {
  const own = useRef<HTMLTextAreaElement | null>(null);
  const setRef = useCallback(
    (el: HTMLTextAreaElement | null) => {
      own.current = el;
      if (typeof ref === 'function') ref(el);
      else if (ref) ref.current = el;
    },
    [ref]
  );

  const fit = useCallback(() => {
    const el = own.current;
    if (!el) return;
    // Collapsing to 'auto' can shorten a scroll pane for a moment and make it
    // clamp its scroll position; restore it after measuring.
    const panes: [Element, number][] = [];
    for (let p = el.parentElement; p; p = p.parentElement) if (p.scrollTop) panes.push([p, p.scrollTop]);
    el.style.height = 'auto';
    const cs = getComputedStyle(el);
    const border = parseFloat(cs.borderTopWidth) + parseFloat(cs.borderBottomWidth);
    el.style.height = `${el.scrollHeight + border}px`;
    for (const [p, top] of panes) p.scrollTop = top;
  }, []);

  useLayoutEffect(fit, [fit, rest.value]);

  // A wider or narrower field re-wraps its text.
  useLayoutEffect(() => {
    const el = own.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    let width = el.clientWidth;
    const ro = new ResizeObserver(() => {
      if (el.clientWidth === width) return;
      width = el.clientWidth;
      fit();
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [fit]);

  return (
    <textarea
      ref={setRef}
      rows={rows}
      className={`resize-none overflow-hidden ${className}`}
      onKeyDown={(e) => {
        onKeyDown?.(e);
        if (e.defaultPrevented || multiline || e.key !== 'Enter' || e.nativeEvent.isComposing) return;
        e.preventDefault();
        // Ctrl/Cmd+Enter is left to the form's own handlers.
        if (!e.ctrlKey && !e.metaKey && !e.altKey) e.currentTarget.form?.requestSubmit();
      }}
      onChange={(e) => {
        if (!multiline && /[\r\n]/.test(e.target.value)) e.target.value = e.target.value.replace(/\s*[\r\n]+\s*/g, ' ');
        onChange?.(e);
      }}
      {...rest}
    />
  );
});
