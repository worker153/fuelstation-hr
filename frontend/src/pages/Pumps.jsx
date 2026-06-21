import { useState, useEffect } from 'react';
import {
  Fuel, Plus, Edit2, Trash2, X, Save, Loader,
  ChevronDown, AlertCircle, Download,
} from 'lucide-react';
import api from '../utils/api';
import { useNotify } from '../context/NotificationContext';
import { useAuth } from '../context/AuthContext';

const PRODUCT_COLORS = {
  PMS:   { bg: 'bg-green-100',  text: 'text-green-700',  dot: 'bg-green-500'  },
  AGO:   { bg: 'bg-amber-100',  text: 'text-amber-700',  dot: 'bg-amber-500'  },
  LPG:   { bg: 'bg-blue-100',   text: 'text-blue-700',   dot: 'bg-blue-500'   },
  DPK:   { bg: 'bg-purple-100', text: 'text-purple-700', dot: 'bg-purple-500' },
  other: { bg: 'bg-gray-100',   text: 'text-gray-600',   dot: 'bg-gray-400'   },
};

const STATUS_COLORS = {
  active:      { bg: 'bg-green-100', text: 'text-green-700' },
  faulty:      { bg: 'bg-red-100',   text: 'text-red-700'   },
  maintenance: { bg: 'bg-amber-100', text: 'text-amber-700' },
};

const EMPTY_FORM = {
  branchId:      '',
  branchName:    '',
  pumpNumber:    '',
  pumpName:      '',
  productType:   'PMS',
  externalId:    '',
  status:        'active',
  rotationOrder: '',
  notes:         '',
};

// ─── Pump Modal ───────────────────────────────────────────────────────────────
function PumpModal({ pump, branches, onClose, onSaved }) {
  const notify = useNotify();
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState(
    pump
      ? {
          branchId:      pump.branchId  || '',
          branchName:    pump.branchName || '',
          pumpNumber:    pump.pumpNumber || '',
          pumpName:      pump.pumpName  || '',
          productType:   pump.productType || 'PMS',
          externalId:    pump.externalId  || '',
          status:        pump.status       || 'active',
          rotationOrder: pump.rotationOrder ?? '',
          notes:         pump.notes         || '',
        }
      : { ...EMPTY_FORM }
  );

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const handleBranchChange = (e) => {
    const bid = e.target.value;
    const branch = branches.find(b => b._id === bid);
    set('branchId', bid);
    set('branchName', branch?.name || '');
  };

  const submit = async (e) => {
    e.preventDefault();
    if (!form.branchId) return notify('Please select a branch', 'error');
    if (!form.pumpNumber) return notify('Pump number is required', 'error');
    if (!form.pumpName.trim()) return notify('Pump name is required', 'error');
    setSaving(true);
    try {
      const payload = {
        ...form,
        pumpNumber:    Number(form.pumpNumber),
        rotationOrder: form.rotationOrder !== '' ? Number(form.rotationOrder) : Number(form.pumpNumber),
        externalId:    form.externalId.trim() || null,
        notes:         form.notes.trim() || undefined,
      };
      const res = pump
        ? await api.put(`/pumps/${pump._id}`, payload)
        : await api.post('/pumps', payload);
      notify(pump ? 'Pump updated' : 'Pump created');
      onSaved(res.data.data);
    } catch (err) {
      notify(err.response?.data?.message || 'Failed to save pump', 'error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/60 overflow-y-auto md:pl-64">
      <div className="min-h-full flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl w-full max-w-md shadow-2xl my-6">

          {/* Header */}
          <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-green-100 flex items-center justify-center shrink-0">
                <Fuel size={18} className="text-green-600" />
              </div>
              <div>
                <h3 className="font-bold text-gray-900 leading-tight">{pump ? 'Edit Pump' : 'Add Pump'}</h3>
                <p className="text-xs text-gray-400 mt-0.5">{pump ? 'Update pump details' : 'Register a new pump'}</p>
              </div>
            </div>
            <button onClick={onClose} className="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors">
              <X size={18} />
            </button>
          </div>

          <form onSubmit={submit} className="px-6 py-5 space-y-4">

            {/* Branch */}
            <div>
              <label className="label">Branch *</label>
              <select className="input" value={form.branchId} onChange={handleBranchChange} required>
                <option value="">— Select branch —</option>
                {branches.map(b => <option key={b._id} value={b._id}>{b.name}</option>)}
              </select>
            </div>

            {/* Pump Number + Name */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="label">Pump Number *</label>
                <input className="input" type="number" min="1" placeholder="e.g. 1"
                  value={form.pumpNumber} onChange={e => set('pumpNumber', e.target.value)} required />
              </div>
              <div>
                <label className="label">Pump Name *</label>
                <input className="input" placeholder="e.g. Pump 1"
                  value={form.pumpName} onChange={e => set('pumpName', e.target.value)} required />
              </div>
            </div>

            {/* Product Type + Status */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="label">Product Type</label>
                <select className="input" value={form.productType} onChange={e => set('productType', e.target.value)}>
                  <option value="PMS">PMS (Petrol)</option>
                  <option value="AGO">AGO (Diesel)</option>
                  <option value="LPG">LPG (Gas)</option>
                  <option value="DPK">DPK (Kerosene)</option>
                  <option value="other">Other</option>
                </select>
              </div>
              <div>
                <label className="label">Status</label>
                <select className="input" value={form.status} onChange={e => set('status', e.target.value)}>
                  <option value="active">Active</option>
                  <option value="faulty">Faulty</option>
                  <option value="maintenance">Maintenance</option>
                </select>
              </div>
            </div>

            {/* External API ID + Rotation Order */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="label">External API ID</label>
                <input className="input" placeholder="ID on station API"
                  value={form.externalId} onChange={e => set('externalId', e.target.value)} />
              </div>
              <div>
                <label className="label">Rotation Order</label>
                <input className="input" type="number" min="0" placeholder="e.g. 1"
                  value={form.rotationOrder} onChange={e => set('rotationOrder', e.target.value)} />
              </div>
            </div>

            {/* Notes */}
            <div>
              <label className="label">Notes</label>
              <textarea className="input resize-none" rows={2} placeholder="Optional notes"
                value={form.notes} onChange={e => set('notes', e.target.value)} />
            </div>

            {/* Footer */}
            <div className="flex gap-3 pt-2">
              <button type="submit" disabled={saving} className="btn-primary flex-1 justify-center">
                {saving ? <Loader size={15} className="animate-spin" /> : <><Save size={14} /> {pump ? 'Save Changes' : 'Add Pump'}</>}
              </button>
              <button type="button" onClick={onClose} className="btn-secondary">Cancel</button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}

// ─── Pump Card ────────────────────────────────────────────────────────────────
function PumpCard({ pump, canManage, onEdit, onDelete }) {
  const pc = PRODUCT_COLORS[pump.productType] || PRODUCT_COLORS.other;
  const sc = STATUS_COLORS[pump.status]       || STATUS_COLORS.active;

  return (
    <div className="card p-5 space-y-3 hover:shadow-md transition-shadow">
      {/* Top row */}
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-3">
          <div className={`w-11 h-11 rounded-xl flex items-center justify-center shrink-0 ${pc.bg}`}>
            <span className="text-lg font-black text-gray-700">{pump.pumpNumber}</span>
          </div>
          <div>
            <h3 className="font-bold text-gray-900 leading-tight">{pump.pumpName}</h3>
            <p className="text-xs text-gray-400 mt-0.5">{pump.branchName || '—'}</p>
          </div>
        </div>
        {canManage && (
          <div className="flex items-center gap-1 shrink-0">
            <button onClick={onEdit}
              className="p-1.5 text-gray-400 hover:text-brand-600 hover:bg-brand-50 rounded-lg transition-colors" title="Edit">
              <Edit2 size={14} />
            </button>
            <button onClick={onDelete}
              className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors" title="Delete">
              <Trash2 size={14} />
            </button>
          </div>
        )}
      </div>

      {/* Badges row */}
      <div className="flex flex-wrap gap-2">
        <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold ${pc.bg} ${pc.text}`}>
          <span className={`w-1.5 h-1.5 rounded-full ${pc.dot}`} />
          {pump.productType}
        </span>
        <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold ${sc.bg} ${sc.text}`}>
          {pump.status.charAt(0).toUpperCase() + pump.status.slice(1)}
        </span>
      </div>

      {/* Details */}
      <div className="space-y-1 text-xs text-gray-500">
        {pump.externalId && (
          <div className="flex items-center gap-1.5">
            <span className="text-gray-400">API ID:</span>
            <span className="font-mono text-gray-600 bg-gray-100 px-1.5 py-0.5 rounded">{pump.externalId}</span>
          </div>
        )}
        <div className="flex items-center gap-1.5">
          <span className="text-gray-400">Rotation:</span>
          <span className="font-medium text-gray-600">#{pump.rotationOrder}</span>
        </div>
        {pump.notes && (
          <p className="text-gray-400 italic truncate">{pump.notes}</p>
        )}
      </div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function Pumps() {
  const notify = useNotify();
  const { can, isSuperAdmin } = useAuth();
  const canManage = isSuperAdmin() || can('manageBranches');

  const [pumps,      setPumps     ] = useState([]);
  const [branches,   setBranches  ] = useState([]);
  const [loading,    setLoading   ] = useState(true);
  const [branchId,   setBranchId  ] = useState('');
  const [modal,      setModal     ] = useState(null); // null | 'new' | pump-object
  const [deleting,   setDeleting  ] = useState(null);
  const [importing,       setImporting      ] = useState(false);
  const [locationPicker,  setLocationPicker ] = useState(false);
  const [stationLocations,setStationLocations] = useState([]);
  const [locLoading,      setLocLoading     ] = useState(false);
  const [selectedLocId,   setSelectedLocId  ] = useState('');

  const load = async () => {
    setLoading(true);
    try {
      const [pRes, bRes] = await Promise.all([
        api.get(`/pumps${branchId ? `?branchId=${branchId}` : ''}`),
        api.get('/branches'),
      ]);
      setPumps(pRes.data.data || []);
      setBranches(bRes.data.data || []);
    } catch {
      notify('Failed to load pumps', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [branchId]); // eslint-disable-line

  const handleSaved = (saved) => {
    setPumps(prev => {
      const idx = prev.findIndex(p => p._id === saved._id);
      if (idx >= 0) { const next = [...prev]; next[idx] = saved; return next; }
      return [...prev, saved];
    });
    setModal(null);
  };

  const handleImport = async () => {
    if (!branchId) return notify('Select a branch first, then click Import', 'error');
    // Fetch available StationDesk locations first so user can pick the right one
    setLocLoading(true);
    try {
      const res = await api.get('/pumps/station-locations');
      const locs = res.data.data || [];
      setStationLocations(locs);
      setSelectedLocId(locs[0]?.location_id || '');
      setLocationPicker(true);
    } catch {
      // No integration or fetch failed — fall through to direct import with no locationId override
      runImport(null);
    } finally {
      setLocLoading(false);
    }
  };

  const runImport = async (locationId) => {
    setLocationPicker(false);
    setImporting(true);
    try {
      const res = await api.post('/pumps/import-from-api', { branchId, locationId: locationId || undefined });
      notify(res.data.message);
      load();
    } catch (err) {
      notify(err.response?.data?.message || 'Import failed', 'error');
    } finally {
      setImporting(false);
    }
  };

  const handleDelete = async (pump) => {
    if (!window.confirm(`Delete ${pump.pumpName}? This cannot be undone.`)) return;
    setDeleting(pump._id);
    try {
      await api.delete(`/pumps/${pump._id}`);
      setPumps(prev => prev.filter(p => p._id !== pump._id));
      notify('Pump deleted');
    } catch (err) {
      notify(err.response?.data?.message || 'Failed to delete pump', 'error');
    } finally {
      setDeleting(null);
    }
  };

  // Group by branch
  const grouped = pumps.reduce((acc, p) => {
    const key = p.branchId || 'unknown';
    if (!acc[key]) acc[key] = { branchName: p.branchName || '—', pumps: [] };
    acc[key].pumps.push(p);
    return acc;
  }, {});

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Pump Management</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            {pumps.length} pump{pumps.length !== 1 ? 's' : ''} registered
          </p>
        </div>
        <div className="flex items-center gap-2">
          <select
            className="input w-44 text-sm py-2"
            value={branchId}
            onChange={e => setBranchId(e.target.value)}
          >
            <option value="">All branches</option>
            {branches.map(b => <option key={b._id} value={b._id}>{b.name}</option>)}
          </select>
          {canManage && (
            <>
              <button onClick={handleImport} disabled={importing || locLoading}
                className="btn-secondary gap-1.5 text-sm"
                title="Import pumps from StationDesk API">
                {(importing || locLoading)
                  ? <Loader size={14} className="animate-spin" />
                  : <Download size={14} />}
                Import from API
              </button>
              <button onClick={() => setModal('new')} className="btn-primary">
                <Plus size={16} /> Add Pump
              </button>
            </>
          )}
        </div>
      </div>

      {/* Content */}
      {loading ? (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="card p-5 animate-pulse space-y-3">
              <div className="flex items-center gap-3">
                <div className="w-11 h-11 bg-gray-100 rounded-xl" />
                <div className="space-y-1.5 flex-1">
                  <div className="h-4 w-24 bg-gray-100 rounded" />
                  <div className="h-3 w-16 bg-gray-100 rounded" />
                </div>
              </div>
              <div className="h-3 w-full bg-gray-100 rounded" />
            </div>
          ))}
        </div>
      ) : pumps.length === 0 ? (
        <div className="card px-6 py-20 text-center">
          <Fuel size={52} className="text-gray-200 mx-auto mb-3" />
          <p className="font-semibold text-gray-600">No pumps registered yet</p>
          <p className="text-sm text-gray-400 mt-1">Add pumps to enable automatic rotation assignment</p>
          {canManage && (
            <button onClick={() => setModal('new')} className="btn-primary mt-5 inline-flex">
              <Plus size={16} /> Add First Pump
            </button>
          )}
        </div>
      ) : branchId ? (
        /* Single branch view */
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {pumps.map(pump => (
            <PumpCard
              key={pump._id}
              pump={pump}
              canManage={canManage && deleting !== pump._id}
              onEdit={() => setModal(pump)}
              onDelete={() => handleDelete(pump)}
            />
          ))}
        </div>
      ) : (
        /* All branches view — grouped */
        <div className="space-y-8">
          {Object.entries(grouped).map(([bid, group]) => (
            <div key={bid}>
              <div className="flex items-center gap-2 mb-3">
                <h2 className="text-sm font-bold text-gray-700 uppercase tracking-wide">{group.branchName}</h2>
                <span className="text-xs text-gray-400">{group.pumps.length} pump{group.pumps.length !== 1 ? 's' : ''}</span>
              </div>
              <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {group.pumps.map(pump => (
                  <PumpCard
                    key={pump._id}
                    pump={pump}
                    canManage={canManage && deleting !== pump._id}
                    onEdit={() => setModal(pump)}
                    onDelete={() => handleDelete(pump)}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Info box when no pumps are configured */}
      {!loading && pumps.length === 0 && (
        <div className="bg-blue-50 border border-blue-200 rounded-xl px-4 py-3 flex gap-3">
          <AlertCircle size={16} className="text-blue-500 shrink-0 mt-0.5" />
          <p className="text-sm text-blue-700">
            Pumps registered here are automatically assigned to workers on clock-in using a rotation system.
            Workers are cycled through pumps so no one stays on the same pump every day.
          </p>
        </div>
      )}

      {/* Pump form modal */}
      {modal && (
        <PumpModal
          pump={modal === 'new' ? null : modal}
          branches={branches}
          onClose={() => setModal(null)}
          onSaved={handleSaved}
        />
      )}

      {/* StationDesk location picker modal */}
      {locationPicker && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4 md:pl-64">
          <div className="bg-white rounded-2xl w-full max-w-sm shadow-2xl">
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
              <div className="flex items-center gap-2">
                <Download size={16} className="text-brand-600" />
                <h3 className="font-bold text-gray-900 text-sm">Select StationDesk Location</h3>
              </div>
              <button onClick={() => setLocationPicker(false)} className="p-1 text-gray-400 hover:text-gray-600 rounded">
                <X size={16} />
              </button>
            </div>
            <div className="px-5 py-4 space-y-4">
              <p className="text-sm text-gray-500">
                Which StationDesk location matches this branch? Only pumps from that location will be imported.
              </p>
              <div>
                <label className="label">StationDesk Location</label>
                <select
                  className="input"
                  value={selectedLocId}
                  onChange={e => setSelectedLocId(e.target.value)}
                >
                  {stationLocations.map(l => (
                    <option key={l.location_id} value={l.location_id}>
                      {l.name || l.location_name} ({l.location_id})
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex gap-3">
                <button
                  onClick={() => runImport(selectedLocId)}
                  className="btn-primary flex-1 justify-center"
                  disabled={!selectedLocId}
                >
                  <Download size={13} /> Import Pumps
                </button>
                <button onClick={() => setLocationPicker(false)} className="btn-secondary">Cancel</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
