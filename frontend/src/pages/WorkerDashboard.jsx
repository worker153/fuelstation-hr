import { useState } from 'react';
import { Delete, Loader, ChevronLeft, ChevronRight, LogOut } from 'lucide-react';
import axios from 'axios';

const BASE   = import.meta.env.VITE_API_URL || 'http://localhost:5000/api';
const fmt    = n  => `₦${Number(n || 0).toLocaleString('en-NG')}`;
const MONTHS = ['January','February','March','April','May','June',
                'July','August','September','October','November','December'];

// ── PIN Pad (reused from WorkerShortage style) ─────────────────────────────────
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

  const load = async (p, mo, yr) => {
    setLoading(true); setError('');
    try {
      const { data: res } = await axios.get(
        `${BASE}/shortages/worker/dashboard?pin=${p}&month=${mo}&year=${yr}`
      );
      setData(res.data);
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

  if (step === 'pin') {
    return (
      <div className="min-h-screen bg-gradient-to-br from-brand-50 to-white flex items-center justify-center p-4">
        <div className="bg-white rounded-3xl shadow-xl w-full max-w-sm overflow-hidden">
          {/* Header */}
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

        {/* ── ATTENDANCE CARDS ── */}
        <div className="grid grid-cols-2 gap-3">
          <div className="bg-white rounded-2xl p-4 shadow-sm text-center">
            <p className="text-4xl font-extrabold text-green-600">{attendance.daysPresent}</p>
            <p className="text-sm text-gray-500 font-medium mt-1">✅ Days Present</p>
          </div>
          <div className="bg-white rounded-2xl p-4 shadow-sm text-center">
            <p className="text-4xl font-extrabold text-red-500">{attendance.noShowDays}</p>
            <p className="text-sm text-gray-500 font-medium mt-1">❌ Did Not Come</p>
          </div>
          <div className="bg-white rounded-2xl p-4 shadow-sm text-center">
            <p className="text-4xl font-extrabold text-amber-500">{attendance.lateDays}</p>
            <p className="text-sm text-gray-500 font-medium mt-1">🕐 Came Late</p>
          </div>
          <div className="bg-white rounded-2xl p-4 shadow-sm text-center">
            <p className="text-4xl font-extrabold text-orange-500">{attendance.earlyExitDays}</p>
            <p className="text-sm text-gray-500 font-medium mt-1">🚪 Left Early</p>
          </div>
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
                    {s.notes && <p className="text-xs text-gray-400 mt-0.5 line-clamp-1">{s.notes}</p>}
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
      </div>
    </div>
  );
}
