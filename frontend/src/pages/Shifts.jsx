import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import {
  Clock, Plus, Edit2, X, Save, Loader, Users,
  ToggleLeft, ToggleRight, Building2, ChevronDown, ChevronUp,
  RefreshCw, AlarmClock, MapPin,
} from 'lucide-react';
import api from '../utils/api';
import { useNotify } from '../context/NotificationContext';
import { useAuth } from '../context/AuthContext';
import NumInput from '../components/NumInput';

const ALL_DAYS  = ['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday'];
const SHORT_DAY = { Monday:'Mon', Tuesday:'Tue', Wednesday:'Wed', Thursday:'Thu', Friday:'Fri', Saturday:'Sat', Sunday:'Sun' };

const ROTATION_PRESETS = [
  { value: '1_1',    label: '1 Day In / 1 Day Out',        desc: 'Work 1 day, off 1 day — alternating' },
  { value: '2_2',    label: '2 Days In / 2 Days Out',      desc: 'Work 2 days, off 2 days' },
  { value: '3_3',    label: '3 Days In / 3 Days Out',      desc: 'Work 3 days, off 3 days' },
  { value: '4_3',    label: '4 Days In / 3 Days Off',      desc: 'Work 4 days, off 3 days' },
  { value: '5_2',    label: '5 Days In / 2 Days Off',      desc: 'Work 5 days, off 2 days — weekly schedule' },
  { value: '6_1',    label: '6 Days In / 1 Day Off',       desc: 'Work 6 days, off 1 day' },
  { value: '2_1',    label: '2 Days In / 1 Day Out',       desc: 'Work 2 days, off 1 day' },
  { value: '3_1',    label: '3 Days In / 1 Day Out',       desc: 'Work 3 days, off 1 day' },
  { value: '1_week', label: '1 Week In / 1 Week Out',      desc: 'Work full week, off full week' },
  { value: 'custom', label: 'Custom Pattern',               desc: 'Define your own rotation' },
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
    startTime:       shift?.startTime       || '',
    endTime:         shift?.endTime         || '',
    days:            shift?.days?.length ? [...shift.days] : [...ALL_DAYS],
    rotationPattern: shift?.rotationPattern || '1_1',
    rotationLabel:   shift?.rotationLabel   || '',
    customPattern:   '',
    maxWorkers:      shift?.maxWorkers || '',
  });

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));
  const toggleDay = (day) =>
    set('days', form.days.includes(day) ? form.days.filter(d => d !== day) : [...form.days, day]);

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
        branchId: form.branchId, name: form.name.trim(), shiftType,
        startTime:       shiftType === 'fixed'    ? form.startTime       : '',
        endTime:         shiftType === 'fixed'    ? form.endTime         : '',
        days:            shiftType === 'fixed'    ? form.days            : [],
        rotationPattern: shiftType === 'rotation' ? form.rotationPattern : '',
        rotationLabel:   shiftType === 'rotation' ? rotLabel             : '',
        maxWorkers: form.maxWorkers ? Number(form.maxWorkers) : 0,
      };
      const res = isEdit
        ? await api.put(`/shifts/${shift._id}`, payload)
        : await api.post('/shifts', payload);
      notify(isEdit ? 'Shift updated' : 'Shift created ✓');
      onSaved(res.data.data);
    } catch (err) {
      notify(err.response?.data?.message || 'Failed to save', 'error');
    } finally { setSaving(false); }
  };

  const selectedPreset = ROTATION_PRESETS.find(p => p.value === form.rotationPattern);

  return (
    <div className="fixed inset-0 z-50 bg-black/60 overflow-y-auto">
      <div className="min-h-full flex items-center justify-center p-4 py-8">
      <div className="bg-white rounded-2xl w-full max-w-md shadow-2xl flex flex-col">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 shrink-0">
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
          {/* Shift Type */}
          <div>
            <label className="label">Shift Type *</label>
            <div className="grid grid-cols-2 gap-2">
              {[
                { type: 'fixed',    Icon: AlarmClock, label: 'Time-Based',  sub: 'Morning, Evening, Night',   activeColor: 'border-brand-500 bg-brand-50',   iconBg: 'bg-brand-500',   textColor: 'text-brand-700'  },
                { type: 'rotation', Icon: RefreshCw,  label: 'Rotational',  sub: '1 day in / 1 day out',      activeColor: 'border-purple-500 bg-purple-50', iconBg: 'bg-purple-500', textColor: 'text-purple-700' },
              ].map(({ type, Icon, label, sub, activeColor, iconBg, textColor }) => (
                <button key={type} type="button" onClick={() => setShiftType(type)}
                  className={`flex items-start gap-3 p-3 rounded-xl border-2 text-left transition-all
                    ${shiftType === type ? activeColor : 'border-gray-200 hover:border-gray-300'}`}>
                  <div className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 mt-0.5
                    ${shiftType === type ? iconBg : 'bg-gray-100'}`}>
                    <Icon size={14} className={shiftType === type ? 'text-white' : 'text-gray-400'} />
                  </div>
                  <div>
                    <p className={`text-sm font-semibold ${shiftType === type ? textColor : 'text-gray-700'}`}>{label}</p>
                    <p className="text-xs text-gray-400 mt-0.5">{sub}</p>
                  </div>
                </button>
              ))}
            </div>
          </div>

          {!isEdit && (
            <div>
              <label className="label">Branch *</label>
              <select className="input" value={form.branchId} onChange={e => set('branchId', e.target.value)} required>
                <option value="">Select branch…</option>
                {branches.map(b => <option key={b._id} value={b._id}>{b.name}</option>)}
              </select>
            </div>
          )}

          {shiftType === 'fixed' && (
            <>
              <div>
                <label className="label">Shift Name *</label>
                <input className="input" placeholder="e.g. Morning Shift, Night Shift…"
                  value={form.name} onChange={e => set('name', e.target.value)} required />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div><label className="label">Start Time</label>
                  <input type="time" className="input" value={form.startTime} onChange={e => set('startTime', e.target.value)} /></div>
                <div><label className="label">End Time</label>
                  <input type="time" className="input" value={form.endTime} onChange={e => set('endTime', e.target.value)} /></div>
              </div>
              <div>
                <label className="label">Working Days</label>
                <div className="flex flex-wrap gap-2 mt-1">
                  {ALL_DAYS.map(day => (
                    <button key={day} type="button" onClick={() => toggleDay(day)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors
                        ${form.days.includes(day) ? 'bg-brand-600 text-white border-brand-600' : 'bg-white text-gray-500 border-gray-200 hover:border-brand-300'}`}>
                      {SHORT_DAY[day]}
                    </button>
                  ))}
                </div>
                <div className="flex gap-2 mt-1.5">
                  <button type="button" onClick={() => set('days', [...ALL_DAYS])} className="text-xs text-brand-600 hover:underline">All days</button>
                  <span className="text-gray-300">·</span>
                  <button type="button" onClick={() => set('days', ['Monday','Tuesday','Wednesday','Thursday','Friday'])} className="text-xs text-brand-600 hover:underline">Weekdays only</button>
                </div>
              </div>
            </>
          )}

          {shiftType === 'rotation' && (
            <>
              <div>
                <label className="label">Rotation Pattern *</label>
                <div className="space-y-2">
                  {ROTATION_PRESETS.map(preset => (
                    <label key={preset.value}
                      className={`flex items-start gap-3 p-3 rounded-xl border-2 cursor-pointer transition-all
                        ${form.rotationPattern === preset.value ? 'border-purple-500 bg-purple-50' : 'border-gray-200 hover:border-purple-200'}`}>
                      <input type="radio" name="rotation" value={preset.value}
                        checked={form.rotationPattern === preset.value}
                        onChange={() => handlePreset(preset.value)} className="mt-0.5 accent-purple-600" />
                      <div>
                        <p className="text-sm font-semibold text-gray-800">{preset.label}</p>
                        <p className="text-xs text-gray-400">{preset.desc}</p>
                      </div>
                    </label>
                  ))}
                </div>
                {form.rotationPattern === 'custom' && (
                  <input className="input mt-2" placeholder="Describe your pattern, e.g. 4 days on / 3 days off"
                    value={form.customPattern} onChange={e => set('customPattern', e.target.value)} required />
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

          <div>
            <label className="label">Max Workers <span className="text-gray-400 font-normal">(0 = no limit)</span></label>
            <NumInput className="input" placeholder="0 = no limit"
              value={Number(form.maxWorkers) || 0} onChange={v => set('maxWorkers', v)} />
          </div>

          <div className="flex gap-3 pt-1">
            <button type="submit" disabled={saving} className="btn-primary flex-1 justify-center">
              {saving ? <Loader size={14} className="animate-spin" /> : <><Save size={13} /> {isEdit ? 'Save Changes' : 'Create Shift'}</>}
            </button>
            <button type="button" onClick={onClose} className="btn-secondary">Cancel</button>
          </div>
        </form>
      </div>
      </div>
    </div>
  );
}

// ─── Shift Row ────────────────────────────────────────────────────────────────
function ShiftRow({ shift, canManage, onEdit, onToggle }) {
  const [toggling, setToggling] = useState(false);
  const handleToggle = async () => { setToggling(true); try { await onToggle(); } finally { setToggling(false); } };

  const isRotation = shift.shiftType === 'rotation';
  const isActive   = shift.isActive;

  const timeDisplay = !isRotation && shift.startTime && shift.endTime
    ? `${fmtTime(shift.startTime)} – ${fmtTime(shift.endTime)}` : null;

  return (
    <div className={`grid items-center gap-3 px-5 py-3.5 border-b border-gray-100 last:border-0 transition-colors
      ${isActive ? 'hover:bg-gray-50/70' : 'opacity-40 bg-gray-50/30'}
      grid-cols-[minmax(0,2fr)_minmax(0,1.2fr)_80px_auto]`}>

      {/* Col 1 — Name + type badge */}
      <div className="flex items-center gap-3 min-w-0">
        <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0
          ${isRotation ? 'bg-purple-100' : 'bg-brand-100'}`}>
          {isRotation
            ? <RefreshCw size={14} className="text-purple-600" />
            : <Clock     size={14} className="text-brand-600"  />}
        </div>
        <div className="min-w-0">
          <p className="font-semibold text-gray-900 text-sm truncate leading-tight">{shift.name}</p>
          <span className={`text-[10px] font-bold uppercase tracking-wide
            ${isRotation ? 'text-purple-500' : 'text-brand-500'}`}>
            {isRotation ? 'Rotational' : 'Time-Based'}
          </span>
        </div>
      </div>

      {/* Col 2 — Schedule */}
      <div className="min-w-0">
        {timeDisplay && (
          <p className="text-xs font-mono text-gray-700 font-medium">{timeDisplay}</p>
        )}
        {isRotation && shift.rotationLabel && (
          <p className="text-xs text-purple-600 font-medium truncate">{shift.rotationLabel}</p>
        )}
        {!isRotation && !timeDisplay && (
          <p className="text-xs text-gray-400 italic">No time set</p>
        )}
        {/* Day chips — compact */}
        {!isRotation && shift.days?.length > 0 && shift.days.length < 7 && (
          <div className="flex gap-0.5 mt-1 flex-wrap">
            {shift.days.map(d => (
              <span key={d} className="px-1 py-0.5 bg-gray-100 text-gray-500 rounded text-[9px] font-semibold">
                {SHORT_DAY[d]}
              </span>
            ))}
          </div>
        )}
        {!isRotation && shift.days?.length === 7 && (
          <p className="text-[10px] text-gray-400 mt-0.5">All 7 days</p>
        )}
      </div>

      {/* Col 3 — Workers */}
      <div className="text-center">
        {shift.workerCount > 0 ? (
          <Link
            to={`/active-workers?shiftId=${shift._id}&shiftName=${encodeURIComponent(shift.name)}`}
            className={`inline-flex flex-col items-center group`}>
            <span className={`text-lg font-bold leading-tight group-hover:underline
              ${isRotation ? 'text-purple-600' : 'text-brand-600'}`}>
              {shift.workerCount}
            </span>
            <span className="text-[10px] text-gray-400">
              {shift.maxWorkers > 0 ? `/ ${shift.maxWorkers} max` : 'workers'}
            </span>
          </Link>
        ) : (
          <span className="inline-flex flex-col items-center">
            <span className="text-lg font-bold text-gray-300 leading-tight">0</span>
            <span className="text-[10px] text-gray-300">
              {shift.maxWorkers > 0 ? `/ ${shift.maxWorkers} max` : 'workers'}
            </span>
          </span>
        )}
      </div>

      {/* Col 4 — Actions */}
      {canManage ? (
        <div className="flex items-center justify-end gap-1">
          <button onClick={onEdit}
            className="p-1.5 text-gray-400 hover:text-brand-600 hover:bg-brand-50 rounded-lg transition-colors"
            title="Edit">
            <Edit2 size={13} />
          </button>
          <button onClick={handleToggle} disabled={toggling}
            className={`p-1.5 rounded-lg transition-colors
              ${isActive
                ? 'text-gray-400 hover:text-amber-500 hover:bg-amber-50'
                : 'text-gray-300 hover:text-green-600 hover:bg-green-50'}`}
            title={isActive ? 'Deactivate' : 'Activate'}>
            {toggling
              ? <Loader size={14} className="animate-spin" />
              : isActive ? <ToggleRight size={16} /> : <ToggleLeft size={16} />}
          </button>
        </div>
      ) : <div />}
    </div>
  );
}

// ─── Branch Group ─────────────────────────────────────────────────────────────
function BranchGroup({ branchId, branchName, shifts, canManage, onAddShift, onEdit, onToggle }) {
  const [open, setOpen] = useState(true);
  const totalWorkers  = shifts.reduce((a, s) => a + (s.workerCount || 0), 0);
  const activeCount   = shifts.filter(s => s.isActive).length;

  return (
    <div className="card overflow-hidden">

      {/* ── Branch header ── */}
      <div
        className="flex items-center justify-between px-5 py-3.5 cursor-pointer select-none"
        style={{ background: 'linear-gradient(135deg,#14532d,#166534)' }}
        onClick={() => setOpen(v => !v)}
      >
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-white/15 flex items-center justify-center shrink-0">
            <MapPin size={14} className="text-white" />
          </div>
          <div>
            <p className="font-bold text-white text-sm leading-tight">{branchName}</p>
            <p className="text-green-300 text-[11px] mt-0.5">
              {shifts.length} shift{shifts.length !== 1 ? 's' : ''}
              {shifts.length > 0 && ` · ${activeCount} active · ${totalWorkers} workers`}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {canManage && (
            <button
              onClick={e => { e.stopPropagation(); onAddShift(branchId, branchName); }}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/15 hover:bg-white/25
                         text-white text-xs font-semibold transition-colors">
              <Plus size={11} /> Add Shift
            </button>
          )}
          <div className="w-6 h-6 rounded-md bg-white/10 flex items-center justify-center">
            {open
              ? <ChevronUp   size={13} className="text-white" />
              : <ChevronDown size={13} className="text-white" />}
          </div>
        </div>
      </div>

      {/* ── Shift table ── */}
      {open && (
        shifts.length === 0 ? (
          <div className="px-5 py-10 text-center">
            <div className="w-10 h-10 rounded-xl bg-gray-50 flex items-center justify-center mx-auto mb-3">
              <Clock size={18} className="text-gray-300" />
            </div>
            <p className="text-sm font-medium text-gray-500 mb-1">No shifts yet</p>
            <p className="text-xs text-gray-400 mb-4">Add a shift to manage this branch's schedule</p>
            {canManage && (
              <button onClick={() => onAddShift(branchId, branchName)} className="btn-primary text-xs py-1.5">
                <Plus size={12} /> Create First Shift
              </button>
            )}
          </div>
        ) : (
          <>
            {/* Column headers */}
            <div className="grid gap-3 px-5 py-2 bg-gray-50 border-b border-gray-100
              grid-cols-[minmax(0,2fr)_minmax(0,1.2fr)_80px_auto]">
              <p className="text-[10px] font-bold uppercase tracking-wider text-gray-400">Shift Name</p>
              <p className="text-[10px] font-bold uppercase tracking-wider text-gray-400">Schedule</p>
              <p className="text-[10px] font-bold uppercase tracking-wider text-gray-400 text-center">Workers</p>
              {canManage && <p className="text-[10px] font-bold uppercase tracking-wider text-gray-400 text-right">Actions</p>}
            </div>
            {shifts.map(s => (
              <ShiftRow key={s._id} shift={s} canManage={canManage}
                onEdit={() => onEdit(s)} onToggle={() => onToggle(s)} />
            ))}
          </>
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
        api.get('/branches?all=1'),
      ]);
      setShifts(s.data.data);
      setBranches(b.data.data);
    } catch { notify('Failed to load shifts', 'error'); }
    finally { setLoading(false); }
  };

  useEffect(() => { load(); }, [showAll]); // eslint-disable-line

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
    shifts:     shifts.filter(s => (s.branch?._id || s.branch) === b._id),
  }));
  const visibleGroups = showAll ? grouped : grouped.filter(g => g.shifts.length > 0);

  const totalFixed    = shifts.filter(s => s.shiftType !== 'rotation').length;
  const totalRotation = shifts.filter(s => s.shiftType === 'rotation').length;
  const totalWorkers  = shifts.reduce((acc, s) => acc + (s.workerCount || 0), 0);

  return (
    <div className="max-w-3xl mx-auto space-y-5">

      {/* ── Page header ── */}
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Shifts</h1>
          <p className="text-sm text-gray-400 mt-0.5">
            {branches.length} branch{branches.length !== 1 ? 'es' : ''} · {shifts.length} shift{shifts.length !== 1 ? 's' : ''} · {totalWorkers} workers assigned
          </p>
        </div>
        <div className="flex items-center gap-3">
          <label className="flex items-center gap-2 text-sm text-gray-600 cursor-pointer select-none
                            px-3 py-2 bg-white rounded-xl border border-gray-200 shadow-sm hover:bg-gray-50 transition-colors">
            <input type="checkbox" className="rounded accent-brand-600" checked={showAll} onChange={e => setShowAll(e.target.checked)} />
            Show all branches
          </label>
          {canManage && branches.length > 0 && (
            <button onClick={() => setModal({ mode: 'new' })} className="btn-primary">
              <Plus size={16} /> New Shift
            </button>
          )}
        </div>
      </div>

      {/* ── Summary pills ── */}
      {!loading && shifts.length > 0 && (
        <div className="flex items-center gap-3 flex-wrap">
          <div className="flex items-center gap-2 px-3 py-2 bg-white rounded-xl border border-gray-100 shadow-sm text-sm">
            <span className="w-2.5 h-2.5 rounded-full bg-brand-500" />
            <span className="font-semibold text-brand-700">{totalFixed}</span>
            <span className="text-gray-500">Time-Based</span>
          </div>
          <div className="flex items-center gap-2 px-3 py-2 bg-white rounded-xl border border-gray-100 shadow-sm text-sm">
            <span className="w-2.5 h-2.5 rounded-full bg-purple-500" />
            <span className="font-semibold text-purple-700">{totalRotation}</span>
            <span className="text-gray-500">Rotational</span>
          </div>
          <div className="flex items-center gap-2 px-3 py-2 bg-white rounded-xl border border-gray-100 shadow-sm text-sm">
            <Users size={13} className="text-gray-400" />
            <span className="font-semibold text-gray-700">{totalWorkers}</span>
            <span className="text-gray-500">Workers</span>
          </div>
        </div>
      )}

      {/* ── Content ── */}
      {loading ? (
        <div className="space-y-4">
          {[...Array(2)].map((_, i) => (
            <div key={i} className="card p-5 animate-pulse space-y-4">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-gray-100" />
                <div className="space-y-2">
                  <div className="h-4 w-32 bg-gray-100 rounded" />
                  <div className="h-3 w-20 bg-gray-100 rounded" />
                </div>
              </div>
              <div className="h-12 bg-gray-50 rounded-xl" />
            </div>
          ))}
        </div>
      ) : branches.length === 0 ? (
        <div className="card px-6 py-20 text-center">
          <div className="w-16 h-16 rounded-2xl bg-gray-50 flex items-center justify-center mx-auto mb-4">
            <Building2 size={28} className="text-gray-300" />
          </div>
          <p className="font-bold text-gray-600 mb-1">No branches yet</p>
          <p className="text-sm text-gray-400 mb-6">Create a branch first, then add shifts to it</p>
          <Link to="/branches" className="btn-primary">Go to Branches</Link>
        </div>
      ) : visibleGroups.length === 0 ? (
        <div className="card px-6 py-16 text-center">
          <div className="w-16 h-16 rounded-2xl bg-gray-50 flex items-center justify-center mx-auto mb-4">
            <Clock size={28} className="text-gray-300" />
          </div>
          <p className="font-bold text-gray-600 mb-1">No shifts defined yet</p>
          <p className="text-sm text-gray-400">Enable "Show all branches" then create your first shift</p>
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
