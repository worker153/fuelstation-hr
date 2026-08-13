/**
 * Salary Structures — define reusable pay grades with component breakdowns.
 * Each structure has earnings (Basic, Housing, Transport, etc.) and optional deductions.
 * Assign a structure to workers; their salary.monthly syncs automatically.
 */
import { useState, useEffect, useCallback } from 'react';
import {
  DollarSign, Plus, Edit2, Trash2, Users, X, Check, Loader,
  ChevronDown, ChevronUp, RotateCcw, Minus, BadgeCheck,
} from 'lucide-react';
import api from '../utils/api';
import { useNotify } from '../context/NotificationContext';

const fmt = (n) => Number(n || 0).toLocaleString('en-NG', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const DEFAULT_COMPONENTS = [
  { name: 'Basic Salary',        amount: 0, type: 'earning' },
  { name: 'Housing Allowance',   amount: 0, type: 'earning' },
  { name: 'Transport Allowance', amount: 0, type: 'earning' },
];

// ── Structure editor modal ─────────────────────────────────────────────────────
function StructureModal({ structure, onSave, onClose }) {
  const notify  = useNotify();
  const [name,   setName  ] = useState(structure?.name        || '');
  const [desc,   setDesc  ] = useState(structure?.description || '');
  const [comps,  setComps ] = useState(
    structure?.components?.length
      ? structure.components.map(c => ({ ...c }))
      : DEFAULT_COMPONENTS.map(c => ({ ...c }))
  );
  const [saving, setSaving] = useState(false);

  const gross = comps.filter(c => c.type === 'earning').reduce((s, c) => s + (Number(c.amount) || 0), 0);
  const totalDeductions = comps.filter(c => c.type === 'deduction').reduce((s, c) => s + (Number(c.amount) || 0), 0);
  const netTotal = gross - totalDeductions;

  const updateComp = (idx, field, val) =>
    setComps(prev => prev.map((c, i) => i === idx ? { ...c, [field]: val } : c));

  const removeComp = (idx) => setComps(prev => prev.filter((_, i) => i !== idx));

  const addComp = (type) =>
    setComps(prev => [...prev, { name: '', amount: 0, type }]);

  const handleSave = async () => {
    if (!name.trim()) return notify('Structure name is required', 'error');
    const filled = comps.filter(c => c.name.trim());
    if (!filled.length) return notify('Add at least one component', 'error');
    setSaving(true);
    try {
      const payload = { name, description: desc, components: filled.map(c => ({ ...c, amount: Number(c.amount) || 0 })) };
      const res = structure
        ? await api.put(`/salary-structures/${structure._id}`, payload)
        : await api.post('/salary-structures', payload);
      onSave(res.data.data);
      notify(structure ? 'Structure updated ✓' : 'Structure created ✓');
    } catch (e) {
      notify(e.response?.data?.message || 'Save failed', 'error');
    } finally { setSaving(false); }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center p-4 pt-8 bg-black/40 overflow-y-auto">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg mb-10">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <h2 className="font-bold text-gray-800 text-lg">{structure ? 'Edit Structure' : 'New Salary Structure'}</h2>
          <button onClick={onClose} className="p-1.5 rounded-full hover:bg-gray-100"><X size={18} /></button>
        </div>

        <div className="p-6 space-y-5">
          {/* Name + description */}
          <div>
            <label className="label">Structure Name</label>
            <input className="input" placeholder="e.g. Pump Attendant Grade A, Supervisor Level 1"
              value={name} onChange={e => setName(e.target.value)} />
          </div>
          <div>
            <label className="label">Description <span className="text-gray-400 font-normal">(optional)</span></label>
            <input className="input" placeholder="e.g. For all senior pump attendants at Sapele Rd"
              value={desc} onChange={e => setDesc(e.target.value)} />
          </div>

          {/* Components */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="label mb-0">Pay Components</label>
            </div>

            {/* Earnings */}
            <div className="space-y-2 mb-3">
              <p className="text-xs font-semibold text-green-700 uppercase tracking-wide">Earnings</p>
              {comps.map((c, i) => c.type === 'earning' && (
                <div key={i} className="flex items-center gap-2">
                  <input className="input flex-1 text-sm" placeholder="Component name"
                    value={c.name} onChange={e => updateComp(i, 'name', e.target.value)} />
                  <div className="relative w-36 shrink-0">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">₦</span>
                    <input type="number" min="0" step="500"
                      className="input pl-6 text-sm w-full"
                      value={c.amount} onChange={e => updateComp(i, 'amount', e.target.value)} />
                  </div>
                  <button onClick={() => removeComp(i)}
                    className="p-1.5 rounded-lg text-gray-400 hover:text-red-500 hover:bg-red-50 transition-colors shrink-0">
                    <Minus size={14} />
                  </button>
                </div>
              ))}
              <button onClick={() => addComp('earning')}
                className="flex items-center gap-1.5 text-xs text-green-600 hover:text-green-700 font-medium">
                <Plus size={13} /> Add earning
              </button>
            </div>

            {/* Deductions */}
            <div className="space-y-2">
              <p className="text-xs font-semibold text-red-600 uppercase tracking-wide">Deductions <span className="text-gray-400 font-normal normal-case">(optional)</span></p>
              {comps.map((c, i) => c.type === 'deduction' && (
                <div key={i} className="flex items-center gap-2">
                  <input className="input flex-1 text-sm" placeholder="e.g. Pension, Tax"
                    value={c.name} onChange={e => updateComp(i, 'name', e.target.value)} />
                  <div className="relative w-36 shrink-0">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">₦</span>
                    <input type="number" min="0" step="500"
                      className="input pl-6 text-sm w-full"
                      value={c.amount} onChange={e => updateComp(i, 'amount', e.target.value)} />
                  </div>
                  <button onClick={() => removeComp(i)}
                    className="p-1.5 rounded-lg text-gray-400 hover:text-red-500 hover:bg-red-50 transition-colors shrink-0">
                    <Minus size={14} />
                  </button>
                </div>
              ))}
              <button onClick={() => addComp('deduction')}
                className="flex items-center gap-1.5 text-xs text-red-500 hover:text-red-600 font-medium">
                <Plus size={13} /> Add deduction
              </button>
            </div>
          </div>

          {/* Totals summary */}
          <div className="bg-gray-50 rounded-xl px-4 py-3 space-y-1.5 border border-gray-100">
            <div className="flex justify-between text-sm">
              <span className="text-gray-500">Total Earnings</span>
              <span className="font-semibold text-green-700">₦{fmt(gross)}</span>
            </div>
            {totalDeductions > 0 && (
              <div className="flex justify-between text-sm">
                <span className="text-gray-500">Total Deductions</span>
                <span className="font-semibold text-red-600">− ₦{fmt(totalDeductions)}</span>
              </div>
            )}
            <div className="flex justify-between text-base font-bold pt-1 border-t border-gray-200">
              <span className="text-gray-700">Net Monthly Pay</span>
              <span className="text-brand-700">₦{fmt(netTotal)}</span>
            </div>
          </div>
        </div>

        <div className="flex items-center justify-between px-6 py-4 border-t border-gray-100 bg-gray-50 rounded-b-2xl">
          <button onClick={onClose} className="btn-secondary">Cancel</button>
          <button onClick={handleSave} disabled={saving} className="btn-primary flex items-center gap-2">
            {saving ? <Loader size={14} className="animate-spin" /> : <Check size={14} />}
            {structure ? 'Save Changes' : 'Create Structure'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Assign workers modal ───────────────────────────────────────────────────────
function AssignModal({ structure, onClose, onDone }) {
  const notify  = useNotify();
  const [workers,  setWorkers ] = useState([]);
  const [selected, setSelected] = useState([]);
  const [loading,  setLoading ] = useState(true);
  const [saving,   setSaving  ] = useState(false);
  const [search,   setSearch  ] = useState('');

  useEffect(() => {
    api.get('/workers?all=1&limit=1000')
      .then(r => {
        const all = r.data.data?.workers || r.data.data || [];
        setWorkers(all.filter(w => w.employmentStatus === 'active' || !w.employmentStatus));
      })
      .catch(() => notify('Failed to load workers', 'error'))
      .finally(() => setLoading(false));
  }, []);

  const toggle = (id) =>
    setSelected(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);

  const filtered = workers.filter(w =>
    !search || w.fullName?.toLowerCase().includes(search.toLowerCase()) || w.role?.toLowerCase().includes(search.toLowerCase())
  );

  const handleAssign = async () => {
    if (!selected.length) return notify('Select at least one worker', 'error');
    setSaving(true);
    try {
      await api.post(`/salary-structures/${structure._id}/assign`, { workerIds: selected });
      notify(`${selected.length} worker(s) assigned to ${structure.name} ✓`);
      onDone();
    } catch (e) {
      notify(e.response?.data?.message || 'Failed', 'error');
    } finally { setSaving(false); }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md max-h-[85vh] flex flex-col">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 shrink-0">
          <div>
            <p className="font-bold text-gray-800">Assign Workers</p>
            <p className="text-xs text-gray-400 mt-0.5">to {structure.name}</p>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-full hover:bg-gray-100"><X size={16} /></button>
        </div>

        <div className="px-4 py-3 border-b border-gray-100 shrink-0">
          <input className="input text-sm" placeholder="Search by name or role…"
            value={search} onChange={e => setSearch(e.target.value)} />
        </div>

        <div className="overflow-y-auto flex-1">
          {loading ? (
            <div className="flex items-center justify-center py-10">
              <Loader size={20} className="animate-spin text-gray-400" />
            </div>
          ) : filtered.length === 0 ? (
            <p className="text-center text-gray-400 py-8 text-sm">No workers found</p>
          ) : (
            <div className="divide-y divide-gray-50">
              {filtered.map(w => {
                const isSelected    = selected.includes(String(w._id));
                const currentStruct = w.salaryStructureId;
                return (
                  <label key={w._id} className={`flex items-center gap-3 px-4 py-3 cursor-pointer hover:bg-gray-50 ${isSelected ? 'bg-brand-50/50' : ''}`}>
                    <input type="checkbox" checked={isSelected} onChange={() => toggle(String(w._id))}
                      className="w-4 h-4 rounded text-brand-600 shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-800 truncate">{w.fullName}</p>
                      <p className="text-xs text-gray-400">{w.role}</p>
                    </div>
                    {currentStruct && String(currentStruct) === String(structure._id) && (
                      <BadgeCheck size={14} className="text-brand-500 shrink-0" />
                    )}
                    {w.salary?.monthly > 0 && (
                      <span className="text-xs text-gray-400 shrink-0">₦{fmt(w.salary.monthly)}</span>
                    )}
                  </label>
                );
              })}
            </div>
          )}
        </div>

        <div className="px-4 py-3 border-t border-gray-100 flex items-center justify-between shrink-0">
          <p className="text-xs text-gray-400">{selected.length} selected</p>
          <div className="flex gap-2">
            <button onClick={onClose} className="btn-secondary text-sm">Cancel</button>
            <button onClick={handleAssign} disabled={saving || !selected.length}
              className="btn-primary text-sm flex items-center gap-1.5">
              {saving ? <Loader size={13} className="animate-spin" /> : <Check size={13} />}
              Assign
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Workers on structure panel ─────────────────────────────────────────────────
function WorkersPanel({ structureId, structureName, onClose, onUnassign }) {
  const notify  = useNotify();
  const [data,    setData   ] = useState(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(() => {
    setLoading(true);
    api.get(`/salary-structures/${structureId}`)
      .then(r => setData(r.data.data))
      .catch(() => notify('Failed to load', 'error'))
      .finally(() => setLoading(false));
  }, [structureId]);

  useEffect(() => { load(); }, [load]);

  const handleUnassign = async (workerId, workerName) => {
    if (!confirm(`Remove ${workerName} from this structure?`)) return;
    try {
      await api.delete(`/salary-structures/workers/${workerId}/unassign`);
      notify(`${workerName} unassigned`);
      onUnassign();
      load();
    } catch { notify('Failed', 'error'); }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md max-h-[80vh] flex flex-col">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 shrink-0">
          <div>
            <p className="font-bold text-gray-800">Assigned Workers</p>
            <p className="text-xs text-gray-400 mt-0.5">{structureName}</p>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-full hover:bg-gray-100"><X size={16} /></button>
        </div>
        <div className="overflow-y-auto flex-1">
          {loading ? (
            <div className="flex items-center justify-center py-10">
              <Loader size={20} className="animate-spin text-gray-400" />
            </div>
          ) : !data?.workers?.length ? (
            <p className="text-center text-gray-400 py-8 text-sm">No workers assigned yet</p>
          ) : (
            <div className="divide-y divide-gray-50">
              {data.workers.map(w => (
                <div key={w._id} className="flex items-center gap-3 px-4 py-3">
                  <div className="w-9 h-9 rounded-xl bg-brand-50 flex items-center justify-center text-brand-700 font-bold shrink-0 text-sm">
                    {w.fullName?.[0]}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-gray-800 text-sm truncate">{w.fullName}</p>
                    <p className="text-xs text-gray-400">{w.role}</p>
                  </div>
                  <button onClick={() => handleUnassign(String(w._id), w.fullName)}
                    className="text-xs text-red-400 hover:text-red-600 hover:underline shrink-0">Remove</button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Main page ──────────────────────────────────────────────────────────────────
export default function SalaryStructures() {
  const notify = useNotify();
  const [structures,  setStructures ] = useState([]);
  const [loading,     setLoading    ] = useState(true);
  const [modal,       setModal      ] = useState(null); // null | 'create' | structure
  const [assignModal, setAssignModal] = useState(null); // structure
  const [workerPanel, setWorkerPanel] = useState(null); // structure
  const [delConfirm,  setDelConfirm ] = useState(null);
  const [expanded,    setExpanded   ] = useState(null); // expanded structure id

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await api.get('/salary-structures');
      setStructures(data.data);
    } catch { notify('Failed to load structures', 'error'); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleSave = (saved) => {
    setStructures(prev => {
      const idx = prev.findIndex(s => s._id === saved._id);
      return idx >= 0 ? prev.map(s => s._id === saved._id ? { ...s, ...saved } : s) : [saved, ...prev];
    });
    setModal(null);
  };

  const handleDelete = async (s) => {
    try {
      await api.delete(`/salary-structures/${s._id}`);
      setStructures(prev => prev.filter(x => x._id !== s._id));
      setDelConfirm(null);
      notify('Structure deleted');
    } catch (e) { notify(e.response?.data?.message || 'Delete failed', 'error'); }
  };

  const totalGross = (s) =>
    (s.components || []).filter(c => c.type === 'earning').reduce((a, c) => a + c.amount, 0);

  const totalNet = (s) => {
    const earn = (s.components || []).filter(c => c.type === 'earning').reduce((a, c) => a + c.amount, 0);
    const ded  = (s.components || []).filter(c => c.type === 'deduction').reduce((a, c) => a + c.amount, 0);
    return earn - ded;
  };

  return (
    <div className="p-4 sm:p-6 max-w-4xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-black text-gray-900 flex items-center gap-2">
            <DollarSign size={24} className="text-brand-600" /> Salary Structures
          </h1>
          <p className="text-sm text-gray-500 mt-0.5">Define pay grades and assign them to workers</p>
        </div>
        <button onClick={() => setModal('create')} className="btn-primary flex items-center gap-2 text-sm">
          <Plus size={16} /> New Structure
        </button>
      </div>

      {/* Stats */}
      {!loading && (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-6">
          <div className="bg-white rounded-xl border border-gray-100 p-3.5 text-center shadow-sm">
            <p className="text-2xl font-black text-gray-700">{structures.length}</p>
            <p className="text-xs text-gray-500 mt-0.5">Structures</p>
          </div>
          <div className="bg-white rounded-xl border border-gray-100 p-3.5 text-center shadow-sm">
            <p className="text-2xl font-black text-brand-600">{structures.reduce((s, x) => s + (x.workerCount || 0), 0)}</p>
            <p className="text-xs text-gray-500 mt-0.5">Workers Assigned</p>
          </div>
          <div className="bg-white rounded-xl border border-gray-100 p-3.5 text-center shadow-sm col-span-2 sm:col-span-1">
            <p className="text-2xl font-black text-green-700">
              ₦{fmt(structures.length ? Math.min(...structures.map(s => totalGross(s))) : 0)}
              {structures.length > 1 && <span className="text-gray-400 text-sm font-medium"> — ₦{fmt(Math.max(...structures.map(s => totalGross(s))))}</span>}
            </p>
            <p className="text-xs text-gray-500 mt-0.5">Salary Range</p>
          </div>
        </div>
      )}

      {/* List */}
      {loading ? (
        <div className="text-center py-16 text-gray-400">
          <RotateCcw size={28} className="animate-spin mx-auto mb-3" />
          <p className="text-sm">Loading…</p>
        </div>
      ) : structures.length === 0 ? (
        <div className="text-center py-16 bg-white rounded-2xl border border-dashed border-gray-200">
          <DollarSign size={36} className="text-gray-300 mx-auto mb-3" />
          <p className="font-semibold text-gray-500">No salary structures yet</p>
          <p className="text-sm text-gray-400 mt-1 mb-4">Create your first pay grade — e.g. Pump Attendant Grade A</p>
          <button onClick={() => setModal('create')} className="btn-primary text-sm">
            <Plus size={14} className="inline mr-1" /> Create Structure
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          {structures.map(s => {
            const isExpanded = expanded === s._id;
            const earnings   = (s.components || []).filter(c => c.type === 'earning');
            const deductions = (s.components || []).filter(c => c.type === 'deduction');

            return (
              <div key={s._id} className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
                {/* Card header */}
                <div className="flex items-center gap-4 p-4 sm:p-5">
                  {/* Grade icon */}
                  <div className="w-12 h-12 rounded-xl bg-brand-50 flex items-center justify-center shrink-0">
                    <DollarSign size={22} className="text-brand-600" />
                  </div>

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-2 mb-0.5">
                      <h3 className="font-bold text-gray-900">{s.name}</h3>
                      {s.workerCount > 0 && (
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-brand-100 text-brand-700">
                          {s.workerCount} worker{s.workerCount !== 1 ? 's' : ''}
                        </span>
                      )}
                    </div>
                    {s.description && <p className="text-xs text-gray-400 mb-1">{s.description}</p>}
                    <div className="flex flex-wrap gap-3 text-xs text-gray-500">
                      <span className="text-green-700 font-semibold">Gross: ₦{fmt(totalGross(s))}</span>
                      {deductions.length > 0 && (
                        <span className="text-brand-700 font-semibold">Net: ₦{fmt(totalNet(s))}</span>
                      )}
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-1 shrink-0">
                    <button onClick={() => setExpanded(isExpanded ? null : s._id)}
                      title="View breakdown"
                      className="p-2 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-gray-600 transition-colors">
                      {isExpanded ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
                    </button>
                    <button onClick={() => setWorkerPanel(s)} title="View workers"
                      className="p-2 rounded-lg hover:bg-brand-50 text-gray-400 hover:text-brand-600 transition-colors">
                      <Users size={15} />
                    </button>
                    <button onClick={() => setAssignModal(s)} title="Assign workers"
                      className="p-2 rounded-lg hover:bg-green-50 text-gray-400 hover:text-green-600 transition-colors">
                      <BadgeCheck size={15} />
                    </button>
                    <button onClick={() => setModal(s)} title="Edit"
                      className="p-2 rounded-lg hover:bg-brand-50 text-gray-400 hover:text-brand-600 transition-colors">
                      <Edit2 size={15} />
                    </button>
                    <button onClick={() => setDelConfirm(s)} title="Delete"
                      className="p-2 rounded-lg hover:bg-red-50 text-gray-400 hover:text-red-500 transition-colors">
                      <Trash2 size={15} />
                    </button>
                  </div>
                </div>

                {/* Expanded breakdown */}
                {isExpanded && (
                  <div className="px-5 pb-5 border-t border-gray-50">
                    <div className="mt-4 overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="text-xs text-gray-400 uppercase tracking-wide">
                            <th className="text-left pb-2 font-semibold">Component</th>
                            <th className="text-right pb-2 font-semibold">Amount</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-50">
                          {earnings.map((c, i) => (
                            <tr key={i}>
                              <td className="py-2 text-gray-700">{c.name}</td>
                              <td className="py-2 text-right font-medium text-green-700">₦{fmt(c.amount)}</td>
                            </tr>
                          ))}
                          {earnings.length > 0 && (
                            <tr className="border-t border-gray-200">
                              <td className="py-2 font-bold text-gray-800">Total Earnings</td>
                              <td className="py-2 text-right font-bold text-green-700">₦{fmt(totalGross(s))}</td>
                            </tr>
                          )}
                          {deductions.map((c, i) => (
                            <tr key={`d${i}`}>
                              <td className="py-2 text-red-600">{c.name}</td>
                              <td className="py-2 text-right font-medium text-red-600">− ₦{fmt(c.amount)}</td>
                            </tr>
                          ))}
                          {deductions.length > 0 && (
                            <tr className="border-t-2 border-brand-200 bg-brand-50/40">
                              <td className="py-2 font-black text-gray-900 pl-2 rounded-bl">Net Monthly Pay</td>
                              <td className="py-2 text-right font-black text-brand-700 pr-2 rounded-br">₦{fmt(totalNet(s))}</td>
                            </tr>
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Modals */}
      {modal && (
        <StructureModal
          structure={modal === 'create' ? null : modal}
          onSave={handleSave}
          onClose={() => setModal(null)}
        />
      )}
      {assignModal && (
        <AssignModal
          structure={assignModal}
          onClose={() => setAssignModal(null)}
          onDone={() => { setAssignModal(null); load(); }}
        />
      )}
      {workerPanel && (
        <WorkersPanel
          structureId={workerPanel._id}
          structureName={workerPanel.name}
          onClose={() => setWorkerPanel(null)}
          onUnassign={load}
        />
      )}
      {delConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40">
          <div className="bg-white rounded-2xl shadow-2xl p-6 max-w-sm w-full">
            <p className="font-bold text-gray-800 text-lg mb-1">Delete structure?</p>
            <p className="text-sm text-gray-500 mb-1">"{delConfirm.name}"</p>
            {delConfirm.workerCount > 0
              ? <p className="text-sm text-red-500 mb-5">{delConfirm.workerCount} worker(s) are assigned. Reassign them first before deleting.</p>
              : <p className="text-sm text-gray-400 mb-5">This cannot be undone.</p>
            }
            <div className="flex gap-3">
              <button onClick={() => setDelConfirm(null)} className="flex-1 btn-secondary">Cancel</button>
              {!delConfirm.workerCount && (
                <button onClick={() => handleDelete(delConfirm)}
                  className="flex-1 bg-red-500 hover:bg-red-600 text-white font-semibold rounded-xl py-2.5 transition-colors">Delete</button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
