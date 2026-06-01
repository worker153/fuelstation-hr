/**
 * AdminPinLogin — /admin/:userId
 * Large-button PIN pad. Works for supervisors, managers, any admin.
 * On success stores token + user in localStorage → redirects to /admin-dashboard.
 * (localStorage so the PWA stays logged in across sessions)
 */
import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import axios from 'axios';
import PWAInstallBanner from '../components/PWAInstallBanner';

const API = import.meta.env.VITE_API_URL || '/api';

export default function AdminPinLogin() {
  const { userId } = useParams();
  const navigate   = useNavigate();

  const [hint,    setHint   ] = useState(null);   // { name, role, companyName, hasPin }
  const [pin,     setPin    ] = useState('');
  const [error,   setError  ] = useState('');
  const [loading, setLoading] = useState(false);
  const [fetching,setFetching] = useState(true);

  // Set page title for iOS PWA shortcut name
  useEffect(() => {
    document.title = 'Sage Admin';
    let meta = document.querySelector('meta[name="apple-mobile-web-app-title"]');
    if (!meta) { meta = document.createElement('meta'); meta.name = 'apple-mobile-web-app-title'; document.head.appendChild(meta); }
    const prev = meta.content;
    meta.content = 'Sage Admin';
    return () => { document.title = 'FuelStation HR — Worker Management'; meta.content = prev; };
  }, []);

  // Load user hint (name, company) — public endpoint
  useEffect(() => {
    if (!userId) return;
    axios.get(`${API}/auth/admin-hint/${userId}`)
      .then(r  => setHint(r.data.data))
      .catch(() => setError('Link not valid — contact your manager.'))
      .finally(() => setFetching(false));
  }, [userId]);

  // Auto-submit when 4 digits are entered
  useEffect(() => {
    if (pin.length === 4) handleLogin(pin);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pin]);

  const press = (digit) => {
    setError('');
    setPin(p => p.length < 4 ? p + digit : p);
  };

  const del = () => {
    setError('');
    setPin(p => p.slice(0, -1));
  };

  const handleLogin = async (enteredPin) => {
    setLoading(true);
    setError('');
    try {
      const { data } = await axios.post(`${API}/auth/pin-login`, { userId, pin: enteredPin });
      localStorage.setItem('adminToken', data.token);
      localStorage.setItem('adminUser',  JSON.stringify(data.user));
      navigate('/admin-dashboard', { replace: true });
    } catch (err) {
      setError(err.response?.data?.message || 'Wrong PIN');
      setPin('');
    } finally {
      setLoading(false);
    }
  };

  const roleLabel = (r) => ({
    super_admin:          'Super Admin',
    admin:                'Admin',
    supervisor:           'Supervisor',
    record_supervisor:    'Record Supervisor',
    verification_officer: 'Verification Officer',
    hr_staff:             'HR Staff',
  }[r] || r);

  // ── Render ────────────────────────────────────────────────────────────────
  if (fetching) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-green-800 to-green-950 flex items-center justify-center">
        <div className="w-10 h-10 rounded-full border-4 border-white/30 border-t-white animate-spin" />
      </div>
    );
  }

  if (!hint && error) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-green-800 to-green-950 flex items-center justify-center p-6">
        <div className="bg-white rounded-2xl p-8 text-center max-w-sm w-full shadow-2xl">
          <div className="text-4xl mb-3">❌</div>
          <p className="text-gray-700 font-medium">{error}</p>
        </div>
      </div>
    );
  }

  const PAD = [
    ['1','2','3'],
    ['4','5','6'],
    ['7','8','9'],
    ['del','0','ok'],
  ];

  return (
    <div className="min-h-screen bg-gradient-to-b from-green-800 to-green-950 flex flex-col select-none">
      <PWAInstallBanner manifest="/admin-manifest.json" />
    <div className="flex-1 flex flex-col items-center justify-center px-4 py-10">

      {/* Company + name */}
      <div className="text-center mb-8">
        <div className="w-20 h-20 rounded-full bg-white/20 border-4 border-white/40 flex items-center justify-center mx-auto mb-4">
          <span className="text-3xl font-black text-white">
            {hint?.companyName?.[0]?.toUpperCase() || '⛽'}
          </span>
        </div>
        <p className="text-green-200 text-sm font-medium uppercase tracking-widest mb-1">
          {hint?.companyName}
        </p>
        <h1 className="text-white text-3xl font-black leading-tight">{hint?.name}</h1>
        <p className="text-green-300 text-sm mt-1">{roleLabel(hint?.role)}</p>

        {!hint?.hasPin && (
          <div className="mt-3 bg-amber-500/20 border border-amber-400/40 rounded-xl px-4 py-2">
            <p className="text-amber-200 text-xs font-medium">
              ⚠️ No PIN set yet — ask your manager to set one for you
            </p>
          </div>
        )}
      </div>

      {/* PIN dots */}
      <div className="flex gap-4 mb-8">
        {[0,1,2,3].map(i => (
          <div key={i}
            className={`w-5 h-5 rounded-full border-2 border-white/60 transition-all duration-150
              ${i < pin.length ? 'bg-white scale-110' : 'bg-transparent'}`}
          />
        ))}
      </div>

      {/* Error */}
      {error && (
        <div className="mb-5 bg-red-500/20 border border-red-400/40 rounded-xl px-5 py-2.5 text-center">
          <p className="text-red-200 font-semibold text-sm">{error}</p>
        </div>
      )}

      {/* Loading spinner */}
      {loading && (
        <div className="mb-5">
          <div className="w-7 h-7 rounded-full border-3 border-white/30 border-t-white animate-spin mx-auto" style={{ borderWidth: 3 }} />
        </div>
      )}

      {/* PIN Pad */}
      <div className="grid grid-cols-3 gap-3 w-full max-w-xs">
        {PAD.flat().map((key) => {
          if (key === 'del') return (
            <button key="del" onPointerDown={del}
              className="h-16 rounded-2xl bg-white/10 hover:bg-white/20 active:bg-white/30 border border-white/20
                         flex items-center justify-center text-white text-2xl font-bold transition-all active:scale-95"
            >⌫</button>
          );
          if (key === 'ok') return (
            <button key="ok" onPointerDown={() => pin.length === 4 ? handleLogin(pin) : null}
              disabled={pin.length !== 4 || loading}
              className={`h-16 rounded-2xl border flex items-center justify-center text-xl font-bold transition-all active:scale-95
                ${pin.length === 4
                  ? 'bg-white text-green-800 hover:bg-green-50 border-white shadow-lg'
                  : 'bg-white/10 border-white/20 text-white/40'}`}
            >✓</button>
          );
          return (
            <button key={key} onPointerDown={() => press(key)}
              disabled={loading}
              className="h-16 rounded-2xl bg-white/15 hover:bg-white/25 active:bg-white/35 border border-white/20
                         flex items-center justify-center text-white text-2xl font-bold transition-all active:scale-95"
            >{key}</button>
          );
        })}
      </div>

      <p className="text-green-400/60 text-xs mt-10 text-center">
        Forgot PIN? Contact your manager
      </p>
    </div>
    </div>
  );
}
