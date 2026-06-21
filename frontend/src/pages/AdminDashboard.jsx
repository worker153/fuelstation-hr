/**
 * AdminDashboard — /admin-dashboard
 * Simple, icon-heavy, mobile-first dashboard for admins/supervisors.
 * PIN-login only. Token stored in localStorage (persists across PWA sessions).
 *
 * Features:
 *  - Installable as standalone PWA (admin-manifest.json)
 *  - Embedded PIN re-auth when token is missing/expired (no redirect to /login)
 *  - Browse any past date (← / Today / →)
 *  - Staff tab: per-shift groups with ✅ All Present badge
 *  - Shortage tab: day view + full month history grouped by date
 *  - Bookings tab: day view + full month history grouped by date
 *  - Add tab: quick Record Shortage + Book Offence forms
 */
import { useState, useEffect, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import PWAInstallBanner from '../components/PWAInstallBanner';

const API = import.meta.env.VITE_API_URL || '/api';

// Axios instance using localStorage token
const adminApi = axios.create({ baseURL: API });
adminApi.interceptors.request.use(cfg => {
  const t = localStorage.getItem('adminToken');
  if (t) cfg.headers.Authorization = `Bearer ${t}`;
  return cfg;
});

// ── Date helpers ──────────────────────────────────────────────────────────────
const todayUTC = () => new Date().toISOString().slice(0, 10);

const addDays = (dateStr, n) => {
  const [y, m, d] = dateStr.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + n));
  return dt.toISOString().slice(0, 10);
};

const fmtDateLabel = (dateStr) => {
  const today = todayUTC();
  if (dateStr === today) return 'Today';
  if (dateStr === addDays(today, -1)) return 'Yesterday';
  const [y, m, d] = dateStr.split('-').map(Number);
  const names = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  const days  = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
  const dt    = new Date(Date.UTC(y, m - 1, d));
  return `${days[dt.getUTCDay()]} ${d} ${names[m-1]}`;
};

const fmtTime = (ts) => {
  if (!ts) return '—';
  return new Date(ts).toLocaleTimeString('en-NG', { hour: '2-digit', minute: '2-digit', hour12: true });
};

const roleLabel = (r) => (r || '').replace(/_/g, ' ');

// ── Constants ─────────────────────────────────────────────────────────────────
const REASON_OPTIONS = [
  { value: 'cash_shortage',      icon: '💵', label: 'Cash Short'     },
  { value: 'fuel_shortage',      icon: '⛽', label: 'Fuel Short'     },
  { value: 'equipment_damage',   icon: '🔧', label: 'Equipment'      },
  { value: 'customer_complaint', icon: '😤', label: 'Customer'       },
  { value: 'late_arrival',       icon: '🕐', label: 'Late Arrival'   },
  { value: 'absent',             icon: '🚫', label: 'Absent'         },
  { value: 'other',              icon: '📝', label: 'Other'          },
];

const OFFENCE_OPTIONS = [
  { value: 'late_arrival',          icon: '🕐', label: 'Late Arrival'     },
  { value: 'absent_without_notice', icon: '🚫', label: 'Absent'           },
  { value: 'mobile_phone_misuse',   icon: '📵', label: 'Phone Misuse'     },
  { value: 'rude_to_customer',      icon: '😤', label: 'Rude to Customer' },
  { value: 'cash_shortage',         icon: '💵', label: 'Cash Shortage'    },
  { value: 'fuel_shortage',         icon: '⛽', label: 'Fuel Shortage'    },
  { value: 'improper_uniform',      icon: '👕', label: 'Bad Uniform'      },
  { value: 'negligence',            icon: '😴', label: 'Negligence'       },
  { value: 'sleeping_on_duty',      icon: '💤', label: 'Sleeping'         },
  { value: 'abandoning_post',       icon: '🏃', label: 'Left Post'        },
  { value: 'fighting_misconduct',   icon: '👊', label: 'Fighting'         },
  { value: 'damage_to_property',    icon: '💥', label: 'Damage'           },
  { value: 'theft_fraud',           icon: '🚨', label: 'Theft/Fraud'      },
  { value: 'other',                 icon: '📝', label: 'Other'            },
];

const SEVERITY = [
  { value: 'minor',    label: 'Minor',    bg: 'bg-yellow-400', text: 'text-yellow-900' },
  { value: 'moderate', label: 'Moderate', bg: 'bg-orange-400', text: 'text-orange-900' },
  { value: 'serious',  label: 'Serious',  bg: 'bg-red-500',    text: 'text-white'      },
  { value: 'gross',    label: 'Gross',    bg: 'bg-red-900',    text: 'text-white'      },
];

const ACTION = [
  { value: 'verbal_warning',  label: 'Verbal Warning'  },
  { value: 'written_warning', label: 'Written Warning' },
  { value: 'suspension',      label: 'Suspension'      },
  { value: 'deduction',       label: 'Deduction (₦)'  },
  { value: 'none',            label: 'No Action Yet'   },
];

const REASON_LABEL = {
  cash_shortage: '💵 Cash', fuel_shortage: '⛽ Fuel',
  equipment_damage: '🔧 Equipment', customer_complaint: '😤 Customer',
  late_arrival: '🕐 Late', absent: '🚫 Absent',
  no_clockin: '👻 No Clock-In', other: '📝 Other',
};

const OFFENCE_ICON = {
  late_arrival: '🕐', absent_without_notice: '🚫', mobile_phone_misuse: '📵',
  rude_to_customer: '😤', cash_shortage: '💵', fuel_shortage: '⛽',
  improper_uniform: '👕', negligence: '😴', sleeping_on_duty: '💤',
  abandoning_post: '🏃', fighting_misconduct: '👊', damage_to_property: '💥',
  theft_fraud: '🚨', other: '📝',
};

const SEV_CLS = {
  minor:    'bg-yellow-100 text-yellow-800',
  moderate: 'bg-orange-100 text-orange-800',
  serious:  'bg-red-100 text-red-700',
  gross:    'bg-red-900 text-white',
};

// ── Shortage Modal ─────────────────────────────────────────────────────────────
function ShortageModal({ workers, branchId, onClose, onSaved }) {
  const [workerId, setWorkerId] = useState('');
  const [amount,   setAmount  ] = useState('');
  const [reason,   setReason  ] = useState('cash_shortage');
  const [notes,    setNotes   ] = useState('');
  const [saving,   setSaving  ] = useState(false);
  const [error,    setError   ] = useState('');

  const submit = async () => {
    if (!workerId) return setError('Pick a worker');
    if (!amount || isNaN(amount) || Number(amount) <= 0) return setError('Enter a valid amount');
    setSaving(true); setError('');
    try {
      const now = new Date();
      await adminApi.post('/shortages', {
        workerId, amount: Number(amount), reason, notes, branchId,
        month: now.getMonth() + 1,
        year:  now.getFullYear(),
      });
      onSaved();
    } catch (e) { setError(e.response?.data?.message || 'Failed to save'); }
    finally { setSaving(false); }
  };

  return (
    <FullModal title="💸 Record Shortage" onClose={onClose}>
      <FieldLabel>👤 Worker</FieldLabel>
      <select className="bigInput" value={workerId} onChange={e => setWorkerId(e.target.value)}>
        <option value="">— Select worker —</option>
        {workers.map(w => (
          <option key={w._id} value={w._id}>{w.fullName} · {roleLabel(w.role)}</option>
        ))}
      </select>

      <FieldLabel>💰 Amount (₦)</FieldLabel>
      <input className="bigInput" type="number" inputMode="numeric" placeholder="e.g. 1500"
        value={amount} onChange={e => setAmount(e.target.value)} />

      <FieldLabel>📋 Reason</FieldLabel>
      <div className="grid grid-cols-3 gap-2">
        {REASON_OPTIONS.map(r => (
          <button key={r.value} type="button" onClick={() => setReason(r.value)}
            className={`py-3 rounded-xl border-2 text-center transition-all
              ${reason === r.value ? 'border-green-500 bg-green-50 text-green-800 font-bold' : 'border-gray-200 bg-white text-gray-600'}`}>
            <div className="text-2xl">{r.icon}</div>
            <div className="text-xs mt-1 font-medium leading-tight">{r.label}</div>
          </button>
        ))}
      </div>

      <FieldLabel>📝 Notes (optional)</FieldLabel>
      <textarea className="bigInput resize-none" rows={2}
        placeholder="What happened?" value={notes} onChange={e => setNotes(e.target.value)} />

      {error && <p className="text-red-600 font-semibold text-sm text-center">{error}</p>}
      <button onClick={submit} disabled={saving}
        className="w-full py-4 rounded-2xl bg-green-600 hover:bg-green-700 text-white text-xl font-black shadow-lg transition-all active:scale-95 disabled:opacity-50">
        {saving ? 'Saving…' : '✅ Submit Shortage'}
      </button>
    </FullModal>
  );
}

// ── Offence Modal ─────────────────────────────────────────────────────────────
function OffenceModal({ workers, branchId, onClose, onSaved }) {
  const [workerId,  setWorkerId ] = useState('');
  const [type,      setType     ] = useState('');
  const [severity,  setSeverity ] = useState('');
  const [action,    setAction   ] = useState('verbal_warning');
  const [deduction, setDeduction] = useState('');
  const [desc,      setDesc     ] = useState('');
  const [saving,    setSaving   ] = useState(false);
  const [error,     setError    ] = useState('');

  const submit = async () => {
    if (!workerId) return setError('Pick a worker');
    if (!type)     return setError('Choose an offence type');
    if (!severity) return setError('Choose severity');
    setSaving(true); setError('');
    try {
      await adminApi.post('/offences', {
        workerId, offenceType: type, severity, action,
        deductionAmount: action === 'deduction' ? Number(deduction) || 0 : 0,
        description: desc,
      });
      onSaved();
    } catch (e) { setError(e.response?.data?.message || 'Failed to save'); }
    finally { setSaving(false); }
  };

  return (
    <FullModal title="⚠️ Book Offence" onClose={onClose}>
      <FieldLabel>👤 Worker</FieldLabel>
      <select className="bigInput" value={workerId} onChange={e => setWorkerId(e.target.value)}>
        <option value="">— Select worker —</option>
        {workers.map(w => (
          <option key={w._id} value={w._id}>{w.fullName} · {roleLabel(w.role)}</option>
        ))}
      </select>

      <FieldLabel>🚨 What did they do?</FieldLabel>
      <div className="grid grid-cols-3 gap-2">
        {OFFENCE_OPTIONS.map(o => (
          <button key={o.value} type="button" onClick={() => setType(o.value)}
            className={`py-2.5 rounded-xl border-2 text-center transition-all
              ${type === o.value ? 'border-orange-500 bg-orange-50 text-orange-800 font-bold' : 'border-gray-200 bg-white text-gray-600'}`}>
            <div className="text-xl">{o.icon}</div>
            <div className="text-[11px] mt-0.5 font-medium leading-tight">{o.label}</div>
          </button>
        ))}
      </div>

      <FieldLabel>🔥 How serious?</FieldLabel>
      <div className="grid grid-cols-4 gap-2">
        {SEVERITY.map(s => (
          <button key={s.value} type="button" onClick={() => setSeverity(s.value)}
            className={`py-3 rounded-xl text-sm font-bold border-2 transition-all
              ${severity === s.value ? `${s.bg} ${s.text} border-transparent shadow-md scale-105` : 'bg-gray-100 text-gray-500 border-transparent'}`}>
            {s.label}
          </button>
        ))}
      </div>

      <FieldLabel>📋 Action Taken</FieldLabel>
      <select className="bigInput" value={action} onChange={e => setAction(e.target.value)}>
        {ACTION.map(a => <option key={a.value} value={a.value}>{a.label}</option>)}
      </select>
      {action === 'deduction' && (
        <input className="bigInput mt-2" type="number" inputMode="numeric" placeholder="Deduction amount (₦)"
          value={deduction} onChange={e => setDeduction(e.target.value)} />
      )}

      <FieldLabel>📝 Details (optional)</FieldLabel>
      <textarea className="bigInput resize-none" rows={2}
        placeholder="Brief description…" value={desc} onChange={e => setDesc(e.target.value)} />

      {error && <p className="text-red-600 font-semibold text-sm text-center">{error}</p>}
      <button onClick={submit} disabled={saving}
        className="w-full py-4 rounded-2xl bg-orange-500 hover:bg-orange-600 text-white text-xl font-black shadow-lg transition-all active:scale-95 disabled:opacity-50">
        {saving ? 'Saving…' : '⚠️ Book Worker'}
      </button>
    </FullModal>
  );
}

// ── Shared helpers ────────────────────────────────────────────────────────────
function FullModal({ title, onClose, children }) {
  return (
    <div className="fixed inset-0 z-50 bg-black/60 overflow-y-auto">
      <div className="min-h-full flex items-end sm:items-center justify-center">
        <div className="bg-white w-full sm:max-w-md rounded-t-3xl sm:rounded-3xl p-5 space-y-4 pb-8">
          <div className="flex items-center justify-between mb-1">
            <h2 className="text-xl font-black text-gray-900">{title}</h2>
            <button onClick={onClose}
              className="w-8 h-8 rounded-full bg-gray-100 hover:bg-gray-200 flex items-center justify-center text-gray-500 text-lg font-bold">✕</button>
          </div>
          {children}
        </div>
      </div>
    </div>
  );
}

function FieldLabel({ children }) {
  return <p className="text-sm font-bold text-gray-600 -mb-1">{children}</p>;
}

// ── Worker row ────────────────────────────────────────────────────────────────
// variant: 'present' | 'absent' | 'off'
function WorkerRow({ name, role, time, hasOut, variant = 'present', voluntaryIn }) {
  const cfg = {
    present: {
      wrap:   'bg-gray-50 border-gray-100',
      avatar: 'bg-green-100 text-green-700',
      name:   'text-gray-900',
      badge:  null,
    },
    absent: {
      wrap:   'bg-red-50 border-red-100',
      avatar: 'bg-red-100 text-red-700',
      name:   'text-red-800',
      badge:  '❌',
    },
    off: {
      wrap:   'bg-gray-50 border-gray-100 opacity-60',
      avatar: 'bg-gray-100 text-gray-500',
      name:   'text-gray-500',
      badge:  '📅',
    },
  }[variant] || {};

  return (
    <div className={`flex items-center gap-3 px-4 py-3 rounded-xl mb-2 border ${cfg.wrap}`}>
      <div className={`w-9 h-9 rounded-full flex items-center justify-center shrink-0 text-base font-black ${cfg.avatar}`}>
        {(name || '?')[0].toUpperCase()}
      </div>
      <div className="flex-1 min-w-0">
        <p className={`font-bold leading-tight truncate ${cfg.name}`}>{name}</p>
        <p className="text-xs text-gray-500 capitalize">
          {roleLabel(role)}
          {variant === 'off' && <span className="ml-1 text-gray-400">· Off Today</span>}
          {voluntaryIn && <span className="ml-1 text-purple-500">· Came in on day off</span>}
        </p>
      </div>
      {time && variant === 'present' && (
        <div className="text-right shrink-0">
          <p className="text-xs font-semibold text-gray-700">IN {time}</p>
          {hasOut && <p className="text-xs text-green-600 font-semibold">OUT ✓</p>}
        </div>
      )}
      {cfg.badge && <span className="text-xl shrink-0">{cfg.badge}</span>}
    </div>
  );
}

// ── Shift group card ──────────────────────────────────────────────────────────
function ShiftGroup({ group }) {
  const [open,    setOpen   ] = useState(true);
  const [showOff, setShowOff] = useState(false);

  const hasExpected = group.total > 0;
  const allOff      = hasExpected === false && (group.offCount || 0) > 0;

  return (
    <div className={`rounded-2xl border-2 mb-4 overflow-hidden
      ${group.allPresent && hasExpected ? 'border-green-300'
        : group.absentCount > 0        ? 'border-red-200'
        : allOff                       ? 'border-gray-200'
        : 'border-gray-200'}`}>

      {/* Header */}
      <button onClick={() => setOpen(o => !o)}
        className={`w-full px-4 py-3 flex items-center justify-between text-left
          ${group.allPresent && hasExpected ? 'bg-green-50'
            : group.absentCount > 0        ? 'bg-red-50'
            : 'bg-gray-50'}`}>
        <div>
          <p className="font-black text-gray-900 text-base">{group.shiftName}</p>
          {(group.startTime || group.endTime) && (
            <p className="text-xs text-gray-500 font-medium">
              {group.startTime}{group.endTime ? ` – ${group.endTime}` : ''}
            </p>
          )}
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {/* All expected workers off today */}
          {!hasExpected && (group.offCount || 0) > 0 ? (
            <span className="bg-gray-200 text-gray-600 text-xs font-bold px-3 py-1 rounded-full">
              📅 All Off Today
            </span>
          ) : group.allPresent && hasExpected ? (
            <span className="bg-green-500 text-white text-xs font-black px-3 py-1 rounded-full">
              ✅ All Present
            </span>
          ) : (
            <div className="text-right">
              {group.presentCount > 0 && (
                <p className="text-xs font-black text-green-700">✅ {group.presentCount} in</p>
              )}
              {group.absentCount > 0 && (
                <p className="text-xs font-black text-red-600">❌ {group.absentCount} absent</p>
              )}
              {group.offCount > 0 && (
                <p className="text-xs font-semibold text-gray-400">📅 {group.offCount} off</p>
              )}
            </div>
          )}
          <span className="text-gray-400 text-lg">{open ? '▲' : '▼'}</span>
        </div>
      </button>

      {/* Workers */}
      {open && (
        <div className="px-3 py-3">
          {/* Present */}
          {group.present.map((w, i) => (
            <WorkerRow key={`p${i}`} name={w.fullName} role={w.role}
              time={fmtTime(w.clockInTime)} hasOut={w.hasClockOut}
              variant="present" voluntaryIn={w.voluntaryIn} />
          ))}
          {/* Absent (on duty but not here) */}
          {group.absent.map((w, i) => (
            <WorkerRow key={`a${i}`} name={w.fullName} role={w.role} variant="absent" />
          ))}

          {/* No expected workers — show nothing or empty */}
          {group.total === 0 && (group.offCount || 0) === 0 && (
            <p className="text-center text-gray-400 text-sm py-2">No workers in this shift</p>
          )}

          {/* Off Today — collapsible sub-section */}
          {(group.offToday?.length > 0 || group.offCount > 0) && (
            <div className="mt-2">
              <button onClick={() => setShowOff(o => !o)}
                className="w-full text-left text-xs font-bold text-gray-400 py-1.5 flex items-center gap-1 hover:text-gray-600">
                <span>{showOff ? '▲' : '▼'}</span>
                📅 {group.offCount || group.offToday?.length} worker{(group.offCount || group.offToday?.length) !== 1 ? 's' : ''} off today
              </button>
              {showOff && (group.offToday || []).map((w, i) => (
                <WorkerRow key={`o${i}`} name={w.fullName} role={w.role} variant="off" />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Shortage card ─────────────────────────────────────────────────────────────
function ShortageCard({ s }) {
  return (
    <div className="bg-white border border-gray-100 rounded-xl p-4 mb-2 shadow-sm">
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="font-bold text-gray-900">{s.workerName}</p>
          <p className="text-xs text-gray-500 mt-0.5">{REASON_LABEL[s.reason] || s.reason}</p>
          {s.notes && <p className="text-xs text-gray-400 mt-1 italic">{s.notes}</p>}
        </div>
        <div className="text-right shrink-0">
          <p className="text-lg font-black text-red-600">₦{(s.amount || 0).toLocaleString()}</p>
          <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full
            ${s.source !== 'manual' ? 'bg-amber-100 text-amber-700' : 'bg-gray-100 text-gray-600'}`}>
            {s.source === 'manual' ? 'Manual' : 'Auto'}
          </span>
        </div>
      </div>
    </div>
  );
}

// ── Offence card ──────────────────────────────────────────────────────────────
function OffenceCard({ o }) {
  return (
    <div className="bg-white border border-gray-100 rounded-xl p-4 mb-2 shadow-sm">
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="font-bold text-gray-900">{o.workerName}</p>
          <p className="text-sm text-gray-600 mt-0.5">
            {OFFENCE_ICON[o.offenceType] || '⚠️'} {(o.offenceType || '').replace(/_/g, ' ')}
          </p>
          {o.description && <p className="text-xs text-gray-400 mt-1 italic">{o.description}</p>}
        </div>
        <span className={`text-xs font-bold px-2 py-1 rounded-full capitalize shrink-0 ${SEV_CLS[o.severity] || 'bg-gray-100 text-gray-700'}`}>
          {o.severity}
        </span>
      </div>
    </div>
  );
}

// ── History group (day bucket) ────────────────────────────────────────────────
function HistoryDateGroup({ group, type }) {
  const [open, setOpen] = useState(false);
  const isToday = group.date === todayUTC();

  return (
    <div className="mb-2 rounded-xl border border-gray-200 overflow-hidden">
      <button onClick={() => setOpen(o => !o)}
        className="w-full px-4 py-3 flex items-center justify-between bg-gray-50 hover:bg-gray-100 transition-colors">
        <div className="flex items-center gap-3">
          <span className={`text-sm font-black ${isToday ? 'text-green-700' : 'text-gray-700'}`}>
            {isToday ? '📅 Today' : `📅 ${fmtDateLabel(group.date)}`}
          </span>
          <span className="text-xs text-gray-400">{group.count} record{group.count !== 1 ? 's' : ''}</span>
        </div>
        <div className="flex items-center gap-3">
          {type === 'shortage' && (
            <span className="font-black text-red-600 text-sm">₦{group.total.toLocaleString()}</span>
          )}
          {type === 'offence' && (
            <span className="font-black text-orange-600 text-sm">{group.count} booking{group.count !== 1 ? 's' : ''}</span>
          )}
          <span className="text-gray-400">{open ? '▲' : '▼'}</span>
        </div>
      </button>
      {open && (
        <div className="px-3 pt-2 pb-1">
          {type === 'shortage' && group.items.map((s, i) => <ShortageCard key={i} s={s} />)}
          {type === 'offence'  && group.items.map((o, i) => <OffenceCard  key={i} o={o} />)}
        </div>
      )}
    </div>
  );
}

// ── Stat card ─────────────────────────────────────────────────────────────────
function StatCard({ emoji, value, label, color, onClick }) {
  const colors = {
    green:  'bg-green-50  border-green-200  ',
    red:    'bg-red-50    border-red-200    ',
    amber:  'bg-amber-50  border-amber-200  ',
    orange: 'bg-orange-50 border-orange-200 ',
  };
  const textColors = { green: 'text-green-700', red: 'text-red-700', amber: 'text-amber-700', orange: 'text-orange-700' };
  return (
    <button onClick={onClick}
      className={`rounded-2xl border-2 p-4 text-left w-full shadow-sm active:scale-95 transition-all ${colors[color]}`}>
      <div className="text-3xl mb-1">{emoji}</div>
      <div className={`text-3xl font-black ${textColors[color]}`}>{value}</div>
      <div className={`text-xs font-semibold mt-0.5 ${textColors[color]} opacity-70`}>{label}</div>
    </button>
  );
}

// ── SectionHeader ─────────────────────────────────────────────────────────────
function SectionHeader({ emoji, title, color }) {
  const cls = {
    green:  'text-green-700 bg-green-50 border-green-200',
    red:    'text-red-700   bg-red-50   border-red-200',
    amber:  'text-amber-700 bg-amber-50 border-amber-200',
    orange: 'text-orange-700 bg-orange-50 border-orange-200',
    gray:   'text-gray-700  bg-gray-50  border-gray-200',
  };
  return (
    <div className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-xl border font-black text-base mb-3 ${cls[color] || cls.gray}`}>
      {emoji} {title}
    </div>
  );
}

function EmptyState({ msg }) {
  return (
    <div className="text-center py-8 text-gray-400">
      <p className="text-4xl mb-2">😊</p>
      <p className="font-semibold">{msg}</p>
    </div>
  );
}

// ── TABS ──────────────────────────────────────────────────────────────────────
const TABS = [
  { id: 'home',     icon: '🏠', label: 'Home'     },
  { id: 'staff',    icon: '👥', label: 'Staff'    },
  { id: 'breaks',   icon: '☕', label: 'Breaks'   },
  { id: 'shortage', icon: '💸', label: 'Shortage' },
  { id: 'bookings', icon: '⚠️', label: 'Bookings' },
  { id: 'add',      icon: '➕', label: 'Add'      },
];

const BREAK_EMOJI = { morning: '🌅', afternoon: '☀️', night: '🌙', break_4: '⭐', break_5: '💫', break_6: '🔔' };
const BREAK_LABEL = { morning: 'Morning Break', afternoon: 'Afternoon Break', night: 'Night Break', break_4: 'Break 4', break_5: 'Break 5', break_6: 'Break 6' };

// ── Main page ─────────────────────────────────────────────────────────────────
export default function AdminDashboard() {
  const navigate = useNavigate();

  // Set page title so iOS names the PWA shortcut "Sage Admin" not "FuelStation HR"
  useEffect(() => {
    document.title = 'Sage Admin';
    let meta = document.querySelector('meta[name="apple-mobile-web-app-title"]');
    if (!meta) { meta = document.createElement('meta'); meta.name = 'apple-mobile-web-app-title'; document.head.appendChild(meta); }
    const prev = meta.content;
    meta.content = 'Sage Admin';
    return () => { document.title = 'FuelStation HR — Worker Management'; meta.content = prev; };
  }, []);

  const [tab,         setTab        ] = useState('home');
  const [data,        setData       ] = useState(null);
  const [loading,     setLoading    ] = useState(true);
  const [selBranch,   setSelBranch  ] = useState('');
  const [selDate,     setSelDate    ] = useState(todayUTC);
  const [allWorkers,  setAllWorkers ] = useState([]);
  const [showShortage, setShowShortage] = useState(false);
  const [showOffence,  setShowOffence ] = useState(false);
  const [lastRefresh,  setLastRefresh ] = useState(null);
  const [touchStartX,  setTouchStartX] = useState(null);
  const [breakData,    setBreakData   ] = useState(null);
  const [breakLoading, setBreakLoading] = useState(false);
  const [shortageView, setShortageView] = useState('day');   // 'day' | 'month'
  const [offenceView,  setOffenceView ] = useState('day');   // 'day' | 'month'
  const [notifStatus,  setNotifStatus ] = useState('idle');  // 'idle'|'on'|'loading'|'denied'

  const [authScreen, setAuthScreen] = useState(
    () => !localStorage.getItem('adminToken')
  );
  const [rePin,    setRePin   ] = useState('');
  const [reError,  setReError ] = useState('');
  const [reLoading,setReLoading] = useState(false);

  const user = useMemo(() => {
    try { return JSON.parse(localStorage.getItem('adminUser') || 'null'); }
    catch { return null; }
  }, [authScreen]); // re-derive after successful re-auth
  const isAdmin = ['super_admin', 'admin'].includes(user?.role);

  // ── Push notification subscription ───────────────────────────────────────────
  useEffect(() => {
    if (!('Notification' in window) || !('serviceWorker' in navigator)) return;
    if (Notification.permission === 'denied') { setNotifStatus('denied'); return; }
    navigator.serviceWorker.ready.then(reg => {
      reg.pushManager.getSubscription().then(sub => {
        setNotifStatus(sub ? 'on' : 'idle');
      });
    }).catch(() => {});
  }, [authScreen]);

  const toggleNotifications = async () => {
    if (!('Notification' in window) || !('serviceWorker' in navigator)) {
      alert('Push notifications are not supported in this browser.');
      return;
    }
    if (notifStatus === 'on') {
      // Unsubscribe
      setNotifStatus('loading');
      try {
        const reg = await navigator.serviceWorker.ready;
        const sub = await reg.pushManager.getSubscription();
        if (sub) {
          await sub.unsubscribe();
          await adminApi.post('/push/unsubscribe', { endpoint: sub.endpoint });
        }
        setNotifStatus('idle');
      } catch { setNotifStatus('idle'); }
      return;
    }
    // Subscribe
    setNotifStatus('loading');
    try {
      const permission = await Notification.requestPermission();
      if (permission !== 'granted') { setNotifStatus('denied'); return; }
      const { data: kd } = await adminApi.get('/push/vapid-public-key');
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly:      true,
        applicationServerKey: kd.publicKey,
      });
      await adminApi.post('/push/subscribe', {
        subscription: sub.toJSON(),
        label:        navigator.userAgent.slice(0, 60),
      });
      setNotifStatus('on');
    } catch (e) {
      console.error('Push subscribe failed:', e);
      setNotifStatus('idle');
    }
  };

  // PIN re-auth (used when token is missing or expired)
  const PAD_KEYS = [['1','2','3'],['4','5','6'],['7','8','9'],['del','0','ok']];
  const pressPin = (k) => {
    setReError('');
    if (k === 'del') { setRePin(p => p.slice(0, -1)); return; }
    if (k === 'ok')  { if (rePin.length === 4) doReAuth(rePin); return; }
    setRePin(p => p.length < 4 ? p + k : p);
  };
  useEffect(() => {
    if (rePin.length === 4) doReAuth(rePin);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rePin]);

  const doReAuth = async (pin) => {
    const uid = user?.id || user?._id;
    if (!uid) { setReError('Session lost. Open your admin link again.'); return; }
    setReLoading(true); setReError('');
    try {
      const { data } = await axios.post(`${API}/auth/pin-login`, { userId: uid, pin });
      localStorage.setItem('adminToken', data.token);
      localStorage.setItem('adminUser',  JSON.stringify(data.user));
      setAuthScreen(false);
      setRePin('');
    } catch (e) {
      setReError(e.response?.data?.message || 'Wrong PIN');
      setRePin('');
    } finally { setReLoading(false); }
  };

  const load = useCallback(async (date = selDate) => {
    setLoading(true);
    try {
      const { data: res } = await adminApi.get(`/dashboard/admin-summary?date=${date}`);
      setData(res.data);
      setLastRefresh(new Date());
      if (!isAdmin && user?.branchId) {
        setSelBranch(user.branchId);
      } else if (!selBranch && res.data.summary?.length > 0) {
        setSelBranch(String(res.data.summary[0]._id));
      }
    } catch (e) {
      if (e.response?.status === 401) {
        localStorage.removeItem('adminToken');
        setAuthScreen(true);
      }
    } finally { setLoading(false); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAdmin, user, navigate, selBranch]);

  const loadWorkers = useCallback(async () => {
    if (!selBranch) return;
    try {
      const { data: res } = await adminApi.get(`/workers/active-workers?branchId=${selBranch}&status=active&limit=500`);
      setAllWorkers(res.data || []);
    } catch {}
  }, [selBranch]);

  const loadBreaks = useCallback(async (date = selDate) => {
    if (!selBranch) return;
    setBreakLoading(true);
    try {
      const { data: res } = await adminApi.get(`/breaks/summary?date=${date}&branchId=${selBranch}`);
      setBreakData(res.data);
    } catch {} finally { setBreakLoading(false); }
  }, [selBranch, selDate]);

  // Load when date changes
  useEffect(() => { load(selDate); }, [selDate]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { loadWorkers(); }, [loadWorkers]);
  useEffect(() => { if (tab === 'breaks') loadBreaks(selDate); }, [tab, selDate, selBranch]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    const t = setInterval(() => { if (selDate === todayUTC()) load(selDate); }, 5 * 60 * 1000);
    return () => clearInterval(t);
  }, [selDate, load]);

  const logout = () => {
    localStorage.removeItem('adminToken');
    // keep adminUser so the re-auth screen knows who to authenticate
    setAuthScreen(true);
    setRePin(''); setReError('');
  };

  const changeDate = (delta) => {
    const next = addDays(selDate, delta);
    if (next > todayUTC()) return;  // can't go into future
    setSelDate(next);
    setShortageView('day');
    setOffenceView('day');
  };

  const branch = useMemo(() =>
    data?.summary?.find(b => String(b._id) === selBranch) || data?.summary?.[0] || null,
    [data, selBranch]
  );

  const isFuture = selDate > todayUTC();
  const isToday  = selDate === todayUTC();

  // ── Render ────────────────────────────────────────────────────────────────

  // ── PIN re-auth screen (shown when token is missing or expired) ───────────
  if (authScreen) {
    const roleLabel = (r) => ({
      super_admin: 'Super Admin', admin: 'Admin', supervisor: 'Supervisor',
      record_supervisor: 'Record Supervisor', hr_staff: 'HR Staff',
    }[r] || r || 'Staff');
    const noUserId = !(user?.id || user?._id);

    return (
      <div className="h-[100dvh] bg-gradient-to-b from-green-800 to-green-950 flex flex-col items-center justify-center px-4 py-10 select-none overflow-hidden">
        <PWAInstallBanner manifest="/admin-manifest.json" />

        <div className="text-center mb-8">
          <div className="w-20 h-20 rounded-full bg-white/20 border-4 border-white/40 flex items-center justify-center mx-auto mb-4">
            <span className="text-3xl font-black text-white">
              {user?.company?.name?.[0]?.toUpperCase() || '⛽'}
            </span>
          </div>
          {user ? (
            <>
              <p className="text-green-200 text-xs font-semibold uppercase tracking-widest mb-1">
                {user.company?.name || 'Sage Energy'}
              </p>
              <h1 className="text-white text-3xl font-black leading-tight">{user.name}</h1>
              <p className="text-green-300 text-sm mt-1">{roleLabel(user.role)}</p>
              <p className="text-green-400/70 text-xs mt-3">Enter your PIN to continue</p>
            </>
          ) : (
            <>
              <h1 className="text-white text-2xl font-black">Admin Dashboard</h1>
              <p className="text-red-300 text-sm mt-2">Session expired — open your admin link to log in again</p>
              <a href="/login" className="inline-block mt-4 text-green-300 text-sm underline">Go to login →</a>
            </>
          )}
        </div>

        {!noUserId && (
          <>
            {/* PIN dots */}
            <div className="flex gap-4 mb-8">
              {[0,1,2,3].map(i => (
                <div key={i}
                  className={`w-5 h-5 rounded-full border-2 border-white/60 transition-all duration-150
                    ${i < rePin.length ? 'bg-white scale-110' : 'bg-transparent'}`} />
              ))}
            </div>

            {reError && (
              <div className="mb-5 bg-red-500/20 border border-red-400/40 rounded-xl px-5 py-2.5 text-center">
                <p className="text-red-200 font-semibold text-sm">{reError}</p>
              </div>
            )}
            {reLoading && (
              <div className="mb-5">
                <div className="w-7 h-7 rounded-full border-t-white animate-spin mx-auto" style={{ borderWidth: 3, borderColor: 'rgba(255,255,255,0.3)', borderTopColor: '#fff' }} />
              </div>
            )}

            <div className="grid grid-cols-3 gap-3 w-full max-w-xs">
              {PAD_KEYS.flat().map((key) => {
                if (key === 'del') return (
                  <button key="del" onPointerDown={() => pressPin('del')}
                    className="h-16 rounded-2xl bg-white/10 hover:bg-white/20 active:bg-white/30 border border-white/20 flex items-center justify-center text-white text-2xl font-bold transition-all active:scale-95">⌫</button>
                );
                if (key === 'ok') return (
                  <button key="ok" onPointerDown={() => pressPin('ok')} disabled={rePin.length !== 4 || reLoading}
                    className={`h-16 rounded-2xl border flex items-center justify-center text-xl font-bold transition-all active:scale-95
                      ${rePin.length === 4 ? 'bg-white text-green-800 hover:bg-green-50 border-white shadow-lg' : 'bg-white/10 border-white/20 text-white/40'}`}>✓</button>
                );
                return (
                  <button key={key} onPointerDown={() => pressPin(key)} disabled={reLoading}
                    className="h-16 rounded-2xl bg-white/15 hover:bg-white/25 active:bg-white/35 border border-white/20 flex items-center justify-center text-white text-2xl font-bold transition-all active:scale-95">{key}</button>
                );
              })}
            </div>
            <p className="text-green-400/60 text-xs mt-8 text-center">Forgot PIN? Contact your manager</p>
          </>
        )}
      </div>
    );
  }

  return (
    <div className="h-[100dvh] bg-gray-50 flex flex-col max-w-lg mx-auto overflow-hidden">

      {/* ── PWA Install Banner ───────────────────────────────────────────────── */}
      <PWAInstallBanner manifest="/admin-manifest.json" />

      {/* ── Header ──────────────────────────────────────────────────────────── */}
      <div className="bg-green-800 text-white px-4 pt-5 pb-3 shrink-0 shadow-lg z-40">
        <div className="flex items-center justify-between mb-3">
          <div>
            <p className="text-green-300 text-xs font-semibold uppercase tracking-widest">
              {user?.company?.name || 'Dashboard'}
            </p>
            <h1 className="text-lg font-black leading-tight">{user?.name}</h1>
          </div>
          <div className="flex items-center gap-2">
            {isToday && (
              <button onClick={() => load(selDate)} title="Refresh"
                className="w-9 h-9 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center text-lg transition-all">
                🔄
              </button>
            )}
            {/* Notification bell */}
            {'Notification' in window && (
              <button
                onClick={toggleNotifications}
                title={notifStatus === 'on' ? 'Notifications on — tap to turn off' : notifStatus === 'denied' ? 'Notifications blocked in browser settings' : 'Enable notifications'}
                disabled={notifStatus === 'loading' || notifStatus === 'denied'}
                className={`w-9 h-9 rounded-full flex items-center justify-center text-lg transition-all
                  ${notifStatus === 'on'      ? 'bg-amber-400/30 text-amber-200'
                  : notifStatus === 'denied'  ? 'bg-white/5 opacity-40 cursor-not-allowed'
                  : notifStatus === 'loading' ? 'bg-white/10 animate-pulse'
                  : 'bg-white/10 hover:bg-white/20'}`}>
                {notifStatus === 'on' ? '🔔' : notifStatus === 'denied' ? '🔕' : '🔕'}
              </button>
            )}
            <button onClick={logout} title="Sign out"
              className="w-9 h-9 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center transition-all">
              <span className="text-sm font-bold">↩</span>
            </button>
          </div>
        </div>

        {/* Date navigation — tap arrows or swipe left/right */}
        <div
          className="flex items-center justify-between bg-white/10 rounded-xl px-2 py-1.5"
          onTouchStart={e => setTouchStartX(e.touches[0].clientX)}
          onTouchEnd={e => {
            if (touchStartX === null) return;
            const diff = touchStartX - e.changedTouches[0].clientX;
            if (Math.abs(diff) > 40) {
              if (diff > 0 && !isToday) changeDate(1);
              if (diff < 0) changeDate(-1);
            }
            setTouchStartX(null);
          }}
        >
          <button onClick={() => changeDate(-1)}
            className="w-9 h-9 rounded-lg bg-white/10 hover:bg-white/20 flex items-center justify-center text-white font-bold text-lg active:scale-90 transition-all">
            ‹
          </button>
          <div className="text-center flex-1">
            <p className={`font-black text-base ${isToday ? 'text-white' : 'text-green-200'}`}>
              {isToday ? '📅 Today' : `📅 ${fmtDateLabel(selDate)}`}
            </p>
            {!isToday && (
              <button onClick={() => { setSelDate(todayUTC()); setShortageView('day'); setOffenceView('day'); }}
                className="text-green-300 text-xs underline mt-0.5">
                Back to Today
              </button>
            )}
          </div>
          <button onClick={() => changeDate(1)} disabled={isToday}
            className={`w-9 h-9 rounded-lg flex items-center justify-center font-bold text-lg transition-all
              ${isToday ? 'opacity-30 cursor-not-allowed' : 'bg-white/10 hover:bg-white/20 text-white active:scale-90'}`}>
            ›
          </button>
        </div>

        {/* Last refresh */}
        {lastRefresh && isToday && (
          <p className="text-green-400/70 text-[10px] text-right mt-1">
            Updated {lastRefresh.toLocaleTimeString('en-NG',{hour:'2-digit',minute:'2-digit'})}
          </p>
        )}
      </div>

      {/* ── Branch tab strip — always visible if multiple branches ───────────── */}
      {data?.summary?.length > 1 && (
        <div className="bg-white border-b border-gray-200 shadow-sm shrink-0 z-30">
          <div className="flex overflow-x-auto gap-0 scrollbar-none">
            {data.summary.map(b => {
              const active = String(b._id) === selBranch;
              return (
                <button
                  key={b._id}
                  onClick={() => setSelBranch(String(b._id))}
                  className={`flex-shrink-0 px-5 py-3 text-left transition-all border-b-[3px]
                    ${active
                      ? 'border-green-600 bg-green-50'
                      : 'border-transparent bg-white hover:bg-gray-50'}`}
                >
                  <p className={`text-sm font-bold leading-tight whitespace-nowrap
                    ${active ? 'text-green-800' : 'text-gray-600'}`}>
                    {b.name}
                  </p>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* ── Loading ──────────────────────────────────────────────────────────── */}
      {loading && (
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center">
            <div className="w-12 h-12 border-4 border-green-200 border-t-green-600 rounded-full animate-spin mx-auto mb-3" />
            <p className="text-gray-500 font-medium">Loading…</p>
          </div>
        </div>
      )}

      {/* ── Content ──────────────────────────────────────────────────────────── */}
      {!loading && branch && (
        <div className="flex-1 min-h-0 overflow-y-auto pb-24">

          {/* ════ HOME TAB ══════════════════════════════════════════════════════ */}
          {tab === 'home' && (
            <div className="p-4 space-y-4">

              {/* 4 stat cards — counts only workers expected today */}
              <div className="grid grid-cols-2 gap-3">
                <StatCard emoji="✅" value={branch.clockedIn?.length ?? 0}
                  label={`Present (of ${branch.totalExpected ?? branch.totalActive})`}
                  color="green" onClick={() => setTab('staff')} />
                <StatCard emoji="❌" value={branch.absent?.length ?? 0}
                  label="Absent Today" color="red" onClick={() => setTab('staff')} />
                <StatCard emoji="☕"
                  value={`₦${(branch.dayShortageTotal || 0).toLocaleString()}`}
                  label={`Total Break Taken ${isToday ? 'Today' : fmtDateLabel(selDate)}`}
                  color="amber" onClick={() => setTab('breaks')} />
                <StatCard emoji="⚠️" value={branch.dayOffences?.length ?? 0}
                  label={`${isToday ? 'Today' : fmtDateLabel(selDate)} Bookings`}
                  color="orange" onClick={() => setTab('bookings')} />
              </div>



              {/* Quick actions */}
              {isToday && (
                <div className="grid grid-cols-2 gap-3">
                  <button onClick={() => { setTab('add'); setShowShortage(true); }}
                    className="rounded-2xl bg-green-600 text-white p-4 text-center shadow active:scale-95 transition-all">
                    <div className="text-3xl mb-1">💸</div>
                    <div className="text-sm font-black">Record Shortage</div>
                  </button>
                  <button onClick={() => { setTab('add'); setShowOffence(true); }}
                    className="rounded-2xl bg-orange-500 text-white p-4 text-center shadow active:scale-95 transition-all">
                    <div className="text-3xl mb-1">⚠️</div>
                    <div className="text-sm font-black">Book Offence</div>
                  </button>
                </div>
              )}
            </div>
          )}

          {/* ════ STAFF TAB ═════════════════════════════════════════════════════ */}
          {tab === 'staff' && (
            <div className="p-4">
              {/* Summary strip */}
              <div className="flex gap-2 mb-4 flex-wrap">
                <span className="text-xs bg-green-100 text-green-700 font-bold px-2.5 py-1 rounded-full">
                  ✅ {branch.clockedIn?.length || 0} present
                </span>
                {branch.absent?.length > 0 && (
                  <span className="text-xs bg-red-100 text-red-700 font-bold px-2.5 py-1 rounded-full">
                    ❌ {branch.absent.length} absent
                  </span>
                )}
                {(branch.offCount || 0) > 0 && (
                  <span className="text-xs bg-gray-100 text-gray-500 font-bold px-2.5 py-1 rounded-full">
                    📅 {branch.offCount} off today
                  </span>
                )}
                <span className="text-xs bg-blue-50 text-blue-600 font-semibold px-2.5 py-1 rounded-full">
                  {fmtDateLabel(selDate)}
                </span>
              </div>

              {/* All-present banner */}
              {(branch.totalExpected ?? 0) > 0 && branch.absent?.length === 0 && branch.clockedIn?.length > 0 && (
                <div className="bg-green-500 text-white rounded-2xl px-4 py-3 mb-4 flex items-center gap-3">
                  <span className="text-2xl">🎉</span>
                  <div>
                    <p className="font-black">All {branch.totalExpected} expected workers present!</p>
                    {(branch.offCount || 0) > 0 && (
                      <p className="text-green-100 text-xs">{branch.offCount} others on scheduled day off</p>
                    )}
                  </div>
                </div>
              )}

              {/* Shift groups */}
              {branch.shiftGroups?.length > 0 ? (
                <>
                  <SectionHeader emoji="🏷️" title="By Shift" color="gray" />
                  {branch.shiftGroups.map((g, i) => (
                    <ShiftGroup key={i} group={g} />
                  ))}
                </>
              ) : (
                <>
                  {/* Fallback: flat list when no shifts configured */}
                  <div className="mb-6">
                    <SectionHeader emoji="✅" title={`Clocked In (${branch.clockedIn?.length || 0})`} color="green" />
                    {branch.clockedIn?.length === 0
                      ? <EmptyState msg="Nobody clocked in yet" />
                      : branch.clockedIn.map((w, i) => (
                          <WorkerRow key={i} name={w.fullName} role={w.role}
                            time={fmtTime(w.clockInTime)} hasOut={w.hasClockOut}
                            variant="present" voluntaryIn={w.voluntaryIn} />
                        ))}
                  </div>
                  <div className="mb-6">
                    <SectionHeader emoji="❌" title={`Absent — Should Be Here (${branch.absent?.length || 0})`} color="red" />
                    {branch.absent?.length === 0
                      ? <EmptyState msg="All expected workers present 🎉" />
                      : branch.absent.map((w, i) => (
                          <WorkerRow key={i} name={w.fullName} role={w.role} variant="absent" />
                        ))}
                  </div>
                  {(branch.offToday?.length || 0) > 0 && (
                    <div>
                      <SectionHeader emoji="📅" title={`Off Today (${branch.offToday.length})`} color="gray" />
                      {branch.offToday.map((w, i) => (
                        <WorkerRow key={i} name={w.fullName} role={w.role} variant="off" />
                      ))}
                    </div>
                  )}
                </>
              )}
            </div>
          )}

          {/* ════ SHORTAGE TAB ══════════════════════════════════════════════════ */}
          {tab === 'shortage' && (
            <div className="p-4 space-y-3">

              {/* Day / Month toggle */}
              <div className="flex gap-2 bg-gray-100 rounded-xl p-1">
                {[['day', `📅 ${fmtDateLabel(selDate)}`], ['month', `📆 This Month`]].map(([v, lbl]) => (
                  <button key={v} onClick={() => setShortageView(v)}
                    className={`flex-1 py-2 rounded-lg text-sm font-black transition-all
                      ${shortageView === v ? 'bg-white text-green-800 shadow-sm' : 'text-gray-500'}`}>
                    {lbl}
                  </button>
                ))}
              </div>

              {shortageView === 'day' && (
                <>
                  <div className="flex items-center justify-between">
                    <SectionHeader emoji="💸" title="Shortages" color="amber" />
                    {isToday && (
                      <button onClick={() => setShowShortage(true)}
                        className="px-3 py-1.5 rounded-xl bg-green-600 text-white text-xs font-bold">
                        + Add
                      </button>
                    )}
                  </div>

                  {branch.dayShortages?.length === 0
                    ? <EmptyState msg={`No shortages on ${fmtDateLabel(selDate)}`} />
                    : (
                      <>
                        <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 text-center">
                          <p className="text-3xl font-black text-amber-700">
                            ₦{(branch.dayShortageTotal || 0).toLocaleString()}
                          </p>
                          <p className="text-amber-600 text-sm font-semibold">Total for {fmtDateLabel(selDate)}</p>
                        </div>
                        {branch.dayShortages.map((s, i) => <ShortageCard key={i} s={s} />)}
                      </>
                    )}
                </>
              )}

              {shortageView === 'month' && (
                <>
                  <div className="bg-red-50 border border-red-200 rounded-2xl p-4 flex justify-between items-center">
                    <div>
                      <p className="text-xs text-red-600 font-semibold uppercase">Month Total</p>
                      <p className="text-3xl font-black text-red-700">
                        ₦{(branch.monthShortageTotal || 0).toLocaleString()}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-2xl font-black text-red-600">{branch.monthShortageHistory?.length || 0}</p>
                      <p className="text-xs text-red-500">days with shortages</p>
                    </div>
                  </div>

                  {(branch.monthShortageHistory || []).length === 0
                    ? <EmptyState msg="No shortages this month 🎉" />
                    : (branch.monthShortageHistory || []).map((g, i) => (
                        <HistoryDateGroup key={i} group={g} type="shortage" />
                      ))}
                </>
              )}
            </div>
          )}

          {/* ════ BREAKS TAB ════════════════════════════════════════════════════ */}
          {tab === 'breaks' && (
            <div className="p-4 space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-sm font-black text-gray-700">☕ Break Activity · {fmtDateLabel(selDate)}</p>
                <button onClick={() => loadBreaks(selDate)} className="p-1.5 rounded-lg bg-gray-100 hover:bg-gray-200">
                  <span className="text-xs">🔄</span>
                </button>
              </div>

              {/* Currently on break — live highlight */}
              {(() => {
                const onBreak = (breakData?.breaks || []).filter(b => b.status === 'active');
                if (!breakData) return null;
                return onBreak.length > 0 ? (
                  <div className="bg-blue-50 border-2 border-blue-300 rounded-2xl p-4">
                    <p className="text-xs font-bold text-blue-600 uppercase tracking-wider mb-3">
                      🔴 Live · {onBreak.length} Worker{onBreak.length !== 1 ? 's' : ''} Currently on Break
                    </p>
                    <div className="space-y-2">
                      {onBreak.map((b, i) => (
                        <div key={i} className="flex items-center gap-3 bg-white rounded-xl px-3 py-2.5 shadow-sm">
                          <span className="text-xl">{BREAK_EMOJI[b.breakType] || '☕'}</span>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-bold text-gray-900 truncate">{b.workerName}</p>
                            <p className="text-xs text-gray-500">{BREAK_LABEL[b.breakType] || b.breakType}</p>
                          </div>
                          <div className="text-right shrink-0">
                            <span className="text-xs px-2 py-1 rounded-full bg-blue-100 text-blue-700 font-bold animate-pulse">On Break</span>
                            {b.startTime && (
                              <p className="text-[10px] text-gray-400 mt-0.5">since {fmtTime(b.startTime)}</p>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : (
                  <div className="bg-green-50 border border-green-200 rounded-2xl px-4 py-3 text-center">
                    <p className="text-sm font-semibold text-green-700">✅ No one is currently on break</p>
                  </div>
                );
              })()}

              {breakLoading && (
                <div className="flex justify-center py-10">
                  <div className="w-6 h-6 border-2 border-green-600 border-t-transparent rounded-full animate-spin" />
                </div>
              )}

              {!breakLoading && breakData && (
                <>
                  {/* Summary counts */}
                  <div className="grid grid-cols-4 gap-2">
                    {[
                      { label: 'Total',     value: breakData.summary?.total      ?? 0, cls: 'bg-blue-50 text-blue-700'   },
                      { label: 'Done',      value: breakData.summary?.completed  ?? 0, cls: 'bg-green-50 text-green-700' },
                      { label: 'Overstay',  value: breakData.summary?.overstayed ?? 0, cls: 'bg-red-50 text-red-700'     },
                      { label: 'Missed',    value: breakData.summary?.missed     ?? 0, cls: 'bg-gray-50 text-gray-600'   },
                    ].map(c => (
                      <div key={c.label} className={`${c.cls} rounded-xl p-3 text-center`}>
                        <p className="text-xl font-black">{c.value}</p>
                        <p className="text-[10px] font-semibold mt-0.5">{c.label}</p>
                      </div>
                    ))}
                  </div>

                  {/* Per-type breakdown */}
                  {breakData.summary?.byType && Object.keys(breakData.summary.byType).length > 0 && (
                    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 space-y-2">
                      <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">By Break Type</p>
                      {Object.entries(breakData.summary.byType).map(([type, stats]) => (
                        <div key={type} className="flex items-center gap-3 py-2 border-b border-gray-50 last:border-0">
                          <span className="text-lg w-6 text-center">{BREAK_EMOJI[type] || '☕'}</span>
                          <span className="text-sm font-medium text-gray-700 flex-1">{stats.label || BREAK_LABEL[type] || type}</span>
                          <div className="flex gap-1 flex-wrap justify-end">
                            {stats.completed  > 0 && <span className="text-xs px-2 py-0.5 rounded-full bg-green-100 text-green-700">{stats.completed} done</span>}
                            {stats.overstayed > 0 && <span className="text-xs px-2 py-0.5 rounded-full bg-red-100 text-red-700">{stats.overstayed} over</span>}
                            {stats.active     > 0 && <span className="text-xs px-2 py-0.5 rounded-full bg-blue-100 text-blue-700">{stats.active} active</span>}
                            {stats.missed     > 0 && <span className="text-xs px-2 py-0.5 rounded-full bg-gray-100 text-gray-600">{stats.missed} missed</span>}
                            {stats.total === 0 && <span className="text-xs text-gray-400">No records</span>}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Individual break records */}
                  {breakData.breaks?.length === 0
                    ? <EmptyState msg={`No break records on ${fmtDateLabel(selDate)}`} />
                    : (
                      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm divide-y divide-gray-50 overflow-hidden">
                        <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider px-4 py-3">All Break Records</p>
                        {(breakData.breaks || []).map((b, i) => (
                          <div key={i} className="px-4 py-3 flex items-center gap-3">
                            <span className="text-xl">{BREAK_EMOJI[b.breakType] || '☕'}</span>
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-semibold text-gray-800 truncate">{b.workerName}</p>
                              <p className="text-xs text-gray-500">{BREAK_LABEL[b.breakType] || b.breakType} · {b.workerRole}</p>
                            </div>
                            <div className="text-right shrink-0">
                              <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                                b.status === 'completed'  ? 'bg-green-100 text-green-700' :
                                b.status === 'overstayed' ? 'bg-red-100 text-red-700'     :
                                b.status === 'active'     ? 'bg-blue-100 text-blue-700'   :
                                'bg-gray-100 text-gray-600'
                              }`}>{b.status}</span>
                              {b.durationMinutes != null && (
                                <p className="text-[10px] text-gray-400 mt-0.5">{b.durationMinutes} min</p>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                </>
              )}

              {!breakLoading && !breakData && (
                <EmptyState msg="Select a branch to view breaks" />
              )}
            </div>
          )}

          {/* ════ BOOKINGS TAB ══════════════════════════════════════════════════ */}
          {tab === 'bookings' && (
            <div className="p-4 space-y-3">

              {/* Day / Month toggle */}
              <div className="flex gap-2 bg-gray-100 rounded-xl p-1">
                {[['day', `📅 ${fmtDateLabel(selDate)}`], ['month', `📆 This Month`]].map(([v, lbl]) => (
                  <button key={v} onClick={() => setOffenceView(v)}
                    className={`flex-1 py-2 rounded-lg text-sm font-black transition-all
                      ${offenceView === v ? 'bg-white text-orange-700 shadow-sm' : 'text-gray-500'}`}>
                    {lbl}
                  </button>
                ))}
              </div>

              {offenceView === 'day' && (
                <>
                  <div className="flex items-center justify-between">
                    <SectionHeader emoji="⚠️" title="Bookings" color="orange" />
                    {isToday && (
                      <button onClick={() => setShowOffence(true)}
                        className="px-3 py-1.5 rounded-xl bg-orange-500 text-white text-xs font-bold">
                        + Book
                      </button>
                    )}
                  </div>

                  {branch.dayOffences?.length === 0
                    ? <EmptyState msg={`No bookings on ${fmtDateLabel(selDate)}`} />
                    : branch.dayOffences.map((o, i) => <OffenceCard key={i} o={o} />)}
                </>
              )}

              {offenceView === 'month' && (
                <>
                  <div className="bg-orange-50 border border-orange-200 rounded-2xl p-4 flex justify-between items-center">
                    <div>
                      <p className="text-xs text-orange-600 font-semibold uppercase">This Month</p>
                      <p className="text-3xl font-black text-orange-700">{branch.monthOffenceCount || 0}</p>
                      <p className="text-xs text-orange-500">total bookings</p>
                    </div>
                    <div className="text-right">
                      <p className="text-2xl font-black text-orange-600">{branch.monthOffenceHistory?.length || 0}</p>
                      <p className="text-xs text-orange-500">days with bookings</p>
                    </div>
                  </div>

                  {(branch.monthOffenceHistory || []).length === 0
                    ? <EmptyState msg="No bookings this month" />
                    : (branch.monthOffenceHistory || []).map((g, i) => (
                        <HistoryDateGroup key={i} group={g} type="offence" />
                      ))}
                </>
              )}
            </div>
          )}

          {/* ════ ADD TAB ════════════════════════════════════════════════════════ */}
          {tab === 'add' && (
            <div className="p-4 space-y-4">
              <p className="text-center text-gray-500 font-semibold text-sm pt-2">What do you want to do?</p>

              <button onClick={() => setShowShortage(true)}
                className="w-full bg-white border-2 border-green-400 rounded-2xl p-6 flex items-center gap-5 shadow-sm hover:bg-green-50 active:scale-95 transition-all">
                <span className="text-5xl">💸</span>
                <div className="text-left">
                  <p className="text-xl font-black text-gray-900">Record Shortage</p>
                  <p className="text-gray-500 text-sm">Report a cash or fuel shortage</p>
                </div>
              </button>

              <button onClick={() => setShowOffence(true)}
                className="w-full bg-white border-2 border-orange-400 rounded-2xl p-6 flex items-center gap-5 shadow-sm hover:bg-orange-50 active:scale-95 transition-all">
                <span className="text-5xl">⚠️</span>
                <div className="text-left">
                  <p className="text-xl font-black text-gray-900">Book a Worker</p>
                  <p className="text-gray-500 text-sm">Record a disciplinary offence</p>
                </div>
              </button>

              <div className="mt-2 border-t border-gray-200 pt-4">
                <p className="text-xs text-gray-400 text-center font-medium uppercase tracking-widest mb-3">More options</p>
                <div className="grid grid-cols-2 gap-3">
                  {[
                    { emoji: '👥', label: 'All Workers',    path: '/workers'    },
                    { emoji: '📊', label: 'Full Dashboard', path: '/dashboard'  },
                    { emoji: '📋', label: 'Attendance',     path: '/attendance' },
                    { emoji: '🏢', label: 'Branches',       path: '/branches'   },
                  ].map(item => (
                    <button key={item.path} onClick={() => navigate(item.path)}
                      className="bg-white border border-gray-200 rounded-xl p-3 flex items-center gap-2 shadow-sm hover:bg-gray-50 active:scale-95 transition-all">
                      <span className="text-2xl">{item.emoji}</span>
                      <span className="text-sm font-semibold text-gray-700">{item.label}</span>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── Empty state ──────────────────────────────────────────────────────── */}
      {!loading && !branch && (
        <div className="flex-1 min-h-0 flex items-center justify-center p-6">
          <div className="text-center">
            <p className="text-5xl mb-4">🏢</p>
            <p className="text-gray-600 font-semibold">No branch data available</p>
            <button onClick={() => load(selDate)}
              className="mt-4 px-6 py-2 bg-green-600 text-white rounded-xl font-bold">Refresh</button>
          </div>
        </div>
      )}

      {/* ── Bottom navigation ────────────────────────────────────────────────── */}
      <nav className="fixed bottom-0 left-0 right-0 max-w-lg mx-auto bg-white border-t border-gray-200 z-40 shadow-lg">
        <div className="flex">
          {TABS.map(t => (
            <button key={t.id} onClick={() => setTab(t.id)}
              className={`flex-1 py-3 flex flex-col items-center gap-0.5 transition-all relative
                ${tab === t.id ? 'text-green-700' : 'text-gray-400'}`}>
              <span className="text-xl">{t.icon}</span>
              <span className={`text-[10px] font-bold ${tab === t.id ? 'text-green-700' : 'text-gray-400'}`}>
                {t.label}
              </span>
              {tab === t.id && (
                <div className="absolute bottom-0 w-8 h-0.5 bg-green-600 rounded-full" />
              )}
            </button>
          ))}
        </div>
      </nav>

      {/* ── Modals ───────────────────────────────────────────────────────────── */}
      {showShortage && (
        <ShortageModal workers={allWorkers} branchId={selBranch}
          onClose={() => setShowShortage(false)}
          onSaved={() => { setShowShortage(false); load(selDate); setTab('shortage'); }} />
      )}
      {showOffence && (
        <OffenceModal workers={allWorkers} branchId={selBranch}
          onClose={() => setShowOffence(false)}
          onSaved={() => { setShowOffence(false); load(selDate); setTab('bookings'); }} />
      )}
    </div>
  );
}
