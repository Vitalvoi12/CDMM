import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App'
import { initTheme } from './hooks/useTheme'
import { backfillSubjects } from './services/repositories'
import { registerNotificationWorker } from './services/notifications'
import { installKeyboardInset } from './services/keyboardInset'
import { getToken, getUsername } from './services/auth'
import { nativeSetSession } from './services/nativeBridge'

initTheme()

// Reveal icons once their font is in (see index.css). fonts.load() returns an
// empty list while the @font-face rule itself is still downloading, so retry.
function revealIcons() {
  const ready = () => document.documentElement.classList.add('icons-ready')
  if (!document.fonts) return ready()
  const attempt = () =>
    document.fonts
      .load('24px "Material Symbols Outlined"')
      .then((faces) => (faces.length > 0 ? ready() : setTimeout(attempt, 200)))
      .catch(() => setTimeout(attempt, 1000))
  attempt()
}
revealIcons()

// iOS Safari/PWA ignores user-scalable=no, so block zoom gestures directly:
// the proprietary gesture events (pinch) and multi-finger touchmoves.
for (const type of ['gesturestart', 'gesturechange', 'gestureend']) {
  document.addEventListener(type, (e) => e.preventDefault(), { passive: false })
}
document.addEventListener(
  'touchmove',
  (e) => {
    if (e.touches.length > 1) e.preventDefault()
  },
  { passive: false },
)

// A session from before the Android app was installed (or updated) reaches
// the native side too, so widgets and the watch sign in with it.
{
  const token = getToken()
  if (token) nativeSetSession(token, getUsername() ?? '')
}

// Re-push local subjects that never reached the server (one-time).
backfillSubjects()
// Overlay windows stay above the on-screen keyboard.
installKeyboardInset()
// Service worker for event reminder notifications.
registerNotificationWorker()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
