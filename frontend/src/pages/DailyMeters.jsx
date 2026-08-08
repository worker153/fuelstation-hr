import { useState, useEffect, useCallback } from 'react';
import {
  Gauge, ChevronDown, Save, Loader, CheckCircle, Clock, AlertCircle,
  Droplets, User, Calendar, Building2, X, RefreshCw, BarChart2,
  ChevronLeft, ChevronRight, Wrench, PackageX,
} from 'lucide-react';
import api from '../utils/api';
import { useNotify } from '../context/NotificationContext';
import { useAuth } from '../context/AuthContext';

const MONTHS = ['January','February','March','April','May','June',
                'July','August','September','October','November','December'];

const todayStr = () => new Date().toISOString().split('T')[0];

function fmt(n) {
  if (n == null) return '—';
  return Number(n).toLocaleString('en-NG', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function fmtL(n) {
  if (n == null) return '—';
  return `${Number(n).toLocaleString('en-NG', { maximumFractionDigits: 1 })}L`;
}

const ISLAND_STATUS = {
  active:       { label: 'Active',        cls: 'bg-green-100  text-green-700',  icon: CheckCircle },
  out_of_stock: { label: 'Out of Stock',  cls: 'bg-amber-100  text-amber-700',  icon: PackageX    },
  faulty:       { label: 'Faulty',        cls: 'bg-red-100    text-red-700',    icon: Wrench      },
  inactive:     { label: 'Inactive',      cls: 'bg-gray-100   text-gray-500',   icon: X           },
};

// ─── Opening Meter Entry Modal ────────────────────────────────────────────────
function OpeningModal({ island, date, onClose, onSaved }) {
  const notify  = useNotify();
  const [meter, setMeter]   = useState('');
  const [notes, setNotes]   = useState('');
  const [saving, setSaving] = useState(false);

  const existing = island.log?.openingMeter;

  const submit = async (e) => {
    e.preventDefault();
    if (meter === '') return notify('Enter the opening meter reading', 'error');
    setSaving(true);
    try {
      const { data } = await api.post('/meter-logs', {
        branchId:     island.islandId ? undefined : island.branchId,
        date,
        islandId:     island.islandId,
        openingMeter: Number(meter),
        notes,
      });
      notify('Opening meter saved ✓');
      onSaved(data.data);
    } catch (err) {
      notify(err.response?.data?.message || 'Failed to save', 'error');
    } finally { setSaving(false); }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="bg-white rounded-2xl w-full max-w-sm shadow-2xl">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <div>
            <p className="font-bold text-gray-900">{island.islandName}</p>
            <p className="text-xs text-gray-400">Enter opening meter reading</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X size={18} /></button>
        </div>
        <form onSubmit={submit} className="px-5 py-5 space-y-4">
          {existing != null && (
            <div className="text-xs bg-amber-50 border border-amber-200 rounded-xl px-3 py-2 text-amber-700">
              Current opening: <strong>{fmt(existing)}</strong> — submitting will overwrite
            </div>
          )}
          <div>
            <label className="label">Opening Meter Reading</label>
            <input
              type="number" step="0.01" className="input" autoFocus
              placeholder="e.g. 12450.30"
              value={meter} onChange={e => setMeter(e.target.value)} required
            />
          </div>
          <div>
            <label className="label">Notes (optional)</label>
            <input type="text" className="input" placeholder="Any remarks…" value={notes} onChange={e => setNotes(e.target.value)} />
          </div>
          <div className="flex gap-3 pt-1">
            <button type="submit" disabled={saving}
              className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl bg-brand-600 text-white font-medium text-sm hover:bg-brand-700">
              {saving ? <Loader size={15} className="animate-spin" /> : <><Save size={14} /> Save Opening</>}
            </button>
            <button type="button" onClick={onClose} className="btn-secondary">Cancel</button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── Closing Meter Entry Modal ────────────────────────────────────────────────
function ClosingModal({ island, date, onClose, onSaved }) {
  const notify  = useNotify();
  const [meter, setMeter]   = useState('');
  const [notes, setNotes]   = useState(island.log?.notes || '');
  const [saving, setSaving] = useState(false);

  const opening = island.log?.openingMeter;
  const litres  = meter !== '' && opening != null
    ? Math.max(0, Number(meter) - opening) : null;

  const submit = async (e) => {
    e.preventDefault();
    if (!island.log?._id) return notify('Save opening meter first', 'error');
    if (meter === '') return notify('Enter the closing meter reading', 'error');
    setSaving(true);
    try {
      const { data } = await api.put(`/meter-logs/${island.log._id}/close`, {
        closingMeter: Number(meter), notes,
      });
      notify('Closing meter saved ✓');
      onSaved(data.data);
    } catch (err) {
      notify(err.response?.data?.message || 'Failed to save', 'error');
    } finally { setSaving(false); }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="bg-white rounded-2xl w-full max-w-sm shadow-2xl">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <div>
            <p className="font-bold text-gray-900">{island.islandName}</p>
            <p className="text-xs text-gray-400">Enter closing meter reading</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X size={18} /></button>
        </div>
        <form onSubmit={submit} className="px-5 py-5 space-y-4">
          <div className="bg-gray-50 rounded-xl px-4 py-3 flex items-center justify-between">
            <div>
              <p className="text-xs text-gray-400">Opening meter</p>
              <p className="font-bold text-gray-900">{fmt(opening)}</p>
            </div>
            {island.worker && (
              <div className="text-right">
                <p className="text-xs text-gray-400">Worker</p>
                <p className="text-sm font-medium text-gray-700">{island.worker.workerName}</p>
              </div>
            )}
          </div>
          <div>
            <label className="label">Closing Meter Reading</label>
            <input
              type="number" step="0.01" className="input" autoFocus
              placeholder="e.g. 13200.50"
              value={meter} onChange={e => setMeter(e.target.value)} required
            />
          </div>
          {litres != null && (
            <div className="bg-brand-50 border border-brand-200 rounded-xl px-4 py-3 flex items-center justify-between">
              <p className="text-sm font-semibold text-brand-700">Litres Sold</p>
              <p className="text-xl font-bold text-brand-700">{fmtL(litres)}</p>
            </div>
          )}
          <div>
            <label className="label">Notes (optional)</label>
            <input type="text" className="input" value={notes} onChange={e => setNotes(e.target.value)} />
          </div>
          <div className="flex gap-3 pt-1">
            <button type="submit" disabled={saving}
              className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl bg-green-600 text-white font-medium text-sm hover:bg-green-700">
              {saving ? <Loader size={15} className="animate-spin" /> : <><CheckCircle size={14} /> Close Shift</>}
            </button>
            <button type="button" onClick={onClose} className="btn-secondary">Cancel</button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── Island Card ──────────────────────────────────────────────────────────────
function IslandCard({ island, onOpenOpening, onOpenClosing }) {
  const log    = island.log;
  const worker = island.worker;
  const st     = ISLAND_STATUS[island.islandStatus] || ISLAND_STATUS.active;
  const StIcon = st.icon;

  const hasOpening = log?.openingMeter != null;
  const hasClosing = log?.closingMeter != null;
  const isClosed   = log?.status === 'closed';

  return (
    <div className={`card p-4 space-y-3 ${isClosed ? 'opacity-80' : ''}`}>
      {/* Header */}
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="font-bold text-gray-900">{island.islandName}</p>
          {worker
            ? <div className="flex items-center gap-1.5 mt-0.5"><User size={11} className="text-green-500" /><span className="text-xs text-green-700 font-medium">{worker.workerName}</span></div>
            : <span className="text-xs text-gray-400">No worker assigned yet</span>
          }
        </div>
        <span className={`flex items-center gap-1 text-xs px-2 py-0.5 rounded-full font-medium ${st.cls}`}>
          <StIcon size={10} /> {st.label}
        </span>
      </div>

      {/* Meter readings */}
      <div className="grid grid-cols-3 gap-2 text-center">
        <div className="bg-gray-50 rounded-xl py-2">
          <p className="text-[10px] text-gray-400">Opening</p>
          <p className={`text-sm font-bold ${hasOpening ? 'text-gray-800' : 'text-gray-300'}`}>{fmt(log?.openingMeter)}</p>
        </div>
        <div className="bg-gray-50 rounded-xl py-2">
          <p className="text-[10px] text-gray-400">Closing</p>
          <p className={`text-sm font-bold ${hasClosing ? 'text-gray-800' : 'text-gray-300'}`}>{fmt(log?.closingMeter)}</p>
        </div>
        <div className={`rounded-xl py-2 ${log?.litresSold != null ? 'bg-brand-50' : 'bg-gray-50'}`}>
          <p className="text-[10px] text-gray-400">Sold</p>
          <p className={`text-sm font-bold ${log?.litresSold != null ? 'text-brand-700' : 'text-gray-300'}`}>{fmtL(log?.litresSold)}</p>
        </div>
      </div>

      {/* Actions */}
      {!isClosed && (
        <div className="flex gap-2">
          <button
            onClick={() => onOpenOpening(island)}
            className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl border border-gray-200 bg-white text-gray-700 text-xs font-medium hover:bg-gray-50 transition-colors">
            <Gauge size={13} /> {hasOpening ? 'Edit Opening' : 'Set Opening'}
          </button>
          {hasOpening && (
            <button
              onClick={() => onOpenClosing(island)}
              className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl bg-green-600 text-white text-xs font-medium hover:bg-green-700 transition-colors">
              <CheckCircle size={13} /> Close Shift
            </button>
          )}
        </div>
      )}
      {isClosed && (
        <div className="flex items-center justify-center gap-1.5 py-2 rounded-xl bg-green-50 border border-green-200">
          <CheckCircle size={13} className="text-green-600" />
          <span className="text-xs font-medium text-green-700">Shift closed</span>
        </div>
      )}
    </div>
  );
}

// ─── Monthly Report View ──────────────────────────────────────────────────────
function ReportView({ branchId, branchName }) {
  const now  = new Date();
  const [month,   setMonth  ] = useState(now.getMonth() + 1);
  const [year,    setYear   ] = useState(now.getFullYear());
  const [data,    setData   ] = useState(null);
  const [loading, setLoading] = useState(false);
  const notify = useNotify();

  const load = useCallback(async () => {
    if (!branchId) return;
    setLoading(true);
    try {
      const { data: r } = await api.get('/meter-logs/report', { params: { branchId, month, year } });
      setData(r.data);
    } catch { notify('Failed to load report', 'error'); }
    finally { setLoading(false); }
  }, [branchId, month, year]);

  useEffect(() => { load(); }, [load]);

  return (
    <div className="space-y-4">
      {/* Filter bar */}
      <div className="card p-4 flex items-center gap-3 flex-wrap">
        <div>
          <label className="label">Month</label>
          <select className="input" value={month} onChange={e => setMonth(Number(e.target.value))}>
            {MONTHS.map((m, i) => <option key={m} value={i+1}>{m}</option>)}
          </select>
        </div>
        <div>
          <label className="label">Year</label>
          <select className="input" value={year} onChange={e => setYear(Number(e.target.value))}>
            {[now.getFullYear(), now.getFullYear()-1].map(y => <option key={y} value={y}>{y}</option>)}
          </select>
        </div>
        <button onClick={load} className="btn-secondary mt-4"><RefreshCw size={14} /></button>
      </div>

      {loading && <div className="text-center py-8"><Loader size={24} className="animate-spin text-brand-600 mx-auto" /></div>}

      {!loading && data && (
        <>
          {/* Summary cards */}
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            <div className="card p-4 text-center">
              <p className="text-xs text-gray-400">Total Litres</p>
              <p className="text-2xl font-bold text-brand-700 mt-1">{fmtL(data.totalLitres)}</p>
            </div>
            <div className="card p-4 text-center">
              <p className="text-xs text-gray-400">Islands Active</p>
              <p className="text-2xl font-bold text-gray-800 mt-1">{data.byIsland.length}</p>
            </div>
            <div className="card p-4 text-center">
              <p className="text-xs text-gray-400">Records</p>
              <p className="text-2xl font-bold text-gray-800 mt-1">{data.logs.length}</p>
            </div>
          </div>

          {/* By island */}
          {data.byIsland.length > 0 && (
            <div className="card overflow-hidden">
              <div className="px-4 py-3 border-b border-gray-100">
                <p className="font-semibold text-gray-800 text-sm">Per Island</p>
              </div>
              <div className="divide-y divide-gray-50">
                {data.byIsland.map((island, i) => (
                  <div key={i} className="flex items-center justify-between px-4 py-3">
                    <div>
                      <p className="text-sm font-medium text-gray-800">{island.islandName}</p>
                      <p className="text-xs text-gray-400">{island.days} day{island.days !== 1 ? 's' : ''}</p>
                    </div>
                    <p className="font-bold text-brand-700">{fmtL(island.totalLitres)}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* By worker */}
          {data.byWorker.length > 0 && (
            <div className="card overflow-hidden">
              <div className="px-4 py-3 border-b border-gray-100">
                <p className="font-semibold text-gray-800 text-sm">Per Worker</p>
              </div>
              <div className="divide-y divide-gray-50">
                {data.byWorker.sort((a,b) => b.totalLitres - a.totalLitres).map((w, i) => (
                  <div key={i} className="flex items-center justify-between px-4 py-3">
                    <div>
                      <p className="text-sm font-medium text-gray-800">{w.workerName}</p>
                      <p className="text-xs text-gray-400">{w.days} day{w.days !== 1 ? 's' : ''}</p>
                    </div>
                    <p className="font-bold text-brand-700">{fmtL(w.totalLitres)}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Daily log table */}
          {data.logs.length > 0 && (
            <div className="card overflow-hidden">
              <div className="px-4 py-3 border-b border-gray-100">
                <p className="font-semibold text-gray-800 text-sm">Daily Records</p>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-gray-50 border-b border-gray-100">
                      <th className="py-2 px-3 text-left text-xs font-semibold text-gray-400">Date</th>
                      <th className="py-2 px-3 text-left text-xs font-semibold text-gray-400">Island</th>
                      <th className="py-2 px-3 text-left text-xs font-semibold text-gray-400">Worker</th>
                      <th className="py-2 px-3 text-right text-xs font-semibold text-gray-400">Opening</th>
                      <th className="py-2 px-3 text-right text-xs font-semibold text-gray-400">Closing</th>
                      <th className="py-2 px-3 text-right text-xs font-semibold text-brand-500">Litres</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.logs.map(l => (
                      <tr key={l._id} className="border-b border-gray-50 hover:bg-gray-50/50">
                        <td className="py-2 px-3 text-gray-600 text-xs tabular-nums">{l.date}</td>
                        <td className="py-2 px-3 font-medium text-gray-800">{l.islandName}</td>
                        <td className="py-2 px-3 text-gray-600 text-xs">{l.workerName || '—'}</td>
                        <td className="py-2 px-3 text-right tabular-nums text-gray-600">{fmt(l.openingMeter)}</td>
                        <td className="py-2 px-3 text-right tabular-nums text-gray-600">{fmt(l.closingMeter)}</td>
                        <td className="py-2 px-3 text-right tabular-nums font-bold text-brand-700">{fmtL(l.litresSold)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {data.logs.length === 0 && (
            <div className="card p-10 text-center text-gray-400">
              <Droplets size={32} className="mx-auto mb-2 text-gray-300" />
              <p>No meter records for {MONTHS[month-1]} {year}</p>
            </div>
          )}
        </>
      )}
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function DailyMeters() {
  const notify = useNotify();
  const { isSuperAdmin, can } = useAuth();

  const [branches,   setBranches  ] = useState([]);
  const [branchId,   setBranchId  ] = useState('');
  const [branchName, setBranchName] = useState('');
  const [date,       setDate      ] = useState(todayStr());
  const [islands,    setIslands   ] = useState([]);
  const [loading,    setLoading   ] = useState(false);
  const [view,       setView      ] = useState('daily'); // 'daily' | 'report'
  const [openModal,  setOpenModal ] = useState(null);   // { type: 'opening'|'closing', island }

  useEffect(() => {
    api.get('/branches').then(r => {
      const list = r.data.data || [];
      setBranches(list);
      if (list.length === 1) { setBranchId(list[0]._id); setBranchName(list[0].name); }
    }).catch(() => {});
  }, []);

  const load = useCallback(async () => {
    if (!branchId) return;
    setLoading(true);
    try {
      const { data } = await api.get('/meter-logs', { params: { branchId, date } });
      setIslands(data.data || []);
    } catch { notify('Failed to load meter data', 'error'); }
    finally { setLoading(false); }
  }, [branchId, date]);

  useEffect(() => { if (branchId) load(); }, [load]);

  const handleBranch = (e) => {
    const id   = e.target.value;
    const name = branches.find(b => b._id === id)?.name || '';
    setBranchId(id); setBranchName(name);
  };

  const updateIsland = (islandId, updatedLog) => {
    setIslands(prev => prev.map(isl => {
      if (String(isl.islandId) !== String(islandId)) return isl;
      return { ...isl, log: updatedLog };
    }));
    setOpenModal(null);
  };

  // Navigation helpers for date
  const prevDay = () => {
    const d = new Date(date); d.setDate(d.getDate() - 1);
    setDate(d.toISOString().split('T')[0]);
  };
  const nextDay = () => {
    const d = new Date(date); d.setDate(d.getDate() + 1);
    const today = todayStr();
    if (d.toISOString().split('T')[0] <= today) setDate(d.toISOString().split('T')[0]);
  };

  const totalOpen  = islands.filter(i => i.log?.openingMeter != null).length;
  const totalClose = islands.filter(i => i.log?.status === 'closed').length;
  const totalL     = islands.reduce((s, i) => s + (i.log?.litresSold || 0), 0);

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Daily Meter Readings</h1>
          <p className="text-sm text-gray-500 mt-0.5">Supervisor enters opening & closing meters per island</p>
        </div>
        <div className="flex gap-2">
          <button onClick={() => setView('daily')}
            className={`px-4 py-2 rounded-xl text-sm font-medium transition-colors ${view === 'daily' ? 'bg-brand-600 text-white' : 'bg-white border border-gray-200 text-gray-600 hover:bg-gray-50'}`}>
            <Gauge size={14} className="inline mr-1" /> Daily
          </button>
          <button onClick={() => setView('report')}
            className={`px-4 py-2 rounded-xl text-sm font-medium transition-colors ${view === 'report' ? 'bg-brand-600 text-white' : 'bg-white border border-gray-200 text-gray-600 hover:bg-gray-50'}`}>
            <BarChart2 size={14} className="inline mr-1" /> Report
          </button>
        </div>
      </div>

      {/* Controls */}
      <div className="card p-4 flex items-end gap-3 flex-wrap">
        <div className="flex-1 min-w-[160px]">
          <label className="label flex items-center gap-1"><Building2 size={11} /> Branch</label>
          <select className="input" value={branchId} onChange={handleBranch}>
            <option value="">— Select branch —</option>
            {branches.map(b => <option key={b._id} value={b._id}>{b.name}</option>)}
          </select>
        </div>

        {view === 'daily' && (
          <div>
            <label className="label flex items-center gap-1"><Calendar size={11} /> Date</label>
            <div className="flex items-center gap-1">
              <button onClick={prevDay} className="p-2 rounded-lg border border-gray-200 hover:bg-gray-50"><ChevronLeft size={16} /></button>
              <input type="date" className="input w-36" value={date} onChange={e => setDate(e.target.value)} max={todayStr()} />
              <button onClick={nextDay} className="p-2 rounded-lg border border-gray-200 hover:bg-gray-50 disabled:opacity-40" disabled={date >= todayStr()}><ChevronRight size={16} /></button>
            </div>
          </div>
        )}

        {view === 'daily' && branchId && (
          <button onClick={load} className="p-2 rounded-xl border border-gray-200 bg-white hover:bg-gray-50 transition-colors mb-0.5">
            <RefreshCw size={16} className="text-gray-500" />
          </button>
        )}
      </div>

      {/* Report View */}
      {view === 'report' && branchId && <ReportView branchId={branchId} branchName={branchName} />}
      {view === 'report' && !branchId && (
        <div className="card p-8 text-center text-gray-400">Select a branch to view the report.</div>
      )}

      {/* Daily View */}
      {view === 'daily' && (
        <>
          {!branchId && (
            <div className="card p-8 text-center text-gray-400">
              <Gauge size={32} className="mx-auto mb-2 text-gray-300" />
              <p>Select a branch to manage meter readings</p>
            </div>
          )}

          {branchId && loading && (
            <div className="text-center py-10"><Loader size={24} className="animate-spin text-brand-600 mx-auto" /></div>
          )}

          {branchId && !loading && (
            <>
              {/* Day summary bar */}
              {islands.length > 0 && (
                <div className="grid grid-cols-3 gap-3">
                  <div className="card p-3 text-center">
                    <p className="text-xs text-gray-400">Opening Set</p>
                    <p className="font-bold text-gray-800">{totalOpen}/{islands.length}</p>
                  </div>
                  <div className="card p-3 text-center">
                    <p className="text-xs text-gray-400">Shifts Closed</p>
                    <p className="font-bold text-gray-800">{totalClose}/{islands.length}</p>
                  </div>
                  <div className="card p-3 text-center">
                    <p className="text-xs text-gray-400">Total Litres</p>
                    <p className="font-bold text-brand-700">{totalClose > 0 ? fmtL(totalL) : '—'}</p>
                  </div>
                </div>
              )}

              {islands.length === 0 && (
                <div className="card p-10 text-center text-gray-400">
                  <Gauge size={32} className="mx-auto mb-2 text-gray-300" />
                  <p>No islands set up for this branch yet</p>
                </div>
              )}

              {/* Island cards */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {islands.map(island => (
                  <IslandCard
                    key={String(island.islandId)}
                    island={island}
                    onOpenOpening={(isl) => setOpenModal({ type: 'opening', island: { ...isl, branchId } })}
                    onOpenClosing={(isl) => setOpenModal({ type: 'closing', island: isl })}
                  />
                ))}
              </div>
            </>
          )}
        </>
      )}

      {/* Modals */}
      {openModal?.type === 'opening' && (
        <OpeningModal
          island={openModal.island}
          date={date}
          onClose={() => setOpenModal(null)}
          onSaved={(log) => updateIsland(openModal.island.islandId, log)}
        />
      )}
      {openModal?.type === 'closing' && (
        <ClosingModal
          island={openModal.island}
          date={date}
          onClose={() => setOpenModal(null)}
          onSaved={(log) => updateIsland(openModal.island.islandId, log)}
        />
      )}
    </div>
  );
}
