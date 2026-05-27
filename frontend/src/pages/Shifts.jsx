import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import {
  Clock, Plus, Edit2, X, Save, Loader, Users,
  ToggleLeft, ToggleRight, Building2, ChevronDown, ChevronUp,
  RefreshCw, AlarmClock
} from 'lucide-react';
import api from '../utils/api';
import { useNotify } from '../context/NotificationContext';
import { useAuth } from '../context/AuthContext';

const ALL_DAYS   = ['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday'];
const SHORT_DAY  = { Monday:'Mon', Tuesday:'Tue', Wednesday:'Wed', Thursday:'Thu', Friday:'Fri', Saturday:'Sat', Sunday:'Sun' };

// Rotation presets
const ROTATION_PRESETS = [
  { value: '1_1',    label: '1 Day In / 1 Day Out',    desc: 'Work 1 day, off 1 day — alternating' },
  { value: '2_2',    label: '2 Days In / 2 Days Out',  desc: 'Work 2 days, off 2 days' },
  { value: '3_3',    label: '3 Days In / 3 Days Out',  desc: 'Work 3 days, off 3 days' },
  { value: '2_1',    label: '2 Days In / 1 Day Out',   desc: 'Work 2 days, off 1 day' },
  { value: '3_1',    label: '3 Days In / 1 Day Out',   desc: 'Work 3 days, off 1 day' },
  { value: '1_week', label: '1 Week In / 1 Week Out',  desc: 'Work full week, off full week' },
  { value: 'custom', label: 'Custom Pattern',           desc: 'Define your own rotation' },
];

function fmtTime(t) {
  if (!t) return '';
  const [h, m] = t.split(':');
  const hr = parseInt(h);
  return `${hr % 12 || 12}:${m} ${hr >= 12 ? 'PM' : 'AM'}`;
}

// ─── Shift Form Modal ─────────────────────────────────────────────────────────
function ShiftModal({ shift, branches, onClose, onSaved }) {
  const notify = useNotify();
  const [saving, setSaving] = useState(false);

  const isEdit = !!shift;
  const [shiftType, setShiftType] = useState(shift?.shiftType || 'fixed');

  const [form, setForm] = useState({
    branchId:        shift?.branch?._id || shift?.branch || '',
    name:            shift?.name            || '',
    // fixed
    startTime:       shift?.startTime       || '',
    endTime:         shift?.endTime         || '',
    days:            shift?.days?.length ? [...shift.days] : [...ALL_DAYS],
    // rotation
    rotationPattern: shift?.rotationPattern || '1_1',
    rotationLabel:   shift?.rotationLabel   || '',
    customPattern:   '',
    maxWorkers:      shift?.maxWorkers || '',
  });

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const toggleDay = (day) =>
    set('days', form.days.includes(day) ? form.days.filter(d => d !== day) : [...form.days, day]);

  // Auto-fill name from preset when creating
  const handlePreset = (val) => {
    set('rotationPattern', val);
    if (!isEdit || !form.name) {
      const preset = ROTATION_PRESETS.find(p => p.value === val);
      if (preset && preset.value !== 'custom') set('name', preset.label);
    }
  };

  const submit = async (e) => {
    e.preventDefault();
    if (!form.name.trim())  return notify('Shift name is required', 'error');
    if (!form.branchId)     return notify('Please select a branch', 'error');
    if (shiftType === 'fixed' && form.days.length === 0)
      return notify('Select at least one working day', 'error');
    if (shiftType === 'rotation' && form.rotationPattern === 'custom' && !form.customPattern.trim())
      return notify('Please describe your custom rotation pattern', 'error');

    const rotLabel = shiftType === 'rotation'
      ? (form.rotationPattern === 'custom'
          ? form.customPattern.trim()
          : ROTATION_PRESETS.find(p => p.value === form.rotationPattern)?.label || '')
      : '';

    setSaving(true);
    try {
      const payload = {
        branchId:        form.branchId,
        name:            form.name.trim(),
        shiftType,
        startTime:       shiftType === 'fixed'    ? form.startTime : '',
        endTime:         shiftType === 'fixed'    ? form.endTime   : '',
        days:            shiftType === 'fixed'    ? form.days      : [],
        rotationPattern: shiftType === 'rotation' ? form.rotationPattern : '',
        rotationLabel:   shiftType === 'rotation' ? rotLabel : '',
        maxWorkers:      form.maxWorkers ? Number(form.maxWorkers) : 0,
      };
      const res = isEdit
        ? await api.put(`/shifts/${shift._id}`,  payload)
        : await api.post('/shifts', payload);
      notify(isEdit ? 'Shift updated' : 'Shift created ✓');
      onSaved(res.data.data);
    } catch (err) {
      notify(err.response?.data?.message || 'Failed to save', 'error');
    } finally { setSaving(false); }
  };

  const selectedPreset = ROTATION_PRESETS.find(p => p.value === form.rotationPattern);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 overflow-y-auto">
      <div className="bg-white rounded-2xl w-full max-w-md shadow-2xl my-4">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-brand-100 flex items-center justify-center">
              <Clock size={15} className="text-brand-600" />
            </div>
            <div>
              <p className="font-bold text-gray-900 text-sm">{isEdit ? 'Edit Shift' : 'Create Shift'}</p>
              {isEdit && <p className="text-xs text-gray-400">{shift.branch?.name}</p>}
            </div>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X size={18} /></button>
        </div>

        <form onSubmit={submit} className="px-5 py-5 space-y-4">

          {/* ── Shift Type Toggle ── */}
          <div>
            <label className="label">Shift Type *</label>
            <div className="grid grid-cols-2 gap-2">
              <button type="button"
                onClick={() => setShiftType('fixed')}
                className={`flex items-start gap-3 p-3 rounded-xl border-2 text-left transition-all
                  ${shiftType === 'fixed'
                    ? 'border-brand-500 bg-brand-50'
                    : 'border-gray-200 hover:border-gray-300'}`}>
                <div className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 mt-0.5
                  ${shiftType === 'fixed' ? 'bg-brand-500' : 'bg-gray-100'}`}>
                  <AlarmClock size={14} className={shiftType === 'fixed' ? 'text-white' : 'text-gray-400'} />
                </div>
                <div>
                  <p className={`text-sm font-semibold ${shiftType === 'fixed' ? 'text-brand-700' : 'text-gray-700'}`}>
                    Time-Based
                  </p>
                  <p className="text-xs text-gray-400 mt-0.5">Morning, Evening, Night with fixed hours</p>
                </div>
              </button>

              <button type="button"
                onClick={() => setShiftType('rotation')}
                className={`flex items-start gap-3 p-3 rounded-xl border-2 text-left transition-all
                  ${shiftType === 'rotation'
                    ? 'border-purple-500 bg-purple-50'
                    : 'border-gray-200 hover:border-gray-300'}`}>
                <div className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 mt-0.5
                  ${shiftType === 'rotation' ? 'bg-purple-500' : 'bg-gray-100'}`}>
                  <RefreshCw size={14} className={shiftType === 'rotation' ? 'text-white' : 'text-gray-400'} />
                </div>
                <div>
                  <p className={`text-sm font-semibold ${shiftType === 'rotation' ? 'text-purple-700' : 'text-gray-700'}`}>
                    Rotational
                  </p>
                  <p className="text-xs text-gray-400 mt-0.5">1 day in / 1 day out, alternating</p>
                </div>
              </button>
            </div>
          </div>

          {/* ── Branch (only on create) ── */}
          {!isEdit && (
            <div>
              <label className="label">Branch *</label>
              <select className="input" value={form.branchId}
                onChange={e => set('branchId', e.target.value)} required>
                <option value="">Select branch…</option>
                {branches.map(b => <option key={b._id} value={b._id}>{b.name}</option>)}
              </select>
            </div>
          )}

          {/* ── TIME-BASED fields ── */}
          {shiftType === 'fixed' && (
            <>
              <div>
                <label className="label">Shift Name *</label>
                <input className="input" placeholder="e.g. Morning Shift, Night Shift…"
                  value={form.name} onChange={e => set('name', e.target.value)} required />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="label">Start Time</label>
                  <input type="time" className="input"
                    value={form.startTime} onChange={e => set('startTime', e.target.value)} />
                </div>
                <div>
                  <label className="label">End Time</label>
                  <input type="time" className="input"
                    value={form.endTime} onChange={e => set('endTime', e.target.value)} />
                </div>
              </div>
              <div>
                <label className="label">Working Days</label>
                <div className="flex flex-wrap gap-2 mt-1">
                  {ALL_DAYS.map(day => (
                    <button key={day} type="button" onClick={() => toggleDay(day)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors
                        ${form.days.includes(day)
                          ? 'bg-brand-600 text-white border-brand-600'
                          : 'bg-white text-gray-500 border-gray-200 hover:border-brand-300'}`}>
                      {SHORT_DAY[day]}
                    </button>
                  ))}
                </div>
                <div className="flex gap-2 mt-1.5">
                  <button type="button" onClick={() => set('days', [...ALL_DAYS])}
                    className="text-xs text-brand-600 hover:underline">All days</button>
                  <span className="text-gray-300">·</span>
                  <button type="button"
                    onClick={() => set('days', ['Monday','Tuesday','Wednesday','Thursday','Friday'])}
                    className="text-xs text-brand-600 hover:underline">Weekdays only</button>
                </div>
              </div>
            </>
          )}

          {/* ── ROTATION fields ── */}
          {shiftType === 'rotation' && (
            <>
              <div>
                <label className="label">Rotation Pattern *</label>
                <div className="space-y-2">
                  {ROTATION_PRESETS.map(preset => (
                    <label key={preset.value}
                      className={`flex items-start gap-3 p-3 rounded-xl border-2 cursor-pointer transition-all
                        ${form.rotationPattern === preset.value
                          ? 'border-purple-500 bg-purple-50'
                          : 'border-gray-200 hover:border-purple-200'}`}>
                      <input type="radio" name="rotation" value={preset.value}
                        checked={form.rotationPattern === preset.value}
                        onChange={() => handlePreset(preset.value)}
                        className="mt-0.5 accent-purple-600" />
                      <div>
                        <p className="text-sm font-semibold text-gray-800">{preset.label}</p>
                        <p className="text-xs text-gray-400">{preset.desc}</p>
                      </div>
                    </label>
                  ))}
                </div>
                {form.rotationPattern === 'custom' && (
                  <input className="input mt-2"
                    placeholder="Describe your pattern, e.g. 4 days on / 3 days off"
                    value={form.customPattern}
                    onChange={e => set('customPattern', e.target.value)} required />
                )}
              </div>
              <div>
                <label className="label">Shift Name *</label>
                <input className="input"
                  placeholder={selectedPreset?.value !== 'custom' ? selectedPreset?.label || 'Shift name…' : 'Shift name…'}
                  value={form.name} onChange={e => set('name', e.target.value)} required />
              </div>
            </>
          )}

          {/* ── Max workers (both types) ── */}
          <div>
            <label className="label">
              Max Workers per Shift <span className="text-gray-400 font-normal">(0 = no limit)</span>
            </label>
            <input type="number" min="0" className="input" placeholder="0"
              value={form.maxWorkers} onChange={e => set('maxWorkers', e.target.value)} />
          </div>

          <div className="flex gap-3 pt-1">
            <button type="submit" disabled={saving} className="btn-primary flex-1 justify-center">
              {saving
                ? <Loader size={14} className="animate-spin" />
                : <><Save size={13} /> {isEdit ? 'Save Changes' : 'Create Shift'}</>
              }
            </button>
            <button type="button" onClick={onClose} className="btn-secondary">Cancel</button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── Shift Card ───────────────────────────────────────────────────────────────
function ShiftCard({ shift, canManage, onEdit, onToggle }) {
  const [toggling, setToggling] = useState(false);
  const handleToggle = async () => { setToggling(true); try { await onToggle(); } finally { setToggling(false); } };

  const isRotation = shift.shiftType === 'rotation';
  const timeDisplay = !isRotation && shift.startTime && shift.endTime
    ? `${fmtTime(shift.startTime)} – ${fmtTime(shift.endTime)}`
    : null;

  return (
    <div className={`flex items-center gap-4 px-4 py-3.5 border-b border-gray-50 last:border-0 ${!shift.isActive ? 'opacity-50' : ''}`}>

      {/* Icon */}
      <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0
        ${!shift.isActive ? 'bg-gray-100' : isRotation ? 'bg-purple-100' : 'bg-brand-100'}`}>
        {isRotation
          ? <RefreshCw size={16} className={shift.isActive ? 'text-purple-600' : 'text-gray-400'} />
          : <Clock     size={16} className={shift.isActive ? 'text-brand-600'  : 'text-gray-400'} />
        }
      </div>

      {/* Info */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <p className="font-semibold text-gray-900 text-sm">{shift.name}</p>
          <span className={`text-xs px-2 py-0.5 rounded-full font-medium
            ${isRotation ? 'bg-purple-100 text-purple-700' : 'bg-brand-100 text-brand-700'}`}>
            {isRotation ? 'Rotational' : 'Time-Based'}
          </span>
          {!shift.isActive && <span className="text-xs px-2 py-0.5 bg-gray-100 text-gray-400 rounded-full">Inactive</span>}
        </div>

        <div className="flex items-center flex-wrap gap-x-3 gap-y-0.5 mt-0.5">
          {/* Time-based: show clock time */}
          {timeDisplay && <span className="text-xs text-gray-600 font-mono">{timeDisplay}</span>}
          {/* Rotation: show pattern */}
          {isRotation && shift.rotationLabel && (
            <span className="text-xs text-purple-600 font-medium">{shift.rotationLabel}</span>
          )}
          <span className="flex items-center gap-1 text-xs text-gray-500">
            <Users size={10} />
            {shift.workerCount} worker{shift.workerCount !== 1 ? 's' : ''}
            {shift.maxWorkers > 0 && ` / ${shift.maxWorkers} max`}
          </span>
        </div>

        {/* Days (time-based only, if not all 7) */}
        {!isRotation && shift.days?.length > 0 && shift.days.length < 7 && (
          <div className="flex gap-1 mt-1.5 flex-wrap">
            {shift.days.map(d => (
              <span key={d} className="px-1.5 py-0.5 bg-gray-100 text-gray-500 rounded text-xs">
                {SHORT_DAY[d]}
              </span>
            ))}
          </div>
        )}
        {!isRotation && shift.days?.length === 7 && (
          <span className="text-xs text-gray-400 mt-0.5 inline-block">All 7 days</span>
        )}
      </div>

      {/* View workers link */}
      {shift.workerCount > 0 && (
        <Link
          to={`/active-workers?shiftId=${shift._id}&shiftName=${encodeURIComponent(shift.name)}`}
          className="text-xs text-brand-600 hover:underline shrink-0 hidden sm:block">
          View →
        </Link>
      )}

      {/* Actions */}
      {canManage && (
        <div className="flex items-center gap-1 shrink-0">
          <button onClick={onEdit}
            className="p-1.5 text-gray-400 hover:text-brand-600 hover:bg-brand-50 rounded-lg transition-colors">
            <Edit2 size={14} />
          </button>
          <button onClick={handleToggle} disabled={toggling}
            className="p-1.5 text-gray-400 hover:text-amber-600 hover:bg-amber-50 rounded-lg transition-colors">
            {toggling ? <Loader size={14} className="animate-spin" /> : shift.isActive ? <ToggleRight size={16} /> : <ToggleLeft size={16} />}
          </button>
        </div>
      )}
    </div>
  );
}

// ─── Branch Group ─────────────────────────────────────────────────────────────
function BranchGroup({ branchId, branchName, shifts, canManage, onAddShift, onEdit, onToggle }) {
  const [open, setOpen] = useState(true);
  const fixedCount    = shifts.filter(s => s.shiftType !== 'rotation').length;
  const rotationCount = shifts.filter(s => s.shiftType === 'rotation').length;

  return (
    <div className="card overflow-hidden">
      <button
        onClick={() => setOpen(v => !v)}
        className="flex items-center justify-between w-full px-5 py-3.5 bg-gray-50 hover:bg-gray-100 transition-colors border-b border-gray-100">
        <div className="flex items-center gap-2.5">
          <Building2 size={15} className="text-brand-500" />
          <span className="font-semibold text-gray-800">{branchName}</span>
          <div className="flex items-center gap-1.5">
            {fixedCount > 0 && (
              <span className="text-xs bg-brand-100 text-brand-700 px-2 py-0.5 rounded-full">
                {fixedCount} time-based
              </span>
            )}
            {rotationCount > 0 && (
              <span className="text-xs bg-purple-100 text-purple-700 px-2 py-0.5 rounded-full">
                {rotationCount} rotational
              </span>
            )}
            {shifts.length === 0 && (
              <span className="text-xs text-gray-400">No shifts</span>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2">
          {canManage && (
            <button
              onClick={e => { e.stopPropagation(); onAddShift(branchId, branchName); }}
              className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-brand-50 text-brand-700 hover:bg-brand-100 text-xs font-medium border border-brand-200 transition-colors">
              <Plus size={11} /> Add Shift
            </button>
          )}
          {open ? <ChevronUp size={15} className="text-gray-400" /> : <ChevronDown size={15} className="text-gray-400" />}
        </div>
      </button>

      {open && (
        shifts.length === 0 ? (
          <div className="px-5 py-8 text-center text-gray-400">
            <Clock size={28} className="mx-auto mb-2 text-gray-200" />
            <p className="text-sm">No shifts for this branch yet</p>
            {canManage && (
              <button onClick={() => onAddShift(branchId, branchName)}
                className="btn-primary mt-3 inline-flex text-xs py-1.5">
                <Plus size={12} /> Create First Shift
              </button>
            )}
          </div>
        ) : (
          <div>
            {shifts.map(s => (
              <ShiftCard key={s._id} shift={s} canManage={canManage}
                onEdit={() => onEdit(s)} onToggle={() => onToggle(s)} />
            ))}
          </div>
        )
      )}
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function Shifts() {
  const notify              = useNotify();
  const { can, isSuperAdmin } = useAuth();
  const canManage           = isSuperAdmin() || can('manageBranches');

  const [shifts,   setShifts  ] = useState([]);
  const [branches, setBranches] = useState([]);
  const [loading,  setLoading ] = useState(true);
  const [showAll,  setShowAll ] = useState(false);
  const [modal,    setModal   ] = useState(null);

  const load = async () => {
    setLoading(true);
    try {
      const [s, b] = await Promise.all([
        api.get(`/shifts?all=${showAll ? 1 : 0}`),
        api.get('/branches?all=1')
      ]);
      setShifts(s.data.data);
      setBranches(b.data.data);
    } catch { notify('Failed to load shifts', 'error'); }
    finally { setLoading(false); }
  };

  useEffect(() => { load(); }, [showAll]);   // eslint-disable-line

  const handleSaved = (saved) => {
    setShifts(prev => {
      const idx = prev.findIndex(s => s._id === saved._id);
      if (idx >= 0) { const next = [...prev]; next[idx] = saved; return next; }
      return [...prev, saved];
    });
    setModal(null);
  };

  const handleToggle = async (shift) => {
    try {
      const { data } = await api.delete(`/shifts/${shift._id}`);
      notify(data.message);
      setShifts(prev => prev.map(s => s._id === shift._id ? { ...s, isActive: data.data.isActive } : s));
    } catch (err) { notify(err.response?.data?.message || 'Failed', 'error'); }
  };

  const grouped = branches.map(b => ({
    branchId:   b._id,
    branchName: b.name,
    shifts:     shifts.filter(s => (s.branch?._id || s.branch) === b._id)
  }));
  const visibleGroups = showAll ? grouped : grouped.filter(g => g.shifts.length > 0);

  const totalFixed    = shifts.filter(s => s.shiftType !== 'rotation').length;
  const totalRotation = shifts.filter(s => s.shiftType === 'rotation').length;

  return (
    <div className="max-w-3xl mx-auto space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Shifts</h1>
          <p className="text-sm text-gray-500 mt-0.5 flex items-center gap-2">
            {totalFixed > 0 && <span>{totalFixed} time-based</span>}
            {totalFixed > 0 && totalRotation > 0 && <span className="text-gray-300">·</span>}
            {totalRotation > 0 && <span className="text-purple-600">{totalRotation} rotational</span>}
            {totalFixed === 0 && totalRotation === 0 && <span>No shifts yet</span>}
            <span className="text-gray-300">·</span>
            <span>{branches.length} branch{branches.length !== 1 ? 'es' : ''}</span>
          </p>
        </div>
        <div className="flex items-center gap-2">
          <label className="flex items-center gap-2 text-sm text-gray-600 cursor-pointer select-none">
            <input type="checkbox" className="rounded" checked={showAll} onChange={e => setShowAll(e.target.checked)} />
            Show all branches
          </label>
          {canManage && branches.length > 0 && (
            <button onClick={() => setModal({ mode: 'new' })} className="btn-primary">
              <Plus size={16} /> New Shift
            </button>
          )}
        </div>
      </div>

      {/* Legend */}
      <div className="flex items-center gap-4 text-xs text-gray-500">
        <span className="flex items-center gap-1.5">
          <span className="w-5 h-5 rounded-lg bg-brand-100 flex items-center justify-center">
            <AlarmClock size={11} className="text-brand-600" />
          </span>
          Time-Based — fixed hours (Morning / Evening / Night)
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-5 h-5 rounded-lg bg-purple-100 flex items-center justify-center">
            <RefreshCw size={11} className="text-purple-600" />
          </span>
          Rotational — 1 day in / 1 day out etc.
        </span>
      </div>

      {/* Content */}
      {loading ? (
        <div className="space-y-4">
          {[...Array(2)].map((_, i) => (
            <div key={i} className="card p-5 animate-pulse space-y-3">
              <div className="h-4 w-32 bg-gray-100 rounded" />
              <div className="h-3 w-full bg-gray-100 rounded" />
            </div>
          ))}
        </div>
      ) : branches.length === 0 ? (
        <div className="card px-6 py-20 text-center">
          <Building2 size={52} className="text-gray-200 mx-auto mb-3" />
          <p className="font-semibold text-gray-600">No branches yet</p>
          <p className="text-sm text-gray-400 mt-1">Create a branch first, then add shifts to it</p>
          <Link to="/branches" className="btn-primary mt-5 inline-flex">Go to Branches</Link>
        </div>
      ) : visibleGroups.length === 0 ? (
        <div className="card px-6 py-16 text-center">
          <Clock size={48} className="text-gray-200 mx-auto mb-3" />
          <p className="font-semibold text-gray-600">No shifts defined yet</p>
          <p className="text-sm text-gray-400 mt-1">Enable "Show all branches" then create your first shift</p>
        </div>
      ) : (
        <div className="space-y-4">
          {visibleGroups.map(g => (
            <BranchGroup key={g.branchId} {...g} canManage={canManage}
              onAddShift={(bId, bName) => setModal({ mode: 'new', branchId: bId, branchName: bName })}
              onEdit={shift => setModal({ mode: 'edit', shift })}
              onToggle={handleToggle}
            />
          ))}
        </div>
      )}

      {modal && (
        <ShiftModal
          shift={modal.mode === 'edit' ? modal.shift : null}
          branches={branches}
          onClose={() => setModal(null)}
          onSaved={handleSaved}
        />
      )}
    </div>
  );
}
