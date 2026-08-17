import { useState, useEffect, useCallback } from 'react';
import {
  Gauge, ChevronDown, Save, Loader, CheckCircle, Clock, AlertCircle,
  Droplets, User, Calendar, Building2, X, RefreshCw, BarChart2,
  ChevronLeft, ChevronRight, Wrench, PackageX, Zap,
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
  active:       { label: 'Active',       cls: 'bg-green-100  text-green-700',  icon: CheckCircle },
  out_of_stock: { label: 'Out of Stock', cls: 'bg-amber-100  text-amber-700',  icon: PackageX    },
  faulty:       { label: 'Faulty',       cls: 'bg-red-100    text-red-700',    icon: Wrench      },
  inactive:     { label: 'Inactive',     cls: 'bg-gray-100   text-gray-500',   icon: X           },
};

// Build a default pump list from assignedPumps or fall back to 2 generic pumps
function buildPumpList(island) {
  const assigned = island.assignedPumps || [];
  if (assigned.length) return assigned;
  return [
    { pumpNumber: 1, pumpName: 'Pump 1', productType: island.productTypes?.[0] || 'PMS' },
    { pumpNumber: 2, pumpName: 'Pump 2', productType: island.productTypes?.[0] || 'PMS' },
  ];
}

// ─── Opening Meter Modal — per pump, 2 nozzles each ──────────────────────────
function OpeningModal({ island, date, onClose, onSaved }) {
  const notify  = useNotify();
  const [saving, setSaving] = useState(false);

  const pumps      = buildPumpList(island);
  const existingMap = Object.fromEntries(
    (island.log?.pumps || []).map(p => [String(p.pumpNumber), p])
  );

  const initReadings = () =>
    pumps.map(p => {
      const ex = existingMap[String(p.pumpNumber)] || {};
      return {
        pumpId:      p.pumpId   || p._id,
        pumpNumber:  p.pumpNumber,
        pumpName:    p.pumpName,
        productType: p.productType,
        nozzle1Opening: ex.nozzle1?.opening ?? '',
        nozzle2Opening: ex.nozzle2?.opening ?? '',
      };
    });

  const [readings, setReadings] = useState(initReadings);

  const update = (idx, field, val) =>
    setReadings(prev => prev.map((r, i) => i === idx ? { ...r, [field]: val } : r));

  const submit = async (e) => {
    e.preventDefault();
    const filled = readings.filter(r => r.nozzle1Opening !== '' || r.nozzle2Opening !== '');
    if (!filled.length) return notify('Enter at least one nozzle reading', 'error');
    setSaving(true);
    try {
      const { data } = await api.post('/meter-logs', {
        branchId:  island.branchId,
        date,
        islandId:  island.islandId,
        pumps:     readings.map(r => ({
          pumpId:        r.pumpId,
          pumpNumber:    r.pumpNumber,
          pumpName:      r.pumpName,
          productType:   r.productType,
          nozzle1Opening: r.nozzle1Opening !== '' ? Number(r.nozzle1Opening) : null,
          nozzle2Opening: r.nozzle2Opening !== '' ? Number(r.nozzle2Opening) : null,
        })),
      });
      notify('Opening meters saved ✓');
      onSaved(data.data);
    } catch (err) {
      notify(err.response?.data?.message || 'Failed to save', 'error');
    } finally { setSaving(false); }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/60 p-4 pt-10 overflow-y-auto">
      <div className="bg-white rounded-2xl w-full max-w-md shadow-2xl mb-10">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <div>
            <p className="font-bold text-gray-900">{island.islandName}</p>
            <p className="text-xs text-gray-400">Set opening meter — per pump, per nozzle</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X size={18} /></button>
        </div>
        <form onSubmit={submit}>
          <div className="px-5 py-4 space-y-5">
            {readings.map((r, idx) => (
              <div key={idx} className="bg-gray-50 rounded-xl p-4 space-y-3">
                <div className="flex items-center gap-2">
                  <Gauge size={14} className="text-brand-500" />
                  <p className="font-semibold text-gray-800 text-sm">{r.pumpName}</p>
                  {r.productType && <span className="text-[10px] px-2 py-0.5 rounded-full bg-brand-100 text-brand-700 font-medium">{r.productType}</span>}
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="label text-xs">Nozzle 1 Opening</label>
                    <input
                      type="number" step="0.01" className="input text-sm"
                      placeholder="e.g. 12450.30"
                      value={r.nozzle1Opening}
                      onChange={e => update(idx, 'nozzle1Opening', e.target.value)}
                    />
                  </div>
                  <div>
                    <label className="label text-xs">Nozzle 2 Opening</label>
                    <input
                      type="number" step="0.01" className="input text-sm"
                      placeholder="e.g. 8900.00"
                      value={r.nozzle2Opening}
                      onChange={e => update(idx, 'nozzle2Opening', e.target.value)}
                    />
                  </div>
                </div>
              </div>
            ))}
          </div>
          <div className="px-5 pb-5 flex gap-3">
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

// ─── Closing Meter Modal — per pump, 2 nozzles each ──────────────────────────
function ClosingModal({ island, date, onClose, onSaved }) {
  const notify  = useNotify();
  const [saving, setSaving] = useState(false);
  const [notes,  setNotes ] = useState(island.log?.notes || '');

  const logPumps = island.log?.pumps || [];
  // Fall back to assignedPumps if no log pumps yet
  const sourcePumps = logPumps.length ? logPumps : buildPumpList(island);

  const initReadings = () =>
    sourcePumps.map(p => ({
      pumpId:      p.pumpId   || p._id,
      pumpNumber:  p.pumpNumber,
      pumpName:    p.pumpName,
      productType: p.productType,
      nozzle1Opening: p.nozzle1?.opening ?? null,
      nozzle2Opening: p.nozzle2?.opening ?? null,
      nozzle1Closing: p.nozzle1?.closing ?? '',
      nozzle2Closing: p.nozzle2?.closing ?? '',
    }));

  const [readings, setReadings] = useState(initReadings);

  const update = (idx, field, val) =>
    setReadings(prev => prev.map((r, i) => i === idx ? { ...r, [field]: val } : r));

  const calcPumpLitres = (r) => {
    const n1 = (r.nozzle1Closing !== '' && r.nozzle1Opening != null)
      ? Math.max(0, Number(r.nozzle1Closing) - r.nozzle1Opening) : null;
    const n2 = (r.nozzle2Closing !== '' && r.nozzle2Opening != null)
      ? Math.max(0, Number(r.nozzle2Closing) - r.nozzle2Opening) : null;
    return { n1, n2, total: (n1 != null || n2 != null) ? (n1 || 0) + (n2 || 0) : null };
  };

  const grandTotal = readings.reduce((s, r) => {
    const { total } = calcPumpLitres(r);
    return s + (total || 0);
  }, 0);

  const submit = async (e) => {
    e.preventDefault();
    if (!island.log?._id) return notify('Save opening meters first', 'error');
    setSaving(true);
    try {
      const { data } = await api.put(`/meter-logs/${island.log._id}/close`, {
        pumps: readings.map(r => ({
          pumpId:        r.pumpId,
          pumpNumber:    r.pumpNumber,
          nozzle1Closing: r.nozzle1Closing !== '' ? Number(r.nozzle1Closing) : null,
          nozzle2Closing: r.nozzle2Closing !== '' ? Number(r.nozzle2Closing) : null,
        })),
        notes,
      });
      notify('Shift closed ✓');
      onSaved(data.data);
    } catch (err) {
      notify(err.response?.data?.message || 'Failed to save', 'error');
    } finally { setSaving(false); }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/60 p-4 pt-10 overflow-y-auto">
      <div className="bg-white rounded-2xl w-full max-w-md shadow-2xl mb-10">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <div>
            <p className="font-bold text-gray-900">{island.islandName}</p>
            <p className="text-xs text-gray-400">Close shift — enter closing meter per nozzle</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X size={18} /></button>
        </div>
        <form onSubmit={submit}>
          <div className="px-5 py-4 space-y-5">
            {readings.map((r, idx) => {
              const { n1, n2, total } = calcPumpLitres(r);
              return (
                <div key={idx} className="bg-gray-50 rounded-xl p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Gauge size={14} className="text-brand-500" />
                      <p className="font-semibold text-gray-800 text-sm">{r.pumpName}</p>
                      {r.productType && <span className="text-[10px] px-2 py-0.5 rounded-full bg-brand-100 text-brand-700 font-medium">{r.productType}</span>}
                    </div>
                    {total != null && (
                      <span className="text-sm font-bold text-brand-700">{fmtL(total)}</span>
                    )}
                  </div>

                  {/* Nozzle 1 */}
                  <div className="grid grid-cols-2 gap-2 items-end">
                    <div>
                      <label className="label text-xs">Nozzle 1 Opening</label>
                      <div className="input bg-gray-100 text-gray-500 text-sm py-2">{fmt(r.nozzle1Opening)}</div>
                    </div>
                    <div>
                      <label className="label text-xs">Nozzle 1 Closing</label>
                      <input type="number" step="0.01" className="input text-sm" placeholder="Closing…"
                        value={r.nozzle1Closing}
                        onChange={e => update(idx, 'nozzle1Closing', e.target.value)} />
                    </div>
                  </div>
                  {n1 != null && (
                    <p className="text-xs text-right text-green-700 font-semibold">Nozzle 1 sold: {fmtL(n1)}</p>
                  )}

                  {/* Nozzle 2 */}
                  <div className="grid grid-cols-2 gap-2 items-end">
                    <div>
                      <label className="label text-xs">Nozzle 2 Opening</label>
                      <div className="input bg-gray-100 text-gray-500 text-sm py-2">{fmt(r.nozzle2Opening)}</div>
                    </div>
                    <div>
                      <label className="label text-xs">Nozzle 2 Closing</label>
                      <input type="number" step="0.01" className="input text-sm" placeholder="Closing…"
                        value={r.nozzle2Closing}
                        onChange={e => update(idx, 'nozzle2Closing', e.target.value)} />
                    </div>
                  </div>
                  {n2 != null && (
                    <p className="text-xs text-right text-green-700 font-semibold">Nozzle 2 sold: {fmtL(n2)}</p>
                  )}
                </div>
              );
            })}

            {/* Grand total */}
            {grandTotal > 0 && (
              <div className="bg-brand-50 border border-brand-200 rounded-xl px-4 py-3 flex items-center justify-between">
                <p className="font-semibold text-brand-700">Total Litres Sold</p>
                <p className="text-xl font-black text-brand-700">{fmtL(grandTotal)}</p>
              </div>
            )}

            <div>
              <label className="label">Notes (optional)</label>
              <input type="text" className="input" value={notes} onChange={e => setNotes(e.target.value)} placeholder="Any remarks…" />
            </div>
          </div>
          <div className="px-5 pb-5 flex gap-3">
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

// ─── Island Status Modal ──────────────────────────────────────────────────────
function IslandStatusModal({ island, onClose, onSaved }) {
  const notify  = useNotify();
  const [saving, setSaving] = useState(false);
  const isDown = island.islandStatus !== 'active' && island.islandStatus !== 'inactive';

  const mark = async (newStatus) => {
    setSaving(true);
    try {
      const { data } = await api.patch(`/pump-islands/${island.islandId}/status`, { status: newStatus });
      notify(newStatus === 'active' ? 'Island restored — worker now has two pumps ✓' : 'Island marked as down — worker reassigned ✓');
      onSaved(data.data);
    } catch (err) {
      notify(err.response?.data?.message || 'Failed to update status', 'error');
    } finally { setSaving(false); }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="bg-white rounded-2xl w-full max-w-sm shadow-2xl">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <div>
            <p className="font-bold text-gray-900">{island.islandName}</p>
            <p className="text-xs text-gray-400">Change island status</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X size={18} /></button>
        </div>
        <div className="px-5 py-5 space-y-3">
          {!isDown ? (
            <>
              <p className="text-sm text-gray-600">Mark this island as unavailable. The assigned worker will be moved to another island automatically.</p>
              <button disabled={saving} onClick={() => mark('out_of_stock')}
                className="w-full flex items-center gap-3 px-4 py-3.5 rounded-xl border-2 border-amber-200 bg-amber-50 hover:bg-amber-100 transition-colors disabled:opacity-60">
                <PackageX size={20} className="text-amber-600 shrink-0" />
                <div className="text-left">
                  <p className="font-semibold text-amber-800 text-sm">Out of Fuel</p>
                  <p className="text-xs text-amber-600">Worker reassigned until fuel arrives</p>
                </div>
              </button>
              <button disabled={saving} onClick={() => mark('faulty')}
                className="w-full flex items-center gap-3 px-4 py-3.5 rounded-xl border-2 border-red-200 bg-red-50 hover:bg-red-100 transition-colors disabled:opacity-60">
                <Wrench size={20} className="text-red-600 shrink-0" />
                <div className="text-left">
                  <p className="font-semibold text-red-800 text-sm">Pump Faulty</p>
                  <p className="text-xs text-red-600">Worker reassigned until pump is repaired</p>
                </div>
              </button>
            </>
          ) : (
            <>
              <p className="text-sm text-gray-600">
                This island is currently <strong>{island.islandStatus === 'faulty' ? 'faulty' : 'out of fuel'}</strong>. Mark it as available — the original worker will automatically get this island as a second pump for today.
              </p>
              <button disabled={saving} onClick={() => mark('active')}
                className="w-full flex items-center gap-3 px-4 py-3.5 rounded-xl border-2 border-green-200 bg-green-50 hover:bg-green-100 transition-colors disabled:opacity-60">
                {saving ? <Loader size={20} className="animate-spin text-green-600" /> : <Zap size={20} className="text-green-600 shrink-0" />}
                <div className="text-left">
                  <p className="font-semibold text-green-800 text-sm">Mark Available</p>
                  <p className="text-xs text-green-600">Worker gets both islands for today</p>
                </div>
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Island Card ──────────────────────────────────────────────────────────────
function IslandCard({ island, onOpenOpening, onOpenClosing, onStatusChange }) {
  const log    = island.log;
  const worker = island.worker;
  const st     = ISLAND_STATUS[island.islandStatus] || ISLAND_STATUS.active;
  const StIcon = st.icon;
  const isDown = island.islandStatus === 'out_of_stock' || island.islandStatus === 'faulty';

  const logPumps   = log?.pumps || [];
  const hasOpening = logPumps.some(p => p.nozzle1?.opening != null || p.nozzle2?.opening != null);
  const hasClosing = logPumps.some(p => p.nozzle1?.closing != null || p.nozzle2?.closing != null);
  const isClosed   = log?.status === 'closed';
  const pinned     = island.worker?.pinnedIslands || [];

  return (
    <div className={`card p-4 space-y-3 ${isDown ? 'border-2 border-amber-300' : ''} ${isClosed ? 'opacity-80' : ''}`}>
      {/* Header */}
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="font-bold text-gray-900">{island.islandName}</p>
          {worker
            ? <div className="flex items-center gap-1.5 mt-0.5"><User size={11} className="text-green-500" /><span className="text-xs text-green-700 font-medium">{worker.workerName}</span></div>
            : <span className="text-xs text-gray-400">No worker assigned yet</span>
          }
        </div>
        <div className="flex items-center gap-1.5">
          <span className={`flex items-center gap-1 text-xs px-2 py-0.5 rounded-full font-medium ${st.cls}`}>
            <StIcon size={10} /> {st.label}
          </span>
          {island.islandStatus !== 'inactive' && (
            <button onClick={() => onStatusChange(island)}
              className="text-gray-400 hover:text-gray-700 p-0.5 rounded-lg hover:bg-gray-100 transition-colors" title="Change island status">
              <ChevronDown size={14} />
            </button>
          )}
        </div>
      </div>

      {/* Down banner */}
      {isDown && (
        <div className="flex items-center gap-2 text-xs px-3 py-2 rounded-xl bg-amber-50 border border-amber-200 text-amber-700">
          {island.islandStatus === 'faulty' ? <Wrench size={12} /> : <PackageX size={12} />}
          <span>Island down — worker moved. Tap <strong>↓</strong> to restore.</span>
        </div>
      )}

      {/* Restored second island */}
      {pinned.length > 0 && pinned.map((pi, idx) => (
        <div key={idx} className="flex items-center gap-2 text-xs px-3 py-2 rounded-xl bg-green-50 border border-green-200 text-green-700">
          <Zap size={12} />
          <span>Also covering <strong>{pi.islandName}</strong> (restored mid-day)</span>
        </div>
      ))}

      {/* Per-pump meter readings */}
      {logPumps.length > 0 ? (
        <div className="space-y-2">
          {logPumps.map((p, i) => (
            <div key={i} className="bg-gray-50 rounded-xl px-3 py-2.5 text-xs">
              <div className="flex items-center justify-between mb-1.5">
                <span className="font-semibold text-gray-700">{p.pumpName}</span>
                {p.totalLitres != null && (
                  <span className="font-bold text-brand-700">{fmtL(p.totalLitres)}</span>
                )}
              </div>
              <div className="grid grid-cols-2 gap-x-4 gap-y-0.5 text-gray-500">
                <div className="flex justify-between">
                  <span>N1 open:</span>
                  <span className={`font-medium ${p.nozzle1?.opening != null ? 'text-gray-700' : 'text-gray-300'}`}>{fmt(p.nozzle1?.opening)}</span>
                </div>
                <div className="flex justify-between">
                  <span>N1 close:</span>
                  <span className={`font-medium ${p.nozzle1?.closing != null ? 'text-green-700' : 'text-gray-300'}`}>{fmt(p.nozzle1?.closing)}</span>
                </div>
                <div className="flex justify-between">
                  <span>N2 open:</span>
                  <span className={`font-medium ${p.nozzle2?.opening != null ? 'text-gray-700' : 'text-gray-300'}`}>{fmt(p.nozzle2?.opening)}</span>
                </div>
                <div className="flex justify-between">
                  <span>N2 close:</span>
                  <span className={`font-medium ${p.nozzle2?.closing != null ? 'text-green-700' : 'text-gray-300'}`}>{fmt(p.nozzle2?.closing)}</span>
                </div>
              </div>
            </div>
          ))}
          {log?.totalLitres != null && (
            <div className="flex items-center justify-between px-3 py-2 bg-brand-50 rounded-xl">
              <span className="text-xs font-semibold text-brand-700">Total Sold</span>
              <span className="text-sm font-black text-brand-700">{fmtL(log.totalLitres)}</span>
            </div>
          )}
        </div>
      ) : (
        /* No readings yet — show empty state */
        <div className="grid grid-cols-3 gap-2 text-center">
          {['Opening', 'Closing', 'Sold'].map(label => (
            <div key={label} className="bg-gray-50 rounded-xl py-2">
              <p className="text-[10px] text-gray-400">{label}</p>
              <p className="text-sm font-bold text-gray-300">—</p>
            </div>
          ))}
        </div>
      )}

      {/* Actions */}
      {!isClosed && (
        <div className="flex gap-2">
          <button onClick={() => onOpenOpening(island)}
            className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl border border-gray-200 bg-white text-gray-700 text-xs font-medium hover:bg-gray-50 transition-colors">
            <Gauge size={13} /> {hasOpening ? 'Edit Opening' : 'Set Opening'}
          </button>
          {hasOpening && (
            <button onClick={() => onOpenClosing(island)}
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
function ReportView({ branchId }) {
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
                      <th className="py-2 px-3 text-right text-xs font-semibold text-brand-500">Total Litres</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.logs.map(l => (
                      <tr key={l._id} className="border-b border-gray-50 hover:bg-gray-50/50">
                        <td className="py-2 px-3 text-gray-600 text-xs tabular-nums">{l.date}</td>
                        <td className="py-2 px-3 font-medium text-gray-800">{l.islandName}</td>
                        <td className="py-2 px-3 text-gray-600 text-xs">{l.workerName || '—'}</td>
                        <td className="py-2 px-3 text-right tabular-nums font-bold text-brand-700">{fmtL(l.totalLitres)}</td>
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

  const [branches,     setBranches    ] = useState([]);
  const [branchId,     setBranchId    ] = useState('');
  const [branchName,   setBranchName  ] = useState('');
  const [date,         setDate        ] = useState(todayStr());
  const [islands,      setIslands     ] = useState([]);
  const [loading,      setLoading     ] = useState(false);
  const [view,         setView        ] = useState('daily');
  const [openModal,    setOpenModal   ] = useState(null);
  const [statusIsland, setStatusIsland] = useState(null);

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
    setIslands(prev => prev.map(isl =>
      String(isl.islandId) !== String(islandId) ? isl : { ...isl, log: updatedLog }
    ));
    setOpenModal(null);
  };

  const handleIslandStatusSaved = (updatedIsland) => {
    setIslands(prev => prev.map(isl =>
      String(isl.islandId) !== String(updatedIsland._id) ? isl : { ...isl, islandStatus: updatedIsland.status }
    ));
    setStatusIsland(null);
    if (branchId && date)
      api.get('/meter-logs', { params: { branchId, date } }).then(r => setIslands(r.data.data || [])).catch(() => {});
  };

  const prevDay = () => { const d = new Date(date); d.setDate(d.getDate() - 1); setDate(d.toISOString().split('T')[0]); };
  const nextDay = () => {
    const d = new Date(date); d.setDate(d.getDate() + 1);
    if (d.toISOString().split('T')[0] <= todayStr()) setDate(d.toISOString().split('T')[0]);
  };

  const totalOpen  = islands.filter(i => (i.log?.pumps || []).some(p => p.nozzle1?.opening != null || p.nozzle2?.opening != null)).length;
  const totalClose = islands.filter(i => i.log?.status === 'closed').length;
  const totalL     = islands.reduce((s, i) => s + (i.log?.totalLitres || 0), 0);

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Daily Meter Readings</h1>
          <p className="text-sm text-gray-500 mt-0.5">Opening &amp; closing meters per pump, per nozzle</p>
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
              <button onClick={nextDay} disabled={date >= todayStr()} className="p-2 rounded-lg border border-gray-200 hover:bg-gray-50 disabled:opacity-40"><ChevronRight size={16} /></button>
            </div>
          </div>
        )}
        {view === 'daily' && branchId && (
          <button onClick={load} className="p-2 rounded-xl border border-gray-200 bg-white hover:bg-gray-50 transition-colors mb-0.5">
            <RefreshCw size={16} className="text-gray-500" />
          </button>
        )}
      </div>

      {view === 'report' && branchId && <ReportView branchId={branchId} />}
      {view === 'report' && !branchId && <div className="card p-8 text-center text-gray-400">Select a branch to view the report.</div>}

      {view === 'daily' && (
        <>
          {!branchId && (
            <div className="card p-8 text-center text-gray-400">
              <Gauge size={32} className="mx-auto mb-2 text-gray-300" />
              <p>Select a branch to manage meter readings</p>
            </div>
          )}
          {branchId && loading && <div className="text-center py-10"><Loader size={24} className="animate-spin text-brand-600 mx-auto" /></div>}
          {branchId && !loading && (
            <>
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
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {islands.map(island => (
                  <IslandCard
                    key={String(island.islandId)}
                    island={island}
                    onOpenOpening={(isl) => setOpenModal({ type: 'opening', island: { ...isl, branchId } })}
                    onOpenClosing={(isl) => setOpenModal({ type: 'closing', island: isl })}
                    onStatusChange={(isl) => setStatusIsland(isl)}
                  />
                ))}
              </div>
            </>
          )}
        </>
      )}

      {openModal?.type === 'opening' && (
        <OpeningModal island={openModal.island} date={date} onClose={() => setOpenModal(null)}
          onSaved={(log) => updateIsland(openModal.island.islandId, log)} />
      )}
      {openModal?.type === 'closing' && (
        <ClosingModal island={openModal.island} date={date} onClose={() => setOpenModal(null)}
          onSaved={(log) => updateIsland(openModal.island.islandId, log)} />
      )}
      {statusIsland && (
        <IslandStatusModal island={statusIsland} onClose={() => setStatusIsland(null)} onSaved={handleIslandStatusSaved} />
      )}
    </div>
  );
}
