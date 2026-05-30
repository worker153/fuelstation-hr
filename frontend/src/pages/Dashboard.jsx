import { useEffect, useState, useMemo } from 'react';
import { Link } from 'react-router-dom';
import {
  Users, CheckCircle, Clock, ShieldCheck, AlertCircle,
  Plus, ChevronRight, TrendingUp, Briefcase, Activity,
  UserCheck, UserX, Building2, ArrowUpRight,
  LogIn, AlertOctagon, AlertTriangle, RefreshCw, Banknote,
} from 'lucide-react';
import {
  PieChart, Pie, Cell, Tooltip, ResponsiveContainer,
  BarChart, Bar, XAxis, YAxis, CartesianGrid,
} from 'recharts';
import api from '../utils/api';
import { useAuth } from '../context/AuthContext';
import VerificationBadge from '../components/VerificationBadge';

// ─── Palette ──────────────────────────────────────────────────────────────────
const GREEN  = '#16a34a';
const GREEN2 = '#15803d';
const BLUE   = '#3b82f6';
const AMBER  = '#f59e0b';
const PURPLE = '#a855f7';
const RED    = '#ef4444';
const SLATE  = '#64748b';

// ─── Stat card ────────────────────────────────────────────────────────────────
function StatCard({ icon: Icon, label, value, from, to, light, text, href, sub }) {
  const inner = (
    <div
      className="relative overflow-hidden rounded-2xl p-5 shadow-sm transition-transform hover:-translate-y-0.5 hover:shadow-md"
      style={{ backgroundColor: light, border: `1.5px solid ${light}` }}
    >
      <div className="absolute -top-5 -right-5 w-20 h-20 rounded-full opacity-[0.12]"
        style={{ background: `radial-gradient(circle, ${from}, ${to})` }} />
      <div className="relative z-10 flex items-start justify-between">
        <div
          className="w-10 h-10 rounded-xl flex items-center justify-center shadow-sm shrink-0"
          style={{ background: `linear-gradient(135deg, ${from}, ${to})` }}
        >
          <Icon size={18} className="text-white" />
        </div>
        {href && <ArrowUpRight size={14} style={{ color: text, opacity: 0.4 }} />}
      </div>
      <p className="text-3xl font-extrabold mt-3 mb-0.5 tabular-nums" style={{ color: text }}>
        {value ?? '—'}
      </p>
      <p className="text-xs font-semibold" style={{ color: text, opacity: 0.65 }}>{label}</p>
      {sub && <p className="text-[11px] mt-1" style={{ color: text, opacity: 0.45 }}>{sub}</p>}
    </div>
  );
  return href ? <Link to={href}>{inner}</Link> : inner;
}

// ─── Section header ───────────────────────────────────────────────────────────
function SectionHead({ title, sub, action }) {
  return (
    <div className="flex items-center justify-between mb-4">
      <div>
        <h2 className="font-bold text-gray-900 text-base">{title}</h2>
        {sub && <p className="text-xs text-gray-400 mt-0.5">{sub}</p>}
      </div>
      {action}
    </div>
  );
}

// ─── Custom pie tooltip ───────────────────────────────────────────────────────
function PieTip({ active, payload }) {
  if (!active || !payload?.length) return null;
  const { name, value } = payload[0];
  return (
    <div className="bg-white border border-gray-100 rounded-xl shadow-lg px-3 py-2 text-xs font-medium text-gray-700">
      {name}: <span className="font-bold text-gray-900">{value}</span>
    </div>
  );
}

// ─── Custom bar tooltip ───────────────────────────────────────────────────────
function BarTip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-white border border-gray-100 rounded-xl shadow-lg px-3 py-2 text-xs font-medium text-gray-700">
      {label}: <span className="font-bold text-gray-900">{payload[0].value}</span> workers
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────
export default function Dashboard() {
  const { user, isSuperAdmin } = useAuth();
  const [stats,       setStats     ] = useState(null);
  const [recent,      setRecent    ] = useState([]);
  const [loading,     setLoading   ] = useState(true);
  const [ops,         setOps       ] = useState(null);
  const [opsLoading,  setOpsLoading] = useState(true);
  const [lastUpdated, setLastUpdated] = useState('');
  const [selBranch,   setSelBranch ] = useState('all');

  const hour     = new Date().getHours();
  const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';
  const wave     = hour < 12 ? '☀️' : hour < 17 ? '👋' : '🌙';
  const firstName = user?.name?.split(' ')[0];

  const loadOps = async () => {
    setOpsLoading(true);
    try {
      const { data } = await api.get('/dashboard/ops');
      setOps(data);
      setLastUpdated(new Date().toLocaleTimeString('en-NG', { hour: '2-digit', minute: '2-digit' }));
    } catch { /* silent */ }
    finally { setOpsLoading(false); }
  };

  useEffect(() => {
    (async () => {
      try {
        const [s, w] = await Promise.all([
          api.get('/workers/stats'),
          api.get('/workers?limit=5'),
        ]);
        setStats(s.data.data);
        setRecent(w.data.data);
      } catch { /* silent */ }
      finally { setLoading(false); }
    })();
    loadOps();
    // Auto-refresh ops every 5 minutes
    const interval = setInterval(loadOps, 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, []);

  // ── Verification pie data ────────────────────────────────────────────────────
  const verifyPie = useMemo(() => {
    if (!stats) return [];
    return [
      { name: 'Verified',    value: stats.verified         || 0, color: GREEN  },
      { name: 'Submitted',   value: stats.pendingApproval  || 0, color: PURPLE },
      { name: 'In Progress', value: stats.partial          || 0, color: AMBER  },
      { name: 'Not Started', value: stats.pending          || 0, color: '#e2e8f0' },
    ].filter(d => d.value > 0);
  }, [stats]);

  // ── Employment pie data ──────────────────────────────────────────────────────
  const empPie = useMemo(() => {
    if (!stats) return [];
    return [
      { name: 'Active',     value: stats.active     || 0, color: GREEN  },
      { name: 'Registered', value: stats.registered || 0, color: BLUE   },
      { name: 'Suspended',  value: stats.suspended  || 0, color: AMBER  },
      { name: 'Sacked',     value: stats.sacked     || 0, color: RED    },
    ].filter(d => d.value > 0);
  }, [stats]);

  // ── Branch bar data ──────────────────────────────────────────────────────────
  const branchBars = useMemo(() => {
    if (!stats?.byBranch?.length) return [];
    return stats.byBranch.map(b => ({
      name: b.name.replace(/^SAGE\s+/i, '').replace(/\s+rd$/i, ' Rd'),
      count: b.count,
    }));
  }, [stats]);

  // ── Role bar data ────────────────────────────────────────────────────────────
  const roleBars = useMemo(() => stats?.byRole || [], [stats]);

  const statCards = stats ? [
    { icon: Users,      label: 'Total Workers',    value: stats.total,           from: BLUE,   to: '#1d4ed8', light: '#eff6ff', text: '#1e40af', href: '/workers' },
    { icon: UserCheck,  label: 'Active Workers',   value: stats.active,          from: GREEN,  to: GREEN2,    light: '#f0fdf4', text: '#166534', href: '/active-workers' },
    { icon: ShieldCheck,label: 'Verified',         value: stats.verified,        from: '#0ea5e9', to: '#0284c7', light: '#f0f9ff', text: '#075985' },
    { icon: AlertCircle,label: 'Pending Approval', value: stats.pendingApproval, from: PURPLE, to: '#7c3aed', light: '#faf5ff', text: '#5b21b6', href: isSuperAdmin() ? '/approval-queue' : undefined },
  ] : [];

  return (
    <div className="max-w-6xl mx-auto space-y-6">

      {/* ── Hero ────────────────────────────────────────────────────────────── */}
      <div
        className="relative overflow-hidden rounded-2xl px-7 py-8 shadow-lg"
        style={{ background: 'linear-gradient(135deg, #052e16 0%, #14532d 45%, #166534 100%)' }}
      >
        {/* Blobs */}
        <div className="absolute -top-12 -right-12 w-64 h-64 rounded-full opacity-[0.07]"
          style={{ background: 'radial-gradient(circle, #4ade80, transparent)' }} />
        <div className="absolute bottom-0 left-1/3 w-48 h-48 rounded-full opacity-[0.05]"
          style={{ background: 'radial-gradient(circle, #86efac, transparent)' }} />
        <div className="absolute top-4 right-1/4 w-32 h-32 rounded-full opacity-[0.06]"
          style={{ background: 'radial-gradient(circle, #bbf7d0, transparent)' }} />

        <div className="relative z-10 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-2">
              <div className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
              <span className="text-green-300 text-xs font-bold uppercase tracking-widest">
                {user?.company?.name || 'Dashboard'}
              </span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-extrabold text-white mb-1.5 leading-tight">
              {greeting}, {firstName}! {wave}
            </h1>
            <p className="text-green-300/80 text-sm">
              {loading ? 'Loading your workforce overview…' : (
                stats
                  ? `${stats.total} workers · ${stats.active} active · ${stats.verified} verified`
                  : 'Here\'s your workforce overview for today.'
              )}
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <Link to="/attendance"
              className="hidden sm:inline-flex items-center gap-2 px-4 py-2.5
                         bg-white/10 hover:bg-white/20 text-white text-sm font-semibold
                         rounded-xl transition-all duration-150 backdrop-blur border border-white/10">
              <Activity size={15} />
              Attendance
            </Link>
            <Link to="/workers/new"
              className="inline-flex items-center gap-2 px-4 py-2.5
                         bg-white text-green-800 text-sm font-bold
                         rounded-xl hover:bg-green-50 transition-all duration-150 shadow">
              <Plus size={15} />
              Add Worker
            </Link>
          </div>
        </div>
      </div>

      {/* ══ OPERATIONS TODAY — mobile-first mini-dashboard ══════════════════ */}
      <div className="space-y-3">
        {/* Header row */}
        <div className="flex items-center justify-between gap-2">
          <div>
            <h2 className="font-bold text-gray-900 text-base">Operations Today</h2>
            {lastUpdated && <p className="text-[11px] text-gray-400">Updated {lastUpdated}</p>}
          </div>
          <div className="flex items-center gap-2">
            {/* Branch filter */}
            {ops?.branches?.length > 1 && (
              <select value={selBranch} onChange={e => setSelBranch(e.target.value)}
                className="px-2.5 py-1.5 border border-gray-200 rounded-lg text-xs font-medium text-gray-600 focus:outline-none focus:ring-2 focus:ring-brand-400 bg-white">
                <option value="all">All Branches</option>
                {ops.branches.map(b => (
                  <option key={String(b._id)} value={String(b._id)}>{b.name}</option>
                ))}
              </select>
            )}
            <button onClick={loadOps} disabled={opsLoading}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-gray-200 text-xs text-gray-500 hover:bg-gray-50 transition-colors disabled:opacity-40">
              <RefreshCw size={12} className={opsLoading ? 'animate-spin' : ''} />
              <span className="hidden sm:inline">Refresh</span>
            </button>
          </div>
        </div>

        {/* ── Big stat cards ── */}
        {(() => {
          const b = selBranch === 'all'
            ? null
            : ops?.branches?.find(br => String(br._id) === selBranch);

          const clockedIn    = b ? b.clockedIn    : (ops?.today?.clockedIn    ?? '—');
          const notClockedIn = b ? b.notClockedIn : (ops?.today?.notClockedIn ?? '—');
          const totalActive  = b ? b.total        : (ops?.today?.totalExpected ?? ops?.today?.totalActive ?? '—');
          const shortageCnt  = b ? b.shortageCount  : (ops?.month?.shortageCount  ?? '—');
          const shortageAmt  = b ? b.shortageAmount : (ops?.month?.shortageAmount ?? null);
          const offences     = selBranch === 'all' ? (ops?.offences?.active ?? '—') : '—';

          return (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {/* Clocked In */}
              <Link to="/attendance"
                className="flex flex-col justify-between bg-green-50 border border-green-100 rounded-2xl p-4 hover:bg-green-100 transition-colors active:scale-95">
                <div className="flex items-center justify-between mb-2">
                  <div className="w-9 h-9 rounded-xl bg-green-600 flex items-center justify-center">
                    <LogIn size={16} className="text-white" />
                  </div>
                  <ArrowUpRight size={13} className="text-green-400" />
                </div>
                <p className="text-3xl font-extrabold text-green-700 tabular-nums leading-none">{opsLoading ? '…' : clockedIn}</p>
                <p className="text-xs font-semibold text-green-600 mt-1">Clocked In</p>
                <p className="text-[11px] text-green-400 mt-0.5">of {opsLoading ? '…' : totalActive} expected</p>
              </Link>

              {/* Not Clocked In */}
              <Link to="/attendance"
                className="flex flex-col justify-between bg-red-50 border border-red-100 rounded-2xl p-4 hover:bg-red-100 transition-colors active:scale-95">
                <div className="flex items-center justify-between mb-2">
                  <div className="w-9 h-9 rounded-xl bg-red-500 flex items-center justify-center">
                    <UserX size={16} className="text-white" />
                  </div>
                  <ArrowUpRight size={13} className="text-red-300" />
                </div>
                <p className="text-3xl font-extrabold text-red-600 tabular-nums leading-none">{opsLoading ? '…' : notClockedIn}</p>
                <p className="text-xs font-semibold text-red-500 mt-1">Not Clocked In</p>
                <p className="text-[11px] text-red-300 mt-0.5">possible no-show</p>
              </Link>

              {/* Shortages */}
              <Link to="/shortages"
                className="flex flex-col justify-between bg-amber-50 border border-amber-100 rounded-2xl p-4 hover:bg-amber-100 transition-colors active:scale-95">
                <div className="flex items-center justify-between mb-2">
                  <div className="w-9 h-9 rounded-xl bg-amber-500 flex items-center justify-center">
                    <AlertTriangle size={16} className="text-white" />
                  </div>
                  <ArrowUpRight size={13} className="text-amber-400" />
                </div>
                <p className="text-3xl font-extrabold text-amber-700 tabular-nums leading-none">{opsLoading ? '…' : shortageCnt}</p>
                <p className="text-xs font-semibold text-amber-600 mt-1">Shortages</p>
                <p className="text-[11px] text-amber-400 mt-0.5">
                  {shortageAmt != null ? `₦${Number(shortageAmt).toLocaleString()} this month` : 'this month'}
                </p>
              </Link>

              {/* Active Offences */}
              <Link to="/offences"
                className="flex flex-col justify-between bg-orange-50 border border-orange-100 rounded-2xl p-4 hover:bg-orange-100 transition-colors active:scale-95">
                <div className="flex items-center justify-between mb-2">
                  <div className="w-9 h-9 rounded-xl bg-orange-500 flex items-center justify-center">
                    <AlertOctagon size={16} className="text-white" />
                  </div>
                  <ArrowUpRight size={13} className="text-orange-300" />
                </div>
                <p className="text-3xl font-extrabold text-orange-700 tabular-nums leading-none">{opsLoading ? '…' : offences}</p>
                <p className="text-xs font-semibold text-orange-600 mt-1">Active Offences</p>
                <p className="text-[11px] text-orange-300 mt-0.5">disciplinary</p>
              </Link>
            </div>
          );
        })()}

        {/* ── Per-branch breakdown ── */}
        {ops?.branches?.length > 0 && selBranch === 'all' && (
          <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
            <div className="px-4 py-3 border-b border-gray-100 flex items-center gap-2">
              <Building2 size={13} className="text-brand-500" />
              <p className="text-sm font-semibold text-gray-800">Per Branch — Today</p>
            </div>
            <div className="divide-y divide-gray-50">
              {ops.branches.map(b => {
                const pct = b.total > 0 ? Math.round((b.clockedIn / b.total) * 100) : 0;
                return (
                  <div key={String(b._id)} className="px-4 py-3 flex items-center gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between mb-1">
                        <p className="text-sm font-semibold text-gray-800 truncate">{b.name}</p>
                        <p className="text-xs text-gray-500 shrink-0 ml-2">
                          <span className="text-green-600 font-bold">{b.clockedIn}</span>
                          <span className="text-gray-300"> / </span>
                          <span className="font-medium">{b.total}</span>
                          <span className="text-gray-400"> in</span>
                        </p>
                      </div>
                      {/* Progress bar */}
                      <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                        <div className="h-full bg-green-500 rounded-full transition-all duration-500"
                          style={{ width: `${pct}%` }} />
                      </div>
                      <div className="flex items-center justify-between mt-1">
                        <p className="text-[11px] text-gray-400">{pct}% present</p>
                        {b.shortageAmount > 0 && (
                          <p className="text-[11px] text-amber-600 font-medium">
                            ₦{Number(b.shortageAmount).toLocaleString()} shortages
                          </p>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* ── Quick navigation — large touch targets for mobile ── */}
        <div>
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Quick Navigation</p>
          <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
            {[
              { to: '/attendance',  icon: Clock,         label: 'Attendance', cls: 'text-blue-600   bg-blue-50   hover:bg-blue-100'   },
              { to: '/shortages',   icon: AlertTriangle, label: 'Shortages',  cls: 'text-amber-600  bg-amber-50  hover:bg-amber-100'  },
              { to: '/offences',    icon: AlertOctagon,  label: 'Disciplinary',cls:'text-orange-600 bg-orange-50 hover:bg-orange-100' },
              { to: '/workers',     icon: Users,         label: 'Workers',    cls: 'text-brand-600  bg-brand-50  hover:bg-brand-100'  },
              { to: '/payroll',     icon: Banknote,      label: 'Payroll',    cls: 'text-purple-600 bg-purple-50 hover:bg-purple-100' },
              { to: '/branches',    icon: Building2,     label: 'Branches',   cls: 'text-green-600  bg-green-50  hover:bg-green-100'  },
            ].map(({ to, icon: Icon, label, cls }) => (
              <Link key={to} to={to}
                className={`flex flex-col items-center justify-center gap-1.5 rounded-2xl py-3.5 px-2 transition-colors active:scale-95 ${cls}`}>
                <Icon size={20} />
                <span className="text-[11px] font-semibold text-center leading-tight">{label}</span>
              </Link>
            ))}
          </div>
        </div>
      </div>
      {/* ══ END OPERATIONS ══════════════════════════════════════════════════ */}

      {/* ── Stat cards ──────────────────────────────────────────────────────── */}
      {loading ? (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="card p-5 animate-pulse rounded-2xl">
              <div className="w-10 h-10 rounded-xl bg-gray-100 mb-4" />
              <div className="h-8 w-14 bg-gray-100 rounded mb-2" />
              <div className="h-3 w-24 bg-gray-100 rounded" />
            </div>
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {statCards.map((c, i) => <StatCard key={i} {...c} />)}
        </div>
      )}

      {/* ── Pending approval alert ──────────────────────────────────────────── */}
      {!loading && isSuperAdmin() && (stats?.pendingApproval ?? 0) > 0 && (
        <Link to="/approval-queue"
          className="flex items-center gap-4 p-4 rounded-2xl border border-purple-200
                     bg-gradient-to-r from-purple-50 to-violet-50
                     hover:from-purple-100 hover:to-violet-100 transition-all shadow-sm">
          <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
            style={{ background: 'linear-gradient(135deg,#a855f7,#7c3aed)' }}>
            <ShieldCheck size={18} className="text-white" />
          </div>
          <div className="flex-1">
            <p className="font-bold text-purple-900 text-sm">
              {stats.pendingApproval} worker{stats.pendingApproval !== 1 ? 's' : ''} awaiting your approval
            </p>
            <p className="text-xs text-purple-500 mt-0.5">
              Review and approve verification submissions
            </p>
          </div>
          <ChevronRight size={16} className="text-purple-300 shrink-0" />
        </Link>
      )}

      {/* ── Charts row ──────────────────────────────────────────────────────── */}
      {!loading && stats && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">

          {/* Verification status — donut */}
          <div className="card p-5">
            <SectionHead title="Verification Status" sub="Worker document & ID progress" />
            {verifyPie.length === 0 ? (
              <p className="text-xs text-gray-400 py-8 text-center">No data yet</p>
            ) : (
              <div className="flex items-center gap-4">
                <ResponsiveContainer width={160} height={160}>
                  <PieChart>
                    <Pie
                      data={verifyPie}
                      cx="50%" cy="50%"
                      innerRadius={48} outerRadius={72}
                      paddingAngle={3}
                      dataKey="value"
                    >
                      {verifyPie.map((d, i) => (
                        <Cell key={i} fill={d.color} strokeWidth={0} />
                      ))}
                    </Pie>
                    <Tooltip content={<PieTip />} />
                  </PieChart>
                </ResponsiveContainer>
                <div className="flex-1 space-y-2.5">
                  {verifyPie.map((d, i) => (
                    <div key={i} className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: d.color }} />
                        <span className="text-xs text-gray-600">{d.name}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-bold text-gray-900">{d.value}</span>
                        <div className="w-16 h-1.5 rounded-full bg-gray-100 overflow-hidden">
                          <div className="h-full rounded-full" style={{ width: `${(d.value / stats.total) * 100}%`, background: d.color }} />
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Employment status — donut */}
          <div className="card p-5">
            <SectionHead title="Employment Status" sub="Active vs registered vs other" />
            {empPie.length === 0 ? (
              <p className="text-xs text-gray-400 py-8 text-center">No data yet</p>
            ) : (
              <div className="flex items-center gap-4">
                <ResponsiveContainer width={160} height={160}>
                  <PieChart>
                    <Pie
                      data={empPie}
                      cx="50%" cy="50%"
                      innerRadius={48} outerRadius={72}
                      paddingAngle={3}
                      dataKey="value"
                    >
                      {empPie.map((d, i) => (
                        <Cell key={i} fill={d.color} strokeWidth={0} />
                      ))}
                    </Pie>
                    <Tooltip content={<PieTip />} />
                  </PieChart>
                </ResponsiveContainer>
                <div className="flex-1 space-y-2.5">
                  {empPie.map((d, i) => (
                    <div key={i} className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: d.color }} />
                        <span className="text-xs text-gray-600">{d.name}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-bold text-gray-900">{d.value}</span>
                        <div className="w-16 h-1.5 rounded-full bg-gray-100 overflow-hidden">
                          <div className="h-full rounded-full" style={{ width: `${(d.value / stats.total) * 100}%`, background: d.color }} />
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Workers by branch — bar */}
          {branchBars.length > 0 && (
            <div className="card p-5">
              <SectionHead
                title="Workers by Branch"
                sub="Headcount per location"
                action={
                  <Link to="/branches" className="text-xs text-brand-600 hover:text-brand-700 font-semibold flex items-center gap-0.5">
                    <Building2 size={12} /> Manage
                  </Link>
                }
              />
              <ResponsiveContainer width="100%" height={180}>
                <BarChart data={branchBars} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                  <XAxis dataKey="name" tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} allowDecimals={false} />
                  <Tooltip content={<BarTip />} cursor={{ fill: '#f8fafc' }} />
                  <Bar dataKey="count" radius={[6, 6, 0, 0]}>
                    {branchBars.map((_, i) => (
                      <Cell key={i} fill={[GREEN, BLUE, AMBER, PURPLE, '#06b6d4', '#ec4899'][i % 6]} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}

          {/* Workers by role — bar */}
          {roleBars.length > 0 && (
            <div className="card p-5">
              <SectionHead
                title="Workers by Role"
                sub="Top roles in your workforce"
                action={
                  <Link to="/active-workers" className="text-xs text-brand-600 hover:text-brand-700 font-semibold flex items-center gap-0.5">
                    <Briefcase size={12} /> View all
                  </Link>
                }
              />
              <ResponsiveContainer width="100%" height={180}>
                <BarChart data={roleBars} layout="vertical" margin={{ top: 0, right: 8, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" horizontal={false} />
                  <XAxis type="number" tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} allowDecimals={false} />
                  <YAxis
                    type="category" dataKey="name" width={110}
                    tick={{ fontSize: 11, fill: '#64748b' }} axisLine={false} tickLine={false}
                  />
                  <Tooltip content={<BarTip />} cursor={{ fill: '#f8fafc' }} />
                  <Bar dataKey="count" radius={[0, 6, 6, 0]}>
                    {roleBars.map((_, i) => (
                      <Cell key={i} fill={[GREEN, BLUE, AMBER, PURPLE, '#06b6d4', '#ec4899'][i % 6]} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>
      )}

      {/* ── Recent Workers ──────────────────────────────────────────────────── */}
      <div className="card overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-50">
          <div>
            <h2 className="font-bold text-gray-900">Recent Workers</h2>
            <p className="text-xs text-gray-400 mt-0.5">Latest registrations</p>
          </div>
          <Link to="/workers" className="text-sm text-brand-600 hover:text-brand-700 font-bold flex items-center gap-1">
            View all <ArrowUpRight size={13} />
          </Link>
        </div>

        {loading ? (
          <div className="divide-y divide-gray-50">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="px-6 py-4 flex items-center gap-4 animate-pulse">
                <div className="w-10 h-10 rounded-full bg-gray-100 shrink-0" />
                <div className="flex-1 space-y-2">
                  <div className="h-4 w-40 bg-gray-100 rounded" />
                  <div className="h-3 w-28 bg-gray-100 rounded" />
                </div>
                <div className="h-5 w-16 bg-gray-100 rounded-full" />
              </div>
            ))}
          </div>
        ) : recent.length === 0 ? (
          <div className="px-6 py-16 text-center">
            <div className="w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-4"
              style={{ background: 'linear-gradient(135deg,#f0fdf4,#dcfce7)' }}>
              <Users size={28} className="text-green-400" />
            </div>
            <p className="text-gray-500 font-semibold mb-1">No workers registered yet</p>
            <p className="text-gray-400 text-sm mb-5">Start by adding your first team member</p>
            <Link to="/workers/new" className="btn-primary">
              <Plus size={15} /> Register First Worker
            </Link>
          </div>
        ) : (
          <ul className="divide-y divide-gray-50">
            {recent.map(w => (
              <li key={w._id}>
                <Link to={`/workers/${w._id}`}
                  className="flex items-center gap-4 px-6 py-3.5 hover:bg-gray-50/70 transition-colors">
                  {w.passportPhoto?.url
                    ? <img src={w.passportPhoto.url}
                        className="w-10 h-10 rounded-full object-cover shrink-0 border-2 border-white shadow-sm"
                        alt="" />
                    : <div
                        className="w-10 h-10 rounded-full flex items-center justify-center font-bold text-sm shrink-0 text-white shadow-sm"
                        style={{ background: `linear-gradient(135deg, ${GREEN}, ${GREEN2})` }}>
                        {w.fullName[0]}
                      </div>
                  }
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-gray-900 truncate">{w.fullName}</p>
                    <p className="text-xs text-gray-400 truncate mt-0.5">{w.role} · {w.branch}</p>
                  </div>
                  <VerificationBadge status={w.verificationStatus} />
                  <ChevronRight size={15} className="text-gray-300 shrink-0 ml-1" />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* ── Quick links ─────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pb-4">
        {[
          { to: '/payroll',    icon: '💰', label: 'Payroll'    },
          { to: '/shortages',  icon: '⚠️',  label: 'Shortages'  },
          { to: '/attendance', icon: '📋', label: 'Attendance' },
          { to: '/shifts',     icon: '🔄', label: 'Shifts'     },
        ].map(q => (
          <Link key={q.to} to={q.to}
            className="card flex items-center gap-3 px-4 py-3.5 hover:shadow-md transition-all hover:-translate-y-0.5">
            <span className="text-xl">{q.icon}</span>
            <span className="text-sm font-semibold text-gray-700">{q.label}</span>
            <ChevronRight size={14} className="text-gray-300 ml-auto shrink-0" />
          </Link>
        ))}
      </div>

    </div>
  );
}
