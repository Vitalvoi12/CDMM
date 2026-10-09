/**
 * Keeps overlay windows clear of the on-screen keyboard.
 *
 * On phones the keyboard shrinks the visual viewport but not the layout
 * viewport that `position: fixed; inset: 0` measures against, so a centered
 * window ends up behind the keyboard. This mirrors the visible area into two
 * CSS variables, and `.overlay-root` (index.css) sizes every window's backdrop
 * to that area: windows center above the keyboard and move up as it opens.
 * Without visualViewport support the variables stay unset and overlays fall
 * back to the full screen.
 */
export function installKeyboardInset(): void {
  const vv = window.visualViewport;
  if (!vv) return;
  const root = document.documentElement;
  let frame = 0;

  const update = () => {
    frame = 0;
    root.style.setProperty('--vv-top', `${vv.offsetTop}px`);
    root.style.setProperty('--vv-height', `${vv.height}px`);
    // The window just got shorter: keep the field being typed in on screen
    // (a tall form scrolls inside its card).
    const el = document.activeElement;
    if (el instanceof HTMLElement && el.closest('.overlay-root') && el.matches('input, textarea, [contenteditable]')) {
      el.scrollIntoView({ block: 'nearest' });
    }
  };
  const schedule = () => {
    if (!frame) frame = requestAnimationFrame(update);
  };

  vv.addEventListener('resize', schedule);
  vv.addEventListener('scroll', schedule);
  update();
}
