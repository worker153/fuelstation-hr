import { useState, useEffect, useRef, useCallback } from 'react';
import { Delete, Loader, X, ChevronDown, ChevronUp, AlertTriangle, Fuel, Wrench, CheckCircle, RefreshCw, BarChart2, Users, User, Gauge, ChevronRight, Save } from 'lucide-react';
import axios from 'axios';
import * as faceapi from '@vladmandic/face-api';

const MODEL_URL       = 'https://cdn.jsdelivr.net/npm/@vladmandic/face-api@1.7.14/model';
const VERIFY_THRESHOLD = 0.58;
const STABLE_FRAMES    = 3;
let modelsLoaded = false;

async function loadFaceModels(onProgress) {
  if (modelsLoaded) return;
  onProgress?.(10);
  await faceapi.nets.ssdMobilenetv1.loadFromUri(MODEL_URL);
  onProgress?.(50);
  await faceapi.nets.faceLandmark68Net.loadFromUri(MODEL_URL);
  onProgress?.(80);
  await faceapi.nets.faceRecognitionNet.loadFromUri(MODEL_URL);
  onProgress?.(100);
  modelsLoaded = true;
}

const BASE = import.meta.env.VITE_API_URL || 'http://localhost:5000/api';

const fmtNum = n => (n == null ? '—' : Number(n).toLocaleString('en-NG', { minimumFractionDigits: 2 }));
const fmtL   = n => (n == null ? '—' : `${Number(n).toLocaleString('en-NG', { maximumFractionDigits: 1 })}L`);

const REASONS = [
  { value: 'cash_shortage',      label: 'Cash Shortage' },
  { value: 'fuel_shortage',      label: 'Fuel Shortage' },
  { value: 'equipment_damage',   label: 'Equipment Damage' },
  { value: 'customer_complaint', label: 'Customer Complaint' },
  { value: 'other',              label: 'Other' },
];

const OFFENCE_TYPES = [
  { value: 'late_arrival',         label: 'Late Arrival' },
  { value: 'absent_without_notice',label: 'Absent Without Notice' },
  { value: 'improper_uniform',     label: 'Improper Uniform' },
  { value: 'rude_to_customer',     label: 'Rude to Customer' },
  { value: 'cash_shortage',        label: 'Cash Shortage' },
  { value: 'fuel_shortage',        label: 'Fuel Shortage' },
  { value: 'negligence',           label: 'Negligence' },
  { value: 'theft_fraud',          label: 'Theft / Fraud' },
  { value: 'disobedience',         label: 'Disobedience' },
  { value: 'mobile_phone_misuse',  label: 'Mobile Phone Misuse' },
  { value: 'fighting_misconduct',  label: 'Fighting / Misconduct' },
  { value: 'damage_to_property',   label: 'Damage to Property' },
  { value: 'abandoning_post',      label: 'Abandoning Post' },
  { value: 'insubordination',      label: 'Insubordination' },
  { value: 'sleeping_on_duty',     label: 'Sleeping on Duty' },
  { value: 'other',                label: 'Other' },
];

const SEVERITIES = [
  { value: 'minor',    label: 'Minor' },
  { value: 'moderate', label: 'Moderate' },
  { value: 'serious',  label: 'Serious' },
  { value: 'gross',    label: 'Gross' },
];

const ACTIONS = [
  { value: 'verbal_warning',   label: 'Verbal Warning' },
  { value: 'written_warning',  label: 'Written Warning' },
  { value: 'suspension',       label: 'Suspension' },
  { value: 'deduction',        label: 'Salary Deduction' },
  { value: 'dismissal',        label: 'Dismissal' },
  { value: 'none',             label: 'None (Record Only)' },
];

const STATUS_LABELS = {
  active:      { label: 'Active',        cls: 'bg-green-100 text-green-700',  icon: '🟢' },
  faulty:      { label: 'Faulty',        cls: 'bg-red-100 text-red-700',      icon: '🔴' },
  out_of_stock:{ label: 'Out of Fuel',   cls: 'bg-orange-100 text-orange-700',icon: '🟡' },
  inactive:    { label: 'Inactive',      cls: 'bg-gray-100 text-gray-500',    icon: '⚫' },
};

// ── Small reusable modal wrapper ───────────────────────────────────────────────
function ModalSheet({ title, onClose, children }) {
  return (
    <div className="fixed inset-0 z-50 flex flex-col justify-end" onClick={onClose}>
      <div className="absolute inset-0 bg-black/40" />
      <div
        className="relative bg-white rounded-t-3xl shadow-2xl max-h-[90vh] flex flex-col"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex justify-center pt-3 pb-1">
          <div className="w-10 h-1 bg-gray-300 rounded-full" />
        </div>
        <div className="flex items-center justify-between px-5 py-3 border-b border-gray-100">
          <p className="font-bold text-gray-800 text-base">{title}</p>
          <button onClick={onClose} className="p-1.5 rounded-full hover:bg-gray-100">
            <X size={18} className="text-gray-500" />
          </button>
        </div>
        <div className="overflow-y-auto flex-1 px-5 py-4">{children}</div>
      </div>
    </div>
  );
}

// ── PIN pad ────────────────────────────────────────────────────────────────────
function PinPad({ onSubmit, loading, error }) {
  const [digits, setDigits] = useState('');
  const press = d => setDigits(p => p.length < 4 ? p + d : p);
  const back  = () => setDigits(p => p.slice(0, -1));
  const submit = () => { if (digits.length === 4) onSubmit(digits); };

  const keys = ['1','2','3','4','5','6','7','8','9','','0','⌫'];

  return (
    <div className="min-h-screen bg-gradient-to-br from-indigo-700 to-purple-800 flex flex-col items-center justify-center px-6">
      <div className="mb-8 text-center">
        <div className="w-16 h-16 bg-white/20 rounded-2xl flex items-center justify-center mx-auto mb-4">
          <span className="text-3xl">🏭</span>
        </div>
        <h1 className="text-white text-2xl font-bold">Supervisor Dashboard</h1>
        <p className="text-indigo-200 text-sm mt-1">Enter your PIN to continue</p>
      </div>

      {/* PIN dots */}
      <div className="flex gap-4 mb-6">
        {[0,1,2,3].map(i => (
          <div key={i}
            className={`w-4 h-4 rounded-full transition-colors ${
              i < digits.length ? 'bg-white' : 'bg-white/30'
            }`}
          />
        ))}
      </div>

      {error && (
        <p className="text-red-300 text-sm mb-4 text-center">{error}</p>
      )}

      {/* Keypad */}
      <div className="grid grid-cols-3 gap-3 w-full max-w-xs mb-6">
        {keys.map((k, i) => (
          k === '' ? <div key={i} /> :
          k === '⌫' ? (
            <button key={i} onClick={back}
              className="h-16 rounded-2xl bg-white/20 text-white flex items-center justify-center active:scale-95 transition-transform">
              <Delete size={20} />
            </button>
          ) : (
            <button key={i} onClick={() => press(k)}
              className="h-16 rounded-2xl bg-white/20 text-white text-xl font-semibold active:scale-95 transition-transform hover:bg-white/30">
              {k}
            </button>
          )
        ))}
      </div>

      <button onClick={submit} disabled={digits.length < 4 || loading}
        className="w-full max-w-xs h-14 rounded-2xl bg-white text-indigo-700 font-bold text-lg disabled:opacity-50 flex items-center justify-center gap-2">
        {loading ? <Loader size={20} className="animate-spin" /> : 'Enter'}
      </button>
    </div>
  );
}

// ── Meter entry modal ──────────────────────────────────────────────────────────
function MeterModal({ island, pin, onClose, onSaved }) {
  const pumps = island.assignedPumps?.length
    ? island.assignedPumps
    : [{ pumpNumber: 1, pumpName: 'Pump 1' }, { pumpNumber: 2, pumpName: 'Pump 2' }];

  const existingMap = Object.fromEntries(
    (island.log?.pumps || []).map(p => [String(p.pumpId || p.pumpNumber), p])
  );

  const [values, setValues] = useState(() => {
    const init = {};
    pumps.forEach(p => {
      const key = String(p.pumpId || p.pumpNumber);
      const ex  = existingMap[key] || {};
      init[key] = {
        n1Open:  ex.nozzle1?.opening  ?? '',
        n1Close: ex.nozzle1?.closing  ?? '',
        n2Open:  ex.nozzle2?.opening  ?? '',
        n2Close: ex.nozzle2?.closing  ?? '',
      };
    });
    return init;
  });

  const set = (key, field, val) =>
    setValues(prev => ({ ...prev, [key]: { ...prev[key], [field]: val } }));

  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');

  const save = async () => {
    setSaving(true); setErr('');
    try {
      const submitPumps = pumps.map(p => {
        const key = String(p.pumpId || p.pumpNumber);
        const v   = values[key] || {};
        return {
          pumpId:        p.pumpId,
          pumpNumber:    p.pumpNumber,
          pumpName:      p.pumpName,
          productType:   p.productType,
          nozzle1Opening:  v.n1Open  !== '' ? Number(v.n1Open)  : null,
          nozzle1Closing:  v.n1Close !== '' ? Number(v.n1Close) : null,
          nozzle2Opening:  v.n2Open  !== '' ? Number(v.n2Open)  : null,
          nozzle2Closing:  v.n2Close !== '' ? Number(v.n2Close) : null,
        };
      });
      const res = await axios.post(`${BASE}/supervisor/meter`, {
        pin, islandId: island.islandId, pumps: submitPumps,
      });
      onSaved(res.data.data);
      onClose();
    } catch (e) {
      setErr(e.response?.data?.message || 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  return (
    <ModalSheet title={`Meters — ${island.islandName}`} onClose={onClose}>
      <div className="space-y-5">
        {pumps.map(p => {
          const key = String(p.pumpId || p.pumpNumber);
          const v   = values[key] || {};
          return (
            <div key={key} className="bg-gray-50 rounded-2xl p-4">
              <p className="font-semibold text-gray-700 text-sm mb-3">{p.pumpName || `Pump ${p.pumpNumber}`}</p>
              <div className="grid grid-cols-2 gap-3">
                {[
                  { label: 'Outer Opening', field: 'n1Open',  color: 'blue' },
                  { label: 'Outer Closing', field: 'n1Close', color: 'blue' },
                  { label: 'Inner Opening', field: 'n2Open',  color: 'purple' },
                  { label: 'Inner Closing', field: 'n2Close', color: 'purple' },
                ].map(({ label, field, color }) => (
                  <div key={field}>
                    <label className={`text-xs font-medium text-${color}-600 mb-1 block`}>{label}</label>
                    <input
                      type="number"
                      inputMode="decimal"
                      value={v[field]}
                      onChange={e => set(key, field, e.target.value)}
                      className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-indigo-300"
                      placeholder="0.00"
                    />
                  </div>
                ))}
              </div>
              {/* Live litres preview */}
              {(() => {
                const n1 = v.n1Close !== '' && v.n1Open !== '' ? Math.max(0, Number(v.n1Close) - Number(v.n1Open)) : null;
                const n2 = v.n2Close !== '' && v.n2Open !== '' ? Math.max(0, Number(v.n2Close) - Number(v.n2Open)) : null;
                const total = n1 != null || n2 != null ? (n1 || 0) + (n2 || 0) : null;
                if (total == null) return null;
                return (
                  <div className="mt-2 pt-2 border-t border-gray-200 flex items-center justify-between">
                    <span className="text-xs text-gray-500">Litres sold</span>
                    <span className="text-sm font-bold text-green-600">{fmtL(total)}</span>
                  </div>
                );
              })()}
            </div>
          );
        })}
        {err && <p className="text-red-500 text-sm text-center">{err}</p>}
        <button onClick={save} disabled={saving}
          className="w-full h-13 py-3.5 bg-indigo-600 text-white font-semibold rounded-2xl flex items-center justify-center gap-2 disabled:opacity-50">
          {saving ? <Loader size={18} className="animate-spin" /> : null}
          Save Meter Readings
        </button>
      </div>
    </ModalSheet>
  );
}

// ── Shortage booking modal ─────────────────────────────────────────────────────
function ShortageModal({ workers, pin, defaultWorkerId, onClose, onSaved }) {
  const [workerId, setWorkerId] = useState(defaultWorkerId || '');
  const [amount, setAmount]     = useState('');
  const [about, setAbout]       = useState('');
  const [reason, setReason]     = useState('cash_shortage');
  const [notes, setNotes]       = useState('');
  const [saving, setSaving]     = useState(false);
  const [err, setErr]           = useState('');

  const save = async () => {
    if (!workerId) return setErr('Select a worker');
    if (!amount)   return setErr('Enter an amount');
    setSaving(true); setErr('');
    try {
      const res = await axios.post(`${BASE}/supervisor/shortage`, {
        pin, workerId, amount: Number(amount), about, reason, notes,
      });
      onSaved(res.data.data);
      onClose();
    } catch (e) {
      setErr(e.response?.data?.message || 'Failed to book shortage');
    } finally { setSaving(false); }
  };

  return (
    <ModalSheet title="Book Shortage" onClose={onClose}>
      <div className="space-y-4">
        <div>
          <label className="text-xs font-semibold text-gray-500 uppercase mb-1 block">Worker</label>
          <select value={workerId} onChange={e => setWorkerId(e.target.value)}
            className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300">
            <option value="">Select worker…</option>
            {workers.map(w => <option key={w._id} value={w._id}>{w.fullName}</option>)}
          </select>
        </div>
        <div>
          <label className="text-xs font-semibold text-gray-500 uppercase mb-1 block">Amount (₦)</label>
          <input type="number" inputMode="decimal" value={amount} onChange={e => setAmount(e.target.value)}
            className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300"
            placeholder="e.g. 5000" />
        </div>
        <div>
          <label className="text-xs font-semibold text-gray-500 uppercase mb-1 block">About</label>
          <input type="text" value={about} onChange={e => setAbout(e.target.value)}
            className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300"
            placeholder="Short description of the charge" />
        </div>
        <div>
          <label className="text-xs font-semibold text-gray-500 uppercase mb-1 block">Reason</label>
          <select value={reason} onChange={e => setReason(e.target.value)}
            className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300">
            {REASONS.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
          </select>
        </div>
        <div>
          <label className="text-xs font-semibold text-gray-500 uppercase mb-1 block">Notes (optional)</label>
          <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={2}
            className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-indigo-300"
            placeholder="Additional details…" />
        </div>
        {err && <p className="text-red-500 text-sm">{err}</p>}
        <button onClick={save} disabled={saving}
          className="w-full py-3.5 bg-orange-500 text-white font-semibold rounded-2xl flex items-center justify-center gap-2 disabled:opacity-50">
          {saving ? <Loader size={18} className="animate-spin" /> : null}
          Book Shortage
        </button>
      </div>
    </ModalSheet>
  );
}

// ── Per-pump status modal ─────────────────────────────────────────────────────
const PUMP_STATUS_OPTIONS = [
  { status: 'active',       label: 'Active',       cls: 'border-green-400 bg-green-50 text-green-700',   dot: 'bg-green-500' },
  { status: 'faulty',       label: 'Faulty',       cls: 'border-red-400 bg-red-50 text-red-700',         dot: 'bg-red-500' },
  { status: 'out_of_stock', label: 'Fuel Finished', cls: 'border-orange-400 bg-orange-50 text-orange-700', dot: 'bg-orange-500' },
];

function PumpStatusModal({ island, pin, onClose, onSaved }) {
  // Track per-pump status locally so changes show immediately without closing
  const [pumpStatuses, setPumpStatuses] = useState(() =>
    Object.fromEntries((island.assignedPumps || []).map(p => [p.pumpId, p.status || 'active']))
  );
  const [saving, setSaving] = useState(null); // pumpId being saved
  const [err, setErr]       = useState('');

  const pumps = island.assignedPumps?.length
    ? island.assignedPumps
    : [];

  const pick = async (pumpId, status) => {
    setSaving(pumpId + status); setErr('');
    try {
      await axios.patch(`${BASE}/supervisor/pump-status`, { pin, pumpId, status });
      setPumpStatuses(prev => ({ ...prev, [pumpId]: status }));
      onSaved(pumpId, status);
    } catch (e) {
      setErr(e.response?.data?.message || 'Failed to update pump status');
    } finally { setSaving(null); }
  };

  return (
    <ModalSheet title={`Pump Status — ${island.islandName}`} onClose={onClose}>
      <div className="space-y-5 pb-2">
        {pumps.length === 0 && (
          <p className="text-center text-gray-400 py-6">No pumps found for this island</p>
        )}
        {pumps.map(pump => {
          const current = pumpStatuses[pump.pumpId] || 'active';
          return (
            <div key={pump.pumpId} className="bg-gray-50 rounded-2xl p-4">
              <div className="flex items-center gap-2 mb-3">
                <span className={`w-2.5 h-2.5 rounded-full shrink-0 ${
                  PUMP_STATUS_OPTIONS.find(o => o.status === current)?.dot || 'bg-gray-400'
                }`} />
                <p className="font-semibold text-gray-800 text-sm">
                  {pump.pumpName || `Pump ${pump.pumpNumber}`}
                </p>
                {pump.productType && (
                  <span className="text-xs text-gray-400 ml-auto">{pump.productType}</span>
                )}
              </div>
              <div className="grid grid-cols-3 gap-2">
                {PUMP_STATUS_OPTIONS.map(opt => (
                  <button
                    key={opt.status}
                    onClick={() => pick(pump.pumpId, opt.status)}
                    disabled={saving === pump.pumpId + opt.status || current === opt.status}
                    className={`py-2.5 rounded-xl border-2 text-xs font-semibold transition-all active:scale-95
                      ${current === opt.status
                        ? opt.cls + ' border-opacity-100'
                        : 'border-gray-200 bg-white text-gray-500'
                      } disabled:opacity-60`}>
                    {saving === pump.pumpId + opt.status
                      ? <Loader size={14} className="animate-spin mx-auto" />
                      : opt.label}
                  </button>
                ))}
              </div>
            </div>
          );
        })}
        {err && <p className="text-red-500 text-sm text-center">{err}</p>}
        <button onClick={onClose}
          className="w-full py-3 bg-gray-100 text-gray-600 font-semibold rounded-2xl text-sm">
          Done
        </button>
      </div>
    </ModalSheet>
  );
}

// ── Reassign modal — per pump, with In Use / Available tags ───────────────────
function ReassignModal({ worker, islands, pin, onClose, onSaved }) {
  // selected: { pumpId, islandId, islandName, pumpName }
  const [selected, setSelected] = useState(null);
  const [saving, setSaving]     = useState(false);
  const [err, setErr]           = useState('');

  const save = async () => {
    if (!selected) return setErr('Select a pump to assign to');
    setSaving(true); setErr('');
    try {
      const res = await axios.post(`${BASE}/supervisor/reassign`, {
        pin,
        workerId:    worker._id,
        newIslandId: selected.islandId,
        newPumpId:   selected.pumpId,
      });
      onSaved(res.data);
      onClose();
    } catch (e) {
      setErr(e.response?.data?.message || 'Reassignment failed');
    } finally { setSaving(false); }
  };

  const allPumps = islands.flatMap(i =>
    (i.allPumps || i.assignedPumps || []).map(p => ({ ...p, islandId: i.islandId, islandName: i.islandName }))
  );
  const hasPumps = allPumps.length > 0;

  return (
    <ModalSheet title={`Reassign — ${worker.fullName}`} onClose={onClose}>
      <div className="pb-2">
        <p className="text-sm text-gray-500 mb-4">
          Currently on: <span className="font-semibold">{worker.island?.islandName || 'Unassigned'}</span>
        </p>

        {!hasPumps ? (
          <p className="text-center text-gray-400 py-6">No pumps found</p>
        ) : (
          <div className="space-y-4">
            {islands.map(island => {
              const pumps = island.allPumps || island.assignedPumps || [];
              if (!pumps.length) return null;
              return (
                <div key={island.islandId}>
                  <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">
                    {island.islandName}
                  </p>
                  <div className="space-y-2">
                    {pumps.map(pump => {
                      const isCurrentWorker = pump.assignedWorkerId === worker._id;
                      const isOtherWorker   = pump.inUse && !isCurrentWorker;
                      const isSelected      = selected?.pumpId === pump.pumpId;

                      return (
                        <button key={pump.pumpId}
                          onClick={() => !isOtherWorker && setSelected({
                            pumpId:    pump.pumpId,
                            islandId:  island.islandId,
                            islandName: island.islandName,
                            pumpName:  pump.pumpName,
                          })}
                          className={`w-full flex items-center justify-between px-4 py-3 rounded-2xl border-2 transition-all text-sm
                            ${isSelected
                              ? 'border-indigo-500 bg-indigo-50'
                              : isOtherWorker
                              ? 'border-gray-100 bg-gray-50 opacity-60 cursor-not-allowed'
                              : 'border-gray-200 bg-white active:scale-95'
                            }`}>
                          <span className={`font-medium ${isSelected ? 'text-indigo-700' : 'text-gray-800'}`}>
                            {pump.pumpName || `Pump ${pump.pumpNumber}`}
                            {pump.productType ? <span className="text-gray-400 font-normal ml-1 text-xs">({pump.productType})</span> : null}
                          </span>
                          <div className="flex flex-col items-end gap-0.5">
                            <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${
                              isCurrentWorker
                                ? 'bg-blue-100 text-blue-700'
                                : isOtherWorker
                                ? 'bg-red-100 text-red-600'
                                : 'bg-green-100 text-green-700'
                            }`}>
                              {isCurrentWorker ? 'Current' : isOtherWorker ? 'In Use' : 'Available'}
                            </span>
                            {isOtherWorker && pump.assignedWorkerName && (
                              <span className="text-xs text-gray-400">{pump.assignedWorkerName}</span>
                            )}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {err && <p className="text-red-500 text-sm mt-3">{err}</p>}
        <button onClick={save} disabled={!selected || saving}
          className="w-full mt-4 py-3.5 bg-indigo-600 text-white font-semibold rounded-2xl flex items-center justify-center gap-2 disabled:opacity-50">
          {saving ? <Loader size={18} className="animate-spin" /> : null}
          {selected ? `Assign to ${selected.pumpName}` : 'Confirm Reassignment'}
        </button>
      </div>
    </ModalSheet>
  );
}

// ── Dedicated Meters tab ───────────────────────────────────────────────────────
function MeterEntryTab({ islands, pin, onSaved }) {
  // keyed by islandId: { [pumpKey]: { n1Open, n1Close, n2Open, n2Close } }
  const [values,  setValues ] = useState(() => {
    const init = {};
    islands.forEach(isl => {
      init[isl.islandId] = {};
      const pumps = isl.assignedPumps || [];
      pumps.forEach(p => {
        const key = String(p.pumpId || p.pumpNumber);
        const ex  = (isl.log?.pumps || []).find(lp => String(lp.pumpId || lp.pumpNumber) === key) || {};
        init[isl.islandId][key] = {
          n1Open:  ex.nozzle1?.opening  ?? '',
          n1Close: ex.nozzle1?.closing  ?? '',
          n2Open:  ex.nozzle2?.opening  ?? '',
          n2Close: ex.nozzle2?.closing  ?? '',
        };
      });
    });
    return init;
  });
  const [saving,  setSaving ] = useState({});   // { islandId: bool }
  const [saved,   setSaved  ] = useState({});   // { islandId: bool }
  const [errors,  setErrors ] = useState({});   // { islandId: string }
  const [expanded,setExpanded] = useState(() => {
    const e = {};
    islands.forEach(isl => { e[isl.islandId] = true; });
    return e;
  });

  const setVal = (islandId, pumpKey, field, val) =>
    setValues(prev => ({
      ...prev,
      [islandId]: { ...prev[islandId], [pumpKey]: { ...(prev[islandId]?.[pumpKey] || {}), [field]: val } },
    }));

  const saveIsland = async (isl) => {
    const id    = isl.islandId;
    const pumps = isl.assignedPumps || [];
    setSaving(p => ({ ...p, [id]: true }));
    setErrors(p => ({ ...p, [id]: '' }));
    setSaved(p =>  ({ ...p, [id]: false }));
    try {
      const submitPumps = pumps.map(p => {
        const key = String(p.pumpId || p.pumpNumber);
        const v   = values[id]?.[key] || {};
        return {
          pumpId:         p.pumpId,
          pumpNumber:     p.pumpNumber,
          pumpName:       p.pumpName,
          productType:    p.productType,
          nozzle1Opening: v.n1Open  !== '' ? Number(v.n1Open)  : null,
          nozzle1Closing: v.n1Close !== '' ? Number(v.n1Close) : null,
          nozzle2Opening: v.n2Open  !== '' ? Number(v.n2Open)  : null,
          nozzle2Closing: v.n2Close !== '' ? Number(v.n2Close) : null,
        };
      });
      const res = await axios.post(`${BASE}/supervisor/meter`, { pin, islandId: id, pumps: submitPumps });
      onSaved?.(res.data.data);
      setSaved(p => ({ ...p, [id]: true }));
      setTimeout(() => setSaved(p => ({ ...p, [id]: false })), 2500);
    } catch (e) {
      setErrors(p => ({ ...p, [id]: e.response?.data?.message || 'Save failed' }));
    } finally {
      setSaving(p => ({ ...p, [id]: false }));
    }
  };

  if (islands.length === 0) return (
    <div className="text-center py-16 text-gray-400">
      <Gauge size={40} className="mx-auto mb-3 opacity-30" />
      <p>No islands found</p>
    </div>
  );

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm font-bold text-gray-700">Enter meter readings per pump</p>
        <p className="text-xs text-gray-400">Morning = opening · Evening = closing</p>
      </div>

      {islands.map(isl => {
        const id     = isl.islandId;
        const pumps  = isl.assignedPumps || [];
        const log    = isl.log;
        const hasLog = !!log;
        const isOpen = expanded[id] !== false;

        // Status of this island's log
        const anyOpening = pumps.some(p => {
          const key = String(p.pumpId || p.pumpNumber);
          return values[id]?.[key]?.n1Open !== '' || values[id]?.[key]?.n2Open !== '';
        });
        const anyClosing = pumps.some(p => {
          const key = String(p.pumpId || p.pumpNumber);
          return values[id]?.[key]?.n1Close !== '' || values[id]?.[key]?.n2Close !== '';
        });

        return (
          <div key={id} className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
            {/* Island header */}
            <button
              className="w-full flex items-center justify-between px-4 py-3.5 active:bg-gray-50"
              onClick={() => setExpanded(p => ({ ...p, [id]: !p[id] }))}>
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 bg-indigo-100 rounded-xl flex items-center justify-center shrink-0">
                  <Fuel size={16} className="text-indigo-600" />
                </div>
                <div className="text-left">
                  <p className="font-bold text-gray-800 text-sm">{isl.islandName}</p>
                  <p className="text-xs text-gray-400">{pumps.length} pump{pumps.length !== 1 ? 's' : ''}</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                {anyClosing
                  ? <span className="text-[10px] font-bold bg-green-100 text-green-700 px-2 py-0.5 rounded-full">Closing set</span>
                  : anyOpening
                  ? <span className="text-[10px] font-bold bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full">Opening set</span>
                  : <span className="text-[10px] font-bold bg-gray-100 text-gray-500 px-2 py-0.5 rounded-full">Not entered</span>
                }
                {isOpen ? <ChevronDown size={16} className="text-gray-400" /> : <ChevronRight size={16} className="text-gray-400" />}
              </div>
            </button>

            {isOpen && (
              <div className="px-4 pb-4 space-y-4 border-t border-gray-100">
                {pumps.length === 0 ? (
                  <p className="text-xs text-gray-400 text-center py-3">No pumps configured for this island</p>
                ) : pumps.map(p => {
                  const key = String(p.pumpId || p.pumpNumber);
                  const v   = values[id]?.[key] || {};
                  const n1L = v.n1Close !== '' && v.n1Open !== '' ? Math.max(0, Number(v.n1Close) - Number(v.n1Open)) : null;
                  const n2L = v.n2Close !== '' && v.n2Open !== '' ? Math.max(0, Number(v.n2Close) - Number(v.n2Open)) : null;
                  const total = n1L != null || n2L != null ? (n1L || 0) + (n2L || 0) : null;

                  return (
                    <div key={key} className="mt-3">
                      {/* Pump header */}
                      <div className="flex items-center gap-2 mb-3">
                        <div className="w-7 h-7 bg-gray-100 rounded-lg flex items-center justify-center shrink-0">
                          <Gauge size={13} className="text-gray-500" />
                        </div>
                        <p className="font-bold text-gray-700 text-sm">{p.pumpName || `Pump ${p.pumpNumber}`}</p>
                        {p.productType && (
                          <span className="text-[10px] bg-indigo-50 text-indigo-600 font-semibold px-1.5 py-0.5 rounded-full">
                            {p.productType}
                          </span>
                        )}
                        {total != null && (
                          <span className="ml-auto text-xs font-black text-green-700 bg-green-50 px-2 py-0.5 rounded-full">
                            {fmtL(total)}
                          </span>
                        )}
                      </div>

                      {/* 2-column: Outer | Inner */}
                      <div className="grid grid-cols-2 gap-3">
                        {/* Outer nozzle */}
                        <div className="bg-blue-50 rounded-xl p-3 space-y-2">
                          <p className="text-[10px] font-bold text-blue-600 uppercase tracking-wide">Outer Nozzle</p>
                          <div>
                            <label className="text-[10px] text-gray-500 font-medium">Opening</label>
                            <input type="number" inputMode="decimal" value={v.n1Open}
                              onChange={e => setVal(id, key, 'n1Open', e.target.value)}
                              className="w-full mt-1 border border-blue-200 bg-white rounded-lg px-2.5 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-300"
                              placeholder="0.00" />
                          </div>
                          <div>
                            <label className="text-[10px] text-gray-500 font-medium">Closing</label>
                            <input type="number" inputMode="decimal" value={v.n1Close}
                              onChange={e => setVal(id, key, 'n1Close', e.target.value)}
                              className="w-full mt-1 border border-blue-200 bg-white rounded-lg px-2.5 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-300"
                              placeholder="0.00" />
                          </div>
                          {n1L != null && (
                            <p className="text-xs font-bold text-blue-700 text-right">{fmtL(n1L)}</p>
                          )}
                        </div>

                        {/* Inner nozzle */}
                        <div className="bg-purple-50 rounded-xl p-3 space-y-2">
                          <p className="text-[10px] font-bold text-purple-600 uppercase tracking-wide">Inner Nozzle</p>
                          <div>
                            <label className="text-[10px] text-gray-500 font-medium">Opening</label>
                            <input type="number" inputMode="decimal" value={v.n2Open}
                              onChange={e => setVal(id, key, 'n2Open', e.target.value)}
                              className="w-full mt-1 border border-purple-200 bg-white rounded-lg px-2.5 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-purple-300"
                              placeholder="0.00" />
                          </div>
                          <div>
                            <label className="text-[10px] text-gray-500 font-medium">Closing</label>
                            <input type="number" inputMode="decimal" value={v.n2Close}
                              onChange={e => setVal(id, key, 'n2Close', e.target.value)}
                              className="w-full mt-1 border border-purple-200 bg-white rounded-lg px-2.5 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-purple-300"
                              placeholder="0.00" />
                          </div>
                          {n2L != null && (
                            <p className="text-xs font-bold text-purple-700 text-right">{fmtL(n2L)}</p>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}

                {errors[id] && (
                  <p className="text-sm text-red-600 bg-red-50 rounded-xl px-3 py-2 text-center">{errors[id]}</p>
                )}

                <button onClick={() => saveIsland(isl)} disabled={saving[id]}
                  className={`w-full py-3.5 rounded-xl font-bold text-sm flex items-center justify-center gap-2 transition-all active:scale-95 ${
                    saved[id]
                      ? 'bg-green-500 text-white'
                      : 'bg-indigo-600 text-white disabled:opacity-60'
                  }`}>
                  {saving[id]
                    ? <><Loader size={16} className="animate-spin" /> Saving…</>
                    : saved[id]
                    ? <><CheckCircle size={16} /> Saved!</>
                    : <><Save size={16} /> Save {isl.islandName} Meters</>
                  }
                </button>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ── Island card (simplified — meters now in dedicated tab) ─────────────────────
function IslandCard({ island, pin, workers, allIslands, onStatusSaved, onReassignSaved }) {
  const [expanded,     setExpanded    ] = useState(false);
  const [statusOpen,   setStatusOpen  ] = useState(false);
  const [reassignOpen, setReassignOpen] = useState(false);

  const pumps = island.assignedPumps || [];
  const anyFaulty     = pumps.some(p => p.status === 'faulty');
  const anyOutOfStock = pumps.some(p => p.status === 'out_of_stock');
  const summaryStatus = anyFaulty ? 'faulty' : anyOutOfStock ? 'out_of_stock' : island.islandStatus;
  const st = STATUS_LABELS[summaryStatus] || STATUS_LABELS.active;

  const hasLog    = !!island.log;
  const logClosed = island.log?.status === 'closed';
  const assignedWorker = island.worker ? workers.find(w => w._id === island.worker.workerId) : null;

  return (
    <>
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="px-4 pt-4 pb-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-indigo-50 flex items-center justify-center shrink-0">
              <Fuel size={18} className="text-indigo-600" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-bold text-gray-800 text-sm">{island.islandName}</span>
                <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${st.cls}`}>{st.icon} {st.label}</span>
              </div>
              <p className="text-xs text-gray-400 mt-0.5">
                {island.worker ? `👷 ${island.worker.workerName}` : 'No worker assigned'}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {hasLog && island.log?.totalLitres > 0 && (
              <span className="text-xs font-bold text-green-700 bg-green-50 px-2 py-0.5 rounded-full">
                {fmtL(island.log.totalLitres)}
              </span>
            )}
            <button onClick={() => setExpanded(e => !e)} className="p-1.5 rounded-xl hover:bg-gray-100">
              {expanded ? <ChevronUp size={16} className="text-gray-400" /> : <ChevronDown size={16} className="text-gray-400" />}
            </button>
          </div>
        </div>

        {/* Expanded pump meter summary */}
        {expanded && hasLog && (island.log.pumps || []).length > 0 && (
          <div className="px-4 pb-3 space-y-2 border-t border-gray-100 pt-3">
            <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide">Today's Meter Readings</p>
            {island.log.pumps.map((pump, i) => {
              const pumpSt = pumps.find(p => String(p.pumpId) === String(pump.pumpId))?.status || 'active';
              const dot    = pumpSt === 'faulty' ? 'bg-red-500' : pumpSt === 'out_of_stock' ? 'bg-orange-500' : 'bg-green-500';
              return (
                <div key={i} className="bg-gray-50 rounded-xl p-3">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-1.5">
                      <span className={`w-2 h-2 rounded-full ${dot}`} />
                      <span className="text-xs font-bold text-gray-700">{pump.pumpName || `Pump ${pump.pumpNumber}`}</span>
                    </div>
                    {pump.totalLitres != null && (
                      <span className="text-xs font-black text-green-700">{fmtL(pump.totalLitres)}</span>
                    )}
                  </div>
                  <div className="grid grid-cols-4 gap-1 text-[10px]">
                    {[
                      { label: 'Outer Open',  val: pump.nozzle1?.opening },
                      { label: 'Outer Close', val: pump.nozzle1?.closing },
                      { label: 'Inner Open',  val: pump.nozzle2?.opening },
                      { label: 'Inner Close', val: pump.nozzle2?.closing },
                    ].map(({ label, val }) => (
                      <div key={label} className="text-center">
                        <p className="text-gray-400">{label}</p>
                        <p className="font-mono font-semibold text-gray-700 mt-0.5">
                          {val != null ? Number(val).toLocaleString('en-NG', { minimumFractionDigits: 1 }) : '—'}
                        </p>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Action row */}
        <div className="px-4 pb-4 flex gap-2 border-t border-gray-50 pt-3">
          <button onClick={() => setStatusOpen(true)}
            className="flex-1 py-2.5 bg-amber-50 text-amber-700 rounded-xl text-xs font-semibold active:scale-95 transition-transform">
            ⚙️ Pump Status
          </button>
          {island.worker && (
            <button onClick={() => setReassignOpen(true)}
              className="flex-1 py-2.5 bg-purple-50 text-purple-700 rounded-xl text-xs font-semibold active:scale-95 transition-transform">
              🔄 Reassign
            </button>
          )}
        </div>
      </div>

      {statusOpen && (
        <PumpStatusModal island={island} pin={pin}
          onClose={() => setStatusOpen(false)}
          onSaved={onStatusSaved} />
      )}
      {reassignOpen && assignedWorker && (
        <ReassignModal
          worker={{ ...assignedWorker, island: { islandName: island.islandName } }}
          islands={allIslands || []}
          pin={pin}
          onClose={() => setReassignOpen(false)}
          onSaved={onReassignSaved} />
      )}
    </>
  );
}

// ── Offence booking modal ──────────────────────────────────────────────────────
function OffenceModal({ workers, pin, defaultWorkerId, onClose, onSaved }) {
  const [workerId,    setWorkerId]    = useState(defaultWorkerId || '');
  const [offenceType, setOffenceType] = useState('late_arrival');
  const [severity,    setSeverity]    = useState('minor');
  const [description, setDescription] = useState('');
  const [action,      setAction]      = useState('verbal_warning');
  const [deduction,   setDeduction]   = useState('');
  const [witness,     setWitness]     = useState('');
  const [saving,      setSaving]      = useState(false);
  const [err,         setErr]         = useState('');

  const save = async () => {
    if (!workerId)    return setErr('Select a worker');
    if (!description) return setErr('Enter a description');
    setSaving(true); setErr('');
    try {
      await axios.post(`${BASE}/worker/book-offence`, {
        pin, workerId, offenceType, severity, description,
        action, deductionAmount: action === 'deduction' ? Number(deduction) : 0,
        witness,
      });
      onSaved();
      onClose();
    } catch (e) {
      setErr(e.response?.data?.message || 'Failed to book offence');
    } finally { setSaving(false); }
  };

  return (
    <ModalSheet title="Book Offence" onClose={onClose}>
      <div className="space-y-4">
        <div>
          <label className="text-xs font-semibold text-gray-500 uppercase mb-1 block">Worker</label>
          <select value={workerId} onChange={e => setWorkerId(e.target.value)}
            className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-red-300">
            <option value="">Select worker…</option>
            {workers.map(w => <option key={w._id} value={w._id}>{w.fullName}</option>)}
          </select>
        </div>

        <div>
          <label className="text-xs font-semibold text-gray-500 uppercase mb-1 block">Offence Type</label>
          <select value={offenceType} onChange={e => setOffenceType(e.target.value)}
            className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-red-300">
            {OFFENCE_TYPES.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-xs font-semibold text-gray-500 uppercase mb-1 block">Severity</label>
            <select value={severity} onChange={e => setSeverity(e.target.value)}
              className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-red-300">
              {SEVERITIES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
            </select>
          </div>
          <div>
            <label className="text-xs font-semibold text-gray-500 uppercase mb-1 block">Action</label>
            <select value={action} onChange={e => setAction(e.target.value)}
              className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-red-300">
              {ACTIONS.map(a => <option key={a.value} value={a.value}>{a.label}</option>)}
            </select>
          </div>
        </div>

        {action === 'deduction' && (
          <div>
            <label className="text-xs font-semibold text-gray-500 uppercase mb-1 block">Deduction Amount (₦)</label>
            <input type="number" inputMode="decimal" value={deduction} onChange={e => setDeduction(e.target.value)}
              className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-red-300"
              placeholder="e.g. 5000" />
          </div>
        )}

        <div>
          <label className="text-xs font-semibold text-gray-500 uppercase mb-1 block">Description</label>
          <textarea value={description} onChange={e => setDescription(e.target.value)} rows={3}
            className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-red-300"
            placeholder="Describe what happened…" />
        </div>

        <div>
          <label className="text-xs font-semibold text-gray-500 uppercase mb-1 block">Witness (optional)</label>
          <input type="text" value={witness} onChange={e => setWitness(e.target.value)}
            className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-red-300"
            placeholder="Name of witness" />
        </div>

        {err && <p className="text-red-500 text-sm">{err}</p>}
        <button onClick={save} disabled={saving}
          className="w-full py-3.5 bg-red-500 text-white font-semibold rounded-2xl flex items-center justify-center gap-2 disabled:opacity-50">
          {saving ? <Loader size={18} className="animate-spin" /> : null}
          Book Offence
        </button>
      </div>
    </ModalSheet>
  );
}

// ── Supervisor Break Modal ─────────────────────────────────────────────────────
function BreakModal({ worker, supervisorPin, onClose }) {
  const [status,    setStatus   ] = useState(null);
  const [loading,   setLoading  ] = useState(true);
  const [acting,    setActing   ] = useState(false);
  const [err,       setErr      ] = useState('');
  const [confirm,   setConfirm  ] = useState(null); // { type, label, allowedMinutes }

  const loadStatus = useCallback(async () => {
    setLoading(true); setErr('');
    try {
      const res = await axios.post(`${BASE}/supervisor/break-worker`, {
        pin: supervisorPin, workerId: worker._id, action: 'status',
      });
      setStatus(res.data.data);
    } catch (e) { setErr(e.response?.data?.message || 'Could not load break status'); }
    finally { setLoading(false); }
  }, [supervisorPin, worker._id]);

  useEffect(() => { loadStatus(); }, [loadStatus]);

  const doStart = async (breakType) => {
    setActing(true); setErr('');
    try {
      await axios.post(`${BASE}/supervisor/break-worker`, {
        pin: supervisorPin, workerId: worker._id, action: 'start', breakType,
      });
      setConfirm(null);
      await loadStatus();
    } catch (e) { setErr(e.response?.data?.message || 'Failed to start break'); }
    finally { setActing(false); }
  };

  const doEnd = async () => {
    setActing(true); setErr('');
    try {
      await axios.post(`${BASE}/supervisor/break-worker`, {
        pin: supervisorPin, workerId: worker._id, action: 'end',
      });
      await loadStatus();
    } catch (e) { setErr(e.response?.data?.message || 'Failed to end break'); }
    finally { setActing(false); }
  };

  return (
    <div className="fixed inset-0 z-50 flex flex-col justify-end" onClick={onClose}>
      <div className="absolute inset-0 bg-black/50" />
      <div className="relative bg-white rounded-t-3xl shadow-2xl max-h-[85vh] flex flex-col"
           onClick={e => e.stopPropagation()}>
        <div className="flex justify-center pt-3 pb-1">
          <div className="w-10 h-1 bg-gray-300 rounded-full" />
        </div>
        <div className="flex items-center justify-between px-5 py-3 border-b border-gray-100">
          <div className="flex items-center gap-3">
            {worker.photo
              ? <img src={worker.photo} alt="" className="w-9 h-9 rounded-full object-cover shrink-0" />
              : <div className="w-9 h-9 rounded-full bg-indigo-100 flex items-center justify-center shrink-0">
                  <span className="text-indigo-600 font-bold text-sm">{worker.fullName[0]}</span>
                </div>
            }
            <div>
              <p className="font-bold text-gray-800 text-sm">{worker.fullName}</p>
              <p className="text-xs text-gray-400">☕ Break management</p>
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-full hover:bg-gray-100">
            <X size={18} className="text-gray-500" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4">
          {loading ? (
            <div className="flex flex-col items-center justify-center py-12 gap-3 text-indigo-600">
              <Loader size={28} className="animate-spin" />
              <p className="text-sm text-gray-400">Loading break status…</p>
            </div>
          ) : err ? (
            <div className="text-center py-8">
              <p className="text-red-500 text-sm mb-3">{err}</p>
              <button onClick={loadStatus} className="text-xs bg-indigo-100 text-indigo-600 font-semibold px-4 py-2 rounded-xl">Retry</button>
            </div>
          ) : (
            <>
              {/* Active break */}
              {status?.activeBreak ? (
                <div>
                  <div className={`rounded-2xl p-4 mb-4 ${status.activeBreak.isOverdue ? 'bg-red-50 border border-red-200' : 'bg-amber-50 border border-amber-200'}`}>
                    <div className="flex items-center justify-between mb-2">
                      <p className={`font-bold text-base ${status.activeBreak.isOverdue ? 'text-red-700' : 'text-amber-700'}`}>
                        {status.activeBreak.label}
                        {status.activeBreak.isOverdue ? ' — OVERDUE ⚠️' : ''}
                      </p>
                      <span className={`text-sm font-black ${status.activeBreak.isOverdue ? 'text-red-600' : 'text-amber-600'}`}>
                        {status.activeBreak.elapsedMinutes} / {status.activeBreak.allowedMinutes} min
                      </span>
                    </div>
                    {status.activeBreak.isOverdue && (
                      <p className="text-sm text-red-600">{status.activeBreak.excessMinutes} min over limit</p>
                    )}
                    <p className="text-xs text-gray-500 mt-1">Started: {new Date(status.activeBreak.startTime).toLocaleTimeString('en-NG', { hour: '2-digit', minute: '2-digit', hour12: true })}</p>
                  </div>
                  {err && <p className="text-sm text-red-500 text-center mb-3">{err}</p>}
                  <button onClick={doEnd} disabled={acting}
                    className="w-full py-4 bg-green-600 text-white font-bold rounded-2xl active:scale-95 disabled:opacity-60 flex items-center justify-center gap-2">
                    {acting ? <Loader size={18} className="animate-spin" /> : '✓ End Break for ' + worker.fullName.split(' ')[0]}
                  </button>
                  <button onClick={loadStatus} className="w-full py-2 mt-2 text-xs text-gray-400 font-medium text-center">
                    Refresh status
                  </button>
                </div>
              ) : (
                <div>
                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">
                    Available Breaks for {worker.fullName.split(' ')[0]}
                  </p>
                  {err && <p className="text-sm text-red-500 bg-red-50 rounded-xl px-3 py-2 text-center mb-3">{err}</p>}
                  {(status?.availableBreaks || []).length === 0 ? (
                    <div className="text-center py-8 text-gray-400">
                      <p className="text-3xl mb-2">☕</p>
                      <p className="text-sm">No breaks enabled for this branch</p>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {(status?.availableBreaks || []).map(b => {
                        const off = b.taken || !b.inWindow;
                        return (
                          <button key={b.type} disabled={off || acting}
                            onClick={() => !off && setConfirm(b)}
                            className={`w-full flex items-center justify-between px-4 py-4 rounded-2xl border-2 transition-all active:scale-95
                              ${b.taken ? 'border-gray-100 bg-gray-50 opacity-60 cursor-not-allowed'
                               : b.inWindow ? 'border-indigo-200 bg-indigo-50 hover:border-indigo-400'
                               : 'border-gray-100 bg-gray-50 opacity-60 cursor-not-allowed'}`}>
                            <div className="text-left">
                              <p className={`font-bold text-sm ${b.taken || !b.inWindow ? 'text-gray-400' : 'text-indigo-800'}`}>
                                {b.label}
                              </p>
                              <p className="text-xs text-gray-400 mt-0.5">
                                {b.windowStart} – {b.windowEnd}
                              </p>
                            </div>
                            <div className="flex flex-col items-end gap-1 shrink-0">
                              <span className={`text-xs font-bold px-2.5 py-1 rounded-full
                                ${b.taken ? 'bg-green-100 text-green-700' : b.inWindow ? 'bg-indigo-100 text-indigo-700' : 'bg-gray-100 text-gray-400'}`}>
                                {b.taken ? '✓ Done' : b.inWindow ? `${b.allowedMinutes} min` : 'Not yet'}
                              </span>
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  )}
                  {status?.todayBreaks?.length > 0 && (
                    <div className="mt-4 bg-gray-50 rounded-xl p-3">
                      <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide mb-2">Today's Breaks</p>
                      {status.todayBreaks.map((b, i) => (
                        <div key={i} className="flex items-center justify-between text-xs py-1">
                          <span className="text-gray-600 font-medium">{b.label}</span>
                          <div className="flex items-center gap-2">
                            <span className="text-gray-400">{b.actualMinutes} min</span>
                            <span className={`font-bold px-1.5 py-0.5 rounded-full text-[10px]
                              ${b.status === 'overstayed' ? 'bg-red-100 text-red-600' : 'bg-green-100 text-green-700'}`}>
                              {b.status === 'overstayed' ? 'Over' : 'OK'}
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* Confirm sheet */}
              {confirm && (
                <div className="fixed inset-0 z-60 flex flex-col justify-end" onClick={() => setConfirm(null)}>
                  <div className="absolute inset-0 bg-black/30" />
                  <div className="relative bg-white rounded-t-3xl shadow-2xl px-5 pt-4 pb-8" onClick={e => e.stopPropagation()}>
                    <div className="text-center mb-5">
                      <p className="text-3xl mb-2">☕</p>
                      <p className="font-bold text-gray-800 text-lg">{confirm.label}</p>
                      <p className="text-gray-500 text-sm mt-1">for {worker.fullName.split(' ')[0]} · <strong>{confirm.allowedMinutes} minutes</strong></p>
                    </div>
                    {err && <p className="text-sm text-red-500 bg-red-50 rounded-xl px-3 py-2 text-center mb-3">{err}</p>}
                    <button onClick={() => doStart(confirm.type)} disabled={acting}
                      className="w-full py-4 bg-indigo-600 text-white font-bold rounded-2xl active:scale-95 disabled:opacity-60 flex items-center justify-center gap-2">
                      {acting ? <Loader size={18} className="animate-spin" /> : 'Start Break'}
                    </button>
                    <button onClick={() => { setConfirm(null); setErr(''); }}
                      className="w-full py-3 mt-2 text-gray-500 text-sm font-medium text-center">
                      Cancel
                    </button>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Worker row (in workers tab) ────────────────────────────────────────────────
// ── Clock-in / Clock-out modal ─────────────────────────────────────────────────
function ClockModal({ worker, supervisorPin, skipPin, onSuccess, onClose }) {
  const clockType = worker.todayStatus?.clockedIn ? 'clock_out' : 'clock_in';
  const [step,      setStep     ] = useState(skipPin ? 'face' : 'pin');
  const [workerPin, setWorkerPin] = useState(skipPin ? supervisorPin : '');
  const [progress,  setProgress ] = useState(0);
  const [liveScore, setLiveScore] = useState(null);
  const [err,       setErr      ] = useState('');
  const [result,    setResult   ] = useState(null);

  const videoRef  = useRef(null);
  const overlayRef = useRef(null);
  const streamRef  = useRef(null);
  const loopRef    = useRef(null);
  const stableRef  = useRef(0);
  const pinRef     = useRef(skipPin ? supervisorPin : '');  // always-current pin for closure

  const stopCamera = useCallback(() => {
    cancelAnimationFrame(loopRef.current);
    streamRef.current?.getTracks().forEach(t => t.stop());
    streamRef.current = null;
  }, []);

  useEffect(() => () => stopCamera(), [stopCamera]);

  // Start camera when entering face step (only if worker has face)
  useEffect(() => {
    if (step !== 'face' || !worker.hasFace) return;
    let cancelled = false;
    (async () => {
      try {
        await loadFaceModels(p => { if (!cancelled) setProgress(p); });
        const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user' } });
        if (cancelled) { stream.getTracks().forEach(t => t.stop()); return; }
        streamRef.current = stream;
        if (videoRef.current) { videoRef.current.srcObject = stream; videoRef.current.play(); }
      } catch (e) {
        if (!cancelled) { setErr('Camera error: ' + (e.message || e)); setStep('error'); }
      }
    })();
    return () => { cancelled = true; stopCamera(); };
  }, [step, worker.hasFace, stopCamera]);

  // Face detection loop
  useEffect(() => {
    if (step !== 'face' || !worker.hasFace || !worker.faceDescriptor?.length) return;
    const refDesc = new Float32Array(worker.faceDescriptor);
    const loop = async () => {
      const video = videoRef.current, overlay = overlayRef.current;
      if (!video || !overlay || video.readyState < 2) {
        loopRef.current = requestAnimationFrame(loop); return;
      }
      try {
        const det = await faceapi
          .detectSingleFace(video, new faceapi.SsdMobilenetv1Options({ minConfidence: 0.5 }))
          .withFaceLandmarks().withFaceDescriptor();
        const ctx = overlay.getContext('2d');
        ctx.clearRect(0, 0, overlay.width, overlay.height);
        overlay.width = video.videoWidth; overlay.height = video.videoHeight;
        if (det) {
          const dist  = faceapi.euclideanDistance(refDesc, det.descriptor);
          const score = Math.round(Math.max(0, Math.min(100, (1 - dist) * 145)));
          setLiveScore(score);
          const matched = dist < VERIFY_THRESHOLD;
          ctx.strokeStyle = matched ? '#22c55e' : dist < 0.65 ? '#f59e0b' : '#ef4444';
          ctx.lineWidth = 3;
          const b = det.detection.box;
          ctx.strokeRect(b.x, b.y, b.width, b.height);
          if (matched) {
            stableRef.current++;
            if (stableRef.current >= STABLE_FRAMES) { stopCamera(); doSubmit(score); return; }
          } else stableRef.current = 0;
        } else { setLiveScore(null); stableRef.current = 0; }
      } catch {}
      loopRef.current = requestAnimationFrame(loop);
    };
    loopRef.current = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(loopRef.current);
  }, [step, worker.hasFace, worker.faceDescriptor, stopCamera]);

  const doSubmit = async (faceMatchScore = null, pinOverride = null) => {
    setStep('submitting');
    try {
      const res = await axios.post(`${BASE}/supervisor/clock-worker`, {
        pin:           supervisorPin,
        workerId:      worker._id,
        workerPin:     pinOverride ?? pinRef.current,
        type:          clockType,
        faceMatchScore,
      });
      setResult(res.data);
      setStep('success');
      onSuccess?.(worker._id, clockType);
    } catch (e) {
      const msg = e.response?.data?.message || 'Clock failed — try again';
      setErr(msg);
      setStep(e.response?.data?.alreadyDone ? 'already' : 'error');
    }
  };

  const handlePinKey = (key) => {
    if (workerPin.length >= 4) return;
    const next = workerPin + key;
    pinRef.current = next;
    setWorkerPin(next);
    if (next.length === 4) {
      setTimeout(() => {
        if (worker.hasFace) setStep('face');
        else doSubmit(null, next);
      }, 200);
    }
  };

  const typeCls   = clockType === 'clock_in' ? 'text-green-700' : 'text-red-600';
  const typeBg    = clockType === 'clock_in' ? 'bg-green-600'   : 'bg-red-500';
  const typeLabel = clockType === 'clock_in' ? 'Clock In'        : 'Clock Out';

  const KEYS = [['1','2','3'],['4','5','6'],['7','8','9'],[null,'0','del']];

  return (
    <div className="fixed inset-0 z-50 flex flex-col justify-end" onClick={onClose}>
      <div className="absolute inset-0 bg-black/50" />
      <div className="relative bg-white rounded-t-3xl shadow-2xl max-h-[92vh] flex flex-col"
           onClick={e => e.stopPropagation()}>
        <div className="flex justify-center pt-3 pb-1">
          <div className="w-10 h-1 bg-gray-300 rounded-full" />
        </div>
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-gray-100">
          <div className="flex items-center gap-3">
            {worker.photo
              ? <img src={worker.photo} alt="" className="w-9 h-9 rounded-full object-cover shrink-0" />
              : <div className="w-9 h-9 rounded-full bg-indigo-100 flex items-center justify-center shrink-0">
                  <span className="text-indigo-600 font-bold text-sm">{worker.fullName[0]}</span>
                </div>
            }
            <div>
              <p className="font-bold text-gray-800 text-sm leading-tight">{worker.fullName}</p>
              <p className={`text-xs font-semibold ${typeCls}`}>{typeLabel}</p>
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-full hover:bg-gray-100">
            <X size={18} className="text-gray-500" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4">
          {/* ── PIN STEP ── */}
          {step === 'pin' && (
            <div>
              <p className="text-center text-sm text-gray-500 mb-5">
                Ask <strong>{worker.fullName.split(' ')[0]}</strong> to enter their PIN
              </p>
              <div className="flex justify-center gap-4 mb-6">
                {[0,1,2,3].map(i => (
                  <div key={i} className={`w-5 h-5 rounded-full border-2 transition-all ${
                    workerPin.length > i ? 'bg-indigo-600 border-indigo-600 scale-110' : 'border-gray-300'
                  }`} />
                ))}
              </div>
              <div className="space-y-3">
                {KEYS.map((row, ri) => (
                  <div key={ri} className="grid grid-cols-3 gap-3">
                    {row.map((key, ki) => {
                      if (key === null) return <div key={ki} />;
                      if (key === 'del') return (
                        <button key={ki}
                          onClick={() => { const n = workerPin.slice(0,-1); pinRef.current = n; setWorkerPin(n); }}
                          className="h-14 rounded-2xl bg-gray-100 hover:bg-gray-200 active:scale-95 flex items-center justify-center transition-all">
                          <Delete size={20} className="text-gray-600" />
                        </button>
                      );
                      return (
                        <button key={ki} onClick={() => handlePinKey(key)} disabled={workerPin.length >= 4}
                          className="h-14 rounded-2xl bg-gray-50 border border-gray-200 hover:bg-indigo-50 hover:border-indigo-300 active:scale-95 transition-all flex items-center justify-center text-2xl font-bold text-gray-800 disabled:opacity-40 select-none">
                          {key}
                        </button>
                      );
                    })}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ── FACE STEP ── */}
          {step === 'face' && (
            <div className="space-y-4">
              {!worker.hasFace ? (
                <div className="text-center py-10">
                  <p className="text-5xl mb-3">👤</p>
                  <p className="font-semibold text-gray-700">No face registered</p>
                  <p className="text-sm text-gray-400 mt-1 mb-6">PIN verified — tap to confirm</p>
                  <button onClick={() => doSubmit(null)}
                    className={`w-full py-4 rounded-2xl text-white font-bold text-base ${typeBg}`}>
                    Confirm {typeLabel}
                  </button>
                </div>
              ) : (
                <>
                  <p className="text-center text-sm text-gray-500">
                    {worker.fullName.split(' ')[0]}, look at the camera
                  </p>
                  <div className="relative rounded-2xl overflow-hidden bg-black mx-auto"
                       style={{ width: '100%', maxWidth: 280, aspectRatio: '1 / 1' }}>
                    <video ref={videoRef} muted playsInline autoPlay
                      className="w-full h-full object-cover scale-x-[-1]" />
                    <canvas ref={overlayRef}
                      className="absolute inset-0 w-full h-full scale-x-[-1] pointer-events-none" />
                    {progress < 100 && (
                      <div className="absolute inset-0 bg-black/70 flex flex-col items-center justify-center gap-2 text-white">
                        <Loader size={24} className="animate-spin" />
                        <p className="text-sm">Loading… {progress}%</p>
                      </div>
                    )}
                  </div>
                  {liveScore != null && (
                    <div className="flex items-center gap-2 max-w-xs mx-auto">
                      <div className="flex-1 h-2 bg-gray-200 rounded-full overflow-hidden">
                        <div style={{ width: `${liveScore}%` }}
                          className={`h-full rounded-full transition-all ${
                            liveScore >= 70 ? 'bg-green-500' : liveScore >= 50 ? 'bg-amber-500' : 'bg-red-500'
                          }`} />
                      </div>
                      <span className={`text-xs font-bold w-8 ${
                        liveScore >= 70 ? 'text-green-600' : liveScore >= 50 ? 'text-amber-500' : 'text-red-500'
                      }`}>{liveScore}%</span>
                    </div>
                  )}
                  {liveScore == null && progress >= 100 && (
                    <p className="text-center text-xs text-gray-400">Position face in frame…</p>
                  )}
                </>
              )}
            </div>
          )}

          {/* ── SUBMITTING ── */}
          {step === 'submitting' && (
            <div className="flex flex-col items-center justify-center py-16 gap-3">
              <Loader size={36} className="animate-spin text-indigo-600" />
              <p className="text-sm text-gray-500 font-medium">Recording {typeLabel.toLowerCase()}…</p>
            </div>
          )}

          {/* ── SUCCESS ── */}
          {step === 'success' && (
            <div className="text-center py-8">
              <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <CheckCircle size={32} className="text-green-600" />
              </div>
              <p className="text-xl font-bold text-gray-800">
                {clockType === 'clock_in' ? 'Clocked In!' : 'Clocked Out!'}
              </p>
              <p className="text-gray-500 text-sm mt-1">{worker.fullName}</p>
              {result?.data?.timeStr && (
                <p className="text-indigo-600 font-black text-2xl mt-2">{result.data.timeStr}</p>
              )}
              {result?.data?.pumpAssignment?.islandName && (
                <div className="mt-4 bg-indigo-50 rounded-2xl px-4 py-3 text-left">
                  <p className="text-xs font-semibold text-indigo-500 mb-1">⛽ Assigned To</p>
                  <p className="text-sm font-bold text-indigo-800">{result.data.pumpAssignment.islandName}</p>
                </div>
              )}
              <button onClick={onClose}
                className="mt-6 w-full bg-indigo-600 text-white font-bold py-4 rounded-2xl active:scale-95">
                Done
              </button>
            </div>
          )}

          {/* ── ALREADY DONE ── */}
          {step === 'already' && (
            <div className="text-center py-10">
              <p className="text-4xl mb-3">ℹ️</p>
              <p className="font-semibold text-gray-700 mb-1">Already Recorded</p>
              <p className="text-sm text-gray-500 mb-6">{err}</p>
              <button onClick={onClose} className="w-full bg-gray-100 text-gray-600 font-bold py-3.5 rounded-2xl">Close</button>
            </div>
          )}

          {/* ── ERROR ── */}
          {step === 'error' && (
            <div className="text-center py-8">
              <div className="w-14 h-14 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-3">
                <X size={26} className="text-red-500" />
              </div>
              <p className="font-bold text-gray-700 mb-1">Failed</p>
              <p className="text-sm text-gray-500 mb-6">{err}</p>
              <div className="flex gap-3">
                <button onClick={onClose} className="flex-1 py-3.5 rounded-2xl bg-gray-100 text-gray-600 font-semibold">
                  Cancel
                </button>
                <button
                  onClick={() => {
                    setErr(''); setLiveScore(null); stableRef.current = 0;
                    if (skipPin) { pinRef.current = supervisorPin; setWorkerPin(supervisorPin); setStep('face'); }
                    else { pinRef.current = ''; setWorkerPin(''); setStep('pin'); }
                  }}
                  className="flex-1 py-3.5 rounded-2xl bg-indigo-600 text-white font-semibold">
                  Retry
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function WorkerRow({ worker, islands, pin, onShortage, onOffence, onReassign, onClock, onBreak }) {
  const { clockedIn, clockedOut } = worker.todayStatus || {};
  const clockLabel = clockedIn ? (clockedOut ? 'Clock out done' : 'Clock Out') : 'Clock In';
  const clockBg    = clockedIn ? (clockedOut ? 'bg-gray-100 text-gray-400' : 'bg-red-50 text-red-600')
                               : 'bg-green-50 text-green-600';
  return (
    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 px-4 py-3 flex items-center gap-3">
      {worker.photo ? (
        <img src={worker.photo} alt="" className="w-10 h-10 rounded-full object-cover shrink-0" />
      ) : (
        <div className="w-10 h-10 rounded-full bg-indigo-100 flex items-center justify-center shrink-0">
          <span className="text-indigo-600 font-bold text-sm">{worker.fullName.charAt(0)}</span>
        </div>
      )}
      <div className="flex-1 min-w-0">
        <p className="font-semibold text-gray-800 text-sm truncate">{worker.fullName}</p>
        <div className="flex items-center gap-1.5 mt-0.5">
          <span className={`inline-flex items-center gap-1 text-xs font-medium ${clockedIn ? 'text-green-600' : 'text-gray-400'}`}>
            <span className={`w-1.5 h-1.5 rounded-full ${clockedIn ? 'bg-green-500' : 'bg-gray-300'}`} />
            {clockedIn ? 'In' : 'Out'}
          </span>
          <span className="text-gray-300">·</span>
          <p className="text-xs text-gray-500 truncate">{worker.island?.islandName || 'Unassigned'}</p>
        </div>
      </div>
      <div className="flex gap-1.5 shrink-0">
        <button onClick={() => onClock(worker)} disabled={clockedIn && clockedOut}
          className={`px-2.5 py-1.5 rounded-xl text-xs font-semibold active:scale-95 transition-all ${clockBg} disabled:cursor-not-allowed`}
          title={clockLabel}>
          {clockedIn && clockedOut ? '✓' : clockedIn ? '🔴 Out' : '🟢 In'}
        </button>
        <button onClick={() => onBreak(worker)} disabled={!clockedIn || clockedOut}
          className="p-2 bg-amber-50 text-amber-600 rounded-xl text-xs active:scale-95 transition-transform disabled:opacity-30 disabled:cursor-not-allowed"
          title="Manage Break">
          ☕
        </button>
        <button onClick={() => onShortage(worker)}
          className="p-2 bg-orange-50 text-orange-600 rounded-xl text-xs active:scale-95 transition-transform"
          title="Book Shortage">
          💸
        </button>
        <button onClick={() => onOffence(worker)}
          className="p-2 bg-red-50 text-red-600 rounded-xl text-xs active:scale-95 transition-transform"
          title="Book Offence">
          ⚠️
        </button>
        <button onClick={() => onReassign(worker)}
          className="p-2 bg-purple-50 text-purple-600 rounded-xl text-xs active:scale-95 transition-transform"
          title="Reassign">
          🔄
        </button>
      </div>
    </div>
  );
}

// ── Main page ──────────────────────────────────────────────────────────────────
export default function SupervisorDashboard() {
  const [role, setRole]         = useState(null);   // null | 'supervisor' | 'worker'
  const [pin, setPin]           = useState('');
  const [pinLoading, setPinLoading] = useState(false);
  const [pinError, setPinError] = useState('');
  const [data, setData]         = useState(null);
  const [tab, setTab]           = useState('islands');
  const [refreshing, setRefreshing] = useState(false);

  // Profile tab state
  const [profileData,    setProfileData]    = useState(null);
  const [profileLoading, setProfileLoading] = useState(false);
  const [profileErr,     setProfileErr]     = useState('');
  const now = new Date();
  const [profileMonth, setProfileMonth] = useState(now.getMonth() + 1);
  const [profileYear,  setProfileYear]  = useState(now.getFullYear());

  // Modal states
  const [shortageFor, setShortageFor]   = useState(null);  // worker object
  const [offenceFor,  setOffenceFor]    = useState(null);  // worker object
  const [reassignFor, setReassignFor]   = useState(null);  // worker object
  const [clockFor,    setClockFor]      = useState(null);  // worker object | 'self'
  const [breakFor,    setBreakFor]      = useState(null);  // worker object

  const handleClockSuccess = useCallback((workerId, type) => {
    setData(prev => {
      if (!prev) return prev;
      // Update workers list
      const updatedWorkers = (prev.workers || []).map(w => {
        if (w._id !== workerId) return w;
        const ts = w.todayStatus || {};
        return {
          ...w,
          todayStatus: {
            ...ts,
            clockedIn:  type === 'clock_in'  ? true  : ts.clockedIn,
            clockedOut: type === 'clock_out' ? true  : ts.clockedOut,
          },
        };
      });
      // Update supervisor todayStatus if clocking self
      const sup = prev.supervisor;
      if (sup && (sup._id === workerId || workerId === 'self')) {
        return {
          ...prev,
          workers: updatedWorkers,
          supervisor: {
            ...sup,
            todayStatus: {
              ...(sup.todayStatus || {}),
              clockedIn:  type === 'clock_in'  ? true  : sup.todayStatus?.clockedIn,
              clockedOut: type === 'clock_out' ? true  : sup.todayStatus?.clockedOut,
            },
          },
        };
      }
      return { ...prev, workers: updatedWorkers };
    });
  }, []);

  const fetchDashboard = useCallback(async (p) => {
    try {
      const res = await axios.post(`${BASE}/supervisor/dashboard`, { pin: p || pin });
      setData(res.data.data);
      return true;
    } catch (e) {
      setPinError(e.response?.data?.message || 'Login failed');
      return false;
    }
  }, [pin]);

  const handlePin = async (p) => {
    setPinLoading(true); setPinError('');
    const ok = await fetchDashboard(p);
    if (ok) setPin(p);
    setPinLoading(false);
  };

  const refresh = async () => {
    setRefreshing(true);
    await fetchDashboard();
    setRefreshing(false);
  };

  const loadProfile = async (p, mo, yr) => {
    setProfileLoading(true); setProfileErr('');
    try {
      const res = await axios.get(`${BASE}/shortages/worker/dashboard`, {
        params: { pin: p || pin, month: mo || profileMonth, year: yr || profileYear },
      });
      setProfileData(res.data.data);
    } catch (e) {
      setProfileErr(e.response?.data?.message || 'Could not load profile');
    } finally { setProfileLoading(false); }
  };

  const changeProfileMonth = (dir) => {
    let mo = profileMonth + dir, yr = profileYear;
    if (mo < 1)  { mo = 12; yr--; }
    if (mo > 12) { mo = 1;  yr++; }
    setProfileMonth(mo); setProfileYear(yr);
    loadProfile(pin, mo, yr);
  };

  const handleTabChange = (t) => {
    setTab(t);
    if (t === 'profile' && !profileData && !profileLoading) loadProfile();
  };

  const handleMeterSaved = (log) => {
    setData(prev => {
      if (!prev) return prev;
      return {
        ...prev,
        islands: prev.islands.map(i =>
          i.islandId === String(log.islandId) ? { ...i, log: {
            _id: String(log._id), status: log.status, pumps: log.pumps, totalLitres: log.totalLitres,
          }} : i
        ),
      };
    });
  };

  // Called per-pump: (pumpId, newStatus)
  const handleStatusSaved = (pumpId, newStatus) => {
    setData(prev => {
      if (!prev) return prev;
      return {
        ...prev,
        islands: prev.islands.map(i => ({
          ...i,
          assignedPumps: i.assignedPumps.map(p =>
            p.pumpId === pumpId ? { ...p, status: newStatus } : p
          ),
        })),
      };
    });
  };

  const handleReassignSaved = () => {
    // Refresh full data after reassignment since multiple things change
    fetchDashboard();
  };

  // ── Role picker ─────────────────────────────────────────────────────────────
  if (!role) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-indigo-50 to-purple-50 flex items-center justify-center p-5">
        <div className="w-full max-w-sm">
          <div className="text-center mb-8">
            <div className="w-16 h-16 bg-indigo-600 rounded-2xl flex items-center justify-center mx-auto mb-4 shadow-lg">
              <span className="text-3xl">⛽</span>
            </div>
            <h1 className="text-2xl font-black text-gray-800">Sage Energy</h1>
            <p className="text-gray-500 text-sm mt-1">Who are you logging in as?</p>
          </div>

          <div className="space-y-3">
            <button
              onClick={() => setRole('supervisor')}
              className="w-full bg-indigo-600 text-white rounded-2xl px-5 py-5 flex items-center gap-4 shadow-md active:scale-95 transition-all">
              <div className="w-12 h-12 bg-white/20 rounded-xl flex items-center justify-center shrink-0">
                <span className="text-2xl">🧑‍💼</span>
              </div>
              <div className="text-left">
                <p className="font-bold text-base">Supervisor</p>
                <p className="text-indigo-200 text-xs mt-0.5">Manage islands, meters & workers</p>
              </div>
              <span className="ml-auto text-indigo-300 text-lg">›</span>
            </button>

            <button
              onClick={() => window.location.href = '/my-dashboard'}
              className="w-full bg-white text-gray-800 rounded-2xl px-5 py-5 flex items-center gap-4 shadow-sm border border-gray-200 active:scale-95 transition-all">
              <div className="w-12 h-12 bg-amber-100 rounded-xl flex items-center justify-center shrink-0">
                <span className="text-2xl">👷</span>
              </div>
              <div className="text-left">
                <p className="font-bold text-base">Pump Worker</p>
                <p className="text-gray-400 text-xs mt-0.5">View your salary & pump info</p>
              </div>
              <span className="ml-auto text-gray-300 text-lg">›</span>
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ── PIN screen ──────────────────────────────────────────────────────────────
  if (!data) {
    return (
      <div>
        <PinPad onSubmit={handlePin} loading={pinLoading} error={pinError} />
        <div className="fixed bottom-6 left-0 right-0 flex justify-center">
          <button onClick={() => setRole(null)}
            className="text-xs text-gray-400 hover:text-gray-600 bg-white px-4 py-2 rounded-full shadow-sm border border-gray-100">
            ← Back to login options
          </button>
        </div>
      </div>
    );
  }

  const { supervisor, date, islands, workers } = data;

  const fmtDate = (d) => {
    if (!d) return '';
    const [y, m, day] = d.split('-');
    const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    return `${day} ${months[+m - 1]} ${y}`;
  };

  const clockedInCount = workers.filter(w => w.todayStatus?.clockedIn).length;

  return (
    <div className="min-h-screen bg-gray-50 pb-24">
      {/* Header */}
      <div className="bg-gradient-to-br from-indigo-700 via-indigo-600 to-purple-700 text-white px-5 pt-10 pb-5">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            {supervisor.photo
              ? <img src={supervisor.photo} alt="" className="w-11 h-11 rounded-2xl object-cover border-2 border-white/30 shrink-0" />
              : <div className="w-11 h-11 rounded-2xl bg-white/20 flex items-center justify-center shrink-0 text-lg font-black">
                  {supervisor.fullName?.[0]}
                </div>
            }
            <div>
              <p className="font-black text-base leading-tight">{supervisor.fullName}</p>
              <p className="text-indigo-200 text-xs">{supervisor.branch}{supervisor.shiftName ? ` · ${supervisor.shiftName}` : ''}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={refresh} disabled={refreshing}
              className="bg-white/15 p-2 rounded-xl active:scale-95 transition-transform border border-white/20">
              <RefreshCw size={16} className={refreshing ? 'animate-spin' : ''} />
            </button>
            <button onClick={() => { setData(null); setPin(''); setRole(null); }}
              className="bg-white/15 px-3 py-2 rounded-xl text-xs font-semibold active:scale-95 border border-white/20">
              Exit
            </button>
          </div>
        </div>

        {/* Stats row */}
        <div className="grid grid-cols-4 gap-2">
          {[
            { label: 'Islands',  value: islands.length,      color: 'bg-white/10' },
            { label: 'Workers',  value: workers.length,      color: 'bg-white/10' },
            { label: 'Clocked',  value: clockedInCount,      color: 'bg-green-500/20' },
            { label: 'Active',   value: islands.filter(i => i.islandStatus === 'active').length, color: 'bg-white/10' },
          ].map(s => (
            <div key={s.label} className={`${s.color} rounded-xl px-2 py-2.5 text-center border border-white/10`}>
              <p className="text-lg font-black">{s.value}</p>
              <p className="text-indigo-200 text-[10px] font-medium">{s.label}</p>
            </div>
          ))}
        </div>

        <p className="text-indigo-300 text-xs mt-3">{fmtDate(date)}</p>
      </div>

      {/* Content */}
      <div className="px-4 py-4 space-y-3">

        {/* ── ISLANDS TAB ── */}
        {tab === 'islands' && (
          islands.length === 0 ? (
            <div className="text-center py-16 text-gray-400">
              <Fuel size={40} className="mx-auto mb-3 opacity-30" />
              <p>No islands found for this branch</p>
            </div>
          ) : islands.map(island => (
            <IslandCard
              key={island.islandId}
              island={island}
              pin={pin}
              workers={workers}
              allIslands={islands}
              onStatusSaved={handleStatusSaved}
              onReassignSaved={handleReassignSaved}
            />
          ))
        )}

        {/* ── METERS TAB ── */}
        {tab === 'meters' && (
          <MeterEntryTab islands={islands} pin={pin} onSaved={handleMeterSaved} />
        )}

        {/* ── WORKERS TAB ── */}
        {tab === 'workers' && (
          <>
            {/* Supervisor self-clock card */}
            {(() => {
              const supStatus = supervisor.todayStatus || {};
              const supClockBg = supStatus.clockedIn
                ? (supStatus.clockedOut ? 'bg-gray-200 text-gray-500' : 'bg-red-600 text-white')
                : 'bg-green-600 text-white';
              return (
                <div className="bg-gradient-to-r from-indigo-50 to-purple-50 border border-indigo-100 rounded-2xl px-4 py-3.5 flex items-center gap-3">
                  {supervisor.photo
                    ? <img src={supervisor.photo} alt="" className="w-10 h-10 rounded-full object-cover shrink-0" />
                    : <div className="w-10 h-10 rounded-full bg-indigo-200 flex items-center justify-center shrink-0 font-black text-indigo-700">
                        {supervisor.fullName.charAt(0)}
                      </div>
                  }
                  <div className="flex-1 min-w-0">
                    <p className="font-bold text-indigo-900 text-sm truncate">{supervisor.fullName}</p>
                    <div className="flex items-center gap-1.5 mt-0.5">
                      <span className={`w-1.5 h-1.5 rounded-full ${supStatus.clockedIn ? 'bg-green-500' : 'bg-gray-300'}`} />
                      <span className="text-xs text-gray-500">{supStatus.clockedIn ? 'Clocked in' : 'Not clocked in'} · You</span>
                    </div>
                  </div>
                  <button disabled={supStatus.clockedIn && supStatus.clockedOut}
                    onClick={() => setClockFor('self')}
                    className={`px-3 py-2 rounded-xl text-xs font-bold active:scale-95 transition-all shrink-0 ${supClockBg} disabled:cursor-not-allowed`}>
                    {supStatus.clockedIn && supStatus.clockedOut ? '✓ Done' : supStatus.clockedIn ? 'Clock Out' : 'Clock In'}
                  </button>
                </div>
              );
            })()}

            <div className="flex items-center justify-between gap-2">
              <div>
                <p className="text-sm font-bold text-gray-700">{workers.length} Worker{workers.length !== 1 ? 's' : ''}</p>
                <p className="text-xs text-gray-400">{clockedInCount} clocked in today</p>
              </div>
              <div className="flex gap-2">
                <button onClick={() => setShortageFor({ _id: '', fullName: '' })}
                  className="text-xs bg-orange-100 text-orange-700 font-semibold px-3 py-2 rounded-xl active:scale-95">
                  + Shortage
                </button>
                <button onClick={() => setOffenceFor({ _id: '', fullName: '' })}
                  className="text-xs bg-red-100 text-red-700 font-semibold px-3 py-2 rounded-xl active:scale-95">
                  + Offence
                </button>
              </div>
            </div>

            {workers.length === 0 ? (
              <div className="text-center py-16 text-gray-400">
                <Users size={40} className="mx-auto mb-3 opacity-30" />
                <p>No workers in your shift</p>
              </div>
            ) : workers.map(worker => (
              <WorkerRow
                key={worker._id}
                worker={worker}
                islands={islands}
                pin={pin}
                onShortage={setShortageFor}
                onOffence={setOffenceFor}
                onReassign={setReassignFor}
                onClock={setClockFor}
                onBreak={setBreakFor}
              />
            ))}
          </>
        )}

        {/* ── PROFILE TAB ── */}
        {tab === 'profile' && (() => {
          const MONTHS_SHORT = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
          const fmt  = n => `₦${Number(n || 0).toLocaleString('en-NG')}`;

          if (profileLoading) return (
            <div className="flex flex-col items-center justify-center py-20 gap-3 text-indigo-600">
              <Loader size={28} className="animate-spin" />
              <p className="text-sm font-medium text-gray-500">Loading profile…</p>
            </div>
          );
          if (profileErr) return (
            <div className="text-center py-12">
              <p className="text-red-500 text-sm mb-3">{profileErr}</p>
              <button onClick={() => loadProfile()} className="text-xs bg-indigo-100 text-indigo-600 font-semibold px-4 py-2 rounded-xl">Retry</button>
            </div>
          );
          if (!profileData) return null;
          const { worker: w, salary, shortages, daysPresent } = profileData;
          const totalDeducted = (shortages || []).reduce((s, x) => s + x.amount, 0);

          return (
            <>
              <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4 flex items-center gap-4">
                {w?.photo
                  ? <img src={w.photo} alt="" className="w-14 h-14 rounded-2xl object-cover shrink-0" />
                  : <div className="w-14 h-14 rounded-2xl bg-indigo-100 flex items-center justify-center shrink-0 text-2xl font-bold text-indigo-600">{supervisor.fullName.charAt(0)}</div>
                }
                <div>
                  <p className="font-bold text-gray-800 text-base">{supervisor.fullName}</p>
                  <p className="text-sm text-gray-500">{supervisor.role}</p>
                  <p className="text-xs text-gray-400 mt-0.5">{supervisor.branch}{supervisor.shiftName ? ` · ${supervisor.shiftName}` : ''}</p>
                </div>
              </div>

              <div className="flex items-center justify-between bg-white rounded-2xl px-4 py-3 border border-gray-100 shadow-sm">
                <button onClick={() => changeProfileMonth(-1)} className="p-1.5 rounded-xl bg-gray-100 active:scale-95">
                  <ChevronDown size={16} className="rotate-90 text-gray-600" />
                </button>
                <p className="font-semibold text-gray-800 text-sm">{MONTHS_SHORT[profileMonth - 1]} {profileYear}</p>
                <button onClick={() => changeProfileMonth(1)} className="p-1.5 rounded-xl bg-gray-100 active:scale-95">
                  <ChevronDown size={16} className="-rotate-90 text-gray-600" />
                </button>
              </div>

              <div className="bg-gradient-to-br from-indigo-600 to-purple-700 rounded-2xl p-4 text-white">
                <p className="text-indigo-200 text-xs uppercase tracking-wider mb-3">Salary — {MONTHS_SHORT[profileMonth - 1]} {profileYear}</p>
                <div className="grid grid-cols-3 gap-3">
                  {[
                    { label: 'Base', value: fmt(salary?.baseSalary || 0), cls: 'text-white' },
                    { label: 'Deducted', value: fmt(totalDeducted), cls: 'text-red-300' },
                    { label: 'Net Pay', value: salary?.netPay != null ? fmt(salary.netPay) : '—', cls: 'text-green-300 font-black' },
                  ].map(s => (
                    <div key={s.label} className="bg-white/10 rounded-xl p-3 text-center border border-white/10">
                      <p className={`text-sm font-bold ${s.cls}`}>{s.value}</p>
                      <p className="text-indigo-200 text-xs mt-0.5">{s.label}</p>
                    </div>
                  ))}
                </div>
              </div>

              <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Attendance</p>
                <div className="grid grid-cols-3 gap-3 text-center">
                  <div className="bg-green-50 rounded-xl py-3"><p className="text-xl font-bold text-green-600">{daysPresent || 0}</p><p className="text-xs text-gray-500">Present</p></div>
                  <div className="bg-amber-50 rounded-xl py-3"><p className="text-xl font-bold text-amber-500">{(shortages || []).filter(s => s.source === 'late_arrival').length}</p><p className="text-xs text-gray-500">Late</p></div>
                  <div className="bg-red-50 rounded-xl py-3"><p className="text-xl font-bold text-red-500">{(shortages || []).filter(s => ['absent','no_clockin'].includes(s.source)).length}</p><p className="text-xs text-gray-500">Absent</p></div>
                </div>
              </div>

              {(shortages || []).length > 0 ? (
                <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide px-4 pt-4 pb-2">Deductions</p>
                  <div className="divide-y divide-gray-50">
                    {shortages.map((s, i) => (
                      <div key={i} className="flex items-center justify-between px-4 py-3">
                        <div>
                          <p className="text-sm font-medium text-gray-800 capitalize">{(s.about || s.source || 'Deduction').replace(/_/g, ' ')}</p>
                          <p className="text-xs text-gray-400">{s.date ? new Date(s.date).toLocaleDateString('en-NG', { day: 'numeric', month: 'short' }) : ''}</p>
                        </div>
                        <span className="text-sm font-bold text-red-500">-{fmt(s.amount)}</span>
                      </div>
                    ))}
                  </div>
                  <div className="flex justify-between px-4 py-3 bg-gray-50 border-t border-gray-100">
                    <span className="text-sm font-semibold text-gray-600">Total</span>
                    <span className="text-sm font-bold text-red-600">-{fmt(totalDeducted)}</span>
                  </div>
                </div>
              ) : (
                <div className="text-center py-8 text-gray-400">
                  <p className="text-3xl mb-2">✅</p>
                  <p className="text-sm">No deductions this month</p>
                </div>
              )}
            </>
          );
        })()}
      </div>

      {/* ── Bottom navigation ── */}
      <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 shadow-lg z-40">
        <div className="flex">
          {[
            { key: 'islands', icon: Fuel,      label: 'Islands'  },
            { key: 'meters',  icon: Gauge,      label: 'Meters'   },
            { key: 'workers', icon: Users,      label: 'Workers'  },
            { key: 'profile', icon: User,       label: 'Profile'  },
          ].map(({ key, icon: Icon, label }) => (
            <button key={key} onClick={() => handleTabChange(key)}
              className={`flex-1 flex flex-col items-center gap-1 py-3 transition-colors relative ${
                tab === key ? 'text-indigo-600' : 'text-gray-400 hover:text-gray-600'
              }`}>
              <Icon size={22} />
              <span className="text-[10px] font-semibold">{label}</span>
              {tab === key && (
                <div className="absolute top-0 left-1/2 -translate-x-1/2 w-8 h-0.5 bg-indigo-600 rounded-full" />
              )}
              {key === 'workers' && clockedInCount > 0 && tab !== 'workers' && (
                <span className="absolute top-2 right-1/4 w-4 h-4 bg-green-500 text-white text-[9px] font-black rounded-full flex items-center justify-center">
                  {clockedInCount}
                </span>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* Modals */}
      {shortageFor && (
        <ShortageModal workers={workers} pin={pin} defaultWorkerId={shortageFor._id}
          onClose={() => setShortageFor(null)} onSaved={() => setShortageFor(null)} />
      )}
      {offenceFor && (
        <OffenceModal workers={workers} pin={pin} defaultWorkerId={offenceFor._id}
          onClose={() => setOffenceFor(null)} onSaved={() => setOffenceFor(null)} />
      )}
      {reassignFor && (
        <ReassignModal worker={reassignFor} islands={islands} pin={pin}
          onClose={() => setReassignFor(null)}
          onSaved={() => { setReassignFor(null); handleReassignSaved(); }} />
      )}
      {breakFor && (
        <BreakModal worker={breakFor} supervisorPin={pin} onClose={() => setBreakFor(null)} />
      )}
      {clockFor && (() => {
        const isSelf  = clockFor === 'self';
        const workerObj = isSelf
          ? { _id: supervisor._id || 'self', fullName: supervisor.fullName, photo: supervisor.photo,
              hasFace: supervisor.hasFace, faceDescriptor: supervisor.faceDescriptor,
              todayStatus: supervisor.todayStatus, island: null }
          : clockFor;
        return (
          <ClockModal worker={workerObj} supervisorPin={pin} skipPin={isSelf}
            onSuccess={(wid, type) => { handleClockSuccess(wid, type); setTimeout(() => setClockFor(null), 1800); }}
            onClose={() => setClockFor(null)} />
        );
      })()}
    </div>
  );
}
