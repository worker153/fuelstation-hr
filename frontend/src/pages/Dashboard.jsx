import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Users, CheckCircle, Clock, ShieldCheck,
  AlertCircle, Plus, ChevronRight, TrendingUp,
} from 'lucide-react';
import api from '../utils/api';
import { useAuth } from '../context/AuthContext';
import VerificationBadge from '../components/VerificationBadge';

const STAT_CFG = [
  {
    key:   'total',
    label: 'Total Workers',
    icon:  Users,
    from:  '#3b82f6',
    to:    '#1d4ed8',
    light: '#eff6ff',
    text:  '#1e40af',
  },
  {
    key:   'verified',
    label: 'Verified',
    icon:  CheckCircle,
    from:  '#22c55e',
    to:    '#15803d',
    light: '#f0fdf4',
    text:  '#166534',
  },
  {
    key:   'pending',
    label: 'In Progress',
    icon:  Clock,
    from:  '#f59e0b',
    to:    '#d97706',
    light: '#fffbeb',
    text:  '#92400e',
  },
  {
    key:   'pendingApproval',
    label: 'Pending Approval',
    icon:  AlertCircle,
    from:  '#a855f7',
    to:    '#7c3aed',
    light: '#faf5ff',
    text:  '#5b21b6',
  },
];

function StatCard({ cfg, value }) {
  const Icon = cfg.icon;
  return (
    <div
      className="relative overflow-hidden rounded-2xl p-5 shadow-sm"
      style={{ backgroundColor: cfg.light, border: `1px solid ${cfg.light}` }}
    >
      {/* Background decoration */}
      <div
        className="absolute -top-6 -right-6 w-24 h-24 rounded-full opacity-10"
        style={{ background: `radial-gradient(circle, ${cfg.from}, ${cfg.to})` }}
      />
      <div className="relative z-10">
        <div
          className="inline-flex items-center justify-center w-10 h-10 rounded-xl mb-4 shadow-sm"
          style={{ background: `linear-gradient(135deg, ${cfg.from}, ${cfg.to})` }}
        >
          <Icon size={19} className="text-white" />
        </div>
        <p className="text-3xl font-bold mb-1" style={{ color: cfg.text }}>
          {value ?? '—'}
        </p>
        <p className="text-sm font-medium" style={{ color: cfg.text, opacity: 0.7 }}>
          {cfg.label}
        </p>
      </div>
    </div>
  );
}

export default function Dashboard() {
  const { user, isSuperAdmin }  = useAuth();
  const [stats, setStats]       = useState(null);
  const [recent, setRecent]     = useState([]);
  const [loading, setLoading]   = useState(true);

  const hour     = new Date().getHours();
  const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';
  const firstName = user?.name?.split(' ')[0];

  useEffect(() => {
    const load = async () => {
      try {
        const [s, w] = await Promise.all([
          api.get('/workers/stats'),
          api.get('/workers?limit=5'),
        ]);
        setStats(s.data.data);
        setRecent(w.data.data);
      } catch { /* silent */ }
      finally { setLoading(false); }
    };
    load();
  }, []);

  return (
    <div className="max-w-5xl mx-auto space-y-6">

      {/* ── Hero banner ── */}
      <div
        className="relative overflow-hidden rounded-2xl px-7 py-8 shadow-md"
        style={{ background: 'linear-gradient(135deg, #14532d 0%, #166534 50%, #15803d 100%)' }}
      >
        {/* Decorative circles */}
        <div className="absolute -top-10 -right-10 w-56 h-56 rounded-full opacity-10"
          style={{ background: 'radial-gradient(circle, #4ade80, transparent)' }} />
        <div className="absolute -bottom-16 right-32 w-48 h-48 rounded-full opacity-8"
          style={{ background: 'radial-gradient(circle, #86efac, transparent)' }} />

        <div className="relative z-10 flex items-center justify-between">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <TrendingUp size={15} className="text-green-300" />
              <span className="text-green-300 text-xs font-semibold uppercase tracking-wider">
                {user?.company?.name}
              </span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-bold text-white mb-1">
              {greeting}, {firstName}! 👋
            </h1>
            <p className="text-green-200 text-sm">
              Here's your workforce overview for today.
            </p>
          </div>
          <Link to="/workers/new"
            className="hidden sm:inline-flex items-center gap-2 px-4 py-2.5 bg-white/15 hover:bg-white/25
                       text-white text-sm font-semibold rounded-xl transition-all duration-150 backdrop-blur shrink-0">
            <Plus size={16} />
            Add Worker
          </Link>
        </div>
      </div>

      {/* ── Stat cards ── */}
      {loading ? (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="card p-5 animate-pulse">
              <div className="w-10 h-10 rounded-xl bg-gray-100 mb-4" />
              <div className="h-8 w-14 bg-gray-100 rounded mb-2" />
              <div className="h-4 w-24 bg-gray-100 rounded" />
            </div>
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {STAT_CFG.map(cfg => (
            <StatCard key={cfg.key} cfg={cfg} value={stats?.[cfg.key] ?? 0} />
          ))}
        </div>
      )}

      {/* ── Pending approval CTA ── */}
      {!loading && isSuperAdmin() && (stats?.pendingApproval ?? 0) > 0 && (
        <Link
          to="/approval-queue"
          className="flex items-center gap-4 p-4 rounded-2xl border border-purple-200
                     bg-gradient-to-r from-purple-50 to-violet-50
                     hover:from-purple-100 hover:to-violet-100 transition-all shadow-sm"
        >
          <div className="w-11 h-11 rounded-xl flex items-center justify-center shrink-0"
            style={{ background: 'linear-gradient(135deg,#a855f7,#7c3aed)' }}>
            <ShieldCheck size={20} className="text-white" />
          </div>
          <div className="flex-1">
            <p className="font-semibold text-purple-900">
              {stats.pendingApproval} worker{stats.pendingApproval !== 1 ? 's' : ''} awaiting your approval
            </p>
            <p className="text-sm text-purple-500 mt-0.5">
              Review and approve verification submissions
            </p>
          </div>
          <ChevronRight size={18} className="text-purple-300 shrink-0" />
        </Link>
      )}

      {/* ── Recent workers ── */}
      <div className="card overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-50">
          <div>
            <h2 className="font-bold text-gray-900">Recent Workers</h2>
            <p className="text-xs text-gray-400 mt-0.5">Latest registrations</p>
          </div>
          <Link to="/workers"
            className="text-sm text-brand-600 hover:text-brand-700 font-semibold hover:underline">
            View all →
          </Link>
        </div>

        {loading ? (
          <div className="divide-y divide-gray-50">
            {[...Array(3)].map((_, i) => (
              <div key={i} className="px-6 py-4 flex items-center gap-4 animate-pulse">
                <div className="w-10 h-10 rounded-full bg-gray-100 shrink-0" />
                <div className="flex-1 space-y-2">
                  <div className="h-4 w-40 bg-gray-100 rounded" />
                  <div className="h-3 w-28 bg-gray-100 rounded" />
                </div>
              </div>
            ))}
          </div>
        ) : recent.length === 0 ? (
          <div className="px-6 py-16 text-center">
            <div className="w-16 h-16 rounded-2xl bg-gray-50 flex items-center justify-center mx-auto mb-4">
              <Users size={28} className="text-gray-300" />
            </div>
            <p className="text-gray-500 font-medium mb-1">No workers registered yet</p>
            <p className="text-gray-400 text-sm mb-6">Start by adding your first team member</p>
            <Link to="/workers/new" className="btn-primary">
              <Plus size={16} /> Register First Worker
            </Link>
          </div>
        ) : (
          <ul className="divide-y divide-gray-50">
            {recent.map(w => (
              <li key={w._id}>
                <Link
                  to={`/workers/${w._id}`}
                  className="flex items-center gap-4 px-6 py-4 hover:bg-gray-50/80 transition-colors"
                >
                  {w.passportPhoto?.url
                    ? <img
                        src={w.passportPhoto.url}
                        className="w-10 h-10 rounded-full object-cover shrink-0 border-2 border-gray-100"
                        alt=""
                      />
                    : <div className="w-10 h-10 rounded-full flex items-center justify-center font-bold text-sm shrink-0
                                      text-brand-700 border-2 border-brand-100"
                        style={{ background: 'linear-gradient(135deg,#dcfce7,#bbf7d0)' }}>
                        {w.fullName[0]}
                      </div>
                  }
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-gray-900 truncate">{w.fullName}</p>
                    <p className="text-xs text-gray-400 truncate mt-0.5">{w.role} — {w.branch}</p>
                  </div>
                  <VerificationBadge status={w.verificationStatus} />
                  <ChevronRight size={16} className="text-gray-300 shrink-0 ml-1" />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Mobile add button */}
      <div className="sm:hidden pb-4">
        <Link to="/workers/new" className="btn-primary w-full justify-center py-3">
          <Plus size={16} /> Register New Worker
        </Link>
      </div>
    </div>
  );
}
