import { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Gauge, X, Save, Loader, AlertCircle, CheckCircle, Clock,
  ChevronDown, Users, Search, Edit2, Droplets,
} from 'lucide-react';
import api from '../utils/api';
import { useNotify } from '../context/NotificationContext';
import { useAuth } from '../context/AuthContext';

// ─── Helpers ──────────────────────────────────────────────────────────────────
const today = () => new Date().toISOString().split('T')[0];

const STATUS_STYLES = {
  open:   { cls: 'bg-amber-100 text-amber-700',  icon: Clock,         label: 'Open'   },
  closed: { cls: 'bg-green-100 text-green-700',  icon: CheckCircle,   label: 'Closed' },
  error:  { cls: 'bg-red-100   text-red-700',    icon: AlertCircle,   label: 'Error'  },
};

function fmtNum(n) {
  if (n == null) return '—';
  return Number(n).toLocaleString('en-NG', { maximumFractionDigits: 2 });
}

function fmtTime(d) {
  if (!d) return '—';
  return new Date(d).toLocaleTimeString('en-NG', { hour: '2-digit', minute: '2-digit', hour12: true });
}

// ─── Edit Record Modal ────────────────────────────────────────────────────────
function EditShiftModal({ record, onClose, onSaved }) {
  const notify = useNotify();
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    openingMeter: record.openingMeter ?? '',
    closingMeter: record.closingMeter ?? '',
    pumpId:       record.pumpId       || '',
    pumpLabel:    record.pumpLabel    || '',
    notes:        record.notes        || '',
  });

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const volume = (form.openingMeter !== '' && form.closingMeter !== '')
    ? Math.max(0, Number(form.closingMeter) - Number(form.openingMeter))
    : null;

  const submit = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      const payload = {};
      if (form.openingMeter !== '') payload.openingMeter = Number(form.openingMeter);
      if (form.closingMeter !== '') payload.closingMeter = Number(form.closingMeter);
      if (form.pumpId    !== undefined) payload.pumpId    = form.pumpId;
      if (form.pumpLabel !== undefined) payload.pumpLabel = form.pumpLabel;
      if (form.notes     !== undefined) payload.notes     = form.notes;
      const { data } = await api.put(`/pump-shifts/${record._id}`, payload);
      notify('Record updated');
      onSaved(data.data);
    } catch (err) {
      notify(err.response?.data?.message || 'Failed to save', 'error');
    } finally {
      setSaving(false);
    }
  };

  const statusInfo = STATUS_STYLES[record.status] || STATUS_STYLES.open;
  const StatusIcon = statusInfo.icon;

  return (
    <div className="fixed inset-0 z-50 bg-black/60 overflow-y-auto md:pl-64">
      <div className="min-h-full flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl w-full max-w-md shadow-2xl my-6">

          {/* Header */}
          <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
            <div>
              <h3 className="font-bold text-gray-900">Edit Pump Shift</h3>
              <p className="text-xs text-gray-400 mt-0.5">
                {record.workerName} · {record.date}
              </p>
            </div>
            <button onClick={onClose} className="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg">
              <X size={18} />
            </button>
          </div>

          <form onSubmit={submit} className="divide-y divide-gray-100">
            <div className="px-6 py-5 space-y-4">

              {/* Status badge */}
              <div className="flex items-center gap-2">
                <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${statusInfo.cls}`}>
                  <StatusIcon size={11} />
                  {statusInfo.label}
                </span>
                {record.pumpId && (
                  <span className="text-xs font-mono bg-gray-100 text-gray-600 px-2 py-1 rounded-full">
                    Pump: {record.pumpLabel || record.pumpId}
                  </span>
                )}
              </div>

              {/* Pump ID + Label */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="label">Pump ID</label>
                  <input className="input font-mono text-sm" placeholder="e.g. PUMP-01"
                    value={form.pumpId} onChange={e => set('pumpId', e.target.value)} />
                </div>
                <div>
                  <label className="label">Pump Label</label>
                  <input className="input text-sm" placeholder="e.g. Pump 1"
                    value={form.pumpLabel} onChange={e => set('pumpLabel', e.target.value)} />
                </div>
              </div>

              {/* Meters */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="label">Opening Meter</label>
                  <input className="input" type="number" step="0.01" min="0" placeholder="0.00"
                    value={form.openingMeter} onChange={e => set('openingMeter', e.target.value)} />
                </div>
                <div>
                  <label className="label">Closing Meter</label>
                  <input className="input" type="number" step="0.01" min="0" placeholder="0.00"
                    value={form.closingMeter} onChange={e => set('closingMeter', e.target.value)} />
                </div>
              </div>

              {/* Volume preview */}
              {volume !== null && (
                <div className="bg-blue-50 rounded-xl px-4 py-3 flex items-center gap-3">
                  <Droplets size={16} className="text-blue-500 shrink-0" />
                  <div>
                    <p className="text-xs text-blue-600 font-medium">Calculated Volume</p>
                    <p className="text-lg font-bold text-blue-800">{fmtNum(volume)} L</p>
                  </div>
                </div>
              )}

              {/* Notes */}
              <div>
                <label className="label">Notes</label>
                <textarea className="input resize-none" rows={2}
                  placeholder="Optional notes"
                  value={form.notes} onChange={e => set('notes', e.target.value)} />
              </div>

              {/* Errors */}
              {record.openError && (
                <p className="text-xs text-red-600 flex items-start gap-1.5">
                  <AlertCircle size={12} className="shrink-0 mt-0.5" />
                  Open error: {record.openError}
                </p>
              )}
              {record.closeError && (
                <p className="text-xs text-red-600 flex items-start gap-1.5">
                  <AlertCircle size={12} className="shrink-0 mt-0.5" />
                  Close error: {record.closeError}
                </p>
              )}
            </div>

            <div className="px-6 py-4 flex gap-3 bg-gray-50 rounded-b-2xl">
              <button type="submit" disabled={saving} className="btn-primary flex-1 justify-center">
                {saving ? <Loader size={15} className="animate-spin" /> : <><Save size={14} /> Save Changes</>}
              </button>
              <button type="button" onClick={onClose} className="btn-secondary">Cancel</button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}

// ─── Assign Pump Modal ────────────────────────────────────────────────────────
function AssignPumpModal({ workers, onClose, onAssigned }) {
  const notify = useNotify();
  const [saving,      setSaving    ] = useState(false);
  const [search,      setSearch    ] = useState('');
  const [filterBranch, setFilterBranch] = useState('');
  const [filterShift,  setFilterShift ] = useState('');
  const [workerId,    setWorkerId  ] = useState('');
  const [pumpId,      setPumpId    ] = useState('');
  const [pumpLabel,   setPumpLabel ] = useState('');

  // Derive unique branches and shifts from the workers list
  const branches = useMemo(() => {
    const seen = new Map();
    workers.forEach(w => {
      const id   = w.branchId?._id || w.branchId;
      const name = w.branchId?.name || w.branchName || w.branch;
      if (id && name && !seen.has(String(id))) seen.set(String(id), { id, name });
    });
    return [...seen.values()].sort((a, b) => a.name.localeCompare(b.name));
  }, [workers]);

  const shifts = useMemo(() => {
    const seen = new Map();
    workers.forEach(w => {
      const id   = w.shiftId?._id || w.shiftId;
      const name = w.shiftId?.name || w.shiftName || w.shift;
      if (id && name && !seen.has(String(id))) seen.set(String(id), { id, name });
    });
    return [...seen.values()].sort((a, b) => a.name.localeCompare(b.name));
  }, [workers]);

  const filtered = workers.filter(w => {
    const name     = (w.fullName || w.name || '').toLowerCase();
    const branchId = String(w.branchId?._id || w.branchId || '');
    const shiftId  = String(w.shiftId?._id  || w.shiftId  || '');
    if (filterBranch && branchId !== filterBranch) return false;
    if (filterShift  && shiftId  !== filterShift)  return false;
    if (search && !name.includes(search.toLowerCase()))        return false;
    return true;
  });

  const selectedWorker = workers.find(w => w._id === workerId);

  const submit = async (e) => {
    e.preventDefault();
    if (!workerId) return notify('Select a worker', 'error');
    setSaving(true);
    try {
      await api.post('/pump-shifts/assign-pump', { workerId, pumpId: pumpId || null, pumpLabel: pumpLabel || null });
      notify(`Pump assigned to ${selectedWorker?.fullName || selectedWorker?.name}`);
      onAssigned();
      onClose();
    } catch (err) {
      notify(err.response?.data?.message || 'Failed to assign pump', 'error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/60 overflow-y-auto md:pl-64">
      <div className="min-h-full flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl w-full max-w-md shadow-2xl my-6">
          <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
            <div>
              <h3 className="font-bold text-gray-900">Assign Pump to Worker</h3>
              <p className="text-xs text-gray-400 mt-0.5">Link a worker to their default pump</p>
            </div>
            <button onClick={onClose} className="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg">
              <X size={18} />
            </button>
          </div>

          <form onSubmit={submit} className="divide-y divide-gray-100">
            <div className="px-6 py-5 space-y-4">

              {/* Location + Shift filters */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="label">Location</label>
                  <select className="input text-sm" value={filterBranch}
                    onChange={e => { setFilterBranch(e.target.value); setWorkerId(''); }}>
                    <option value="">All locations</option>
                    {branches.map(b => (
                      <option key={b.id} value={String(b.id)}>{b.name}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="label">Shift</label>
                  <select className="input text-sm" value={filterShift}
                    onChange={e => { setFilterShift(e.target.value); setWorkerId(''); }}>
                    <option value="">All shifts</option>
                    {shifts.map(s => (
                      <option key={s.id} value={String(s.id)}>{s.name}</option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Name search */}
              <div>
                <label className="label">Search Worker</label>
                <div className="relative">
                  <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                  <input className="input pl-9" placeholder="Type worker name…"
                    value={search} onChange={e => { setSearch(e.target.value); setWorkerId(''); }} />
                </div>
              </div>

              {/* Worker dropdown */}
              <div>
                <label className="label">Select Worker *</label>
                <select className="input" value={workerId} onChange={e => setWorkerId(e.target.value)} required>
                  <option value="">— Choose worker —</option>
                  {filtered.map(w => (
                    <option key={w._id} value={w._id}>
                      {w.fullName || w.name} ({w.role})
                      {w.pumpId ? ` · Pump: ${w.pumpLabel || w.pumpId}` : ''}
                    </option>
                  ))}
                </select>
                {filtered.length === 0 && (filterBranch || filterShift || search) && (
                  <p className="text-xs text-gray-400 mt-1">No workers match the current filters</p>
                )}
              </div>

              {/* Pump ID + Label */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="label">Pump ID</label>
                  <input className="input font-mono text-sm" placeholder="e.g. PUMP-01"
                    value={pumpId} onChange={e => setPumpId(e.target.value)} />
                </div>
                <div>
                  <label className="label">Pump Label</label>
                  <input className="input text-sm" placeholder="e.g. Pump 1"
                    value={pumpLabel} onChange={e => setPumpLabel(e.target.value)} />
                </div>
              </div>

              <p className="text-xs text-gray-500 bg-gray-50 px-3 py-2 rounded-lg">
                Leave Pump ID blank to un-assign the worker's pump.
                The pump ID must match the ID returned by your station API.
              </p>
            </div>

            <div className="px-6 py-4 flex gap-3 bg-gray-50 rounded-b-2xl">
              <button type="submit" disabled={saving || !workerId} className="btn-primary flex-1 justify-center">
                {saving ? <Loader size={15} className="animate-spin" /> : <><Save size={14} /> Assign Pump</>}
              </button>
              <button type="button" onClick={onClose} className="btn-secondary">Cancel</button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}

// ─── Record Row ───────────────────────────────────────────────────────────────
function ShiftRow({ record, onEdit }) {
  const statusInfo = STATUS_STYLES[record.status] || STATUS_STYLES.open;
  const StatusIcon = statusInfo.icon;

  return (
    <div className="card p-4 space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="font-semibold text-gray-900 truncate">{record.workerName || '—'}</p>
            {record.workerRole && (
              <span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full">{record.workerRole}</span>
            )}
            <span className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full font-medium ${statusInfo.cls}`}>
              <StatusIcon size={10} />
              {statusInfo.label}
            </span>
          </div>
          {record.branchName && (
            <p className="text-xs text-gray-400 mt-0.5">{record.branchName}</p>
          )}
        </div>
        <button onClick={() => onEdit(record)}
          className="p-1.5 text-gray-400 hover:text-brand-600 hover:bg-brand-50 rounded-lg transition-colors shrink-0">
          <Edit2 size={14} />
        </button>
      </div>

      {/* Pump + time info */}
      <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
        <div className="text-gray-500">Pump</div>
        <div className="font-medium text-gray-800 font-mono text-xs">{record.pumpLabel || record.pumpId || '—'}</div>

        <div className="text-gray-500">Clock In</div>
        <div className="font-medium text-gray-800">{fmtTime(record.openedAt)}</div>

        <div className="text-gray-500">Clock Out</div>
        <div className="font-medium text-gray-800">{fmtTime(record.closedAt)}</div>
      </div>

      {/* Meter readings */}
      <div className="grid grid-cols-3 gap-2 bg-gray-50 rounded-xl p-3 text-center">
        <div>
          <p className="text-[10px] text-gray-400 font-medium uppercase tracking-wide mb-0.5">Opening</p>
          <p className="text-sm font-bold text-gray-800">{fmtNum(record.openingMeter)}</p>
        </div>
        <div>
          <p className="text-[10px] text-gray-400 font-medium uppercase tracking-wide mb-0.5">Closing</p>
          <p className="text-sm font-bold text-gray-800">{fmtNum(record.closingMeter)}</p>
        </div>
        <div>
          <p className="text-[10px] text-blue-500 font-medium uppercase tracking-wide mb-0.5">Volume</p>
          <p className="text-sm font-bold text-blue-700">{record.volume != null ? `${fmtNum(record.volume)} L` : '—'}</p>
        </div>
      </div>

      {/* Errors */}
      {(record.openError || record.closeError) && (
        <p className="text-xs text-red-600 flex items-start gap-1.5">
          <AlertCircle size={12} className="shrink-0 mt-0.5" />
          {record.openError || record.closeError}
        </p>
      )}
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function PumpShifts() {
  const notify              = useNotify();
  const { isSuperAdmin, can } = useAuth();

  const canManage = isSuperAdmin() || can('manageBranches');

  const [records,  setRecords ] = useState([]);
  const [branches, setBranches] = useState([]);
  const [workers,  setWorkers ] = useState([]);
  const [loading,  setLoading ] = useState(true);
  const [total,    setTotal   ] = useState(0);

  // Filters
  const [filterDate,     setFilterDate    ] = useState(today());
  const [filterBranch,   setFilterBranch  ] = useState('');
  const [filterWorker,   setFilterWorker  ] = useState('');
  const [filterStatus,   setFilterStatus  ] = useState('');

  // Modals
  const [editRecord,     setEditRecord    ] = useState(null);
  const [showAssign,     setShowAssign    ] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = {};
      if (filterDate)   params.date     = filterDate;
      if (filterBranch) params.branchId = filterBranch;
      if (filterWorker) params.workerId = filterWorker;
      if (filterStatus) params.status   = filterStatus;
      const { data } = await api.get('/pump-shifts', { params });
      setRecords(data.data || []);
      setTotal(data.total || 0);
    } catch {
      notify('Failed to load pump shifts', 'error');
    } finally {
      setLoading(false);
    }
  }, [filterDate, filterBranch, filterWorker, filterStatus]); // eslint-disable-line

  // Load branches + workers once
  useEffect(() => {
    (async () => {
      try {
        const [b, w] = await Promise.all([
          api.get('/branches?all=1'),
          api.get('/workers?limit=200'),
        ]);
        setBranches(b.data.data || []);
        setWorkers(w.data.data || []);
      } catch { /* non-critical */ }
    })();
  }, []);

  useEffect(() => { load(); }, [load]);

  const totalVolume = records.reduce((s, r) => s + (r.volume || 0), 0);

  const handleSaved = (updated) => {
    setRecords(prev => prev.map(r => r._id === updated._id ? updated : r));
    setEditRecord(null);
  };

  if (!canManage) {
    return (
      <div className="max-w-xl mx-auto mt-16 text-center">
        <Gauge size={48} className="text-gray-200 mx-auto mb-3" />
        <p className="font-semibold text-gray-600">Access denied</p>
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Pump Shifts</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            Meter readings captured automatically at clock-in / clock-out
          </p>
        </div>
        {canManage && (
          <button onClick={() => setShowAssign(true)} className="btn-secondary">
            <Users size={15} /> Assign Pumps
          </button>
        )}
      </div>

      {/* Filter bar */}
      <div className="card p-4 grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div>
          <label className="label text-xs">Date</label>
          <input type="date" className="input text-sm"
            value={filterDate} onChange={e => setFilterDate(e.target.value)} />
        </div>
        <div>
          <label className="label text-xs">Branch</label>
          <select className="input text-sm" value={filterBranch} onChange={e => setFilterBranch(e.target.value)}>
            <option value="">All branches</option>
            {branches.map(b => <option key={b._id} value={b._id}>{b.name}</option>)}
          </select>
        </div>
        <div>
          <label className="label text-xs">Worker</label>
          <select className="input text-sm" value={filterWorker} onChange={e => setFilterWorker(e.target.value)}>
            <option value="">All workers</option>
            {workers.map(w => (
              <option key={w._id} value={w._id}>{w.fullName || w.name}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="label text-xs">Status</label>
          <select className="input text-sm" value={filterStatus} onChange={e => setFilterStatus(e.target.value)}>
            <option value="">All statuses</option>
            <option value="open">Open</option>
            <option value="closed">Closed</option>
            <option value="error">Error</option>
          </select>
        </div>
      </div>

      {/* Summary strip */}
      {records.length > 0 && (
        <div className="grid grid-cols-3 gap-3">
          <div className="card p-4 text-center">
            <p className="text-xs text-gray-500 font-medium uppercase tracking-wide mb-1">Records</p>
            <p className="text-2xl font-bold text-gray-900">{total}</p>
          </div>
          <div className="card p-4 text-center">
            <p className="text-xs text-blue-500 font-medium uppercase tracking-wide mb-1">Total Volume</p>
            <p className="text-2xl font-bold text-blue-700">{fmtNum(totalVolume)} L</p>
          </div>
          <div className="card p-4 text-center">
            <p className="text-xs text-green-600 font-medium uppercase tracking-wide mb-1">Closed</p>
            <p className="text-2xl font-bold text-green-700">
              {records.filter(r => r.status === 'closed').length}
            </p>
          </div>
        </div>
      )}

      {/* Records */}
      {loading ? (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {[1, 2, 3].map(i => (
            <div key={i} className="card p-4 animate-pulse space-y-3">
              <div className="h-4 w-40 bg-gray-100 rounded" />
              <div className="h-3 w-full bg-gray-100 rounded" />
              <div className="h-3 w-2/3 bg-gray-100 rounded" />
            </div>
          ))}
        </div>
      ) : records.length === 0 ? (
        <div className="card px-6 py-20 text-center">
          <Gauge size={52} className="text-gray-200 mx-auto mb-3" />
          <p className="font-semibold text-gray-600">No pump shift records</p>
          <p className="text-sm text-gray-400 mt-1">
            Records appear automatically when workers clock in/out, if they have a pump assigned and an active integration exists.
          </p>
        </div>
      ) : (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {records.map(r => (
            <ShiftRow key={r._id} record={r} onEdit={setEditRecord} />
          ))}
        </div>
      )}

      {/* Edit modal */}
      {editRecord && (
        <EditShiftModal
          record={editRecord}
          onClose={() => setEditRecord(null)}
          onSaved={handleSaved}
        />
      )}

      {/* Assign pump modal */}
      {showAssign && (
        <AssignPumpModal
          workers={workers}
          onClose={() => setShowAssign(false)}
          onAssigned={load}
        />
      )}
    </div>
  );
}
