import { useState, useEffect, useCallback } from 'react';
import { Coffee, Clock, CheckCircle, AlertTriangle, XCircle,
         ChevronDown, ChevronUp, RefreshCw, CalendarDays,
         Building2, User, ChevronRight, AlertCircle,
         Settings, X, Save, Loader, ToggleLeft, ToggleRight } from 'lucide-react';
import api from '../utils/api';
import { useAuth } from '../context/AuthContext';
import NumInput from '../components/NumInput';

const TODAY = new Date().toISOString().split('T')[0];

const STATUS_CFG = {
  active:     { label: 'On Break',   cls: 'bg-blue-100 text-blue-700 border border-blue-200',   dot: 'bg-blue-500'   },
  completed:  { label: 'Completed',  cls: 'bg-green-100 text-green-700 border border-green-200', dot: 'bg-green-500'  },
  overstayed: { label: 'Overstayed', cls: 'bg-red-100 text-red-700 border border-red-200',       dot: 'bg-red-500'    },
  missed:     { label: 'Missed',     cls: 'bg-gray-100 text-gray-600 border border-gray-200',    dot: 'bg-gray-400'   },
};

const BREAK_EMOJI  = { morning: '🌅', afternoon: '☀️', night: '🌙', break_4: '⭐', break_5: '💫', break_6: '🔔' };
const BREAK_LABEL  = { morning: 'Morning', afternoon: 'Afternoon', night: 'Night', break_4: 'Break 4', break_5: 'Break 5', break_6: 'Break 6' };
const DEFAULT_LABEL = { morning: 'Morning Break', afternoon: 'Afternoon Break', night: 'Night Break', break_4: 'Break 4', break_5: 'Break 5', break_6: 'Break 6' };

function fmt2(n) { return String(n).padStart(2, '0'); }
function fmtTime(ts) {
  if (!ts) return '—';
  const d = new Date(ts);
  const h = d.getHours(), m = d.getMinutes();
  return `${fmt2(h)}:${fmt2(m)}`;
}
function fmtDur(mins) {
  if (!mins && mins !== 0) return '—';
  return `${mins} min`;
}

// ── Summary cards ──────────────────────────────────────────────────────────────
function SummaryCard({ icon: Icon, label, value, cls, sub }) {
  return (
    <div className={`rounded-2xl p-4 ${cls}`}>
      <div className="flex items-center justify-between mb-2">
        <Icon size={18} className="opacity-70" />
        <span className="text-2xl font-extrabold">{value}</span>
      </div>
      <p className="text-sm font-semibold">{label}</p>
      {sub && <p className="text-xs opacity-70 mt-0.5">{sub}</p>}
    </div>
  );
}

// ── All active break types (constant — for row iteration) ─────────────────────
const ALL_BREAK_KEYS = ['morning', 'afternoon', 'night', 'break_4', 'break_5', 'break_6'];

// ── Break type mini-badge ──────────────────────────────────────────────────────
function TypeBreakRow({ type, stats }) {
  const cfg = STATUS_CFG;
  const displayLabel = stats?.label || BREAK_LABEL[type] || type;
  return (
    <div className="flex items-center gap-3 py-2 border-b border-gray-50 last:border-0">
      <span className="text-lg w-6 text-center">{BREAK_EMOJI[type] || '☕'}</span>
      <span className="text-sm font-medium text-gray-700 w-24 truncate">{displayLabel}</span>
      <div className="flex gap-1.5 flex-1 flex-wrap">
        {stats.completed  > 0 && <span className={`text-xs px-2 py-0.5 rounded-full ${cfg.completed.cls}`}>{stats.completed} done</span>}
        {stats.overstayed > 0 && <span className={`text-xs px-2 py-0.5 rounded-full ${cfg.overstayed.cls}`}>{stats.overstayed} over</span>}
        {stats.active     > 0 && <span className={`text-xs px-2 py-0.5 rounded-full ${cfg.active.cls}`}>{stats.active} active</span>}
        {stats.missed     > 0 && <span className={`text-xs px-2 py-0.5 rounded-full ${cfg.missed.cls}`}>{stats.missed} missed</span>}
        {stats.total === 0 && <span className="text-xs text-gray-400">No records</span>}
      </div>
    </div>
  );
}

// ── Worker break row (expandable) ─────────────────────────────────────────────
function WorkerRow({ workerBreaks }) {
  const [open, setOpen] = useState(false);
  const name = workerBreaks[0]?.workerName || 'Unknown';
  const role = workerBreaks[0]?.workerRole || '';

  // Determine worst status
  const hasOverstay  = workerBreaks.some(b => b.status === 'overstayed');
  const hasMissed    = workerBreaks.some(b => b.status === 'missed');
  const hasActive    = workerBreaks.some(b => b.status === 'active');

  let rowCls = 'border-l-4 ';
  if (hasOverstay) rowCls += 'border-red-400 bg-red-50/30';
  else if (hasMissed) rowCls += 'border-gray-300 bg-gray-50/50';
  else if (hasActive) rowCls += 'border-blue-400 bg-blue-50/30';
  else rowCls += 'border-green-400 bg-green-50/20';

  return (
    <div className={`rounded-xl overflow-hidden mb-2 ${rowCls}`}>
      <button onClick={() => setOpen(v => !v)}
        className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-black/5 transition-colors">
        <div className="w-9 h-9 rounded-full bg-brand-100 flex items-center justify-center shrink-0">
          <User size={16} className="text-brand-600" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-gray-800 text-sm truncate">{name}</p>
          <p className="text-xs text-gray-500">{role}</p>
        </div>
        <div className="flex gap-1 shrink-0">
          {workerBreaks.map(b => {
            const s = STATUS_CFG[b.status];
            const em = BREAK_EMOJI[b.breakType] || '☕';
            return (
              <div key={b.breakType} className={`w-5 h-5 rounded-full ${s.dot} flex items-center justify-center`}
                title={`${b.label || BREAK_LABEL[b.breakType] || b.breakType}: ${s.label}`}>
                <span className="text-[9px]">{em}</span>
              </div>
            );
          })}
          {workerBreaks.length === 0 && (
            <span className="text-xs text-gray-400">—</span>
          )}
        </div>
        {open ? <ChevronUp size={16} className="text-gray-400 ml-1" /> : <ChevronRight size={16} className="text-gray-400 ml-1" />}
      </button>

      {open && (
        <div className="px-4 pb-3 space-y-2 border-t border-black/5 pt-2">
          {workerBreaks.map(b => {
            const s = STATUS_CFG[b.status];
            const em = BREAK_EMOJI[b.breakType] || '☕';
            const lbl = b.label || BREAK_LABEL[b.breakType] || b.breakType;
            return (
              <div key={b.breakType} className="flex items-center gap-2 text-sm">
                <span>{em}</span>
                <span className="font-medium text-gray-700 w-24 truncate">{lbl}</span>
                <span className={`text-xs px-2 py-0.5 rounded-full ${s.cls}`}>{s.label}</span>
                {b.startTime && (
                  <span className="text-xs text-gray-500 ml-1">
                    {fmtTime(b.startTime)}
                    {b.endTime ? ` → ${fmtTime(b.endTime)}` : ''}
                  </span>
                )}
                {b.actualMinutes > 0 && (
                  <span className={`text-xs ml-auto font-medium ${b.excessMinutes > 0 ? 'text-red-600' : 'text-green-600'}`}>
                    {fmtDur(b.actualMinutes)}
                    {b.excessMinutes > 0 ? ` (+${b.excessMinutes} over)` : ''}
                  </span>
                )}
              </div>
            );
          })}
          {/* Audit log (last 3 entries) */}
          {workerBreaks.some(b => b.auditLog?.length > 0) && (
            <details className="mt-2">
              <summary className="text-xs text-gray-400 cursor-pointer hover:text-gray-600">Show audit log</summary>
              <div className="mt-1 space-y-1">
                {workerBreaks.flatMap(b => (b.auditLog || []).map(e => ({ ...e, breakType: b.breakType })))
                  .sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp))
                  .map((e, i) => (
                    <div key={i} className="flex gap-2 text-xs text-gray-500">
                      <span className="font-mono text-gray-400">{fmtTime(e.timestamp)}</span>
                      <span>{BREAK_EMOJI[e.breakType]} {e.action}</span>
                      <span className="text-gray-400 truncate">{e.notes}</span>
                    </div>
                  ))}
              </div>
            </details>
          )}
        </div>
      )}
    </div>
  );
}

// ── Time helpers: WAT ↔ UTC (WAT = UTC+1) ────────────────────────────────────
// Backend stores UTC; UI shows Nigerian time only
function utcToWat(hhmm) {
  if (!hhmm) return '';
  const [h, m] = hhmm.split(':').map(Number);
  return `${String((h + 1) % 24).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}
function watToUtc(hhmm) {
  if (!hhmm) return '';
  const [h, m] = hhmm.split(':').map(Number);
  return `${String((h + 23) % 24).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

// ── Break Settings Modal ───────────────────────────────────────────────────────
// Fixed slots: morning / afternoon / night always shown.
// Extra slots: break_4 / break_5 / break_6 — disabled by default, admin enables as needed.
const BREAK_TYPES = [
  { key: 'morning',   emoji: '🌅', defaultLabel: 'Morning Break',   defaultMins: 5,  defaultStart: '07:00', defaultEnd: '09:30', alwaysOn: true  },
  { key: 'afternoon', emoji: '☀️', defaultLabel: 'Afternoon Break', defaultMins: 10, defaultStart: '12:00', defaultEnd: '14:00', alwaysOn: true  },
  { key: 'night',     emoji: '🌙', defaultLabel: 'Night Break',     defaultMins: 5,  defaultStart: '19:00', defaultEnd: '21:00', alwaysOn: true  },
  { key: 'break_4',   emoji: '⭐', defaultLabel: 'Break 4',         defaultMins: 10, defaultStart: '10:00', defaultEnd: '12:00', alwaysOn: false },
  { key: 'break_5',   emoji: '💫', defaultLabel: 'Break 5',         defaultMins: 10, defaultStart: '15:00', defaultEnd: '17:00', alwaysOn: false },
  { key: 'break_6',   emoji: '🔔', defaultLabel: 'Break 6',         defaultMins: 10, defaultStart: '22:00', defaultEnd: '23:30', alwaysOn: false },
];

function BreakSettingsModal({ branch, onClose, onSaved }) {
  const [form,   setForm  ] = useState(null);
  const [saving, setSaving] = useState(false);
  const [err,    setErr   ] = useState('');

  // Load branch settings — convert stored UTC times → WAT for display
  useEffect(() => {
    const bs = branch.breakSettings || {};
    const init = ({ key, defaultLabel, defaultMins, defaultStart, defaultEnd, alwaysOn }) => {
      const stored = bs[key] || {};
      return {
        enabled:                 stored.enabled                 ?? alwaysOn,
        label:                   stored.label                   || '',
        allowedMinutes:          stored.allowedMinutes          ?? defaultMins,
        windowStart:             utcToWat(stored.windowStart    || defaultStart),
        windowEnd:               utcToWat(stored.windowEnd      || defaultEnd),
        overstayDeductionAmount: stored.overstayDeductionAmount ?? 0,
        missedDeductionAmount:   stored.missedDeductionAmount   ?? 0,
      };
    };
    const f = {};
    BREAK_TYPES.forEach(bt => { f[bt.key] = init(bt); });
    setForm(f);
  }, [branch]);

  const set = (type, field, val) => setForm(f => ({ ...f, [type]: { ...f[type], [field]: val } }));

  const save = async () => {
    setSaving(true); setErr('');
    try {
      // Convert WAT times back → UTC before sending to backend
      const payload = {};
      for (const { key } of BREAK_TYPES) {
        payload[key] = {
          ...form[key],
          windowStart: watToUtc(form[key].windowStart),
          windowEnd:   watToUtc(form[key].windowEnd),
        };
      }
      await api.put(`/branches/${branch._id}`, { breakSettings: payload });
      onSaved(payload);
    } catch (e) {
      setErr(e.response?.data?.message || 'Save failed');
    } finally { setSaving(false); }
  };

  if (!form) return null;

  const coreTypes  = BREAK_TYPES.filter(bt => bt.alwaysOn);
  const extraTypes = BREAK_TYPES.filter(bt => !bt.alwaysOn);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <div>
            <h2 className="font-bold text-gray-900 text-lg flex items-center gap-2">
              <Settings size={18} className="text-brand-600" /> Break Settings
            </h2>
            <p className="text-xs text-gray-500 mt-0.5">{branch.name} · All times in Nigerian Time (WAT)</p>
          </div>
          <button onClick={onClose} className="p-2 rounded-xl hover:bg-gray-100 transition-colors">
            <X size={18} className="text-gray-500" />
          </button>
        </div>

        {/* Break rows */}
        <div className="overflow-y-auto flex-1 px-6 py-4 space-y-5">

          {/* ── Core break slots ────────────────────────────── */}
          {coreTypes.map(({ key, emoji, defaultLabel }) => {
            const v = form[key];
            return (
              <BreakSlotCard key={key}
                slotKey={key} emoji={emoji} defaultLabel={defaultLabel}
                v={v} set={set} showDisableToggle={false}
              />
            );
          })}

          {/* ── Extra break slots ────────────────────────────── */}
          <div>
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">
              Additional Break Slots — enable any you need
            </p>
            <div className="space-y-4">
              {extraTypes.map(({ key, emoji, defaultLabel }) => {
                const v = form[key];
                return (
                  <BreakSlotCard key={key}
                    slotKey={key} emoji={emoji} defaultLabel={defaultLabel}
                    v={v} set={set} showDisableToggle isExtra
                  />
                );
              })}
            </div>
          </div>
        </div>

        {/* Footer */}
        {err && <p className="mx-6 mb-2 text-sm text-red-600 bg-red-50 border border-red-200 rounded-xl px-3 py-2">{err}</p>}
        <div className="flex gap-3 px-6 py-4 border-t border-gray-100">
          <button onClick={onClose}
            className="flex-1 py-2.5 rounded-xl border border-gray-200 text-gray-600 text-sm font-medium hover:bg-gray-50">
            Cancel
          </button>
          <button onClick={save} disabled={saving}
            className="flex-1 py-2.5 rounded-xl bg-brand-600 hover:bg-brand-700 text-white font-semibold text-sm flex items-center justify-center gap-2 disabled:opacity-60">
            {saving ? <Loader size={14} className="animate-spin" /> : <Save size={14} />}
            Save Settings
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Break Slot Card (shared by core and extra slots) ──────────────────────────
function BreakSlotCard({ slotKey, emoji, defaultLabel, v, set, showDisableToggle, isExtra }) {
  return (
    <div className={`rounded-2xl border-2 p-4 space-y-4 transition-colors
      ${v.enabled ? (isExtra ? 'border-amber-200 bg-amber-50/30' : 'border-brand-200 bg-brand-50/30')
                  : 'border-gray-200 bg-gray-50/50 opacity-70'}`}>

      {/* Header row */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 flex-1 min-w-0">
          <span className="text-xl shrink-0">{emoji}</span>
          {v.enabled ? (
            <input
              type="text"
              value={v.label}
              onChange={e => set(slotKey, 'label', e.target.value)}
              placeholder={defaultLabel}
              className="flex-1 min-w-0 text-sm font-semibold text-gray-800 bg-transparent border-b border-gray-300 focus:border-brand-500 focus:outline-none pb-0.5 placeholder-gray-400"
            />
          ) : (
            <span className="font-semibold text-gray-500 text-sm">
              {v.label || defaultLabel}
            </span>
          )}
        </div>
        {showDisableToggle && (
          <button onClick={() => set(slotKey, 'enabled', !v.enabled)}
            className="flex items-center gap-1.5 text-sm font-medium transition-colors shrink-0">
            {v.enabled
              ? <><ToggleRight size={22} className="text-brand-600" /><span className="text-brand-600">On</span></>
              : <><ToggleLeft  size={22} className="text-gray-400"  /><span className="text-gray-400">Off</span></>}
          </button>
        )}
      </div>

      {v.enabled && (
        <>
          {/* Timing row */}
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="text-xs font-semibold text-gray-500 block mb-1">Duration (min)</label>
              <NumInput min={1} max={60}
                value={v.allowedMinutes}
                onChange={v2 => set(slotKey, 'allowedMinutes', v2 || 1)}
                className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm text-center font-bold focus:outline-none focus:border-brand-400" />
            </div>
            <div>
              <label className="text-xs font-semibold text-gray-500 block mb-1">Start Time</label>
              <input type="time"
                value={v.windowStart}
                onChange={e => set(slotKey, 'windowStart', e.target.value)}
                className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-brand-400" />
            </div>
            <div>
              <label className="text-xs font-semibold text-gray-500 block mb-1">End Time</label>
              <input type="time"
                value={v.windowEnd}
                onChange={e => set(slotKey, 'windowEnd', e.target.value)}
                className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-brand-400" />
            </div>
          </div>

          {/* Deduction row */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-semibold text-gray-500 block mb-1">Overstay Deduction (₦)</label>
              <NumInput
                value={v.overstayDeductionAmount}
                onChange={v2 => set(slotKey, 'overstayDeductionAmount', v2)}
                className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-brand-400" />
              <p className="text-[10px] text-gray-400 mt-0.5">Deducted when break time exceeded</p>
            </div>
            <div>
              <label className="text-xs font-semibold text-gray-500 block mb-1">Missed Break Deduction (₦)</label>
              <NumInput
                value={v.missedDeductionAmount}
                onChange={v2 => set(slotKey, 'missedDeductionAmount', v2)}
                className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-brand-400" />
              <p className="text-[10px] text-gray-400 mt-0.5">Deducted if break window not used</p>
            </div>
          </div>

          {/* Summary line */}
          <p className="text-[11px] text-brand-700 bg-brand-50 rounded-lg px-3 py-1.5 font-medium">
            ⏰ {v.windowStart || '--:--'} – {v.windowEnd || '--:--'} · {v.allowedMinutes} min
          </p>
        </>
      )}
    </div>
  );
}

// ── Restroom Worker Row ────────────────────────────────────────────────────────
function RestroomWorkerRow({ s }) {
  const [open, setOpen] = useState(false);
  return (
    <div className={`rounded-xl overflow-hidden mb-2 border-l-4 ${s.overstays > 0 ? 'border-red-400 bg-red-50/30' : 'border-blue-300 bg-blue-50/20'}`}>
      <button onClick={() => setOpen(v => !v)}
        className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-black/5 transition-colors">
        <div className="w-9 h-9 rounded-full bg-blue-100 flex items-center justify-center shrink-0">
          <span className="text-base">🚻</span>
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-gray-800 text-sm truncate">{s.workerName}</p>
          <p className="text-xs text-gray-500">{s.workerRole}</p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <span className={`text-xs font-bold px-2 py-1 rounded-full ${s.trips >= 5 ? 'bg-red-100 text-red-700 border border-red-200' : s.trips >= 3 ? 'bg-amber-100 text-amber-700 border border-amber-200' : 'bg-blue-100 text-blue-700 border border-blue-200'}`}>
            {s.trips} trip{s.trips !== 1 ? 's' : ''}
          </span>
          {s.totalDeducted > 0 && (
            <span className="text-xs bg-red-100 text-red-600 border border-red-200 px-2 py-1 rounded-full font-bold">
              -₦{s.totalDeducted.toLocaleString()}
            </span>
          )}
        </div>
        {open ? <ChevronUp size={16} className="text-gray-400 ml-1" /> : <ChevronRight size={16} className="text-gray-400 ml-1" />}
      </button>

      {open && (
        <div className="px-4 pb-3 border-t border-black/5 pt-3 grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
          <div className="flex justify-between col-span-2">
            <span className="text-gray-500">Total time</span>
            <span className="font-semibold text-gray-700">{s.totalMinutes} min</span>
          </div>
          <div className="flex justify-between col-span-2">
            <span className="text-gray-500">Excess time</span>
            <span className={`font-semibold ${s.excessMinutes > 0 ? 'text-red-600' : 'text-gray-400'}`}>
              {s.excessMinutes > 0 ? `${s.excessMinutes} min` : '—'}
            </span>
          </div>
          <div className="flex justify-between col-span-2">
            <span className="text-gray-500">Overstays</span>
            <span className={`font-semibold ${s.overstays > 0 ? 'text-red-600' : 'text-gray-400'}`}>
              {s.overstays > 0 ? s.overstays : '—'}
            </span>
          </div>
          <div className="flex justify-between col-span-2">
            <span className="text-gray-500">Total deducted</span>
            <span className={`font-bold ${s.totalDeducted > 0 ? 'text-red-600' : 'text-gray-400'}`}>
              {s.totalDeducted > 0 ? `₦${s.totalDeducted.toLocaleString()}` : '—'}
            </span>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Main Page ──────────────────────────────────────────────────────────────────
export default function Breaks() {
  const { isSuperAdmin, can } = useAuth();
  const canManage = isSuperAdmin() || can('manageBranches');

  const [date,       setDate    ] = useState(TODAY);
  const [branchId,   setBranchId] = useState('');
  const [branches,   setBranches] = useState([]);
  const [summary,    setSummary  ] = useState(null);
  const [breaks,     setBreaks   ] = useState([]);
  const [loading,    setLoading  ] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [msg,        setMsg      ] = useState('');
  const [showSettings, setShowSettings] = useState(false);
  // Restroom
  const [rstSummary, setRstSummary] = useState([]);
  const [rstLoading, setRstLoading] = useState(false);
  const [showRestroom, setShowRestroom] = useState(true);

  // Load branches
  useEffect(() => {
    api.get('/branches').then(r => setBranches(r.data.data || [])).catch(() => {});
  }, []);

  const loadRestroom = useCallback(async () => {
    setRstLoading(true);
    try {
      const params = { date };
      if (branchId) params.branchId = branchId;
      const { data } = await api.get('/restroom', { params });
      setRstSummary(data.summary || []);
    } catch {
      setRstSummary([]);
    } finally { setRstLoading(false); }
  }, [date, branchId]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = { date };
      if (branchId) params.branchId = branchId;
      const { data } = await api.get('/breaks/summary', { params });
      setSummary(data.data.summary);
      setBreaks(data.data.breaks);
    } catch {
      setBreaks([]); setSummary(null);
    } finally { setLoading(false); }
  }, [date, branchId]);

  useEffect(() => { load(); loadRestroom(); }, [load, loadRestroom]);

  // Auto-refresh every 60 s
  useEffect(() => {
    const t = setInterval(() => { load(); loadRestroom(); }, 60000);
    return () => clearInterval(t);
  }, [load, loadRestroom]);

  const handleProcessMissed = async () => {
    if (!branchId) return setMsg('Select a branch first');
    if (!window.confirm(`Mark missed breaks for ${date}?\nOnly closed windows will be processed.`)) return;
    setProcessing(true); setMsg('');
    try {
      const { data } = await api.post('/breaks/process-missed', { branchId, date });
      setMsg(`✅ ${data.processed} missed break record(s) created`);
      load();
    } catch (e) {
      setMsg(e.response?.data?.message || 'Failed');
    } finally { setProcessing(false); }
  };

  // Group breaks by worker
  const byWorker = {};
  breaks.forEach(b => {
    const key = String(b.worker);
    if (!byWorker[key]) byWorker[key] = [];
    byWorker[key].push(b);
  });
  const workerGroups = Object.values(byWorker);

  // Sort: overstayed first, then active, then missed, then completed
  const PRIORITY = { overstayed: 0, active: 1, missed: 2, completed: 3 };
  workerGroups.sort((a, b) => {
    const pa = Math.min(...a.map(x => PRIORITY[x.status] ?? 99));
    const pb = Math.min(...b.map(x => PRIORITY[x.status] ?? 99));
    return pa - pb || (a[0].workerName || '').localeCompare(b[0].workerName || '');
  });

  const selBranch = branches.find(b => b._id === branchId);
  const [activeTab, setActiveTab] = useState('breaks');

  return (
    <div className="p-4 max-w-4xl mx-auto space-y-5">

      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <Coffee size={24} className="text-brand-600" /> Break Management
          </h1>
          <p className="text-sm text-gray-500 mt-0.5">Track all worker breaks — taken, overstayed and missed</p>
        </div>
        <button onClick={() => { load(); loadRestroom(); }} disabled={loading || rstLoading}
          className="flex items-center gap-2 px-3 py-2 rounded-xl border border-gray-200 text-gray-600 hover:bg-gray-50 text-sm disabled:opacity-50">
          <RefreshCw size={14} className={(loading || rstLoading) ? 'animate-spin' : ''} /> Refresh
        </button>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3">
        <div className="flex items-center gap-2 bg-white rounded-xl border border-gray-200 px-3 py-2 shadow-sm">
          <CalendarDays size={15} className="text-gray-400" />
          <input type="date" value={date} max={TODAY}
            onChange={e => setDate(e.target.value)}
            className="text-sm font-medium text-gray-700 outline-none bg-transparent" />
        </div>
        <div className="flex items-center gap-2 bg-white rounded-xl border border-gray-200 px-3 py-2 shadow-sm flex-1 min-w-[180px]">
          <Building2 size={15} className="text-gray-400" />
          <select value={branchId} onChange={e => setBranchId(e.target.value)}
            className="text-sm text-gray-700 outline-none bg-transparent flex-1">
            <option value="">All Branches</option>
            {branches.map(b => <option key={b._id} value={b._id}>{b.name}</option>)}
          </select>
        </div>
        {canManage && branchId && activeTab === 'breaks' && (
          <>
            <button onClick={() => setShowSettings(true)}
              className="flex items-center gap-2 px-4 py-2 rounded-xl bg-brand-600 hover:bg-brand-700 text-white text-sm font-medium shadow-sm transition-colors">
              <Settings size={13} /> Configure Breaks
            </button>
            <button onClick={handleProcessMissed} disabled={processing}
              className="flex items-center gap-2 px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-600 text-white text-sm font-medium disabled:opacity-50 shadow-sm">
              {processing ? <RefreshCw size={13} className="animate-spin" /> : <AlertCircle size={13} />}
              Process Missed
            </button>
          </>
        )}
      </div>

      {/* ── Tab bar ──────────────────────────────────────────────────────── */}
      <div className="flex gap-1 bg-gray-100 rounded-2xl p-1">
        <button
          onClick={() => setActiveTab('breaks')}
          className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-semibold transition-all ${
            activeTab === 'breaks'
              ? 'bg-white text-brand-700 shadow-sm'
              : 'text-gray-500 hover:text-gray-700'
          }`}
        >
          <Coffee size={15} /> Breaks
          {summary && (
            <span className={`text-xs px-1.5 py-0.5 rounded-full font-bold ${activeTab === 'breaks' ? 'bg-brand-100 text-brand-700' : 'bg-gray-200 text-gray-500'}`}>
              {summary.total}
            </span>
          )}
        </button>
        <button
          onClick={() => setActiveTab('restroom')}
          className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-semibold transition-all ${
            activeTab === 'restroom'
              ? 'bg-white text-blue-700 shadow-sm'
              : 'text-gray-500 hover:text-gray-700'
          }`}
        >
          🚻 Restroom Trips
          {rstSummary.length > 0 && (
            <span className={`text-xs px-1.5 py-0.5 rounded-full font-bold ${activeTab === 'restroom' ? 'bg-blue-100 text-blue-700' : 'bg-gray-200 text-gray-500'}`}>
              {rstSummary.reduce((a, s) => a + s.trips, 0)}
            </span>
          )}
          {rstSummary.some(s => s.overstays > 0) && (
            <span className="text-xs px-1.5 py-0.5 rounded-full font-bold bg-red-100 text-red-600">
              !
            </span>
          )}
        </button>
      </div>

      {/* Settings modal */}
      {showSettings && selBranch && (
        <BreakSettingsModal
          branch={selBranch}
          onClose={() => setShowSettings(false)}
          onSaved={(newBreakSettings) => {
            setBranches(bs => bs.map(b => b._id === selBranch._id
              ? { ...b, breakSettings: newBreakSettings } : b));
            setShowSettings(false);
            setMsg('✅ Break settings saved');
          }}
        />
      )}

      {msg && (
        <div className={`px-4 py-3 rounded-xl text-sm font-medium ${msg.startsWith('✅') ? 'bg-green-50 text-green-700 border border-green-200' : 'bg-red-50 text-red-600 border border-red-200'}`}>
          {msg}
        </div>
      )}

      {/* ── BREAKS TAB ───────────────────────────────────────────────────── */}
      {activeTab === 'breaks' && (
        <>
          {/* Summary cards */}
          {summary && (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <SummaryCard icon={Coffee}       label="Total Breaks"  value={summary.total}      cls="bg-brand-50  text-brand-700" />
              <SummaryCard icon={CheckCircle}  label="Completed"     value={summary.completed}  cls="bg-green-50 text-green-700" />
              <SummaryCard icon={AlertTriangle}label="Overstayed"    value={summary.overstayed} cls="bg-red-50   text-red-700" />
              <SummaryCard icon={XCircle}      label="Missed"        value={summary.missed}     cls="bg-gray-50  text-gray-700" />
            </div>
          )}

          {/* Per-type breakdown */}
          {summary?.byType && (
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4">
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">Breakdown by Break Type</p>
              {Object.entries(summary.byType).map(([t, stats]) => (
                <TypeBreakRow key={t} type={t} stats={stats} />
              ))}
            </div>
          )}

          {/* Worker list */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <p className="text-sm font-semibold text-gray-700">
                Workers with break records {selBranch ? `· ${selBranch.name}` : ''} · {date}
              </p>
              <span className="text-xs text-gray-400">{workerGroups.length} worker{workerGroups.length !== 1 ? 's' : ''}</span>
            </div>

            {loading ? (
              <div className="flex justify-center py-12">
                <RefreshCw size={24} className="animate-spin text-brand-400" />
              </div>
            ) : workerGroups.length === 0 ? (
              <div className="text-center py-12 text-gray-400">
                <Coffee size={36} className="mx-auto mb-3 opacity-30" />
                <p className="font-medium">No break records for this date</p>
                <p className="text-sm mt-1">Records appear once workers start breaks on the terminal</p>
              </div>
            ) : (
              <div>
                {summary?.overstayed > 0 && (
                  <div className="flex items-center gap-2 bg-red-50 border border-red-200 rounded-xl px-4 py-3 mb-3">
                    <AlertTriangle size={16} className="text-red-500 shrink-0" />
                    <p className="text-sm text-red-700 font-medium">
                      {summary.overstayed} worker{summary.overstayed !== 1 ? 's' : ''} overstayed their break
                    </p>
                  </div>
                )}
                {summary?.active > 0 && (
                  <div className="flex items-center gap-2 bg-blue-50 border border-blue-200 rounded-xl px-4 py-3 mb-3">
                    <Clock size={16} className="text-blue-500 shrink-0" />
                    <p className="text-sm text-blue-700 font-medium">
                      {summary.active} worker{summary.active !== 1 ? 's' : ''} currently on break
                    </p>
                  </div>
                )}
                {workerGroups.map((grp, i) => (
                  <WorkerRow key={i} workerBreaks={grp} />
                ))}
              </div>
            )}
          </div>

          {/* Legend */}
          <div className="flex flex-wrap gap-3 text-xs text-gray-500 border-t border-gray-100 pt-4">
            <span className="font-semibold">Legend:</span>
            {Object.entries(STATUS_CFG).map(([k, v]) => (
              <span key={k} className={`px-2 py-0.5 rounded-full ${v.cls}`}>{v.label}</span>
            ))}
            <span className="ml-2">🌅 Morning · ☀️ Afternoon · 🌙 Night · ⭐⭐💫🔔 Custom Slots</span>
          </div>
        </>
      )}

      {/* ── RESTROOM TAB ─────────────────────────────────────────────────── */}
      {activeTab === 'restroom' && (
        <>
          {/* Quick summary strip */}
          {rstSummary.length > 0 && (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {[
                { label: 'Workers',        value: rstSummary.length,                                                           cls: 'bg-blue-50 text-blue-700'   },
                { label: 'Total Trips',    value: rstSummary.reduce((a, s) => a + s.trips, 0),                                cls: 'bg-brand-50 text-brand-700'  },
                { label: 'Overstays',      value: rstSummary.reduce((a, s) => a + s.overstays, 0),                            cls: 'bg-red-50 text-red-700'     },
                { label: 'Total Deducted', value: `₦${rstSummary.reduce((a, s) => a + s.totalDeducted, 0).toLocaleString()}`, cls: 'bg-amber-50 text-amber-700'  },
              ].map(card => (
                <div key={card.label} className={`rounded-2xl p-4 ${card.cls}`}>
                  <p className="text-2xl font-extrabold leading-tight">{card.value}</p>
                  <p className="text-sm font-semibold mt-0.5 opacity-80">{card.label}</p>
                </div>
              ))}
            </div>
          )}

          {rstLoading ? (
            <div className="flex justify-center py-12">
              <RefreshCw size={24} className="animate-spin text-blue-400" />
            </div>
          ) : rstSummary.length === 0 ? (
            <div className="text-center py-16 text-gray-400">
              <span className="text-5xl block mb-4">🚻</span>
              <p className="font-semibold text-base">No restroom trips recorded</p>
              <p className="text-sm mt-1">for {date}{selBranch ? ` · ${selBranch.name}` : ''}</p>
            </div>
          ) : (
            <div>
              {rstSummary.some(s => s.trips >= 5) && (
                <div className="flex items-center gap-2 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3">
                  <AlertTriangle size={16} className="text-amber-500 shrink-0" />
                  <p className="text-sm text-amber-700 font-medium">
                    {rstSummary.filter(s => s.trips >= 5).length} worker{rstSummary.filter(s => s.trips >= 5).length !== 1 ? 's' : ''} made 5+ restroom trips today
                  </p>
                </div>
              )}
              <div className="mt-1">
                <div className="flex items-center justify-between mb-3">
                  <p className="text-sm font-semibold text-gray-700">
                    Workers — sorted by most trips
                  </p>
                  <span className="text-xs text-gray-400">{rstSummary.length} worker{rstSummary.length !== 1 ? 's' : ''}</span>
                </div>
                {rstSummary.map((s, i) => <RestroomWorkerRow key={s.workerId || i} s={s} />)}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
