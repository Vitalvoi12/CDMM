import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App'
import { initTheme } from './hooks/useTheme'
import { backfillEventChecklists, backfillSubjects } from './services/repositories'

initTheme()

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

// Re-push locally kept checklists dropped by pre-column servers (one-time).
backfillEventChecklists()
// Re-push local subjects that never reached the server (one-time).
backfillSubjects()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
