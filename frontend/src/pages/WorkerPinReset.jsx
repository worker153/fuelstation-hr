import { useState, useRef, useEffect } from 'react';
import { Leaf, Search, User, KeyRound, CheckCircle, ChevronLeft, X } from 'lucide-react';
import axios from 'axios';

const API = import.meta.env.VITE_API_URL || '';

/* ── ATM-style PIN pad (same as shortage/terminal pages) ─────────────────── */
function PinPad({ value, onChange, onSubmit, disabled, shake }) {
  const press = (d) => {
    if (disabled) return;
    if (d === 'del') { onChange(value.slice(0, -1)); return; }
    if (value.length >= 4) return;
    const next = value + d;
    onChange(next);
    if (next.length === 4) setTimeout(() => onSubmit(next), 120);
  };

  const digits = ['1','2','3','4','5','6','7','8','9','','0','del'];

  return (
    <div className="flex flex-col items-center gap-5">
      {/* Dot indicators */}
      <div className={`flex gap-4 ${shake ? 'animate-shake' : ''}`}>
        {[0,1,2,3].map(i => (
          <div key={i} className={`w-4 h-4 rounded-full border-2 transition-all duration-150
            ${value.length > i ? 'bg-green-600 border-green-600 scale-110' : 'bg-transparent border-green-300'}`} />
        ))}
      </div>

      {/* Keypad */}
      <div className="grid grid-cols-3 gap-3 w-64">
        {digits.map((d, i) => {
          if (d === '') return <div key={i} />;
          return (
            <button
              key={i}
              onClick={() => press(d)}
              disabled={disabled}
              className={`h-16 rounded-2xl text-lg font-semibold transition-all duration-100 select-none
                ${d === 'del'
                  ? 'text-red-400 bg-gray-100 hover:bg-red-50 active:scale-95 text-sm'
                  : 'bg-white border-2 border-green-100 text-gray-800 hover:bg-green-50 hover:border-green-300 active:scale-95 shadow-sm'
                }
                ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}
              `}
            >
              {d === 'del' ? '⌫ Del' : d}
            </button>
          );
        })}
      </div>
    </div>
  );
}

/* ── Worker search result card ───────────────────────────────────────────── */
function WorkerCard({ worker, onSelect }) {
  return (
    <button
      onClick={() => onSelect(worker)}
      className="w-full flex items-center gap-3 p-3 rounded-xl border-2 border-transparent
                 bg-white hover:border-green-400 hover:bg-green-50 transition-all text-left shadow-sm"
    >
      {worker.photo ? (
        <img src={worker.photo} alt="" className="w-10 h-10 rounded-full object-cover shrink-0 border border-gray-200" />
      ) : (
        <div className="w-10 h-10 rounded-full bg-green-100 flex items-center justify-center shrink-0">
          <User size={18} className="text-green-700" />
        </div>
      )}
      <div className="min-w-0">
        <p className="font-semibold text-gray-800 text-sm truncate">{worker.fullName}</p>
        <p className="text-xs text-gray-500 truncate">{worker.role} · {worker.branch}</p>
      </div>
    </button>
  );
}

/* ── Main component ──────────────────────────────────────────────────────── */
export default function WorkerPinReset() {
  // Step: search → confirm → verify-phone → new-pin → done
  const [step, setStep]           = useState('search');
  const [query, setQuery]         = useState('');
  const [results, setResults]     = useState([]);
  const [searching, setSearching] = useState(false);
  const [selected, setSelected]   = useState(null);

  const [phone, setPhone]         = useState('');
  const [phoneErr, setPhoneErr]   = useState('');

  const [newPin, setNewPin]       = useState('');
  const [pinShake, setPinShake]   = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError]         = useState('');

  const searchTimer = useRef(null);

  /* debounced search */
  useEffect(() => {
    if (query.trim().length < 2) { setResults([]); return; }
    clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(async () => {
      setSearching(true);
      try {
        const { data } = await axios.get(`${API}/api/workers/search-by-name?q=${encodeURIComponent(query.trim())}`);
        setResults(data.data || []);
      } catch { setResults([]); }
      finally { setSearching(false); }
    }, 350);
    return () => clearTimeout(searchTimer.current);
  }, [query]);

  const selectWorker = (w) => { setSelected(w); setStep('confirm'); };

  const handlePhoneSubmit = (e) => {
    e.preventDefault();
    setPhoneErr('');
    if (phone.trim().length < 7) { setPhoneErr('Enter your registered phone number'); return; }
    setStep('new-pin');
  };

  const handleNewPin = async (pin) => {
    if (submitting) return;
    setError('');
    setSubmitting(true);
    try {
      await axios.post(`${API}/api/workers/self-reset-pin`, {
        workerId: selected._id,
        phone:    phone.trim(),
        newPin:   pin,
      });
      setStep('done');
    } catch (err) {
      const msg = err.response?.data?.message || 'Something went wrong';
      setError(msg);
      setNewPin('');
      setPinShake(true);
      setTimeout(() => setPinShake(false), 600);
    } finally {
      setSubmitting(false);
    }
  };

  const reset = () => {
    setStep('search'); setQuery(''); setResults([]); setSelected(null);
    setPhone(''); setPhoneErr(''); setNewPin(''); setError('');
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-green-50 via-white to-emerald-50 flex flex-col">
      {/* Header */}
      <header className="bg-white border-b border-green-100 px-5 py-4 flex items-center gap-3 shadow-sm">
        <div className="bg-green-700 rounded-xl p-2">
          <Leaf size={20} className="text-white" />
        </div>
        <div>
          <p className="font-bold text-green-900 text-sm leading-none">FuelStation HR</p>
          <p className="text-green-600 text-xs mt-0.5">Worker PIN Reset</p>
        </div>
      </header>

      <main className="flex-1 flex items-start justify-center px-4 py-10">
        <div className="w-full max-w-md">

          {/* ── STEP: search ─────────────────────────────── */}
          {step === 'search' && (
            <div className="bg-white rounded-2xl shadow-lg border border-green-100 p-6">
              <div className="flex items-center gap-2 mb-1">
                <KeyRound size={20} className="text-green-700" />
                <h1 className="text-lg font-bold text-gray-800">Reset Your PIN</h1>
              </div>
              <p className="text-sm text-gray-500 mb-5">
                Search for your name to get started. Only active workers can reset their PIN.
              </p>

              {/* Search input */}
              <div className="relative mb-4">
                <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                <input
                  type="text"
                  value={query}
                  onChange={e => setQuery(e.target.value)}
                  placeholder="Type your name…"
                  autoFocus
                  className="w-full pl-9 pr-4 py-3 border border-gray-200 rounded-xl text-sm
                             focus:outline-none focus:ring-2 focus:ring-green-400 focus:border-transparent"
                />
                {query && (
                  <button onClick={() => { setQuery(''); setResults([]); }}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                    <X size={14} />
                  </button>
                )}
              </div>

              {/* Results */}
              {searching && (
                <p className="text-center text-sm text-gray-400 py-4">Searching…</p>
              )}
              {!searching && results.length > 0 && (
                <div className="space-y-2 max-h-72 overflow-y-auto">
                  {results.map(w => (
                    <WorkerCard key={w._id} worker={w} onSelect={selectWorker} />
                  ))}
                </div>
              )}
              {!searching && query.trim().length >= 2 && results.length === 0 && (
                <p className="text-center text-sm text-gray-400 py-4">No active workers found</p>
              )}
            </div>
          )}

          {/* ── STEP: confirm identity ───────────────────── */}
          {step === 'confirm' && selected && (
            <div className="bg-white rounded-2xl shadow-lg border border-green-100 p-6">
              <button onClick={() => { setStep('search'); setSelected(null); }}
                className="flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700 mb-4">
                <ChevronLeft size={15} /> Back
              </button>

              <h2 className="font-bold text-gray-800 text-lg mb-1">Is this you?</h2>
              <p className="text-sm text-gray-500 mb-5">Confirm your identity before resetting your PIN.</p>

              <div className="flex items-center gap-4 p-4 bg-green-50 rounded-xl border border-green-100 mb-5">
                {selected.photo ? (
                  <img src={selected.photo} alt="" className="w-14 h-14 rounded-full object-cover border-2 border-green-200" />
                ) : (
                  <div className="w-14 h-14 rounded-full bg-green-200 flex items-center justify-center">
                    <User size={22} className="text-green-700" />
                  </div>
                )}
                <div>
                  <p className="font-bold text-gray-800">{selected.fullName}</p>
                  <p className="text-sm text-gray-600">{selected.role}</p>
                  <p className="text-xs text-gray-400">{selected.branch}</p>
                </div>
              </div>

              <div className="flex gap-3">
                <button onClick={() => { setSelected(null); setStep('search'); }}
                  className="flex-1 py-3 rounded-xl border border-gray-200 text-sm text-gray-600
                             hover:bg-gray-50 transition-colors font-medium">
                  Not me
                </button>
                <button onClick={() => setStep('verify-phone')}
                  className="flex-1 py-3 rounded-xl bg-green-700 text-white text-sm font-semibold
                             hover:bg-green-800 transition-colors">
                  Yes, that's me
                </button>
              </div>
            </div>
          )}

          {/* ── STEP: verify phone ───────────────────────── */}
          {step === 'verify-phone' && (
            <div className="bg-white rounded-2xl shadow-lg border border-green-100 p-6">
              <button onClick={() => setStep('confirm')}
                className="flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700 mb-4">
                <ChevronLeft size={15} /> Back
              </button>

              <h2 className="font-bold text-gray-800 text-lg mb-1">Verify Your Phone</h2>
              <p className="text-sm text-gray-500 mb-5">
                Enter the phone number on file for <strong>{selected?.fullName}</strong>.
                This is how we confirm it's really you.
              </p>

              <form onSubmit={handlePhoneSubmit} className="space-y-4">
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Phone Number</label>
                  <input
                    type="tel"
                    value={phone}
                    onChange={e => { setPhone(e.target.value); setPhoneErr(''); }}
                    placeholder="e.g. 08012345678"
                    autoFocus
                    className={`w-full px-4 py-3 border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-green-400
                      ${phoneErr ? 'border-red-400 bg-red-50' : 'border-gray-200'}`}
                  />
                  {phoneErr && <p className="text-xs text-red-500 mt-1">{phoneErr}</p>}
                </div>

                <button type="submit"
                  className="w-full py-3 bg-green-700 text-white rounded-xl font-semibold text-sm
                             hover:bg-green-800 transition-colors">
                  Continue
                </button>
              </form>
            </div>
          )}

          {/* ── STEP: set new PIN ────────────────────────── */}
          {step === 'new-pin' && (
            <div className="bg-white rounded-2xl shadow-lg border border-green-100 p-6">
              <button onClick={() => { setStep('verify-phone'); setNewPin(''); setError(''); }}
                className="flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700 mb-4">
                <ChevronLeft size={15} /> Back
              </button>

              <div className="text-center mb-6">
                <div className="w-12 h-12 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-3">
                  <KeyRound size={22} className="text-green-700" />
                </div>
                <h2 className="font-bold text-gray-800 text-lg">Set New PIN</h2>
                <p className="text-sm text-gray-500 mt-1">
                  Choose a new 4-digit PIN for <strong>{selected?.fullName}</strong>
                </p>
              </div>

              {error && (
                <div className="mb-4 px-4 py-3 bg-red-50 border border-red-200 rounded-xl text-sm text-red-600 text-center">
                  {error}
                </div>
              )}

              <PinPad
                value={newPin}
                onChange={setNewPin}
                onSubmit={handleNewPin}
                disabled={submitting}
                shake={pinShake}
              />

              {submitting && (
                <p className="text-center text-sm text-gray-400 mt-4 animate-pulse">Saving…</p>
              )}
            </div>
          )}

          {/* ── STEP: done ───────────────────────────────── */}
          {step === 'done' && (
            <div className="bg-white rounded-2xl shadow-lg border border-green-100 p-8 text-center">
              <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <CheckCircle size={32} className="text-green-600" />
              </div>
              <h2 className="font-bold text-gray-800 text-xl mb-2">PIN Reset!</h2>
              <p className="text-sm text-gray-500 mb-6">
                Your PIN has been updated successfully.
                Use your new PIN the next time you clock in on the attendance terminal.
              </p>
              <button
                onClick={reset}
                className="px-6 py-3 bg-green-700 text-white rounded-xl font-semibold text-sm
                           hover:bg-green-800 transition-colors"
              >
                Done
              </button>
            </div>
          )}

        </div>
      </main>

      {/* Footer */}
      <footer className="text-center py-4 text-xs text-gray-400">
        FuelStation HR — Secure PIN Management
      </footer>
    </div>
  );
}
