import { useState, useCallback } from 'react';
import { Delete, Loader, X, ChevronDown, ChevronUp, AlertTriangle, Fuel, Wrench, CheckCircle, RefreshCw } from 'lucide-react';
import axios from 'axios';

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

// ── Island status modal ────────────────────────────────────────────────────────
function IslandStatusModal({ island, pin, onClose, onSaved }) {
  const [saving, setSaving] = useState(null);
  const [err, setErr]       = useState('');

  const options = [
    { status: 'active',       icon: <CheckCircle size={20} />, label: 'Mark Active',     cls: 'bg-green-500' },
    { status: 'faulty',       icon: <Wrench size={20} />,      label: 'Mark Faulty',     cls: 'bg-red-500' },
    { status: 'out_of_stock', icon: <Fuel size={20} />,        label: 'Fuel Finished',   cls: 'bg-orange-500' },
  ];

  const pick = async (status) => {
    setSaving(status); setErr('');
    try {
      const res = await axios.patch(`${BASE}/supervisor/island-status`, {
        pin, islandId: island.islandId, status,
      });
      onSaved(res.data.data);
      onClose();
    } catch (e) {
      setErr(e.response?.data?.message || 'Failed to update status');
    } finally { setSaving(null); }
  };

  return (
    <ModalSheet title={`Status — ${island.islandName}`} onClose={onClose}>
      <div className="space-y-3 pb-2">
        <p className="text-sm text-gray-500 mb-4">
          Current: <span className="font-semibold">{STATUS_LABELS[island.islandStatus]?.label || island.islandStatus}</span>
        </p>
        {options.map(o => (
          <button key={o.status} onClick={() => pick(o.status)}
            disabled={!!saving || island.islandStatus === o.status}
            className={`w-full flex items-center gap-3 px-4 py-3.5 rounded-2xl text-white font-semibold text-sm
              ${o.cls} disabled:opacity-50 active:scale-95 transition-transform`}>
            {saving === o.status ? <Loader size={18} className="animate-spin" /> : o.icon}
            {o.label}
          </button>
        ))}
        {err && <p className="text-red-500 text-sm text-center mt-2">{err}</p>}
      </div>
    </ModalSheet>
  );
}

// ── Reassign modal ─────────────────────────────────────────────────────────────
function ReassignModal({ worker, islands, pin, onClose, onSaved }) {
  const available = islands.filter(i => i.islandId !== worker.island?.islandId);
  const [targetId, setTargetId] = useState('');
  const [saving, setSaving]     = useState(false);
  const [err, setErr]           = useState('');

  const save = async () => {
    if (!targetId) return setErr('Select a target island');
    setSaving(true); setErr('');
    try {
      const res = await axios.post(`${BASE}/supervisor/reassign`, {
        pin, workerId: worker._id, newIslandId: targetId,
      });
      onSaved(res.data);
      onClose();
    } catch (e) {
      setErr(e.response?.data?.message || 'Reassignment failed');
    } finally { setSaving(false); }
  };

  return (
    <ModalSheet title={`Reassign — ${worker.fullName}`} onClose={onClose}>
      <div className="space-y-4 pb-2">
        <p className="text-sm text-gray-500">
          Currently on: <span className="font-semibold">{worker.island?.islandName || 'Unassigned'}</span>
        </p>
        {available.length === 0 ? (
          <p className="text-center text-gray-400 py-6">No available islands to reassign to</p>
        ) : (
          <>
            <div className="space-y-2">
              {available.map(i => (
                <button key={i.islandId}
                  onClick={() => setTargetId(i.islandId)}
                  className={`w-full flex items-center justify-between px-4 py-3.5 rounded-2xl border-2 text-sm font-medium transition-all ${
                    targetId === i.islandId
                      ? 'border-indigo-500 bg-indigo-50 text-indigo-700'
                      : 'border-gray-200 bg-white text-gray-700'
                  }`}>
                  <span>{i.islandName}</span>
                  <span className={`text-xs px-2 py-0.5 rounded-full ${STATUS_LABELS[i.islandStatus]?.cls || 'bg-gray-100'}`}>
                    {STATUS_LABELS[i.islandStatus]?.label || i.islandStatus}
                  </span>
                </button>
              ))}
            </div>
            {err && <p className="text-red-500 text-sm">{err}</p>}
            <button onClick={save} disabled={!targetId || saving}
              className="w-full py-3.5 bg-indigo-600 text-white font-semibold rounded-2xl flex items-center justify-center gap-2 disabled:opacity-50">
              {saving ? <Loader size={18} className="animate-spin" /> : null}
              Confirm Reassignment
            </button>
          </>
        )}
      </div>
    </ModalSheet>
  );
}

// ── Island card ────────────────────────────────────────────────────────────────
function IslandCard({ island, pin, workers, allIslands, onMeterSaved, onStatusSaved, onReassignSaved }) {
  const [expanded, setExpanded]     = useState(false);
  const [meterOpen, setMeterOpen]   = useState(false);
  const [statusOpen, setStatusOpen] = useState(false);
  const [reassignOpen, setReassignOpen] = useState(false);

  const st = STATUS_LABELS[island.islandStatus] || STATUS_LABELS.active;
  const hasLog = !!island.log;
  const logClosed = island.log?.status === 'closed';

  const assignedWorker = island.worker
    ? workers.find(w => w._id === island.worker.workerId)
    : null;

  return (
    <>
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
        {/* Header row */}
        <div className="flex items-center justify-between px-4 pt-4 pb-3">
          <div className="flex items-center gap-2">
            <span className="text-sm font-bold text-gray-800">{island.islandName}</span>
            <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${st.cls}`}>
              {st.icon} {st.label}
            </span>
          </div>
          <button onClick={() => setExpanded(e => !e)} className="p-1 text-gray-400">
            {expanded ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
          </button>
        </div>

        {/* Worker + meter summary */}
        <div className="px-4 pb-3">
          {island.worker ? (
            <p className="text-sm text-gray-600">
              👷 {island.worker.workerName}
            </p>
          ) : (
            <p className="text-sm text-gray-400 italic">No worker assigned</p>
          )}
          {hasLog && (
            <div className="mt-1 flex items-center gap-2">
              <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                logClosed ? 'bg-green-100 text-green-700' : 'bg-yellow-100 text-yellow-700'
              }`}>
                {logClosed ? '✓ Log closed' : '⏳ Log open'}
              </span>
              {island.log?.totalLitres != null && (
                <span className="text-xs text-gray-500">{fmtL(island.log.totalLitres)} sold</span>
              )}
            </div>
          )}
        </div>

        {/* Expanded pump breakdown */}
        {expanded && hasLog && island.log.pumps?.length > 0 && (
          <div className="px-4 pb-3 space-y-3">
            {island.log.pumps.map((pump, i) => (
              <div key={i} className="bg-gray-50 rounded-xl p-3 text-xs">
                <p className="font-semibold text-gray-700 mb-2">{pump.pumpName || `Pump ${pump.pumpNumber}`}</p>
                <div className="grid grid-cols-2 gap-y-1.5 gap-x-4">
                  <span className="text-gray-500">Outer Opening</span>
                  <span className="font-mono text-right">{fmtNum(pump.nozzle1?.opening)}</span>
                  <span className="text-gray-500">Outer Closing</span>
                  <span className="font-mono text-right">{fmtNum(pump.nozzle1?.closing)}</span>
                  <span className="text-gray-500">Inner Opening</span>
                  <span className="font-mono text-right">{fmtNum(pump.nozzle2?.opening)}</span>
                  <span className="text-gray-500">Inner Closing</span>
                  <span className="font-mono text-right">{fmtNum(pump.nozzle2?.closing)}</span>
                  {pump.totalLitres != null && <>
                    <span className="text-green-600 font-medium">Litres Sold</span>
                    <span className="font-bold text-green-600 text-right">{fmtL(pump.totalLitres)}</span>
                  </>}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Action buttons */}
        <div className="px-4 pb-4 flex flex-wrap gap-2">
          <button onClick={() => setMeterOpen(true)}
            className="flex-1 min-w-[80px] py-2 bg-indigo-50 text-indigo-700 rounded-xl text-xs font-semibold active:scale-95 transition-transform">
            📊 Meters
          </button>
          <button onClick={() => setStatusOpen(true)}
            className="flex-1 min-w-[80px] py-2 bg-amber-50 text-amber-700 rounded-xl text-xs font-semibold active:scale-95 transition-transform">
            ⚙️ Status
          </button>
          {island.worker && (
            <button onClick={() => setReassignOpen(true)}
              className="flex-1 min-w-[80px] py-2 bg-purple-50 text-purple-700 rounded-xl text-xs font-semibold active:scale-95 transition-transform">
              🔄 Reassign
            </button>
          )}
        </div>
      </div>

      {meterOpen && (
        <MeterModal island={island} pin={pin}
          onClose={() => setMeterOpen(false)}
          onSaved={onMeterSaved} />
      )}
      {statusOpen && (
        <IslandStatusModal island={island} pin={pin}
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

// ── Worker row (in workers tab) ────────────────────────────────────────────────
function WorkerRow({ worker, islands, pin, onShortage, onOffence, onReassign }) {
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
        <p className="text-xs text-gray-500">{worker.island?.islandName || 'Unassigned'}</p>
      </div>
      <div className="flex gap-2 shrink-0">
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
  const [pin, setPin]           = useState('');
  const [pinLoading, setPinLoading] = useState(false);
  const [pinError, setPinError] = useState('');
  const [data, setData]         = useState(null);
  const [tab, setTab]           = useState('islands');
  const [refreshing, setRefreshing] = useState(false);

  // Modal states
  const [shortageFor, setShortageFor]   = useState(null);  // worker object
  const [offenceFor,  setOffenceFor]    = useState(null);  // worker object
  const [reassignFor, setReassignFor]   = useState(null);  // worker object

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

  const handleStatusSaved = (island) => {
    setData(prev => {
      if (!prev) return prev;
      return {
        ...prev,
        islands: prev.islands.map(i =>
          i.islandId === String(island._id) ? { ...i, islandStatus: island.status } : i
        ),
      };
    });
  };

  const handleReassignSaved = () => {
    // Refresh full data after reassignment since multiple things change
    fetchDashboard();
  };

  // ── PIN screen ──────────────────────────────────────────────────────────────
  if (!data) {
    return <PinPad onSubmit={handlePin} loading={pinLoading} error={pinError} />;
  }

  const { supervisor, date, islands, workers } = data;

  const fmtDate = (d) => {
    if (!d) return '';
    const [y, m, day] = d.split('-');
    const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    return `${day} ${months[+m - 1]} ${y}`;
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-gradient-to-r from-indigo-700 to-purple-700 text-white px-5 pt-10 pb-6">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-indigo-200 text-xs uppercase tracking-wider">Supervisor</p>
            <h1 className="text-xl font-bold mt-0.5">{supervisor.fullName}</h1>
            <p className="text-indigo-200 text-sm mt-0.5">{supervisor.branch}{supervisor.shiftName ? ` · ${supervisor.shiftName}` : ''}</p>
            <p className="text-indigo-300 text-xs mt-1">{fmtDate(date)}</p>
          </div>
          <div className="flex flex-col items-end gap-2">
            <button onClick={refresh} disabled={refreshing}
              className="bg-white/20 p-2.5 rounded-xl active:scale-95 transition-transform">
              <RefreshCw size={18} className={refreshing ? 'animate-spin' : ''} />
            </button>
            <button onClick={() => { setData(null); setPin(''); }}
              className="bg-white/20 px-3 py-1.5 rounded-xl text-xs font-semibold active:scale-95">
              Log Out
            </button>
          </div>
        </div>

        {/* Stats row */}
        <div className="grid grid-cols-3 gap-3 mt-5">
          {[
            { label: 'Islands', value: islands.length },
            { label: 'Workers', value: workers.length },
            { label: 'Active', value: islands.filter(i => i.islandStatus === 'active').length },
          ].map(s => (
            <div key={s.label} className="bg-white/15 rounded-xl px-3 py-2.5 text-center">
              <p className="text-lg font-bold">{s.value}</p>
              <p className="text-indigo-200 text-xs">{s.label}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 px-5 mt-4">
        {['islands', 'workers'].map(t => (
          <button key={t} onClick={() => setTab(t)}
            className={`flex-1 py-2.5 rounded-xl font-semibold text-sm capitalize transition-colors ${
              tab === t ? 'bg-indigo-600 text-white shadow-sm' : 'bg-white text-gray-500 border border-gray-200'
            }`}>
            {t === 'islands' ? `⛽ Islands (${islands.length})` : `👷 Workers (${workers.length})`}
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="px-5 py-4 space-y-3 pb-20">
        {tab === 'islands' && (
          islands.length === 0 ? (
            <div className="text-center py-16 text-gray-400">
              <p className="text-4xl mb-3">⛽</p>
              <p>No islands found for this branch</p>
            </div>
          ) : islands.map(island => (
            <IslandCard
              key={island.islandId}
              island={island}
              pin={pin}
              workers={workers}
              allIslands={islands}
              onMeterSaved={handleMeterSaved}
              onStatusSaved={handleStatusSaved}
              onReassignSaved={handleReassignSaved}
            />
          ))
        )}

        {tab === 'workers' && (
          <>
            <div className="flex items-center justify-between gap-2">
              <p className="text-xs text-gray-400 font-medium uppercase tracking-wide">
                {workers.length} worker{workers.length !== 1 ? 's' : ''} in your shift
              </p>
              <div className="flex gap-2">
                <button onClick={() => setShortageFor({ _id: '', fullName: '' })}
                  className="text-xs bg-orange-100 text-orange-600 font-semibold px-3 py-1.5 rounded-xl">
                  + Shortage
                </button>
                <button onClick={() => setOffenceFor({ _id: '', fullName: '' })}
                  className="text-xs bg-red-100 text-red-600 font-semibold px-3 py-1.5 rounded-xl">
                  + Offence
                </button>
              </div>
            </div>

            {workers.length === 0 ? (
              <div className="text-center py-16 text-gray-400">
                <p className="text-4xl mb-3">👷</p>
                <p>No workers found in your shift</p>
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
              />
            ))}
          </>
        )}
      </div>

      {/* Shortage modal */}
      {shortageFor && (
        <ShortageModal
          workers={workers}
          pin={pin}
          defaultWorkerId={shortageFor._id}
          onClose={() => setShortageFor(null)}
          onSaved={() => { setShortageFor(null); }}
        />
      )}

      {/* Offence modal */}
      {offenceFor && (
        <OffenceModal
          workers={workers}
          pin={pin}
          defaultWorkerId={offenceFor._id}
          onClose={() => setOffenceFor(null)}
          onSaved={() => setOffenceFor(null)}
        />
      )}

      {/* Reassign modal */}
      {reassignFor && (
        <ReassignModal
          worker={reassignFor}
          islands={islands}
          pin={pin}
          onClose={() => setReassignFor(null)}
          onSaved={() => { setReassignFor(null); handleReassignSaved(); }}
        />
      )}
    </div>
  );
}
