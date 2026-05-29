import { useState, useEffect, useCallback } from 'react';
import { Coffee, Clock, CheckCircle, AlertTriangle, XCircle,
         ChevronDown, ChevronUp, RefreshCw, CalendarDays,
         Building2, User, ChevronRight, AlertCircle,
         Settings, X, Save, Loader, ToggleLeft, ToggleRight,
         Info } from 'lucide-react';
import api from '../utils/api';
import { useAuth } from '../context/AuthContext';

const TODAY = new Date().toISOString().split('T')[0];

const STATUS_CFG = {
  active:     { label: 'On Break',   cls: 'bg-blue-100 text-blue-700 border border-blue-200',   dot: 'bg-blue-500'   },
  completed:  { label: 'Completed',  cls: 'bg-green-100 text-green-700 border border-green-200', dot: 'bg-green-500'  },
  overstayed: { label: 'Overstayed', cls: 'bg-red-100 text-red-700 border border-red-200',       dot: 'bg-red-500'    },
  missed:     { label: 'Missed',     cls: 'bg-gray-100 text-gray-600 border border-gray-200',    dot: 'bg-gray-400'   },
};

const BREAK_EMOJI = { morning: '🌅', afternoon: '☀️', night: '🌙' };
const BREAK_LABEL = { morning: 'Morning', afternoon: 'Afternoon', night: 'Night' };

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

// ── Break type mini-badge ──────────────────────────────────────────────────────
function TypeBreakRow({ type, stats }) {
  const cfg = STATUS_CFG;
  return (
    <div className="flex items-center gap-3 py-2 border-b border-gray-50 last:border-0">
      <span className="text-lg w-6 text-center">{BREAK_EMOJI[type]}</span>
      <span className="text-sm font-medium text-gray-700 w-20">{BREAK_LABEL[type]}</span>
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
        <div className="flex gap-1.5 shrink-0">
          {['morning','afternoon','night'].map(type => {
            const b = workerBreaks.find(x => x.breakType === type);
            if (!b) return <span key={type} className="w-5 h-5 rounded-full bg-gray-100 flex items-center justify-center text-xs">{BREAK_EMOJI[type]}</span>;
            const s = STATUS_CFG[b.status];
            return (
              <div key={type} className={`w-5 h-5 rounded-full ${s.dot} flex items-center justify-center`} title={`${BREAK_LABEL[type]}: ${s.label}`}>
                <span className="text-[9px]">{BREAK_EMOJI[type]}</span>
              </div>
            );
          })}
        </div>
        {open ? <ChevronUp size={16} className="text-gray-400 ml-1" /> : <ChevronRight size={16} className="text-gray-400 ml-1" />}
      </button>

      {open && (
        <div className="px-4 pb-3 space-y-2 border-t border-black/5 pt-2">
          {['morning','afternoon','night'].map(type => {
            const b = workerBreaks.find(x => x.breakType === type);
            if (!b) return (
              <div key={type} className="flex items-center gap-2 text-sm text-gray-400">
                <span>{BREAK_EMOJI[type]}</span>
                <span className="font-medium">{BREAK_LABEL[type]}</span>
                <span className="ml-auto text-xs">—</span>
              </div>
            );
            const s = STATUS_CFG[b.status];
            return (
              <div key={type} className="flex items-center gap-2 text-sm">
                <span>{BREAK_EMOJI[type]}</span>
                <span className="font-medium text-gray-700 w-20">{BREAK_LABEL[type]}</span>
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

// ── Break Settings Modal ───────────────────────────────────────────────────────
const BREAK_TYPES = [
  { key: 'morning',   label: 'Morning Break',   emoji: '🌅', defaultMins: 5  },
  { key: 'afternoon', label: 'Afternoon Break',  emoji: '☀️', defaultMins: 10 },
  { key: 'night',     label: 'Night Break',      emoji: '🌙', defaultMins: 5  },
];

function BreakSettingsModal({ branch, onClose, onSaved }) {
  const [form,    setForm   ] = useState(null);
  const [saving,  setSaving ] = useState(false);
  const [err,     setErr    ] = useState('');

  // Initialise form from branch
  useEffect(() => {
    const bs = branch.breakSettings || {};
    const defaults = { morning: {}, afternoon: {}, night: {} };
    const base = {
      morning:   { enabled: true, allowedMinutes: 5,  windowStart: '07:00', windowEnd: '09:30', overstayDeductionAmount: 0, missedDeductionAmount: 0, ...defaults.morning,   ...(bs.morning   || {}) },
      afternoon: { enabled: true, allowedMinutes: 10, windowStart: '12:00', windowEnd: '14:00', overstayDeductionAmount: 0, missedDeductionAmount: 0, ...defaults.afternoon, ...(bs.afternoon || {}) },
      night:     { enabled: true, allowedMinutes: 5,  windowStart: '19:00', windowEnd: '21:00', overstayDeductionAmount: 0, missedDeductionAmount: 0, ...defaults.night,     ...(bs.night     || {}) },
    };
    setForm(base);
  }, [branch]);

  const set = (type, field, val) => setForm(f => ({
    ...f, [type]: { ...f[type], [field]: val },
  }));

  const save = async () => {
    setSaving(true); setErr('');
    try {
      await api.put(`/branches/${branch._id}`, { breakSettings: form });
      onSaved(form);
    } catch (e) {
      setErr(e.response?.data?.message || 'Save failed');
    } finally { setSaving(false); }
  };

  if (!form) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <div>
            <h2 className="font-bold text-gray-900 text-lg flex items-center gap-2">
              <Settings size={18} className="text-brand-600" /> Break Settings
            </h2>
            <p className="text-xs text-gray-500 mt-0.5">{branch.name}</p>
          </div>
          <button onClick={onClose} className="p-2 rounded-xl hover:bg-gray-100 transition-colors">
            <X size={18} className="text-gray-500" />
          </button>
        </div>

        {/* Note about UTC */}
        <div className="mx-6 mt-4 flex gap-2 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2.5">
          <Info size={13} className="shrink-0 mt-0.5" />
          <span>Times are in <strong>UTC</strong>. Nigeria (WAT) = UTC+1 — enter 1 hour earlier. e.g. 8:00 AM WAT → enter 07:00</span>
        </div>

        {/* Break rows */}
        <div className="overflow-y-auto flex-1 px-6 py-4 space-y-5">
          {BREAK_TYPES.map(({ key, label, emoji }) => {
            const v = form[key];
            return (
              <div key={key} className={`rounded-2xl border-2 p-4 space-y-4 transition-colors ${v.enabled ? 'border-brand-200 bg-brand-50/30' : 'border-gray-200 bg-gray-50/50 opacity-60'}`}>
                {/* Header row */}
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="text-xl">{emoji}</span>
                    <span className="font-semibold text-gray-800">{label}</span>
                  </div>
                  <button onClick={() => set(key, 'enabled', !v.enabled)}
                    className="flex items-center gap-1.5 text-sm font-medium transition-colors">
                    {v.enabled
                      ? <><ToggleRight size={22} className="text-brand-600" /><span className="text-brand-600">Enabled</span></>
                      : <><ToggleLeft  size={22} className="text-gray-400"  /><span className="text-gray-400">Disabled</span></>}
                  </button>
                </div>

                {v.enabled && (
                  <>
                    {/* Timing row */}
                    <div className="grid grid-cols-3 gap-3">
                      <div>
                        <label className="text-xs font-semibold text-gray-500 block mb-1">Duration (min)</label>
                        <input type="number" min="1" max="60"
                          value={v.allowedMinutes}
                          onChange={e => set(key, 'allowedMinutes', Number(e.target.value))}
                          className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm text-center font-bold focus:outline-none focus:border-brand-400" />
                      </div>
                      <div>
                        <label className="text-xs font-semibold text-gray-500 block mb-1">Window Start (UTC)</label>
                        <input type="time"
                          value={v.windowStart}
                          onChange={e => set(key, 'windowStart', e.target.value)}
                          className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-brand-400" />
                      </div>
                      <div>
                        <label className="text-xs font-semibold text-gray-500 block mb-1">Window End (UTC)</label>
                        <input type="time"
                          value={v.windowEnd}
                          onChange={e => set(key, 'windowEnd', e.target.value)}
                          className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-brand-400" />
                      </div>
                    </div>

                    {/* Deduction row */}
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="text-xs font-semibold text-gray-500 block mb-1">Overstay Deduction (₦)</label>
                        <input type="number" min="0"
                          value={v.overstayDeductionAmount}
                          onChange={e => set(key, 'overstayDeductionAmount', Number(e.target.value))}
                          placeholder="0"
                          className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-brand-400" />
                        <p className="text-[10px] text-gray-400 mt-0.5">Deducted when break time exceeded</p>
                      </div>
                      <div>
                        <label className="text-xs font-semibold text-gray-500 block mb-1">Missed Break Deduction (₦)</label>
                        <input type="number" min="0"
                          value={v.missedDeductionAmount}
                          onChange={e => set(key, 'missedDeductionAmount', Number(e.target.value))}
                          placeholder="0"
                          className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-brand-400" />
                        <p className="text-[10px] text-gray-400 mt-0.5">Deducted if break window not used</p>
                      </div>
                    </div>

                    {/* WAT preview */}
                    <p className="text-[11px] text-brand-600 bg-brand-50 rounded-lg px-3 py-1.5">
                      ⏰ WAT: {v.windowStart ? (() => {
                        const [h,m] = v.windowStart.split(':').map(Number);
                        return `${String((h+1)%24).padStart(2,'0')}:${String(m).padStart(2,'0')}`;
                      })() : '--:--'} – {v.windowEnd ? (() => {
                        const [h,m] = v.windowEnd.split(':').map(Number);
                        return `${String((h+1)%24).padStart(2,'0')}:${String(m).padStart(2,'0')}`;
                      })() : '--:--'} · {v.allowedMinutes} min allowed
                    </p>
                  </>
                )}
              </div>
            );
          })}
        </div>

        {/* Footer */}
        {err && <p className="mx-6 text-sm text-red-600 bg-red-50 border border-red-200 rounded-xl px-3 py-2">{err}</p>}
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

  // Load branches
  useEffect(() => {
    api.get('/branches').then(r => setBranches(r.data.data || [])).catch(() => {});
  }, []);

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

  useEffect(() => { load(); }, [load]);

  // Auto-refresh every 60 s
  useEffect(() => {
    const t = setInterval(load, 60000);
    return () => clearInterval(t);
  }, [load]);

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
        <button onClick={load} disabled={loading}
          className="flex items-center gap-2 px-3 py-2 rounded-xl border border-gray-200 text-gray-600 hover:bg-gray-50 text-sm disabled:opacity-50">
          <RefreshCw size={14} className={loading ? 'animate-spin' : ''} /> Refresh
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
        {canManage && branchId && (
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

      {/* Settings modal */}
      {showSettings && selBranch && (
        <BreakSettingsModal
          branch={selBranch}
          onClose={() => setShowSettings(false)}
          onSaved={(newSettings) => {
            // Update local branch copy so WAT preview refreshes
            setBranches(bs => bs.map(b => b._id === selBranch._id
              ? { ...b, breakSettings: newSettings } : b));
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
          {['morning','afternoon','night'].map(t => (
            <TypeBreakRow key={t} type={t} stats={summary.byType[t] || { total: 0, completed: 0, overstayed: 0, missed: 0, active: 0 }} />
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
            {/* Alert banner if any overstays */}
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
        <span className="ml-2">🌅 Morning · ☀️ Afternoon · 🌙 Night</span>
      </div>
    </div>
  );
}
