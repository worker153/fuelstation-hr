import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Users, CheckCircle, Clock, ShieldCheck, AlertCircle, Plus, ChevronRight } from 'lucide-react';
import api from '../utils/api';
import { useAuth } from '../context/AuthContext';
import VerificationBadge from '../components/VerificationBadge';

function StatCard({ icon: Icon, label, value, color }) {
  return (
    <div className="card p-5">
      <div className={`inline-flex items-center justify-center w-10 h-10 rounded-xl mb-3 ${color}`}>
        <Icon size={20} className="text-white" />
      </div>
      <p className="text-2xl font-bold text-gray-900">{value ?? '—'}</p>
      <p className="text-sm text-gray-500 mt-0.5">{label}</p>
    </div>
  );
}

export default function Dashboard() {
  const { user, isSuperAdmin }      = useAuth();
  const [stats, setStats]           = useState(null);
  const [recent, setRecent]         = useState([]);
  const [loading, setLoading]       = useState(true);

  const hour    = new Date().getHours();
  const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';

  useEffect(() => {
    const load = async () => {
      try {
        const [s, w] = await Promise.all([
          api.get('/workers/stats'),
          api.get('/workers?limit=5')
        ]);
        setStats(s.data.data);
        setRecent(w.data.data);
      } catch {
        // silent
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      {/* Welcome header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{greeting}, {user?.name?.split(' ')[0]}! 👋</h1>
          <p className="text-gray-500 mt-0.5">{user?.company?.name} — Worker Management</p>
        </div>
        <Link to="/workers/new" className="btn-primary hidden sm:inline-flex">
          <Plus size={16} />
          Add Worker
        </Link>
      </div>

      {/* Stats grid */}
      {loading ? (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="card p-5 animate-pulse">
              <div className="w-10 h-10 rounded-xl bg-gray-100 mb-3" />
              <div className="h-7 w-12 bg-gray-100 rounded mb-1" />
              <div className="h-4 w-24 bg-gray-100 rounded" />
            </div>
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard icon={Users}       label="Total Workers"    value={stats?.total}            color="bg-blue-500" />
          <StatCard icon={CheckCircle} label="Verified"         value={stats?.verified}          color="bg-green-500" />
          <StatCard icon={Clock}       label="In Progress"      value={stats?.pending}           color="bg-amber-500" />
          <StatCard icon={AlertCircle} label="Pending Approval" value={stats?.pendingApproval ?? 0} color="bg-purple-600" />
        </div>
      )}

      {/* Pending Approval CTA — only show to super admins when there's a queue */}
      {!loading && isSuperAdmin() && (stats?.pendingApproval ?? 0) > 0 && (
        <Link
          to="/approval-queue"
          className="flex items-center gap-4 p-4 rounded-xl border-2 border-purple-200 bg-purple-50 hover:border-purple-400 hover:bg-purple-100 transition-all"
        >
          <div className="w-10 h-10 rounded-xl bg-purple-600 flex items-center justify-center shrink-0">
            <ShieldCheck size={20} className="text-white" />
          </div>
          <div className="flex-1">
            <p className="font-semibold text-purple-900">
              {stats.pendingApproval} worker{stats.pendingApproval !== 1 ? 's' : ''} awaiting your approval
            </p>
            <p className="text-sm text-purple-600 mt-0.5">Review and approve verification submissions</p>
          </div>
          <ChevronRight size={18} className="text-purple-400 shrink-0" />
        </Link>
      )}

      {/* Recent workers */}
      <div className="card">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <h2 className="font-semibold text-gray-900">Recent Workers</h2>
          <Link to="/workers" className="text-sm text-brand-600 hover:underline font-medium">View all</Link>
        </div>

        {loading ? (
          <div className="divide-y divide-gray-50">
            {[...Array(3)].map((_, i) => (
              <div key={i} className="px-5 py-4 flex items-center gap-3 animate-pulse">
                <div className="w-10 h-10 rounded-full bg-gray-100 shrink-0" />
                <div className="flex-1">
                  <div className="h-4 w-36 bg-gray-100 rounded mb-2" />
                  <div className="h-3 w-48 bg-gray-100 rounded" />
                </div>
              </div>
            ))}
          </div>
        ) : recent.length === 0 ? (
          <div className="px-5 py-12 text-center">
            <Users size={40} className="text-gray-200 mx-auto mb-3" />
            <p className="text-gray-500 text-sm">No workers registered yet.</p>
            <Link to="/workers/new" className="btn-primary mt-4 inline-flex">
              <Plus size={16} /> Register First Worker
            </Link>
          </div>
        ) : (
          <ul className="divide-y divide-gray-50">
            {recent.map(w => (
              <li key={w._id}>
                <Link to={`/workers/${w._id}`}
                  className="flex items-center gap-3 px-5 py-3.5 hover:bg-gray-50 transition-colors">
                  {w.passportPhoto?.url
                    ? <img src={w.passportPhoto.url} className="w-10 h-10 rounded-full object-cover shrink-0 border border-gray-200" alt="" />
                    : <div className="w-10 h-10 rounded-full bg-brand-100 text-brand-700 flex items-center justify-center font-semibold text-sm shrink-0">
                        {w.fullName[0]}
                      </div>
                  }
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-900 truncate">{w.fullName}</p>
                    <p className="text-xs text-gray-500 truncate">{w.role} — {w.branch}</p>
                  </div>
                  <VerificationBadge status={w.verificationStatus} />
                  <ChevronRight size={16} className="text-gray-300 shrink-0" />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Mobile add button */}
      <div className="sm:hidden">
        <Link to="/workers/new" className="btn-primary w-full justify-center py-3">
          <Plus size={16} /> Register New Worker
        </Link>
      </div>
    </div>
  );
}
