import { useState, useEffect } from 'react';
import { AlertTriangle, Leaf, CheckCircle, ArrowLeft, Loader, Users, ChevronRight, Delete } from 'lucide-react';
import axios from 'axios';

const BASE = import.meta.env.VITE_API_URL || 'http://localhost:5000/api';
const fmt  = n => `₦${Number(n || 0).toLocaleString('en-NG')}`;
const MONTHS = ['January','February','March','April','May','June',
                'July','August','September','October','November','December'];

// ── Custom PIN Pad ─────────────────────────────────────────────────────────────
function PinPad({ pin, onChange, onSubmit, loading, error }) {
  const [shake, setShake] = useState(false);

  const press = (d) => {
    if (pin.length < 4) {
      const next = pin + d;
      onChange(next);
      if (next.length === 4) {
        // small delay so the 4th dot fills before submitting
        setTimeout(() => onSubmit(next), 180);
      }
    }
  };

  const del = () => onChange(pin.slice(0, -1));

  // shake on error
  useEffect(() => {
    if (error) {
      setShake(true);
      onChange('');
      const t = setTimeout(() => setShake(false), 600);
      return () => clearTimeout(t);
    }
  }, [error]);

  const KEYS = [
    ['1','2','3'],
    ['4','5','6'],
    ['7','8','9'],
    [null,'0','del'],
  ];

  return (
    <div className="px-6 pb-6">
      {/* Dot indicators */}
      <div className={`flex justify-center gap-5 mb-7 ${shake ? 'animate-[shake_0.5s_ease]' : ''}`}>
        {[0,1,2,3].map(i => (
          <div key={i} className={`w-4 h-4 rounded-full border-2 transition-all duration-200
            ${pin.length > i
              ? 'bg-brand-600 border-brand-600 scale-110'
              : 'bg-transparent border-gray-300'}`}
          />
        ))}
      </div>

      {/* Error message */}
      {error && (
        <p className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded-lg mb-4 text-center">{error}</p>
      )}

      {/* Keypad */}
      <div className="space-y-3">
        {KEYS.map((row, ri) => (
          <div key={ri} className="grid grid-cols-3 gap-3">
            {row.map((key, ki) => {
              if (key === null) return <div key={ki} />;
              if (key === 'del') return (
                <button key={ki} onClick={del}
                  className="h-14 rounded-2xl bg-gray-100 hover:bg-gray-200 active:scale-95
                             flex items-center justify-center transition-all duration-100
                             text-gray-600 disabled:opacity-40"
                  disabled={!pin.length || loading}>
                  <Delete size={20} />
                </button>
              );
              return (
                <button key={ki} onClick={() => press(key)}
                  disabled={pin.length === 4 || loading}
                  className="h-14 rounded-2xl bg-gray-50 hover:bg-brand-50 active:bg-brand-100
                             active:scale-95 border border-gray-200 hover:border-brand-300
                             flex flex-col items-center justify-center transition-all duration-100
                             disabled:opacity-50 select-none">
                  <span className="text-xl font-bold text-gray-800 leading-none">{key}</span>
                  <span className="text-[9px] text-gray-400 leading-none mt-0.5">
                    {{'2':'ABC','3':'DEF','4':'GHI','5':'JKL','6':'MNO',
                      '7':'PQRS','8':'TUV','9':'WXYZ','0':'+'}[key] || ''}
                  </span>
                </button>
              );
            })}
          </div>
        ))}
      </div>

      {/* Loading state */}
      {loading && (
        <div className="flex items-center justify-center gap-2 mt-5 text-brand-600">
          <Loader size={16} className="animate-spin" />
          <span className="text-sm font-medium">Verifying…</span>
        </div>
      )}
    </div>
  );
}

export default function WorkerShortage() {
  const [step,           setStep          ] = useState('pin');
  const [pin,            setPin           ] = useState('');
  const [supervisor,     setSupervisor    ] = useState(null);
  const [targetWorker,   setTargetWorker  ] = useState(null);
  const [amount,         setAmount        ] = useState('');
  const [reason,         setReason        ] = useState('cash_shortage');
  const [notes,          setNotes         ] = useState('');
  const [date,           setDate          ] = useState(new Date().toISOString().split('T')[0]);
  const [loading,        setLoading       ] = useState(false);
  const [error,          setError         ] = useState('');
  const [result,         setResult        ] = useState(null);

  const now = new Date();

  const verifyPin = async (submittedPin) => {
    const p = submittedPin || pin;
    if (p.length !== 4) return;
    setLoading(true); setError('');
    try {
      const { data } = await axios.get(`${BASE}/shortages/worker/lookup?pin=${p}`);
      const worker = data.data;
      setSupervisor(worker);
      if (worker.isSupervisor && worker.workers?.length > 0) {
        setStep('pick');
      } else {
        setTargetWorker({ _id: worker._id, fullName: worker.fullName, role: worker.role, photo: worker.photo });
        setStep('form');
      }
    } catch (err) {
      setError(err.response?.data?.message || 'Invalid PIN — try again');
      setPin('');
    } finally { setLoading(false); }
  };

  const pickWorker = (w) => { setTargetWorker(w); setStep('form'); };

  const submitShortage = async (e) => {
    e.preventDefault();
    if (!amount || Number(amount) <= 0) return setError('Enter a valid amount');
    setLoading(true); setError('');
    try {
      const payload = { pin, amount: Number(amount), reason, notes, date };
      if (targetWorker._id !== supervisor._id) payload.targetWorkerId = targetWorker._id;
      const { data } = await axios.post(`${BASE}/shortages/worker`, payload);
      setResult(data);
      setStep('done');
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to submit');
    } finally { setLoading(false); }
  };

  const reset = () => {
    setStep('pin'); setPin(''); setSupervisor(null); setTargetWorker(null);
    setAmount(''); setNotes(''); setError(''); setResult(null);
    setDate(new Date().toISOString().split('T')[0]);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-brand-900 via-brand-800 to-brand-700 flex items-center justify-center p-4">
      <div className="w-full max-w-sm">

        {/* Logo */}
        <div className="flex items-center justify-center gap-2 mb-6">
          <div className="bg-white/20 rounded-xl p-2">
            <Leaf size={22} className="text-white" />
          </div>
          <div>
            <p className="text-white font-bold text-lg leading-none">FuelStation HR</p>
            <p className="text-brand-300 text-xs">Shortage Report</p>
          </div>
        </div>

        <div className="bg-white rounded-2xl shadow-2xl overflow-hidden">

          {/* ── STEP 1: PIN pad ─────────────────────────────────────────────────── */}
          {step === 'pin' && (
            <div>
              <div className="px-6 pt-6 pb-5 border-b border-gray-100 text-center">
                <div className="w-12 h-12 rounded-2xl bg-brand-600 flex items-center justify-center mx-auto mb-3">
                  <AlertTriangle size={20} className="text-white" />
                </div>
                <p className="font-bold text-gray-900 text-base">Enter your PIN</p>
                <p className="text-xs text-gray-500 mt-0.5">4-digit PIN to report a shortage</p>
              </div>

              <div className="pt-6">
                <PinPad
                  pin={pin}
                  onChange={(v) => { setPin(v); setError(''); }}
                  onSubmit={verifyPin}
                  loading={loading}
                  error={error}
                />
              </div>
            </div>
          )}

          {/* ── STEP 2: Worker picker ─────────────────────────────────────────── */}
          {step === 'pick' && supervisor && (
            <div>
              <div className="bg-brand-600 px-5 py-4 flex items-center gap-3">
                {supervisor.photo
                  ? <img src={supervisor.photo} className="w-10 h-10 rounded-xl object-cover border-2 border-white/30" alt="" />
                  : <div className="w-10 h-10 rounded-xl bg-white/20 text-white flex items-center justify-center font-bold">{supervisor.fullName[0]}</div>
                }
                <div>
                  <p className="text-white font-semibold text-sm">{supervisor.fullName}</p>
                  <p className="text-brand-200 text-xs">{supervisor.role} · {supervisor.branchName}</p>
                </div>
              </div>

              <div className="p-4">
                <div className="flex items-center gap-2 mb-3">
                  <Users size={14} className="text-gray-500" />
                  <p className="text-sm font-semibold text-gray-700">Select worker to report shortage for:</p>
                </div>

                <div className="space-y-1.5 max-h-72 overflow-y-auto">
                  {supervisor.workers.map(w => (
                    <button key={w._id} onClick={() => pickWorker(w)}
                      className="w-full flex items-center gap-3 px-3 py-3 rounded-xl border border-gray-100
                                 hover:border-brand-200 hover:bg-brand-50 transition-colors text-left">
                      {w.photo
                        ? <img src={w.photo} className="w-9 h-9 rounded-lg object-cover shrink-0" alt="" />
                        : <div className="w-9 h-9 rounded-lg bg-brand-100 text-brand-700 flex items-center justify-center font-bold text-sm shrink-0">{w.fullName[0]}</div>
                      }
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-gray-900 truncate">{w.fullName}</p>
                        <p className="text-xs text-gray-500 truncate">{w.role}{w.shift ? ` · ${w.shift}` : ''}</p>
                      </div>
                      <ChevronRight size={15} className="text-gray-400 shrink-0" />
                    </button>
                  ))}
                </div>

                <button onClick={reset} className="mt-3 w-full flex items-center justify-center gap-1.5 py-2.5 text-sm text-gray-500 hover:text-gray-700">
                  <ArrowLeft size={13} /> Back
                </button>
              </div>
            </div>
          )}

          {/* ── STEP 3: Amount form ───────────────────────────────────────────── */}
          {step === 'form' && targetWorker && (
            <div>
              <div className="bg-brand-600 px-5 py-4 flex items-center gap-3">
                {targetWorker.photo
                  ? <img src={targetWorker.photo} className="w-12 h-12 rounded-xl object-cover border-2 border-white/30" alt="" />
                  : <div className="w-12 h-12 rounded-xl bg-white/20 text-white flex items-center justify-center text-xl font-bold">{targetWorker.fullName[0]}</div>
                }
                <div>
                  <p className="text-white font-bold">{targetWorker.fullName}</p>
                  <p className="text-brand-200 text-xs">{targetWorker.role}</p>
                </div>
              </div>

              <form onSubmit={submitShortage} className="p-5 space-y-4">
                <p className="text-xs text-gray-500 bg-amber-50 border border-amber-100 px-3 py-2 rounded-lg">
                  Reporting shortage for <strong>{MONTHS[now.getMonth()]} {now.getFullYear()}</strong>
                </p>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">Amount (₦) *</label>
                  <input type="number" inputMode="numeric" min="1"
                    className="w-full px-4 py-3 border border-gray-200 rounded-xl text-lg font-semibold focus:outline-none focus:ring-2 focus:ring-brand-500"
                    placeholder="e.g. 5000"
                    value={amount} onChange={e => { setAmount(e.target.value); setError(''); }} autoFocus />
                  {amount > 0 && <p className="text-xs text-brand-600 mt-1 font-medium">{fmt(amount)}</p>}
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">Date of Incident</label>
                  <input type="date"
                    className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-brand-500"
                    value={date} onChange={e => setDate(e.target.value)} />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">Reason *</label>
                  <select
                    className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-brand-500 text-sm"
                    value={reason} onChange={e => setReason(e.target.value)}>
                    <option value="cash_shortage">Cash Shortage</option>
                    <option value="fuel_shortage">Fuel Shortage</option>
                    <option value="equipment_damage">Equipment Damage</option>
                    <option value="customer_complaint">Customer Complaint</option>
                    <option value="early_departure">Early Departure</option>
                    <option value="other">Other</option>
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">Notes (optional)</label>
                  <textarea rows={2}
                    className="w-full px-4 py-3 border border-gray-200 rounded-xl resize-none focus:outline-none focus:ring-2 focus:ring-brand-500 text-sm"
                    placeholder="Brief explanation…"
                    value={notes} onChange={e => setNotes(e.target.value)} />
                </div>

                {error && <p className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded-lg">{error}</p>}

                <div className="flex gap-2 pt-1">
                  <button type="button" onClick={() => supervisor?.isSupervisor ? setStep('pick') : reset()}
                    className="flex items-center gap-1.5 px-4 py-3 rounded-xl border border-gray-200 text-gray-600 text-sm font-medium hover:bg-gray-50 transition-colors">
                    <ArrowLeft size={14} /> Back
                  </button>
                  <button type="submit" disabled={loading}
                    className="flex-1 py-3 rounded-xl bg-red-600 text-white font-semibold text-sm
                               hover:bg-red-700 transition-colors disabled:opacity-50
                               flex items-center justify-center gap-2">
                    {loading ? <Loader size={16} className="animate-spin" /> : <><AlertTriangle size={14} /> Submit</>}
                  </button>
                </div>
              </form>
            </div>
          )}

          {/* ── STEP 4: Success ───────────────────────────────────────────────── */}
          {step === 'done' && result && (
            <div className="p-8 text-center">
              <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <CheckCircle size={32} className="text-green-600" />
              </div>
              <h2 className="text-xl font-bold text-gray-900 mb-1">Recorded!</h2>
              <p className="text-gray-500 text-sm mb-4">{result.message}</p>

              <div className="bg-gray-50 rounded-xl p-4 text-left space-y-2 mb-4">
                <Row label="Worker" value={result.data?.workerName} />
                <Row label="Branch" value={result.data?.branchName} />
                <Row label="Amount" value={fmt(result.data?.amount)} />
                <Row label="Period" value={`${MONTHS[(result.data?.month || 1) - 1]} ${result.data?.year}`} />
              </div>

              <p className="text-xs text-green-600 bg-green-50 px-3 py-2 rounded-lg mb-4">
                ✓ Will be deducted from salary for {MONTHS[(result.data?.month || 1) - 1]}
              </p>

              <button onClick={supervisor?.isSupervisor
                  ? () => { setTargetWorker(null); setAmount(''); setNotes(''); setError(''); setResult(null); setStep('pick'); }
                  : reset}
                className="w-full py-3 rounded-xl bg-brand-600 text-white font-semibold text-sm hover:bg-brand-700 transition-colors">
                {supervisor?.isSupervisor ? 'Report Another Worker' : 'Report Another'}
              </button>
            </div>
          )}
        </div>

        <p className="text-center text-brand-400 text-xs mt-5">FuelStation HR · Shortage Self-Service</p>
      </div>
    </div>
  );
}

function Row({ label, value }) {
  return (
    <div className="flex justify-between text-sm">
      <span className="text-gray-500">{label}</span>
      <span className="font-medium text-gray-800">{value}</span>
    </div>
  );
}
