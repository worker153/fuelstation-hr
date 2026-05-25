import { useState, useEffect, useRef } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import {
  ChevronLeft, Edit2, Trash2, Upload, CheckCircle, Clock,
  MapPin, Plus, Eye, FileText, Image as ImageIcon, X,
  Phone, Home, Users, ShieldCheck, ArrowRight, AlertCircle
} from 'lucide-react';
import api from '../utils/api';
import { useNotify } from '../context/NotificationContext';
import VerificationBadge from '../components/VerificationBadge';
import MapPicker from '../components/MapPicker';
import FileUpload from '../components/FileUpload';

const DOC_LABELS = {
  nin: 'NIN (National ID Number)',
  voter_card: 'Voter\'s Card',
  drivers_license: 'Driver\'s License',
  national_id: 'National ID Card',
  international_passport: 'International Passport'
};

const DOC_TYPES = Object.entries(DOC_LABELS);

const TABS = ['Profile', 'Verification', 'House', 'Guarantors'];

// ─── Sub-components ───────────────────────────────────────────────────────────

function Section({ title, children, action }) {
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold text-gray-800">{title}</h3>
        {action}
      </div>
      {children}
    </div>
  );
}

// Verification tab — progress summary + link to full wizard
function VerificationTab({ worker, guarantors }) {
  const checks = [
    { label: 'Passport Photo',      done: !!worker.passportPhoto?.url },
    { label: 'Signature',           done: !!worker.signature?.url },
    { label: 'Address Pinned',      done: !!worker.addressLocation?.coordinates?.lat },
    { label: 'Verification Docs',   done: (worker.verificationDocuments?.length || 0) > 0 },
    { label: 'Guarantor 1',         done: guarantors.length >= 1 },
    { label: 'Guarantor 2',         done: guarantors.length >= 2 },
    { label: 'House Photos',        done: (worker.houseVerification?.photos?.length || 0) > 0 }
  ];
  const doneCount = checks.filter(c => c.done).length;
  const pct       = Math.round((doneCount / checks.length) * 100);

  return (
    <div className="space-y-4">
      {/* Overall status */}
      <div className="flex items-center justify-between">
        <VerificationBadge status={worker.verificationStatus} />
        <Link to={`/workers/${worker._id}/verify`}
          className="btn-primary">
          {doneCount === 0 ? 'Start Verification' : 'Continue Verification'}
          <ArrowRight size={15} />
        </Link>
      </div>

      {/* Progress bar */}
      <div>
        <div className="flex justify-between text-xs text-gray-500 mb-1">
          <span>{doneCount} of {checks.length} sections complete</span>
          <span className="font-medium text-brand-600">{pct}%</span>
        </div>
        <div className="w-full bg-gray-100 rounded-full h-2">
          <div className="bg-brand-500 h-2 rounded-full transition-all" style={{ width: `${pct}%` }} />
        </div>
      </div>

      {/* Checklist grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        {checks.map(({ label, done }) => (
          <div key={label}
            className={`flex items-center gap-2.5 p-2.5 rounded-xl border text-sm
              ${done ? 'bg-green-50 border-green-200 text-green-800' : 'bg-amber-50 border-amber-200 text-amber-800'}`}>
            {done
              ? <CheckCircle size={14} className="text-green-600 shrink-0" />
              : <AlertCircle size={14} className="text-amber-500 shrink-0" />
            }
            {label}
          </div>
        ))}
      </div>

      {/* Docs quick view */}
      {worker.verificationDocuments?.length > 0 && (
        <div className="card p-4">
          <p className="text-sm font-medium text-gray-700 mb-2">
            Uploaded Documents ({worker.verificationDocuments.length})
          </p>
          <div className="space-y-1.5">
            {worker.verificationDocuments.map(doc => (
              <div key={doc._id} className="flex items-center gap-2 text-sm text-gray-600">
                <FileText size={13} className="text-brand-500 shrink-0" />
                {DOC_LABELS[doc.type] || doc.type}
                {doc.file?.url && (
                  <a href={doc.file.url} target="_blank" rel="noopener noreferrer"
                    className="ml-auto text-brand-600 hover:underline text-xs flex items-center gap-0.5">
                    <Eye size={11} /> View
                  </a>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// KEEP the old unused helper to avoid breaking compile — repurposed section
function _OldVerificationSection_unused({ worker, onRefresh }) {
  // This function is intentionally empty — replaced by the wizard-based tab above
  return (
    <div className="space-y-5">
      {/* Documents list — REPLACED BY VERIFICATION MODULE */}
      <Section
        title={`Documents (${worker.verificationDocuments?.length || 0})`}
        action={null}
      >
        {false && (
          <form className="border border-brand-200 bg-brand-50 rounded-xl p-4 space-y-3">
            <div />
          </form>
        )}
      </Section>
    </div>
  );
}

// House tab
function HouseTab({ worker, onRefresh }) {
  const notify = useNotify();
  const [editing, setEditing]     = useState(false);
  const [coords, setCoords]       = useState(worker.houseVerification?.coordinates || null);
  const [address, setAddress]     = useState(worker.houseVerification?.address || '');
  const [notes, setNotes]         = useState(worker.houseVerification?.notes || '');
  const [photos, setPhotos]       = useState([]);
  const [saving, setSaving]       = useState(false);
  const photoInputRef             = useRef(null);

  const save = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      const fd = new FormData();
      if (coords) { fd.append('lat', coords.lat); fd.append('lng', coords.lng); }
      if (address) fd.append('address', address);
      if (notes)   fd.append('notes', notes);
      photos.forEach(f => fd.append('photos', f));
      await api.put(`/workers/${worker._id}/house`, fd, { headers: { 'Content-Type': 'multipart/form-data' } });
      notify('House location saved');
      setEditing(false);
      setPhotos([]);
      onRefresh();
    } catch (err) {
      notify(err.response?.data?.message || 'Failed to save', 'error');
    } finally {
      setSaving(false);
    }
  };

  const hv = worker.houseVerification;

  return (
    <div className="space-y-5">
      {!editing ? (
        <>
          <div className="flex items-center justify-between">
            <h3 className="font-semibold text-gray-800">House Verification</h3>
            <button onClick={() => setEditing(true)} className="btn-primary">
              <Edit2 size={14} />{hv ? 'Edit' : 'Add Location'}
            </button>
          </div>

          {!hv ? (
            <div className="text-center py-10 bg-gray-50 rounded-xl border border-dashed border-gray-200">
              <MapPin size={32} className="text-gray-300 mx-auto mb-2" />
              <p className="text-sm text-gray-500">No house location saved yet</p>
            </div>
          ) : (
            <div className="space-y-4">
              {hv.coordinates && (
                <div className="rounded-xl overflow-hidden border border-gray-200">
                  <iframe
                    title="House location"
                    width="100%"
                    height="280"
                    loading="lazy"
                    style={{ border: 0 }}
                    src={`https://maps.google.com/maps?q=${hv.coordinates.lat},${hv.coordinates.lng}&z=16&output=embed`}
                  />
                  <p className="text-xs text-center text-brand-600 py-2 bg-brand-50 font-medium">
                    📍 {hv.coordinates.lat.toFixed(6)}, {hv.coordinates.lng.toFixed(6)}
                  </p>
                </div>
              )}
              {hv.address && (
                <div className="flex items-start gap-2 text-sm text-gray-700">
                  <Home size={15} className="text-gray-400 mt-0.5 shrink-0" />
                  {hv.address}
                </div>
              )}
              {hv.notes && (
                <p className="text-sm text-gray-500 italic">{hv.notes}</p>
              )}
              {hv.photos?.length > 0 && (
                <div>
                  <p className="text-sm font-medium text-gray-700 mb-2">House Photos</p>
                  <div className="grid grid-cols-3 gap-2">
                    {hv.photos.map((p, i) => (
                      <a key={i} href={p.url} target="_blank" rel="noopener noreferrer">
                        <img src={p.url} alt="" className="w-full h-24 object-cover rounded-lg border border-gray-200 hover:opacity-80 transition-opacity" />
                      </a>
                    ))}
                  </div>
                </div>
              )}
              {hv.verifiedBy && (
                <p className="text-xs text-gray-400">
                  Verified by {hv.verifiedBy.name} on {new Date(hv.verifiedAt).toLocaleDateString('en-NG')}
                </p>
              )}
            </div>
          )}
        </>
      ) : (
        <form onSubmit={save} className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="font-semibold text-gray-800">Pin House Location</h3>
            <button type="button" onClick={() => setEditing(false)} className="text-gray-400 hover:text-gray-600">
              <X size={18} />
            </button>
          </div>
          <MapPicker value={coords} onChange={setCoords} />
          <div>
            <label className="label">Street Address</label>
            <input className="input" placeholder="House number, street, area, state"
              value={address} onChange={e => setAddress(e.target.value)} />
          </div>
          <div>
            <label className="label">Notes (optional)</label>
            <textarea className="input resize-none" rows={2} placeholder="Landmarks, directions…"
              value={notes} onChange={e => setNotes(e.target.value)} />
          </div>
          <div>
            <label className="label">Upload House Photos</label>
            <div
              onClick={() => photoInputRef.current?.click()}
              className="flex items-center justify-center gap-2 p-4 border-2 border-dashed border-gray-300 rounded-xl cursor-pointer hover:border-brand-400 hover:bg-gray-50 transition-colors"
            >
              <Plus size={18} className="text-gray-400" />
              <span className="text-sm text-gray-500">Add photos (up to 5)</span>
            </div>
            <input ref={photoInputRef} type="file" accept="image/*" multiple className="hidden"
              onChange={e => setPhotos(Array.from(e.target.files).slice(0, 5))} />
            {photos.length > 0 && (
              <div className="flex gap-2 mt-2 flex-wrap">
                {photos.map((f, i) => (
                  <div key={i} className="relative">
                    <img src={URL.createObjectURL(f)} className="w-16 h-16 object-cover rounded-lg" alt="" />
                    <button type="button" onClick={() => setPhotos(p => p.filter((_, j) => j !== i))}
                      className="absolute -top-1.5 -right-1.5 bg-red-500 text-white rounded-full p-0.5">
                      <X size={10} />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
          <div className="flex gap-3">
            <button type="submit" disabled={saving} className="btn-primary">
              {saving ? 'Saving…' : <><CheckCircle size={14} /> Save Location</>}
            </button>
            <button type="button" onClick={() => setEditing(false)} className="btn-secondary">Cancel</button>
          </div>
        </form>
      )}
    </div>
  );
}

// Guarantors tab
function GuarantorsTab({ worker, guarantors, onRefresh }) {
  const notify   = useNotify();
  const navigate = useNavigate();
  const [expanded, setExpanded] = useState(null);

  const deleteGuarantor = async (gid) => {
    if (!confirm('Delete this guarantor?')) return;
    try {
      await api.delete(`/workers/${worker._id}/guarantors/${gid}`);
      notify('Guarantor removed');
      onRefresh();
    } catch {
      notify('Failed to delete guarantor', 'error');
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold text-gray-800">
          Guarantors ({guarantors.length}/2)
        </h3>
        {guarantors.length < 2 && (
          <Link to={`/workers/${worker._id}/guarantors/new`} className="btn-primary">
            <Plus size={14} /> Add Guarantor
          </Link>
        )}
      </div>

      {guarantors.length === 0 ? (
        <div className="text-center py-10 bg-gray-50 rounded-xl border border-dashed border-gray-200">
          <Users size={32} className="text-gray-300 mx-auto mb-2" />
          <p className="text-sm text-gray-500">No guarantors added yet</p>
          <Link to={`/workers/${worker._id}/guarantors/new`} className="btn-primary mt-3 inline-flex">
            <Plus size={14} /> Add Guarantor
          </Link>
        </div>
      ) : (
        guarantors.map((g, idx) => (
          <div key={g._id} className="card overflow-hidden">
            <div
              onClick={() => setExpanded(expanded === g._id ? null : g._id)}
              className="flex items-center gap-3 px-4 py-3.5 cursor-pointer hover:bg-gray-50 transition-colors"
            >
              {g.passportPhoto?.url
                ? <img src={g.passportPhoto.url} className="w-10 h-10 rounded-full object-cover border border-gray-200 shrink-0" alt="" />
                : <div className="w-10 h-10 rounded-full bg-purple-100 text-purple-700 flex items-center justify-center font-semibold shrink-0">
                    {g.fullName[0]}
                  </div>
              }
              <div className="flex-1 min-w-0">
                <p className="font-medium text-gray-900 text-sm">{g.fullName}</p>
                <p className="text-xs text-gray-500">{g.relationship} · {g.phone}</p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <Link
                  to={`/workers/${worker._id}/guarantors/${g._id}/edit`}
                  onClick={e => e.stopPropagation()}
                  className="p-1.5 text-gray-400 hover:text-brand-600 hover:bg-brand-50 rounded-lg"
                >
                  <Edit2 size={14} />
                </Link>
                <button onClick={(e) => { e.stopPropagation(); deleteGuarantor(g._id); }}
                  className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg">
                  <Trash2 size={14} />
                </button>
              </div>
            </div>

            {/* Expanded details */}
            {expanded === g._id && (
              <div className="border-t border-gray-100 px-4 py-4 bg-gray-50 space-y-3 text-sm">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <p className="text-xs text-gray-400 mb-0.5">Address</p>
                    <p className="text-gray-700">{g.address}</p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-400 mb-0.5">Relationship</p>
                    <p className="text-gray-700">{g.relationship}</p>
                  </div>
                </div>

                {g.idDocument?.type && (
                  <div>
                    <p className="text-xs text-gray-400 mb-0.5">ID Document</p>
                    <p className="text-gray-700">{DOC_LABELS[g.idDocument.type] || g.idDocument.type}
                      {g.idDocument.documentNumber && ` — ${g.idDocument.documentNumber}`}
                    </p>
                    {g.idDocument.file?.url && (
                      <a href={g.idDocument.file.url} target="_blank" rel="noopener noreferrer"
                        className="text-brand-600 text-xs hover:underline flex items-center gap-1 mt-1">
                        <Eye size={12} /> View Document
                      </a>
                    )}
                  </div>
                )}

                {g.houseLocation?.coordinates && (
                  <div>
                    <p className="text-xs text-gray-400 mb-1">House Location</p>
                    <iframe
                      title="Guarantor house"
                      width="100%"
                      height="200"
                      loading="lazy"
                      style={{ border: 0, borderRadius: 8 }}
                      src={`https://maps.google.com/maps?q=${g.houseLocation.coordinates.lat},${g.houseLocation.coordinates.lng}&z=15&output=embed`}
                    />
                    {g.houseLocation.address && (
                      <p className="text-xs text-gray-500 mt-1">{g.houseLocation.address}</p>
                    )}
                  </div>
                )}

                {g.houseLocation?.photos?.length > 0 && (
                  <div>
                    <p className="text-xs text-gray-400 mb-1">House Photos</p>
                    <div className="flex gap-2 flex-wrap">
                      {g.houseLocation.photos.map((p, i) => (
                        <a key={i} href={p.url} target="_blank" rel="noopener noreferrer">
                          <img src={p.url} alt="" className="w-16 h-16 object-cover rounded-lg border border-gray-200" />
                        </a>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        ))
      )}
    </div>
  );
}

// ─── Main WorkerDetail ────────────────────────────────────────────────────────
export default function WorkerDetail() {
  const { id }     = useParams();
  const navigate   = useNavigate();
  const notify     = useNotify();

  const [worker, setWorker]         = useState(null);
  const [guarantors, setGuarantors] = useState([]);
  const [loading, setLoading]       = useState(true);
  const [tab, setTab]               = useState('Profile');
  const [deleting, setDeleting]     = useState(false);

  const load = async () => {
    try {
      const [w, g] = await Promise.all([
        api.get(`/workers/${id}`),
        api.get(`/workers/${id}/guarantors`)
      ]);
      setWorker(w.data.data);
      setGuarantors(g.data.data);
    } catch {
      notify('Worker not found', 'error');
      navigate('/workers');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [id]);

  const handleDelete = async () => {
    if (!confirm(`Delete ${worker.fullName}? This cannot be undone.`)) return;
    setDeleting(true);
    try {
      await api.delete(`/workers/${id}`);
      notify('Worker deleted');
      navigate('/workers');
    } catch {
      notify('Failed to delete worker', 'error');
      setDeleting(false);
    }
  };

  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-brand-600" />
    </div>
  );

  if (!worker) return null;

  return (
    <div className="max-w-3xl mx-auto space-y-5">
      {/* Back */}
      <Link to="/workers" className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700">
        <ChevronLeft size={16} /> Back to Workers
      </Link>

      {/* Profile header */}
      <div className="card px-5 py-5">
        <div className="flex items-start gap-4">
          {worker.passportPhoto?.url
            ? <img src={worker.passportPhoto.url} className="w-20 h-20 rounded-2xl object-cover border-2 border-gray-100 shrink-0" alt="" />
            : <div className="w-20 h-20 rounded-2xl bg-brand-100 text-brand-700 flex items-center justify-center text-3xl font-bold shrink-0">
                {worker.fullName[0]}
              </div>
          }
          <div className="flex-1 min-w-0">
            <div className="flex items-start justify-between gap-2 flex-wrap">
              <div>
                <h1 className="text-xl font-bold text-gray-900">{worker.fullName}</h1>
                <p className="text-sm text-gray-500 mt-0.5">{worker.role} — {worker.branch}</p>
              </div>
              <VerificationBadge status={worker.verificationStatus} />
            </div>
            <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm text-gray-500">
              <span className="flex items-center gap-1.5"><Phone size={13} />{worker.phone}</span>
              <span className="flex items-center gap-1.5"><Home size={13} />{worker.address}</span>
            </div>
          </div>
        </div>
        <div className="flex gap-2 mt-4 pt-4 border-t border-gray-100">
          <Link to={`/workers/${id}/edit`} className="btn-secondary">
            <Edit2 size={14} /> Edit
          </Link>
          <button onClick={handleDelete} disabled={deleting} className="btn-danger">
            {deleting ? <span className="animate-spin h-4 w-4 border-2 border-white border-t-transparent rounded-full" /> : <><Trash2 size={14} /> Delete</>}
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="card overflow-hidden">
        <div className="flex border-b border-gray-100 overflow-x-auto">
          {TABS.map(t => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`px-5 py-3.5 text-sm whitespace-nowrap transition-colors ${
                tab === t ? 'tab-active' : 'tab-inactive'
              }`}
            >
              {t === 'Guarantors' ? `Guarantors (${guarantors.length})` : t}
            </button>
          ))}
        </div>

        <div className="p-5">
          {tab === 'Profile' && (
            <div className="space-y-3">
              {[
                ['Full Name',    worker.fullName],
                ['Phone',        worker.phone],
                ['Address',      worker.address],
                ['Branch',       worker.branch],
                ['Role',         worker.role],
                ['Registered',   new Date(worker.createdAt).toLocaleDateString('en-NG', { day: 'numeric', month: 'long', year: 'numeric' })],
                ['Added By',     worker.addedBy?.name || '—']
              ].map(([label, value]) => (
                <div key={label} className="flex gap-3 py-2 border-b border-gray-50 last:border-0">
                  <span className="text-sm text-gray-400 w-28 shrink-0">{label}</span>
                  <span className="text-sm text-gray-800 font-medium">{value}</span>
                </div>
              ))}
            </div>
          )}

          {tab === 'Verification' && (
            <VerificationTab worker={worker} guarantors={guarantors} />
          )}

          {tab === 'House' && (
            <HouseTab worker={worker} onRefresh={load} />
          )}

          {tab === 'Guarantors' && (
            <GuarantorsTab worker={worker} guarantors={guarantors} onRefresh={load} />
          )}
        </div>
      </div>
    </div>
  );
}
