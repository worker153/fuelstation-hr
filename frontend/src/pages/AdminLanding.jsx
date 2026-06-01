/**
 * AdminLanding — /admin
 *
 * Stable entry point for the Admin PWA.
 * - Shows install banner + "Open Dashboard" button
 * - Does NOT auto-redirect so iOS "Add to Home Screen" saves /admin as the URL
 * - Dynamically sets page title to "Sage Admin" for the iOS home screen shortcut name
 */
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import PWAInstallBanner from '../components/PWAInstallBanner';

export default function AdminLanding() {
  const navigate   = useNavigate();
  const [loggedIn, setLoggedIn] = useState(false);

  useEffect(() => {
    // Set page title — iOS uses this as the default app name for Add to Home Screen
    document.title = 'Sage Admin';
    // Swap apple-mobile-web-app-title meta tag too
    let meta = document.querySelector('meta[name="apple-mobile-web-app-title"]');
    if (!meta) {
      meta = document.createElement('meta');
      meta.name = 'apple-mobile-web-app-title';
      document.head.appendChild(meta);
    }
    const prev = meta.content;
    meta.content = 'Sage Admin';

    setLoggedIn(!!(localStorage.getItem('adminToken') || localStorage.getItem('adminUser')));

    return () => {
      document.title = 'FuelStation HR — Worker Management';
      meta.content = prev;
    };
  }, []);

  return (
    <div className="min-h-screen bg-gradient-to-b from-green-800 to-green-950 flex flex-col select-none">

      {/* PWA install banner */}
      <PWAInstallBanner manifest="/admin-manifest.json" />

      {/* Centered content */}
      <div className="flex-1 flex flex-col items-center justify-center px-6 py-10 text-center">

        {/* Logo */}
        <div className="w-20 h-20 rounded-2xl bg-white/15 border-2 border-white/30 flex items-center justify-center mb-5 shadow-2xl">
          <span className="text-4xl font-black text-white">S</span>
        </div>
        <h1 className="text-white text-3xl font-black leading-tight mb-1">Sage Admin</h1>
        <p className="text-green-300 text-sm mb-8">Staff management dashboard</p>

        {/* CTA */}
        {loggedIn ? (
          <button
            onClick={() => navigate('/admin-dashboard')}
            className="w-full max-w-xs bg-white text-green-800 font-black text-lg py-4 rounded-2xl shadow-2xl hover:bg-green-50 active:scale-95 transition-all mb-6"
          >
            Open Dashboard →
          </button>
        ) : (
          <div className="bg-white/10 border border-white/20 rounded-2xl px-6 py-5 w-full max-w-sm text-left space-y-4 mb-6">
            <p className="text-white font-bold text-sm text-center mb-1">How to log in</p>

            <div className="flex items-start gap-3">
              <span className="w-6 h-6 rounded-full bg-green-500/30 border border-green-400/50 flex items-center justify-center text-green-200 text-xs font-bold shrink-0">1</span>
              <p className="text-green-100 text-sm">Open the personal admin link your manager sent you<br/>
                <span className="font-mono text-xs text-green-300">…/admin/<em>your-id</em></span>
              </p>
            </div>

            <div className="flex items-start gap-3">
              <span className="w-6 h-6 rounded-full bg-green-500/30 border border-green-400/50 flex items-center justify-center text-green-200 text-xs font-bold shrink-0">2</span>
              <p className="text-green-100 text-sm">Enter your 4-digit PIN to sign in</p>
            </div>

            <div className="flex items-start gap-3">
              <span className="w-6 h-6 rounded-full bg-green-500/30 border border-green-400/50 flex items-center justify-center text-green-200 text-xs font-bold shrink-0">3</span>
              <p className="text-green-100 text-sm">Come back here and tap <strong className="text-white">"Install as App"</strong> at the top</p>
            </div>
          </div>
        )}

        {/* iOS tip */}
        <div className="bg-amber-500/15 border border-amber-400/30 rounded-xl px-4 py-3 w-full max-w-sm text-left">
          <p className="text-amber-200 text-xs font-semibold mb-1">📱 Installing on iPhone?</p>
          <p className="text-amber-100/80 text-xs">
            Make sure the URL bar shows <span className="font-mono font-bold text-white">/admin</span> — not the root URL. Tap Share → Add to Home Screen while on this page.
          </p>
        </div>

        <p className="text-green-400/50 text-xs mt-6 max-w-xs">
          Don't have your link? Contact your Sage Energy manager.
        </p>
      </div>
    </div>
  );
}
