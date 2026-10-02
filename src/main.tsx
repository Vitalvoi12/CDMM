import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App'
import { initTheme } from './hooks/useTheme'
import { backfillEventChecklists } from './services/repositories'

initTheme()
// Re-push locally kept checklists dropped by pre-column servers (one-time).
backfillEventChecklists()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
