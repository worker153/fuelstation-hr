import { useState, useEffect } from 'react';
import {
  Users, Plus, Edit2, Trash2, Key, ToggleLeft, ToggleRight,
  Shield, ShieldCheck, UserCheck, Briefcase, ChevronDown, ChevronUp,
  X, Save, Eye, EyeOff, Check, Hash, Link2,
} from 'lucide-react';
import api from '../utils/api';
import { useNotify } from '../context/NotificationContext';
import { useAuth } from '../context/AuthContext';

const ROLES = [
  { value: 'verification_officer', label: 'Verification Officer', color: 'bg-blue-100 text-blue-700' },
  { value: 'supervisor',           label: 'Supervisor',           color: 'bg-purple-100 text-purple-700' },
  { value: 'record_supervisor',    label: 'Record Supervisor',    color: 'bg-indigo-100 text-indigo-700' },
  { value: 'hr_staff',             label: 'HR Staff',             color: 'bg-gray-100 text-gray-700' },
];

const ALL_PERMISSIONS = [
  { key: 'viewWorkers',      label: 'View Workers',       desc: 'Can see worker profiles' },
  { key: 'addWorkers',       label: 'Add Workers',        desc: 'Can register new workers' },
  { key: 'editWorkers',      label: 'Edit Workers',       desc: 'Can update worker info' },
  { key: 'verifyWorkers',    label: 'Verify Workers',     desc: 'Can run verification wizard' },
  { key: 'uploadDocuments',  label: 'Upload Documents',   desc: 'Can upload ID docs & photos' },
  { key: 'manageGuarantors', label: 'Manage Guarantors',  desc: 'Can add/edit guarantors' },
  { key: 'manageBranches',   label: 'Manage Branches',    desc: 'Can create & edit branches' },
  { key: 'manageStaff',      label: 'Manage Staff',       desc: 'Can view staff list' },
  { key: 'approveWorkers',   label: 'Approve Workers',    desc: 'Can approve verifications' },
  { key: 'submitShortages',  label: 'Submit Shortages',   desc: 'Can report worker shortages for approval' },
  { key: 'bookOffences',     label: 'Book Offences',      desc: 'Can record disciplinary offences against workers' },
  { key: 'viewOwnShift',    label: 'View Own Shift Only', desc: 'Restricts worker view to their assigned shift only' },
];

const ROLE_MAP = Object.fromEntries(ROLES.map(r => [r.value, r]));

function RoleBadge({ role }) {
  if (role === 'super_admin') {
    return (
      <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-brand-100 text-brand-700">
        <ShieldCheck size={11} /> Super Admin
      </span>
    );
  }
  const r = ROLE_MAP[role];
  if (!r) return <span className="text-xs text-gray-400">{role}</span>;
  return (
    <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium ${r.color}`}>
      {r.label}
    </span>
  );
}

// ─── Add / Edit Staff Form ────────────────────────────────────────────────────
function StaffForm({ existing, onSave, onCancel }) {
  const notify = useNotify();
  const [form, setForm] = useState({
    name:  existing?.name  || '',
    email: existing?.email || '',
    password: '',
    role:  existing?.role  || 'verification_officer',
  });
  const [permissions, setPermissions] = useState(
    existing?.permissions || {}
  );
  const [showPwd, setShowPwd] = useState(false);
  const [saving, setSaving]   = useState(false);

  // Branch & shift assignment
  const [branches,  setBranches ] = useState([]);
  const [shifts,    setShifts   ] = useState([]);
  const [branchId,  setBranchId ] = useState(existing?.branchId?._id || existing?.branchId || '');
  const [shiftId,   setShiftId  ] = useState(existing?.shiftId?._id  || existing?.shiftId  || '');

  useEffect(() => {
    api.get('/branches').then(r => setBranches(r.data.data || [])).catch(() => {});
  }, []);

  useEffect(() => {
    if (!branchId) { setShifts([]); setShiftId(''); return; }
    api.get(`/shifts?branchId=${branchId}`).then(r => setShifts(r.data.data || [])).catch(() => {});
  }, [branchId]);

  const set = k => e => setForm(f => ({ ...f, [k]: e.target.value }));

  const applyRoleDefaults = async () => {
    try {
      const { data } = await api.get(`/staff/role-defaults/${form.role}`);
      setPermissions(data.data);
    } catch { notify('Could not load defaults', 'error'); }
  };

  // Auto-apply defaults when role changes and no existing overrides
  useEffect(() => {
    if (!existing) applyRoleDefaults();
  }, [form.role]); // eslint-disable-line

  const togglePerm = (key) =>
    setPermissions(p => ({ ...p, [key]: !p[key] }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      const payload = {
        name: form.name, role: form.role, permissions,
        branchId: branchId || undefined,
        shiftId:  shiftId  || undefined,
      };
      if (existing) {
        await api.put(`/staff/${existing._id}`, payload);
      } else {
        await api.post('/staff', { ...form, ...payload });
      }
      notify(existing ? 'Staff updated ✓' : 'Staff created ✓');
      onSave();
    } catch (err) {
      notify(err.response?.data?.message || 'Failed to save', 'error');
    } finally { setSaving(false); }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      {/* Basic info */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label className="label">Full Name *</label>
          <input className="input" value={form.name} onChange={set('name')} required placeholder="e.g. James Okonkwo" />
        </div>
        <div>
          <label className="label">Email Address *</label>
          <input type="email" className="input" value={form.email} onChange={set('email')}
            required placeholder="james@company.com" disabled={!!existing} />
        </div>
        {!existing && (
          <div>
            <label className="label">Password *</label>
            <div className="relative">
              <input type={showPwd ? 'text' : 'password'} className="input pr-10"
                value={form.password} onChange={set('password')} required placeholder="Min 6 characters" />
              <button type="button" onClick={() => setShowPwd(!showPwd)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400">
                {showPwd ? <EyeOff size={15} /> : <Eye size={15} />}
              </button>
            </div>
          </div>
        )}
        <div>
          <label className="label">Role *</label>
          <select className="input" value={form.role} onChange={set('role')} required>
            {ROLES.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
          </select>
        </div>
        <div>
          <label className="label">Assigned Branch</label>
          <select className="input" value={branchId} onChange={e => setBranchId(e.target.value)}>
            <option value="">— No branch —</option>
            {branches.map(b => <option key={b._id} value={b._id}>{b.name}</option>)}
          </select>
        </div>
        <div>
          <label className="label">Assigned Shift</label>
          {!branchId ? (
            <p className="text-xs text-gray-400 px-1 py-2">Select a branch first</p>
          ) : shifts.length === 0 ? (
            <p className="text-xs text-amber-600 px-1 py-2">No shifts for this branch</p>
          ) : (
            <select className="input" value={shiftId} onChange={e => setShiftId(e.target.value)}>
              <option value="">— No shift restriction —</option>
              {shifts.map(s => <option key={s._id} value={s._id}>{s.name}{s.startTime ? ` (${s.startTime}–${s.endTime})` : ''}</option>)}
            </select>
          )}
        </div>
      </div>

      {/* Permissions */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <label className="label mb-0">Permissions</label>
          <button type="button" onClick={applyRoleDefaults}
            className="text-xs text-brand-600 hover:underline">
            Apply {ROLE_MAP[form.role]?.label || 'role'} defaults
          </button>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {ALL_PERMISSIONS.map(p => (
            <label key={p.key}
              className={`flex items-center gap-3 p-3 rounded-xl border cursor-pointer transition-colors
                ${permissions[p.key] ? 'bg-brand-50 border-brand-200' : 'bg-gray-50 border-gray-200 hover:border-gray-300'}`}>
              <div className={`w-5 h-5 rounded flex items-center justify-center shrink-0 transition-colors
                ${permissions[p.key] ? 'bg-brand-600' : 'bg-white border border-gray-300'}`}
                onClick={() => togglePerm(p.key)}>
                {permissions[p.key] && <Check size={12} className="text-white" />}
              </div>
              <div className="min-w-0">
                <p className="text-sm font-medium text-gray-800">{p.label}</p>
                <p className="text-xs text-gray-500">{p.desc}</p>
              </div>
            </label>
          ))}
        </div>
      </div>

      <div className="flex gap-3 pt-2">
        <button type="submit" disabled={saving} className="btn-primary">
          {saving ? 'Saving…' : <><Save size={14} /> {existing ? 'Update' : 'Create'} Staff</>}
        </button>
        <button type="button" onClick={onCancel} className="btn-secondary">Cancel</button>
      </div>
    </form>
  );
}

// ─── Reset Password Modal ─────────────────────────────────────────────────────
function ResetPwdModal({ staff, onClose }) {
  const notify = useNotify();
  const [pwd, setPwd]   = useState('');
  const [show, setShow] = useState(false);
  const [saving, setSaving] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    if (pwd.length < 6) return notify('Minimum 6 characters', 'error');
    setSaving(true);
    try {
      await api.put(`/staff/${staff._id}/reset-password`, { password: pwd });
      notify(`Password reset for ${staff.name} ✓`);
      onClose();
    } catch (err) {
      notify(err.response?.data?.message || 'Failed', 'error');
    } finally { setSaving(false); }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="bg-white rounded-2xl p-6 w-full max-w-sm shadow-2xl">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-bold text-gray-900">Reset Password — {staff.name}</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X size={18} /></button>
        </div>
        <form onSubmit={submit} className="space-y-4">
          <div>
            <label className="label">New Password</label>
            <div className="relative">
              <input type={show ? 'text' : 'password'} className="input pr-10"
                value={pwd} onChange={e => setPwd(e.target.value)} required placeholder="Min 6 characters" />
              <button type="button" onClick={() => setShow(!show)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400">
                {show ? <EyeOff size={15} /> : <Eye size={15} />}
              </button>
            </div>
          </div>
          <div className="flex gap-3">
            <button type="submit" disabled={saving} className="btn-primary flex-1 justify-center">
              {saving ? 'Saving…' : <><Key size={14} /> Reset Password</>}
            </button>
            <button type="button" onClick={onClose} className="btn-secondary">Cancel</button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── Set PIN Modal ────────────────────────────────────────────────────────────
function SetPinModal({ staff, onClose }) {
  const notify  = useNotify();
  const [pin,   setPin  ] = useState('');
  const [saving,setSaving] = useState(false);
  const [copied,setCopied] = useState(false);

  const dashLink = `${window.location.origin}/admin/${staff._id}`;

  const submit = async (e) => {
    e.preventDefault();
    if (!/^\d{4,6}$/.test(pin)) return notify('PIN must be 4–6 digits', 'error');
    setSaving(true);
    try {
      await api.put(`/auth/pin/${staff._id}`, { pin });
      notify(`PIN set for ${staff.name} ✓`);
      onClose();
    } catch (err) {
      notify(err.response?.data?.message || 'Failed', 'error');
    } finally { setSaving(false); }
  };

  const copyLink = () => {
    navigator.clipboard.writeText(dashLink).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="bg-white rounded-2xl p-6 w-full max-w-sm shadow-2xl space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="font-bold text-gray-900 flex items-center gap-2">
            <Hash size={16} className="text-brand-600" />
            Dashboard PIN — {staff.name}
          </h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X size={18} /></button>
        </div>

        {/* Set PIN form */}
        <form onSubmit={submit} className="space-y-3">
          <div>
            <label className="label">Set 4–6 digit PIN</label>
            <input
              type="number" inputMode="numeric"
              className="input text-2xl tracking-widest text-center font-black"
              placeholder="e.g. 1234"
              value={pin}
              onChange={e => setPin(e.target.value.replace(/\D/g,'').slice(0,6))}
              required
            />
            <p className="text-xs text-gray-400 mt-1">Numbers only. Keep it simple — the admin should remember it.</p>
          </div>
          <div className="flex gap-3">
            <button type="submit" disabled={saving} className="btn-primary flex-1 justify-center">
              {saving ? 'Saving…' : <><Check size={14} className="mr-1" />Save PIN</>}
            </button>
            <button type="button" onClick={onClose} className="btn-secondary">Cancel</button>
          </div>
        </form>

        {/* Dashboard link */}
        <div className="border-t border-gray-100 pt-4">
          <p className="text-xs font-semibold text-gray-500 mb-2">📱 Dashboard Link for {staff.name}</p>
          <div className="flex gap-2">
            <input readOnly
              className="input text-xs text-gray-600 flex-1 bg-gray-50"
              value={dashLink}
            />
            <button onClick={copyLink}
              className={`px-3 rounded-xl border text-xs font-bold transition-all
                ${copied ? 'bg-green-100 border-green-300 text-green-700' : 'bg-gray-100 border-gray-200 text-gray-600 hover:bg-brand-50 hover:border-brand-300 hover:text-brand-700'}`}>
              {copied ? <><Check size={12} className="inline mr-1" />Copied!</> : <><Link2 size={12} className="inline mr-1" />Copy</>}
            </button>
          </div>
          <p className="text-[11px] text-gray-400 mt-1.5">
            Share this link with {staff.name.split(' ')[0]}. They bookmark it and enter their PIN to access the dashboard.
          </p>
        </div>
      </div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function StaffManagement() {
  const notify      = useNotify();
  const { user }    = useAuth();
  const [staff, setStaff]         = useState([]);
  const [loading, setLoading]     = useState(true);
  const [showForm, setShowForm]   = useState(false);
  const [editing, setEditing]     = useState(null);
  const [resetFor, setResetFor]   = useState(null);
  const [pinFor,   setPinFor  ]   = useState(null);
  const [expanded, setExpanded]   = useState(null);

  const load = async () => {
    try {
      const { data } = await api.get('/staff');
      setStaff(data.data);
    } catch { notify('Failed to load staff', 'error'); }
    finally { setLoading(false); }
  };
  useEffect(() => { load(); }, []);

  const handleToggleActive = async (s) => {
    try {
      await api.put(`/staff/${s._id}`, { isActive: !s.isActive });
      notify(`${s.name} ${!s.isActive ? 'activated' : 'deactivated'}`);
      load();
    } catch (err) { notify(err.response?.data?.message || 'Failed', 'error'); }
  };

  const handleDelete = async (s) => {
    if (!confirm(`Remove ${s.name} from your team?`)) return;
    try {
      await api.delete(`/staff/${s._id}`);
      notify(`${s.name} removed`);
      load();
    } catch (err) { notify(err.response?.data?.message || 'Failed', 'error'); }
  };

  const openEdit = (s) => {
    setEditing(s);
    setShowForm(true);
    setExpanded(null);
  };

  const closeForm = () => { setShowForm(false); setEditing(null); };
  const afterSave = () => { closeForm(); load(); };

  return (
    <div className="max-w-4xl mx-auto space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Staff Management</h1>
          <p className="text-sm text-gray-500 mt-0.5">{staff.length} team member{staff.length !== 1 ? 's' : ''}</p>
        </div>
        {!showForm && (
          <button onClick={() => { setEditing(null); setShowForm(true); }} className="btn-primary">
            <Plus size={16} /> Add Staff
          </button>
        )}
      </div>

      {/* Add / Edit form */}
      {showForm && (
        <div className="card p-6">
          <div className="flex items-center justify-between mb-5">
            <h2 className="font-bold text-gray-900">{editing ? `Edit — ${editing.name}` : 'Add New Staff Member'}</h2>
            <button onClick={closeForm} className="text-gray-400 hover:text-gray-600"><X size={18} /></button>
          </div>
          <StaffForm existing={editing} onSave={afterSave} onCancel={closeForm} />
        </div>
      )}

      {/* Staff list */}
      {loading ? (
        <div className="card divide-y divide-gray-50">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="flex items-center gap-3 px-5 py-4 animate-pulse">
              <div className="w-10 h-10 rounded-full bg-gray-100 shrink-0" />
              <div className="flex-1"><div className="h-4 w-36 bg-gray-100 rounded mb-1" /><div className="h-3 w-24 bg-gray-100 rounded" /></div>
            </div>
          ))}
        </div>
      ) : staff.length === 0 ? (
        <div className="card px-6 py-14 text-center">
          <Users size={40} className="text-gray-200 mx-auto mb-3" />
          <p className="font-medium text-gray-600">No staff members yet</p>
          <p className="text-sm text-gray-400 mt-1">Add verification officers, supervisors and HR staff</p>
        </div>
      ) : (
        <div className="card divide-y divide-gray-50">
          {staff.map(s => {
            const isSelf   = s._id === user?.id;
            const isSAdmin = s.role === 'super_admin';
            const open     = expanded === s._id;
            return (
              <div key={s._id}>
                <div className="flex items-center gap-4 px-5 py-4">
                  {/* Avatar */}
                  <div className={`w-10 h-10 rounded-full flex items-center justify-center font-semibold text-sm shrink-0
                    ${isSAdmin ? 'bg-brand-100 text-brand-700' : 'bg-gray-100 text-gray-600'}`}>
                    {s.name[0].toUpperCase()}
                  </div>

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="text-sm font-semibold text-gray-900 truncate">{s.name}</p>
                      {isSelf && <span className="text-xs text-brand-500 font-medium">(you)</span>}
                      {!s.isActive && <span className="text-xs bg-red-100 text-red-600 px-1.5 py-0.5 rounded font-medium">Inactive</span>}
                    </div>
                    <p className="text-xs text-gray-500 truncate">{s.email}</p>
                    <div className="mt-1 flex flex-wrap items-center gap-1.5">
                      <RoleBadge role={s.role} />
                      {s.branchId?.name && (
                        <span className="text-xs bg-blue-50 text-blue-600 px-1.5 py-0.5 rounded font-medium">
                          🏢 {s.branchId.name}
                        </span>
                      )}
                      {s.shiftId?.name && (
                        <span className="text-xs bg-purple-50 text-purple-600 px-1.5 py-0.5 rounded font-medium">
                          🕐 {s.shiftId.name}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-1 shrink-0">
                    <button onClick={() => setExpanded(open ? null : s._id)}
                      className="p-1.5 text-gray-400 hover:bg-gray-100 rounded-lg">
                      {open ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
                    </button>
                    {!isSAdmin && (
                      <>
                        <button onClick={() => handleToggleActive(s)} title={s.isActive ? 'Deactivate' : 'Activate'}
                          className="p-1.5 rounded-lg hover:bg-gray-100 transition-colors">
                          {s.isActive
                            ? <ToggleRight size={18} className="text-green-500" />
                            : <ToggleLeft  size={18} className="text-gray-400" />}
                        </button>
                        <button onClick={() => openEdit(s)}
                          className="p-1.5 text-gray-400 hover:bg-brand-50 hover:text-brand-600 rounded-lg">
                          <Edit2 size={15} />
                        </button>
                        <button onClick={() => setResetFor(s)}
                          className="p-1.5 text-gray-400 hover:bg-amber-50 hover:text-amber-600 rounded-lg"
                          title="Reset password">
                          <Key size={15} />
                        </button>
                        <button onClick={() => setPinFor(s)}
                          className="p-1.5 text-gray-400 hover:bg-green-50 hover:text-green-600 rounded-lg"
                          title="Set dashboard PIN / copy link">
                          <Hash size={15} />
                        </button>
                        {!isSelf && (
                          <button onClick={() => handleDelete(s)}
                            className="p-1.5 text-gray-400 hover:bg-red-50 hover:text-red-500 rounded-lg">
                            <Trash2 size={15} />
                          </button>
                        )}
                      </>
                    )}
                  </div>
                </div>

                {/* Permissions row */}
                {open && (
                  <div className="px-5 pb-4 pt-1 bg-gray-50 border-t border-gray-100">
                    {isSAdmin ? (
                      <p className="text-xs text-brand-600 font-medium flex items-center gap-1">
                        <ShieldCheck size={12} /> Full access — all permissions granted
                      </p>
                    ) : (
                      <div className="flex flex-wrap gap-1.5">
                        {ALL_PERMISSIONS.map(p => (
                          <span key={p.key}
                            className={`text-xs px-2 py-0.5 rounded-full font-medium
                              ${s.permissions?.[p.key]
                                ? 'bg-brand-100 text-brand-700'
                                : 'bg-gray-200 text-gray-400 line-through'}`}>
                            {p.label}
                          </span>
                        ))}
                      </div>
                    )}
                    {s.createdBy && (
                      <p className="text-xs text-gray-400 mt-2">Added by {s.createdBy.name}</p>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {resetFor && <ResetPwdModal staff={resetFor} onClose={() => { setResetFor(null); load(); }} />}
      {pinFor   && <SetPinModal   staff={pinFor}   onClose={() => setPinFor(null) } />}
    </div>
  );
}
