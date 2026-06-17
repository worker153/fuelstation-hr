import { useState, useEffect, useCallback } from 'react';
import {
  AlertTriangle, Plus, Check, X, Clock, CheckCircle, XCircle,
  ChevronDown, Building2, Users, Loader, Trash2, ReceiptText,
  DollarSign, Filter, Search, GitMerge,
} from 'lucide-react';
import api from '../utils/api';
import { useNotify } from '../context/NotificationContext';
import { useAuth } from '../context/AuthContext';
import NumInput from '../components/NumInput';

const MONTHS = ['January','February','March','April','May','June',
                'July','August','September','October','November','December'];

const fmt = n => `₦${Number(n||0).toLocaleString('en-NG', { minimumFractionDigits: 0 })}`;

const REASON_OPTIONS = [
  { value: 'cash_shortage',      label: 'Sales Shortage'     },
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
  late_arrival:      { icon: '🕐', label: 'Auto · Late',          cls: 'bg-amber-50 text-amber-700 border border-amber-200'  },
  absent:            { icon: '❌', label: 'Auto · Absent',        cls: 'bg-red-50 text-red-700 border border-red-200'        },
  no_clockin:        { icon: '👻', label: 'Auto · No Show',       cls: 'bg-red-50 text-red-700 border border-red-200'        },
  early_departure:   { icon: '🚪', label: 'Auto · Early Exit',    cls: 'bg-orange-50 text-orange-700 border border-orange-200'},
  penalty:           { icon: '⚡', label: 'Auto · Penalty',       cls: 'bg-purple-50 text-purple-700 border border-purple-200'},
  restroom_overstay: { icon: '🚻', label: 'Auto · Restroom',      cls: 'bg-blue-50 text-blue-700 border border-blue-200'     },
  break_overstay:    { icon: '☕', label: 'Auto · Break Overstay', cls: 'bg-orange-50 text-orange-700 border border-orange-200'},
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
function SubmitModal({ workers, branches, onClose, onSubmitted }) {
  const notify = useNotify();
  const now    = new Date();
  const [workerId,    setWorkerId   ] = useState('');
  const [workerSearch,setWorkerSearch] = useState('');
  const [month,       setMonth      ] = useState(now.getMonth() + 1);
  const [year,        setYear       ] = useState(now.getFullYear());
  const [date,        setDate       ] = useState(now.toISOString().split('T')[0]);
  const [amount,      setAmount     ] = useState('');
  const [amountTouched, setAmountTouched] = useState(false);
  const [about,       setAbout      ] = useState('');
  const [reason,      setReason     ] = useState('cash_shortage');
  const [notes,       setNotes      ] = useState('');
  const [loading,     setLoading    ] = useState(false);
  const years = Array.from({ length: 3 }, (_, i) => now.getFullYear() - i);

  // Find the selected worker's branch, presets, and sales shortage rule
  const selectedWorker  = workers.find(w => w._id === workerId);
  const workerBranchId  = selectedWorker?.branchId?._id || selectedWorker?.branchId;
  const workerBranch    = branches.find(b => String(b._id) === String(workerBranchId));
  const presets         = workerBranch?.penaltyPresets || {};
  const currentPreset   = presets[reason] || 0;
  const salesRule       = workerBranch?.salesShortageRule;
  const salesRuleActive = reason === 'cash_shortage' && salesRule?.enabled !== false;
  const srThreshold     = salesRule?.threshold      ?? 10000;
  const srBelow         = salesRule?.belowPenalty   ?? 2000;
  const srAbove         = salesRule?.atAbovePenalty ?? 5000;
  const srPenalty       = salesRuleActive && Number(amount) > 0
    ? (Number(amount) >= srThreshold ? srAbove : srBelow)
    : null;

  // Filter workers by search text
  const filteredWorkers = workerSearch.trim()
    ? workers.filter(w =>
        `${w.fullName} ${w.role}`.toLowerCase().includes(workerSearch.toLowerCase())
      )
    : workers;

  // Auto-fill amount when reason changes (only if not manually edited, or if current amount matches a preset)
  const handleReasonChange = (newReason) => {
    setReason(newReason);
    const preset = presets[newReason] || 0;
    if (preset > 0 && !amountTouched) {
      setAmount(preset);
    }
  };

  // When worker changes, auto-fill the preset for the current reason if not manually set
  const handleWorkerSelect = (id) => {
    setWorkerId(id);
    if (!amountTouched) {
      // We need to find the new worker's branch presets — do it after state updates
      const w  = workers.find(x => x._id === id);
      const bid = w?.branchId?._id || w?.branchId;
      const b   = branches.find(x => String(x._id) === String(bid));
      const p   = b?.penaltyPresets?.[reason] || 0;
      if (p > 0) setAmount(p);
    }
  };

  const submit = async e => {
    e.preventDefault();
    if (!workerId) return notify('Select a worker', 'error');
    if (!amount || Number(amount) <= 0) return notify('Enter a valid amount', 'error');
    setLoading(true);
    try {
      const { data } = await api.post('/shortages', { workerId, month, year, date, amount: Number(amount), about, reason, notes });
      notify('Shortage submitted for approval ✓');
      onSubmitted(data.data);
    } catch (err) {
      notify(err.response?.data?.message || 'Failed to submit', 'error');
    } finally { setLoading(false); }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="bg-white rounded-2xl w-full max-w-md shadow-2xl max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-red-100 flex items-center justify-center">
              <AlertTriangle size={15} className="text-red-600" />
            </div>
            <p className="font-bold text-gray-900 text-sm">Report Shortage</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X size={18} /></button>
        </div>

        <form onSubmit={submit} className="px-5 py-5 space-y-4 overflow-y-auto flex-1">
          {/* Worker search + select */}
          <div>
            <label className="label">Worker *</label>
            {/* Search box */}
            <div className="relative mb-1.5">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
              <input
                type="text"
                className="input pl-8"
                placeholder="Search by name or role…"
                value={workerSearch}
                onChange={e => { setWorkerSearch(e.target.value); setWorkerId(''); }}
              />
              {workerSearch && (
                <button type="button" onClick={() => setWorkerSearch('')}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                  <X size={13} />
                </button>
              )}
            </div>
            {/* Filtered list — shown as scrollable list when searching, else dropdown */}
            {workerSearch ? (
              <div className="border border-gray-200 rounded-xl overflow-hidden max-h-44 overflow-y-auto">
                {filteredWorkers.length === 0 ? (
                  <p className="text-center text-gray-400 text-sm py-3">No workers found</p>
                ) : filteredWorkers.map(w => (
                  <button key={w._id} type="button"
                    onClick={() => { handleWorkerSelect(w._id); setWorkerSearch(''); }}
                    className={`w-full text-left px-4 py-2.5 text-sm hover:bg-gray-50 border-b border-gray-100 last:border-0 transition-colors
                      ${workerId === w._id ? 'bg-green-50 text-green-700 font-semibold' : 'text-gray-800'}`}>
                    {w.fullName}
                    <span className="text-xs text-gray-400 ml-1">· {w.role}</span>
                  </button>
                ))}
              </div>
            ) : (
              <select className="input" value={workerId} onChange={e => handleWorkerSelect(e.target.value)} required>
                <option value="">— Select worker —</option>
                {workers.map(w => (
                  <option key={w._id} value={w._id}>{w.fullName} ({w.role})</option>
                ))}
              </select>
            )}
            {/* Show selected worker name when search cleared */}
            {selectedWorker && !workerSearch && (
              <p className="text-xs text-green-600 font-semibold mt-1 pl-1">
                ✓ {selectedWorker.fullName}
              </p>
            )}
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
            <label className="label">About (What is this charge for?) *</label>
            <input type="text" className="input" maxLength={200}
              placeholder="e.g. Pump 3 cash shortage — morning shift"
              value={about} onChange={e => setAbout(e.target.value)} required />
          </div>

          <div>
            <label className="label">Reason *</label>
            <select className="input" value={reason} onChange={e => handleReasonChange(e.target.value)}>
              {REASON_OPTIONS.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
            </select>
          </div>

          <div>
            <label className="label">Shortage Amount (₦) *</label>
            <NumInput min={1} className="input" placeholder="e.g. 5000"
              value={Number(amount) || 0}
              onChange={v => { setAmount(v); setAmountTouched(true); }} />
            {currentPreset > 0 && (
              <p className="text-xs mt-1 flex items-center gap-1.5">
                <span className="text-blue-600 font-medium">
                  ⚡ Preset: ₦{currentPreset.toLocaleString()}
                </span>
                {amountTouched && Number(amount) !== currentPreset && (
                  <button type="button"
                    onClick={() => { setAmount(currentPreset); setAmountTouched(false); }}
                    className="text-blue-500 hover:text-blue-700 underline text-xs">
                    Reset to preset
                  </button>
                )}
              </p>
            )}
          </div>

          {/* Sales shortage penalty preview */}
          {salesRuleActive && Number(amount) > 0 && srPenalty !== null && (
            <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 space-y-1">
              <p className="text-xs font-semibold text-red-700 uppercase tracking-wide">⚡ Auto-Penalty</p>
              <p className="text-sm text-gray-800">
                Shortage of <span className="font-bold">₦{Number(amount).toLocaleString()}</span>
                {Number(amount) >= srThreshold
                  ? <> is <span className="font-semibold">≥ ₦{srThreshold.toLocaleString()}</span> threshold</>
                  : <> is <span className="font-semibold">&lt; ₦{srThreshold.toLocaleString()}</span> threshold</>
                }
              </p>
              <p className="text-base font-black text-red-600">
                → ₦{srPenalty.toLocaleString()} penalty will be deducted
              </p>
              <p className="text-xs text-gray-400">This is added automatically on top of the shortage record</p>
            </div>
          )}
          {salesRuleActive && !workerId && (
            <p className="text-xs text-gray-400 italic">Select a worker to see penalty preview</p>
          )}

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

// ─── Join Shortage Modal ───────────────────────────────────────────────────────
function JoinModal({ shortage, onClose, onJoined }) {
  const notify  = useNotify();
  const [amount,  setAmount ] = useState('');
  const [about,   setAbout  ] = useState(shortage.about || '');
  const [notes,   setNotes  ] = useState('');
  const [loading, setLoading] = useState(false);

  const submit = async e => {
    e.preventDefault();
    if (!amount || Number(amount) <= 0) return notify('Enter a valid amount to add', 'error');
    setLoading(true);
    try {
      const { data } = await api.post(`/shortages/${shortage._id}/join`, {
        amount: Number(amount), about, notes,
      });
      notify(`₦${Number(amount).toLocaleString()} added to shortage ✓`);
      onJoined(data.data);
    } catch (err) {
      notify(err.response?.data?.message || 'Failed', 'error');
    } finally { setLoading(false); }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="bg-white rounded-2xl w-full max-w-sm shadow-2xl">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-blue-100 flex items-center justify-center">
              <GitMerge size={15} className="text-blue-600" />
            </div>
            <p className="font-bold text-gray-900 text-sm">Add to Shortage</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X size={18} /></button>
        </div>

        <form onSubmit={submit} className="px-5 py-5 space-y-4">
          {/* Existing shortage summary */}
          <div className="bg-gray-50 rounded-xl p-3 border border-gray-200 text-sm">
            <p className="font-semibold text-gray-800">{shortage.workerName}</p>
            {shortage.about && <p className="text-gray-600 text-xs mt-0.5">📌 {shortage.about}</p>}
            <p className="text-red-600 font-bold mt-1">{fmt(shortage.amount)} existing</p>
          </div>

          <div>
            <label className="label">About (update title — optional)</label>
            <input type="text" className="input" maxLength={200}
              placeholder="Update the shortage description…"
              value={about} onChange={e => setAbout(e.target.value)} />
          </div>

          <div>
            <label className="label">Additional Amount (₦) *</label>
            <NumInput min={1} className="input" placeholder="Amount to add"
              value={Number(amount) || 0} onChange={v => setAmount(v)} />
            {amount > 0 && (
              <p className="text-xs text-green-600 mt-1 font-semibold">
                New total: {fmt(shortage.amount + Number(amount))}
              </p>
            )}
          </div>

          <div>
            <label className="label">Note (optional)</label>
            <textarea className="input" rows={2} placeholder="Reason for adding this amount…"
              value={notes} onChange={e => setNotes(e.target.value)} />
          </div>

          <div className="flex gap-3 pt-1">
            <button type="submit" disabled={loading}
              className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl bg-blue-600 text-white font-medium text-sm hover:bg-blue-700 transition-colors">
              {loading ? <Loader size={14} className="animate-spin" /> : <><GitMerge size={14} /> Add to Shortage</>}
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
  const [branches,   setBranches  ] = useState([]);
  const [loading,    setLoading   ] = useState(true);
  const [showSubmit, setShowSubmit] = useState(false);
  const [rejectItem, setRejectItem] = useState(null);
  const [joinItem,   setJoinItem  ] = useState(null);
  const [filterStatus, setFilterStatus] = useState('all');
  const [filterMonth,  setFilterMonth ] = useState('');
  const [filterYear,   setFilterYear  ] = useState(now.getFullYear());
  const [filterDate,   setFilterDate  ] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (filterStatus && filterStatus !== 'all') params.set('status', filterStatus);
      if (filterDate) {
        params.set('date', filterDate);
      } else {
        if (filterMonth) params.set('month', filterMonth);
        if (filterYear)  params.set('year',  filterYear);
      }
      const { data } = await api.get(`/shortages?${params}`);
      setShortages(data.data);
    } catch { notify('Failed to load shortages', 'error'); }
    finally { setLoading(false); }
  }, [filterStatus, filterMonth, filterYear, filterDate]);

  useEffect(() => { load(); }, [load]);

  // Load workers separately so auth timing doesn't block the list
  useEffect(() => {
    if (!canSubmit) return;
    const wParams = new URLSearchParams({ limit: 500, status: 'active' });
    if (!isAdmin && user?.branchId) wParams.set('branchId', String(user.branchId?._id || user.branchId));
    if (!isAdmin && user?.shiftId)  wParams.set('shiftId',  String(user.shiftId?._id  || user.shiftId));
    api.get(`/workers/active-workers?${wParams}`)
      .then(r => setWorkers(r.data.data || []))
      .catch(() => {});
  }, [canSubmit, isAdmin, user?.branchId, user?.shiftId]);

  // Load branches for penalty preset lookup
  useEffect(() => {
    if (!canSubmit) return;
    api.get('/branches?limit=200')
      .then(r => setBranches(r.data.data || []))
      .catch(() => {});
  }, [canSubmit]);

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

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Shortage Reports</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            {isAdmin ? 'All shortage records — automatically deducted from salary' : 'Submit and track shortage reports'}
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
            <option value="all">All</option>
            <option value="approved">Approved</option>
            <option value="rejected">Rejected</option>
          </select>
        )}
        <input
          type="date"
          value={filterDate}
          onChange={e => { setFilterDate(e.target.value); setFilterMonth(''); }}
          className="input max-w-[150px]"
          title="Filter by exact date"
        />
        {filterDate && (
          <button onClick={() => setFilterDate('')} className="text-xs text-gray-400 hover:text-gray-600 underline">
            Clear date
          </button>
        )}
        {!filterDate && (
          <>
            <select className="input max-w-[130px]" value={filterMonth} onChange={e => setFilterMonth(e.target.value)}>
              <option value="">All months</option>
              {MONTHS.map((m, i) => <option key={m} value={i+1}>{m}</option>)}
            </select>
            <select className="input max-w-[110px]" value={filterYear} onChange={e => setFilterYear(e.target.value)}>
              {Array.from({ length: 3 }, (_, i) => now.getFullYear() - i).map(y =>
                <option key={y} value={y}>{y}</option>
              )}
            </select>
          </>
        )}
      </div>

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
                onDelete={() => handleDelete(s._id)}
                onJoin={canSubmit ? () => setJoinItem(s) : null}
              />
            ))}
          </div>
        )}
      </div>

      {/* Modals */}
      {showSubmit && (
        <SubmitModal workers={workers} branches={branches} onClose={() => setShowSubmit(false)}
          onSubmitted={s => { setShortages(prev => [s, ...prev]); setShowSubmit(false); }} />
      )}
      {rejectItem && (
        <RejectModal shortage={rejectItem} onClose={() => setRejectItem(null)}
          onRejected={updated => { setShortages(prev => prev.map(s => s._id === updated._id ? updated : s)); setRejectItem(null); }} />
      )}
      {joinItem && (
        <JoinModal shortage={joinItem} onClose={() => setJoinItem(null)}
          onJoined={updated => { setShortages(prev => prev.map(s => s._id === updated._id ? updated : s)); setJoinItem(null); }} />
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
              : <span className="text-xs text-blue-500 bg-blue-50 px-1.5 py-0.5 rounded-full">🔑 {shortage.pinSubmittedByName ? `${shortage.pinSubmittedByName} (PIN)` : 'Self-service (PIN)'}</span>
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
function ShortageRow({ shortage, isAdmin, onDelete, onJoin }) {
  const isAutoSource = shortage.source && shortage.source !== 'manual';
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
          <StatusBadge status={shortage.status} />
        </div>

        {/* About — shown prominently as the charge title */}
        {shortage.about && (
          <p className="text-sm font-semibold text-gray-800 mt-1">📌 {shortage.about}</p>
        )}

        <div className="flex items-center gap-3 mt-0.5 flex-wrap">
          <span className="text-sm font-bold text-red-600">{fmt(shortage.amount)}</span>
          {shortage.reason && shortage.reason !== 'other' && shortage.reason !== shortage.source && (
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
          {isAutoSource
            ? <span className="inline-flex items-center gap-1 bg-purple-50 text-purple-600 px-1.5 py-0.5 rounded-full font-medium">Auto-deduction</span>
            : shortage.submittedBy?.name
              ? <>Submitted by {shortage.submittedBy.name}</>
              : <span className="inline-flex items-center gap-1 bg-blue-50 text-blue-600 px-1.5 py-0.5 rounded-full font-medium">
                  🔑 {shortage.pinSubmittedByName ? `${shortage.pinSubmittedByName} (PIN)` : 'Self-service (PIN)'}
                </span>
          }
          {' · '}
          {new Date(shortage.createdAt).toLocaleDateString('en-NG', { day:'numeric', month:'short', year:'numeric' })}
          {shortage.reviewedBy?.name && ` · Reviewed by ${shortage.reviewedBy.name}`}
        </p>
      </div>

      <div className="flex items-center gap-1.5 shrink-0">
        {onJoin && shortage.status !== 'rejected' && (
          <button onClick={onJoin}
            className="p-1.5 rounded-lg text-gray-400 hover:text-blue-600 hover:bg-blue-50 transition-colors"
            title="Add to this shortage">
            <GitMerge size={14} />
          </button>
        )}
        {isAdmin && (
          <button onClick={onDelete}
            className="p-1.5 rounded-lg text-gray-400 hover:text-red-500 hover:bg-red-50 transition-colors"
            title="Delete shortage">
            <Trash2 size={14} />
          </button>
        )}
      </div>
    </div>
  );
}
