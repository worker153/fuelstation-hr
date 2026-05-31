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
        // Force an immediate update check every page load
        reg.update().catch(() => {});

        reg.addEventListener('updatefound', () => {
          const newWorker = reg.installing;
          if (!newWorker) return;

          newWorker.addEventListener('statechange', () => {
            if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
              // New version ready — show a visible banner instead of silent reload
              showUpdateBanner(newWorker);
            }
          });
        });
      })
      .catch(() => {});

    // Also handle the case where the SW controller changes (after skipWaiting)
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      window.location.reload();
    });
  });
}

function showUpdateBanner(newWorker) {
  // Remove any existing banner
  document.getElementById('sw-update-banner')?.remove();

  const banner = document.createElement('div');
  banner.id = 'sw-update-banner';
  banner.style.cssText = [
    'position:fixed', 'bottom:0', 'left:0', 'right:0', 'z-index:99999',
    'background:#1e293b', 'color:#fff',
    'display:flex', 'align-items:center', 'justify-content:space-between',
    'padding:14px 20px', 'gap:12px',
    'font-family:system-ui,sans-serif', 'font-size:14px',
    'box-shadow:0 -2px 12px rgba(0,0,0,0.4)',
  ].join(';');

  banner.innerHTML = `
    <span>🔄 A new version is available</span>
    <button id="sw-update-btn" style="
      background:#3b82f6; color:#fff; border:none; border-radius:6px;
      padding:8px 18px; font-size:14px; font-weight:600; cursor:pointer;
      white-space:nowrap;
    ">Update Now</button>
  `;

  document.body.appendChild(banner);

  document.getElementById('sw-update-btn').addEventListener('click', () => {
    newWorker.postMessage('SKIP_WAITING');
    banner.remove();
  });
}
