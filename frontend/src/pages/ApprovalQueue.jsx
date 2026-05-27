import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import {
  ShieldCheck, XCircle, Eye, FileText, Users, MapPin,
  ChevronDown, ChevronUp, Check, AlertCircle, Clock, X
} from 'lucide-react';
import api from '../utils/api';
import { useNotify } from '../context/NotificationContext';
import VerificationBadge from '../components/VerificationBadge';

const DOC_LABELS = {
  nin:                    'NIN Slip',
  voter_card:             "Voter's Card",
  drivers_license:        "Driver's License",
  national_id:            'National ID',
  international_passport: 'Int\'l Passport'
};

// ─── Reject modal ─────────────────────────────────────────────────────────────
function RejectModal({ worker, onClose, onDone }) {
  const notify = useNotify();
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    if (!reason.trim()) return notify('Please provide a rejection reason', 'error');
    setSaving(true);
    try {
      await api.post(`/workers/${worker._id}/reject`, { reason });
      notify(`${worker.fullName} rejected`);
      onDone();
    } catch (err) {
      notify(err.response?.data?.message || 'Failed to reject', 'error');
    } finally { setSaving(false); }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="bg-white rounded-2xl p-6 w-full max-w-md shadow-2xl">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-bold text-gray-900">Reject Verification</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X size={18} /></button>
        </div>
        <p className="text-sm text-gray-600 mb-4">
          You are rejecting <strong>{worker.fullName}</strong>'s verification.
          Please provide a reason so they can be notified.
        </p>
        <form onSubmit={submit} className="space-y-4">
          <div>
            <label className="label">Rejection Reason *</label>
            <textarea className="input resize-none" rows={3}
              placeholder="e.g. Guarantor documents are unclear, house photo missing, NIN not verified…"
              value={reason} onChange={e => setReason(e.target.value)} required />
          </div>
          <div className="flex gap-3">
            <button type="submit" disabled={saving}
              className="btn-danger flex-1 justify-center">
              {saving ? 'Rejecting…' : <><XCircle size={14} /> Reject Worker</>}
            </button>
            <button type="button" onClick={onClose} className="btn-secondary">Cancel</button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── Worker review card ───────────────────────────────────────────────────────
function WorkerCard({ worker, onAction }) {
  const notify   = useNotify();
  const [open,   setOpen]   = useState(false);
  const [approving, setApproving] = useState(false);
  const [rejectOpen, setRejectOpen] = useState(false);

  const approve = async () => {
    if (!confirm(`Approve ${worker.fullName}? This will mark them as Verified.`)) return;
    setApproving(true);
    try {
      await api.post(`/workers/${worker._id}/approve`);
      notify(`${worker.fullName} approved ✓`);
      onAction();
    } catch (err) {
      notify(err.response?.data?.message || 'Failed to approve', 'error');
    } finally { setApproving(false); }
  };

  const checks = [
    { label: 'Passport Photo',    done: !!worker.passportPhoto?.url },
    { label: 'Signature',         done: !!worker.signature?.url },
    { label: 'Address Pinned',    done: !!worker.addressLocation?.coordinates?.lat },
    { label: 'Documents',         done: (worker.verificationDocuments?.length || 0) > 0 },
    { label: 'Guarantor 1',       done: (worker.guarantorCount || 0) >= 1 },
    { label: 'Guarantor 2',       done: (worker.guarantorCount || 0) >= 2 },
    { label: 'House Photos',      done: (worker.houseVerification?.photos?.length || 0) > 0 },
  ];
  const allDone = checks.every(c => c.done);

  return (
    <>
      <div className="card overflow-hidden">
        {/* Main row */}
        <div className="flex items-center gap-4 p-4">
          {worker.passportPhoto?.url
            ? <img src={worker.passportPhoto.url} className="w-14 h-14 rounded-xl object-cover border-2 border-gray-100 shrink-0" alt="" />
            : <div className="w-14 h-14 rounded-xl bg-brand-100 text-brand-700 flex items-center justify-center font-bold text-xl shrink-0">
                {worker.fullName[0]}
              </div>
          }
          <div className="flex-1 min-w-0">
            <p className="font-bold text-gray-900">{worker.fullName}</p>
            <p className="text-xs text-gray-500">{worker.role} — {worker.branch}</p>
            <div className="flex items-center gap-2 mt-1 flex-wrap">
              <VerificationBadge status={worker.verificationStatus} />
              {worker.submittedForApprovalBy?.name && (
                <span className="text-xs text-gray-400">by {worker.submittedForApprovalBy.name}</span>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <Link to={`/workers/${worker._id}`} className="p-1.5 text-gray-400 hover:text-brand-600 hover:bg-brand-50 rounded-lg" title="View profile">
              <Eye size={16} />
            </Link>
            <button onClick={() => setOpen(!open)}
              className="p-1.5 text-gray-400 hover:bg-gray-100 rounded-lg">
              {open ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
            </button>
          </div>
        </div>

        {/* Expanded review */}
        {open && (
          <div className="border-t border-gray-100 p-4 bg-gray-50 space-y-4">

            {/* Checklist */}
            <div>
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Verification Checklist</p>
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-1.5">
                {checks.map(({ label, done }) => (
                  <div key={label}
                    className={`flex items-center gap-1.5 px-2 py-1.5 rounded-lg text-xs
                      ${done ? 'bg-green-50 text-green-700 border border-green-200'
                              : 'bg-red-50 text-red-600 border border-red-200'}`}>
                    {done ? <Check size={11} /> : <AlertCircle size={11} />}
                    {label}
                  </div>
                ))}
              </div>
            </div>

            {/* Address */}
            {worker.addressLocation?.formatted && (
              <div>
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Address</p>
                <div className="flex items-start gap-1.5 text-sm text-gray-700 bg-white rounded-lg p-2.5 border border-gray-200">
                  <MapPin size={13} className="text-brand-500 mt-0.5 shrink-0" />
                  <div>
                    <p>{worker.addressLocation.formatted}</p>
                    {worker.addressLocation.plusCode && (
                      <p className="text-xs text-brand-600 font-mono mt-0.5">📍 {worker.addressLocation.plusCode}</p>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* Documents */}
            {worker.verificationDocuments?.length > 0 && (
              <div>
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Documents ({worker.verificationDocuments.length})</p>
                <div className="flex flex-wrap gap-2">
                  {worker.verificationDocuments.map(doc => (
                    <a key={doc._id} href={doc.file?.url || '#'} target="_blank" rel="noopener noreferrer"
                      className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors
                        ${doc.file?.url ? 'bg-white text-brand-700 border-brand-200 hover:bg-brand-50' : 'bg-gray-100 text-gray-500 border-gray-200 cursor-default'}`}>
                      <FileText size={12} />
                      {DOC_LABELS[doc.type] || doc.type}
                      {doc.file?.url && <Eye size={10} />}
                    </a>
                  ))}
                </div>
              </div>
            )}

            {/* Guarantors summary */}
            <div>
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">
                Guarantors ({worker.guarantorCount || 0}/2)
              </p>
              <div className="flex items-center gap-2">
                {[1, 2].map(n => (
                  <div key={n}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs border
                      ${(worker.guarantorCount || 0) >= n
                        ? 'bg-green-50 text-green-700 border-green-200'
                        : 'bg-gray-100 text-gray-400 border-gray-200'}`}>
                    <Users size={11} />
                    Guarantor {n}
                    {(worker.guarantorCount || 0) >= n && <Check size={10} />}
                  </div>
                ))}
              </div>
            </div>

            {/* House photos */}
            {worker.houseVerification?.photos?.length > 0 && (
              <div>
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">House Photos</p>
                <div className="flex gap-2 flex-wrap">
                  {worker.houseVerification.photos.map((p, i) => (
                    <a key={i} href={p.url} target="_blank" rel="noopener noreferrer">
                      <img src={p.url} alt="" className="w-20 h-20 object-cover rounded-xl border border-gray-200 hover:opacity-80 transition-opacity" />
                    </a>
                  ))}
                </div>
              </div>
            )}

            {/* Signature */}
            {worker.signature?.url && (
              <div>
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Signature</p>
                <img src={worker.signature.url} alt="Signature"
                  className="h-16 object-contain bg-white rounded-xl border border-gray-200 p-2" />
              </div>
            )}

            {/* Submission info */}
            {worker.submittedForApprovalAt && (
              <p className="text-xs text-gray-400 flex items-center gap-1">
                <Clock size={11} /> Submitted {new Date(worker.submittedForApprovalAt).toLocaleString('en-NG')}
              </p>
            )}

            {/* Action buttons */}
            <div className="flex gap-3 pt-2 border-t border-gray-200">
              <button
                onClick={approve}
                disabled={approving || !allDone}
                title={allDone ? '' : 'All checks must be complete before approving'}
                className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors
                  ${allDone
                    ? 'bg-green-600 text-white hover:bg-green-700'
                    : 'bg-gray-100 text-gray-400 cursor-not-allowed'}`}
              >
                {approving
                  ? <span className="animate-spin h-4 w-4 border-2 border-white border-t-transparent rounded-full" />
                  : <ShieldCheck size={15} />}
                Approve Worker
              </button>
              <button
                onClick={() => setRejectOpen(true)}
                className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium bg-red-50 text-red-600 hover:bg-red-100 border border-red-200 transition-colors"
              >
                <XCircle size={15} /> Reject
              </button>
              <Link to={`/workers/${worker._id}/verify`}
                className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium bg-white text-gray-700 border border-gray-200 hover:bg-gray-50 ml-auto">
                <Eye size={14} /> Full Profile
              </Link>
            </div>

            {!allDone && (
              <p className="text-xs text-amber-600 flex items-center gap-1">
                <AlertCircle size={11} /> Some verification items are incomplete.
                You can still approve manually if satisfied.
              </p>
            )}
          </div>
        )}
      </div>

      {rejectOpen && (
        <RejectModal worker={worker} onClose={() => setRejectOpen(false)} onDone={() => { setRejectOpen(false); onAction(); }} />
      )}
    </>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────
export default function ApprovalQueue() {
  const notify  = useNotify();
  const [workers,  setWorkers]  = useState([]);
  const [loading,  setLoading]  = useState(true);

  const load = async () => {
    setLoading(true);
    try {
      const { data } = await api.get('/workers/approval-queue');
      setWorkers(data.data);
    } catch { notify('Failed to load queue', 'error'); }
    finally { setLoading(false); }
  };

  useEffect(() => { load(); }, []);

  return (
    <div className="max-w-3xl mx-auto space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Approval Queue</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            {loading ? '…' : `${workers.length} worker${workers.length !== 1 ? 's' : ''} awaiting your approval`}
          </p>
        </div>
        <button onClick={load} className="btn-secondary text-xs">Refresh</button>
      </div>

      {loading ? (
        <div className="space-y-3">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="card p-4 animate-pulse flex gap-4">
              <div className="w-14 h-14 rounded-xl bg-gray-100 shrink-0" />
              <div className="flex-1"><div className="h-4 w-40 bg-gray-100 rounded mb-2" /><div className="h-3 w-28 bg-gray-100 rounded" /></div>
            </div>
          ))}
        </div>
      ) : workers.length === 0 ? (
        <div className="card px-6 py-16 text-center">
          <ShieldCheck size={48} className="text-green-200 mx-auto mb-3" />
          <p className="font-semibold text-gray-700">All caught up!</p>
          <p className="text-sm text-gray-400 mt-1">No workers are pending approval right now.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {workers.map(w => (
            <WorkerCard key={w._id} worker={w} onAction={load} />
          ))}
        </div>
      )}
    </div>
  );
}
