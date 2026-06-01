/**
 * AdminLanding — /admin
 *
 * Entry point for the Admin PWA.
 * - If adminToken is in localStorage → redirect straight to /admin-dashboard
 * - If adminUser is saved (has userId but token expired) → also redirect; dashboard
 *   will show the embedded PIN re-auth screen
 * - Otherwise → show a branded landing with PWA install banner + instructions
 */
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import PWAInstallBanner from '../components/PWAInstallBanner';

export default function AdminLanding() {
  const navigate    = useNavigate();
  const [ready, setReady] = useState(false);

  useEffect(() => {
    // If we have a token OR a saved user (expired session) → go straight to dashboard
    const token = localStorage.getItem('adminToken');
    const user  = localStorage.getItem('adminUser');
    if (token || user) {
      navigate('/admin-dashboard', { replace: true });
    } else {
      setReady(true);
    }
  }, [navigate]);

  if (!ready) return null;   // brief flash while redirecting

  return (
    <div className="min-h-screen bg-gradient-to-b from-green-800 to-green-950 flex flex-col select-none">

      {/* PWA install banner at the very top */}
      <PWAInstallBanner manifest="/admin-manifest.json" />

      {/* Centered content */}
      <div className="flex-1 flex flex-col items-center justify-center px-6 py-10 text-center">

        {/* Logo / brand */}
        <div className="w-20 h-20 rounded-2xl bg-white/15 border-2 border-white/30 flex items-center justify-center mb-5 shadow-2xl">
          <span className="text-4xl font-black text-white">S</span>
        </div>
        <h1 className="text-white text-3xl font-black leading-tight mb-1">Sage Admin</h1>
        <p className="text-green-300 text-sm mb-10">Staff management dashboard</p>

        {/* Instructions card */}
        <div className="bg-white/10 border border-white/20 rounded-2xl px-6 py-5 w-full max-w-sm text-left space-y-4">
          <p className="text-white font-bold text-sm text-center mb-1">How to log in</p>

          <div className="flex items-start gap-3">
            <span className="w-6 h-6 rounded-full bg-green-500/30 border border-green-400/50 flex items-center justify-center text-green-200 text-xs font-bold shrink-0">1</span>
            <p className="text-green-100 text-sm">Open the personal admin link your manager sent you —<br/>
              <span className="font-mono text-xs text-green-300 break-all">…/admin/<em>your-id</em></span>
            </p>
          </div>

          <div className="flex items-start gap-3">
            <span className="w-6 h-6 rounded-full bg-green-500/30 border border-green-400/50 flex items-center justify-center text-green-200 text-xs font-bold shrink-0">2</span>
            <p className="text-green-100 text-sm">Enter your 4-digit PIN to sign in</p>
          </div>

          <div className="flex items-start gap-3">
            <span className="w-6 h-6 rounded-full bg-green-500/30 border border-green-400/50 flex items-center justify-center text-green-200 text-xs font-bold shrink-0">3</span>
            <p className="text-green-100 text-sm">Once signed in, tap <strong className="text-white">"Install as App"</strong> at the top of the dashboard to save it to your home screen</p>
          </div>
        </div>

        <p className="text-green-400/50 text-xs mt-8 max-w-xs">
          Don't have your link? Contact your Sage Energy manager.
        </p>
      </div>
    </div>
  );
}
