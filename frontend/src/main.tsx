import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { API_BASE_URL } from './services/api'
import { installActivityTracking } from './services/activity'

// Loading bar, "Memproses…" indicator and success/error toasts for every API call.
installActivityTracking(API_BASE_URL)

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
