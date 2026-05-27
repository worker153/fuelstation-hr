import { useState } from 'react';
import { AlertTriangle, Leaf, CheckCircle, ArrowLeft, Loader } from 'lucide-react';
import axios from 'axios';

const BASE = import.meta.env.VITE_API_URL || 'http://localhost:5000/api';

const fmt = n => `₦${Number(n || 0).toLocaleString('en-NG')}`;

const MONTHS = ['January','February','March','April','May','June',
                'July','August','September','October','November','December'];

export default function WorkerShortage() {
  const [step,    setStep   ] = useState('pin');   // 'pin' | 'form' | 'done'
  const [pin,     setPin    ] = useState('');
  const [worker,  setWorker ] = useState(null);
  const [amount,  setAmount ] = useState('');
  const [notes,   setNotes  ] = useState('');
  const [date,    setDate   ] = useState(new Date().toISOString().split('T')[0]);
  const [loading, setLoading] = useState(false);
  const [error,   setError  ] = useState('');
  const [result,  setResult ] = useState(null);

  const now = new Date();

  // ── Step 1: verify PIN ──────────────────────────────────────────────────────
  const verifyPin = async (e) => {
    e.preventDefault();
    if (pin.length !== 4) return setError('Enter your 4-digit PIN');
    setLoading(true); setError('');
    try {
      const { data } = await axios.get(`${BASE}/shortages/worker/lookup?pin=${pin}`);
      setWorker(data.data);
      setStep('form');
    } catch (err) {
      setError(err.response?.data?.message || 'Invalid PIN');
    } finally { setLoading(false); }
  };

  // ── Step 2: submit shortage ─────────────────────────────────────────────────
  const submitShortage = async (e) => {
    e.preventDefault();
    if (!amount || Number(amount) <= 0) return setError('Enter a valid amount');
    setLoading(true); setError('');
    try {
      const { data } = await axios.post(`${BASE}/shortages/worker`, { pin, amount: Number(amount), notes, date });
      setResult(data);
      setStep('done');
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to submit');
    } finally { setLoading(false); }
  };

  const reset = () => {
    setStep('pin'); setPin(''); setWorker(null);
    setAmount(''); setNotes(''); setError(''); setResult(null);
    setDate(new Date().toISOString().split('T')[0]);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-brand-900 via-brand-800 to-brand-700 flex items-center justify-center p-4">
      <div className="w-full max-w-sm">

        {/* Logo */}
        <div className="flex items-center justify-center gap-2 mb-8">
          <div className="bg-white/20 rounded-xl p-2">
            <Leaf size={22} className="text-white" />
          </div>
          <div>
            <p className="text-white font-bold text-lg leading-none">FuelStation HR</p>
            <p className="text-brand-300 text-xs">Shortage Report</p>
          </div>
        </div>

        <div className="bg-white rounded-2xl shadow-2xl overflow-hidden">

          {/* ── STEP 1: PIN entry ─────────────────────────────────────────────── */}
          {step === 'pin' && (
            <div className="p-6">
              <div className="flex items-center gap-3 mb-5">
                <div className="w-10 h-10 rounded-xl bg-red-100 flex items-center justify-center">
                  <AlertTriangle size={18} className="text-red-600" />
                </div>
                <div>
                  <p className="font-bold text-gray-900">Report Shortage</p>
                  <p className="text-xs text-gray-500">Enter your 4-digit PIN to continue</p>
                </div>
              </div>

              <form onSubmit={verifyPin} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">Your PIN</label>
                  <input
                    type="password"
                    inputMode="numeric"
                    maxLength={4}
                    className="w-full px-4 py-3 border border-gray-200 rounded-xl text-center text-2xl tracking-[1rem] font-bold focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent"
                    placeholder="••••"
                    value={pin}
                    onChange={e => { setPin(e.target.value.replace(/\D/g, '').slice(0, 4)); setError(''); }}
                    autoFocus
                  />
                </div>

                {error && (
                  <p className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded-lg">{error}</p>
                )}

                <button type="submit" disabled={loading || pin.length !== 4}
                  className="w-full py-3 rounded-xl bg-brand-600 text-white font-semibold text-sm
                             hover:bg-brand-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed
                             flex items-center justify-center gap-2">
                  {loading ? <Loader size={16} className="animate-spin" /> : 'Continue'}
                </button>
              </form>
            </div>
          )}

          {/* ── STEP 2: Shortage form ─────────────────────────────────────────── */}
          {step === 'form' && worker && (
            <div>
              {/* Worker banner */}
              <div className="bg-brand-600 px-5 py-4 flex items-center gap-3">
                {worker.photo
                  ? <img src={worker.photo} className="w-12 h-12 rounded-xl object-cover border-2 border-white/30" alt="" />
                  : <div className="w-12 h-12 rounded-xl bg-white/20 text-white flex items-center justify-center text-xl font-bold">
                      {worker.fullName[0]}
                    </div>
                }
                <div>
                  <p className="text-white font-bold">{worker.fullName}</p>
                  <p className="text-brand-200 text-xs">{worker.role} · {worker.branchName}</p>
                </div>
              </div>

              <form onSubmit={submitShortage} className="p-5 space-y-4">
                <p className="text-xs text-gray-500 bg-amber-50 border border-amber-100 px-3 py-2 rounded-lg">
                  Reporting shortage for <strong>{MONTHS[now.getMonth()]} {now.getFullYear()}</strong>
                </p>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">Amount (₦) *</label>
                  <input
                    type="number"
                    inputMode="numeric"
                    min="1"
                    className="w-full px-4 py-3 border border-gray-200 rounded-xl text-lg font-semibold focus:outline-none focus:ring-2 focus:ring-brand-500"
                    placeholder="e.g. 5000"
                    value={amount}
                    onChange={e => { setAmount(e.target.value); setError(''); }}
                    autoFocus
                  />
                  {amount > 0 && (
                    <p className="text-xs text-brand-600 mt-1 font-medium">{fmt(amount)}</p>
                  )}
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">Date of Incident</label>
                  <input type="date" className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-brand-500"
                    value={date} onChange={e => setDate(e.target.value)} />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">Notes (optional)</label>
                  <textarea rows={2}
                    className="w-full px-4 py-3 border border-gray-200 rounded-xl resize-none focus:outline-none focus:ring-2 focus:ring-brand-500 text-sm"
                    placeholder="Brief explanation…"
                    value={notes} onChange={e => setNotes(e.target.value)} />
                </div>

                {error && (
                  <p className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded-lg">{error}</p>
                )}

                <div className="flex gap-2 pt-1">
                  <button type="button" onClick={reset}
                    className="flex items-center gap-1.5 px-4 py-3 rounded-xl border border-gray-200 text-gray-600 text-sm font-medium hover:bg-gray-50 transition-colors">
                    <ArrowLeft size={14} /> Back
                  </button>
                  <button type="submit" disabled={loading}
                    className="flex-1 py-3 rounded-xl bg-red-600 text-white font-semibold text-sm
                               hover:bg-red-700 transition-colors disabled:opacity-50
                               flex items-center justify-center gap-2">
                    {loading ? <Loader size={16} className="animate-spin" /> : <><AlertTriangle size={14} /> Submit Shortage</>}
                  </button>
                </div>
              </form>
            </div>
          )}

          {/* ── STEP 3: Success ───────────────────────────────────────────────── */}
          {step === 'done' && result && (
            <div className="p-8 text-center">
              <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <CheckCircle size={32} className="text-green-600" />
              </div>
              <h2 className="text-xl font-bold text-gray-900 mb-1">Recorded!</h2>
              <p className="text-gray-500 text-sm mb-4">{result.message}</p>

              <div className="bg-gray-50 rounded-xl p-4 text-left space-y-2 mb-6">
                <Row label="Worker"  value={result.data?.workerName} />
                <Row label="Branch"  value={result.data?.branchName} />
                <Row label="Amount"  value={fmt(result.data?.amount)} />
                <Row label="Period"  value={`${MONTHS[(result.data?.month || 1) - 1]} ${result.data?.year}`} />
              </div>

              <p className="text-xs text-green-600 bg-green-50 px-3 py-2 rounded-lg mb-4">
                ✓ This will be deducted from your salary for {MONTHS[(result.data?.month || 1) - 1]}
              </p>

              <button onClick={reset}
                className="w-full py-3 rounded-xl bg-brand-600 text-white font-semibold text-sm hover:bg-brand-700 transition-colors">
                Report Another
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
