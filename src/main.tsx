import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import './styles/themes.css'
import App from './App.tsx'

// Apply the persisted theme before first paint to avoid a flash.
try {
  const stored = localStorage.getItem('ideario-theme');
  if (stored === 'light') {
    document.documentElement.setAttribute('data-theme', 'light');
  }
} catch {
  // Ignore localStorage errors
}

// Register the offline app-shell service worker (production only —
// in dev it would fight HMR).
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch((error) => {
      console.warn('Service worker registration failed:', error);
    });
  });
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
