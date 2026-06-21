/**
 * Offences — Supervisor books a worker for any disciplinary offence.
 * Admins can resolve or dismiss records.
 */
import { useState, useEffect, useCallback, useMemo } from 'react';
import {
  AlertOctagon, Plus, Search, Filter, X, Loader,
  ChevronDown, User, Calendar, Building2, CheckCircle,
  Trash2, ShieldAlert, Clock, FileText
} from 'lucide-react';
import api from '../utils/api';
import { useAuth } from '../context/AuthContext';
import { useNotify } from '../context/NotificationContext';

// ── Constants ─────────────────────────────────────────────────────────────────
const OFFENCE_TYPES = [
  { value: 'late_arrival',          label: 'Late Arrival'            },
  { value: 'absent_without_notice', label: 'Absent Without Notice'   },
  { value: 'improper_uniform',      label: 'Improper Uniform'        },
  { value: 'rude_to_customer',      label: 'Rude to Customer'        },
  { value: 'cash_shortage',         label: 'Cash Shortage'           },
  { value: 'fuel_shortage',         label: 'Fuel Shortage'           },
  { value: 'negligence',            label: 'Negligence'              },
  { value: 'theft_fraud',           label: 'Theft / Fraud'           },
  { value: 'disobedience',          label: 'Disobedience'            },
  { value: 'mobile_phone_misuse',   label: 'Phone Misuse on Duty'    },
  { value: 'fighting_misconduct',   label: 'Fighting / Misconduct'   },
  { value: 'damage_to_property',    label: 'Damage to Property'      },
  { value: 'abandoning_post',       label: 'Abandoning Post'         },
  { value: 'insubordination',       label: 'Insubordination'         },
  { value: 'sleeping_on_duty',      label: 'Sleeping on Duty'        },
  { value: 'other',                 label: 'Other'                   },
];

const SEVERITY = [
  { value: 'minor',    label: 'Minor',    cls: 'bg-blue-100 text-blue-700'   },
  { value: 'moderate', label: 'Moderate', cls: 'bg-amber-100 text-amber-700' },
  { value: 'serious',  label: 'Serious',  cls: 'bg-orange-100 text-orange-700'},
  { value: 'gross',    label: 'Gross',    cls: 'bg-red-100 text-red-700'     },
];

const ACTIONS = [
  { value: 'verbal_warning',   label: 'Verbal Warning'   },
  { value: 'written_warning',  label: 'Written Warning'  },
  { value: 'suspension',       label: 'Suspension'       },
  { value: 'deduction',        label: 'Salary Deduction' },
  { value: 'dismissal',        label: 'Dismissal'        },
  { value: 'none',             label: 'Record Only'      },
];

const STATUS_CFG = {
  active:   { label: 'Active',   cls: 'bg-red-100 text-red-700'      },
  appealed: { label: 'Appealed', cls: 'bg-amber-100 text-amber-700'  },
  resolved: { label: 'Resolved', cls: 'bg-green-100 text-green-700'  },
  dismissed:{ label: 'Dismissed',cls: 'bg-gray-100 text-gray-500'    },
};

const sevCfg  = (v) => SEVERITY.find(s => s.value === v) || SEVERITY[0];
const typLabel= (v) => OFFENCE_TYPES.find(t => t.value === v)?.label || v;
const actLabel= (v) => ACTIONS.find(a => a.value === v)?.label || v;
const todayStr= () => new Date().toISOString().split('T')[0];
const fmt     = (n) => `₦${Number(n||0).toLocaleString()}`;
const fmtDate = (d) => d ? new Date(d).toLocaleDateString('en-NG', { day:'2-digit', month:'short', year:'numeric' }) : '—';

// ── Book Offence Modal ────────────────────────────────────────────────────────
function BookModal({ onClose, onSaved, branches }) {
  const notify = useNotify();
  const [workers,   setWorkers  ] = useState([]);
  const [wSearch,   setWSearch  ] = useState('');
  const [loading,   setLoading  ] = useState(false);

  const [form, setForm] = useState({
    workerId:       '',
    workerName:     '',
    date:           todayStr(),
    offenceType:    'late_arrival',
    description:    '',
    severity:       'minor',
    action:         'verbal_warning',
    deductionAmount:'',
    witness:        '',
  });

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  // Load workers when modal opens
  useEffect(() => {
    api.get('/workers?status=active&limit=500')
      .then(r => setWorkers(r.data.data || []))
      .catch(() => {});
  }, []);

  const filteredWorkers = useMemo(() => {
    const q = wSearch.toLowerCase();
    return workers.filter(w =>
      w.fullName.toLowerCase().includes(q) || w.role?.toLowerCase().includes(q) || w.branch?.toLowerCase().includes(q)
    ).slice(0, 20);
  }, [workers, wSearch]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.workerId) return notify('Select a worker', 'error');
    setLoading(true);
    try {
      await api.post('/offences', {
        workerId:       form.workerId,
        date:           form.date,
        offenceType:    form.offenceType,
        description:    form.description,
        severity:       form.severity,
        action:         form.action,
        deductionAmount:form.action === 'deduction' ? Number(form.deductionAmount) || 0 : 0,
        witness:        form.witness,
      });
      notify('Offence booked successfully');
      onSaved();
      onClose();
    } catch (err) {
      notify(err.response?.data?.message || 'Failed to book offence', 'error');
    } finally { setLoading(false); }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/60 overflow-y-auto flex items-start justify-center p-4 md:pl-64">
      <div className="bg-white rounded-2xl w-full max-w-lg shadow-2xl my-6">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <div className="flex items-center gap-2.5">
            <div className="bg-red-100 rounded-xl p-1.5">
              <AlertOctagon size={18} className="text-red-600" />
            </div>
            <div>
              <p className="font-bold text-gray-900">Book an Offence</p>
              <p className="text-xs text-gray-400">Record a disciplinary offence against a worker</p>
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 hover:bg-gray-100 rounded-lg">
            <X size={16} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {/* Worker selector */}
          <div>
            <label className="label">Worker *</label>
            {form.workerId ? (
              <div className="flex items-center justify-between bg-green-50 border border-green-200 rounded-xl px-3 py-2.5">
                <div className="flex items-center gap-2">
                  <div className="w-7 h-7 rounded-full bg-brand-100 flex items-center justify-center text-xs font-bold text-brand-700">
                    {form.workerName?.[0]?.toUpperCase()}
                  </div>
                  <p className="text-sm font-medium text-gray-800">{form.workerName}</p>
                </div>
                <button type="button" onClick={() => { set('workerId', ''); set('workerName', ''); setWSearch(''); }}
                  className="text-gray-400 hover:text-red-500 text-xs">Change</button>
              </div>
            ) : (
              <div className="space-y-1.5">
                <div className="relative">
                  <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                  <input className="input pl-8 text-sm" placeholder="Search by name, role or branch…"
                    value={wSearch} onChange={e => setWSearch(e.target.value)} autoFocus />
                </div>
                {wSearch && (
                  <div className="border border-gray-200 rounded-xl overflow-hidden max-h-44 overflow-y-auto shadow-sm">
                    {filteredWorkers.length === 0
                      ? <p className="text-xs text-gray-400 px-4 py-3">No workers found</p>
                      : filteredWorkers.map(w => (
                        <button key={w._id} type="button"
                          onClick={() => { set('workerId', w._id); set('workerName', w.fullName); setWSearch(''); }}
                          className="w-full text-left px-4 py-2.5 hover:bg-brand-50 flex items-center gap-2.5 border-b border-gray-50 last:border-0">
                          <div className="w-6 h-6 rounded-full bg-gray-100 flex items-center justify-center text-xs font-bold text-gray-600 shrink-0">
                            {w.fullName?.[0]?.toUpperCase()}
                          </div>
                          <div>
                            <p className="text-sm font-medium text-gray-800">{w.fullName}</p>
                            <p className="text-xs text-gray-400">{w.role} · {w.branch}</p>
                          </div>
                        </button>
                      ))
                    }
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Date */}
          <div>
            <label className="label">Date of Offence *</label>
            <input type="date" className="input" value={form.date} max={todayStr()}
              onChange={e => set('date', e.target.value)} required />
          </div>

          {/* Offence type */}
          <div>
            <label className="label">Type of Offence *</label>
            <select className="input" value={form.offenceType} onChange={e => set('offenceType', e.target.value)} required>
              {OFFENCE_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
            </select>
          </div>

          {/* Severity */}
          <div>
            <label className="label">Severity *</label>
            <div className="grid grid-cols-4 gap-2">
              {SEVERITY.map(s => (
                <button key={s.value} type="button"
                  onClick={() => set('severity', s.value)}
                  className={`py-2 rounded-xl text-xs font-semibold border-2 transition-all ${
                    form.severity === s.value
                      ? `${s.cls} border-current`
                      : 'bg-gray-50 text-gray-400 border-transparent hover:border-gray-200'
                  }`}>
                  {s.label}
                </button>
              ))}
            </div>
          </div>

          {/* Description */}
          <div>
            <label className="label">What Happened <span className="text-gray-400 font-normal">(details)</span></label>
            <textarea className="input resize-none text-sm" rows={3}
              placeholder="Describe the offence clearly — what was done, when, and where…"
              value={form.description} onChange={e => set('description', e.target.value)} />
          </div>

          {/* Action */}
          <div>
            <label className="label">Action Taken</label>
            <select className="input" value={form.action} onChange={e => set('action', e.target.value)}>
              {ACTIONS.map(a => <option key={a.value} value={a.value}>{a.label}</option>)}
            </select>
          </div>

          {/* Deduction amount — only if action = deduction */}
          {form.action === 'deduction' && (
            <div>
              <label className="label">Deduction Amount (₦) *</label>
              <input type="number" className="input" min="0" placeholder="e.g. 5000"
                value={form.deductionAmount} onChange={e => set('deductionAmount', e.target.value)} required />
            </div>
          )}

          {/* Witness */}
          <div>
            <label className="label">Witness <span className="text-gray-400 font-normal">(optional)</span></label>
            <input className="input text-sm" placeholder="Name of witness if any…"
              value={form.witness} onChange={e => set('witness', e.target.value)} />
          </div>

          {/* Severity notice */}
          {form.severity === 'gross' && (
            <div className="bg-red-50 border border-red-200 rounded-xl px-3 py-2.5 text-xs text-red-700 flex items-start gap-2">
              <ShieldAlert size={13} className="shrink-0 mt-0.5" />
              <span><strong>Gross offence</strong> — may warrant immediate dismissal. Ensure this is documented properly and management is informed.</span>
            </div>
          )}

          {/* Buttons */}
          <div className="flex gap-3 pt-1">
            <button type="button" onClick={onClose}
              className="flex-1 py-2.5 rounded-xl border border-gray-200 text-sm text-gray-600 hover:bg-gray-50 transition-colors">
              Cancel
            </button>
            <button type="submit" disabled={loading || !form.workerId}
              className="flex-1 py-2.5 rounded-xl bg-red-600 hover:bg-red-700 text-white text-sm font-semibold transition-colors disabled:opacity-50 flex items-center justify-center gap-2">
              {loading ? <Loader size={14} className="animate-spin" /> : <AlertOctagon size={14} />}
              Book Offence
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── Detail Modal ──────────────────────────────────────────────────────────────
function DetailModal({ offence, onClose, onResolve, onDelete, isAdmin }) {
  const notify = useNotify();
  const sev = sevCfg(offence.severity);
  const sts = STATUS_CFG[offence.status] || STATUS_CFG.active;
  const [showShortage, setShowShortage] = useState(false);
  const [shortageAmt,  setShortageAmt ] = useState('');
  const [shortageNote, setShortageNote] = useState('');
  const [submitting,   setSubmitting  ] = useState(false);

  const submitShortage = async () => {
    if (!shortageAmt || Number(shortageAmt) <= 0) {
      notify('Enter a valid amount', 'error'); return;
    }
    setSubmitting(true);
    try {
      const now = new Date();
      await api.post('/shortages', {
        workerId: offence.worker,
        branchId: offence.branchId,
        month:    now.getMonth() + 1,
        year:     now.getFullYear(),
        amount:   Number(shortageAmt),
        reason:   'other',
        about:    `Offence: ${typLabel(offence.offenceType)}`,
        notes:    shortageNote || offence.description || '',
      });
      notify('Shortage added successfully');
      setShowShortage(false);
      setShortageAmt('');
      setShortageNote('');
    } catch (err) {
      notify(err.response?.data?.message || 'Failed to add shortage', 'error');
    } finally { setSubmitting(false); }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex items-end sm:items-center justify-center p-0 sm:p-4 md:pl-64">
      <div className="bg-white rounded-t-2xl sm:rounded-2xl w-full max-w-lg shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <div className="flex items-center gap-2">
            <ShieldAlert size={16} className="text-red-500" />
            <p className="font-bold text-gray-900">Offence Detail</p>
          </div>
          <button onClick={onClose} className="p-1.5 hover:bg-gray-100 rounded-lg">
            <X size={16} className="text-gray-400" />
          </button>
        </div>

        <div className="px-5 py-4 space-y-4 max-h-[80vh] overflow-y-auto">
          {/* Worker */}
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-brand-100 flex items-center justify-center text-sm font-bold text-brand-700 shrink-0">
              {offence.workerName?.[0]?.toUpperCase()}
            </div>
            <div>
              <p className="font-semibold text-gray-900">{offence.workerName}</p>
              <p className="text-xs text-gray-400">{offence.workerRole} · {offence.branch}</p>
            </div>
            <span className={`ml-auto inline-flex text-xs font-semibold px-2.5 py-1 rounded-full ${sts.cls}`}>
              {sts.label}
            </span>
          </div>

          {/* Offence info */}
          <div className="grid grid-cols-2 gap-3">
            <div className="bg-gray-50 rounded-xl p-3">
              <p className="text-xs text-gray-400 mb-0.5">Offence</p>
              <p className="text-sm font-semibold text-gray-800">{typLabel(offence.offenceType)}</p>
            </div>
            <div className="bg-gray-50 rounded-xl p-3">
              <p className="text-xs text-gray-400 mb-0.5">Severity</p>
              <span className={`inline-flex text-xs font-semibold px-2 py-0.5 rounded-full ${sev.cls}`}>{sev.label}</span>
            </div>
            <div className="bg-gray-50 rounded-xl p-3">
              <p className="text-xs text-gray-400 mb-0.5">Action Taken</p>
              <p className="text-sm font-semibold text-gray-800">{actLabel(offence.action)}</p>
              {offence.action === 'deduction' && offence.deductionAmount > 0 && (
                <p className="text-xs text-red-600 font-semibold mt-0.5">{fmt(offence.deductionAmount)}</p>
              )}
            </div>
            <div className="bg-gray-50 rounded-xl p-3">
              <p className="text-xs text-gray-400 mb-0.5">Date</p>
              <p className="text-sm font-semibold text-gray-800">{fmtDate(offence.date)}</p>
              {offence.recordedByName && (
                <p className="text-xs text-gray-400 mt-0.5">By {offence.recordedByName}</p>
              )}
            </div>
          </div>

          {/* Description */}
          {offence.description && (
            <div className="bg-red-50 rounded-xl p-3 border border-red-100">
              <p className="text-xs font-semibold text-red-600 mb-1 flex items-center gap-1">
                <FileText size={11} /> What Happened
              </p>
              <p className="text-sm text-gray-800 leading-relaxed whitespace-pre-wrap">{offence.description}</p>
            </div>
          )}

          {/* Witness */}
          {offence.witness && (
            <div className="flex items-center gap-2 text-sm text-gray-600">
              <User size={13} className="text-gray-400 shrink-0" />
              <span><span className="text-gray-400">Witness:</span> {offence.witness}</span>
            </div>
          )}

          {/* Resolution */}
          {offence.resolution && (
            <div className="bg-green-50 rounded-xl p-3 border border-green-100">
              <p className="text-xs font-semibold text-green-700 mb-1">Resolution</p>
              <p className="text-sm text-gray-700 whitespace-pre-wrap">{offence.resolution}</p>
            </div>
          )}
        </div>

        {/* Shortage form */}
        {isAdmin && showShortage && (
          <div className="px-5 py-4 border-t border-gray-100 bg-red-50 space-y-3">
            <p className="text-sm font-semibold text-red-700">Add Shortage Deduction</p>
            <div className="flex gap-2">
              <div className="relative flex-1">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-gray-400 font-medium">₦</span>
                <input
                  type="number" min="1" placeholder="Amount"
                  value={shortageAmt} onChange={e => setShortageAmt(e.target.value)}
                  className="input pl-7 w-full"
                />
              </div>
            </div>
            <textarea
              rows={2} placeholder="Notes (optional — defaults to offence description)"
              value={shortageNote} onChange={e => setShortageNote(e.target.value)}
              className="input resize-none text-sm w-full"
            />
            <div className="flex gap-2">
              <button onClick={() => setShowShortage(false)}
                className="flex-1 py-2 rounded-xl border border-gray-200 text-sm text-gray-600 hover:bg-white">
                Cancel
              </button>
              <button onClick={submitShortage} disabled={submitting}
                className="flex-1 py-2 rounded-xl bg-red-600 text-white text-sm font-semibold hover:bg-red-700 disabled:opacity-50 flex items-center justify-center gap-1.5">
                {submitting ? <Loader size={13} className="animate-spin" /> : null}
                Submit
              </button>
            </div>
          </div>
        )}

        {/* Footer actions */}
        {isAdmin && (
          <div className="px-5 py-3 border-t border-gray-100 flex gap-2">
            {!showShortage && (
              <button onClick={() => setShowShortage(true)}
                className="flex-1 py-2 rounded-xl border border-red-200 text-red-600 text-sm font-medium hover:bg-red-50 flex items-center justify-center gap-1.5">
                <AlertOctagon size={13} /> Add Shortage
              </button>
            )}
            {offence.status === 'active' && !showShortage && (
              <button onClick={onResolve}
                className="flex-1 py-2 rounded-xl bg-brand-600 text-white text-sm font-semibold hover:bg-brand-700 flex items-center justify-center gap-1.5">
                <CheckCircle size={13} /> Resolve
              </button>
            )}
            {!showShortage && (
              <button onClick={onDelete}
                className="py-2 px-4 rounded-xl border border-red-200 text-red-600 text-sm font-medium hover:bg-red-50 flex items-center gap-1.5">
                <Trash2 size={13} />
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Resolve Modal ─────────────────────────────────────────────────────────────
function ResolveModal({ offence, onClose, onSaved }) {
  const notify = useNotify();
  const [status,     setStatus    ] = useState('resolved');
  const [resolution, setResolution] = useState('');
  const [loading,    setLoading   ] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      await api.patch(`/offences/${offence._id}/resolve`, { status, resolution });
      notify('Offence updated');
      onSaved(); onClose();
    } catch (err) {
      notify(err.response?.data?.message || 'Failed', 'error');
    } finally { setLoading(false); }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4 md:pl-64">
      <div className="bg-white rounded-2xl w-full max-w-sm shadow-2xl p-6 space-y-4">
        <div className="flex items-center justify-between">
          <p className="font-bold text-gray-900">Update Offence</p>
          <button onClick={onClose}><X size={16} className="text-gray-400" /></button>
        </div>
        <p className="text-sm text-gray-500">Worker: <strong>{offence.workerName}</strong></p>
        <form onSubmit={handleSubmit} className="space-y-3">
          <div>
            <label className="label">New Status</label>
            <select className="input" value={status} onChange={e => setStatus(e.target.value)}>
              <option value="resolved">Resolved</option>
              <option value="dismissed">Dismissed</option>
              <option value="appealed">Appealed</option>
            </select>
          </div>
          <div>
            <label className="label">Resolution Notes</label>
            <textarea className="input resize-none text-sm" rows={3}
              placeholder="What action was taken / why dismissed…"
              value={resolution} onChange={e => setResolution(e.target.value)} />
          </div>
          <div className="flex gap-3 pt-1">
            <button type="button" onClick={onClose}
              className="flex-1 py-2 rounded-xl border border-gray-200 text-sm text-gray-600 hover:bg-gray-50">Cancel</button>
            <button type="submit" disabled={loading}
              className="flex-1 py-2 rounded-xl bg-brand-600 text-white text-sm font-semibold hover:bg-brand-700 disabled:opacity-50 flex items-center justify-center gap-2">
              {loading ? <Loader size={13} className="animate-spin" /> : <CheckCircle size={13} />}
              Save
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function Offences() {
  const notify = useNotify();
  const { isSuperAdmin, can } = useAuth();
  const isAdmin = isSuperAdmin();

  const [offences,    setOffences   ] = useState([]);
  const [branches,    setBranches   ] = useState([]);
  const [loading,     setLoading    ] = useState(false);
  const [showBook,    setShowBook   ] = useState(false);
  const [resolving,   setResolving  ] = useState(null);   // offence being resolved
  const [viewing,     setViewing    ] = useState(null);   // offence detail view

  // Filters
  const [search,      setSearch     ] = useState('');
  const [fBranch,     setFBranch    ] = useState('');
  const [fSeverity,   setFSeverity  ] = useState('');
  const [fStatus,     setFStatus    ] = useState('active');
  const [fFrom,       setFFrom      ] = useState('');
  const [fTo,         setFTo        ] = useState('');

  useEffect(() => {
    api.get('/branches').then(r => setBranches(r.data.data || [])).catch(() => {});
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (fBranch)   params.set('branchId',  fBranch);
      if (fSeverity) params.set('severity',  fSeverity);
      if (fStatus)   params.set('status',    fStatus);
      if (fFrom)     params.set('from',      fFrom);
      if (fTo)       params.set('to',        fTo);
      const { data } = await api.get(`/offences?${params}`);
      setOffences(data.data || []);
    } catch { notify('Failed to load offences', 'error'); }
    finally { setLoading(false); }
  }, [fBranch, fSeverity, fStatus, fFrom, fTo]);

  useEffect(() => { load(); }, [load]);

  const handleDelete = async (id) => {
    if (!window.confirm('Delete this offence record? This cannot be undone.')) return;
    try {
      await api.delete(`/offences/${id}`);
      notify('Deleted');
      setOffences(prev => prev.filter(o => o._id !== id));
    } catch { notify('Failed to delete', 'error'); }
  };

  // Filter by search
  const visible = useMemo(() => {
    if (!search.trim()) return offences;
    const q = search.toLowerCase();
    return offences.filter(o =>
      o.workerName?.toLowerCase().includes(q) ||
      o.workerRole?.toLowerCase().includes(q) ||
      o.branch?.toLowerCase().includes(q)
    );
  }, [offences, search]);

  // Summary counts
  const counts = useMemo(() => {
    const c = { active: 0, resolved: 0, dismissed: 0, appealed: 0 };
    offences.forEach(o => { if (c[o.status] !== undefined) c[o.status]++; });
    return c;
  }, [offences]);

  return (
    <div className="p-4 sm:p-6 space-y-5 max-w-6xl mx-auto">

      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <AlertOctagon size={22} className="text-red-500" />
            Disciplinary Records
          </h1>
          <p className="text-gray-500 text-sm mt-0.5">Book and track staff offences and disciplinary actions</p>
        </div>
        {(isAdmin || can('bookOffences')) && (
          <button onClick={() => setShowBook(true)}
            className="flex items-center gap-2 px-4 py-2.5 bg-red-600 hover:bg-red-700 text-white rounded-xl text-sm font-semibold transition-colors shadow-sm">
            <Plus size={15} />
            Book Offence
          </button>
        )}
      </div>

      {/* Summary strip */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { key: 'active',   label: 'Active',   cls: 'text-red-600',   bg: 'bg-red-50 border-red-100'    },
          { key: 'appealed', label: 'Appealed', cls: 'text-amber-600', bg: 'bg-amber-50 border-amber-100'},
          { key: 'resolved', label: 'Resolved', cls: 'text-green-600', bg: 'bg-green-50 border-green-100'},
          { key: 'dismissed',label: 'Dismissed',cls: 'text-gray-500',  bg: 'bg-gray-50 border-gray-200' },
        ].map(({ key, label, cls, bg }) => (
          <button key={key} onClick={() => setFStatus(fStatus === key ? '' : key)}
            className={`rounded-xl border p-3 text-left transition-all ${bg} ${fStatus === key ? 'ring-2 ring-offset-1 ring-brand-400' : ''}`}>
            <p className={`text-xs font-medium ${cls}`}>{label}</p>
            <p className={`text-2xl font-bold ${cls}`}>{counts[key]}</p>
          </button>
        ))}
      </div>

      {/* Filters */}
      <div className="bg-white rounded-2xl border border-gray-200 p-4 flex flex-wrap gap-3 items-end">
        {/* Search */}
        <div className="flex-1 min-w-[180px]">
          <p className="text-xs font-medium text-gray-500 mb-1.5">Search worker</p>
          <div className="relative">
            <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Name, role…"
              className="pl-8 pr-3 py-1.5 border border-gray-200 rounded-lg text-sm w-full focus:outline-none focus:ring-2 focus:ring-brand-400" />
          </div>
        </div>

        {/* Branch */}
        <div className="min-w-[160px]">
          <p className="text-xs font-medium text-gray-500 mb-1.5">Branch</p>
          <select value={fBranch} onChange={e => setFBranch(e.target.value)}
            className="px-3 py-1.5 border border-gray-200 rounded-lg text-sm w-full focus:outline-none focus:ring-2 focus:ring-brand-400">
            <option value="">All branches</option>
            {branches.map(b => <option key={b._id} value={b._id}>{b.name}</option>)}
          </select>
        </div>

        {/* Severity */}
        <div>
          <p className="text-xs font-medium text-gray-500 mb-1.5">Severity</p>
          <select value={fSeverity} onChange={e => setFSeverity(e.target.value)}
            className="px-3 py-1.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-400">
            <option value="">All</option>
            {SEVERITY.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
          </select>
        </div>

        {/* Date range */}
        <div>
          <p className="text-xs font-medium text-gray-500 mb-1.5">From</p>
          <input type="date" value={fFrom} onChange={e => setFFrom(e.target.value)}
            className="px-3 py-1.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-400" />
        </div>
        <div>
          <p className="text-xs font-medium text-gray-500 mb-1.5">To</p>
          <input type="date" value={fTo} onChange={e => setFTo(e.target.value)}
            className="px-3 py-1.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-400" />
        </div>

        {/* Clear */}
        {(fBranch || fSeverity || fFrom || fTo || fStatus) && (
          <button onClick={() => { setFBranch(''); setFSeverity(''); setFFrom(''); setFTo(''); setFStatus('active'); }}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs text-gray-500 hover:bg-gray-100 border border-gray-200 transition-colors">
            <X size={11} /> Clear
          </button>
        )}
      </div>

      {/* Table */}
      <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-16 gap-2 text-gray-400">
            <Loader size={20} className="animate-spin" /><span className="text-sm">Loading…</span>
          </div>
        ) : visible.length === 0 ? (
          <div className="text-center py-16 space-y-2">
            <AlertOctagon size={28} className="text-gray-200 mx-auto" />
            <p className="text-gray-400 text-sm">No offence records found</p>
            {(isAdmin || can('bookOffences')) && (
              <button onClick={() => setShowBook(true)}
                className="mt-2 inline-flex items-center gap-1.5 px-4 py-2 bg-red-600 text-white text-sm font-medium rounded-xl hover:bg-red-700">
                <Plus size={13} /> Book First Offence
              </button>
            )}
          </div>
        ) : (
          <>
            {/* Header */}
            <div className="hidden sm:grid grid-cols-[2fr_1.2fr_1fr_1fr_1fr_1fr_auto] gap-3 px-5 py-3 bg-gray-50 border-b border-gray-100 text-xs font-semibold text-gray-500 uppercase tracking-wide">
              <span>Worker</span>
              <span>Offence</span>
              <span>Severity</span>
              <span>Action</span>
              <span>Date</span>
              <span>Status</span>
              <span></span>
            </div>

            <div className="divide-y divide-gray-50">
              {visible.map(o => {
                const sev = sevCfg(o.severity);
                const sts = STATUS_CFG[o.status] || STATUS_CFG.active;
                return (
                  <div key={o._id}
                    onClick={() => setViewing(o)}
                    className="grid grid-cols-1 sm:grid-cols-[2fr_1.2fr_1fr_1fr_1fr_1fr_auto] gap-2 sm:gap-3 px-5 py-4 hover:bg-gray-50/50 transition-colors cursor-pointer">

                    {/* Worker */}
                    <div className="flex items-center gap-2.5">
                      <div className="w-8 h-8 rounded-full bg-brand-100 flex items-center justify-center text-xs font-bold text-brand-700 shrink-0">
                        {o.workerName?.[0]?.toUpperCase()}
                      </div>
                      <div className="min-w-0">
                        <p className="font-semibold text-gray-900 text-sm">{o.workerName}</p>
                        <p className="text-xs text-gray-400">{o.workerRole} · {o.branch}</p>
                        {o.description && (
                          <p className="text-xs text-gray-400 mt-0.5 line-clamp-1 italic">"{o.description}"</p>
                        )}
                      </div>
                    </div>

                    {/* Offence type */}
                    <div className="flex sm:block items-center gap-2">
                      <span className="sm:hidden text-xs text-gray-400 w-20 shrink-0">Offence:</span>
                      <p className="text-sm text-gray-700 font-medium">{typLabel(o.offenceType)}</p>
                      {o.witness && <p className="text-xs text-gray-400 mt-0.5">Witness: {o.witness}</p>}
                    </div>

                    {/* Severity */}
                    <div className="flex sm:block items-center gap-2">
                      <span className="sm:hidden text-xs text-gray-400 w-20 shrink-0">Severity:</span>
                      <span className={`inline-flex items-center text-xs font-semibold px-2 py-0.5 rounded-full ${sev.cls}`}>
                        {sev.label}
                      </span>
                    </div>

                    {/* Action */}
                    <div className="flex sm:block items-center gap-2">
                      <span className="sm:hidden text-xs text-gray-400 w-20 shrink-0">Action:</span>
                      <div>
                        <p className="text-sm text-gray-600">{actLabel(o.action)}</p>
                        {o.action === 'deduction' && o.deductionAmount > 0 && (
                          <p className="text-xs text-red-600 font-semibold">{fmt(o.deductionAmount)}</p>
                        )}
                      </div>
                    </div>

                    {/* Date */}
                    <div className="flex sm:block items-center gap-2">
                      <span className="sm:hidden text-xs text-gray-400 w-20 shrink-0">Date:</span>
                      <div>
                        <p className="text-sm text-gray-600">{fmtDate(o.date)}</p>
                        <p className="text-xs text-gray-400">{o.recordedByName}</p>
                      </div>
                    </div>

                    {/* Status */}
                    <div className="flex sm:block items-center gap-2">
                      <span className="sm:hidden text-xs text-gray-400 w-20 shrink-0">Status:</span>
                      <div>
                        <span className={`inline-flex text-xs font-semibold px-2 py-0.5 rounded-full ${sts.cls}`}>
                          {sts.label}
                        </span>
                        {o.resolution && (
                          <p className="text-xs text-gray-400 mt-0.5 line-clamp-1">{o.resolution}</p>
                        )}
                      </div>
                    </div>

                    {/* Actions */}
                    {isAdmin && (
                      <div className="flex items-center gap-1" onClick={e => e.stopPropagation()}>
                        {o.status === 'active' && (
                          <button onClick={() => setResolving(o)} title="Resolve / Dismiss"
                            className="p-1.5 text-gray-400 hover:text-brand-600 hover:bg-brand-50 rounded-lg transition-colors">
                            <CheckCircle size={14} />
                          </button>
                        )}
                        <button onClick={() => handleDelete(o._id)} title="Delete"
                          className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors">
                          <Trash2 size={14} />
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            {/* Footer */}
            <div className="px-5 py-3 border-t border-gray-50 bg-gray-50/50">
              <p className="text-xs text-gray-400">{visible.length} record{visible.length !== 1 ? 's' : ''}</p>
            </div>
          </>
        )}
      </div>

      {/* Modals */}
      {showBook   && <BookModal branches={branches} onClose={() => setShowBook(false)} onSaved={load} />}
      {resolving  && <ResolveModal offence={resolving} onClose={() => setResolving(null)} onSaved={load} />}
      {viewing    && (
        <DetailModal
          offence={viewing}
          isAdmin={isAdmin}
          onClose={() => setViewing(null)}
          onResolve={() => { setResolving(viewing); setViewing(null); }}
          onDelete={() => { handleDelete(viewing._id); setViewing(null); }}
        />
      )}
    </div>
  );
}
