/**
 * AdminDashboard — /admin-dashboard
 * Simple, icon-heavy, mobile-first dashboard for admins/supervisors.
 * Accessed via PIN login at /admin/:userId — no email/password needed.
 * Reads token from sessionStorage.adminToken.
 */
import { useState, useEffect, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';

const API = import.meta.env.VITE_API_URL || '/api';

// ── axios instance using sessionStorage token ─────────────────────────────────
const adminApi = axios.create({ baseURL: API });
adminApi.interceptors.request.use(cfg => {
  const t = sessionStorage.getItem('adminToken');
  if (t) cfg.headers.Authorization = `Bearer ${t}`;
  return cfg;
});

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
  { value: 'late_arrival',          icon: '🕐', label: 'Late Arrival'    },
  { value: 'absent_without_notice', icon: '🚫', label: 'Absent'          },
  { value: 'mobile_phone_misuse',   icon: '📵', label: 'Phone Misuse'    },
  { value: 'rude_to_customer',      icon: '😤', label: 'Rude to Customer'},
  { value: 'cash_shortage',         icon: '💵', label: 'Cash Shortage'   },
  { value: 'fuel_shortage',         icon: '⛽', label: 'Fuel Shortage'   },
  { value: 'improper_uniform',      icon: '👕', label: 'Bad Uniform'     },
  { value: 'negligence',            icon: '😴', label: 'Negligence'      },
  { value: 'sleeping_on_duty',      icon: '💤', label: 'Sleeping'        },
  { value: 'abandoning_post',       icon: '🏃', label: 'Left Post'       },
  { value: 'fighting_misconduct',   icon: '👊', label: 'Fighting'        },
  { value: 'damage_to_property',    icon: '💥', label: 'Damage'          },
  { value: 'theft_fraud',           icon: '🚨', label: 'Theft/Fraud'     },
  { value: 'other',                 icon: '📝', label: 'Other'           },
];

const SEVERITY = [
  { value: 'minor',    label: 'Minor',    bg: 'bg-yellow-400', text: 'text-yellow-900' },
  { value: 'moderate', label: 'Moderate', bg: 'bg-orange-400', text: 'text-orange-900' },
  { value: 'serious',  label: 'Serious',  bg: 'bg-red-500',    text: 'text-white'      },
  { value: 'gross',    label: 'Gross',    bg: 'bg-red-900',    text: 'text-white'      },
];

const ACTION = [
  { value: 'verbal_warning',   label: 'Verbal Warning'   },
  { value: 'written_warning',  label: 'Written Warning'  },
  { value: 'suspension',       label: 'Suspension'       },
  { value: 'deduction',        label: 'Deduction (₦)'   },
  { value: 'none',             label: 'No Action Yet'    },
];

const fmtTime = (ts) => {
  if (!ts) return '—';
  const d = new Date(ts);
  return d.toLocaleTimeString('en-NG', { hour: '2-digit', minute: '2-digit', hour12: true });
};

const roleLabel = (r) => (r || '').replace(/_/g, ' ');

// ── Quick-add: Shortage Modal ─────────────────────────────────────────────────
function ShortageModal({ workers, branchId, onClose, onSaved, adminUser }) {
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
      await adminApi.post('/shortages', {
        workerId, amount: Number(amount), reason, notes,
        branchId,
      });
      onSaved();
    } catch (e) {
      setError(e.response?.data?.message || 'Failed to save');
    } finally { setSaving(false); }
  };

  return (
    <FullModal title="💸 Record Shortage" onClose={onClose}>
      {/* Worker */}
      <FieldLabel>👤 Worker</FieldLabel>
      <select className="bigInput" value={workerId} onChange={e => setWorkerId(e.target.value)}>
        <option value="">— Select worker —</option>
        {workers.map(w => (
          <option key={w._id} value={w._id}>{w.fullName} · {roleLabel(w.role)}</option>
        ))}
      </select>

      {/* Amount */}
      <FieldLabel>💰 Amount (₦)</FieldLabel>
      <input className="bigInput" type="number" inputMode="numeric" placeholder="e.g. 1500"
        value={amount} onChange={e => setAmount(e.target.value)} />

      {/* Reason */}
      <FieldLabel>📋 Reason</FieldLabel>
      <div className="grid grid-cols-3 gap-2">
        {REASON_OPTIONS.map(r => (
          <button key={r.value} type="button"
            onClick={() => setReason(r.value)}
            className={`py-3 rounded-xl border-2 text-center transition-all
              ${reason === r.value
                ? 'border-green-500 bg-green-50 text-green-800 font-bold'
                : 'border-gray-200 bg-white text-gray-600'}`}
          >
            <div className="text-2xl">{r.icon}</div>
            <div className="text-xs mt-1 font-medium leading-tight">{r.label}</div>
          </button>
        ))}
      </div>

      {/* Notes */}
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

// ── Quick-add: Offence Modal ──────────────────────────────────────────────────
function OffenceModal({ workers, branchId, onClose, onSaved }) {
  const [workerId,  setWorkerId  ] = useState('');
  const [type,      setType      ] = useState('');
  const [severity,  setSeverity  ] = useState('');
  const [action,    setAction    ] = useState('verbal_warning');
  const [deduction, setDeduction ] = useState('');
  const [desc,      setDesc      ] = useState('');
  const [saving,    setSaving    ] = useState(false);
  const [error,     setError     ] = useState('');

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
    } catch (e) {
      setError(e.response?.data?.message || 'Failed to save');
    } finally { setSaving(false); }
  };

  return (
    <FullModal title="⚠️ Book Offence" onClose={onClose}>
      {/* Worker */}
      <FieldLabel>👤 Worker</FieldLabel>
      <select className="bigInput" value={workerId} onChange={e => setWorkerId(e.target.value)}>
        <option value="">— Select worker —</option>
        {workers.map(w => (
          <option key={w._id} value={w._id}>{w.fullName} · {roleLabel(w.role)}</option>
        ))}
      </select>

      {/* Offence type — scrollable grid */}
      <FieldLabel>🚨 What did they do?</FieldLabel>
      <div className="grid grid-cols-3 gap-2">
        {OFFENCE_OPTIONS.map(o => (
          <button key={o.value} type="button"
            onClick={() => setType(o.value)}
            className={`py-2.5 rounded-xl border-2 text-center transition-all
              ${type === o.value
                ? 'border-orange-500 bg-orange-50 text-orange-800 font-bold'
                : 'border-gray-200 bg-white text-gray-600'}`}
          >
            <div className="text-xl">{o.icon}</div>
            <div className="text-[11px] mt-0.5 font-medium leading-tight">{o.label}</div>
          </button>
        ))}
      </div>

      {/* Severity */}
      <FieldLabel>🔥 How serious?</FieldLabel>
      <div className="grid grid-cols-4 gap-2">
        {SEVERITY.map(s => (
          <button key={s.value} type="button"
            onClick={() => setSeverity(s.value)}
            className={`py-3 rounded-xl text-sm font-bold border-2 transition-all
              ${severity === s.value
                ? `${s.bg} ${s.text} border-transparent shadow-md scale-105`
                : 'bg-gray-100 text-gray-500 border-transparent'}`}
          >{s.label}</button>
        ))}
      </div>

      {/* Action */}
      <FieldLabel>📋 Action Taken</FieldLabel>
      <select className="bigInput" value={action} onChange={e => setAction(e.target.value)}>
        {ACTION.map(a => <option key={a.value} value={a.value}>{a.label}</option>)}
      </select>
      {action === 'deduction' && (
        <input className="bigInput mt-2" type="number" inputMode="numeric" placeholder="Deduction amount (₦)"
          value={deduction} onChange={e => setDeduction(e.target.value)} />
      )}

      {/* Description */}
      <FieldLabel>📝 Details (optional)</FieldLabel>
      <textarea className="bigInput resize-none" rows={2}
        placeholder="Brief description of what happened…"
        value={desc} onChange={e => setDesc(e.target.value)} />

      {error && <p className="text-red-600 font-semibold text-sm text-center">{error}</p>}

      <button onClick={submit} disabled={saving}
        className="w-full py-4 rounded-2xl bg-orange-500 hover:bg-orange-600 text-white text-xl font-black shadow-lg transition-all active:scale-95 disabled:opacity-50">
        {saving ? 'Saving…' : '⚠️ Book Worker'}
      </button>
    </FullModal>
  );
}

// ── Helpers ───────────────────────────────────────────────────────────────────
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

// ── Worker name badge ─────────────────────────────────────────────────────────
function WorkerRow({ name, role, time, hasOut, absent }) {
  return (
    <div className={`flex items-center gap-3 px-4 py-3 rounded-xl mb-2
      ${absent ? 'bg-red-50 border border-red-100' : 'bg-gray-50 border border-gray-100'}`}>
      <div className={`w-9 h-9 rounded-full flex items-center justify-center shrink-0 text-base font-black
        ${absent ? 'bg-red-100 text-red-700' : 'bg-green-100 text-green-700'}`}>
        {name[0]?.toUpperCase()}
      </div>
      <div className="flex-1 min-w-0">
        <p className={`font-bold leading-tight truncate ${absent ? 'text-red-800' : 'text-gray-900'}`}>{name}</p>
        <p className="text-xs text-gray-500 capitalize">{roleLabel(role)}</p>
      </div>
      {time && (
        <div className="text-right shrink-0">
          <p className="text-xs font-semibold text-gray-700">IN {time}</p>
          {hasOut && <p className="text-xs text-green-600 font-semibold">OUT ✓</p>}
        </div>
      )}
      {absent && <span className="text-red-500 text-xl shrink-0">❌</span>}
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────
const TABS = [
  { id: 'home',      icon: '🏠', label: 'Home'      },
  { id: 'staff',     icon: '👥', label: 'Staff'     },
  { id: 'shortage',  icon: '💸', label: 'Shortage'  },
  { id: 'bookings',  icon: '⚠️', label: 'Bookings'  },
  { id: 'add',       icon: '➕', label: 'Add'       },
];

export default function AdminDashboard() {
  const navigate  = useNavigate();
  const [tab,     setTab    ] = useState('home');
  const [data,    setData   ] = useState(null);
  const [loading, setLoading] = useState(true);
  const [selBranch, setSelBranch] = useState('');
  const [allWorkers, setAllWorkers] = useState([]);
  const [showShortageForm, setShowShortageForm] = useState(false);
  const [showOffenceForm,  setShowOffenceForm ] = useState(false);
  const [lastRefresh, setLastRefresh] = useState(null);

  const user = useMemo(() => {
    try { return JSON.parse(sessionStorage.getItem('adminUser') || 'null'); }
    catch { return null; }
  }, []);

  const isAdmin = ['super_admin', 'admin'].includes(user?.role);

  // Guard — redirect if no token
  useEffect(() => {
    if (!sessionStorage.getItem('adminToken')) {
      navigate('/login', { replace: true });
    }
  }, [navigate]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data: res } = await adminApi.get('/dashboard/admin-summary');
      setData(res.data);
      setLastRefresh(new Date());
      // Auto-select first branch if not admin
      if (!isAdmin && user?.branchId) {
        setSelBranch(user.branchId);
      } else if (!selBranch && res.data.summary?.length > 0) {
        setSelBranch(String(res.data.summary[0]._id));
      }
    } catch (e) {
      if (e.response?.status === 401) navigate('/login', { replace: true });
    } finally { setLoading(false); }
  }, [isAdmin, user, navigate]); // eslint-disable-line react-hooks/exhaustive-deps

  // Load workers for add forms
  const loadWorkers = useCallback(async () => {
    if (!selBranch) return;
    try {
      const { data: res } = await adminApi.get(`/workers/active-workers?branchId=${selBranch}&status=active&limit=500`);
      setAllWorkers(res.data || []);
    } catch {}
  }, [selBranch]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { loadWorkers(); }, [loadWorkers]);

  // Auto-refresh every 5 min
  useEffect(() => {
    const t = setInterval(load, 5 * 60 * 1000);
    return () => clearInterval(t);
  }, [load]);

  const logout = () => {
    sessionStorage.removeItem('adminToken');
    sessionStorage.removeItem('adminUser');
    navigate('/login', { replace: true });
  };

  // Current branch data
  const branch = useMemo(() =>
    data?.summary?.find(b => String(b._id) === selBranch) || data?.summary?.[0] || null,
    [data, selBranch]
  );

  const todayStr = data?.date || new Date().toISOString().split('T')[0];
  const [yr, mo, dy] = todayStr.split('-').map(Number);
  const dayNames = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
  const monthNames = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  const dateObj = new Date(Date.UTC(yr, mo - 1, dy));
  const dateLabel = `${dayNames[dateObj.getDay()]}, ${dy} ${monthNames[mo-1]} ${yr}`;

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-gray-50 flex flex-col max-w-lg mx-auto">

      {/* ── Header ──────────────────────────────────────────────────────────── */}
      <div className="bg-green-800 text-white px-4 pt-5 pb-3 sticky top-0 z-40 shadow-lg">
        <div className="flex items-center justify-between mb-2">
          <div>
            <p className="text-green-300 text-xs font-semibold uppercase tracking-widest">
              {user?.company?.name || 'Dashboard'}
            </p>
            <h1 className="text-lg font-black leading-tight">{user?.name}</h1>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={load} title="Refresh"
              className="w-9 h-9 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center text-lg transition-all">
              🔄
            </button>
            <button onClick={logout} title="Sign out"
              className="w-9 h-9 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center transition-all">
              <span className="text-sm font-bold">↩</span>
            </button>
          </div>
        </div>

        <div className="flex items-center justify-between">
          <p className="text-green-200 text-xs">{dateLabel}</p>
          {lastRefresh && (
            <p className="text-green-400 text-[10px]">
              Updated {lastRefresh.toLocaleTimeString('en-NG',{hour:'2-digit',minute:'2-digit'})}
            </p>
          )}
        </div>

        {/* Branch selector */}
        {isAdmin && data?.summary?.length > 1 && (
          <select
            value={selBranch}
            onChange={e => setSelBranch(e.target.value)}
            className="mt-2 w-full bg-white/15 border border-white/30 text-white rounded-xl px-3 py-1.5 text-sm font-semibold appearance-none"
          >
            {data.summary.map(b => (
              <option key={b._id} value={String(b._id)} className="text-gray-900 bg-white">
                {b.name}
              </option>
            ))}
          </select>
        )}
      </div>

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
        <div className="flex-1 overflow-y-auto pb-24">

          {/* ════ HOME TAB ══════════════════════════════════════════════════ */}
          {tab === 'home' && (
            <div className="p-4 space-y-4">

              {/* 4 big stat cards */}
              <div className="grid grid-cols-2 gap-3">
                <StatCard
                  emoji="✅" value={branch.clockedIn?.length ?? 0}
                  label="Clocked In" color="green"
                  onClick={() => setTab('staff')}
                />
                <StatCard
                  emoji="❌" value={branch.absent?.length ?? 0}
                  label="Absent Today" color="red"
                  onClick={() => setTab('staff')}
                />
                <StatCard
                  emoji="💸"
                  value={`₦${(branch.todayShortageTotal || 0).toLocaleString()}`}
                  label="Today's Shortage" color="amber"
                  onClick={() => setTab('shortage')}
                />
                <StatCard
                  emoji="⚠️" value={branch.todayOffences?.length ?? 0}
                  label="Today's Bookings" color="orange"
                  onClick={() => setTab('bookings')}
                />
              </div>

              {/* Progress bar */}
              {branch.totalActive > 0 && (
                <div className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100">
                  <div className="flex justify-between items-center mb-2">
                    <p className="font-bold text-gray-800 text-sm">Attendance</p>
                    <p className="text-sm font-semibold text-gray-600">
                      {branch.clockedIn?.length} / {branch.totalActive} workers
                    </p>
                  </div>
                  <div className="h-4 bg-gray-100 rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all duration-500
                        ${branch.clockedIn?.length / branch.totalActive >= 0.8 ? 'bg-green-500'
                          : branch.clockedIn?.length / branch.totalActive >= 0.5 ? 'bg-amber-500'
                          : 'bg-red-500'}`}
                      style={{ width: `${branch.totalActive > 0 ? Math.round(branch.clockedIn?.length / branch.totalActive * 100) : 0}%` }}
                    />
                  </div>
                  <p className="text-xs text-gray-400 mt-1.5 text-right">
                    {branch.totalActive > 0 ? Math.round((branch.clockedIn?.length / branch.totalActive) * 100) : 0}% present
                  </p>
                </div>
              )}

              {/* Quick actions */}
              <div className="grid grid-cols-2 gap-3">
                <BigActionBtn
                  emoji="💸" label="Record Shortage"
                  color="green" onClick={() => { setTab('add'); setShowShortageForm(true); }}
                />
                <BigActionBtn
                  emoji="⚠️" label="Book Offence"
                  color="orange" onClick={() => { setTab('add'); setShowOffenceForm(true); }}
                />
              </div>

              {/* Absent alert */}
              {branch.absent?.length > 0 && (
                <div className="bg-red-50 border border-red-200 rounded-2xl p-4">
                  <p className="font-black text-red-700 text-base mb-2">
                    ❌ {branch.absent.length} Worker{branch.absent.length > 1 ? 's' : ''} Not In Today
                  </p>
                  {branch.absent.slice(0, 3).map(w => (
                    <p key={w._id} className="text-red-600 font-semibold text-sm">
                      • {w.fullName} <span className="font-normal capitalize">({roleLabel(w.role)})</span>
                    </p>
                  ))}
                  {branch.absent.length > 3 && (
                    <button onClick={() => setTab('staff')} className="text-red-500 text-xs font-bold mt-1 underline">
                      + {branch.absent.length - 3} more — tap to see all
                    </button>
                  )}
                </div>
              )}
            </div>
          )}

          {/* ════ STAFF TAB ═════════════════════════════════════════════════ */}
          {tab === 'staff' && (
            <div className="p-4 space-y-5">

              {/* Clocked in */}
              <div>
                <SectionHeader
                  emoji="✅"
                  title={`Clocked In (${branch.clockedIn?.length || 0})`}
                  color="green"
                />
                {branch.clockedIn?.length === 0 ? (
                  <EmptyState msg="Nobody has clocked in yet" />
                ) : (
                  branch.clockedIn.map((w, i) => (
                    <WorkerRow key={i}
                      name={w.fullName} role={w.role}
                      time={fmtTime(w.clockInTime)}
                      hasOut={w.hasClockOut}
                    />
                  ))
                )}
              </div>

              {/* Absent */}
              <div>
                <SectionHeader
                  emoji="❌"
                  title={`Not In — Absent (${branch.absent?.length || 0})`}
                  color="red"
                />
                {branch.absent?.length === 0 ? (
                  <EmptyState msg="All workers are present 🎉" />
                ) : (
                  branch.absent.map((w, i) => (
                    <WorkerRow key={i}
                      name={w.fullName} role={w.role}
                      absent
                    />
                  ))
                )}
              </div>
            </div>
          )}

          {/* ════ SHORTAGE TAB ══════════════════════════════════════════════ */}
          {tab === 'shortage' && (
            <div className="p-4 space-y-4">
              <div className="flex items-center justify-between">
                <SectionHeader emoji="💸" title="Today's Shortages" color="amber" />
                <BigActionBtn emoji="+" label="Add" color="green" small
                  onClick={() => setShowShortageForm(true)} />
              </div>

              {branch.todayShortages?.length === 0 ? (
                <EmptyState msg="No shortages recorded today 👍" />
              ) : (
                <>
                  <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 text-center">
                    <p className="text-3xl font-black text-amber-700">
                      ₦{(branch.todayShortageTotal || 0).toLocaleString()}
                    </p>
                    <p className="text-amber-600 text-sm font-semibold">Total today</p>
                  </div>
                  {branch.todayShortages.map((s, i) => (
                    <ShortageRow key={i} shortage={s} />
                  ))}
                </>
              )}
            </div>
          )}

          {/* ════ BOOKINGS TAB ══════════════════════════════════════════════ */}
          {tab === 'bookings' && (
            <div className="p-4 space-y-4">
              <div className="flex items-center justify-between">
                <SectionHeader emoji="⚠️" title="Today's Bookings" color="orange" />
                <BigActionBtn emoji="+" label="Book" color="orange" small
                  onClick={() => setShowOffenceForm(true)} />
              </div>

              {branch.todayOffences?.length === 0 ? (
                <EmptyState msg="No disciplinary bookings today" />
              ) : (
                branch.todayOffences.map((o, i) => (
                  <OffenceRow key={i} offence={o} />
                ))
              )}
            </div>
          )}

          {/* ════ ADD TAB ════════════════════════════════════════════════════ */}
          {tab === 'add' && (
            <div className="p-4 space-y-4">
              <p className="text-center text-gray-500 font-semibold text-sm pt-2">What do you want to do?</p>

              <button onClick={() => setShowShortageForm(true)}
                className="w-full bg-white border-2 border-green-400 rounded-2xl p-6 flex items-center gap-5 shadow-sm hover:bg-green-50 active:scale-95 transition-all">
                <span className="text-5xl">💸</span>
                <div className="text-left">
                  <p className="text-xl font-black text-gray-900">Record Shortage</p>
                  <p className="text-gray-500 text-sm">Report a cash or fuel shortage by a worker</p>
                </div>
              </button>

              <button onClick={() => setShowOffenceForm(true)}
                className="w-full bg-white border-2 border-orange-400 rounded-2xl p-6 flex items-center gap-5 shadow-sm hover:bg-orange-50 active:scale-95 transition-all">
                <span className="text-5xl">⚠️</span>
                <div className="text-left">
                  <p className="text-xl font-black text-gray-900">Book a Worker</p>
                  <p className="text-gray-500 text-sm">Record a disciplinary offence for a worker</p>
                </div>
              </button>

              <div className="mt-6 border-t border-gray-200 pt-4">
                <p className="text-xs text-gray-400 text-center font-medium uppercase tracking-widest mb-3">More options</p>
                <div className="grid grid-cols-2 gap-3">
                  {[
                    { emoji: '👥', label: 'All Workers',  path: '/workers'    },
                    { emoji: '📊', label: 'Full Dashboard', path: '/dashboard' },
                    { emoji: '📋', label: 'Attendance',   path: '/attendance' },
                    { emoji: '🏢', label: 'Branches',     path: '/branches'   },
                  ].map(item => (
                    <button key={item.path}
                      onClick={() => navigate(item.path)}
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

      {/* ── Empty state if no branch ─────────────────────────────────────────── */}
      {!loading && !branch && (
        <div className="flex-1 flex items-center justify-center p-6">
          <div className="text-center">
            <p className="text-5xl mb-4">🏢</p>
            <p className="text-gray-600 font-semibold">No branch data available</p>
            <button onClick={load} className="mt-4 px-6 py-2 bg-green-600 text-white rounded-xl font-bold">
              Refresh
            </button>
          </div>
        </div>
      )}

      {/* ── Bottom navigation ─────────────────────────────────────────────────── */}
      <nav className="fixed bottom-0 left-0 right-0 max-w-lg mx-auto bg-white border-t border-gray-200 z-40 shadow-lg">
        <div className="flex">
          {TABS.map(t => (
            <button key={t.id} onClick={() => setTab(t.id)}
              className={`flex-1 py-3 flex flex-col items-center gap-0.5 transition-all
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

      {/* ── Modals ─────────────────────────────────────────────────────────────── */}
      {showShortageForm && (
        <ShortageModal
          workers={allWorkers}
          branchId={selBranch}
          onClose={() => setShowShortageForm(false)}
          onSaved={() => { setShowShortageForm(false); load(); setTab('shortage'); }}
        />
      )}
      {showOffenceForm && (
        <OffenceModal
          workers={allWorkers}
          branchId={selBranch}
          onClose={() => setShowOffenceForm(false)}
          onSaved={() => { setShowOffenceForm(false); load(); setTab('bookings'); }}
        />
      )}
    </div>
  );
}

// ── Small re-usable components ────────────────────────────────────────────────
function StatCard({ emoji, value, label, color, onClick }) {
  const colors = {
    green:  'bg-green-50  border-green-100  text-green-700',
    red:    'bg-red-50    border-red-100    text-red-700',
    amber:  'bg-amber-50  border-amber-100  text-amber-700',
    orange: 'bg-orange-50 border-orange-100 text-orange-700',
  };
  return (
    <button onClick={onClick}
      className={`rounded-2xl border-2 p-4 text-left w-full shadow-sm active:scale-95 transition-all ${colors[color]}`}>
      <div className="text-3xl mb-1">{emoji}</div>
      <div className={`text-3xl font-black ${colors[color].split(' ')[2]}`}>{value}</div>
      <div className="text-xs font-semibold mt-0.5 opacity-70">{label}</div>
    </button>
  );
}

function BigActionBtn({ emoji, label, color, onClick, small }) {
  const colors = {
    green:  'bg-green-600 hover:bg-green-700 text-white',
    orange: 'bg-orange-500 hover:bg-orange-600 text-white',
    red:    'bg-red-500 hover:bg-red-600 text-white',
  };
  if (small) return (
    <button onClick={onClick}
      className={`px-3 py-1.5 rounded-xl font-bold text-sm ${colors[color]} active:scale-95 transition-all`}>
      {emoji} {label}
    </button>
  );
  return (
    <button onClick={onClick}
      className={`rounded-2xl p-4 text-center shadow active:scale-95 transition-all ${colors[color]}`}>
      <div className="text-3xl mb-1">{emoji}</div>
      <div className="text-sm font-black">{label}</div>
    </button>
  );
}

function SectionHeader({ emoji, title, color }) {
  const colors = {
    green:  'text-green-700 bg-green-50 border-green-200',
    red:    'text-red-700   bg-red-50   border-red-200',
    amber:  'text-amber-700 bg-amber-50 border-amber-200',
    orange: 'text-orange-700 bg-orange-50 border-orange-200',
  };
  return (
    <div className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-xl border font-black text-base mb-3 ${colors[color]}`}>
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

function ShortageRow({ shortage }) {
  const reasonMap = {
    cash_shortage: '💵 Cash', fuel_shortage: '⛽ Fuel',
    equipment_damage: '🔧 Equipment', late_arrival: '🕐 Late',
    absent: '🚫 Absent', other: '📝 Other',
  };
  return (
    <div className="bg-white border border-gray-100 rounded-xl p-4 mb-2 shadow-sm">
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="font-bold text-gray-900">{shortage.workerName}</p>
          <p className="text-xs text-gray-500 mt-0.5">{reasonMap[shortage.reason] || shortage.reason}</p>
          {shortage.notes && <p className="text-xs text-gray-400 mt-1 italic">{shortage.notes}</p>}
        </div>
        <div className="text-right shrink-0">
          <p className="text-lg font-black text-red-600">₦{(shortage.amount || 0).toLocaleString()}</p>
          <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full
            ${shortage.source !== 'manual' ? 'bg-amber-100 text-amber-700' : 'bg-gray-100 text-gray-600'}`}>
            {shortage.source === 'manual' ? 'Manual' : 'Auto'}
          </span>
        </div>
      </div>
    </div>
  );
}

function OffenceRow({ offence }) {
  const sev = {
    minor:    'bg-yellow-100 text-yellow-800',
    moderate: 'bg-orange-100 text-orange-800',
    serious:  'bg-red-100 text-red-700',
    gross:    'bg-red-900 text-white',
  };
  const typeMap = {
    late_arrival: '🕐', absent_without_notice: '🚫', mobile_phone_misuse: '📵',
    rude_to_customer: '😤', cash_shortage: '💵', fuel_shortage: '⛽',
    improper_uniform: '👕', negligence: '😴', sleeping_on_duty: '💤',
    abandoning_post: '🏃', fighting_misconduct: '👊', damage_to_property: '💥',
    theft_fraud: '🚨', other: '📝',
  };
  return (
    <div className="bg-white border border-gray-100 rounded-xl p-4 mb-2 shadow-sm">
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="font-bold text-gray-900">{offence.workerName}</p>
          <p className="text-sm text-gray-600 mt-0.5">
            {typeMap[offence.offenceType] || '⚠️'} {(offence.offenceType || '').replace(/_/g, ' ')}
          </p>
          {offence.description && <p className="text-xs text-gray-400 mt-1 italic">{offence.description}</p>}
        </div>
        <span className={`text-xs font-bold px-2 py-1 rounded-full capitalize shrink-0 ${sev[offence.severity] || 'bg-gray-100 text-gray-700'}`}>
          {offence.severity}
        </span>
      </div>
    </div>
  );
}
