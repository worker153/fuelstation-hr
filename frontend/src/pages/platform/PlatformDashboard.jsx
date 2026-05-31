import { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Shield, LogOut, Building2, Users, Clock, CheckCircle, XCircle,
  AlertTriangle, Search, RefreshCw, ChevronLeft, ChevronRight,
  TrendingUp, Calendar, MoreHorizontal, Eye, X, Check,
  Ban, Zap, Plus, Minus, FileText, Globe, BarChart3,
} from 'lucide-react';
import platformApi from '../../utils/platformApi';
import { usePlatformAuth } from '../../context/PlatformAuthContext';
import { useNotify } from '../../context/NotificationContext';

// ── Status config ──────────────────────────────────────────────────────────────
const STATUS = {
  pending_approval: { label: 'Pending',   cls: 'bg-amber-100 text-amber-700 border border-amber-200' },
  trial:            { label: 'Trial',     cls: 'bg-blue-100  text-blue-700  border border-blue-200'  },
  active:           { label: 'Active',    cls: 'bg-green-100 text-green-700 border border-green-200' },
  expired:          { label: 'Expired',   cls: 'bg-red-100   text-red-700   border border-red-200'   },
  suspended:        { label: 'Suspended', cls: 'bg-gray-100  text-gray-600  border border-gray-200'  },
};

function StatusBadge({ status }) {
  const cfg = STATUS[status] || STATUS.active;
  return (
    <span className={`inline-flex items-center text-xs font-semibold px-2.5 py-0.5 rounded-full ${cfg.cls}`}>
      {cfg.label}
    </span>
  );
}

const PLAN_LABELS = { trial: 'Trial', starter: 'Starter', professional: 'Professional', enterprise: 'Enterprise' };

function Modal({ title, onClose, children, width = 'max-w-lg' }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'rgba(15,23,42,0.55)' }}>
      <div className={`bg-white rounded-2xl shadow-2xl w-full ${width} max-h-[90vh] flex flex-col`}>
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <h3 className="font-bold text-gray-900 text-base">{title}</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 transition-colors">
            <X size={18} />
          </button>
        </div>
        <div className="overflow-y-auto flex-1 px-6 py-5">{children}</div>
      </div>
    </div>
  );
}

function Spinner() {
  return (
    <span className="inline-block animate-spin h-4 w-4 border-2 border-current border-t-transparent rounded-full" />
  );
}

// ── Stat Card ─────────────────────────────────────────────────────────────────
function StatCard({ label, value, icon: Icon, color }) {
  const colors = {
    indigo: 'bg-indigo-50 text-indigo-600',
    amber:  'bg-amber-50  text-amber-600',
    green:  'bg-green-50  text-green-600',
    blue:   'bg-blue-50   text-blue-600',
    red:    'bg-red-50    text-red-600',
    gray:   'bg-gray-50   text-gray-500',
  };
  return (
    <div className="bg-white rounded-2xl border border-gray-100 p-5 flex items-center gap-4 shadow-sm">
      <div className={`rounded-xl p-3 shrink-0 ${colors[color] || colors.indigo}`}>
        <Icon size={20} />
      </div>
      <div>
        <p className="text-2xl font-black text-gray-900 leading-none">{value ?? '—'}</p>
        <p className="text-xs text-gray-500 mt-1 font-medium">{label}</p>
      </div>
    </div>
  );
}

const LIMIT = 15;

export default function PlatformDashboard() {
  const { admin, logout } = usePlatformAuth();
  const notify = useNotify();

  const [stats,     setStats]     = useState(null);
  const [companies, setCompanies] = useState([]);
  const [total,     setTotal]     = useState(0);
  const [loading,   setLoading]   = useState(true);
  const [search,    setSearch]    = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [page,      setPage]      = useState(1);

  // Modal state
  const [modal,   setModal]   = useState(null);
  const [company, setCompany] = useState(null);
  const [saving,  setSaving]  = useState(false);

  // Form fields
  const [trialDays,      setTrialDays]      = useState(30);
  const [rejectReason,   setRejectReason]   = useState('');
  const [activatePlan,   setActivatePlan]   = useState('starter');
  const [activateMonths, setActivateMonths] = useState(1);
  const [suspendReason,  setSuspendReason]  = useState('');
  const [extendDays,     setExtendDays]     = useState(7);
  const [notes,          setNotes]          = useState('');

  // Detail view
  const [detail, setDetail] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);

  const loadStats = useCallback(async () => {
    try {
      const { data } = await platformApi.get('/platform/stats');
      setStats(data.data);
    } catch {}
  }, []);

  const loadCompanies = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page, limit: LIMIT });
      if (search)       params.set('search', search);
      if (statusFilter) params.set('status', statusFilter);
      const { data } = await platformApi.get(`/platform/companies?${params}`);
      setCompanies(data.data || []);
      setTotal(data.total || 0);
    } catch {
      notify('Failed to load companies', 'error');
    } finally {
      setLoading(false);
    }
  }, [page, search, statusFilter]);

  useEffect(() => { loadStats(); }, [loadStats]);
  useEffect(() => { loadCompanies(); }, [loadCompanies]);

  const refresh = () => { loadStats(); loadCompanies(); };

  // Search with slight debounce
  useEffect(() => {
    const t = setTimeout(() => { setSearch(searchInput); setPage(1); }, 400);
    return () => clearTimeout(t);
  }, [searchInput]);

  // Open modal helpers
  const open = (type, co) => {
    setCompany(co);
    setModal(type);
    if (type === 'approve')  { setTrialDays(30); }
    if (type === 'reject')   { setRejectReason(''); }
    if (type === 'activate') { setActivatePlan('starter'); setActivateMonths(1); }
    if (type === 'suspend')  { setSuspendReason(''); }
    if (type === 'extend')   { setExtendDays(7); }
    if (type === 'notes')    { setNotes(co.notes || ''); }
  };
  const close = () => { setModal(null); setCompany(null); };

  const openDetail = async (co) => {
    setDetail(null);
    setModal('detail');
    setCompany(co);
    setDetailLoading(true);
    try {
      const { data } = await platformApi.get(`/platform/companies/${co._id}`);
      setDetail(data.data);
    } catch { notify('Failed to load company details', 'error'); }
    finally { setDetailLoading(false); }
  };

  // ── Action handlers ──────────────────────────────────────────────────────────
  const doApprove = async () => {
    setSaving(true);
    try {
      await platformApi.post(`/platform/companies/${company._id}/approve`, { trialDays });
      notify(`✅ ${company.name} approved — ${trialDays}-day trial started`);
      close(); refresh();
    } catch (e) { notify(e.response?.data?.message || 'Error', 'error'); }
    finally { setSaving(false); }
  };

  const doReject = async () => {
    if (!rejectReason.trim()) { notify('Rejection reason required', 'error'); return; }
    setSaving(true);
    try {
      await platformApi.post(`/platform/companies/${company._id}/reject`, { reason: rejectReason });
      notify(`❌ ${company.name} rejected`);
      close(); refresh();
    } catch (e) { notify(e.response?.data?.message || 'Error', 'error'); }
    finally { setSaving(false); }
  };

  const doActivate = async () => {
    setSaving(true);
    try {
      await platformApi.post(`/platform/companies/${company._id}/activate`, {
        plan: activatePlan, months: activateMonths,
      });
      notify(`⚡ ${company.name} activated on ${PLAN_LABELS[activatePlan]} plan`);
      close(); refresh();
    } catch (e) { notify(e.response?.data?.message || 'Error', 'error'); }
    finally { setSaving(false); }
  };

  const doSuspend = async () => {
    if (!suspendReason.trim()) { notify('Suspension reason required', 'error'); return; }
    setSaving(true);
    try {
      await platformApi.post(`/platform/companies/${company._id}/suspend`, { reason: suspendReason });
      notify(`🚫 ${company.name} suspended`);
      close(); refresh();
    } catch (e) { notify(e.response?.data?.message || 'Error', 'error'); }
    finally { setSaving(false); }
  };

  const doUnsuspend = async (co) => {
    if (!window.confirm(`Unsuspend ${co.name}?`)) return;
    try {
      await platformApi.post(`/platform/companies/${co._id}/unsuspend`);
      notify(`✅ ${co.name} unsuspended`);
      refresh();
    } catch (e) { notify(e.response?.data?.message || 'Error', 'error'); }
  };

  const doExtend = async () => {
    setSaving(true);
    try {
      await platformApi.post(`/platform/companies/${company._id}/extend`, { days: extendDays });
      notify(`📅 ${company.name} extended by ${extendDays} days`);
      close(); refresh();
    } catch (e) { notify(e.response?.data?.message || 'Error', 'error'); }
    finally { setSaving(false); }
  };

  const doSaveNotes = async () => {
    setSaving(true);
    try {
      await platformApi.put(`/platform/companies/${company._id}/notes`, { notes });
      notify('Notes saved');
      close(); refresh();
    } catch (e) { notify(e.response?.data?.message || 'Error', 'error'); }
    finally { setSaving(false); }
  };

  const pending = useMemo(() =>
    companies.filter(c => c.subscriptionStatus === 'pending_approval'), [companies]);

  const totalPages = Math.ceil(total / LIMIT);

  const fieldCls = `w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm
    focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-gray-50`;

  const btnIndigo = `inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-semibold
    bg-indigo-600 hover:bg-indigo-700 text-white transition-colors disabled:opacity-60`;
  const btnRed    = `inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-semibold
    bg-red-600 hover:bg-red-700 text-white transition-colors disabled:opacity-60`;
  const btnGreen  = `inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-semibold
    bg-green-600 hover:bg-green-700 text-white transition-colors disabled:opacity-60`;
  const btnGray   = `inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-semibold
    bg-gray-100 hover:bg-gray-200 text-gray-700 transition-colors disabled:opacity-60`;

  return (
    <div className="min-h-screen bg-gray-50">

      {/* ── Top navigation ────────────────────────────────────────────────────── */}
      <header style={{ background: 'linear-gradient(90deg, #1e1b4b, #312e81)' }}
        className="sticky top-0 z-40 shadow-lg">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 h-14 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="bg-white/15 rounded-xl p-1.5">
              <Shield size={18} className="text-white" />
            </div>
            <div>
              <span className="text-white font-bold text-sm">Platform Admin</span>
              <span className="text-indigo-300 text-xs ml-2 hidden sm:inline">FuelStation HR</span>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <button onClick={refresh}
              className="p-2 text-indigo-200 hover:text-white hover:bg-white/10 rounded-lg transition-colors"
              title="Refresh">
              <RefreshCw size={15} />
            </button>
            <span className="text-indigo-200 text-xs hidden sm:inline">{admin?.name}</span>
            <button onClick={logout}
              className="flex items-center gap-1.5 text-indigo-200 hover:text-white
                         text-xs font-medium px-3 py-1.5 rounded-lg hover:bg-white/10 transition-colors">
              <LogOut size={14} />
              <span className="hidden sm:inline">Sign out</span>
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 py-6 space-y-6">

        {/* ── Stats ─────────────────────────────────────────────────────────── */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          <StatCard label="Total Companies"  value={stats?.totalCompanies}            icon={Building2}    color="indigo" />
          <StatCard label="Pending Approval" value={stats?.byStatus?.pending_approval || 0} icon={Clock}   color="amber"  />
          <StatCard label="Active"           value={stats?.byStatus?.active  || 0}    icon={CheckCircle}  color="green"  />
          <StatCard label="On Trial"         value={stats?.byStatus?.trial   || 0}    icon={Calendar}     color="blue"   />
          <StatCard label="Expired"          value={stats?.byStatus?.expired || 0}    icon={XCircle}      color="red"    />
          <StatCard label="Total Users"      value={stats?.totalUsers}                icon={Users}        color="gray"   />
        </div>

        {/* ── Pending Approvals ─────────────────────────────────────────────── */}
        {pending.length > 0 && (
          <div className="bg-amber-50 border border-amber-200 rounded-2xl p-5">
            <div className="flex items-center gap-2 mb-4">
              <AlertTriangle size={18} className="text-amber-600" />
              <h2 className="font-bold text-amber-800 text-sm">
                {pending.length} Pending Approval{pending.length > 1 ? 's' : ''}
              </h2>
            </div>
            <div className="space-y-3">
              {pending.map(co => (
                <div key={co._id}
                  className="bg-white rounded-xl border border-amber-100 p-4 flex flex-col sm:flex-row sm:items-center gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="font-bold text-gray-900 text-sm">{co.name}</p>
                      <span className="text-xs font-mono bg-gray-100 text-gray-600 px-2 py-0.5 rounded-lg">
                        {co.companyCode}
                      </span>
                    </div>
                    <p className="text-xs text-gray-500 mt-0.5">{co.email}</p>
                    <p className="text-xs text-gray-400 mt-0.5">
                      Registered by {co.registeredBy || '—'} · {new Date(co.createdAt).toLocaleDateString()}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <button onClick={() => open('approve', co)}
                      className="flex items-center gap-1.5 px-3 py-1.5 bg-green-600 hover:bg-green-700
                                 text-white text-xs font-semibold rounded-lg transition-colors">
                      <Check size={13} /> Approve
                    </button>
                    <button onClick={() => open('reject', co)}
                      className="flex items-center gap-1.5 px-3 py-1.5 bg-red-600 hover:bg-red-700
                                 text-white text-xs font-semibold rounded-lg transition-colors">
                      <X size={13} /> Reject
                    </button>
                    <button onClick={() => openDetail(co)}
                      className="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors">
                      <Eye size={15} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── All Companies ─────────────────────────────────────────────────── */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">

          {/* Table header / filters */}
          <div className="px-5 py-4 border-b border-gray-100 flex flex-col sm:flex-row sm:items-center gap-3">
            <h2 className="font-bold text-gray-900 text-base flex-1">All Companies</h2>
            <div className="flex items-center gap-2 flex-wrap">
              {/* Search */}
              <div className="relative">
                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                <input
                  type="text"
                  placeholder="Search…"
                  value={searchInput}
                  onChange={e => setSearchInput(e.target.value)}
                  className="pl-8 pr-3 py-2 text-sm border border-gray-200 rounded-xl focus:outline-none
                             focus:ring-2 focus:ring-indigo-500 bg-gray-50 w-40"
                />
              </div>
              {/* Status filter */}
              <select
                value={statusFilter}
                onChange={e => { setStatusFilter(e.target.value); setPage(1); }}
                className="text-sm border border-gray-200 rounded-xl px-3 py-2 focus:outline-none
                           focus:ring-2 focus:ring-indigo-500 bg-gray-50 text-gray-700"
              >
                <option value="">All statuses</option>
                <option value="pending_approval">Pending</option>
                <option value="trial">Trial</option>
                <option value="active">Active</option>
                <option value="expired">Expired</option>
                <option value="suspended">Suspended</option>
              </select>
            </div>
          </div>

          {/* Table */}
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50/50">
                  <th className="text-left px-5 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Company</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide hidden md:table-cell">Code</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Status</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide hidden lg:table-cell">Plan</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide hidden lg:table-cell">Expires</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide hidden sm:table-cell">Joined</th>
                  <th className="text-right px-5 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {loading ? (
                  <tr>
                    <td colSpan={7} className="py-12 text-center text-gray-400">
                      <div className="flex items-center justify-center gap-2">
                        <Spinner /> Loading…
                      </div>
                    </td>
                  </tr>
                ) : companies.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="py-12 text-center text-gray-400 text-sm">
                      No companies found
                    </td>
                  </tr>
                ) : companies.map(co => {
                  const expiry = co.subscriptionStatus === 'trial'
                    ? co.trialEndsAt
                    : co.subscriptionEndsAt;
                  return (
                    <tr key={co._id} className="hover:bg-gray-50/50 transition-colors">
                      <td className="px-5 py-3.5">
                        <p className="font-semibold text-gray-900">{co.name}</p>
                        <p className="text-xs text-gray-400">{co.email}</p>
                      </td>
                      <td className="px-4 py-3.5 hidden md:table-cell">
                        <span className="font-mono text-xs bg-gray-100 text-gray-600 px-2 py-1 rounded-lg">
                          {co.companyCode}
                        </span>
                      </td>
                      <td className="px-4 py-3.5">
                        <StatusBadge status={co.subscriptionStatus} />
                      </td>
                      <td className="px-4 py-3.5 text-gray-600 hidden lg:table-cell capitalize text-xs">
                        {PLAN_LABELS[co.plan] || co.plan}
                      </td>
                      <td className="px-4 py-3.5 text-gray-500 text-xs hidden lg:table-cell">
                        {expiry ? new Date(expiry).toLocaleDateString() : '—'}
                      </td>
                      <td className="px-4 py-3.5 text-gray-400 text-xs hidden sm:table-cell">
                        {new Date(co.createdAt).toLocaleDateString()}
                      </td>
                      <td className="px-5 py-3.5">
                        <ActionMenu co={co} open={open} openDetail={openDetail} doUnsuspend={doUnsuspend} />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="px-5 py-4 border-t border-gray-100 flex items-center justify-between">
              <p className="text-xs text-gray-500">
                {total} compan{total === 1 ? 'y' : 'ies'} · page {page} of {totalPages}
              </p>
              <div className="flex items-center gap-1">
                <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}
                  className="p-1.5 rounded-lg text-gray-400 hover:text-gray-700 hover:bg-gray-100
                             disabled:opacity-40 disabled:cursor-not-allowed transition-colors">
                  <ChevronLeft size={16} />
                </button>
                {Array.from({ length: Math.min(totalPages, 5) }, (_, i) => {
                  const pg = page <= 3 ? i + 1
                    : page >= totalPages - 2 ? totalPages - 4 + i
                    : page - 2 + i;
                  if (pg < 1 || pg > totalPages) return null;
                  return (
                    <button key={pg} onClick={() => setPage(pg)}
                      className={`w-8 h-8 rounded-lg text-xs font-semibold transition-colors
                        ${pg === page
                          ? 'bg-indigo-600 text-white'
                          : 'text-gray-500 hover:bg-gray-100'}`}>
                      {pg}
                    </button>
                  );
                })}
                <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages}
                  className="p-1.5 rounded-lg text-gray-400 hover:text-gray-700 hover:bg-gray-100
                             disabled:opacity-40 disabled:cursor-not-allowed transition-colors">
                  <ChevronRight size={16} />
                </button>
              </div>
            </div>
          )}
        </div>

        {/* ── Recent Sign-ups ──────────────────────────────────────────────── */}
        {stats?.recentSignups?.length > 0 && (
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
            <h3 className="font-bold text-gray-900 text-sm mb-4 flex items-center gap-2">
              <TrendingUp size={16} className="text-indigo-500" />
              Recent Sign-ups
            </h3>
            <div className="space-y-2">
              {stats.recentSignups.map(co => (
                <div key={co._id} className="flex items-center gap-3 py-1.5">
                  <div className="w-8 h-8 rounded-xl bg-indigo-100 flex items-center justify-center shrink-0">
                    <Building2 size={14} className="text-indigo-600" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-gray-800 truncate">{co.name}</p>
                    <p className="text-xs text-gray-400">{co.companyCode}</p>
                  </div>
                  <StatusBadge status={co.subscriptionStatus} />
                  <p className="text-xs text-gray-400 shrink-0 hidden sm:block">
                    {new Date(co.createdAt).toLocaleDateString()}
                  </p>
                </div>
              ))}
            </div>
          </div>
        )}
      </main>

      {/* ── Modals ────────────────────────────────────────────────────────────── */}

      {/* Approve */}
      {modal === 'approve' && (
        <Modal title={`Approve — ${company?.name}`} onClose={close}>
          <p className="text-sm text-gray-600 mb-5">
            Company will be approved and immediately start a trial subscription.
          </p>
          <label className="block text-xs font-semibold text-gray-700 mb-1.5">Trial Period (days)</label>
          <input type="number" min={1} max={365} value={trialDays}
            onChange={e => setTrialDays(Number(e.target.value))}
            className={fieldCls} />
          <p className="text-xs text-gray-400 mt-1.5 mb-5">
            Trial ends: {new Date(Date.now() + trialDays * 86400000).toDateString()}
          </p>
          <div className="flex gap-3 justify-end">
            <button onClick={close} className={btnGray}>Cancel</button>
            <button onClick={doApprove} disabled={saving} className={btnGreen}>
              {saving ? <Spinner /> : <Check size={15} />} Approve
            </button>
          </div>
        </Modal>
      )}

      {/* Reject */}
      {modal === 'reject' && (
        <Modal title={`Reject — ${company?.name}`} onClose={close}>
          <p className="text-sm text-gray-600 mb-5">
            This will deny the registration. The company will not be able to log in.
          </p>
          <label className="block text-xs font-semibold text-gray-700 mb-1.5">Reason *</label>
          <textarea rows={3} value={rejectReason} onChange={e => setRejectReason(e.target.value)}
            placeholder="e.g. Incomplete information, duplicate account…"
            className={`${fieldCls} resize-none`} />
          <div className="flex gap-3 justify-end mt-5">
            <button onClick={close} className={btnGray}>Cancel</button>
            <button onClick={doReject} disabled={saving} className={btnRed}>
              {saving ? <Spinner /> : <XCircle size={15} />} Reject
            </button>
          </div>
        </Modal>
      )}

      {/* Activate */}
      {modal === 'activate' && (
        <Modal title={`Activate Subscription — ${company?.name}`} onClose={close}>
          <p className="text-sm text-gray-600 mb-5">
            Move this company from trial/expired to a paid active subscription.
          </p>
          <div className="space-y-4 mb-5">
            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-1.5">Plan</label>
              <select value={activatePlan} onChange={e => setActivatePlan(e.target.value)} className={fieldCls}>
                <option value="starter">Starter</option>
                <option value="professional">Professional</option>
                <option value="enterprise">Enterprise</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-1.5">Duration (months)</label>
              <input type="number" min={1} max={24} value={activateMonths}
                onChange={e => setActivateMonths(Number(e.target.value))}
                className={fieldCls} />
              <p className="text-xs text-gray-400 mt-1">
                Expires: {new Date(Date.now() + activateMonths * 30 * 86400000).toDateString()}
              </p>
            </div>
          </div>
          <div className="flex gap-3 justify-end">
            <button onClick={close} className={btnGray}>Cancel</button>
            <button onClick={doActivate} disabled={saving} className={btnIndigo}>
              {saving ? <Spinner /> : <Zap size={15} />} Activate
            </button>
          </div>
        </Modal>
      )}

      {/* Suspend */}
      {modal === 'suspend' && (
        <Modal title={`Suspend — ${company?.name}`} onClose={close}>
          <p className="text-sm text-gray-600 mb-5">
            All users of this company will be immediately blocked from logging in.
          </p>
          <label className="block text-xs font-semibold text-gray-700 mb-1.5">Reason *</label>
          <textarea rows={3} value={suspendReason} onChange={e => setSuspendReason(e.target.value)}
            placeholder="e.g. Non-payment, policy violation…"
            className={`${fieldCls} resize-none`} />
          <div className="flex gap-3 justify-end mt-5">
            <button onClick={close} className={btnGray}>Cancel</button>
            <button onClick={doSuspend} disabled={saving} className={btnRed}>
              {saving ? <Spinner /> : <Ban size={15} />} Suspend
            </button>
          </div>
        </Modal>
      )}

      {/* Extend */}
      {modal === 'extend' && (
        <Modal title={`Extend — ${company?.name}`} onClose={close}>
          <p className="text-sm text-gray-600 mb-5">
            Add days to the current trial or subscription end date.
          </p>
          <label className="block text-xs font-semibold text-gray-700 mb-1.5">Days to add</label>
          <input type="number" min={1} max={365} value={extendDays}
            onChange={e => setExtendDays(Number(e.target.value))}
            className={fieldCls} />
          <div className="flex gap-3 justify-end mt-5">
            <button onClick={close} className={btnGray}>Cancel</button>
            <button onClick={doExtend} disabled={saving} className={btnIndigo}>
              {saving ? <Spinner /> : <Plus size={15} />} Extend
            </button>
          </div>
        </Modal>
      )}

      {/* Notes */}
      {modal === 'notes' && (
        <Modal title={`Internal Notes — ${company?.name}`} onClose={close}>
          <p className="text-xs text-gray-400 mb-3">Visible only to platform admins.</p>
          <textarea rows={5} value={notes} onChange={e => setNotes(e.target.value)}
            placeholder="Internal notes, follow-up reminders, billing notes…"
            className={`${fieldCls} resize-none`} />
          <div className="flex gap-3 justify-end mt-5">
            <button onClick={close} className={btnGray}>Cancel</button>
            <button onClick={doSaveNotes} disabled={saving} className={btnIndigo}>
              {saving ? <Spinner /> : <FileText size={15} />} Save Notes
            </button>
          </div>
        </Modal>
      )}

      {/* Company Detail */}
      {modal === 'detail' && company && (
        <Modal title={company.name} onClose={close} width="max-w-2xl">
          {detailLoading ? (
            <div className="flex items-center justify-center py-12 gap-2 text-gray-400">
              <Spinner /> Loading…
            </div>
          ) : detail ? (
            <div className="space-y-5">
              {/* Info grid */}
              <div className="grid grid-cols-2 gap-3">
                {[
                  ['Company Code', detail.companyCode],
                  ['Email',        detail.email],
                  ['Phone',        detail.phone || '—'],
                  ['Country',      detail.country || '—'],
                  ['Status',       <StatusBadge key="s" status={detail.subscriptionStatus} />],
                  ['Plan',         PLAN_LABELS[detail.plan] || detail.plan],
                  ['Trial Ends',   detail.trialEndsAt ? new Date(detail.trialEndsAt).toLocaleDateString() : '—'],
                  ['Sub Ends',     detail.subscriptionEndsAt ? new Date(detail.subscriptionEndsAt).toLocaleDateString() : '—'],
                  ['Registered By',detail.registeredBy || '—'],
                  ['Joined',       new Date(detail.createdAt).toLocaleDateString()],
                ].map(([k, v]) => (
                  <div key={k} className="bg-gray-50 rounded-xl p-3">
                    <p className="text-xs text-gray-400 font-medium mb-0.5">{k}</p>
                    <p className="text-sm font-semibold text-gray-800">{v}</p>
                  </div>
                ))}
              </div>

              {/* Suspension info */}
              {detail.suspendedReason && (
                <div className="bg-red-50 border border-red-100 rounded-xl p-3">
                  <p className="text-xs font-semibold text-red-700 mb-0.5">Suspended</p>
                  <p className="text-sm text-red-600">{detail.suspendedReason}</p>
                </div>
              )}

              {/* Notes */}
              {detail.notes && (
                <div className="bg-amber-50 border border-amber-100 rounded-xl p-3">
                  <p className="text-xs font-semibold text-amber-700 mb-0.5">Internal Notes</p>
                  <p className="text-sm text-amber-800 whitespace-pre-wrap">{detail.notes}</p>
                </div>
              )}

              {/* Users */}
              {detail.users?.length > 0 && (
                <div>
                  <p className="text-xs font-semibold text-gray-600 mb-2 uppercase tracking-wide">
                    Users ({detail.users.length})
                  </p>
                  <div className="space-y-1.5 max-h-48 overflow-y-auto">
                    {detail.users.map(u => (
                      <div key={u._id} className="flex items-center gap-3 bg-gray-50 rounded-xl px-3 py-2">
                        <div className="w-7 h-7 rounded-full bg-indigo-100 flex items-center justify-center shrink-0">
                          <span className="text-xs font-bold text-indigo-600">{u.name[0]}</span>
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-semibold text-gray-800 truncate">{u.name}</p>
                          <p className="text-xs text-gray-400 truncate">{u.email}</p>
                        </div>
                        <span className="text-xs bg-gray-200 text-gray-600 px-2 py-0.5 rounded-full capitalize">
                          {u.role?.replace(/_/g, ' ')}
                        </span>
                        {!u.isActive && (
                          <span className="text-xs bg-red-100 text-red-600 px-2 py-0.5 rounded-full">Inactive</span>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Quick actions */}
              <div className="flex flex-wrap gap-2 pt-2 border-t border-gray-100">
                {detail.subscriptionStatus === 'pending_approval' && (
                  <button onClick={() => { close(); open('approve', detail); }} className={`${btnGreen} text-xs`}>
                    <Check size={13} /> Approve
                  </button>
                )}
                {detail.subscriptionStatus !== 'active' && detail.subscriptionStatus !== 'pending_approval' && (
                  <button onClick={() => { close(); open('activate', detail); }} className={`${btnIndigo} text-xs`}>
                    <Zap size={13} /> Activate
                  </button>
                )}
                {detail.subscriptionStatus !== 'suspended' && (
                  <button onClick={() => { close(); open('suspend', detail); }} className={`${btnRed} text-xs`}>
                    <Ban size={13} /> Suspend
                  </button>
                )}
                {detail.subscriptionStatus === 'suspended' && (
                  <button onClick={() => { close(); doUnsuspend(detail); }} className={`${btnGreen} text-xs`}>
                    <Check size={13} /> Unsuspend
                  </button>
                )}
                <button onClick={() => { close(); open('extend', detail); }} className={`${btnGray} text-xs`}>
                  <Plus size={13} /> Extend
                </button>
                <button onClick={() => { close(); open('notes', detail); }} className={`${btnGray} text-xs`}>
                  <FileText size={13} /> Notes
                </button>
              </div>
            </div>
          ) : (
            <p className="text-sm text-gray-400 text-center py-8">Failed to load details</p>
          )}
        </Modal>
      )}
    </div>
  );
}

// ── Action Menu (per-row dropdown) ──────────────────────────────────────────
function ActionMenu({ co, open, openDetail, doUnsuspend }) {
  const [show, setShow] = useState(false);

  const actions = [
    { label: 'View Details',  icon: Eye,      fn: () => openDetail(co),          always: true },
    { label: 'Approve',       icon: Check,    fn: () => open('approve', co),      show: co.subscriptionStatus === 'pending_approval' },
    { label: 'Reject',        icon: XCircle,  fn: () => open('reject', co),       show: co.subscriptionStatus === 'pending_approval' },
    { label: 'Activate',      icon: Zap,      fn: () => open('activate', co),     show: !['active','pending_approval'].includes(co.subscriptionStatus) },
    { label: 'Suspend',       icon: Ban,      fn: () => open('suspend', co),      show: co.subscriptionStatus !== 'suspended' },
    { label: 'Unsuspend',     icon: Check,    fn: () => { setShow(false); doUnsuspend(co); }, show: co.subscriptionStatus === 'suspended' },
    { label: 'Extend',        icon: Plus,     fn: () => open('extend', co),       always: true },
    { label: 'Edit Notes',    icon: FileText, fn: () => open('notes', co),        always: true },
  ].filter(a => a.always || a.show);

  return (
    <div className="relative flex justify-end">
      <button onClick={() => setShow(s => !s)}
        className="p-1.5 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-colors">
        <MoreHorizontal size={16} />
      </button>
      {show && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setShow(false)} />
          <div className="absolute right-0 top-8 z-20 bg-white border border-gray-100 rounded-xl shadow-xl
                          py-1 min-w-[160px] overflow-hidden">
            {actions.map(a => (
              <button key={a.label}
                onClick={() => { setShow(false); a.fn(); }}
                className="flex items-center gap-2.5 w-full px-4 py-2.5 text-left text-sm
                           text-gray-700 hover:bg-gray-50 transition-colors">
                <a.icon size={14} className="text-gray-400 shrink-0" />
                {a.label}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
