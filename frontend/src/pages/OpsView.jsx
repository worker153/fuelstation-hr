/**
 * OpsView — standalone mobile operations page.
 * Route: /ops  (login required)
 * Save as home screen shortcut: https://fuelstation-hr.vercel.app/ops
 *
 * No sidebar. Just the numbers that matter.
 * Auto-refreshes every 5 min. Pull-to-refresh button always visible.
 */
import { useState, useEffect, useCallback } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  LogIn, UserX, AlertTriangle, AlertOctagon,
  Building2, RefreshCw, LogOut, Leaf, ChevronRight,
  Clock, Users, Banknote,
} from 'lucide-react';
import api from '../utils/api';
import { useAuth } from '../context/AuthContext';

const fmt = (n) => `₦${Number(n || 0).toLocaleString()}`;

export default function OpsView() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [ops,         setOps        ] = useState(null);
  const [loading,     setLoading    ] = useState(true);
  const [lastUpdated, setLastUpdated ] = useState('');
  const [selBranch,   setSelBranch  ] = useState('all');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await api.get('/dashboard/ops');
      setOps(data);
      setLastUpdated(new Date().toLocaleTimeString('en-NG', { hour: '2-digit', minute: '2-digit' }));
    } catch { /* silent */ }
    finally { setLoading(false); }
  }, []);

  useEffect(() => {
    load();
    const t = setInterval(load, 5 * 60 * 1000);
    return () => clearInterval(t);
  }, [load]);

  const handleLogout = () => { logout(); navigate('/login'); };

  // Pick branch-specific or all-branches numbers
  const branch = selBranch === 'all' ? null : ops?.branches?.find(b => String(b._id) === selBranch);
  const clockedIn    = branch ? branch.clockedIn    : (ops?.today?.clockedIn    ?? '—');
  const notClockedIn = branch ? branch.notClockedIn : (ops?.today?.notClockedIn ?? '—');
  const totalActive  = branch ? branch.total        : (ops?.today?.totalActive  ?? '—');
  const shortageCnt  = branch ? branch.shortageCount  : (ops?.month?.shortageCount  ?? '—');
  const shortageAmt  = branch ? branch.shortageAmount : (ops?.month?.shortageAmount ?? null);
  const offences     = selBranch === 'all' ? (ops?.offences?.active ?? '—') : '—';

  const todayDate = new Date().toLocaleDateString('en-NG', {
    weekday: 'long', day: 'numeric', month: 'long'
  });

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">

      {/* ── Top bar ─────────────────────────────────────────────────────────── */}
      <div style={{ background: 'linear-gradient(135deg, #052e16 0%, #166534 100%)' }}
        className="px-4 pt-10 pb-5 text-white">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <div className="bg-white/15 rounded-xl p-1.5">
              <Leaf size={18} className="text-white" />
            </div>
            <div>
              <p className="font-bold text-sm leading-tight">
                {user?.company?.name || 'Sage Energy'}
              </p>
              <p className="text-green-300 text-[11px]">Operations View</p>
            </div>
          </div>
          <button onClick={handleLogout}
            className="flex items-center gap-1.5 bg-white/10 hover:bg-white/20 px-3 py-1.5 rounded-xl text-xs font-medium transition-colors">
            <LogOut size={12} /> Sign Out
          </button>
        </div>

        <p className="text-green-200 text-xs mt-1">{todayDate}</p>
        <p className="text-green-300/70 text-[11px] mt-0.5">
          {lastUpdated ? `Updated ${lastUpdated}` : 'Loading…'}
        </p>
      </div>

      {/* ── Controls ─────────────────────────────────────────────────────────── */}
      <div className="px-4 py-3 bg-white border-b border-gray-100 flex items-center gap-2">
        {/* Branch selector */}
        <select value={selBranch} onChange={e => setSelBranch(e.target.value)}
          className="flex-1 px-3 py-2 border border-gray-200 rounded-xl text-sm font-medium text-gray-700 bg-white focus:outline-none focus:ring-2 focus:ring-green-400">
          <option value="all">All Branches</option>
          {ops?.branches?.map(b => (
            <option key={String(b._id)} value={String(b._id)}>{b.name}</option>
          ))}
        </select>
        <button onClick={load} disabled={loading}
          className="flex items-center gap-1.5 px-4 py-2 bg-green-700 hover:bg-green-800 disabled:opacity-50 text-white rounded-xl text-sm font-semibold transition-colors">
          <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
          Refresh
        </button>
      </div>

      {/* ── Main content ─────────────────────────────────────────────────────── */}
      <div className="flex-1 px-4 py-4 space-y-4 pb-8">

        {/* ── Big stat cards ─────────────────────────────────────────────────── */}
        <div className="grid grid-cols-2 gap-3">

          {/* Clocked In */}
          <Link to="/attendance"
            className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 flex flex-col gap-1 active:scale-95 transition-transform">
            <div className="w-10 h-10 rounded-xl bg-green-100 flex items-center justify-center mb-1">
              <LogIn size={18} className="text-green-600" />
            </div>
            <p className="text-4xl font-black text-green-600 tabular-nums leading-none">
              {loading ? <span className="text-2xl text-gray-300">…</span> : clockedIn}
            </p>
            <p className="text-sm font-bold text-gray-700">Clocked In</p>
            <p className="text-xs text-gray-400">of {loading ? '…' : totalActive} active workers</p>
          </Link>

          {/* Not Clocked In */}
          <Link to="/attendance"
            className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 flex flex-col gap-1 active:scale-95 transition-transform">
            <div className="w-10 h-10 rounded-xl bg-red-100 flex items-center justify-center mb-1">
              <UserX size={18} className="text-red-500" />
            </div>
            <p className="text-4xl font-black text-red-500 tabular-nums leading-none">
              {loading ? <span className="text-2xl text-gray-300">…</span> : notClockedIn}
            </p>
            <p className="text-sm font-bold text-gray-700">Not In</p>
            <p className="text-xs text-gray-400">possible absent / no-show</p>
          </Link>

          {/* Shortages */}
          <Link to="/shortages"
            className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 flex flex-col gap-1 active:scale-95 transition-transform">
            <div className="w-10 h-10 rounded-xl bg-amber-100 flex items-center justify-center mb-1">
              <AlertTriangle size={18} className="text-amber-500" />
            </div>
            <p className="text-4xl font-black text-amber-600 tabular-nums leading-none">
              {loading ? <span className="text-2xl text-gray-300">…</span> : shortageCnt}
            </p>
            <p className="text-sm font-bold text-gray-700">Shortages</p>
            <p className="text-xs text-gray-400">
              {shortageAmt != null ? fmt(shortageAmt) : ''} this month
            </p>
          </Link>

          {/* Active Offences */}
          <Link to="/offences"
            className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 flex flex-col gap-1 active:scale-95 transition-transform">
            <div className="w-10 h-10 rounded-xl bg-orange-100 flex items-center justify-center mb-1">
              <AlertOctagon size={18} className="text-orange-500" />
            </div>
            <p className="text-4xl font-black text-orange-600 tabular-nums leading-none">
              {loading ? <span className="text-2xl text-gray-300">…</span> : offences}
            </p>
            <p className="text-sm font-bold text-gray-700">Offences</p>
            <p className="text-xs text-gray-400">active disciplinary</p>
          </Link>
        </div>

        {/* ── Per-branch breakdown ─────────────────────────────────────────────── */}
        {selBranch === 'all' && ops?.branches?.length > 0 && (
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
            <div className="px-4 py-3 border-b border-gray-50 flex items-center gap-2">
              <Building2 size={14} className="text-gray-400" />
              <p className="text-sm font-bold text-gray-800">By Branch — Today</p>
            </div>
            <div className="divide-y divide-gray-50">
              {ops.branches.map(b => {
                const pct = b.total > 0 ? Math.round((b.clockedIn / b.total) * 100) : 0;
                const color = pct >= 80 ? '#16a34a' : pct >= 50 ? '#f59e0b' : '#ef4444';
                return (
                  <div key={String(b._id)} className="px-4 py-3.5">
                    <div className="flex items-center justify-between mb-2">
                      <p className="text-sm font-semibold text-gray-800">{b.name}</p>
                      <p className="text-sm font-bold" style={{ color }}>
                        {b.clockedIn}/{b.total}
                        <span className="text-xs font-normal text-gray-400 ml-1">in</span>
                      </p>
                    </div>
                    {/* Progress bar */}
                    <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                      <div className="h-full rounded-full transition-all duration-700"
                        style={{ width: `${pct}%`, background: color }} />
                    </div>
                    <div className="flex items-center justify-between mt-1.5">
                      <p className="text-xs text-gray-400">{pct}% present</p>
                      {b.shortageAmount > 0 && (
                        <p className="text-xs text-amber-600 font-semibold">
                          {fmt(b.shortageAmount)} shortages
                        </p>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* ── Quick navigation ─────────────────────────────────────────────────── */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-50">
            <p className="text-sm font-bold text-gray-800">Go To</p>
          </div>
          {[
            { to: '/attendance',  icon: Clock,         label: 'Attendance',   sub: 'Clock-in records' },
            { to: '/shortages',   icon: AlertTriangle, label: 'Shortages',    sub: 'Cash & fuel shortages' },
            { to: '/offences',    icon: AlertOctagon,  label: 'Disciplinary', sub: 'Offence bookings' },
            { to: '/workers',     icon: Users,         label: 'Workers',      sub: 'All staff' },
            { to: '/payroll',     icon: Banknote,      label: 'Payroll',      sub: 'Salary & deductions' },
            { to: '/branches',    icon: Building2,     label: 'Branches',     sub: 'Branch settings' },
            { to: '/dashboard',   icon: Leaf,          label: 'Full Dashboard', sub: 'Charts & overview' },
          ].map(({ to, icon: Icon, label, sub }) => (
            <Link key={to} to={to}
              className="flex items-center gap-3 px-4 py-3.5 border-b border-gray-50 last:border-0 hover:bg-gray-50 active:bg-gray-100 transition-colors">
              <div className="w-9 h-9 rounded-xl bg-gray-100 flex items-center justify-center shrink-0">
                <Icon size={16} className="text-gray-600" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-gray-800">{label}</p>
                <p className="text-xs text-gray-400">{sub}</p>
              </div>
              <ChevronRight size={14} className="text-gray-300 shrink-0" />
            </Link>
          ))}
        </div>

        {/* Logged in as */}
        <p className="text-center text-xs text-gray-400 pb-2">
          Signed in as <strong>{user?.name || user?.email}</strong>
        </p>
      </div>
    </div>
  );
}
