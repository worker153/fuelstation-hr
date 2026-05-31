import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.jsx';
import './index.css';

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);

// ── Register Service Worker (enables PWA install + offline) ───────────────────
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js')
      .then(reg => {
        reg.addEventListener('updatefound', () => {
          const newWorker = reg.installing;
          newWorker?.addEventListener('statechange', () => {
            // New SW installed → skip waiting so it activates immediately
            if (newWorker.state === 'installed') {
              newWorker.postMessage('SKIP_WAITING');
            }
            // New SW activated → reload the page so fresh JS is loaded
            if (newWorker.state === 'activated') {
              window.location.reload();
            }
          });
        });
      })
      .catch(() => {});
  });
}
