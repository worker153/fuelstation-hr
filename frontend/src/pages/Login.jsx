import { useState } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { Leaf, Eye, EyeOff, CheckCircle, Users, BarChart3, Shield } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useNotify } from '../context/NotificationContext';

const FEATURES = [
  { icon: Users,      text: 'Full worker registration & verification' },
  { icon: CheckCircle,text: 'Automated attendance & deductions'       },
  { icon: BarChart3,  text: 'Payroll & shortage management'           },
  { icon: Shield,     text: 'Role-based access for your team'         },
];

export default function Login() {
  const [form, setForm]       = useState({ email: '', password: '' });
  const [showPwd, setShowPwd] = useState(false);
  const [loading, setLoading] = useState(false);
  const { login }             = useAuth();
  const notify                = useNotify();
  const navigate              = useNavigate();
  const location              = useLocation();
  // If redirected from a protected page, go back there after login
  const from = location.state?.from || '/dashboard';

  const set = (k) => (e) => setForm(f => ({ ...f, [k]: e.target.value }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      await login(form.email, form.password);
      navigate(from, { replace: true });
    } catch (err) {
      notify(err.response?.data?.message || 'Login failed. Check your credentials.', 'error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex">

      {/* ── Left brand panel ── */}
      <div
        className="hidden lg:flex lg:w-1/2 flex-col justify-between p-12 relative overflow-hidden"
        style={{ background: 'linear-gradient(145deg, #14532d 0%, #166534 40%, #15803d 100%)' }}
      >
        {/* Background circles */}
        <div className="absolute -top-24 -left-24 w-96 h-96 rounded-full opacity-10"
          style={{ background: 'radial-gradient(circle, #4ade80, transparent)' }} />
        <div className="absolute -bottom-32 -right-16 w-[28rem] h-[28rem] rounded-full opacity-10"
          style={{ background: 'radial-gradient(circle, #86efac, transparent)' }} />

        {/* Logo */}
        <div className="relative z-10">
          <div className="flex items-center gap-3 mb-16">
            <div className="bg-white/15 backdrop-blur rounded-2xl p-3">
              <Leaf size={28} className="text-white" />
            </div>
            <div>
              <p className="text-white font-bold text-xl leading-tight">FuelStation HR</p>
              <p className="text-green-300 text-sm">by Sage Energy</p>
            </div>
          </div>

          <h2 className="text-4xl font-bold text-white leading-snug mb-4">
            Smart HR for<br />modern fuel stations
          </h2>
          <p className="text-green-200 text-base leading-relaxed mb-12">
            Manage your entire workforce — registrations, attendance,
            payroll, and shortages — all in one place.
          </p>

          <div className="space-y-4">
            {FEATURES.map(({ icon: Icon, text }) => (
              <div key={text} className="flex items-center gap-3">
                <div className="bg-white/15 rounded-full p-1.5 shrink-0">
                  <Icon size={14} className="text-green-200" />
                </div>
                <span className="text-green-100 text-sm">{text}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Bottom tagline */}
        <p className="relative z-10 text-green-400 text-xs">
          © {new Date().getFullYear()} Sage Energy & Natural Resources
        </p>
      </div>

      {/* ── Right form panel ── */}
      <div className="flex-1 flex items-center justify-center px-6 py-12 bg-white">
        <div className="w-full max-w-md">

          {/* Mobile logo */}
          <div className="lg:hidden flex items-center gap-3 mb-10">
            <div className="bg-brand-700 rounded-2xl p-2.5">
              <Leaf size={22} className="text-white" />
            </div>
            <div>
              <p className="font-bold text-gray-900 text-lg leading-tight">FuelStation HR</p>
              <p className="text-gray-400 text-xs">by Sage Energy</p>
            </div>
          </div>

          <h1 className="text-3xl font-bold text-gray-900 mb-1">Welcome back</h1>
          <p className="text-gray-400 mb-10 text-sm">Sign in to manage your workforce</p>

          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <label className="label">Email address</label>
              <input
                type="email"
                className="input"
                placeholder="admin@company.com"
                value={form.email}
                onChange={set('email')}
                required
                autoComplete="email"
              />
            </div>

            <div>
              <label className="label">Password</label>
              <div className="relative">
                <input
                  type={showPwd ? 'text' : 'password'}
                  className="input pr-11"
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
              className="btn-primary w-full justify-center py-3 text-base mt-2"
            >
              {loading ? (
                <span className="flex items-center gap-2">
                  <span className="animate-spin h-4 w-4 border-2 border-white border-t-transparent rounded-full" />
                  Signing in…
                </span>
              ) : 'Sign in'}
            </button>
          </form>

          <p className="text-center text-sm text-gray-400 mt-8">
            New company?{' '}
            <Link to="/register" className="text-brand-700 font-semibold hover:underline">
              Register here
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
