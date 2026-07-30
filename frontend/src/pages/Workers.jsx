import { useEffect, useState, useCallback, useRef } from 'react';
import { Link } from 'react-router-dom';
import {
  Plus, Search, Phone, ChevronRight, Users, ShieldCheck,
  Play, Pause, Ban, RefreshCw, ArrowLeftRight, MoreVertical,
  X, Loader, Building2, Briefcase, Clock, Check, Printer, Share2, Calendar,
  UserCog, Eye, EyeOff, ScanFace
} from 'lucide-react';
import api from '../utils/api';
import { useNotify } from '../context/NotificationContext';
import { useAuth } from '../context/AuthContext';
import VerificationBadge from '../components/VerificationBadge';
import { EmploymentBadge } from './ActiveWorkers';

// ─── Role & schedule options ──────────────────────────────────────────────────
const ROLES     = ['Pump Attendant','Supervisor','Cashier','Manager','Security','Maintenance','Accountant','Driver','Cleaner'];
const SCHEDULES = ['Morning Shift','Afternoon Shift','Night Shift','Full Day','Day Shift','Rotating Shift','1 Day In / 1 Day Out'];

// ─── useShifts: load shifts when branchId changes ─────────────────────────────
function useShifts(branchId) {
  const [shifts, setShifts] = useState([]);
  useEffect(() => {
    if (!branchId) { setShifts([]); return; }
    api.get(`/shifts?branchId=${branchId}`).then(r => setShifts(r.data.data)).catch(() => setShifts([]));
  }, [branchId]);
  return shifts;
}

// ─── Shift selector sub-component ────────────────────────────────────────────
function ShiftSelector({ branchId, value, onChange }) {
  const shifts = useShifts(branchId);
  if (!branchId) return (
    <p className="text-xs text-gray-400 px-1">Select a branch first to see its shifts</p>
  );
  if (shifts.length === 0) return (
    <p className="text-xs text-amber-600 px-1">No shifts defined for this branch — you can add them in the Shifts page</p>
  );
  return (
    <select className="input" value={value} onChange={e => onChange(e.target.value)}>
      <option value="">— No shift assigned —</option>
      {shifts.map(s => (
        <option key={s._id} value={s._id}>
          {s.name}{s.startTime && s.endTime ? ` (${s.startTime}–${s.endTime})` : ''}
        </option>
      ))}
    </select>
  );
}

// ─── Quick Activate Modal ─────────────────────────────────────────────────────
function ActivateModal({ worker, branches, onClose, onDone }) {
  const notify     = useNotify();
  const today      = new Date().toISOString().split('T')[0];
  const [saving,       setSaving      ] = useState(false);
  const [branchId,     setBranchId    ] = useState(worker.branchId?._id || worker.branchId || '');
  const [shiftId,      setShiftId     ] = useState('');
  const [role,         setRole        ] = useState(worker.role || '');
  const [customRole,   setCustomRole  ] = useState('');
  const [resumptionDate, setResumption] = useState(
    worker.resumptionDate ? new Date(worker.resumptionDate).toISOString().split('T')[0] : today
  );
  const [notes,        setNotes       ] = useState('');

  const finalRole = role === '__custom' ? customRole : role;

  const submit = async (e) => {
    e.preventDefault();
    if (!finalRole.trim()) return notify('Please select a role', 'error');
    setSaving(true);
    try {
      await api.post(`/workers/${worker._id}/activate`, {
        branchId:       branchId       || undefined,
        shiftId:        shiftId        || undefined,
        role:           finalRole,
        resumptionDate: resumptionDate || undefined,
        notes
      });
      notify(`${worker.fullName} is now Active ✓`);
      onDone();
    } catch (err) {
      notify(err.response?.data?.message || 'Failed to activate', 'error');
    } finally { setSaving(false); }
  };

  return (
    <Overlay onClose={onClose}>
      <ModalHeader
        icon={<div className="w-8 h-8 rounded-lg bg-green-100 flex items-center justify-center"><Play size={15} className="text-green-600" /></div>}
        title="Activate Worker"
        sub={worker.fullName}
        onClose={onClose}
      />
      <form onSubmit={submit} className="px-5 pb-5 space-y-4">
        {/* Branch */}
        <div>
          <label className="label flex items-center gap-1.5"><Building2 size={12} /> Assign Branch</label>
          <select className="input" value={branchId} onChange={e => { setBranchId(e.target.value); setShiftId(''); }}>
            <option value="">— Keep current ({worker.branch || 'none'}) —</option>
            {branches.map(b => <option key={b._id} value={b._id}>{b.name}</option>)}
          </select>
        </div>
        {/* Shift */}
        <div>
          <label className="label flex items-center gap-1.5"><Clock size={12} /> Assign Shift</label>
          <ShiftSelector branchId={branchId} value={shiftId} onChange={setShiftId} />
        </div>
        {/* Role */}
        <div>
          <label className="label flex items-center gap-1.5"><Briefcase size={12} /> Role *</label>
          <select className="input" value={role} onChange={e => setRole(e.target.value)} required>
            <option value="">Select role…</option>
            {ROLES.map(r => <option key={r} value={r}>{r}</option>)}
            <option value="__custom">Other…</option>
          </select>
          {role === '__custom' && (
            <input className="input mt-2" placeholder="Enter custom role"
              value={customRole} onChange={e => setCustomRole(e.target.value)} required />
          )}
        </div>
        {/* Resumption Date */}
        <div>
          <label className="label flex items-center gap-1.5"><Calendar size={12} /> Resumption Date *</label>
          <input type="date" className="input" value={resumptionDate}
            onChange={e => setResumption(e.target.value)} required />
          <p className="text-xs text-gray-400 mt-1">Salary will be prorated if worker starts mid-month</p>
        </div>
        {/* Notes */}
        <div>
          <label className="label">Notes (optional)</label>
          <textarea className="input resize-none" rows={2} placeholder="Any additional notes…"
            value={notes} onChange={e => setNotes(e.target.value)} />
        </div>
        <div className="flex gap-3 pt-1">
          <button type="submit" disabled={saving}
            className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl bg-green-600 text-white font-medium text-sm hover:bg-green-700 transition-colors">
            {saving ? <Loader size={15} className="animate-spin" /> : <><Check size={14} /> Activate Worker</>}
          </button>
          <button type="button" onClick={onClose} className="btn-secondary">Cancel</button>
        </div>
      </form>
    </Overlay>
  );
}

// ─── Quick Transfer Modal ─────────────────────────────────────────────────────
function TransferModal({ worker, branches, onClose, onDone }) {
  const notify = useNotify();
  const [saving, setSaving]         = useState(false);
  const [branchId,    setBranchId  ] = useState('');
  const [shiftId,     setShiftId   ] = useState('');
  const [role,        setRole      ] = useState('');
  const [customRole,  setCustomRole ] = useState('');
  const [reason,      setReason    ] = useState('');

  const finalRole = role === '__custom' ? customRole : role;

  const submit = async (e) => {
    e.preventDefault();
    if (!reason.trim()) return notify('Reason is required', 'error');
    setSaving(true);
    try {
      await api.post(`/workers/${worker._id}/transfer`, {
        branchId: branchId  || undefined,
        shiftId:  shiftId   || undefined,
        role:     finalRole || undefined,
        reason
      });
      notify(`${worker.fullName} transferred ✓`);
      onDone();
    } catch (err) {
      notify(err.response?.data?.message || 'Failed', 'error');
    } finally { setSaving(false); }
  };

  return (
    <Overlay onClose={onClose}>
      <ModalHeader
        icon={<div className="w-8 h-8 rounded-lg bg-blue-100 flex items-center justify-center"><ArrowLeftRight size={15} className="text-blue-600" /></div>}
        title="Transfer Worker"
        sub={worker.fullName}
        onClose={onClose}
      />
      <form onSubmit={submit} className="px-5 pb-5 space-y-4">
        <div>
          <label className="label">New Branch</label>
          <select className="input" value={branchId} onChange={e => { setBranchId(e.target.value); setShiftId(''); }}>
            <option value="">— Keep current ({worker.branch || 'none'}) —</option>
            {branches.filter(b => b._id !== (worker.branchId?._id || worker.branchId))
              .map(b => <option key={b._id} value={b._id}>{b.name}</option>)}
          </select>
        </div>
        <div>
          <label className="label flex items-center gap-1.5"><Clock size={12} /> New Shift</label>
          <ShiftSelector
            branchId={branchId || (worker.branchId?._id || worker.branchId)}
            value={shiftId}
            onChange={setShiftId}
          />
        </div>
        <div>
          <label className="label">New Role (optional)</label>
          <select className="input" value={role} onChange={e => setRole(e.target.value)}>
            <option value="">— Keep current role —</option>
            {ROLES.map(r => <option key={r} value={r}>{r}</option>)}
            <option value="__custom">Other…</option>
          </select>
          {role === '__custom' && (
            <input className="input mt-2" placeholder="Enter role"
              value={customRole} onChange={e => setCustomRole(e.target.value)} />
          )}
        </div>
        <div>
          <label className="label">Reason *</label>
          <input className="input" placeholder="Why is this worker being transferred?"
            value={reason} onChange={e => setReason(e.target.value)} required />
        </div>
        <div className="flex gap-3 pt-1">
          <button type="submit" disabled={saving}
            className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl bg-blue-600 text-white font-medium text-sm hover:bg-blue-700 transition-colors">
            {saving ? <Loader size={15} className="animate-spin" /> : <><Check size={14} /> Confirm Transfer</>}
          </button>
          <button type="button" onClick={onClose} className="btn-secondary">Cancel</button>
        </div>
      </form>
    </Overlay>
  );
}

// ─── Quick Suspend Modal ──────────────────────────────────────────────────────
function SuspendModal({ worker, onClose, onDone }) {
  const notify = useNotify();
  const [saving, setSaving] = useState(false);
  const [reason, setReason] = useState('');
  const [date,   setDate  ] = useState(new Date().toISOString().slice(0, 10));

  const submit = async (e) => {
    e.preventDefault();
    if (!reason.trim()) return notify('Reason is required', 'error');
    setSaving(true);
    try {
      await api.post(`/workers/${worker._id}/suspend`, { reason, date });
      notify(`${worker.fullName} suspended`);
      onDone();
    } catch (err) {
      notify(err.response?.data?.message || 'Failed', 'error');
    } finally { setSaving(false); }
  };

  return (
    <Overlay onClose={onClose}>
      <ModalHeader
        icon={<div className="w-8 h-8 rounded-lg bg-amber-100 flex items-center justify-center"><Pause size={15} className="text-amber-600" /></div>}
        title="Suspend Worker"
        sub={worker.fullName}
        onClose={onClose}
      />
      <form onSubmit={submit} className="px-5 pb-5 space-y-4">
        <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl text-sm text-amber-700">
          Worker will be suspended. You can reactivate them any time.
        </div>
        <div>
          <label className="label">Reason *</label>
          <textarea className="input resize-none" rows={3}
            placeholder="Reason for suspension…"
            value={reason} onChange={e => setReason(e.target.value)} required />
        </div>
        <div>
          <label className="label">Effective Date</label>
          <input type="date" className="input" value={date} onChange={e => setDate(e.target.value)} />
        </div>
        <div className="flex gap-3 pt-1">
          <button type="submit" disabled={saving}
            className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl bg-amber-500 text-white font-medium text-sm hover:bg-amber-600 transition-colors">
            {saving ? <Loader size={15} className="animate-spin" /> : <><Pause size={14} /> Suspend</>}
          </button>
          <button type="button" onClick={onClose} className="btn-secondary">Cancel</button>
        </div>
      </form>
    </Overlay>
  );
}

// ─── Quick Sack Modal ─────────────────────────────────────────────────────────
function SackModal({ worker, onClose, onDone }) {
  const notify = useNotify();
  const [saving,  setSaving ] = useState(false);
  const [reason,  setReason ] = useState('');
  const [confirm, setConfirm] = useState('');
  const [date,    setDate   ] = useState(new Date().toISOString().slice(0, 10));

  const submit = async (e) => {
    e.preventDefault();
    if (!reason.trim()) return notify('Reason is required', 'error');
    if (confirm !== worker.fullName) return notify('Type the worker name exactly to confirm', 'error');
    setSaving(true);
    try {
      await api.post(`/workers/${worker._id}/sack`, { reason, date });
      notify(`${worker.fullName} has been dismissed`);
      onDone();
    } catch (err) {
      notify(err.response?.data?.message || 'Failed', 'error');
    } finally { setSaving(false); }
  };

  return (
    <Overlay onClose={onClose}>
      <ModalHeader
        icon={<div className="w-8 h-8 rounded-lg bg-red-100 flex items-center justify-center"><Ban size={15} className="text-red-600" /></div>}
        title="Dismiss Worker"
        sub={worker.fullName}
        onClose={onClose}
      />
      <form onSubmit={submit} className="px-5 pb-5 space-y-4">
        <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700">
          ⚠️ This worker will be dismissed. You can reactivate them later if needed.
        </div>
        <div>
          <label className="label">Reason for Dismissal *</label>
          <textarea className="input resize-none" rows={3}
            placeholder="Reason for sacking…"
            value={reason} onChange={e => setReason(e.target.value)} required />
        </div>
        <div>
          <label className="label">Effective Date</label>
          <input type="date" className="input" value={date} onChange={e => setDate(e.target.value)} />
        </div>
        <div>
          <label className="label">
            Type <strong className="text-gray-800">{worker.fullName}</strong> to confirm
          </label>
          <input className="input border-red-200 focus:border-red-400" placeholder="Full name…"
            value={confirm} onChange={e => setConfirm(e.target.value)} />
        </div>
        <div className="flex gap-3 pt-1">
          <button type="submit" disabled={saving}
            className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl bg-red-600 text-white font-medium text-sm hover:bg-red-700 transition-colors">
            {saving ? <Loader size={15} className="animate-spin" /> : <><Ban size={14} /> Dismiss Worker</>}
          </button>
          <button type="button" onClick={onClose} className="btn-secondary">Cancel</button>
        </div>
      </form>
    </Overlay>
  );
}

// ─── Reactivate (quick confirm) ───────────────────────────────────────────────
function ReactivateModal({ worker, onClose, onDone }) {
  const notify = useNotify();
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    setSaving(true);
    try {
      await api.post(`/workers/${worker._id}/reactivate`, {});
      notify(`${worker.fullName} reactivated ✓`);
      onDone();
    } catch (err) {
      notify(err.response?.data?.message || 'Failed', 'error');
    } finally { setSaving(false); }
  };

  return (
    <Overlay onClose={onClose}>
      <ModalHeader
        icon={<div className="w-8 h-8 rounded-lg bg-green-100 flex items-center justify-center"><RefreshCw size={15} className="text-green-600" /></div>}
        title="Reactivate Worker"
        sub={worker.fullName}
        onClose={onClose}
      />
      <div className="px-5 pb-5 space-y-4">
        <div className="p-4 bg-green-50 border border-green-200 rounded-xl text-sm text-green-700">
          <strong>{worker.fullName}</strong> will be set back to Active. Their branch and role assignment will be kept.
        </div>
        <div className="flex gap-3">
          <button onClick={submit} disabled={saving}
            className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl bg-green-600 text-white font-medium text-sm hover:bg-green-700 transition-colors">
            {saving ? <Loader size={15} className="animate-spin" /> : <><RefreshCw size={14} /> Reactivate</>}
          </button>
          <button onClick={onClose} className="btn-secondary">Cancel</button>
        </div>
      </div>
    </Overlay>
  );
}

// ─── Reset Face Modal ─────────────────────────────────────────────────────────
function ResetFaceModal({ worker, onClose, onDone }) {
  const notify  = useNotify();
  const [saving, setSaving] = useState(false);
  const submit = async () => {
    setSaving(true);
    try {
      await api.delete(`/workers/${worker._id}/face`);
      notify(`${worker.fullName}'s face data cleared — they can re-register on next clock-in`);
      onDone(); onClose();
    } catch (err) {
      notify(err.response?.data?.message || 'Failed to reset face', 'error');
    } finally { setSaving(false); }
  };
  return (
    <Overlay onClose={onClose}>
      <div className="flex items-center gap-2.5 px-5 py-4 border-b border-gray-100">
        <div className="w-8 h-8 rounded-lg bg-purple-100 flex items-center justify-center">
          <ScanFace size={15} className="text-purple-600" />
        </div>
        <p className="font-bold text-gray-900 text-sm">Reset Face Data</p>
      </div>
      <div className="px-5 py-4 space-y-4">
        <p className="text-sm text-gray-600">
          This will clear <strong>{worker.fullName}</strong>'s stored face. On their next clock-in they will be asked to register their face again fresh.
        </p>
        <div className="flex gap-3">
          <button onClick={submit} disabled={saving}
            className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl bg-purple-600 text-white font-medium text-sm hover:bg-purple-700 transition-colors">
            {saving ? <Loader size={15} className="animate-spin" /> : <><ScanFace size={14} /> Reset Face</>}
          </button>
          <button onClick={onClose} className="btn-secondary">Cancel</button>
        </div>
      </div>
    </Overlay>
  );
}

// ─── Shared Modal components ──────────────────────────────────────────────────
function Overlay({ onClose, children }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 overflow-y-auto">
      <div className="bg-white rounded-2xl w-full max-w-md shadow-2xl my-4">
        {children}
      </div>
    </div>
  );
}

function ModalHeader({ icon, title, sub, onClose }) {
  return (
    <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
      <div className="flex items-center gap-3">
        {icon}
        <div>
          <p className="font-bold text-gray-900 text-sm">{title}</p>
          <p className="text-xs text-gray-500">{sub}</p>
        </div>
      </div>
      <button onClick={onClose} className="text-gray-400 hover:text-gray-600 transition-colors">
        <X size={18} />
      </button>
    </div>
  );
}

// ─── Create Staff Account Modal ───────────────────────────────────────────────
const STAFF_ROLES = [
  { value: 'supervisor',           label: 'Supervisor' },
  { value: 'verification_officer', label: 'Verification Officer' },
  { value: 'record_supervisor',    label: 'Record Supervisor' },
  { value: 'hr_staff',             label: 'HR Staff' },
];

function CreateStaffAccountModal({ worker, onClose, onDone }) {
  const notify   = useNotify();
  const [saving,   setSaving  ] = useState(false);
  const [email,    setEmail   ] = useState('');
  const [password, setPassword] = useState('');
  const [role,     setRole    ] = useState('supervisor');
  const [showPwd,  setShowPwd ] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    if (!email.trim() || !password.trim()) return notify('Email and password are required', 'error');
    if (password.length < 6) return notify('Password must be at least 6 characters', 'error');
    setSaving(true);
    try {
      await api.post('/staff', {
        name:     worker.fullName,
        email:    email.trim().toLowerCase(),
        password,
        role,
        branchId: worker.branchId?._id || worker.branchId || undefined,
      });
      notify(`Staff account created for ${worker.fullName} ✓`);
      onDone();
    } catch (err) {
      notify(err.response?.data?.message || 'Failed to create account', 'error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Overlay onClose={onClose}>
      <ModalHeader
        onClose={onClose}
        icon={<UserCog size={18} className="text-brand-600" />}
        title="Create Staff Account"
        sub={worker.fullName}
      />
      <form onSubmit={submit} className="px-5 pb-5 space-y-4">
        <div>
          <label className="label">Full Name</label>
          <input className="input bg-gray-50 cursor-default" value={worker.fullName} readOnly />
        </div>
        <div>
          <label className="label">Role</label>
          <select className="input" value={role} onChange={e => setRole(e.target.value)}>
            {STAFF_ROLES.map(r => (
              <option key={r.value} value={r.value}>{r.label}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="label">Email</label>
          <input type="email" className="input" placeholder="staff@company.com"
            value={email} onChange={e => setEmail(e.target.value)} required autoComplete="off" />
        </div>
        <div>
          <label className="label">Password</label>
          <div className="relative">
            <input type={showPwd ? 'text' : 'password'} className="input pr-10" placeholder="Min. 6 characters"
              value={password} onChange={e => setPassword(e.target.value)} required minLength={6} autoComplete="new-password" />
            <button type="button" onClick={() => setShowPwd(v => !v)}
              className="absolute inset-y-0 right-3 text-gray-400 hover:text-gray-600 transition-colors">
              {showPwd ? <EyeOff size={16} /> : <Eye size={16} />}
            </button>
          </div>
        </div>
        {(worker.branchId?.name || worker.branch) && (
          <p className="text-xs text-gray-500 flex items-center gap-1.5 bg-gray-50 px-3 py-2 rounded-lg border border-gray-100">
            <Building2 size={12} className="shrink-0" />
            Branch: <strong>{worker.branchId?.name || worker.branch}</strong>
          </p>
        )}
        <div className="flex gap-2 pt-1">
          <button type="button" onClick={onClose} className="btn-secondary flex-1">Cancel</button>
          <button type="submit" disabled={saving} className="btn-primary flex-1">
            {saving ? <><Loader size={14} className="animate-spin" /> Creating…</> : 'Create Account'}
          </button>
        </div>
      </form>
    </Overlay>
  );
}

// ─── Pay Mode quick-edit badge ────────────────────────────────────────────────
function PayModeBadge({ worker, onUpdated }) {
  const [open,    setOpen   ] = useState(false);
  const [mode,    setMode   ] = useState(worker.salary?.paymentMode || 'fixed');
  const [monthly, setMonthly] = useState(worker.salary?.monthly || 0);
  const [rate,    setRate   ] = useState(worker.salary?.litreRate || 0);
  const [saving,  setSaving ] = useState(false);
  const ref = useRef(null);
  const { notify } = useNotify();

  // reset form when popup opens
  const openPopup = (e) => {
    e.preventDefault(); e.stopPropagation();
    setMode(worker.salary?.paymentMode || 'fixed');
    setMonthly(worker.salary?.monthly || 0);
    setRate(worker.salary?.litreRate || 0);
    setOpen(true);
  };

  useEffect(() => {
    if (!open) return;
    const handler = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  const save = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      await api.put(`/workers/${worker._id}/salary`, {
        paymentMode:    mode,
        monthly:        mode === 'fixed' ? Number(monthly) : undefined,
        litreRate:      mode === 'per_litre' ? Number(rate) : undefined,
        payrollEnabled: worker.salary?.payrollEnabled,
      });
      notify('Pay mode updated ✓');
      setOpen(false);
      onUpdated();
    } catch (err) {
      notify(err.response?.data?.message || 'Failed to save', 'error');
    } finally { setSaving(false); }
  };

  const sal = worker.salary || {};
  const label = sal.paymentMode === 'per_litre'
    ? `₦${Number(sal.litreRate || 0).toLocaleString()}/L`
    : sal.monthly ? `₦${Number(sal.monthly || 0).toLocaleString()}` : '—';
  const badgeCls = sal.paymentMode === 'per_litre'
    ? 'bg-blue-50 text-blue-700 border border-blue-200'
    : 'bg-gray-100 text-gray-600 border border-gray-200';

  return (
    <div className="relative" ref={ref}>
      <button onClick={openPopup}
        title="Edit pay mode"
        className={`text-xs px-2 py-1 rounded-lg font-medium tabular-nums whitespace-nowrap ${badgeCls} hover:ring-2 hover:ring-brand-300 transition-all`}>
        {label}
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-1.5 z-50 bg-white border border-gray-200 rounded-xl shadow-xl p-3 w-56">
          <p className="text-xs font-semibold text-gray-700 mb-2">Pay mode — {worker.fullName.split(' ')[0]}</p>
          <form onSubmit={save} className="space-y-2">
            <select className="input text-sm py-1.5" value={mode} onChange={e => setMode(e.target.value)}>
              <option value="fixed">Fixed Monthly</option>
              <option value="per_litre">Per Litre Sold</option>
            </select>
            {mode === 'fixed' ? (
              <input type="number" min="0" className="input text-sm py-1.5" placeholder="Monthly ₦"
                value={monthly} onChange={e => setMonthly(e.target.value)} />
            ) : (
              <div>
                <input type="number" min="0" step="0.01" className="input text-sm py-1.5" placeholder="₦ per litre"
                  value={rate} onChange={e => setRate(e.target.value)} />
                <p className="text-xs text-gray-400 mt-1">Payroll multiplies litres sold × this rate</p>
              </div>
            )}
            <div className="flex gap-2 pt-1">
              <button type="submit" disabled={saving}
                className="btn-primary flex-1 justify-center text-xs py-1.5">
                {saving ? <Loader size={12} className="animate-spin" /> : <><Check size={12} /> Save</>}
              </button>
              <button type="button" onClick={() => setOpen(false)} className="btn-secondary text-xs py-1.5">
                <X size={12} />
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}

// ─── Action dropdown (⋮ menu) ─────────────────────────────────────────────────
function ActionMenu({ worker, onAction }) {
  const [open, setOpen] = useState(false);
  const ref             = useRef(null);
  const { isSuperAdmin } = useAuth();
  const es              = worker.employmentStatus;

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const handler = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  const trigger = (action) => { setOpen(false); onAction(action, worker); };

  const shareWhatsApp = () => {
    setOpen(false);
    const empLabel = { registered:'Registered', active:'Active', suspended:'Suspended',
                       sacked:'Dismissed', inactive:'Inactive' }[worker.employmentStatus] || worker.employmentStatus;
    const verLabel = { pending_verification:'Pending', partially_verified:'Partial',
                       pending_approval:'Awaiting Approval', verified:'Verified ✓',
                       rejected:'Rejected', fully_verified:'Verified ✓' }[worker.verificationStatus] || worker.verificationStatus;
    const lines = [
      `👤 *Worker Profile*`,
      `━━━━━━━━━━━━━━━━━━━━`,
      `*Name:*  ${worker.fullName}`,
      `*Phone:* ${worker.phone}`,
      ``,
      `*Employment:* ${empLabel}`,
      (worker.branchId?.name || worker.branch) ? `*Branch:* ${worker.branchId?.name || worker.branch}` : null,
      worker.role    ? `*Role:*  ${worker.role}` : null,
      (worker.shiftId?.name || worker.schedule) ? `*Shift:* ${worker.shiftId?.name || worker.schedule}` : null,
      ``,
      `*Verification:* ${verLabel}`,
      `━━━━━━━━━━━━━━━━━━━━`,
    ].filter(l => l !== null).join('\n');
    window.open(`https://wa.me/?text=${encodeURIComponent(lines)}`, '_blank');
  };

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={(e) => { e.preventDefault(); setOpen(v => !v); }}
        className="p-2 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
        title="Actions"
      >
        <MoreVertical size={16} />
      </button>

      {open && (
        <div className="absolute right-0 top-9 w-48 bg-white rounded-xl shadow-xl border border-gray-100 py-1 z-40">
          {/* Print & Share — always shown */}
          <Link to={`/workers/${worker._id}/print`} target="_blank" rel="noopener noreferrer"
            onClick={() => setOpen(false)}
            className="flex items-center gap-2.5 w-full px-3.5 py-2 text-sm hover:bg-gray-50 transition-colors text-gray-700">
            <Printer size={14} /> Print Profile
          </Link>
          <button onClick={shareWhatsApp}
            className="flex items-center gap-2.5 w-full px-3.5 py-2 text-sm hover:bg-gray-50 transition-colors text-green-600">
            <Share2 size={14} /> Share via WhatsApp
          </button>

          {/* Employment actions */}
          {(es === 'active' || es === 'suspended' || es === 'sacked') && (
            <div className="border-t border-gray-100 my-1" />
          )}
          {es === 'active' && (
            <>
              <MenuItem icon={ArrowLeftRight} label="Transfer"  cls="text-blue-600"  onClick={() => trigger('transfer')} />
              <MenuItem icon={Pause}          label="Suspend"   cls="text-amber-600" onClick={() => trigger('suspend')} />
              <MenuItem icon={ScanFace}       label="Reset Face" cls="text-purple-600" onClick={() => trigger('resetFace')} />
              <div className="border-t border-gray-100 my-1" />
              <MenuItem icon={Ban}            label="Dismiss"   cls="text-red-600"   onClick={() => trigger('sack')} />
            </>
          )}
          {es === 'suspended' && (
            <>
              <MenuItem icon={RefreshCw} label="Reactivate" cls="text-green-600" onClick={() => trigger('reactivate')} />
              <div className="border-t border-gray-100 my-1" />
              <MenuItem icon={Ban}       label="Dismiss"    cls="text-red-600"   onClick={() => trigger('sack')} />
            </>
          )}
          {es === 'sacked' && (
            <MenuItem icon={RefreshCw} label="Reactivate" cls="text-green-600" onClick={() => trigger('reactivate')} />
          )}

          {/* Super Admin: create staff account */}
          {isSuperAdmin() && (
            <>
              <div className="border-t border-gray-100 my-1" />
              <MenuItem icon={UserCog} label="Create Staff Account" cls="text-brand-600" onClick={() => trigger('createStaff')} />
            </>
          )}
        </div>
      )}
    </div>
  );
}

function MenuItem({ icon: Icon, label, cls, onClick }) {
  return (
    <button onClick={onClick}
      className={`flex items-center gap-2.5 w-full px-3.5 py-2 text-sm hover:bg-gray-50 transition-colors ${cls}`}>
      <Icon size={14} />
      {label}
    </button>
  );
}

// ─── Main Workers Page ────────────────────────────────────────────────────────
export default function Workers() {
  const notify              = useNotify();
  const { can, isSuperAdmin } = useAuth();
  const canEdit             = isSuperAdmin() || can('editWorkers');

  const [workers,    setWorkers   ] = useState([]);
  const [branches,   setBranches  ] = useState([]);
  const [loading,    setLoading   ] = useState(true);
  const [search,     setSearch    ] = useState('');
  const [status,     setStatus    ] = useState('');
  const [pagination, setPagination] = useState({ page: 1, pages: 1, total: 0 });
  const [page,       setPage      ] = useState(1);

  // Modal state: { type, worker }
  const [modal, setModal] = useState(null);

  // Load branches for activation modal
  useEffect(() => {
    api.get('/branches').then(r => setBranches(r.data.data)).catch(() => {});
  }, []);

  const loadWorkers = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page, limit: 15 });
      if (search) params.set('search', search);
      if (status) params.set('status', status);
      const { data } = await api.get(`/workers?${params}`);
      setWorkers(data.data);
      setPagination(data.pagination);
    } catch {
      // silent
    } finally {
      setLoading(false);
    }
  }, [search, status, page]);

  useEffect(() => { loadWorkers(); }, [loadWorkers]);
  useEffect(() => { setPage(1); }, [search, status]);

  const openModal = (type, worker) => setModal({ type, worker });
  const closeModal = () => setModal(null);
  const onDone = () => { closeModal(); loadWorkers(); };

  return (
    <div className="max-w-4xl mx-auto space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Workers</h1>
          <p className="text-sm text-gray-500 mt-0.5">{pagination.total} registered</p>
        </div>
        <Link to="/workers/new" className="btn-primary">
          <Plus size={16} />
          <span className="hidden sm:inline">Add Worker</span>
        </Link>
      </div>

      {/* Filters */}
      <div className="flex gap-3 flex-col sm:flex-row">
        <div className="relative flex-1">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input className="input pl-9" placeholder="Search by name or phone…"
            value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <select className="input sm:w-52" value={status} onChange={e => setStatus(e.target.value)}>
          <option value="">All Statuses</option>
          <option value="pending_verification">Pending</option>
          <option value="partially_verified">Partially Verified</option>
          <option value="pending_approval">Pending Approval</option>
          <option value="verified">Verified</option>
          <option value="rejected">Rejected</option>
        </select>
      </div>

      {/* Worker list */}
      {loading ? (
        <div className="card divide-y divide-gray-50">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="flex items-center gap-3 px-5 py-4 animate-pulse">
              <div className="w-12 h-12 rounded-xl bg-gray-100 shrink-0" />
              <div className="flex-1">
                <div className="h-4 w-40 bg-gray-100 rounded mb-2" />
                <div className="h-3 w-56 bg-gray-100 rounded" />
              </div>
              <div className="h-7 w-20 bg-gray-100 rounded-full" />
            </div>
          ))}
        </div>
      ) : workers.length === 0 ? (
        <div className="card px-6 py-16 text-center">
          <Users size={48} className="text-gray-200 mx-auto mb-3" />
          <p className="font-medium text-gray-600">No workers found</p>
          {(search || status)
            ? <p className="text-sm text-gray-400 mt-1">Try adjusting your filters</p>
            : <Link to="/workers/new" className="btn-primary mt-4 inline-flex"><Plus size={16} /> Register First Worker</Link>
          }
        </div>
      ) : (
        <div className="card divide-y divide-gray-50 overflow-hidden">
          {workers.map(w => {
            const es = w.employmentStatus || 'registered';
            const isRegistered  = es === 'registered';
            const isActive      = es === 'active';
            const isSuspended   = es === 'suspended';
            const isSacked      = es === 'sacked';

            return (
              <div key={w._id}
                className={`flex items-center gap-3 px-5 py-3.5 hover:bg-gray-50 transition-colors
                  ${isSacked ? 'opacity-60' : ''}`}>
                {/* Avatar + info → clickable */}
                <Link to={`/workers/${w._id}`} className="flex items-center gap-3 flex-1 min-w-0">
                  {w.passportPhoto?.url
                    ? <img src={w.passportPhoto.url} className="w-12 h-12 rounded-xl object-cover border border-gray-200 shrink-0" alt="" />
                    : <div className="w-12 h-12 rounded-xl bg-brand-100 text-brand-700 flex items-center justify-center font-bold text-lg shrink-0">
                        {w.fullName[0]}
                      </div>
                  }
                  <div className="min-w-0">
                    <p className="font-semibold text-gray-900 truncate text-sm">{w.fullName}</p>
                    <p className="text-xs text-gray-500 truncate mt-0.5">{w.role} · {w.branch}</p>
                    <div className="flex items-center gap-1 mt-0.5 text-xs text-gray-400">
                      <Phone size={9} />{w.phone}
                    </div>
                  </div>
                </Link>

                {/* Status badges — hidden on small screens */}
                <div className="hidden sm:flex items-center gap-2 shrink-0">
                  <EmploymentBadge status={es} />
                  <VerificationBadge status={w.verificationStatus} />
                </div>

                {/* Pay mode quick-edit */}
                {canEdit && (
                  <div className="hidden md:block shrink-0">
                    <PayModeBadge worker={w} onUpdated={loadWorkers} />
                  </div>
                )}

                {/* Context actions */}
                {canEdit && (
                  <div className="flex items-center gap-1.5 shrink-0">

                    {/* REGISTERED → big green Activate button */}
                    {isRegistered && (
                      <button
                        onClick={() => openModal('activate', w)}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-green-600 text-white text-xs font-semibold hover:bg-green-700 transition-colors shadow-sm"
                      >
                        <Play size={12} /> Activate
                      </button>
                    )}

                    {/* ACTIVE → "Verify" link + ⋮ menu */}
                    {isActive && (
                      <>
                        <Link to={`/workers/${w._id}/verify`}
                          className="hidden sm:flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-brand-50 text-brand-700 text-xs font-medium border border-brand-200 hover:bg-brand-100 transition-colors">
                          <ShieldCheck size={12} /> Verify
                        </Link>
                        <ActionMenu worker={w} onAction={openModal} />
                      </>
                    )}

                    {/* SUSPENDED → Reactivate + Sack in menu */}
                    {isSuspended && (
                      <>
                        <button onClick={() => openModal('reactivate', w)}
                          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-green-50 text-green-700 text-xs font-semibold border border-green-200 hover:bg-green-100 transition-colors">
                          <RefreshCw size={12} /> Reactivate
                        </button>
                        <ActionMenu worker={w} onAction={openModal} />
                      </>
                    )}

                    {/* SACKED → Reactivate option */}
                    {isSacked && (
                      <button onClick={() => openModal('reactivate', w)}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-gray-100 text-gray-600 text-xs font-medium hover:bg-gray-200 transition-colors">
                        <RefreshCw size={12} /> Rehire
                      </button>
                    )}
                  </div>
                )}

                {/* Arrow to profile */}
                <Link to={`/workers/${w._id}`} className="text-gray-300 hover:text-gray-500 shrink-0">
                  <ChevronRight size={16} />
                </Link>
              </div>
            );
          })}
        </div>
      )}

      {/* Pagination */}
      {pagination.pages > 1 && (
        <div className="flex items-center justify-between pt-2">
          <p className="text-sm text-gray-500">Page {pagination.page} of {pagination.pages}</p>
          <div className="flex gap-2">
            <button className="btn-secondary px-3 py-1.5 text-xs" disabled={page <= 1} onClick={() => setPage(p => p - 1)}>Previous</button>
            <button className="btn-secondary px-3 py-1.5 text-xs" disabled={page >= pagination.pages} onClick={() => setPage(p => p + 1)}>Next</button>
          </div>
        </div>
      )}

      {/* Modals */}
      {modal?.type === 'activate'    && <ActivateModal          worker={modal.worker} branches={branches} onClose={closeModal} onDone={onDone} />}
      {modal?.type === 'transfer'    && <TransferModal          worker={modal.worker} branches={branches} onClose={closeModal} onDone={onDone} />}
      {modal?.type === 'suspend'     && <SuspendModal           worker={modal.worker}                     onClose={closeModal} onDone={onDone} />}
      {modal?.type === 'sack'        && <SackModal              worker={modal.worker}                     onClose={closeModal} onDone={onDone} />}
      {modal?.type === 'reactivate'  && <ReactivateModal        worker={modal.worker}                     onClose={closeModal} onDone={onDone} />}
      {modal?.type === 'createStaff' && <CreateStaffAccountModal worker={modal.worker}                    onClose={closeModal} onDone={onDone} />}
      {modal?.type === 'resetFace'   && <ResetFaceModal         worker={modal.worker}                     onClose={closeModal} onDone={onDone} />}
    </div>
  );
}
