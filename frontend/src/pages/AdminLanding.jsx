import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import PWAInstallBanner from '../components/PWAInstallBanner';

export default function AdminLanding() {
  const navigate  = useNavigate();
  const [loggedIn, setLoggedIn] = useState(false);
  const [userId,   setUserId]   = useState('');

  useEffect(() => {
    document.title = 'Sage Admin';
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

  const handleLogin = (e) => {
    e.preventDefault();
    const id = userId.trim();
    if (id) navigate(`/admin/${id}`);
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-green-800 to-green-950 flex flex-col select-none">

      <PWAInstallBanner manifest="/admin-manifest.json" />

      <div className="flex-1 flex flex-col items-center justify-center px-6 py-10 text-center">

        {/* Logo */}
        <div className="w-20 h-20 rounded-2xl bg-white/15 border-2 border-white/30 flex items-center justify-center mb-5 shadow-2xl">
          <span className="text-4xl font-black text-white">S</span>
        </div>
        <h1 className="text-white text-3xl font-black leading-tight mb-1">Sage Admin</h1>
        <p className="text-green-300 text-sm mb-8">Staff management dashboard</p>

        {loggedIn ? (
          /* Already logged in */
          <button
            onClick={() => navigate('/admin-dashboard')}
            className="w-full max-w-xs bg-white text-green-800 font-black text-lg py-4 rounded-2xl shadow-2xl hover:bg-green-50 active:scale-95 transition-all mb-6"
          >
            Open Dashboard →
          </button>
        ) : (
          /* Login form */
          <form onSubmit={handleLogin} className="w-full max-w-sm mb-6 space-y-3">
            <p className="text-white font-bold text-sm mb-3">Enter your Staff ID to continue</p>
            <input
              type="text"
              value={userId}
              onChange={e => setUserId(e.target.value)}
              placeholder="Your Staff ID"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              className="w-full px-4 py-4 rounded-2xl bg-white/15 border border-white/30 text-white placeholder-white/40 text-base outline-none focus:border-white/60 focus:bg-white/20 transition-all"
            />
            <button
              type="submit"
              disabled={!userId.trim()}
              className="w-full bg-white text-green-800 font-black text-lg py-4 rounded-2xl shadow-2xl hover:bg-green-50 active:scale-95 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
            >
              Continue →
            </button>
          </form>
        )}

        {/* iOS tip */}
        <div className="bg-amber-500/15 border border-amber-400/30 rounded-xl px-4 py-3 w-full max-w-sm text-left">
          <p className="text-amber-200 text-xs font-semibold mb-1">📱 Installing on iPhone?</p>
          <p className="text-amber-100/80 text-xs">
            Tap <strong className="text-amber-200">Share ⬆️ → Add to Home Screen</strong> while on this page.
          </p>
        </div>

        <p className="text-green-400/50 text-xs mt-6 max-w-xs">
          Don't have your ID? Contact your Sage Energy manager.
        </p>
      </div>
    </div>
  );
}
