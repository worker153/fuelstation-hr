/**
 * WorkerPins — Super Admin page to manage and distribute worker PINs.
 *
 * Features:
 *  • See every worker's PIN (reveal on click)
 *  • Generate PINs for all workers without one (one click)
 *  • Reset individual PIN
 *  • Printable PIN slip sheet — hand to workers
 */
import { useState, useEffect, useCallback, useRef } from 'react';
import {
  KeyRound, RefreshCw, Eye, EyeOff, Printer, Check,
  AlertTriangle, Loader, Building2, X, ChevronDown,
  CheckCircle, Copy, Wand2, Filter, Search, ShieldCheck
} from 'lucide-react';
import api from '../utils/api';
import { useNotify } from '../context/NotificationContext';
import { useAuth }   from '../context/AuthContext';

// ── Set / Edit PIN modal ───────────────────────────────────────────────────────
function SetPinModal({ worker, onClose, onSaved }) {
  const notify = useNotify();
  const [pin,     setPin    ] = useState('');
  const [loading, setLoading] = useState(false);
  const [error,   setError  ] = useState('');

  const submit = async e => {
    e.preventDefault();
    if (!/^\d{4}$/.test(pin)) return setError('PIN must be exactly 4 digits');
    setLoading(true); setError('');
    try {
      await api.put(`/workers/${worker._id}/pin`, { pin });
      notify(`PIN set for ${worker.fullName} ✓`);
      onSaved(worker._id, pin);
    } catch (err) { setError(err.response?.data?.message || 'Failed'); }
    finally { setLoading(false); }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="bg-white rounded-2xl w-full max-w-sm shadow-2xl">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-brand-100 flex items-center justify-center">
              <KeyRound size={15} className="text-brand-700" />
            </div>
            <div>
              <p className="font-bold text-gray-900 text-sm">Set PIN</p>
              <p className="text-xs text-gray-400">{worker.fullName}</p>
            </div>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X size={18} /></button>
        </div>
        <form onSubmit={submit} className="px-5 py-5 space-y-4">
          <div>
            <label className="label">4-Digit PIN</label>
            <input
              type="text" inputMode="numeric" maxLength={4}
              className="input text-center text-3xl tracking-[1rem] font-bold"
              placeholder="0000"
              value={pin}
              onChange={e => { setPin(e.target.value.replace(/\D/g, '').slice(0, 4)); setError(''); }}
              autoFocus
            />
            {error && <p className="text-red-500 text-xs mt-1">{error}</p>}
          </div>
          <div className="flex gap-3">
            <button type="submit" disabled={loading || pin.length !== 4}
              className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl bg-brand-600 text-white font-medium text-sm disabled:opacity-50">
              {loading ? <Loader size={14} className="animate-spin" /> : <><Check size={14} /> Save PIN</>}
            </button>
            <button type="button" onClick={onClose} className="btn-secondary">Cancel</button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── Print view ─────────────────────────────────────────────────────────────────
function PrintSheet({ workers, companyName, onClose }) {
  const printRef = useRef();
  const withPin  = workers.filter(w => w.pin);

  const doPrint = () => {
    const content = printRef.current.innerHTML;
    const win     = window.open('', '_blank');
    win.document.write(`
      <html><head><title>Worker PINs — ${companyName}</title>
      <style>
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body { font-family: Arial, sans-serif; background: #fff; }
        .grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; padding: 20px; }
        .card { border: 2px dashed #d1d5db; border-radius: 12px; padding: 16px; text-align: center; page-break-inside: avoid; }
        .company { font-size: 9px; color: #6b7280; text-transform: uppercase; letter-spacing: 1px; }
        .name { font-size: 14px; font-weight: bold; color: #111; margin: 6px 0 2px; }
        .role { font-size: 10px; color: #6b7280; margin-bottom: 10px; }
        .pin-label { font-size: 9px; color: #6b7280; text-transform: uppercase; letter-spacing: 1px; }
        .pin { font-size: 32px; font-weight: 900; color: #166534; letter-spacing: 8px; margin: 4px 0; font-family: monospace; }
        .footer { font-size: 8px; color: #9ca3af; margin-top: 8px; border-top: 1px dashed #e5e7eb; padding-top: 6px; }
        .cut { text-align: center; color: #d1d5db; font-size: 10px; margin: 4px 0; }
        @media print { body { -webkit-print-color-adjust: exact; } }
      </style></head>
      <body><div class="grid">${content}</div></body></html>
    `);
    win.document.close();
    win.focus();
    win.print();
    win.close();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="bg-white rounded-2xl w-full max-w-2xl shadow-2xl max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <div className="flex items-center gap-2.5">
            <Printer size={16} className="text-brand-700" />
            <p className="font-bold text-gray-900">Print PIN Slips</p>
            <span className="text-xs text-gray-400">{withPin.length} worker{withPin.length !== 1 ? 's' : ''}</span>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X size={18} /></button>
        </div>

        {/* Preview */}
        <div className="flex-1 overflow-y-auto p-4">
          <div ref={printRef} className="grid grid-cols-3 gap-3">
            {withPin.map(w => (
              <div key={w._id} className="border-2 border-dashed border-gray-300 rounded-xl p-3 text-center">
                <p className="text-[9px] text-gray-400 uppercase tracking-widest">{companyName}</p>
                <p className="font-bold text-gray-900 text-sm mt-1 truncate">{w.fullName}</p>
                <p className="text-xs text-gray-500 mb-2">{w.role}{w.branchId?.name ? ` · ${w.branchId.name}` : ''}</p>
                <p className="text-[9px] text-gray-400 uppercase tracking-widest">Attendance PIN</p>
                <p className="text-4xl font-black text-brand-700 tracking-[8px] font-mono my-1">{w.pin}</p>
                <p className="text-[8px] text-gray-300 mt-2 border-t border-dashed border-gray-200 pt-1.5">
                  Keep your PIN confidential · FuelStation HR
                </p>
              </div>
            ))}
          </div>
          {withPin.length === 0 && (
            <div className="py-10 text-center text-gray-400">
              <p>No workers with PINs — generate PINs first</p>
            </div>
          )}
        </div>

        <div className="px-5 py-4 border-t border-gray-100 flex gap-3">
          <button onClick={doPrint} disabled={withPin.length === 0}
            className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl bg-brand-600 text-white font-medium hover:bg-brand-700 disabled:opacity-50">
            <Printer size={15} /> Print All PIN Slips
          </button>
          <button onClick={onClose} className="btn-secondary">Close</button>
        </div>
      </div>
    </div>
  );
}

// ── Main Page ──────────────────────────────────────────────────────────────────
export default function WorkerPins() {
  const notify = useNotify();
  const { user, isSuperAdmin } = useAuth();

  const [workers,       setWorkers      ] = useState([]);
  const [branches,      setBranches     ] = useState([]);
  const [loading,       setLoading      ] = useState(true);
  const [generating,    setGenerating   ] = useState(false);
  const [editWorker,    setEditWorker   ] = useState(null);
  const [showPrint,     setShowPrint    ] = useState(false);
  const [revealAll,     setRevealAll    ] = useState(false);
  const [revealIds,     setRevealIds    ] = useState(new Set());
  const [filterBranch,  setFilterBranch ] = useState('');
  const [filterStatus,  setFilterStatus ] = useState('');  // '' | 'has_pin' | 'no_pin'
  const [search,        setSearch       ] = useState('');
  const [copied,        setCopied       ] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (filterBranch) params.set('branchId', filterBranch);

      const [wRes, bRes] = await Promise.all([
        api.get(`/workers/pins?${params}`),
        api.get('/branches'),
      ]);
      setWorkers(wRes.data.data);
      setBranches(bRes.data.data || []);
    } catch { notify('Failed to load', 'error'); }
    finally { setLoading(false); }
  }, [filterBranch]);

  useEffect(() => { load(); }, [load]);

  // Filtered list
  const filtered = workers.filter(w => {
    if (filterStatus === 'has_pin' && !w.pin) return false;
    if (filterStatus === 'no_pin'  &&  w.pin) return false;
    if (search && !w.fullName.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  const stats = {
    total:  workers.length,
    hasPIN: workers.filter(w => w.pin).length,
    noPIN:  workers.filter(w => !w.pin).length,
  };

  // Bulk generate
  const generateAll = async () => {
    if (!confirm(`Generate PINs for ${stats.noPIN} worker${stats.noPIN !== 1 ? 's' : ''} without a PIN?`)) return;
    setGenerating(true);
    try {
      const { data } = await api.post('/workers/bulk-generate-pins');
      notify(data.message + ' ✓');
      await load();
    } catch (err) { notify(err.response?.data?.message || 'Failed', 'error'); }
    finally { setGenerating(false); }
  };

  // Regenerate all (overwrite)
  const regenerateAll = async () => {
    if (!confirm(`⚠️ This will REPLACE all existing PINs for every worker. Workers must use their new PINs. Continue?`)) return;
    setGenerating(true);
    try {
      const { data } = await api.post('/workers/bulk-generate-pins', { overwrite: true });
      notify(data.message + ' ✓');
      setRevealIds(new Set()); setRevealAll(false);
      await load();
    } catch (err) { notify(err.response?.data?.message || 'Failed', 'error'); }
    finally { setGenerating(false); }
  };

  const toggleReveal = id => {
    setRevealIds(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const copyPin = (w) => {
    navigator.clipboard.writeText(w.pin);
    setCopied(w._id);
    setTimeout(() => setCopied(''), 2000);
  };

  const pinUpdated = (id, pin) => {
    setWorkers(prev => prev.map(w => w._id === id ? { ...w, pin } : w));
    setEditWorker(null);
  };

  if (!isSuperAdmin()) return (
    <div className="flex items-center justify-center h-64 text-gray-400 text-sm">Super Admin access required</div>
  );

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-xl font-bold text-gray-900 flex items-center gap-2">
            <KeyRound size={20} className="text-brand-600" /> Worker PINs
          </h1>
          <p className="text-sm text-gray-500 mt-0.5">
            Manage attendance PINs — workers use these to clock in/out on the terminal
          </p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <button onClick={() => setShowPrint(true)}
            className="btn-secondary"><Printer size={14} /> Print Slips</button>
          <button onClick={() => setRevealAll(v => !v)}
            className="btn-secondary">
            {revealAll ? <><EyeOff size={14} /> Hide All</> : <><Eye size={14} /> Show All</>}
          </button>
          <button onClick={load} className="btn-secondary" title="Refresh"><RefreshCw size={14} /></button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-3">
        <div className="card p-4">
          <p className="text-xs text-gray-500 mb-1">Total Workers</p>
          <p className="text-2xl font-bold text-gray-700">{stats.total}</p>
        </div>
        <div className="card p-4 bg-green-50">
          <p className="text-xs text-gray-500 mb-1 flex items-center gap-1"><CheckCircle size={11} className="text-green-600" /> Have PIN</p>
          <p className="text-2xl font-bold text-green-700">{stats.hasPIN}</p>
        </div>
        <div className="card p-4 bg-amber-50">
          <p className="text-xs text-gray-500 mb-1 flex items-center gap-1"><AlertTriangle size={11} className="text-amber-600" /> No PIN</p>
          <p className="text-2xl font-bold text-amber-700">{stats.noPIN}</p>
        </div>
      </div>

      {/* Generate banner */}
      {stats.noPIN > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-start gap-3">
            <AlertTriangle size={16} className="text-amber-600 mt-0.5 shrink-0" />
            <div>
              <p className="text-sm font-semibold text-amber-800">
                {stats.noPIN} worker{stats.noPIN !== 1 ? 's' : ''} {stats.noPIN === 1 ? 'has' : 'have'} no PIN yet
              </p>
              <p className="text-xs text-amber-600 mt-0.5">
                They won't be able to use the attendance terminal until a PIN is assigned.
              </p>
            </div>
          </div>
          <button onClick={generateAll} disabled={generating}
            className="flex items-center gap-2 px-4 py-2 rounded-xl bg-amber-600 text-white font-medium text-sm hover:bg-amber-700 disabled:opacity-50 shrink-0">
            {generating ? <Loader size={14} className="animate-spin" /> : <Wand2 size={14} />}
            Generate {stats.noPIN} PIN{stats.noPIN !== 1 ? 's' : ''}
          </button>
        </div>
      )}

      {/* All PINs assigned banner */}
      {stats.noPIN === 0 && stats.total > 0 && (
        <div className="bg-green-50 border border-green-200 rounded-xl p-3 flex items-center gap-2">
          <ShieldCheck size={15} className="text-green-600" />
          <p className="text-sm text-green-700 font-medium">All workers have PINs assigned</p>
          <button onClick={regenerateAll} disabled={generating}
            className="ml-auto flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-green-300 text-green-700 text-xs font-medium hover:bg-green-100">
            {generating ? <Loader size={12} className="animate-spin" /> : <RefreshCw size={12} />}
            Regenerate All
          </button>
        </div>
      )}

      {/* Filters */}
      <div className="card p-3 flex gap-3 flex-wrap items-center">
        <div className="relative flex-1 min-w-[150px]">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input className="input pl-8 text-sm" placeholder="Search worker…"
            value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <select className="input max-w-[150px]" value={filterBranch} onChange={e => setFilterBranch(e.target.value)}>
          <option value="">All branches</option>
          {branches.map(b => <option key={b._id} value={b._id}>{b.name}</option>)}
        </select>
        <select className="input max-w-[140px]" value={filterStatus} onChange={e => setFilterStatus(e.target.value)}>
          <option value="">All workers</option>
          <option value="has_pin">Has PIN</option>
          <option value="no_pin">No PIN</option>
        </select>
      </div>

      {/* Workers table */}
      <div className="card overflow-hidden">
        <div className="px-5 py-3 border-b border-gray-100 flex items-center justify-between">
          <p className="font-semibold text-gray-800 text-sm">Worker PINs</p>
          <span className="text-xs text-gray-400">{filtered.length} worker{filtered.length !== 1 ? 's' : ''}</span>
        </div>

        {loading ? (
          <div className="py-12 flex justify-center"><Loader size={22} className="animate-spin text-brand-500" /></div>
        ) : filtered.length === 0 ? (
          <div className="py-12 text-center text-gray-400">
            <KeyRound size={28} className="mx-auto mb-2 text-gray-300" />
            <p className="text-sm">No workers found</p>
          </div>
        ) : (
          <div className="divide-y divide-gray-50">
            {filtered.map(w => {
              const revealed = revealAll || revealIds.has(w._id);
              return (
                <div key={w._id} className="flex items-center gap-4 px-5 py-3.5 hover:bg-gray-50/50 flex-wrap">
                  {/* Worker info */}
                  <div className="flex items-center gap-3 flex-1 min-w-[160px]">
                    {w.passportPhoto?.url
                      ? <img src={w.passportPhoto.url} className="w-9 h-9 rounded-lg object-cover shrink-0" alt="" />
                      : <div className="w-9 h-9 rounded-lg bg-brand-100 text-brand-700 flex items-center justify-center font-bold text-sm shrink-0">{w.fullName[0]}</div>
                    }
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-gray-900 truncate">{w.fullName}</p>
                      <p className="text-xs text-gray-400 truncate">
                        {w.role}
                        {w.branchId?.name && <span className="ml-1.5 flex-inline items-center gap-0.5"><Building2 size={9} className="inline" /> {w.branchId.name}</span>}
                      </p>
                    </div>
                  </div>

                  {/* PIN display */}
                  <div className="flex items-center gap-2 shrink-0">
                    {w.pin ? (
                      <>
                        <code className={`font-mono font-bold text-lg text-brand-700 tracking-widest px-3 py-1 bg-brand-50 rounded-lg border border-brand-100 min-w-[80px] text-center ${revealed ? '' : 'blur-[3px] select-none'}`}>
                          {revealed ? w.pin : '••••'}
                        </code>
                        <button onClick={() => toggleReveal(w._id)}
                          className="p-1.5 rounded-lg text-gray-400 hover:text-brand-600 hover:bg-brand-50 transition-colors"
                          title={revealed ? 'Hide' : 'Reveal'}>
                          {revealed ? <EyeOff size={15} /> : <Eye size={15} />}
                        </button>
                        {revealed && (
                          <button onClick={() => copyPin(w)}
                            className="p-1.5 rounded-lg text-gray-400 hover:text-brand-600 hover:bg-brand-50 transition-colors"
                            title="Copy PIN">
                            {copied === w._id ? <Check size={15} className="text-green-600" /> : <Copy size={15} />}
                          </button>
                        )}
                        <button onClick={() => setEditWorker(w)}
                          className="px-2.5 py-1 rounded-lg border border-gray-200 text-gray-500 text-xs font-medium hover:bg-gray-50 transition-colors">
                          Change
                        </button>
                      </>
                    ) : (
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-amber-600 bg-amber-50 border border-amber-200 px-2.5 py-1 rounded-lg font-medium">
                          No PIN
                        </span>
                        <button onClick={() => setEditWorker(w)}
                          className="px-2.5 py-1 rounded-lg bg-brand-600 text-white text-xs font-medium hover:bg-brand-700 transition-colors flex items-center gap-1">
                          <KeyRound size={11} /> Set PIN
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Instructions */}
      <div className="card p-5 bg-gray-50">
        <p className="font-semibold text-gray-700 text-sm mb-3 flex items-center gap-2">
          <ShieldCheck size={15} className="text-brand-600" /> How to distribute PINs to workers
        </p>
        <ol className="space-y-1.5 text-sm text-gray-600 list-decimal list-inside">
          <li>Click <strong>Generate PINs</strong> to auto-assign unique 4-digit PINs to all workers</li>
          <li>Click <strong>Print Slips</strong> to print individual PIN cards — cut and hand to each worker</li>
          <li>Worker takes their slip to the attendance terminal and enters their PIN</li>
          <li>First login registers their face — every login after that verifies live against their face</li>
          <li>Keep PINs confidential — use <strong>Regenerate All</strong> if PINs are compromised</li>
        </ol>
      </div>

      {/* Modals */}
      {editWorker && (
        <SetPinModal worker={editWorker} onClose={() => setEditWorker(null)} onSaved={pinUpdated} />
      )}
      {showPrint && (
        <PrintSheet workers={workers} companyName={user?.company?.name || 'FuelStation HR'} onClose={() => setShowPrint(false)} />
      )}
    </div>
  );
}
