import { useState } from 'react';
import { Delete, Loader, ChevronLeft, ChevronRight, LogOut, X, Clock, Calendar, Gauge, Droplets } from 'lucide-react';
import axios from 'axios';

const BASE   = import.meta.env.VITE_API_URL || 'http://localhost:5000/api';
const fmt    = n  => `₦${Number(n || 0).toLocaleString('en-NG')}`;
const fmtL   = n  => n == null ? '—' : `${Number(n).toLocaleString('en-NG', { maximumFractionDigits: 1 })}L`;
const fmtNum = n  => n == null ? '—' : Number(n).toLocaleString('en-NG', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const MONTHS = ['January','February','March','April','May','June',
                'July','August','September','October','November','December'];

const DAY_NAMES = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];

function fmtTime(ts) {
  if (!ts) return '—';
  const d = new Date(ts);
  return d.toLocaleTimeString('en-NG', { hour: '2-digit', minute: '2-digit', hour12: true });
}

function fmtDate(dateStr) {
  if (!dateStr) return '—';
  // dateStr could be 'YYYY-MM-DD' or a full ISO timestamp
  const d = new Date(dateStr);
  const dow = DAY_NAMES[d.getDay()];
  return `${dow} ${d.getDate()} ${MONTHS[d.getMonth()]}`;
}

// ── Bottom-sheet detail modal ──────────────────────────────────────────────────
function DetailSheet({ title, emoji, rows, onClose }) {
  return (
    <div className="fixed inset-0 z-50 flex flex-col justify-end"
         onClick={onClose}>
      <div className="absolute inset-0 bg-black/40" />
      <div className="relative bg-white rounded-t-3xl shadow-2xl max-h-[70vh] flex flex-col"
           onClick={e => e.stopPropagation()}>
        {/* Handle */}
        <div className="flex justify-center pt-3 pb-1">
          <div className="w-10 h-1 bg-gray-300 rounded-full" />
        </div>
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-gray-100">
          <div className="flex items-center gap-2">
            <span className="text-xl">{emoji}</span>
            <p className="font-bold text-gray-800 text-base">{title}</p>
            <span className="bg-gray-100 text-gray-600 text-xs font-semibold px-2 py-0.5 rounded-full">
              {rows.length}
            </span>
          </div>
          <button onClick={onClose}
            className="p-1.5 rounded-full hover:bg-gray-100 transition-colors">
            <X size={18} className="text-gray-500" />
          </button>
        </div>
        {/* List */}
        <div className="overflow-y-auto flex-1 divide-y divide-gray-50">
          {rows.length === 0 ? (
            <p className="text-center text-gray-400 py-10">No records</p>
          ) : rows.map((row, i) => (
            <div key={i} className="px-5 py-3.5">
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-xl bg-gray-100 flex items-center justify-center shrink-0">
                    <Calendar size={15} className="text-gray-500" />
                  </div>
                  <div>
                    <p className="font-semibold text-gray-800 text-sm">{fmtDate(row.date)}</p>
                    {row.sub && <p className="text-xs text-gray-500 mt-0.5">{row.sub}</p>}
                  </div>
                </div>
                {row.badge && (
                  <span className={`text-xs font-semibold px-2.5 py-1 rounded-full shrink-0 ${row.badgeCls}`}>
                    {row.badge}
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ── PIN Pad ────────────────────────────────────────────────────────────────────
function PinPad({ pin, onChange, onSubmit, loading, error }) {
  const press = d => {
    if (pin.length < 4) {
      const next = pin + d;
      onChange(next);
      if (next.length === 4) setTimeout(() => onSubmit(next), 180);
    }
  };
  const KEYS = [['1','2','3'],['4','5','6'],['7','8','9'],[null,'0','del']];
  return (
    <div className="px-6 pb-6">
      <div className="flex justify-center gap-5 mb-7">
        {[0,1,2,3].map(i => (
          <div key={i} className={`w-5 h-5 rounded-full border-2 transition-all duration-200
            ${pin.length > i ? 'bg-brand-600 border-brand-600 scale-110' : 'bg-transparent border-gray-300'}`} />
        ))}
      </div>
      {error && <p className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded-xl mb-4 text-center font-medium">{error}</p>}
      <div className="space-y-3">
        {KEYS.map((row, ri) => (
          <div key={ri} className="grid grid-cols-3 gap-3">
            {row.map((key, ki) => {
              if (key === null) return <div key={ki} />;
              if (key === 'del') return (
                <button key={ki} onClick={() => onChange(pin.slice(0,-1))}
                  className="h-16 rounded-2xl bg-gray-100 hover:bg-gray-200 active:scale-95 flex items-center justify-center transition-all">
                  <Delete size={22} className="text-gray-600" />
                </button>
              );
              return (
                <button key={ki} onClick={() => press(key)} disabled={pin.length === 4 || loading}
                  className="h-16 rounded-2xl bg-gray-50 hover:bg-brand-50 active:bg-brand-100 active:scale-95
                             border border-gray-200 hover:border-brand-300 flex flex-col items-center
                             justify-center transition-all disabled:opacity-50 select-none">
                  <span className="text-2xl font-bold text-gray-800">{key}</span>
                </button>
              );
            })}
          </div>
        ))}
      </div>
      {loading && (
        <div className="flex items-center justify-center gap-2 mt-5 text-brand-600">
          <Loader size={18} className="animate-spin" />
          <span className="text-sm font-medium">Checking…</span>
        </div>
      )}
    </div>
  );
}

// ── Tappable stat card ─────────────────────────────────────────────────────────
function StatCard({ value, label, emoji, color, onClick, hasDetail }) {
  return (
    <button onClick={onClick}
      className={`bg-white rounded-2xl p-4 shadow-sm text-center w-full transition-all
        ${hasDetail ? 'active:scale-95 active:shadow-md' : 'cursor-default'}`}>
      <p className={`text-4xl font-extrabold ${color}`}>{value}</p>
      <p className="text-sm text-gray-500 font-medium mt-1">{emoji} {label}</p>
      {hasDetail && value > 0 && (
        <p className="text-xs text-brand-500 font-medium mt-1.5">Tap to see details →</p>
      )}
    </button>
  );
}

// ── Main Dashboard ─────────────────────────────────────────────────────────────
export default function WorkerDashboard() {
  const now = new Date();
  const [step,    setStep   ] = useState('pin');
  const [pin,     setPin    ] = useState('');
  const [error,   setError  ] = useState('');
  const [loading, setLoading] = useState(false);
  const [data,    setData   ] = useState(null);
  const [month,   setMonth  ] = useState(now.getMonth() + 1);
  const [year,    setYear   ] = useState(now.getFullYear());
  const [sheet,   setSheet  ] = useState(null);  // { title, emoji, rows }
  const [docs,    setDocs   ] = useState(null);  // { pending, signed }

  const load = async (p, mo, yr) => {
    setLoading(true); setError('');
    try {
      const [dashRes, docsRes] = await Promise.all([
        axios.get(`${BASE}/shortages/worker/dashboard?pin=${p}&month=${mo}&year=${yr}`),
        axios.get(`${BASE}/documents/worker?pin=${p}`).catch(() => ({ data: { data: { pending: [], signed: [] } } })),
      ]);
      setData(dashRes.data.data);
      setDocs(docsRes.data.data);
      setStep('dashboard');
    } catch (err) {
      setError(err.response?.data?.message || 'Invalid PIN — try again');
      setPin('');
    } finally { setLoading(false); }
  };

  const changeMonth = (dir) => {
    let mo = month + dir, yr = year;
    if (mo < 1)  { mo = 12; yr--; }
    if (mo > 12) { mo = 1;  yr++; }
    setMonth(mo); setYear(yr);
    if (pin) load(pin, mo, yr);
  };

  // ── Build detail rows for each card ──────────────────────────────────────────
  const openSheet = (type) => {
    if (!data) return;
    const { shortages, attendanceDays } = data;

    if (type === 'present') {
      const rows = (attendanceDays || []).map(d => ({
        date: d.date,
        badge:    fmtTime(d.clockIn),
        badgeCls: 'bg-green-100 text-green-700',
        sub: d.clockOut ? `Clocked out: ${fmtTime(d.clockOut)}` : 'No clock-out recorded',
      }));
      setSheet({ title: 'Days Present', emoji: '✅', rows });
    }

    if (type === 'late') {
      const rows = shortages.filter(s => s.source === 'late_arrival').map(s => ({
        date: s.date,
        badge:    fmt(s.amount),
        badgeCls: 'bg-amber-100 text-amber-700',
        sub: s.notes || 'Late arrival',
      }));
      setSheet({ title: 'Came Late', emoji: '🕐', rows });
    }

    if (type === 'absent') {
      const rows = shortages.filter(s => s.source === 'absent').map(s => ({
        date: s.date,
        badge:    fmt(s.amount),
        badgeCls: 'bg-red-100 text-red-700',
        sub: s.notes || 'Absent',
      }));
      setSheet({ title: 'Marked Absent', emoji: '❌', rows });
    }

    if (type === 'noshow') {
      const rows = shortages.filter(s => s.source === 'no_clockin').map(s => ({
        date: s.date,
        badge:    fmt(s.amount),
        badgeCls: 'bg-red-100 text-red-700',
        sub: s.notes || 'Did not come in',
      }));
      setSheet({ title: 'Did Not Come', emoji: '❌', rows });
    }

    if (type === 'early') {
      const rows = shortages.filter(s => s.source === 'early_departure').map(s => ({
        date: s.date,
        badge:    fmt(s.amount),
        badgeCls: 'bg-orange-100 text-orange-700',
        sub: s.notes || 'Left early',
      }));
      setSheet({ title: 'Left Early', emoji: '🚪', rows });
    }

    if (type === 'litres') {
      const rows = (data.pump?.dailyLitres || []).map(d => ({
        date: d.date,
        badge:    fmtL(d.litres),
        badgeCls: 'bg-brand-100 text-brand-700',
        sub: d.islandName || '',
      }));
      setSheet({ title: 'Litres Sold', emoji: '⛽', rows });
    }
  };

  if (step === 'pin') {
    return (
      <div className="min-h-screen bg-gradient-to-br from-brand-50 to-white flex items-center justify-center p-4">
        <div className="bg-white rounded-3xl shadow-xl w-full max-w-sm overflow-hidden">
          <div className="bg-brand-600 px-6 py-8 text-center">
            <div className="w-16 h-16 bg-white/20 rounded-full flex items-center justify-center mx-auto mb-3">
              <span className="text-3xl">👤</span>
            </div>
            <h1 className="text-white text-xl font-bold">My Salary Info</h1>
            <p className="text-brand-100 text-sm mt-1">Enter your 4-digit PIN</p>
          </div>
          <PinPad pin={pin} onChange={setPin} onSubmit={p => load(p, month, year)} loading={loading} error={error} />
        </div>
      </div>
    );
  }

  const { worker, attendance, salary, shortages, period } = data;
  const pct = salary.baseSalary > 0
    ? Math.max(0, Math.round((salary.expectedPay / salary.baseSalary) * 100))
    : 100;

  return (
    <div className="min-h-screen bg-gray-100">
      {/* Detail bottom sheet */}
      {sheet && (
        <DetailSheet
          title={sheet.title}
          emoji={sheet.emoji}
          rows={sheet.rows}
          onClose={() => setSheet(null)}
        />
      )}

      {/* Top bar */}
      <div className="bg-brand-600 px-4 pt-safe-top">
        <div className="max-w-lg mx-auto py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            {worker.photo
              ? <img src={worker.photo} alt="" className="w-11 h-11 rounded-full object-cover border-2 border-white/40" />
              : <div className="w-11 h-11 rounded-full bg-white/20 flex items-center justify-center text-white text-lg font-bold">
                  {worker.fullName?.[0]?.toUpperCase()}
                </div>
            }
            <div>
              <p className="text-white font-bold text-base leading-tight">{worker.fullName}</p>
              <p className="text-brand-100 text-xs">{worker.role} · {worker.branchName}</p>
            </div>
          </div>
          <button onClick={() => { setStep('pin'); setPin(''); setData(null); }}
            className="flex items-center gap-1 text-white/70 hover:text-white text-xs transition-colors">
            <LogOut size={14} /> Exit
          </button>
        </div>
      </div>

      <div className="max-w-lg mx-auto px-4 py-5 space-y-4">

        {/* Month selector */}
        <div className="flex items-center justify-between bg-white rounded-2xl px-4 py-3 shadow-sm">
          <button onClick={() => changeMonth(-1)} className="p-2 rounded-xl hover:bg-gray-100 transition-colors">
            <ChevronLeft size={20} className="text-gray-500" />
          </button>
          <p className="font-bold text-gray-800 text-base">{MONTHS[period.month - 1]} {period.year}</p>
          <button onClick={() => changeMonth(1)}
            disabled={period.month === now.getMonth()+1 && period.year === now.getFullYear()}
            className="p-2 rounded-xl hover:bg-gray-100 transition-colors disabled:opacity-30">
            <ChevronRight size={20} className="text-gray-500" />
          </button>
        </div>

        {/* ── BIG SALARY CARD ── */}
        <div className="bg-brand-600 rounded-3xl p-6 text-white shadow-lg">
          <p className="text-brand-100 text-sm font-medium mb-1">Expected Pay This Month</p>
          <p className="text-5xl font-extrabold tracking-tight">{fmt(salary.expectedPay)}</p>
          <div className="mt-4 bg-white/20 rounded-full h-2.5">
            <div className="bg-white h-2.5 rounded-full transition-all" style={{ width: `${pct}%` }} />
          </div>
          <div className="flex justify-between mt-2 text-xs text-brand-100">
            <span>Base: {fmt(salary.baseSalary)}</span>
            <span>Deducted: {fmt(salary.totalDeducted)}</span>
          </div>
          {salary.bonus > 0 && (
            <p className="text-xs text-brand-100 mt-1">+ Bonus: {fmt(salary.bonus)}</p>
          )}
        </div>

        {/* ── TODAY'S PUMP ASSIGNMENT + METER READINGS ── */}
        {data.pump && (
          <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
            <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Gauge size={15} className="text-brand-500" />
                <p className="font-bold text-gray-800">Today's Pump</p>
              </div>
              {data.pump.meterLog?.totalLitres != null && (
                <span className="text-sm font-bold text-brand-600">{fmtL(data.pump.meterLog.totalLitres)} sold</span>
              )}
            </div>

            {!data.pump.assignment ? (
              <div className="px-4 py-5 text-center text-gray-400 text-sm">
                No pump assigned today
              </div>
            ) : (
              <div className="px-4 py-3 space-y-3">
                {/* Island name */}
                <div className="flex items-center gap-2">
                  <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Island</span>
                  <span className="text-sm font-bold text-gray-800">{data.pump.assignment.islandName}</span>
                  {data.pump.meterLog?.status === 'closed' && (
                    <span className="text-[10px] px-2 py-0.5 rounded-full bg-green-100 text-green-700 font-semibold">Closed</span>
                  )}
                </div>

                {/* Per-pump meter readings */}
                {data.pump.meterLog?.pumps?.length > 0 ? (
                  <div className="space-y-2">
                    {data.pump.meterLog.pumps.map((p, i) => (
                      <div key={i} className="bg-gray-50 rounded-xl px-3 py-2.5">
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-xs font-bold text-gray-700">{p.pumpName}</span>
                          {p.totalLitres != null && (
                            <span className="text-xs font-bold text-brand-600">{fmtL(p.totalLitres)}</span>
                          )}
                        </div>
                        <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-xs text-gray-500">
                          <div className="flex justify-between">
                            <span>Outer open:</span>
                            <span className="font-medium text-gray-700">{fmtNum(p.nozzle1?.opening)}</span>
                          </div>
                          <div className="flex justify-between">
                            <span>Outer close:</span>
                            <span className={`font-medium ${p.nozzle1?.closing != null ? 'text-green-700' : 'text-gray-300'}`}>{fmtNum(p.nozzle1?.closing)}</span>
                          </div>
                          <div className="flex justify-between">
                            <span>Inner open:</span>
                            <span className="font-medium text-gray-700">{fmtNum(p.nozzle2?.opening)}</span>
                          </div>
                          <div className="flex justify-between">
                            <span>Inner close:</span>
                            <span className={`font-medium ${p.nozzle2?.closing != null ? 'text-green-700' : 'text-gray-300'}`}>{fmtNum(p.nozzle2?.closing)}</span>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-gray-400 py-1">Meter readings not entered yet for today</p>
                )}

                {/* Monthly litres */}
                {data.pump.monthlyLitres > 0 && (
                  <button onClick={() => openSheet('litres')}
                    className="w-full flex items-center justify-between bg-brand-50 rounded-xl px-3 py-2.5 active:bg-brand-100 transition-colors">
                    <div className="flex items-center gap-2">
                      <Droplets size={14} className="text-brand-500" />
                      <span className="text-sm font-semibold text-brand-700">Total This Month</span>
                    </div>
                    <div className="flex items-center gap-1">
                      <span className="text-sm font-black text-brand-700">{fmtL(data.pump.monthlyLitres)}</span>
                      <span className="text-xs text-brand-400">→</span>
                    </div>
                  </button>
                )}
              </div>
            )}
          </div>
        )}

        {/* ── ATTENDANCE CARDS (tappable) ── */}
        <div className="grid grid-cols-2 gap-3">
          <StatCard
            value={attendance.daysPresent}
            label="Days Present" emoji="✅"
            color="text-green-600"
            hasDetail={attendance.daysPresent > 0}
            onClick={() => attendance.daysPresent > 0 && openSheet('present')}
          />
          <StatCard
            value={attendance.noShowDays}
            label="Did Not Come" emoji="❌"
            color="text-red-500"
            hasDetail={attendance.noShowDays > 0}
            onClick={() => attendance.noShowDays > 0 && openSheet('noshow')}
          />
          <StatCard
            value={attendance.lateDays}
            label="Came Late" emoji="🕐"
            color="text-amber-500"
            hasDetail={attendance.lateDays > 0}
            onClick={() => attendance.lateDays > 0 && openSheet('late')}
          />
          <StatCard
            value={attendance.earlyExitDays}
            label="Left Early" emoji="🚪"
            color="text-orange-500"
            hasDetail={attendance.earlyExitDays > 0}
            onClick={() => attendance.earlyExitDays > 0 && openSheet('early')}
          />
        </div>

        {/* ── DEDUCTIONS LIST ── */}
        {shortages.length > 0 ? (
          <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
            <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
              <p className="font-bold text-gray-800">💸 Deductions</p>
              <span className="text-sm font-bold text-red-600">- {fmt(salary.totalDeducted)}</span>
            </div>
            <div className="divide-y divide-gray-50">
              {shortages.map(s => (
                <div key={s._id} className="px-4 py-3 flex items-center justify-between">
                  <div>
                    <p className="text-sm font-semibold text-gray-800">{s.label}</p>
                    <p className="text-xs text-gray-400 mt-0.5">
                      {fmtDate(s.date)}
                      {s.notes ? ` · ${s.notes.replace(/\(deadline.*\)/, '').trim()}` : ''}
                    </p>
                  </div>
                  <span className="text-sm font-bold text-red-500 shrink-0 ml-3">- {fmt(s.amount)}</span>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <div className="bg-white rounded-2xl p-6 text-center shadow-sm">
            <p className="text-3xl mb-2">🎉</p>
            <p className="font-bold text-gray-800">No Deductions!</p>
            <p className="text-sm text-gray-400 mt-1">Great work this month</p>
          </div>
        )}

        <p className="text-center text-xs text-gray-400 pb-4">
          This shows approved deductions only · Values may change until payroll is finalised
        </p>

        {/* ── DOCUMENTS ── */}
        {docs && (docs.pending?.length > 0 || docs.signed?.length > 0) && (
          <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
            <div className="px-4 py-3 border-b border-gray-100">
              <p className="font-bold text-gray-800">📄 Company Documents</p>
            </div>

            {docs.pending?.length > 0 && (
              <div className="px-4 py-2.5 bg-amber-50 border-b border-amber-100">
                <p className="text-xs font-bold text-amber-700 mb-2">⚠️ Requires your signature</p>
                {docs.pending.map(d => (
                  <div key={d._id} className="flex items-center justify-between py-1.5">
                    <p className="text-sm font-medium text-gray-800 truncate">{d.title}</p>
                    <a href="/worker" className="text-xs text-brand-600 font-semibold underline shrink-0 ml-2">Sign →</a>
                  </div>
                ))}
              </div>
            )}

            {docs.signed?.length > 0 && (
              <div className="divide-y divide-gray-50">
                {docs.signed.map(d => (
                  <div key={d._id} className="px-4 py-3 flex items-center gap-3">
                    <span className="text-xl shrink-0">📄</span>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-gray-800 truncate">{d.title}</p>
                      <p className="text-xs text-gray-400 mt-0.5">
                        Signed {d.signedAt ? new Date(d.signedAt).toLocaleDateString('en-NG', { day: 'numeric', month: 'short', year: 'numeric' }) : '—'}
                      </p>
                    </div>
                    <span className="text-[10px] bg-green-100 text-green-700 font-bold px-2 py-0.5 rounded-full shrink-0">✓ SIGNED</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

      </div>
    </div>
  );
}
