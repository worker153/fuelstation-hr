import { useState, useEffect, useCallback } from 'react';
import {
  Layers, Plus, Edit2, Trash2, X, Save, Loader,
  ChevronDown, Flame, Fuel, AlertCircle, CheckSquare, Square,
} from 'lucide-react';
import api from '../utils/api';
import { useNotify } from '../context/NotificationContext';
import { useAuth } from '../context/AuthContext';

const PRODUCT_TYPES = ['PMS', 'AGO', 'LPG', 'DPK', 'other'];
const PRODUCT_COLORS = {
  PMS:   'bg-green-100 text-green-700',
  AGO:   'bg-amber-100 text-amber-700',
  LPG:   'bg-blue-100 text-blue-700',
  DPK:   'bg-purple-100 text-purple-700',
  other: 'bg-gray-100 text-gray-600',
};

// ─── Island Modal ─────────────────────────────────────────────────────────────
function IslandModal({ island, branches, pumps, onClose, onSaved }) {
  const notify = useNotify();
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    name:          island?.name          || '',
    branchId:      island?.branchId?._id || island?.branchId || '',
    productTypes:  island?.productTypes  || [],
    includesGas:   island?.includesGas   || false,
    rotationOrder: island?.rotationOrder ?? 0,
    maxWorkers:    island?.maxWorkers    ?? 1,
    status:        island?.status        || 'active',
    notes:         island?.notes         || '',
    pumps:         (island?.pumps || []).map(p => String(p._id || p)),
  });

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const branchPumps = form.branchId
    ? pumps.filter(p => String(p.branchId) === form.branchId)
    : [];

  const togglePump = (id) => {
    const sid = String(id);
    set('pumps', form.pumps.includes(sid)
      ? form.pumps.filter(x => x !== sid)
      : [...form.pumps, sid]);
  };

  const toggleProduct = (pt) => {
    set('productTypes', form.productTypes.includes(pt)
      ? form.productTypes.filter(x => x !== pt)
      : [...form.productTypes, pt]);
  };

  const submit = async (e) => {
    e.preventDefault();
    if (!form.name.trim())  return notify('Island name is required', 'error');
    if (!form.branchId)     return notify('Please select a branch', 'error');
    setSaving(true);
    try {
      const branch = branches.find(b => b._id === form.branchId);
      const payload = { ...form, branchName: branch?.name };
      let res;
      if (island) {
        res = await api.put(`/pump-islands/${island._id}`, payload);
      } else {
        res = await api.post('/pump-islands', payload);
      }
      notify(island ? 'Island updated' : 'Island created');
      onSaved(res.data.data);
    } catch (err) {
      notify(err.response?.data?.message || 'Save failed', 'error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4 md:pl-64 overflow-y-auto">
      <div className="bg-white rounded-2xl w-full max-w-lg shadow-2xl my-4">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-brand-100 flex items-center justify-center">
              <Layers size={16} className="text-brand-700" />
            </div>
            <h3 className="font-bold text-gray-900">
              {island ? 'Edit Island' : 'Add Pump Island'}
            </h3>
          </div>
          <button onClick={onClose} className="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg">
            <X size={18} />
          </button>
        </div>

        <form onSubmit={submit} className="px-6 py-5 space-y-4">
          {/* Name */}
          <div>
            <label className="label">Island Name *</label>
            <input className="input" placeholder="e.g. Island 1, Island A"
              value={form.name} onChange={e => set('name', e.target.value)} required />
          </div>

          {/* Branch */}
          <div>
            <label className="label">Branch *</label>
            <select className="input" value={form.branchId}
              onChange={e => { set('branchId', e.target.value); set('pumps', []); }} required>
              <option value="">— Select branch —</option>
              {branches.map(b => <option key={b._id} value={b._id}>{b.name}</option>)}
            </select>
          </div>

          {/* Pumps on this island */}
          {form.branchId && (
            <div>
              <label className="label">Pumps on this Island</label>
              {branchPumps.length === 0 ? (
                <p className="text-xs text-gray-400 italic">No pumps registered for this branch yet.</p>
              ) : (
                <div className="flex flex-wrap gap-2 mt-1">
                  {branchPumps.map(p => {
                    const selected = form.pumps.includes(String(p._id));
                    return (
                      <button key={p._id} type="button"
                        onClick={() => togglePump(p._id)}
                        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl border text-sm font-medium transition-colors
                          ${selected
                            ? 'bg-brand-700 text-white border-brand-700'
                            : 'bg-white text-gray-600 border-gray-200 hover:border-brand-400'
                          }`}
                      >
                        <Fuel size={13} />
                        {p.pumpName}
                        <span className="text-xs opacity-70">({p.productType})</span>
                      </button>
                    );
                  })}
                </div>
              )}
              <p className="text-xs text-gray-400 mt-1">Select which pumps are physically on this island</p>
            </div>
          )}

          {/* Product types */}
          <div>
            <label className="label">Products sold on this island</label>
            <div className="flex flex-wrap gap-2 mt-1">
              {PRODUCT_TYPES.map(pt => {
                const on = form.productTypes.includes(pt);
                return (
                  <button key={pt} type="button" onClick={() => toggleProduct(pt)}
                    className={`px-3 py-1 rounded-full text-xs font-semibold border transition-colors
                      ${on ? PRODUCT_COLORS[pt] + ' border-transparent' : 'bg-white text-gray-500 border-gray-200 hover:border-gray-400'}`}
                  >
                    {pt}
                  </button>
                );
              })}
            </div>
          </div>

          {/* AGO + Gas rule */}
          <label className="flex items-start gap-3 p-3 rounded-xl border border-gray-200 bg-amber-50 cursor-pointer hover:border-amber-400 transition-colors">
            <input type="checkbox" checked={form.includesGas}
              onChange={e => set('includesGas', e.target.checked)}
              className="mt-0.5 accent-amber-600" />
            <div>
              <p className="text-sm font-semibold text-amber-800 flex items-center gap-1.5">
                <Flame size={14} className="text-amber-600" />
                Also handles Gas (LPG) sales
              </p>
              <p className="text-xs text-amber-700 mt-0.5">
                The worker assigned to this island also sells cooking gas — AGO + Gas rule.
              </p>
            </div>
          </label>

          {/* Max workers + Rotation */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="label">Max Workers</label>
              <select className="input" value={form.maxWorkers}
                onChange={e => set('maxWorkers', Number(e.target.value))}>
                <option value={1}>1 worker</option>
                <option value={2}>2 workers</option>
              </select>
              <p className="text-xs text-gray-400 mt-1">
                Set 2 if this island can have 2 attendants simultaneously
              </p>
            </div>
            <div>
              <label className="label">Rotation Order</label>
              <input className="input" type="number" min="0"
                value={form.rotationOrder}
                onChange={e => set('rotationOrder', Number(e.target.value))} />
              <p className="text-xs text-gray-400 mt-1">Lower number = assigned first</p>
            </div>
          </div>

          {/* Status */}
          <div>
            <label className="label">Status</label>
            <select className="input" value={form.status} onChange={e => set('status', e.target.value)}>
              <option value="active">Active</option>
              <option value="inactive">Inactive (skip in rotation)</option>
            </select>
          </div>

          {/* Notes */}
          <div>
            <label className="label">Notes (optional)</label>
            <textarea className="input" rows={2} placeholder="Any notes about this island..."
              value={form.notes} onChange={e => set('notes', e.target.value)} />
          </div>

          <div className="flex gap-3 pt-2">
            <button type="submit" disabled={saving}
              className="btn-primary flex-1 justify-center">
              {saving ? <Loader size={14} className="animate-spin" /> : <><Save size={13} /> Save Island</>}
            </button>
            <button type="button" onClick={onClose} className="btn-secondary">Cancel</button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── Island Card ──────────────────────────────────────────────────────────────
function IslandCard({ island, canManage, onEdit, onDelete }) {
  return (
    <div className={`card p-4 space-y-3 ${island.status === 'inactive' ? 'opacity-60' : ''}`}>
      <div className="flex items-start justify-between gap-2">
        <div>
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="font-bold text-gray-900">{island.name}</h3>
            {island.status === 'inactive' && (
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-gray-100 text-gray-500 font-semibold uppercase">Inactive</span>
            )}
            {island.includesGas && (
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 font-semibold flex items-center gap-1">
                <Flame size={10} />AGO + Gas
              </span>
            )}
          </div>
          <p className="text-xs text-gray-400 mt-0.5">{island.branchName || '—'} · Rotation #{island.rotationOrder}</p>
        </div>
        {canManage && (
          <div className="flex gap-1.5 shrink-0">
            <button onClick={() => onEdit(island)}
              className="p-1.5 text-gray-400 hover:text-brand-600 hover:bg-brand-50 rounded-lg transition-colors">
              <Edit2 size={14} />
            </button>
            <button onClick={() => onDelete(island)}
              className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors">
              <Trash2 size={14} />
            </button>
          </div>
        )}
      </div>

      {/* Pumps */}
      {island.pumps?.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {island.pumps.map(p => (
            <span key={p._id} className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full font-medium ${PRODUCT_COLORS[p.productType] || PRODUCT_COLORS.other}`}>
              <Fuel size={11} />{p.pumpName}
            </span>
          ))}
        </div>
      )}

      {/* Product types */}
      {island.productTypes?.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {island.productTypes.map(pt => (
            <span key={pt} className={`text-[10px] px-2 py-0.5 rounded-full font-semibold ${PRODUCT_COLORS[pt] || PRODUCT_COLORS.other}`}>
              {pt}
            </span>
          ))}
        </div>
      )}

      <div className="flex items-center justify-between pt-1 border-t border-gray-100">
        <span className="text-xs text-gray-500">
          Max {island.maxWorkers} worker{island.maxWorkers > 1 ? 's' : ''} per shift
        </span>
        {island.maxWorkers === 2 && (
          <span className="text-[10px] px-2 py-0.5 rounded-full bg-blue-100 text-blue-700 font-medium">Shared island</span>
        )}
      </div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function PumpIslands() {
  const notify = useNotify();
  const { can, isSuperAdmin } = useAuth();
  const canManage = isSuperAdmin() || can('manageBranches');

  const [islands,    setIslands   ] = useState([]);
  const [branches,   setBranches  ] = useState([]);
  const [pumps,      setPumps     ] = useState([]);
  const [loading,    setLoading   ] = useState(true);
  const [branchId,   setBranchId  ] = useState('');
  const [modalIsland, setModalIsland] = useState(null);
  const [showModal,   setShowModal  ] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = branchId ? `?branchId=${branchId}` : '';
      const res = await api.get(`/pump-islands${params}`);
      setIslands(res.data.data || []);
    } catch {
      notify('Failed to load islands', 'error');
    } finally {
      setLoading(false);
    }
  }, [branchId]); // eslint-disable-line

  useEffect(() => {
    Promise.all([api.get('/branches'), api.get('/pumps')])
      .then(([bRes, pRes]) => {
        setBranches(bRes.data.data || []);
        setPumps(pRes.data.data || []);
      })
      .catch(() => {});
  }, []);

  useEffect(() => { load(); }, [load]);

  const openCreate = () => { setModalIsland(null); setShowModal(true); };
  const openEdit   = (i) => { setModalIsland(i);   setShowModal(true); };

  const handleSaved = (saved) => {
    setIslands(prev => {
      const idx = prev.findIndex(i => i._id === saved._id);
      return idx >= 0 ? prev.map(i => i._id === saved._id ? saved : i) : [saved, ...prev];
    });
    setShowModal(false);
  };

  const [selected,    setSelected   ] = useState(new Set());
  const [bulkDeleting, setBulkDeleting] = useState(false);

  const toggleSelect = (id) =>
    setSelected(prev => { const s = new Set(prev); s.has(id) ? s.delete(id) : s.add(id); return s; });

  const allSelected = islands.length > 0 && islands.every(i => selected.has(i._id));
  const toggleAll   = () => setSelected(allSelected ? new Set() : new Set(islands.map(i => i._id)));

  const handleDelete = async (island) => {
    if (!window.confirm(`Delete "${island.name}"? This won't affect past assignments.`)) return;
    try {
      await api.delete(`/pump-islands/${island._id}`);
      setIslands(prev => prev.filter(i => i._id !== island._id));
      setSelected(prev => { const s = new Set(prev); s.delete(island._id); return s; });
      notify('Island deleted');
    } catch {
      notify('Delete failed', 'error');
    }
  };

  const handleBulkDelete = async () => {
    if (!selected.size) return;
    if (!window.confirm(`Delete ${selected.size} island(s)? This won't affect past assignments.`)) return;
    setBulkDeleting(true);
    let failed = 0;
    for (const id of selected) {
      try { await api.delete(`/pump-islands/${id}`); }
      catch { failed++; }
    }
    await load();
    setSelected(new Set());
    setBulkDeleting(false);
    if (failed) notify(`${failed} deletion(s) failed`, 'error');
    else notify(`${selected.size} island(s) deleted`);
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Pump Islands</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            Group your pumps into islands for smart worker rotation
          </p>
        </div>
        {canManage && (
          <button onClick={openCreate} className="btn-primary gap-2">
            <Plus size={16} /> Add Island
          </button>
        )}
      </div>

      {/* Info box */}
      <div className="bg-blue-50 border border-blue-200 rounded-xl px-4 py-3 flex gap-3">
        <AlertCircle size={16} className="text-blue-500 shrink-0 mt-0.5" />
        <div className="text-sm text-blue-700 space-y-1">
          <p><strong>How it works:</strong> When a worker clocks in, the system assigns them to the next island in rotation order.</p>
          <p>If you have more workers than islands, set an island's <strong>Max Workers to 2</strong> — two workers will share that island.</p>
          <p>Check <strong>"Also handles Gas"</strong> on any AGO island so the assigned worker is also responsible for LPG/gas sales.</p>
        </div>
      </div>

      {/* Branch filter + bulk actions */}
      <div className="flex items-center gap-3 flex-wrap">
        <select className="input py-2 text-sm w-52"
          value={branchId} onChange={e => setBranchId(e.target.value)}>
          <option value="">All branches</option>
          {branches.map(b => <option key={b._id} value={b._id}>{b.name}</option>)}
        </select>
        <span className="text-sm text-gray-400">{islands.length} island{islands.length !== 1 ? 's' : ''}</span>

        {canManage && islands.length > 0 && (
          <div className="flex items-center gap-2 ml-auto">
            <button onClick={toggleAll}
              className="flex items-center gap-1.5 text-sm text-gray-600 hover:text-brand-600 transition-colors">
              {allSelected
                ? <CheckSquare size={16} className="text-brand-600" />
                : <Square size={16} />}
              {allSelected ? 'Deselect all' : 'Select all'}
            </button>
            {selected.size > 0 && (
              <button onClick={handleBulkDelete} disabled={bulkDeleting}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-red-600 text-white text-sm font-medium hover:bg-red-700 transition-colors disabled:opacity-50">
                {bulkDeleting
                  ? <Loader size={13} className="animate-spin" />
                  : <Trash2 size={13} />}
                Delete {selected.size} selected
              </button>
            )}
          </div>
        )}
      </div>

      {/* Islands grid */}
      {loading ? (
        <div className="card p-10 text-center">
          <Loader size={24} className="animate-spin text-brand-400 mx-auto" />
        </div>
      ) : islands.length === 0 ? (
        <div className="card px-6 py-16 text-center">
          <Layers size={48} className="text-gray-200 mx-auto mb-3" />
          <p className="font-semibold text-gray-600">No islands configured</p>
          <p className="text-sm text-gray-400 mt-1 max-w-sm mx-auto">
            Create your first island by clicking "Add Island". Group Pump 1 + Pump 2
            into "Island 1", etc.
          </p>
          {canManage && (
            <button onClick={openCreate} className="btn-primary mt-4 mx-auto">
              <Plus size={15} /> Add Island
            </button>
          )}
        </div>
      ) : (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {islands.map(i => (
            <div key={i._id} className="relative">
              {canManage && (
                <button onClick={() => toggleSelect(i._id)}
                  className="absolute top-3 left-3 z-10 text-gray-400 hover:text-brand-600 transition-colors">
                  {selected.has(i._id)
                    ? <CheckSquare size={18} className="text-brand-600" />
                    : <Square size={18} />}
                </button>
              )}
              <div className={`transition-all ${selected.has(i._id) ? 'ring-2 ring-brand-400 rounded-xl' : ''}`}>
                <IslandCard island={i} canManage={canManage}
                  onEdit={openEdit} onDelete={handleDelete} />
              </div>
            </div>
          ))}
        </div>
      )}

      {showModal && (
        <IslandModal
          island={modalIsland}
          branches={branches}
          pumps={pumps}
          onClose={() => setShowModal(false)}
          onSaved={handleSaved}
        />
      )}
    </div>
  );
}
