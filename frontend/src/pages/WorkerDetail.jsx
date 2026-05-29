import { useState, useEffect, useRef } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import {
  ChevronLeft, Edit2, Trash2, CheckCircle, MapPin, Plus, Eye, EyeOff, FileText, X,
  Phone, Home, Users, ShieldCheck, ArrowRight, AlertCircle, Clock, XCircle,
  BadgeCheck, Briefcase, Building2, Calendar, Wallet, Landmark, History,
  Play, Pause, Ban, RefreshCw, ArrowLeftRight, Save, Loader, ChevronDown, ChevronUp,
  Printer, Share2, UserCog
} from 'lucide-react';
import api from '../utils/api';
import { useNotify } from '../context/NotificationContext';
import { useAuth } from '../context/AuthContext';
import VerificationBadge from '../components/VerificationBadge';
import { EmploymentBadge } from './ActiveWorkers';
import MapPicker from '../components/MapPicker';
import FileUpload from '../components/FileUpload';
import NumInput from '../components/NumInput';

// ─── Constants ────────────────────────────────────────────────────────────────
const DOC_LABELS = {
  nin: 'NIN (National ID Number)', voter_card: "Voter's Card",
  drivers_license: "Driver's License", national_id: 'National ID Card',
  international_passport: 'International Passport'
};

const ROLES = ['Pump Attendant','Supervisor','Outside Supervisor','Cashier','Manager','Security','Maintenance','Accountant','Driver','Cleaner'];
const SCHEDULES = ['Morning Shift','Afternoon Shift','Night Shift','Full Day','Day Shift','Rotating Shift','1 Day In / 1 Day Out'];
const NIGERIAN_BANKS = [
  'Access Bank','First Bank of Nigeria','Guaranty Trust Bank (GTBank)','Zenith Bank',
  'United Bank for Africa (UBA)','Fidelity Bank','FCMB (First City Monument Bank)',
  'Sterling Bank','Union Bank','Stanbic IBTC Bank','Polaris Bank','Keystone Bank',
  'Ecobank Nigeria','Heritage Bank','Providus Bank','VFD Microfinance Bank',
  'OPay','PalmPay','Kuda Bank','Moniepoint MFB','Carbon (One Finance)','Wema Bank',
  'SunTrust Bank','Titan Trust Bank','Globus Bank'
];

const TABS = ['Profile','Employment','Verification','Salary & Bank','House','Guarantors'];

// ─── Shift helpers ─────────────────────────────────────────────────────────────
function useShifts(branchId) {
  const [shifts, setShifts] = useState([]);
  useEffect(() => {
    if (!branchId) { setShifts([]); return; }
    api.get(`/shifts?branchId=${branchId}`).then(r => setShifts(r.data.data)).catch(() => setShifts([]));
  }, [branchId]);
  return shifts;
}

function ShiftSelector({ branchId, value, onChange }) {
  const shifts = useShifts(branchId);
  if (!branchId) return (
    <p className="text-xs text-gray-400 px-1">Select a branch first to see its shifts</p>
  );
  if (shifts.length === 0) return (
    <p className="text-xs text-amber-600 px-1">No shifts for this branch — add them in the Shifts page</p>
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

const HISTORY_ICONS = {
  registered:    { icon: Play,           cls: 'text-gray-500 bg-gray-100' },
  activated:     { icon: Play,           cls: 'text-green-600 bg-green-100' },
  transferred:   { icon: ArrowLeftRight, cls: 'text-blue-600 bg-blue-100' },
  role_changed:  { icon: Briefcase,      cls: 'text-indigo-600 bg-indigo-100' },
  suspended:     { icon: Pause,          cls: 'text-amber-600 bg-amber-100' },
  sacked:        { icon: Ban,            cls: 'text-red-600 bg-red-100' },
  reactivated:   { icon: RefreshCw,      cls: 'text-green-600 bg-green-100' },
  schedule_changed: { icon: Calendar,    cls: 'text-purple-600 bg-purple-100' },
  deactivated:   { icon: XCircle,        cls: 'text-gray-600 bg-gray-100' },
};

// ─── Modals ───────────────────────────────────────────────────────────────────
function ActivateModal({ worker, branches, onClose, onDone }) {
  const notify = useNotify();
  const today  = new Date().toISOString().split('T')[0];
  const [saving,         setSaving        ] = useState(false);
  const [branchId,       setBranchId      ] = useState(worker.branchId?._id || worker.branchId || '');
  const [shiftId,        setShiftId       ] = useState('');
  const [role,           setRole          ] = useState(worker.role || '');
  const [customRole,     setCustomRole    ] = useState('');
  const [resumptionDate, setResumption    ] = useState(
    worker.resumptionDate ? new Date(worker.resumptionDate).toISOString().split('T')[0] : today
  );
  const [rotPattern,     setRotPattern    ] = useState(worker.rotationSchedule?.pattern || 'none');
  const [rotStartDate,   setRotStartDate  ] = useState(
    worker.rotationSchedule?.startDate
      ? new Date(worker.rotationSchedule.startDate).toISOString().split('T')[0] : ''
  );
  const [notes,          setNotes         ] = useState('');

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
        rotationSchedule: rotPattern !== 'none'
          ? { pattern: rotPattern, startDate: rotStartDate || undefined }
          : { pattern: 'none' },
        notes
      });
      notify(`${worker.fullName} activated ✓`);
      onDone();
    } catch (err) {
      notify(err.response?.data?.message || 'Failed to activate', 'error');
    } finally { setSaving(false); }
  };

  return (
    <Modal title="Activate Worker" icon={<Play size={16} className="text-green-600" />} onClose={onClose}>
      <form onSubmit={submit} className="space-y-4">
        {/* Branch */}
        <div>
          <label className="label flex items-center gap-1.5"><Building2 size={12} /> Assign Branch</label>
          <select className="input" value={branchId}
            onChange={e => { setBranchId(e.target.value); setShiftId(''); }}>
            <option value="">— Keep current branch —</option>
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
            <option value="__custom">Other (type below)</option>
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
          <p className="text-xs text-gray-400 mt-1">Used to prorate salary if the worker joins mid-month</p>
        </div>
        {/* Rotation Schedule */}
        <div className="rounded-xl border border-gray-200 p-3 space-y-3 bg-gray-50">
          <p className="text-sm font-medium text-gray-700 flex items-center gap-1.5">
            🔄 Rotation Schedule
          </p>
          <div>
            <label className="label">Pattern</label>
            <select className="input" value={rotPattern} onChange={e => setRotPattern(e.target.value)}>
              <option value="none">No rotation (standard schedule)</option>
              <option value="1_1">1 Day On / 1 Day Off</option>
              <option value="2_2">2 Days On / 2 Days Off</option>
              <option value="3_3">3 Days On / 3 Days Off</option>
              <option value="4_3">4 Days On / 3 Days Off</option>
              <option value="5_2">5 Days On / 2 Days Off (weekly)</option>
              <option value="6_1">6 Days On / 1 Day Off</option>
            </select>
          </div>
          {rotPattern !== 'none' && (
            <div>
              <label className="label">First On-Duty Day</label>
              <input type="date" className="input" value={rotStartDate}
                onChange={e => setRotStartDate(e.target.value)} />
              <p className="text-xs text-gray-400 mt-1">
                Pick a day you know this worker is "on duty" — the system uses this to calculate all future on/off days
              </p>
            </div>
          )}
        </div>
        {/* Notes */}
        <div>
          <label className="label">Notes (optional)</label>
          <textarea className="input resize-none" rows={2} value={notes} onChange={e => setNotes(e.target.value)} />
        </div>
        <ModalActions saving={saving} submitLabel="Activate Worker" onClose={onClose} />
      </form>
    </Modal>
  );
}

function TransferModal({ worker, branches, onClose, onDone }) {
  const notify = useNotify();
  const [saving,     setSaving    ] = useState(false);
  const [branchId,   setBranchId  ] = useState('');
  const [shiftId,    setShiftId   ] = useState('');
  const [role,       setRole      ] = useState('');
  const [customRole, setCustomRole] = useState('');
  const [reason,     setReason    ] = useState('');
  const [notes,      setNotes     ] = useState('');

  const finalRole = role === '__custom' ? customRole : role;

  const submit = async (e) => {
    e.preventDefault();
    if (!reason.trim()) return notify('Transfer reason is required', 'error');
    setSaving(true);
    try {
      await api.post(`/workers/${worker._id}/transfer`, {
        branchId: branchId  || undefined,
        shiftId:  shiftId   || undefined,
        role:     finalRole || undefined,
        reason, notes
      });
      notify(`${worker.fullName} transferred ✓`);
      onDone();
    } catch (err) {
      notify(err.response?.data?.message || 'Failed to transfer', 'error');
    } finally { setSaving(false); }
  };

  return (
    <Modal title="Transfer Worker" icon={<ArrowLeftRight size={16} className="text-blue-600" />} onClose={onClose}>
      <form onSubmit={submit} className="space-y-4">
        {/* Branch */}
        <div>
          <label className="label flex items-center gap-1.5"><Building2 size={12} /> New Branch</label>
          <select className="input" value={branchId}
            onChange={e => { setBranchId(e.target.value); setShiftId(''); }}>
            <option value="">— Keep current ({worker.branchId?.name || worker.branch || 'none'}) —</option>
            {branches.filter(b => b._id !== (worker.branchId?._id || worker.branchId)).map(b => (
              <option key={b._id} value={b._id}>{b.name}</option>
            ))}
          </select>
        </div>
        {/* Shift */}
        <div>
          <label className="label flex items-center gap-1.5"><Clock size={12} /> New Shift (optional)</label>
          <ShiftSelector
            branchId={branchId || (worker.branchId?._id || worker.branchId)}
            value={shiftId}
            onChange={setShiftId}
          />
        </div>
        {/* Role */}
        <div>
          <label className="label flex items-center gap-1.5"><Briefcase size={12} /> New Role (optional)</label>
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
        {/* Reason */}
        <div>
          <label className="label">Reason *</label>
          <input className="input" placeholder="Why is this worker being transferred?"
            value={reason} onChange={e => setReason(e.target.value)} required />
        </div>
        {/* Notes */}
        <div>
          <label className="label">Notes (optional)</label>
          <textarea className="input resize-none" rows={2} value={notes} onChange={e => setNotes(e.target.value)} />
        </div>
        <ModalActions saving={saving} submitLabel="Confirm Transfer" onClose={onClose} />
      </form>
    </Modal>
  );
}

function SuspendModal({ worker, onClose, onDone }) {
  const notify = useNotify();
  const [saving, setSaving] = useState(false);
  const [reason, setReason] = useState('');
  const [notes,  setNotes ] = useState('');
  const [date,   setDate  ] = useState(new Date().toISOString().slice(0, 10));

  const submit = async (e) => {
    e.preventDefault();
    if (!reason.trim()) return notify('Reason is required', 'error');
    setSaving(true);
    try {
      await api.post(`/workers/${worker._id}/suspend`, { reason, notes, date });
      notify(`${worker.fullName} suspended`);
      onDone();
    } catch (err) {
      notify(err.response?.data?.message || 'Failed to suspend', 'error');
    } finally { setSaving(false); }
  };

  return (
    <Modal title="Suspend Worker" icon={<Pause size={16} className="text-amber-600" />} onClose={onClose}>
      <form onSubmit={submit} className="space-y-4">
        <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl text-sm text-amber-700">
          Suspending <strong>{worker.fullName}</strong> will change their status to Suspended.
          You can reactivate them later.
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
        <div>
          <label className="label">Additional Notes (optional)</label>
          <textarea className="input resize-none" rows={2} value={notes} onChange={e => setNotes(e.target.value)} />
        </div>
        <ModalActions saving={saving} submitLabel="Suspend Worker"
          submitClass="bg-amber-600 text-white hover:bg-amber-700" onClose={onClose} />
      </form>
    </Modal>
  );
}

function SackModal({ worker, onClose, onDone }) {
  const notify = useNotify();
  const [saving, setSaving] = useState(false);
  const [reason, setReason] = useState('');
  const [notes,  setNotes ] = useState('');
  const [date,   setDate  ] = useState(new Date().toISOString().slice(0, 10));
  const [confirm, setConfirm] = useState('');

  const submit = async (e) => {
    e.preventDefault();
    if (!reason.trim()) return notify('Reason is required', 'error');
    if (confirm !== worker.fullName) return notify('Type the worker\'s full name to confirm', 'error');
    setSaving(true);
    try {
      await api.post(`/workers/${worker._id}/sack`, { reason, notes, date });
      notify(`${worker.fullName} has been dismissed`);
      onDone();
    } catch (err) {
      notify(err.response?.data?.message || 'Failed', 'error');
    } finally { setSaving(false); }
  };

  return (
    <Modal title="Dismiss Worker" icon={<Ban size={16} className="text-red-600" />} onClose={onClose}>
      <form onSubmit={submit} className="space-y-4">
        <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700">
          ⚠️ You are dismissing <strong>{worker.fullName}</strong>. This is a serious action.
          You can reactivate this worker later if needed.
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
          <label className="label">Notes (optional)</label>
          <textarea className="input resize-none" rows={2} value={notes} onChange={e => setNotes(e.target.value)} />
        </div>
        <div>
          <label className="label">
            Type <strong>{worker.fullName}</strong> to confirm *
          </label>
          <input className="input border-red-300 focus:border-red-500 focus:ring-red-200"
            placeholder="Full name…"
            value={confirm} onChange={e => setConfirm(e.target.value)} />
        </div>
        <ModalActions saving={saving} submitLabel="Dismiss Worker"
          submitClass="bg-red-600 text-white hover:bg-red-700" onClose={onClose} />
      </form>
    </Modal>
  );
}

function ReactivateModal({ worker, onClose, onDone }) {
  const notify = useNotify();
  const [saving, setSaving] = useState(false);
  const [notes,  setNotes ] = useState('');

  const submit = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      await api.post(`/workers/${worker._id}/reactivate`, { notes });
      notify(`${worker.fullName} reactivated ✓`);
      onDone();
    } catch (err) {
      notify(err.response?.data?.message || 'Failed', 'error');
    } finally { setSaving(false); }
  };

  return (
    <Modal title="Reactivate Worker" icon={<RefreshCw size={16} className="text-green-600" />} onClose={onClose}>
      <form onSubmit={submit} className="space-y-4">
        <div className="p-3 bg-green-50 border border-green-200 rounded-xl text-sm text-green-700">
          Reactivating <strong>{worker.fullName}</strong> will set their status back to Active.
        </div>
        <div>
          <label className="label">Notes (optional)</label>
          <textarea className="input resize-none" rows={2} value={notes} onChange={e => setNotes(e.target.value)} />
        </div>
        <ModalActions saving={saving} submitLabel="Reactivate Worker" onClose={onClose} />
      </form>
    </Modal>
  );
}

// ─── Shared modal wrapper ─────────────────────────────────────────────────────
function Modal({ title, icon, onClose, children }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 overflow-y-auto">
      <div className="bg-white rounded-2xl w-full max-w-md shadow-2xl my-4">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <div className="flex items-center gap-2">
            {icon}
            <h3 className="font-bold text-gray-900">{title}</h3>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X size={18} /></button>
        </div>
        <div className="px-5 py-4">{children}</div>
      </div>
    </div>
  );
}

function ModalActions({ saving, submitLabel, submitClass, onClose }) {
  return (
    <div className="flex gap-3 pt-2">
      <button type="submit" disabled={saving}
        className={`flex items-center justify-center gap-2 flex-1 py-2.5 rounded-xl font-medium text-sm transition-colors
          ${submitClass || 'bg-brand-600 text-white hover:bg-brand-700'}`}>
        {saving ? <Loader size={15} className="animate-spin" /> : submitLabel}
      </button>
      <button type="button" onClick={onClose} className="btn-secondary">Cancel</button>
    </div>
  );
}

// ─── Section helper ───────────────────────────────────────────────────────────
function Section({ title, children, action }) {
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold text-gray-800">{title}</h3>
        {action}
      </div>
      {children}
    </div>
  );
}

// ─── Employment Tab ───────────────────────────────────────────────────────────
function EmploymentTab({ worker, branches, onRefresh }) {
  const { can, isSuperAdmin } = useAuth();
  const notify = useNotify();
  const canEdit = isSuperAdmin() || can('editWorkers');
  const es = worker.employmentStatus;

  const [modal,        setModal       ] = useState(null);
  const [histOpen,     setHistOpen    ] = useState(true);
  const [editResump,    setEditResump   ] = useState(false);
  const [resumpDate,    setResumpDate   ] = useState(
    worker.resumptionDate ? new Date(worker.resumptionDate).toISOString().split('T')[0] : ''
  );
  const [savingResump,  setSavingResump ] = useState(false);
  const [editRotation,  setEditRotation ] = useState(false);
  const [rotPat,        setRotPat       ] = useState(worker.rotationSchedule?.pattern || 'none');
  const [rotStart,      setRotStart     ] = useState(
    worker.rotationSchedule?.startDate
      ? new Date(worker.rotationSchedule.startDate).toISOString().split('T')[0] : ''
  );
  const [savingRot,     setSavingRot    ] = useState(false);
  const [clockInReq,    setClockInReq   ] = useState(worker.clockInRequired !== false);
  const [savingCIR,     setSavingCIR    ] = useState(false);

  const done = () => { setModal(null); onRefresh(); };

  const saveResumptionDate = async () => {
    setSavingResump(true);
    try {
      await api.put(`/workers/${worker._id}/resumption`, { resumptionDate: resumpDate || null });
      notify('Resumption date saved ✓');
      setEditResump(false);
      onRefresh();
    } catch (err) {
      notify(err.response?.data?.message || 'Failed to save', 'error');
    } finally { setSavingResump(false); }
  };

  const saveRotationSchedule = async () => {
    setSavingRot(true);
    try {
      await api.put(`/workers/${worker._id}/rotation-schedule`, {
        pattern:   rotPat,
        startDate: rotPat !== 'none' ? (rotStart || null) : null,
      });
      notify('Rotation schedule saved ✓');
      setEditRotation(false);
      onRefresh();
    } catch (err) {
      notify(err.response?.data?.message || 'Failed to save', 'error');
    } finally { setSavingRot(false); }
  };

  const ROTATION_LABELS = { none:'No rotation', '1_1':'1 Day On / 1 Day Off', '2_2':'2 Days On / 2 Days Off', '3_3':'3 Days On / 3 Days Off', '4_3':'4 Days On / 3 Days Off', '5_2':'5 Days On / 2 Days Off', '6_1':'6 Days On / 1 Day Off' };

  const saveClockInRequired = async (val) => {
    setSavingCIR(true);
    try {
      await api.put(`/workers/${worker._id}/clock-in-required`, { clockInRequired: val });
      setClockInReq(val);
      notify(val ? 'Clock-in required ✓' : 'Worker marked as clock-in exempt ✓');
      onRefresh();
    } catch { notify('Failed to save', 'error'); }
    finally { setSavingCIR(false); }
  };

  return (
    <div className="space-y-5">
      {/* Current Status */}
      <div className="rounded-xl border border-gray-200 p-4 space-y-3">
        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Employment Status</p>
        <div className="flex items-center gap-3 flex-wrap">
          <EmploymentBadge status={es} />
          {es === 'active' && worker.activatedAt && (
            <span className="text-xs text-gray-400">
              Active since {new Date(worker.activatedAt).toLocaleDateString('en-NG', { day: 'numeric', month: 'short', year: 'numeric' })}
              {worker.activatedBy?.name && ` · activated by ${worker.activatedBy.name}`}
            </span>
          )}
          {es === 'suspended' && worker.suspendedAt && (
            <span className="text-xs text-amber-600">
              Suspended {new Date(worker.suspendedAt).toLocaleDateString('en-NG')}
              {worker.suspendedBy?.name && ` by ${worker.suspendedBy.name}`}
            </span>
          )}
          {es === 'sacked' && worker.sackedAt && (
            <span className="text-xs text-red-600">
              Dismissed {new Date(worker.sackedAt).toLocaleDateString('en-NG')}
              {worker.sackedBy?.name && ` by ${worker.sackedBy.name}`}
            </span>
          )}
        </div>

        {/* Reason boxes */}
        {es === 'suspended' && worker.suspensionReason && (
          <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg text-sm text-amber-800">
            <p className="text-xs font-medium text-amber-500 uppercase mb-1">Suspension Reason</p>
            {worker.suspensionReason}
          </div>
        )}
        {es === 'sacked' && worker.sackReason && (
          <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-800">
            <p className="text-xs font-medium text-red-500 uppercase mb-1">Reason for Dismissal</p>
            {worker.sackReason}
          </div>
        )}
      </div>

      {/* Assignment */}
      <div className="rounded-xl border border-gray-200 p-4 space-y-2">
        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Current Assignment</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="flex items-center gap-2">
            <Building2 size={14} className="text-brand-400 shrink-0" />
            <div>
              <p className="text-xs text-gray-400">Branch</p>
              <p className="text-sm font-medium text-gray-800">{worker.branchId?.name || worker.branch || '—'}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Briefcase size={14} className="text-brand-400 shrink-0" />
            <div>
              <p className="text-xs text-gray-400">Role</p>
              <p className="text-sm font-medium text-gray-800">{worker.role || '—'}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Clock size={14} className="text-brand-400 shrink-0" />
            <div>
              <p className="text-xs text-gray-400">Shift</p>
              <p className="text-sm font-medium text-gray-800">
                {worker.shiftId?.name
                  ? <>
                      {worker.shiftId.name}
                      {worker.shiftId.startTime && worker.shiftId.endTime &&
                        <span className="text-xs text-brand-500 ml-1">
                          {worker.shiftId.startTime}–{worker.shiftId.endTime}
                        </span>
                      }
                    </>
                  : worker.schedule || '—'
                }
              </p>
            </div>
          </div>
          {worker.schedule && worker.shiftId?.name && worker.schedule !== worker.shiftId.name && (
            <div className="flex items-center gap-2">
              <Calendar size={14} className="text-brand-400 shrink-0" />
              <div>
                <p className="text-xs text-gray-400">Schedule Label</p>
                <p className="text-sm font-medium text-gray-800">{worker.schedule}</p>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Resumption Date */}
      <div className="rounded-xl border border-gray-200 p-4">
        <div className="flex items-center justify-between mb-3">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Resumption Date</p>
          {canEdit && !editResump && (
            <button onClick={() => setEditResump(true)}
              className="text-xs text-brand-600 hover:text-brand-800 flex items-center gap-1 font-medium">
              <Edit2 size={11} /> Edit
            </button>
          )}
        </div>
        {editResump ? (
          <div className="flex items-center gap-2 flex-wrap">
            <input
              type="date"
              className="input max-w-[180px]"
              value={resumpDate}
              onChange={e => setResumpDate(e.target.value)}
            />
            <button onClick={saveResumptionDate} disabled={savingResump}
              className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-brand-600 text-white text-xs font-medium hover:bg-brand-700">
              {savingResump ? <Loader size={12} className="animate-spin" /> : <><Save size={12} /> Save</>}
            </button>
            <button onClick={() => { setEditResump(false); setResumpDate(worker.resumptionDate ? new Date(worker.resumptionDate).toISOString().split('T')[0] : ''); }}
              className="text-xs text-gray-500 hover:text-gray-800 px-2 py-2">Cancel</button>
          </div>
        ) : (
          <div className="flex items-center gap-2">
            <Calendar size={14} className="text-brand-400 shrink-0" />
            {worker.resumptionDate ? (
              <div>
                <p className="text-sm font-medium text-gray-800">
                  {new Date(worker.resumptionDate).toLocaleDateString('en-NG', { day: 'numeric', month: 'long', year: 'numeric' })}
                </p>
                <p className="text-xs text-gray-400 mt-0.5">
                  Used to prorate first-month salary if worker joined mid-month
                </p>
              </div>
            ) : (
              <p className="text-sm text-gray-400">
                Not set — {canEdit ? 'click Edit to add' : 'contact an admin to set this'}
              </p>
            )}
          </div>
        )}
      </div>

      {/* Rotation Schedule */}
      <div className="rounded-xl border border-gray-200 p-4">
        <div className="flex items-center justify-between mb-3">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Rotation Schedule</p>
          {canEdit && !editRotation && (
            <button onClick={() => setEditRotation(true)}
              className="text-xs text-brand-600 hover:text-brand-800 flex items-center gap-1 font-medium">
              <Edit2 size={11} /> Edit
            </button>
          )}
        </div>
        {editRotation ? (
          <div className="space-y-3">
            <select className="input" value={rotPat} onChange={e => setRotPat(e.target.value)}>
              <option value="none">No rotation (standard schedule)</option>
              <option value="1_1">1 Day On / 1 Day Off</option>
              <option value="2_2">2 Days On / 2 Days Off</option>
              <option value="3_3">3 Days On / 3 Days Off</option>
              <option value="4_3">4 Days On / 3 Days Off</option>
              <option value="5_2">5 Days On / 2 Days Off (weekly)</option>
              <option value="6_1">6 Days On / 1 Day Off</option>
            </select>
            {rotPat !== 'none' && (
              <div>
                <label className="label text-xs">First On-Duty Day</label>
                <input type="date" className="input" value={rotStart} onChange={e => setRotStart(e.target.value)} />
                <p className="text-xs text-gray-400 mt-1">A date you know is an "on duty" day — anchors the whole rotation cycle</p>
              </div>
            )}
            <div className="flex items-center gap-2">
              <button onClick={saveRotationSchedule} disabled={savingRot}
                className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-brand-600 text-white text-xs font-medium hover:bg-brand-700">
                {savingRot ? <Loader size={12} className="animate-spin" /> : <><Save size={12} /> Save</>}
              </button>
              <button onClick={() => setEditRotation(false)} className="text-xs text-gray-500 hover:text-gray-800 px-2 py-2">Cancel</button>
            </div>
          </div>
        ) : (
          <div className="flex items-start gap-2">
            <span className="text-lg mt-0.5">🔄</span>
            <div>
              <p className="text-sm font-medium text-gray-800">
                {ROTATION_LABELS[worker.rotationSchedule?.pattern] || 'No rotation'}
              </p>
              {worker.rotationSchedule?.pattern && worker.rotationSchedule.pattern !== 'none' && (
                <p className="text-xs text-gray-400 mt-0.5">
                  {worker.rotationSchedule.startDate
                    ? <>Anchored from {new Date(worker.rotationSchedule.startDate).toLocaleDateString('en-NG', { day: 'numeric', month: 'short', year: 'numeric' })}</>
                    : 'Start date not set — deductions may apply incorrectly'
                  }
                </p>
              )}
              {!worker.rotationSchedule?.pattern || worker.rotationSchedule.pattern === 'none' ? (
                <p className="text-xs text-gray-400 mt-0.5">
                  All days treated as work days for attendance purposes
                </p>
              ) : null}
            </div>
          </div>
        )}
      </div>

      {/* Clock-in requirement */}
      <div className="rounded-xl border border-gray-200 p-4">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-0.5">Attendance Tracking</p>
            <p className="text-sm text-gray-800 font-medium">
              {clockInReq ? '🕐 Clock-in required' : '💼 Salary / Exempt — no clock-in'}
            </p>
            <p className="text-xs text-gray-400 mt-0.5">
              {clockInReq
                ? 'Worker must clock in. Late/absent deductions apply.'
                : 'Worker does not clock in. No attendance deductions will fire.'}
            </p>
          </div>
          {canEdit && (
            <button
              onClick={() => saveClockInRequired(!clockInReq)}
              disabled={savingCIR}
              className={`ml-4 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors shrink-0
                ${clockInReq
                  ? 'bg-gray-100 text-gray-600 hover:bg-amber-50 hover:text-amber-700'
                  : 'bg-green-50 text-green-700 hover:bg-green-100'}`}
            >
              {savingCIR ? '…' : clockInReq ? 'Mark Exempt' : 'Require Clock-in'}
            </button>
          )}
        </div>
      </div>

      {/* Action buttons */}
      {canEdit && (
        <div className="flex flex-wrap gap-2">
          {['registered', 'inactive'].includes(es) && (
            <button onClick={() => setModal('activate')}
              className="flex items-center gap-2 px-4 py-2 rounded-lg bg-green-600 text-white text-sm font-medium hover:bg-green-700 transition-colors">
              <Play size={14} /> Activate Worker
            </button>
          )}
          {es === 'active' && (
            <>
              <button onClick={() => setModal('transfer')}
                className="flex items-center gap-2 px-4 py-2 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 transition-colors">
                <ArrowLeftRight size={14} /> Transfer
              </button>
              <button onClick={() => setModal('suspend')}
                className="flex items-center gap-2 px-4 py-2 rounded-lg bg-amber-100 text-amber-700 border border-amber-300 text-sm font-medium hover:bg-amber-200 transition-colors">
                <Pause size={14} /> Suspend
              </button>
              <button onClick={() => setModal('sack')}
                className="flex items-center gap-2 px-4 py-2 rounded-lg bg-red-50 text-red-600 border border-red-200 text-sm font-medium hover:bg-red-100 transition-colors">
                <Ban size={14} /> Dismiss
              </button>
            </>
          )}
          {['suspended', 'sacked'].includes(es) && (
            <>
              <button onClick={() => setModal('reactivate')}
                className="flex items-center gap-2 px-4 py-2 rounded-lg bg-green-600 text-white text-sm font-medium hover:bg-green-700 transition-colors">
                <RefreshCw size={14} /> Reactivate
              </button>
              {es === 'suspended' && (
                <button onClick={() => setModal('sack')}
                  className="flex items-center gap-2 px-4 py-2 rounded-lg bg-red-50 text-red-600 border border-red-200 text-sm font-medium hover:bg-red-100 transition-colors">
                  <Ban size={14} /> Dismiss
                </button>
              )}
            </>
          )}
        </div>
      )}

      {/* Employment history */}
      {worker.employmentHistory?.length > 0 && (
        <div className="rounded-xl border border-gray-200 overflow-hidden">
          <button
            onClick={() => setHistOpen(v => !v)}
            className="flex items-center justify-between w-full px-4 py-3 bg-gray-50 hover:bg-gray-100 transition-colors text-left"
          >
            <span className="flex items-center gap-2 text-sm font-semibold text-gray-700">
              <History size={14} /> Employment History ({worker.employmentHistory.length})
            </span>
            {histOpen ? <ChevronUp size={15} className="text-gray-400" /> : <ChevronDown size={15} className="text-gray-400" />}
          </button>
          {histOpen && (
            <div className="divide-y divide-gray-100">
              {[...worker.employmentHistory].reverse().map((h) => {
                const meta = HISTORY_ICONS[h.action] || HISTORY_ICONS.registered;
                const Icon = meta.icon;
                return (
                  <div key={h._id} className="flex items-start gap-3 px-4 py-3">
                    <div className={`w-7 h-7 rounded-full flex items-center justify-center shrink-0 mt-0.5 ${meta.cls}`}>
                      <Icon size={12} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-800 capitalize">{h.action.replace(/_/g, ' ')}</p>
                      {(h.fromBranch || h.toBranch) && h.fromBranch !== h.toBranch && (
                        <p className="text-xs text-gray-500 mt-0.5">
                          {h.fromBranch} → {h.toBranch}
                        </p>
                      )}
                      {(h.fromRole || h.toRole) && h.fromRole !== h.toRole && (
                        <p className="text-xs text-gray-500">
                          Role: {h.fromRole} → {h.toRole}
                        </p>
                      )}
                      {h.reason && (
                        <p className="text-xs text-gray-600 mt-0.5 italic">"{h.reason}"</p>
                      )}
                      {h.notes && (
                        <p className="text-xs text-gray-400">{h.notes}</p>
                      )}
                      <p className="text-xs text-gray-400 mt-1 flex items-center gap-1">
                        <Clock size={9} />
                        {new Date(h.date).toLocaleDateString('en-NG', { day: 'numeric', month: 'short', year: 'numeric' })}
                        {h.performedBy?.name && ` · ${h.performedBy.name}`}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Modals */}
      {modal === 'activate'   && <ActivateModal   worker={worker} branches={branches} onClose={() => setModal(null)} onDone={done} />}
      {modal === 'transfer'   && <TransferModal   worker={worker} branches={branches} onClose={() => setModal(null)} onDone={done} />}
      {modal === 'suspend'    && <SuspendModal    worker={worker}                     onClose={() => setModal(null)} onDone={done} />}
      {modal === 'sack'       && <SackModal       worker={worker}                     onClose={() => setModal(null)} onDone={done} />}
      {modal === 'reactivate' && <ReactivateModal worker={worker}                     onClose={() => setModal(null)} onDone={done} />}
    </div>
  );
}

// ─── Verification Tab ─────────────────────────────────────────────────────────
function VerificationTab({ worker, guarantors }) {
  const status   = worker.verificationStatus;
  const isLocked = ['pending_approval', 'verified', 'rejected'].includes(status);

  const checks = [
    { label: 'Passport Photo',    done: !!worker.passportPhoto?.url },
    { label: 'Signature',         done: !!worker.signature?.url },
    { label: 'Address Pinned',    done: !!worker.addressLocation?.coordinates?.lat },
    { label: 'Verification Docs', done: (worker.verificationDocuments?.length || 0) > 0 },
    { label: 'Guarantor 1',       done: guarantors.length >= 1 },
    { label: 'Guarantor 2',       done: guarantors.length >= 2 },
    { label: 'House Photos',      done: (worker.houseVerification?.photos?.length || 0) > 0 }
  ];
  const doneCount = checks.filter(c => c.done).length;
  const pct       = Math.round((doneCount / checks.length) * 100);
  const allDone   = doneCount === checks.length;

  return (
    <div className="space-y-4">
      {/* Status banners */}
      {status === 'verified' && (
        <div className="flex items-start gap-3 p-4 rounded-xl bg-green-50 border border-green-200">
          <BadgeCheck size={22} className="text-green-600 shrink-0 mt-0.5" />
          <div>
            <p className="font-semibold text-green-800">Worker Verified ✓</p>
            {worker.approvedBy?.name && (
              <p className="text-sm text-green-600 mt-0.5">
                Approved by <strong>{worker.approvedBy.name}</strong>
                {worker.approvedAt && ` on ${new Date(worker.approvedAt).toLocaleDateString('en-NG', { day: 'numeric', month: 'long', year: 'numeric' })}`}
              </p>
            )}
          </div>
        </div>
      )}
      {status === 'pending_approval' && (
        <div className="flex items-start gap-3 p-4 rounded-xl bg-purple-50 border border-purple-200">
          <Clock size={20} className="text-purple-600 shrink-0 mt-0.5" />
          <div>
            <p className="font-semibold text-purple-800">Awaiting Super Admin Approval</p>
            {worker.submittedForApprovalAt && (
              <p className="text-xs text-purple-500 mt-1">
                Submitted {new Date(worker.submittedForApprovalAt).toLocaleString('en-NG')}
                {worker.submittedForApprovalBy?.name && ` by ${worker.submittedForApprovalBy.name}`}
              </p>
            )}
          </div>
        </div>
      )}
      {status === 'rejected' && (
        <div className="flex items-start gap-3 p-4 rounded-xl bg-red-50 border border-red-200">
          <XCircle size={20} className="text-red-500 shrink-0 mt-0.5" />
          <div className="flex-1">
            <p className="font-semibold text-red-700">Verification Rejected</p>
            {worker.rejectionReason && (
              <div className="mt-1.5 p-2.5 bg-white border border-red-200 rounded-lg text-sm text-red-800">
                <p className="text-xs font-medium text-red-500 uppercase tracking-wide mb-1">Reason</p>
                {worker.rejectionReason}
              </div>
            )}
            <Link to={`/workers/${worker._id}/verify`}
              className="inline-flex items-center gap-1.5 mt-2.5 px-3 py-1.5 bg-red-600 text-white rounded-lg text-xs font-medium hover:bg-red-700 transition-colors">
              <ShieldCheck size={12} /> Fix & Re-submit
            </Link>
          </div>
        </div>
      )}

      {/* Wizard launcher */}
      <Link to={`/workers/${worker._id}/verify`}
        className={`group flex items-center gap-4 p-5 rounded-xl border-2 transition-all
          ${isLocked ? 'border-gray-200 bg-gray-50 pointer-events-none opacity-70'
                     : 'border-brand-200 bg-gradient-to-r from-brand-50 to-white hover:border-brand-400 hover:from-brand-100'}`}>
        <div className={`w-14 h-14 rounded-2xl flex items-center justify-center shrink-0 shadow-md text-white
          ${status === 'verified' ? 'bg-green-500' : status === 'rejected' ? 'bg-red-500'
          : status === 'pending_approval' ? 'bg-purple-600' : allDone ? 'bg-green-500' : 'bg-brand-600'}`}>
          <ShieldCheck size={28} />
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-bold text-lg text-gray-900">
            {status === 'verified' ? 'Verified ✅' : status === 'rejected' ? 'Rejected — Fix Issues'
            : status === 'pending_approval' ? 'Submitted for Approval'
            : allDone ? 'All Steps Complete' : doneCount === 0 ? 'Start Verification' : 'Continue Verification'}
          </p>
          <p className="text-sm text-gray-500 mt-0.5">
            {status === 'verified' ? 'Worker fully approved'
            : status === 'rejected' ? 'Fix issues and re-submit'
            : status === 'pending_approval' ? 'Awaiting Super Admin review'
            : allDone ? 'Submit for admin approval' : `${doneCount}/${checks.length} steps — ${pct}%`}
          </p>
          {!isLocked && !allDone && (
            <div className="w-full bg-gray-200 rounded-full h-1.5 mt-2">
              <div className="bg-brand-500 h-1.5 rounded-full" style={{ width: `${pct}%` }} />
            </div>
          )}
        </div>
        {!isLocked && <ArrowRight size={20} className="text-brand-400 group-hover:translate-x-1 transition-all shrink-0" />}
      </Link>

      {/* Status + checklist */}
      <div className="flex items-center gap-2">
        <span className="text-sm text-gray-500">Status:</span>
        <VerificationBadge status={status} />
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        {checks.map(({ label, done }) => (
          <div key={label} className={`flex items-center gap-2.5 p-2.5 rounded-xl border text-sm
            ${done ? 'bg-green-50 border-green-200 text-green-800' : 'bg-gray-50 border-gray-200 text-gray-400'}`}>
            {done ? <CheckCircle size={13} className="text-green-600 shrink-0" /> : <AlertCircle size={13} className="text-gray-300 shrink-0" />}
            {label}
          </div>
        ))}
      </div>

      {worker.verificationDocuments?.length > 0 && (
        <div className="card p-4">
          <p className="text-sm font-medium text-gray-700 mb-2">Documents ({worker.verificationDocuments.length})</p>
          <div className="space-y-1.5">
            {worker.verificationDocuments.map(doc => (
              <div key={doc._id} className="flex items-center gap-2 text-sm text-gray-600">
                <FileText size={13} className="text-brand-500 shrink-0" />
                {DOC_LABELS[doc.type] || doc.type}
                {doc.file?.url && (
                  <a href={doc.file.url} target="_blank" rel="noopener noreferrer"
                    className="ml-auto text-brand-600 hover:underline text-xs flex items-center gap-0.5">
                    <Eye size={11} /> View
                  </a>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Salary & Bank Tab ────────────────────────────────────────────────────────
function SalaryBankTab({ worker, onRefresh }) {
  const notify = useNotify();
  const { can, isSuperAdmin } = useAuth();
  const canEdit = isSuperAdmin() || can('editWorkers');

  const sal = worker.salary || {};
  const bank = worker.bankDetails || {};

  const [editSalary, setEditSalary] = useState(false);
  const [editBank,   setEditBank  ] = useState(false);
  const [savingSal,  setSavingSal ] = useState(false);
  const [savingBnk,  setSavingBnk ] = useState(false);

  const [salForm, setSalForm] = useState({
    monthly:        sal.monthly        || '',
    paymentStatus:  sal.paymentStatus  || 'unpaid',
    payrollEnabled: sal.payrollEnabled || false
  });
  const [bankForm, setBankForm] = useState({
    bankName:      bank.bankName      || '',
    accountNumber: bank.accountNumber || '',
    accountName:   bank.accountName   || ''
  });

  const saveSalary = async (e) => {
    e.preventDefault();
    setSavingSal(true);
    try {
      await api.put(`/workers/${worker._id}/salary`, salForm);
      notify('Salary updated ✓');
      setEditSalary(false);
      onRefresh();
    } catch (err) {
      notify(err.response?.data?.message || 'Failed to save', 'error');
    } finally { setSavingSal(false); }
  };

  const saveBank = async (e) => {
    e.preventDefault();
    setSavingBnk(true);
    try {
      await api.put(`/workers/${worker._id}/bank`, bankForm);
      notify('Bank details updated ✓');
      setEditBank(false);
      onRefresh();
    } catch (err) {
      notify(err.response?.data?.message || 'Failed to save', 'error');
    } finally { setSavingBnk(false); }
  };

  return (
    <div className="space-y-6">
      {/* ── Salary ── */}
      <div className="card overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 bg-gray-50">
          <div className="flex items-center gap-2">
            <Wallet size={15} className="text-brand-500" />
            <span className="font-semibold text-gray-800">Salary Information</span>
          </div>
          {canEdit && !editSalary && (
            <button onClick={() => setEditSalary(true)} className="btn-secondary text-xs py-1.5">
              <Edit2 size={12} /> Edit
            </button>
          )}
        </div>

        {editSalary ? (
          <form onSubmit={saveSalary} className="p-5 space-y-4">
            <div>
              <label className="label">Monthly Salary (₦)</label>
              <NumInput className="input" placeholder="e.g. 100000"
                value={Number(salForm.monthly) || 0}
                onChange={v => setSalForm(f => ({ ...f, monthly: v }))} />
            </div>
            <div>
              <label className="label">Payment Status</label>
              <select className="input" value={salForm.paymentStatus}
                onChange={e => setSalForm(f => ({ ...f, paymentStatus: e.target.value }))}>
                <option value="unpaid">Unpaid</option>
                <option value="paid">Paid</option>
                <option value="partial">Partial</option>
              </select>
            </div>
            <div className="flex items-center gap-3">
              <input type="checkbox" id="payroll" className="rounded"
                checked={salForm.payrollEnabled}
                onChange={e => setSalForm(f => ({ ...f, payrollEnabled: e.target.checked }))} />
              <label htmlFor="payroll" className="text-sm text-gray-700">Payroll Enabled</label>
            </div>
            <div className="flex gap-3">
              <button type="submit" disabled={savingSal} className="btn-primary flex-1 justify-center">
                {savingSal ? <Loader size={14} className="animate-spin" /> : <><Save size={13} /> Save</>}
              </button>
              <button type="button" onClick={() => setEditSalary(false)} className="btn-secondary">Cancel</button>
            </div>
          </form>
        ) : (
          <div className="p-5 grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <p className="text-xs text-gray-400 mb-0.5">Monthly Salary</p>
              <p className="text-xl font-bold text-gray-900">
                {sal.monthly ? `₦${Number(sal.monthly).toLocaleString()}` : '—'}
              </p>
            </div>
            <div>
              <p className="text-xs text-gray-400 mb-0.5">Payment Status</p>
              <span className={`inline-flex px-2.5 py-1 rounded-full text-xs font-medium
                ${sal.paymentStatus === 'paid'    ? 'bg-green-100 text-green-700'
                : sal.paymentStatus === 'partial' ? 'bg-amber-100 text-amber-700'
                                                  : 'bg-gray-100 text-gray-500'}`}>
                {sal.paymentStatus ? sal.paymentStatus.charAt(0).toUpperCase() + sal.paymentStatus.slice(1) : 'Not set'}
              </span>
            </div>
            <div>
              <p className="text-xs text-gray-400 mb-0.5">Payroll</p>
              <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium
                ${sal.payrollEnabled ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                {sal.payrollEnabled ? <CheckCircle size={10} /> : null}
                {sal.payrollEnabled ? 'Enabled' : 'Disabled'}
              </span>
            </div>
          </div>
        )}
      </div>

      {/* ── Bank Details ── */}
      <div className="card overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 bg-gray-50">
          <div className="flex items-center gap-2">
            <Landmark size={15} className="text-brand-500" />
            <span className="font-semibold text-gray-800">Bank Details</span>
          </div>
          {canEdit && !editBank && (
            <button onClick={() => setEditBank(true)} className="btn-secondary text-xs py-1.5">
              <Edit2 size={12} /> {bank.bankName ? 'Edit' : 'Add'}
            </button>
          )}
        </div>

        {editBank ? (
          <form onSubmit={saveBank} className="p-5 space-y-4">
            <div>
              <label className="label">Bank Name *</label>
              <select className="input" value={bankForm.bankName}
                onChange={e => setBankForm(f => ({ ...f, bankName: e.target.value }))} required>
                <option value="">Select bank…</option>
                {NIGERIAN_BANKS.map(b => <option key={b} value={b}>{b}</option>)}
              </select>
            </div>
            <div>
              <label className="label">Account Number *</label>
              <input className="input font-mono tracking-widest" placeholder="0123456789"
                maxLength={10} value={bankForm.accountNumber}
                onChange={e => setBankForm(f => ({ ...f, accountNumber: e.target.value }))} required />
            </div>
            <div>
              <label className="label">Account Name *</label>
              <input className="input" placeholder="As it appears on bank records"
                value={bankForm.accountName}
                onChange={e => setBankForm(f => ({ ...f, accountName: e.target.value }))} required />
            </div>
            <div className="flex gap-3">
              <button type="submit" disabled={savingBnk} className="btn-primary flex-1 justify-center">
                {savingBnk ? <Loader size={14} className="animate-spin" /> : <><Save size={13} /> Save</>}
              </button>
              <button type="button" onClick={() => setEditBank(false)} className="btn-secondary">Cancel</button>
            </div>
          </form>
        ) : bank.bankName ? (
          <div className="p-5 space-y-2.5">
            {[
              ['Bank',           bank.bankName],
              ['Account Number', bank.accountNumber],
              ['Account Name',   bank.accountName]
            ].map(([lbl, val]) => (
              <div key={lbl} className="flex gap-3 py-1.5 border-b border-gray-50 last:border-0">
                <span className="text-sm text-gray-400 w-32 shrink-0">{lbl}</span>
                <span className={`text-sm font-medium text-gray-800 ${lbl === 'Account Number' ? 'font-mono tracking-wide' : ''}`}>{val || '—'}</span>
              </div>
            ))}
          </div>
        ) : (
          <div className="p-6 text-center text-gray-400">
            <Landmark size={32} className="mx-auto mb-2 text-gray-200" />
            <p className="text-sm">No bank details added yet</p>
            {canEdit && (
              <button onClick={() => setEditBank(true)} className="btn-primary mt-3 inline-flex text-sm">
                <Plus size={14} /> Add Bank Details
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── House Tab ────────────────────────────────────────────────────────────────
function HouseTab({ worker, onRefresh }) {
  const notify = useNotify();
  const [editing, setEditing] = useState(false);
  const [coords, setCoords]   = useState(worker.houseVerification?.coordinates || null);
  const [address, setAddress] = useState(worker.houseVerification?.address || '');
  const [notes, setNotes]     = useState(worker.houseVerification?.notes || '');
  const [photos, setPhotos]   = useState([]);
  const [saving, setSaving]   = useState(false);
  const photoInputRef         = useRef(null);

  const save = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      const fd = new FormData();
      if (coords)  { fd.append('lat', coords.lat); fd.append('lng', coords.lng); }
      if (address) fd.append('address', address);
      if (notes)   fd.append('notes', notes);
      photos.forEach(f => fd.append('photos', f));
      await api.put(`/workers/${worker._id}/house`, fd, { headers: { 'Content-Type': 'multipart/form-data' } });
      notify('House location saved');
      setEditing(false); setPhotos([]);
      onRefresh();
    } catch (err) { notify(err.response?.data?.message || 'Failed', 'error'); }
    finally { setSaving(false); }
  };

  const hv = worker.houseVerification;
  return (
    <div className="space-y-5">
      {!editing ? (
        <>
          <div className="flex items-center justify-between">
            <h3 className="font-semibold text-gray-800">House Verification</h3>
            <button onClick={() => setEditing(true)} className="btn-primary">
              <Edit2 size={14} />{hv ? 'Edit' : 'Add Location'}
            </button>
          </div>
          {!hv ? (
            <div className="text-center py-10 bg-gray-50 rounded-xl border border-dashed border-gray-200">
              <MapPin size={32} className="text-gray-300 mx-auto mb-2" />
              <p className="text-sm text-gray-500">No house location saved yet</p>
            </div>
          ) : (
            <div className="space-y-4">
              {hv.coordinates && (
                <div className="rounded-xl overflow-hidden border border-gray-200">
                  <iframe title="House location" width="100%" height="260" loading="lazy" style={{ border: 0 }}
                    src={`https://www.openstreetmap.org/export/embed.html?bbox=${hv.coordinates.lng - 0.003},${hv.coordinates.lat - 0.003},${hv.coordinates.lng + 0.003},${hv.coordinates.lat + 0.003}&layer=mapnik&marker=${hv.coordinates.lat},${hv.coordinates.lng}`} />
                  <p className="text-xs text-center text-brand-600 py-2 bg-brand-50 font-mono">
                    📍 {hv.coordinates.lat.toFixed(6)}, {hv.coordinates.lng.toFixed(6)}
                  </p>
                </div>
              )}
              {hv.address && <div className="flex items-start gap-2 text-sm text-gray-700"><Home size={14} className="text-gray-400 mt-0.5 shrink-0" />{hv.address}</div>}
              {hv.notes && <p className="text-sm text-gray-500 italic">{hv.notes}</p>}
              {hv.photos?.length > 0 && (
                <div>
                  <p className="text-sm font-medium text-gray-700 mb-2">House Photos</p>
                  <div className="grid grid-cols-3 gap-2">
                    {hv.photos.map((p, i) => (
                      <a key={i} href={p.url} target="_blank" rel="noopener noreferrer">
                        <img src={p.url} alt="" className="w-full h-24 object-cover rounded-lg border border-gray-200 hover:opacity-80 transition-opacity" />
                      </a>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </>
      ) : (
        <form onSubmit={save} className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="font-semibold text-gray-800">Pin House Location</h3>
            <button type="button" onClick={() => setEditing(false)} className="text-gray-400 hover:text-gray-600"><X size={18} /></button>
          </div>
          <MapPicker value={coords} onChange={setCoords} />
          <div>
            <label className="label">Street Address</label>
            <input className="input" placeholder="House number, street, area, state" value={address} onChange={e => setAddress(e.target.value)} />
          </div>
          <div>
            <label className="label">Notes (optional)</label>
            <textarea className="input resize-none" rows={2} value={notes} onChange={e => setNotes(e.target.value)} />
          </div>
          <div>
            <label className="label">Upload House Photos</label>
            <div onClick={() => photoInputRef.current?.click()}
              className="flex items-center justify-center gap-2 p-4 border-2 border-dashed border-gray-300 rounded-xl cursor-pointer hover:border-brand-400 hover:bg-gray-50 transition-colors">
              <Plus size={18} className="text-gray-400" /><span className="text-sm text-gray-500">Add photos (up to 5)</span>
            </div>
            <input ref={photoInputRef} type="file" accept="image/*" multiple className="hidden"
              onChange={e => setPhotos(Array.from(e.target.files).slice(0, 5))} />
            {photos.length > 0 && (
              <div className="flex gap-2 mt-2 flex-wrap">
                {photos.map((f, i) => (
                  <div key={i} className="relative">
                    <img src={URL.createObjectURL(f)} className="w-16 h-16 object-cover rounded-lg" alt="" />
                    <button type="button" onClick={() => setPhotos(p => p.filter((_, j) => j !== i))}
                      className="absolute -top-1.5 -right-1.5 bg-red-500 text-white rounded-full p-0.5"><X size={10} /></button>
                  </div>
                ))}
              </div>
            )}
          </div>
          <div className="flex gap-3">
            <button type="submit" disabled={saving} className="btn-primary">
              {saving ? <Loader size={14} className="animate-spin" /> : <><CheckCircle size={14} /> Save Location</>}
            </button>
            <button type="button" onClick={() => setEditing(false)} className="btn-secondary">Cancel</button>
          </div>
        </form>
      )}
    </div>
  );
}

// ─── Guarantors Tab ───────────────────────────────────────────────────────────
function GuarantorsTab({ worker, guarantors, onRefresh }) {
  const notify   = useNotify();
  const navigate = useNavigate();
  const [expanded, setExpanded] = useState(null);

  const deleteGuarantor = async (gid) => {
    if (!confirm('Delete this guarantor?')) return;
    try {
      await api.delete(`/workers/${worker._id}/guarantors/${gid}`);
      notify('Guarantor removed');
      onRefresh();
    } catch { notify('Failed to delete guarantor', 'error'); }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold text-gray-800">Guarantors ({guarantors.length}/2)</h3>
        {guarantors.length < 2 && (
          <Link to={`/workers/${worker._id}/guarantors/new`} className="btn-primary"><Plus size={14} /> Add Guarantor</Link>
        )}
      </div>
      {guarantors.length === 0 ? (
        <div className="text-center py-10 bg-gray-50 rounded-xl border border-dashed border-gray-200">
          <Users size={32} className="text-gray-300 mx-auto mb-2" />
          <p className="text-sm text-gray-500">No guarantors added yet</p>
          <Link to={`/workers/${worker._id}/guarantors/new`} className="btn-primary mt-3 inline-flex"><Plus size={14} /> Add Guarantor</Link>
        </div>
      ) : guarantors.map((g) => (
        <div key={g._id} className="card overflow-hidden">
          <div onClick={() => setExpanded(expanded === g._id ? null : g._id)}
            className="flex items-center gap-3 px-4 py-3.5 cursor-pointer hover:bg-gray-50 transition-colors">
            {g.passportPhoto?.url
              ? <img src={g.passportPhoto.url} className="w-10 h-10 rounded-full object-cover border border-gray-200 shrink-0" alt="" />
              : <div className="w-10 h-10 rounded-full bg-purple-100 text-purple-700 flex items-center justify-center font-semibold shrink-0">{g.fullName[0]}</div>
            }
            <div className="flex-1 min-w-0">
              <p className="font-medium text-gray-900 text-sm">{g.fullName}</p>
              <p className="text-xs text-gray-500">{g.relationship} · {g.phone}</p>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <Link to={`/workers/${worker._id}/guarantors/${g._id}/edit`} onClick={e => e.stopPropagation()}
                className="p-1.5 text-gray-400 hover:text-brand-600 hover:bg-brand-50 rounded-lg"><Edit2 size={14} /></Link>
              <button onClick={e => { e.stopPropagation(); deleteGuarantor(g._id); }}
                className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg"><Trash2 size={14} /></button>
            </div>
          </div>
          {expanded === g._id && (() => {
            // Map house photos by type
            const hpByType = {};
            (g.houseLocation?.photos || []).forEach(p => { hpByType[p.photoType] = p; });
            return (
              <div className="border-t border-gray-100 px-4 py-4 bg-gray-50 space-y-3 text-sm">
                <div className="grid grid-cols-2 gap-3">
                  <div><p className="text-xs text-gray-400 mb-0.5">Address</p><p className="text-gray-700">{g.address}</p></div>
                  <div><p className="text-xs text-gray-400 mb-0.5">Relationship</p><p className="text-gray-700">{g.relationship}</p></div>
                </div>
                {g.idDocument?.type && (
                  <div>
                    <p className="text-xs text-gray-400 mb-0.5">ID Document</p>
                    <p className="text-gray-700">{DOC_LABELS[g.idDocument.type] || g.idDocument.type}{g.idDocument.documentNumber && ` — ${g.idDocument.documentNumber}`}</p>
                    {g.idDocument.file?.url && (
                      <a href={g.idDocument.file.url} target="_blank" rel="noopener noreferrer"
                        className="text-brand-600 text-xs hover:underline flex items-center gap-1 mt-1"><Eye size={12} /> View Document</a>
                    )}
                  </div>
                )}

                {/* House location & photos */}
                {(g.houseLocation?.coordinates?.lat || g.houseLocation?.photos?.length > 0) && (
                  <div>
                    <p className="text-xs text-gray-400 mb-1.5 font-semibold uppercase tracking-wide">House Location</p>
                    {g.houseLocation?.coordinates?.lat && (
                      <p className="text-xs font-mono text-brand-600 mb-2">
                        📍 {g.houseLocation.coordinates.lat.toFixed(6)}, {g.houseLocation.coordinates.lng.toFixed(6)}
                      </p>
                    )}
                    {g.houseLocation?.photos?.length > 0 && (
                      <div className="grid grid-cols-3 gap-2">
                        {[
                          { key: 'house_front', label: 'House Front' },
                          { key: 'street_view', label: 'Street View' },
                          { key: 'environment', label: 'Environment' },
                        ].map(({ key, label }) => hpByType[key] ? (
                          <a key={key} href={hpByType[key].url} target="_blank" rel="noopener noreferrer">
                            <img src={hpByType[key].url}
                              className="w-full h-20 object-cover rounded-lg border border-gray-200 hover:opacity-80 transition-opacity"
                              alt={label} />
                            <p className="text-xs text-center text-gray-400 mt-0.5">{label}</p>
                          </a>
                        ) : null)}
                        {(g.houseLocation.photos || []).filter(p =>
                          !['house_front','street_view','environment'].includes(p.photoType)
                        ).map(p => (
                          <a key={p._id} href={p.url} target="_blank" rel="noopener noreferrer">
                            <img src={p.url}
                              className="w-full h-20 object-cover rounded-lg border border-gray-200"
                              alt="house" />
                            <p className="text-xs text-center text-gray-400 mt-0.5 capitalize">
                              {(p.photoType || 'other').replace(/_/g, ' ')}
                            </p>
                          </a>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {/* Guarantor signature */}
                {g.signature?.url && (
                  <div className="flex items-center gap-2 pt-1">
                    <p className="text-xs text-gray-400 shrink-0">Signature:</p>
                    <img src={g.signature.url} className="h-8 object-contain border border-gray-200 rounded px-2 bg-white" alt="sig" />
                  </div>
                )}
              </div>
            );
          })()}
        </div>
      ))}
    </div>
  );
}

// ─── Main WorkerDetail ────────────────────────────────────────────────────────
export default function WorkerDetail() {
  const { id }   = useParams();
  const navigate = useNavigate();
  const notify   = useNotify();
  const { isSuperAdmin } = useAuth();

  const [worker,       setWorker      ] = useState(null);
  const [guarantors,   setGuarantors  ] = useState([]);
  const [branches,     setBranches    ] = useState([]);
  const [loading,      setLoading     ] = useState(true);
  const [tab,          setTab         ] = useState('Profile');
  const [deleting,     setDeleting    ] = useState(false);

  // Registration date inline edit (super admin only)
  const [editRegDate,  setEditRegDate ] = useState(false);
  const [regDate,      setRegDate     ] = useState('');
  const [savingReg,    setSavingReg   ] = useState(false);

  // Create staff account modal
  const [showCreateStaff, setShowCreateStaff] = useState(false);

  // Worker PIN management
  const [editPin,   setEditPin  ] = useState(false);
  const [pinValue,  setPinValue ] = useState('');
  const [savingPin, setSavingPin] = useState(false);

  const load = async () => {
    try {
      const [w, g] = await Promise.all([
        api.get(`/workers/${id}`),
        api.get(`/workers/${id}/guarantors`)
      ]);
      setWorker(w.data.data);
      setGuarantors(g.data.data);
    } catch {
      notify('Worker not found', 'error');
      navigate('/workers');
    } finally { setLoading(false); }
  };

  useEffect(() => { load(); }, [id]);   // eslint-disable-line

  // Fetch branches for employment modals
  useEffect(() => {
    api.get('/branches').then(r => setBranches(r.data.data)).catch(() => {});
  }, []);

  const handleDelete = async () => {
    if (!confirm(`Delete ${worker.fullName}? This cannot be undone.`)) return;
    setDeleting(true);
    try {
      await api.delete(`/workers/${id}`);
      notify('Worker deleted');
      navigate('/workers');
    } catch {
      notify('Failed to delete worker', 'error');
      setDeleting(false);
    }
  };

  const openRegEdit = () => {
    const d = worker.registeredAt || worker.createdAt;
    setRegDate(d ? new Date(d).toISOString().split('T')[0] : '');
    setEditRegDate(true);
  };

  const saveRegDate = async () => {
    if (!regDate) return;
    setSavingReg(true);
    try {
      await api.put(`/workers/${id}/registration-date`, { registrationDate: regDate });
      await load();
      setEditRegDate(false);
      notify('Registration date updated ✓');
    } catch (err) {
      notify(err.response?.data?.message || 'Failed to update date', 'error');
    } finally { setSavingReg(false); }
  };

  const savePin = async () => {
    if (!/^\d{4}$/.test(pinValue)) return notify('PIN must be exactly 4 digits', 'error');
    setSavingPin(true);
    try {
      await api.put(`/workers/${id}/pin`, { pin: pinValue });
      await load();
      setEditPin(false);
      setPinValue('');
      notify('PIN set ✓');
    } catch (err) {
      notify(err.response?.data?.message || 'Failed to set PIN', 'error');
    } finally { setSavingPin(false); }
  };

  const handleWhatsApp = () => {
    if (!worker) return;
    const DOC_LABELS = {
      nin: 'NIN', voter_card: "Voter's Card",
      drivers_license: "Driver's License", national_id: 'National ID',
      international_passport: 'Int\'l Passport'
    };
    const empLabel = { registered:'Registered', active:'Active', suspended:'Suspended',
                       sacked:'Dismissed', inactive:'Inactive' }[worker.employmentStatus] || worker.employmentStatus;
    const verLabel = { pending_verification:'Pending', partially_verified:'Partially Verified',
                       pending_approval:'Awaiting Approval', verified:'Verified ✓',
                       rejected:'Rejected', fully_verified:'Verified ✓' }[worker.verificationStatus] || worker.verificationStatus;
    const lines = [
      `👤 *Worker Profile*`,
      `━━━━━━━━━━━━━━━━━━━━`,
      `*Name:*  ${worker.fullName}`,
      `*Phone:* ${worker.phone}`,
      (worker.addressLocation?.formatted || worker.address)
        ? `*Address:* ${worker.addressLocation?.formatted || worker.address}` : null,
      ``,
      `*Employment:* ${empLabel}`,
      (worker.branchId?.name || worker.branch)
        ? `*Branch:* ${worker.branchId?.name || worker.branch}` : null,
      worker.role
        ? `*Role:*   ${worker.role}` : null,
      (worker.shiftId?.name || worker.schedule)
        ? `*Shift:*  ${worker.shiftId?.name || worker.schedule}` : null,
      ``,
      `*Verification:* ${verLabel}`,
      worker.verificationDocuments?.length
        ? `*Docs:* ${worker.verificationDocuments.map(d => DOC_LABELS[d.type] || d.type).join(', ')}` : null,
      guarantors.length
        ? `*Guarantors:* ${guarantors.map(g => g.fullName).join(', ')}` : null,
      ...guarantors.map((g, i) =>
        g.houseLocation?.coordinates?.lat
          ? `*Guarantor ${i+1} House GPS:* ${g.houseLocation.coordinates.lat.toFixed(6)}, ${g.houseLocation.coordinates.lng.toFixed(6)}`
          : null
      ),
      ``,
      `━━━━━━━━━━━━━━━━━━━━`,
      `_${new Date().toLocaleDateString('en-NG', { day: 'numeric', month: 'long', year: 'numeric' })}_`
    ].filter(l => l !== null).join('\n');
    window.open(`https://wa.me/?text=${encodeURIComponent(lines)}`, '_blank');
  };

  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-brand-600" />
    </div>
  );
  if (!worker) return null;

  return (
    <div className="max-w-3xl mx-auto space-y-5">
      <Link to="/workers" className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700">
        <ChevronLeft size={16} /> Back to Workers
      </Link>

      {/* Profile header */}
      <div className="card px-5 py-5">
        <div className="flex items-start gap-4">
          {worker.passportPhoto?.url
            ? <img src={worker.passportPhoto.url} className="w-20 h-20 rounded-2xl object-cover border-2 border-gray-100 shrink-0" alt="" />
            : <div className="w-20 h-20 rounded-2xl bg-brand-100 text-brand-700 flex items-center justify-center text-3xl font-bold shrink-0">
                {worker.fullName[0]}
              </div>
          }
          <div className="flex-1 min-w-0">
            <div className="flex items-start justify-between gap-2 flex-wrap">
              <div>
                <h1 className="text-xl font-bold text-gray-900">{worker.fullName}</h1>
                <p className="text-sm text-gray-500 mt-0.5">{worker.role} — {worker.branchId?.name || worker.branch}</p>
              </div>
              <div className="flex items-center gap-2 flex-wrap">
                <EmploymentBadge status={worker.employmentStatus} />
                <VerificationBadge status={worker.verificationStatus} />
              </div>
            </div>
            <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm text-gray-500">
              <span className="flex items-center gap-1.5"><Phone size={13} />{worker.phone}</span>
              {worker.schedule && <span className="flex items-center gap-1.5"><Calendar size={13} />{worker.schedule}</span>}
            </div>
          </div>
        </div>
        <div className="flex gap-2 mt-4 pt-4 border-t border-gray-100 flex-wrap">
          <Link to={`/workers/${id}/verify`} className="btn-primary">
            <ShieldCheck size={14} /> Verify
          </Link>
          <Link to={`/workers/${id}/edit`} className="btn-secondary">
            <Edit2 size={14} /> Edit
          </Link>
          <Link to={`/workers/${id}/print`} target="_blank" rel="noopener noreferrer"
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg border border-gray-200 bg-white text-gray-700 text-sm font-medium hover:bg-gray-50 hover:border-gray-300 transition-colors">
            <Printer size={14} /> Print / PDF
          </Link>
          <button onClick={handleWhatsApp}
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg border border-green-200 bg-green-50 text-green-700 text-sm font-medium hover:bg-green-100 transition-colors">
            <Share2 size={14} /> WhatsApp
          </button>
          {isSuperAdmin() && (
            <button onClick={() => setShowCreateStaff(true)}
              className="flex items-center gap-1.5 px-3 py-2 rounded-lg border border-brand-200 bg-brand-50 text-brand-700 text-sm font-medium hover:bg-brand-100 transition-colors">
              <UserCog size={14} /> Staff Account
            </button>
          )}
          <button onClick={handleDelete} disabled={deleting} className="btn-danger ml-auto">
            {deleting ? <Loader size={14} className="animate-spin" /> : <><Trash2 size={14} /> Delete</>}
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="card overflow-hidden">
        <div className="flex border-b border-gray-100 overflow-x-auto scrollbar-hide">
          {TABS.map(t => (
            <button key={t} onClick={() => setTab(t)}
              className={`px-4 py-3.5 text-sm whitespace-nowrap transition-colors flex-shrink-0
                ${tab === t ? 'tab-active' : 'tab-inactive'}`}>
              {t === 'Guarantors' ? `Guarantors (${guarantors.length})` : t}
            </button>
          ))}
        </div>

        <div className="p-5">
          {tab === 'Profile' && (
            <div className="space-y-3">
              {[
                ['Full Name',    worker.fullName],
                ['Phone',        worker.phone],
                ['Address',      worker.addressLocation?.formatted || worker.address],
                ['Plus Code',    worker.addressLocation?.plusCode  || '—'],
                ['Coordinates',  worker.addressLocation?.coordinates
                  ? `${worker.addressLocation.coordinates.lat.toFixed(6)}, ${worker.addressLocation.coordinates.lng.toFixed(6)}`
                  : '—'],
                ['Branch',       worker.branchId?.name || worker.branch],
                ['Role',         worker.role],
                ['Schedule',     worker.schedule || '—'],
                ['Emp. Status',  worker.employmentStatus || 'registered'],
                ['Added By',     worker.addedBy?.name || '—']
              ].map(([label, value]) => (
                <div key={label} className="flex gap-3 py-2 border-b border-gray-50 last:border-0">
                  <span className="text-sm text-gray-400 w-28 shrink-0">{label}</span>
                  <span className="text-sm text-gray-800 font-medium">{value}</span>
                </div>
              ))}

              {/* Registered — editable for super admin */}
              <div className="flex gap-3 py-2 items-start">
                <span className="text-sm text-gray-400 w-28 shrink-0 mt-0.5">Registered</span>
                {editRegDate ? (
                  <div className="flex items-center gap-2 flex-wrap">
                    <input
                      type="date"
                      className="input max-w-[180px]"
                      value={regDate}
                      onChange={e => setRegDate(e.target.value)}
                    />
                    <button onClick={saveRegDate} disabled={savingReg}
                      className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-brand-600 text-white text-xs font-medium hover:bg-brand-700">
                      {savingReg ? <Loader size={12} className="animate-spin" /> : <><Save size={12} /> Save</>}
                    </button>
                    <button onClick={() => setEditRegDate(false)}
                      className="text-xs text-gray-500 hover:text-gray-800 px-2 py-2">Cancel</button>
                  </div>
                ) : (
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-gray-800 font-medium">
                      {new Date(worker.registeredAt || worker.createdAt).toLocaleDateString('en-NG', { day: 'numeric', month: 'long', year: 'numeric' })}
                    </span>
                    {isSuperAdmin() && (
                      <button onClick={openRegEdit}
                        className="text-xs text-brand-600 hover:text-brand-800 flex items-center gap-1 font-medium">
                        <Edit2 size={11} /> Edit
                      </button>
                    )}
                  </div>
                )}
              </div>

              {/* Worker PIN (attendance + shortage) — super admin only */}
              {isSuperAdmin() && (
                <div className="flex gap-3 py-2 items-start border-t border-gray-50 mt-1 pt-3">
                  <span className="text-sm text-gray-400 w-28 shrink-0 mt-0.5">Worker PIN</span>
                  {editPin ? (
                    <div className="flex items-center gap-2 flex-wrap">
                      <input
                        type="text" inputMode="numeric" maxLength={4}
                        className="input max-w-[100px] text-center tracking-widest font-bold text-lg"
                        placeholder="0000"
                        value={pinValue}
                        onChange={e => setPinValue(e.target.value.replace(/\D/g,'').slice(0,4))}
                        autoFocus
                      />
                      <button onClick={savePin} disabled={savingPin}
                        className="btn-primary text-xs px-3 py-1.5">
                        {savingPin ? <Loader size={12} className="animate-spin" /> : <><Save size={12}/> Save</>}
                      </button>
                      <button onClick={() => { setEditPin(false); setPinValue(''); }}
                        className="text-xs text-gray-500 hover:text-gray-800 px-2 py-2">Cancel</button>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2">
                      <span className="text-sm text-gray-800 font-medium font-mono tracking-widest">
                        {worker.pin ? '••••' : <span className="text-gray-400 italic font-sans tracking-normal">Not set</span>}
                      </span>
                      <button onClick={() => { setPinValue(''); setEditPin(true); }}
                        className="text-xs text-brand-600 hover:text-brand-800 flex items-center gap-1 font-medium">
                        <Edit2 size={11} /> {worker.pin ? 'Change' : 'Set PIN'}
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {tab === 'Employment' && (
            <EmploymentTab worker={worker} branches={branches} onRefresh={load} />
          )}

          {tab === 'Verification' && (
            <VerificationTab worker={worker} guarantors={guarantors} />
          )}

          {tab === 'Salary & Bank' && (
            <SalaryBankTab worker={worker} onRefresh={load} />
          )}

          {tab === 'House' && (
            <HouseTab worker={worker} onRefresh={load} />
          )}

          {tab === 'Guarantors' && (
            <GuarantorsTab worker={worker} guarantors={guarantors} onRefresh={load} />
          )}
        </div>
      </div>

      {/* Create Staff Account Modal */}
      {showCreateStaff && (
        <CreateStaffAccountModal
          worker={worker}
          onClose={() => setShowCreateStaff(false)}
          onDone={() => setShowCreateStaff(false)}
        />
      )}
    </div>
  );
}

// ─── Create Staff Account Modal (inline in WorkerDetail) ──────────────────────
const STAFF_ROLES_WD = [
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
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-brand-50 flex items-center justify-center">
              <UserCog size={18} className="text-brand-600" />
            </div>
            <div>
              <p className="font-bold text-gray-900 text-sm">Create Staff Account</p>
              <p className="text-xs text-gray-500">{worker.fullName}</p>
            </div>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 transition-colors">
            <X size={18} />
          </button>
        </div>
        <form onSubmit={submit} className="px-5 pb-5 pt-4 space-y-4">
          <div>
            <label className="label">Full Name</label>
            <input className="input bg-gray-50 cursor-default" value={worker.fullName} readOnly />
          </div>
          <div>
            <label className="label">Role</label>
            <select className="input" value={role} onChange={e => setRole(e.target.value)}>
              {STAFF_ROLES_WD.map(r => (
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
            <button type="button" onClick={onClose}
              className="flex-1 px-4 py-2 rounded-lg border border-gray-200 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors">
              Cancel
            </button>
            <button type="submit" disabled={saving}
              className="flex-1 btn-primary justify-center">
              {saving ? <><Loader size={14} className="animate-spin" /> Creating…</> : 'Create Account'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
