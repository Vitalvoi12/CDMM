import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App'
import { initTheme } from './hooks/useTheme'
import { backfillEventChecklists, backfillSubjects } from './services/repositories'

initTheme()
// Re-push locally kept checklists dropped by pre-column servers (one-time).
backfillEventChecklists()
// Re-push local subjects that never reached the server (one-time).
backfillSubjects()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
