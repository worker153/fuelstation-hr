import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Shield, Eye, EyeOff, Globe, Lock, BarChart3, Building2 } from 'lucide-react';
import { usePlatformAuth } from '../../context/PlatformAuthContext';
import { useNotify } from '../../context/NotificationContext';

const FEATURES = [
  { icon: Building2, text: 'Approve and manage company registrations' },
  { icon: BarChart3,  text: 'Monitor subscriptions across all tenants'  },
  { icon: Globe,      text: 'Activate, suspend or extend any account'   },
  { icon: Lock,       text: 'Isolated from all company data'             },
];

export default function PlatformLogin() {
  const [form,    setForm]    = useState({ email: '', password: '' });
  const [showPwd, setShowPwd] = useState(false);
  const [loading, setLoading] = useState(false);
  const { login }  = usePlatformAuth();
  const notify     = useNotify();
  const navigate   = useNavigate();

  const set = (k) => (e) => setForm(f => ({ ...f, [k]: e.target.value }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      await login(form.email, form.password);
      navigate('/platform', { replace: true });
    } catch (err) {
      notify(err.response?.data?.message || err.message || 'Login failed', 'error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex">

      {/* ── Left brand panel ──────────────────────────────────────────────────── */}
      <div
        className="hidden lg:flex lg:w-1/2 flex-col justify-between p-12 relative overflow-hidden"
        style={{ background: 'linear-gradient(145deg, #1e1b4b 0%, #312e81 45%, #3730a3 100%)' }}
      >
        <div className="absolute -top-24 -left-24 w-96 h-96 rounded-full opacity-10"
          style={{ background: 'radial-gradient(circle, #a5b4fc, transparent)' }} />
        <div className="absolute -bottom-32 -right-16 w-[28rem] h-[28rem] rounded-full opacity-10"
          style={{ background: 'radial-gradient(circle, #c7d2fe, transparent)' }} />

        <div className="relative z-10">
          <div className="flex items-center gap-3 mb-16">
            <div className="bg-white/15 backdrop-blur rounded-2xl p-3">
              <Shield size={28} className="text-white" />
            </div>
            <div>
              <p className="text-white font-bold text-xl leading-tight">FuelStation HR</p>
              <p className="text-indigo-300 text-sm">Platform Administration</p>
            </div>
          </div>

          <h2 className="text-4xl font-bold text-white leading-snug mb-4">
            Platform Admin<br />Control Centre
          </h2>
          <p className="text-indigo-200 text-base leading-relaxed mb-12">
            Manage all companies, subscriptions, and approvals
            from a single secure portal.
          </p>

          <div className="space-y-4">
            {FEATURES.map(({ icon: Icon, text }) => (
              <div key={text} className="flex items-center gap-3">
                <div className="bg-white/15 rounded-full p-1.5 shrink-0">
                  <Icon size={14} className="text-indigo-200" />
                </div>
                <span className="text-indigo-100 text-sm">{text}</span>
              </div>
            ))}
          </div>
        </div>

        <p className="relative z-10 text-indigo-400 text-xs">
          © {new Date().getFullYear()} FuelStation HR — Platform Console
        </p>
      </div>

      {/* ── Right form panel ──────────────────────────────────────────────────── */}
      <div className="flex-1 flex items-center justify-center px-6 py-12 bg-gray-50">
        <div className="w-full max-w-md">

          {/* Mobile logo */}
          <div className="lg:hidden flex items-center gap-3 mb-10">
            <div className="bg-indigo-700 rounded-2xl p-2.5">
              <Shield size={22} className="text-white" />
            </div>
            <div>
              <p className="font-bold text-gray-900 text-lg leading-tight">Platform Admin</p>
              <p className="text-gray-400 text-xs">FuelStation HR</p>
            </div>
          </div>

          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-8">
            <h1 className="text-2xl font-bold text-gray-900 mb-1">Admin Sign In</h1>
            <p className="text-gray-400 text-sm mb-8">Platform administrators only</p>

            <form onSubmit={handleSubmit} className="space-y-5">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">
                  Email address
                </label>
                <input
                  type="email"
                  className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm
                             focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent
                             placeholder-gray-400 bg-gray-50"
                  placeholder="admin@platform.com"
                  value={form.email}
                  onChange={set('email')}
                  required
                  autoComplete="email"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">
                  Password
                </label>
                <div className="relative">
                  <input
                    type={showPwd ? 'text' : 'password'}
                    className="w-full border border-gray-200 rounded-xl px-4 py-2.5 pr-11 text-sm
                               focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent
                               placeholder-gray-400 bg-gray-50"
                    placeholder="Your password"
                    value={form.password}
                    onChange={set('password')}
                    required
                    autoComplete="current-password"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPwd(!showPwd)}
                    className="absolute inset-y-0 right-3.5 text-gray-400 hover:text-gray-600 transition-colors"
                  >
                    {showPwd ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full bg-indigo-700 hover:bg-indigo-800 text-white font-semibold
                           rounded-xl py-3 text-sm transition-colors disabled:opacity-60 mt-2
                           flex items-center justify-center gap-2"
              >
                {loading ? (
                  <>
                    <span className="animate-spin h-4 w-4 border-2 border-white border-t-transparent rounded-full" />
                    Signing in…
                  </>
                ) : (
                  <>
                    <Shield size={16} />
                    Sign in to Platform
                  </>
                )}
              </button>
            </form>
          </div>

          <p className="text-center text-xs text-gray-400 mt-6">
            This portal is for authorised platform staff only.<br />
            Company users should log in at{' '}
            <a href="/login" className="text-indigo-600 hover:underline">the main app</a>.
          </p>
        </div>
      </div>
    </div>
  );
}
