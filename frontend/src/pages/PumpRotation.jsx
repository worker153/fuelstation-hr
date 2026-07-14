import { useState, useEffect, useCallback } from 'react';
import { RefreshCw, Plus, Trash2, X, Save, ChevronUp, ChevronDown, Layers, ArrowRight } from 'lucide-react';
import api from '../utils/api';
import { useNotify } from '../context/NotificationContext';
import { useAuth } from '../context/AuthContext';

function todayWAT() {
  const now    = new Date();
  const watNow = new Date(now.getTime() + 60 * 60 * 1000);
  return `${watNow.getUTCFullYear()}-${String(watNow.getUTCMonth()+1).padStart(2,'0')}-${String(watNow.getUTCDate()).padStart(2,'0')}`;
}

// ── Small worker order pill with up/down arrows ───────────────────────────────
function OrderableItem({ item, index, total, onMove, onRemove, label }) {
  return (
    <div className="flex items-center gap-2 bg-white border border-gray-200 rounded-xl px-3 py-2">
      <span className="text-xs font-bold text-gray-400 w-5 shrink-0">{index + 1}</span>
      <span className="flex-1 text-sm font-medium text-gray-800 truncate">{label}</span>
      <div className="flex gap-1 shrink-0">
        <button type="button" disabled={index === 0}
          onClick={() => onMove(index, -1)}
          className="p-1 rounded hover:bg-gray-100 disabled:opacity-30">
          <ChevronUp size={14} />
        </button>
        <button type="button" disabled={index === total - 1}
          onClick={() => onMove(index, 1)}
          className="p-1 rounded hover:bg-gray-100 disabled:opacity-30">
          <ChevronDown size={14} />
        </button>
        <button type="button" onClick={() => onRemove(index)}
          className="p-1 rounded hover:bg-red-50 text-gray-400 hover:text-red-500">
          <X size={14} />
        </button>
      </div>
    </div>
  );
}

// ── Create / Edit Group Modal ─────────────────────────────────────────────────
function GroupModal({ branchId, branchName, group, allWorkers, allIslands, onClose, onSaved }) {
  const notify = useNotify();
  const [name,    setName   ] = useState(group?.name    || '');
  const [workers, setWorkers] = useState(group?.workers  || []);
  const [islands, setIslands] = useState(group?.islands  || []);
  const [saving,  setSaving ] = useState(false);

  const pumpAttendants = allWorkers.filter(
    w => /pump.?attendant|fuel.?attendant|^attendant$/i.test(w.role || '')
  );
  const addedWorkerIds = new Set(workers.map(w => String(w.workerId)));
  const addedIslandIds = new Set(islands.map(i => String(i.islandId)));

  function moveItem(arr, setArr, index, dir) {
    const next = [...arr];
    const swap = index + dir;
    [next[index], next[swap]] = [next[swap], next[index]];
    setArr(next.map((x, i) => ({ ...x, position: i })));
  }

  function removeWorker(index) {
    const next = workers.filter((_, i) => i !== index).map((x, i) => ({ ...x, position: i }));
    setWorkers(next);
  }
  function removeIsland(index) {
    const next = islands.filter((_, i) => i !== index).map((x, i) => ({ ...x, position: i }));
    setIslands(next);
  }

  function addWorker(w) {
    if (addedWorkerIds.has(String(w._id))) return;
    setWorkers(prev => [...prev, { workerId: w._id, workerName: w.fullName, position: prev.length }]);
  }
  function addIsland(isl) {
    if (addedIslandIds.has(String(isl._id))) return;
    setIslands(prev => [...prev, { islandId: isl._id, islandName: isl.name, position: prev.length }]);
  }

  async function submit(e) {
    e.preventDefault();
    if (!name.trim())       return notify('Enter a group name', 'error');
    if (workers.length < 2) return notify('Add at least 2 workers', 'error');
    if (islands.length < 2) return notify('Add at least 2 islands', 'error');
    if (workers.length !== islands.length)
      return notify(`Workers (${workers.length}) and islands (${islands.length}) must be the same count`, 'error');
    setSaving(true);
    try {
      const payload = { branchId, branchName, name: name.trim(), workers, islands };
      const res = group?._id
        ? await api.put(`/pump-rotation-groups/${group._id}`, payload)
        : await api.post('/pump-rotation-groups', payload);
      notify(group?._id ? 'Group updated' : 'Group created');
      onSaved(res.data.data);
    } catch (err) {
      notify(err.response?.data?.message || 'Save failed', 'error');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex items-end md:items-center justify-center md:p-4 md:pl-64">
      <div className="bg-white rounded-t-3xl md:rounded-2xl w-full max-w-lg shadow-2xl max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 shrink-0">
          <h3 className="font-bold text-gray-900">{group?._id ? 'Edit' : 'Create'} Rotation Group</h3>
          <button onClick={onClose} className="p-1 text-gray-400 hover:text-gray-600 rounded"><X size={18} /></button>
        </div>

        <form onSubmit={submit} className="overflow-y-auto flex-1 px-5 py-4 space-y-5">
          {/* Name */}
          <div>
            <label className="block text-xs font-semibold text-gray-500 mb-1">Group Name</label>
            <input value={name} onChange={e => setName(e.target.value)}
              placeholder="e.g. Main Shift Rotation"
              className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-brand-500" />
          </div>

          {/* Workers */}
          <div>
            <label className="block text-xs font-semibold text-gray-500 mb-1">
              Workers in rotation order <span className="text-gray-400 font-normal">(top = position 1)</span>
            </label>
            <div className="space-y-2 mb-2">
              {workers.map((w, i) => (
                <OrderableItem key={String(w.workerId)} item={w} index={i} total={workers.length}
                  label={w.workerName} onMove={(idx, d) => moveItem(workers, setWorkers, idx, d)}
                  onRemove={removeWorker} />
              ))}
            </div>
            <select onChange={e => { const w = pumpAttendants.find(x => String(x._id) === e.target.value); if (w) addWorker(w); e.target.value = ''; }}
              className="w-full border border-dashed border-gray-300 rounded-xl px-3 py-2 text-sm text-gray-500 focus:outline-none">
              <option value="">+ Add pump attendant…</option>
              {pumpAttendants.filter(w => !addedWorkerIds.has(String(w._id))).map(w => (
                <option key={w._id} value={w._id}>{w.fullName} — {w.role}</option>
              ))}
            </select>
          </div>

          {/* Islands */}
          <div>
            <label className="block text-xs font-semibold text-gray-500 mb-1">
              Islands in order <span className="text-gray-400 font-normal">(top = Island slot 1)</span>
            </label>
            <div className="space-y-2 mb-2">
              {islands.map((isl, i) => (
                <OrderableItem key={String(isl.islandId)} item={isl} index={i} total={islands.length}
                  label={isl.islandName} onMove={(idx, d) => moveItem(islands, setIslands, idx, d)}
                  onRemove={removeIsland} />
              ))}
            </div>
            <select onChange={e => { const isl = allIslands.find(x => String(x._id) === e.target.value); if (isl) addIsland(isl); e.target.value = ''; }}
              className="w-full border border-dashed border-gray-300 rounded-xl px-3 py-2 text-sm text-gray-500 focus:outline-none">
              <option value="">+ Add island…</option>
              {allIslands.filter(isl => !addedIslandIds.has(String(isl._id))).map(isl => (
                <option key={isl._id} value={isl._id}>{isl.name}</option>
              ))}
            </select>
            {workers.length > 0 && islands.length > 0 && workers.length !== islands.length && (
              <p className="text-xs text-amber-600 mt-1">⚠ Workers ({workers.length}) and islands ({islands.length}) must match</p>
            )}
          </div>
        </form>

        <div className="px-5 py-4 border-t border-gray-100 flex gap-3 shrink-0">
          <button type="button" onClick={onClose} className="flex-1 py-2.5 rounded-xl border border-gray-200 text-sm font-medium text-gray-600">Cancel</button>
          <button onClick={submit} disabled={saving}
            className="flex-1 py-2.5 rounded-xl bg-brand-600 text-white text-sm font-bold disabled:opacity-60 flex items-center justify-center gap-2">
            {saving ? <><RefreshCw size={14} className="animate-spin" /> Saving…</> : <><Save size={14} /> Save Group</>}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Seed Modal — set today's assignment for the group ─────────────────────────
function SeedModal({ group, onClose, onSeeded }) {
  const notify = useNotify();
  const [date,    setDate   ] = useState(todayWAT());
  const [mapping, setMapping] = useState(() =>
    group.workers.sort((a,b) => a.position - b.position).map(w => ({
      workerId:   String(w.workerId),
      workerName: w.workerName,
      islandId:   String(group.islands.find(i => i.position === w.position)?.islandId || ''),
    }))
  );
  const [saving, setSaving] = useState(false);

  function setIslandForWorker(workerId, islandId) {
    setMapping(prev => prev.map(m => m.workerId === workerId ? { ...m, islandId } : m));
  }

  async function submit() {
    if (mapping.some(m => !m.islandId)) return notify('Assign an island to every worker', 'error');
    setSaving(true);
    try {
      await api.post(`/pump-rotation-groups/${group._id}/seed`, {
        date,
        assignments: mapping.map(m => ({ workerId: m.workerId, islandId: m.islandId })),
      });
      notify('Assignments saved — rotation starts from next shift');
      onSeeded();
      onClose();
    } catch (err) {
      notify(err.response?.data?.message || 'Save failed', 'error');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex items-end md:items-center justify-center md:p-4 md:pl-64">
      <div className="bg-white rounded-t-3xl md:rounded-2xl w-full max-w-md shadow-2xl">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <div>
            <h3 className="font-bold text-gray-900">Set Today's Assignment</h3>
            <p className="text-xs text-gray-400 mt-0.5">The system rotates from this point forward</p>
          </div>
          <button onClick={onClose} className="p-1 text-gray-400 hover:text-gray-600 rounded"><X size={18} /></button>
        </div>

        <div className="px-5 py-4 space-y-4">
          <div>
            <label className="block text-xs font-semibold text-gray-500 mb-1">Date</label>
            <input type="date" value={date} onChange={e => setDate(e.target.value)}
              className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-brand-500" />
          </div>

          <div className="space-y-3">
            {mapping.map(m => (
              <div key={m.workerId} className="flex items-center gap-3">
                <div className="flex-1 bg-gray-50 rounded-xl px-3 py-2.5 text-sm font-medium text-gray-800 truncate">
                  {m.workerName}
                </div>
                <ArrowRight size={14} className="text-gray-400 shrink-0" />
                <select value={m.islandId} onChange={e => setIslandForWorker(m.workerId, e.target.value)}
                  className="flex-1 border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-brand-500">
                  <option value="">Select island…</option>
                  {group.islands.sort((a,b) => a.position - b.position).map(isl => (
                    <option key={String(isl.islandId)} value={String(isl.islandId)}>{isl.islandName}</option>
                  ))}
                </select>
              </div>
            ))}
          </div>
        </div>

        <div className="px-5 py-4 border-t border-gray-100 flex gap-3">
          <button type="button" onClick={onClose} className="flex-1 py-2.5 rounded-xl border border-gray-200 text-sm font-medium text-gray-600">Cancel</button>
          <button onClick={submit} disabled={saving}
            className="flex-1 py-2.5 rounded-xl bg-green-600 text-white text-sm font-bold disabled:opacity-60 flex items-center justify-center gap-2">
            {saving ? <><RefreshCw size={14} className="animate-spin" />Saving…</> : <><Save size={14} />Save & Activate</>}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Group Card ────────────────────────────────────────────────────────────────
function GroupCard({ group, onEdit, onDelete, onSeed }) {
  const [preview,  setPreview ] = useState(null);
  const [loadingP, setLoadingP] = useState(false);

  const loadPreview = useCallback(async () => {
    setLoadingP(true);
    try {
      const res = await api.get(`/pump-rotation-groups/${group._id}/preview`);
      setPreview(res.data);
    } catch { /* silent */ }
    finally { setLoadingP(false); }
  }, [group._id]);

  useEffect(() => { loadPreview(); }, [loadPreview]);

  const sorted = [...group.workers].sort((a,b) => a.position - b.position);

  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
      <div className="px-4 py-3 border-b border-gray-50 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Layers size={16} className="text-brand-600 shrink-0" />
          <span className="font-bold text-gray-900 text-sm">{group.name}</span>
          {!group.isActive && <span className="text-xs bg-gray-100 text-gray-500 px-2 py-0.5 rounded-full">Inactive</span>}
        </div>
        <div className="flex gap-2 shrink-0">
          <button onClick={() => onSeed(group)}
            className="text-xs font-semibold text-green-700 bg-green-50 px-3 py-1.5 rounded-lg hover:bg-green-100 transition-colors">
            Set Today
          </button>
          <button onClick={() => onEdit(group)}
            className="text-xs font-semibold text-brand-700 bg-brand-50 px-3 py-1.5 rounded-lg hover:bg-brand-100 transition-colors">
            Edit
          </button>
          <button onClick={() => onDelete(group)}
            className="p-1.5 rounded-lg hover:bg-red-50 text-gray-400 hover:text-red-500 transition-colors">
            <Trash2 size={14} />
          </button>
        </div>
      </div>

      {/* Rotation order list */}
      <div className="px-4 py-3 space-y-1.5">
        {sorted.map((w, i) => {
          const islandEntry = group.islands.find(isl => isl.position === w.position);
          return (
            <div key={String(w.workerId)} className="flex items-center gap-2 text-sm">
              <span className="text-xs text-gray-400 font-bold w-4 shrink-0">{i+1}</span>
              <span className="flex-1 font-medium text-gray-800 truncate">{w.workerName}</span>
              <ArrowRight size={12} className="text-gray-300 shrink-0" />
              <span className="text-xs text-gray-500 shrink-0">{islandEntry?.islandName || '—'}</span>
            </div>
          );
        })}
      </div>

      {/* Next shift preview */}
      {preview && (
        <div className="border-t border-gray-50 px-4 py-3">
          <p className="text-xs font-semibold text-gray-400 mb-2">
            {preview.seeded ? `NEXT SHIFT (after ${preview.lastDate})` : 'FIRST SHIFT (based on order)'}
          </p>
          <div className="space-y-1">
            {preview.projection.map((row, i) => (
              <div key={i} className="flex items-center gap-2 text-xs">
                <span className="flex-1 text-gray-700 font-medium truncate">{row.workerName}</span>
                <ArrowRight size={10} className="text-gray-300 shrink-0" />
                <span className="text-brand-600 font-semibold shrink-0">{row.islandName}</span>
              </div>
            ))}
          </div>
        </div>
      )}
      {loadingP && <div className="px-4 py-2 text-xs text-gray-400">Loading preview…</div>}
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────
export default function PumpRotation() {
  const notify             = useNotify();
  const { isSuperAdmin, can } = useAuth();
  const canManage          = isSuperAdmin() || can('manageBranches');

  const [branches,   setBranches  ] = useState([]);
  const [selBranch,  setSelBranch ] = useState('');
  const [groups,     setGroups    ] = useState([]);
  const [workers,    setWorkers   ] = useState([]);
  const [islands,    setIslands   ] = useState([]);
  const [loading,    setLoading   ] = useState(false);

  const [showCreate, setShowCreate] = useState(false);
  const [editGroup,  setEditGroup  ] = useState(null);
  const [seedGroup,  setSeedGroup  ] = useState(null);

  // Load branches
  useEffect(() => {
    api.get('/branches').then(r => {
      setBranches(r.data.data || []);
      if (r.data.data?.length) setSelBranch(String(r.data.data[0]._id));
    }).catch(() => {});
  }, []);

  const load = useCallback(async () => {
    if (!selBranch) return;
    setLoading(true);
    try {
      const [gRes, wRes, iRes] = await Promise.all([
        api.get(`/pump-rotation-groups?branchId=${selBranch}`),
        api.get(`/workers?branchId=${selBranch}&limit=200`),
        api.get(`/pump-islands?branchId=${selBranch}`),
      ]);
      setGroups(gRes.data.data  || []);
      setWorkers(wRes.data.data || []);
      setIslands(iRes.data.data || []);
    } catch (err) {
      notify(err.response?.data?.message || 'Failed to load', 'error');
    } finally {
      setLoading(false);
    }
  }, [selBranch, notify]);

  useEffect(() => { load(); }, [load]);

  const selBranchObj = branches.find(b => String(b._id) === selBranch);

  async function handleDelete(group) {
    if (!window.confirm(`Delete "${group.name}"? Workers will use standard rotation.`)) return;
    try {
      await api.delete(`/pump-rotation-groups/${group._id}`);
      notify('Group deleted');
      load();
    } catch (err) {
      notify(err.response?.data?.message || 'Delete failed', 'error');
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 pb-24">
      {/* Header */}
      <div className="bg-white border-b border-gray-100 px-4 py-4 sticky top-0 z-10">
        <div className="max-w-2xl mx-auto flex items-center justify-between gap-3">
          <div>
            <h1 className="font-black text-gray-900 text-lg">Pump Rotation</h1>
            <p className="text-xs text-gray-400 mt-0.5">Set who gets which island — system rotates automatically</p>
          </div>
          <div className="flex gap-2 items-center">
            <button onClick={load} className="p-2 rounded-xl hover:bg-gray-100 text-gray-500">
              <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
            </button>
            {canManage && (
              <button onClick={() => setShowCreate(true)}
                className="flex items-center gap-1.5 bg-brand-600 text-white text-sm font-bold px-4 py-2 rounded-xl active:scale-95 transition-all">
                <Plus size={14} /> New Group
              </button>
            )}
          </div>
        </div>
      </div>

      <div className="max-w-2xl mx-auto px-4 pt-4 space-y-4">
        {/* Branch selector */}
        <select value={selBranch} onChange={e => setSelBranch(e.target.value)}
          className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm bg-white focus:outline-none focus:border-brand-500">
          {branches.map(b => <option key={b._id} value={b._id}>{b.name}</option>)}
        </select>

        {/* How it works banner */}
        <div className="bg-brand-50 border border-brand-100 rounded-2xl px-4 py-3">
          <p className="text-xs font-semibold text-brand-800 mb-1">How it works</p>
          <p className="text-xs text-brand-700 leading-relaxed">
            1. Create a group — add pump attendants in rotation order and match them to islands.<br />
            2. Tap <strong>Set Today</strong> to assign who gets which island for the first shift.<br />
            3. From the next shift, the system automatically passes each island to the next worker in the group.
          </p>
        </div>

        {/* Groups */}
        {loading && <p className="text-center text-sm text-gray-400 py-8">Loading…</p>}
        {!loading && groups.length === 0 && (
          <div className="text-center py-12 text-gray-400">
            <Layers size={40} className="mx-auto mb-3 opacity-30" />
            <p className="font-medium">No rotation groups for this branch</p>
            <p className="text-sm mt-1">Tap <strong>New Group</strong> to get started</p>
          </div>
        )}
        {groups.map(g => (
          <GroupCard key={g._id} group={g}
            onEdit={setEditGroup}
            onDelete={handleDelete}
            onSeed={setSeedGroup}
          />
        ))}
      </div>

      {/* Modals */}
      {(showCreate || editGroup) && (
        <GroupModal
          branchId={selBranch}
          branchName={selBranchObj?.name || ''}
          group={editGroup}
          allWorkers={workers}
          allIslands={islands}
          onClose={() => { setShowCreate(false); setEditGroup(null); }}
          onSaved={() => { setShowCreate(false); setEditGroup(null); load(); }}
        />
      )}
      {seedGroup && (
        <SeedModal
          group={seedGroup}
          onClose={() => setSeedGroup(null)}
          onSeeded={load}
        />
      )}
    </div>
  );
}
