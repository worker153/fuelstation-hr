import { useState, useEffect, useCallback } from 'react';
import {
  AlertTriangle, Plus, Check, X, Clock, CheckCircle, XCircle,
  ChevronDown, Building2, Users, Loader, Trash2, ReceiptText,
  DollarSign, Filter
} from 'lucide-react';
import api from '../utils/api';
import { useNotify } from '../context/NotificationContext';
import { useAuth } from '../context/AuthContext';

const MONTHS = ['January','February','March','April','May','June',
                'July','August','September','October','November','December'];

const fmt = n => `₦${Number(n||0).toLocaleString('en-NG', { minimumFractionDigits: 0 })}`;

const REASON_OPTIONS = [
  { value: 'cash_shortage',      label: 'Cash Shortage'      },
  { value: 'fuel_shortage',      label: 'Fuel Shortage'      },
  { value: 'equipment_damage',   label: 'Equipment Damage'   },
  { value: 'customer_complaint', label: 'Customer Complaint' },
  { value: 'late_arrival',       label: 'Late Arrival'       },
  { value: 'absent',             label: 'Absent'             },
  { value: 'early_departure',    label: 'Early Departure'    },
  { value: 'other',              label: 'Other'              },
];

const REASON_LABELS = Object.fromEntries(REASON_OPTIONS.map(r => [r.value, r.label]));

const SOURCE_CFG = {
  late_arrival:    { icon: '🕐', label: 'Auto · Late',        cls: 'bg-amber-50 text-amber-700 border border-amber-200' },
  absent:          { icon: '❌', label: 'Auto · Absent',      cls: 'bg-red-50 text-red-700 border border-red-200' },
  no_clockin:      { icon: '👻', label: 'Auto · No Show',     cls: 'bg-red-50 text-red-700 border border-red-200' },
  early_departure: { icon: '🚪', label: 'Auto · Early Exit',  cls: 'bg-orange-50 text-orange-700 border border-orange-200' },
};

const SourceBadge = ({ source }) => {
  const cfg = SOURCE_CFG[source];
  if (!cfg) return null;
  return (
    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${cfg.cls}`}>
      {cfg.icon} {cfg.label}
    </span>
  );
};

const StatusBadge = ({ status }) => {
  const map = {
    pending:  { cls: 'bg-amber-100 text-amber-700',  icon: Clock,        label: 'Pending'  },
    approved: { cls: 'bg-green-100 text-green-700',  icon: CheckCircle,  label: 'Approved' },
    rejected: { cls: 'bg-red-100   text-red-700',    icon: XCircle,      label: 'Rejected' },
  };
  const { cls, icon: Icon, label } = map[status] || map.pending;
  return (
    <span className={`inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full ${cls}`}>
      <Icon size={11} /> {label}
    </span>
  );
};

// ─── Submit Shortage Modal ─────────────────────────────────────────────────────
function SubmitModal({ workers, onClose, onSubmitted }) {
  const notify = useNotify();
  const now    = new Date();
  const [workerId, setWorkerId] = useState('');
  const [month,    setMonth   ] = useState(now.getMonth() + 1);
  const [year,     setYear    ] = useState(now.getFullYear());
  const [date,     setDate    ] = useState(now.toISOString().split('T')[0]);
  const [amount,   setAmount  ] = useState('');
  const [reason,   setReason  ] = useState('cash_shortage');
  const [notes,    setNotes   ] = useState('');
  const [loading,  setLoading ] = useState(false);
  const years = Array.from({ length: 3 }, (_, i) => now.getFullYear() - i);

  const submit = async e => {
    e.preventDefault();
    if (!workerId) return notify('Select a worker', 'error');
    if (!amount || Number(amount) <= 0) return notify('Enter a valid amount', 'error');
    setLoading(true);
    try {
      const { data } = await api.post('/shortages', { workerId, month, year, date, amount: Number(amount), reason, notes });
      notify('Shortage submitted for approval ✓');
      onSubmitted(data.data);
    } catch (err) {
      notify(err.response?.data?.message || 'Failed to submit', 'error');
    } finally { setLoading(false); }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="bg-white rounded-2xl w-full max-w-md shadow-2xl">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-red-100 flex items-center justify-center">
              <AlertTriangle size={15} className="text-red-600" />
            </div>
            <p className="font-bold text-gray-900 text-sm">Report Shortage</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X size={18} /></button>
        </div>

        <form onSubmit={submit} className="px-5 py-5 space-y-4">
          <div>
            <label className="label">Worker *</label>
            <select className="input" value={workerId} onChange={e => setWorkerId(e.target.value)} required>
              <option value="">— Select worker —</option>
              {workers.map(w => (
                <option key={w._id} value={w._id}>{w.fullName} ({w.role})</option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Month *</label>
              <select className="input" value={month} onChange={e => setMonth(Number(e.target.value))}>
                {MONTHS.map((m, i) => <option key={m} value={i+1}>{m}</option>)}
              </select>
            </div>
            <div>
              <label className="label">Year *</label>
              <select className="input" value={year} onChange={e => setYear(Number(e.target.value))}>
                {years.map(y => <option key={y} value={y}>{y}</option>)}
              </select>
            </div>
          </div>

          <div>
            <label className="label">Incident Date</label>
            <input type="date" className="input" value={date} onChange={e => setDate(e.target.value)} />
          </div>

          <div>
            <label className="label">Shortage Amount (₦) *</label>
            <input type="number" min="1" className="input" placeholder="e.g. 5000"
              value={amount} onChange={e => setAmount(e.target.value)} required />
          </div>

          <div>
            <label className="label">Reason *</label>
            <select className="input" value={reason} onChange={e => setReason(e.target.value)}>
              {REASON_OPTIONS.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
            </select>
          </div>

          <div>
            <label className="label">Notes</label>
            <textarea className="input" rows={2} placeholder="Brief description of the shortage..."
              value={notes} onChange={e => setNotes(e.target.value)} />
          </div>

          <div className="flex gap-3 pt-1">
            <button type="submit" disabled={loading}
              className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl bg-red-600 text-white font-medium text-sm hover:bg-red-700 transition-colors">
              {loading ? <Loader size={14} className="animate-spin" /> : <><AlertTriangle size={14} /> Submit for Approval</>}
            </button>
            <button type="button" onClick={onClose} className="btn-secondary">Cancel</button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── Reject Modal ─────────────────────────────────────────────────────────────
function RejectModal({ shortage, onClose, onRejected }) {
  const notify = useNotify();
  const [reason,  setReason ] = useState('');
  const [loading, setLoading] = useState(false);

  const submit = async e => {
    e.preventDefault();
    setLoading(true);
    try {
      const { data } = await api.post(`/shortages/${shortage._id}/reject`, { reason });
      notify('Shortage rejected');
      onRejected(data.data);
    } catch (err) {
      notify(err.response?.data?.message || 'Failed', 'error');
    } finally { setLoading(false); }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="bg-white rounded-2xl w-full max-w-sm shadow-2xl">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <p className="font-bold text-gray-900 text-sm">Reject Shortage</p>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X size={18} /></button>
        </div>
        <form onSubmit={submit} className="px-5 py-5 space-y-4">
          <div className="p-3 bg-gray-50 rounded-lg text-sm">
            <p className="font-medium text-gray-800">{shortage.workerName}</p>
            <p className="text-gray-500">{fmt(shortage.amount)} — {MONTHS[(shortage.month||1)-1]} {shortage.year}</p>
          </div>
          <div>
            <label className="label">Reason for rejection (optional)</label>
            <textarea className="input" rows={2} placeholder="Reason..."
              value={reason} onChange={e => setReason(e.target.value)} />
          </div>
          <div className="flex gap-3">
            <button type="submit" disabled={loading}
              className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl bg-red-600 text-white font-medium text-sm hover:bg-red-700">
              {loading ? <Loader size={14} className="animate-spin" /> : 'Reject'}
            </button>
            <button type="button" onClick={onClose} className="btn-secondary">Cancel</button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── Main Shortages Page ──────────────────────────────────────────────────────
export default function Shortages() {
  const notify                 = useNotify();
  const { user, can, isSuperAdmin } = useAuth();

  const isAdmin      = isSuperAdmin() || ['admin'].includes(user?.role) || can('manageBranches');
  const canSubmit    = can('submitShortages') || isAdmin;

  const now          = new Date();
  const [shortages,  setShortages ] = useState([]);
  const [workers,    setWorkers   ] = useState([]);
  const [loading,    setLoading   ] = useState(true);
  const [showSubmit, setShowSubmit] = useState(false);
  const [rejectItem, setRejectItem] = useState(null);
  const [filterStatus, setFilterStatus] = useState('all');
  const [filterMonth,  setFilterMonth ] = useState('');
  const [filterYear,   setFilterYear  ] = useState(now.getFullYear());

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (filterStatus && filterStatus !== 'all') params.set('status', filterStatus);
      if (filterMonth)  params.set('month', filterMonth);
      if (filterYear)   params.set('year',  filterYear);

      // Build worker query — pass supervisor's branch/shift explicitly as extra guard
      const wParams = new URLSearchParams();
      if (!isAdmin && user?.branchId) wParams.set('branchId', user.branchId);
      if (!isAdmin && user?.shiftId)  wParams.set('shiftId',  user.shiftId);

      const [sRes, wRes] = await Promise.all([
        api.get(`/shortages?${params}`),
        canSubmit ? api.get(`/workers/active-workers?${wParams}`) : Promise.resolve({ data: { data: [] } })
      ]);
      setShortages(sRes.data.data);
      setWorkers(wRes.data.data || []);
    } catch { notify('Failed to load shortages', 'error'); }
    finally { setLoading(false); }
  }, [filterStatus, filterMonth, filterYear]);

  useEffect(() => { load(); }, [load]);

  const handleApprove = async (id) => {
    try {
      const { data } = await api.post(`/shortages/${id}/approve`);
      setShortages(prev => prev.map(s => s._id === id ? data.data : s));
      notify('Shortage approved ✓');
    } catch (err) { notify(err.response?.data?.message || 'Failed', 'error'); }
  };

  const handleDelete = async (id) => {
    if (!confirm('Delete this shortage record?')) return;
    try {
      await api.delete(`/shortages/${id}`);
      setShortages(prev => prev.filter(s => s._id !== id));
      notify('Deleted');
    } catch (err) { notify(err.response?.data?.message || 'Failed', 'error'); }
  };

  const pendingCount = shortages.filter(s => s.status === 'pending').length;

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-xl font-bold text-gray-900 flex items-center gap-2">
            Shortage Reports
            {isAdmin && pendingCount > 0 && (
              <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-amber-500 text-white">
                {pendingCount} pending
              </span>
            )}
          </h1>
          <p className="text-sm text-gray-500 mt-0.5">
            {isAdmin ? 'All shortage submissions — from supervisors and worker self-service (PIN)' : 'Submit and track shortage reports'}
          </p>
        </div>
        {canSubmit && (
          <button onClick={() => setShowSubmit(true)} className="btn-primary">
            <Plus size={14} /> Report Shortage
          </button>
        )}
      </div>

      {/* Filters */}
      <div className="card p-4 flex flex-wrap gap-3 items-center">
        <Filter size={14} className="text-gray-400" />
        {isAdmin && (
          <select className="input max-w-[130px]" value={filterStatus} onChange={e => setFilterStatus(e.target.value)}>
            <option value="all">All statuses</option>
            <option value="pending">Pending</option>
            <option value="approved">Approved</option>
            <option value="rejected">Rejected</option>
          </select>
        )}
        <select className="input max-w-[130px]" value={filterMonth} onChange={e => setFilterMonth(e.target.value)}>
          <option value="">All months</option>
          {MONTHS.map((m, i) => <option key={m} value={i+1}>{m}</option>)}
        </select>
        <select className="input max-w-[110px]" value={filterYear} onChange={e => setFilterYear(e.target.value)}>
          {Array.from({ length: 3 }, (_, i) => now.getFullYear() - i).map(y =>
            <option key={y} value={y}>{y}</option>
          )}
        </select>
      </div>

      {/* Admin: pending approvals highlighted */}
      {isAdmin && shortages.filter(s => s.status === 'pending').length > 0 && filterStatus !== 'approved' && filterStatus !== 'rejected' && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4">
          <p className="text-xs font-semibold text-amber-700 uppercase tracking-wide mb-3 flex items-center gap-1.5">
            <Clock size={12} /> Pending Approval ({shortages.filter(s => s.status === 'pending').length})
          </p>
          <div className="space-y-2">
            {shortages.filter(s => s.status === 'pending').map(s => (
              <PendingRow key={s._id} shortage={s}
                onApprove={() => handleApprove(s._id)}
                onReject={() => setRejectItem(s)}
                onDelete={() => handleDelete(s._id)}
              />
            ))}
          </div>
        </div>
      )}

      {/* Full list */}
      <div className="card overflow-hidden">
        <div className="px-5 py-3 border-b border-gray-100 flex items-center justify-between">
          <p className="font-semibold text-gray-800 text-sm">
            {filterStatus === 'pending' ? 'Pending' : filterStatus === 'approved' ? 'Approved' : filterStatus === 'rejected' ? 'Rejected' : 'All'} Shortages
          </p>
          <span className="text-xs text-gray-400">{shortages.length} record{shortages.length !== 1 ? 's' : ''}</span>
        </div>

        {loading ? (
          <div className="py-10 flex justify-center"><Loader size={20} className="animate-spin text-brand-500" /></div>
        ) : shortages.length === 0 ? (
          <div className="py-10 text-center text-gray-400">
            <AlertTriangle size={28} className="mx-auto mb-2 text-gray-300" />
            <p className="text-sm">No shortage records found</p>
          </div>
        ) : (
          <div className="divide-y divide-gray-50">
            {shortages.map(s => (
              <ShortageRow key={s._id} shortage={s} isAdmin={isAdmin}
                onApprove={() => handleApprove(s._id)}
                onReject={() => setRejectItem(s)}
                onDelete={() => handleDelete(s._id)}
              />
            ))}
          </div>
        )}
      </div>

      {/* Modals */}
      {showSubmit && (
        <SubmitModal workers={workers} onClose={() => setShowSubmit(false)}
          onSubmitted={s => { setShortages(prev => [s, ...prev]); setShowSubmit(false); }} />
      )}
      {rejectItem && (
        <RejectModal shortage={rejectItem} onClose={() => setRejectItem(null)}
          onRejected={updated => { setShortages(prev => prev.map(s => s._id === updated._id ? updated : s)); setRejectItem(null); }} />
      )}
    </div>
  );
}

// ─── Pending row (admin highlight panel) ─────────────────────────────────────
function PendingRow({ shortage, onApprove, onReject, onDelete }) {
  const [approving, setApproving] = useState(false);

  const approve = async () => {
    setApproving(true);
    await onApprove();
    setApproving(false);
  };

  return (
    <div className="flex items-start gap-3 bg-white rounded-xl border border-amber-100 px-4 py-3 flex-wrap">
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <p className="font-semibold text-gray-900 text-sm">{shortage.workerName}</p>
          <span className="text-xs text-gray-400">{shortage.workerRole}</span>
          {shortage.branchName && (
            <span className="text-xs text-brand-600 bg-brand-50 px-1.5 py-0.5 rounded-full flex items-center gap-1">
              <Building2 size={10} /> {shortage.branchName}
            </span>
          )}
          <SourceBadge source={shortage.source} />
        </div>
        <div className="flex items-center gap-3 mt-1 flex-wrap">
          <span className="text-sm font-bold text-red-600">{fmt(shortage.amount)}</span>
          {shortage.reason && shortage.reason !== 'other' && (
            <span className="text-xs text-gray-500 bg-gray-100 px-1.5 py-0.5 rounded-full">
              {REASON_LABELS[shortage.reason] || shortage.reason}
            </span>
          )}
          <span className="text-xs text-gray-400">{MONTHS[(shortage.month||1)-1]} {shortage.year}</span>
          {shortage.date && <span className="text-xs text-gray-400">{new Date(shortage.date).toLocaleDateString('en-NG')}</span>}
          {shortage.source && shortage.source !== 'manual'
            ? <span className="text-xs text-purple-600 bg-purple-50 px-1.5 py-0.5 rounded-full">Auto-deduction</span>
            : shortage.submittedBy?.name
              ? <span className="text-xs text-gray-400">by {shortage.submittedBy.name}</span>
              : <span className="text-xs text-blue-500 bg-blue-50 px-1.5 py-0.5 rounded-full">🔑 PIN</span>
          }
        </div>
        {shortage.notes && <p className="text-xs text-gray-500 mt-1 italic">"{shortage.notes}"</p>}
      </div>
      <div className="flex gap-2 shrink-0">
        <button onClick={approve} disabled={approving}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-green-600 text-white text-xs font-medium hover:bg-green-700 transition-colors">
          {approving ? <Loader size={12} className="animate-spin" /> : <><Check size={12} /> Approve</>}
        </button>
        <button onClick={onReject}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-red-200 bg-red-50 text-red-600 text-xs font-medium hover:bg-red-100 transition-colors">
          <X size={12} /> Reject
        </button>
      </div>
    </div>
  );
}

// ─── Shortage row (full list) ──────────────────────────────────────────────────
function ShortageRow({ shortage, isAdmin, onApprove, onReject, onDelete }) {
  const [approving, setApproving] = useState(false);

  const approve = async () => {
    setApproving(true);
    await onApprove();
    setApproving(false);
  };

  return (
    <div className="flex items-start gap-4 px-5 py-4 hover:bg-gray-50/50 flex-wrap">
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <p className="font-medium text-gray-900 text-sm">{shortage.workerName}</p>
          <span className="text-xs text-gray-400">{shortage.workerRole}</span>
          {shortage.branchName && (
            <span className="text-xs text-gray-500">· {shortage.branchName}</span>
          )}
          <SourceBadge source={shortage.source} />
        </div>
        <div className="flex items-center gap-3 mt-0.5 flex-wrap">
          <span className="text-sm font-bold text-red-600">{fmt(shortage.amount)}</span>
          {shortage.reason && shortage.reason !== 'other' && (
            <span className="text-xs text-gray-500 bg-gray-100 px-1.5 py-0.5 rounded-full">
              {REASON_LABELS[shortage.reason] || shortage.reason}
            </span>
          )}
          <span className="text-xs text-gray-400">{MONTHS[(shortage.month||1)-1]} {shortage.year}</span>
          {shortage.date && <span className="text-xs text-gray-400">{new Date(shortage.date).toLocaleDateString('en-NG')}</span>}
        </div>
        {shortage.notes && <p className="text-xs text-gray-500 mt-0.5 italic">"{shortage.notes}"</p>}
        {shortage.status === 'rejected' && shortage.rejectionReason && (
          <p className="text-xs text-red-500 mt-0.5">Reason: {shortage.rejectionReason}</p>
        )}
        <p className="text-xs text-gray-400 mt-0.5 flex items-center gap-1.5 flex-wrap">
          {shortage.source && shortage.source !== 'manual'
            ? <span className="inline-flex items-center gap-1 bg-purple-50 text-purple-600 px-1.5 py-0.5 rounded-full font-medium">Auto-deduction</span>
            : shortage.submittedBy?.name
              ? <>Submitted by {shortage.submittedBy.name}</>
              : <span className="inline-flex items-center gap-1 bg-blue-50 text-blue-600 px-1.5 py-0.5 rounded-full font-medium">
                  🔑 Self-service (PIN)
                </span>
          }
          {' · '}
          {new Date(shortage.createdAt).toLocaleDateString('en-NG', { day:'numeric', month:'short', year:'numeric' })}
          {shortage.reviewedBy?.name && ` · Reviewed by ${shortage.reviewedBy.name}`}
        </p>
      </div>

      <div className="flex items-center gap-2 shrink-0">
        <StatusBadge status={shortage.status} />
        {isAdmin && shortage.status === 'pending' && (
          <>
            <button onClick={approve} disabled={approving}
              className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-green-600 text-white text-xs font-medium hover:bg-green-700 transition-colors">
              {approving ? <Loader size={11} className="animate-spin" /> : <><Check size={11} /> Approve</>}
            </button>
            <button onClick={onReject}
              className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-red-200 bg-red-50 text-red-600 text-xs font-medium hover:bg-red-100">
              <X size={11} /> Reject
            </button>
          </>
        )}
        {(shortage.status === 'pending' || isAdmin) && (
          <button onClick={onDelete}
            className="p-1.5 rounded-lg text-gray-400 hover:text-red-500 hover:bg-red-50 transition-colors">
            <Trash2 size={14} />
          </button>
        )}
      </div>
    </div>
  );
}
