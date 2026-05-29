import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import {
  Printer, Share2, ArrowLeft, CheckCircle, XCircle, AlertCircle,
  Phone, MapPin, Briefcase, Building2, Clock, User, FileText,
  BadgeCheck, Calendar, Wallet, Landmark, Users
} from 'lucide-react';
import api from '../utils/api';
import { useAuth } from '../context/AuthContext';

// ─── Label maps ───────────────────────────────────────────────────────────────
const DOC_LABELS = {
  nin:                    'NIN (National ID Number)',
  voter_card:             "Voter's Card",
  drivers_license:        "Driver's License",
  national_id:            'National ID Card',
  international_passport: 'International Passport',
};

const STATUS_LABELS = {
  registered:  { label: 'Registered',  color: '#6B7280' },
  active:      { label: 'Active',      color: '#16A34A' },
  suspended:   { label: 'Suspended',   color: '#D97706' },
  sacked:      { label: 'Dismissed',   color: '#DC2626' },
  inactive:    { label: 'Inactive',    color: '#9CA3AF' },
};

const VER_LABELS = {
  pending_verification: 'Pending',
  partially_verified:   'Partial',
  pending_approval:     'Awaiting Approval',
  verified:             'Verified ✓',
  rejected:             'Rejected',
  fully_verified:       'Verified',
};

function fmt(d) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('en-NG', { day: 'numeric', month: 'long', year: 'numeric' });
}

// ─── Row component ────────────────────────────────────────────────────────────
function Row({ label, value }) {
  if (!value) return null;
  return (
    <tr>
      <td className="py-1.5 pr-4 text-xs font-semibold text-gray-500 uppercase tracking-wide whitespace-nowrap w-36 align-top">
        {label}
      </td>
      <td className="py-1.5 text-sm text-gray-800 align-top">{value}</td>
    </tr>
  );
}

// ─── Section heading ──────────────────────────────────────────────────────────
function Section({ title, icon: Icon, children }) {
  return (
    <div className="mb-5">
      <div className="flex items-center gap-2 mb-2 pb-1.5 border-b-2 border-gray-800">
        <Icon size={14} className="text-gray-700" />
        <h3 className="text-sm font-bold uppercase tracking-widest text-gray-700">{title}</h3>
      </div>
      {children}
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────
export default function WorkerPrint() {
  const { id }  = useParams();
  const { user } = useAuth();
  const [worker,     setWorker    ] = useState(null);
  const [guarantors, setGuarantors] = useState([]);
  const [loading,    setLoading   ] = useState(true);
  const [error,      setError     ] = useState(null);

  useEffect(() => {
    Promise.all([
      api.get(`/workers/${id}`),
      api.get(`/workers/${id}/guarantors`).catch(() => ({ data: { data: [] } }))
    ]).then(([w, g]) => {
      setWorker(w.data.data);
      setGuarantors(g.data.data || []);
    }).catch(() => setError('Failed to load worker'))
      .finally(() => setLoading(false));
  }, [id]);

  const handlePrint = () => window.print();

  const handleWhatsApp = () => {
    if (!worker) return;
    const emp  = STATUS_LABELS[worker.employmentStatus]?.label || worker.employmentStatus || 'Registered';
    const ver  = VER_LABELS[worker.verificationStatus]  || worker.verificationStatus || '—';
    const lines = [
      `👤 *Worker Profile*`,
      `━━━━━━━━━━━━━━━━━━━━`,
      `*Name:*  ${worker.fullName}`,
      `*Phone:* ${worker.phone}`,
      worker.address ? `*Address:* ${worker.addressLocation?.formatted || worker.address}` : null,
      ``,
      `*Employment Status:* ${emp}`,
      worker.branchId?.name || worker.branch ? `*Branch:* ${worker.branchId?.name || worker.branch}` : null,
      worker.role           ? `*Role:*   ${worker.role}`     : null,
      worker.shiftId?.name || worker.schedule
        ? `*Shift:*  ${worker.shiftId?.name || worker.schedule}` : null,
      ``,
      `*Verification:* ${ver}`,
      worker.verificationDocuments?.length
        ? `*Documents:* ${worker.verificationDocuments.map(d => DOC_LABELS[d.type] || d.type).join(', ')}` : null,
      guarantors.length
        ? `*Guarantors:* ${guarantors.map(g => g.fullName).join(', ')}` : null,
      ...guarantors.map((g, i) =>
        g.houseLocation?.coordinates?.lat
          ? `*Guarantor ${i+1} House GPS:* ${g.houseLocation.coordinates.lat.toFixed(6)}, ${g.houseLocation.coordinates.lng.toFixed(6)}`
          : null
      ),
      ``,
      `━━━━━━━━━━━━━━━━━━━━`,
      `_${user?.company?.name || 'HR Management System'}_`,
      `_Printed: ${new Date().toLocaleString('en-NG')}_`
    ].filter(l => l !== null).join('\n');

    window.open(`https://wa.me/?text=${encodeURIComponent(lines)}`, '_blank');
  };

  // ─── Loading / error states ───────────────────────────────────────────────
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-white">
        <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-brand-600" />
      </div>
    );
  }
  if (error || !worker) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-3">
        <p className="text-gray-500">{error || 'Worker not found'}</p>
        <Link to="/workers" className="btn-secondary text-sm">← Back to Workers</Link>
      </div>
    );
  }

  const companyName = user?.company?.name || 'HR Management System';
  const today       = new Date().toLocaleDateString('en-NG', { day: 'numeric', month: 'long', year: 'numeric' });
  const emp         = STATUS_LABELS[worker.employmentStatus] || STATUS_LABELS.registered;
  const verLabel    = VER_LABELS[worker.verificationStatus]  || worker.verificationStatus;

  return (
    <>
      {/* ── Action bar (hidden when printing) ─────────────────────────────── */}
      <div className="no-print fixed top-0 left-0 right-0 z-50 bg-white border-b border-gray-200 shadow-sm">
        <div className="max-w-3xl mx-auto flex items-center gap-3 px-4 py-2.5">
          <Link to={`/workers/${id}`}
            className="flex items-center gap-1.5 text-sm text-gray-600 hover:text-gray-900 font-medium transition-colors">
            <ArrowLeft size={14} /> Worker Profile
          </Link>
          <div className="flex-1" />
          <span className="text-xs text-gray-400 hidden sm:block">
            {worker.fullName}
          </span>
          <button
            onClick={handleWhatsApp}
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-green-500 text-white text-sm font-medium hover:bg-green-600 transition-colors">
            <Share2 size={14} /> WhatsApp
          </button>
          <button
            onClick={handlePrint}
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-brand-600 text-white text-sm font-medium hover:bg-brand-700 transition-colors">
            <Printer size={14} /> Print / PDF
          </button>
        </div>
      </div>

      {/* ── Printable document ────────────────────────────────────────────── */}
      <div className="print-page pt-[52px] no-print-pad">
        <div className="max-w-[720px] mx-auto bg-white p-8 print:p-0">

          {/* ── Document Header ── */}
          <div className="flex items-start justify-between mb-6 pb-4 border-b-2 border-gray-900">
            <div>
              <h1 className="text-2xl font-black text-gray-900 tracking-tight">{companyName}</h1>
              <p className="text-sm text-gray-500 mt-0.5">Worker Profile Document</p>
            </div>
            <div className="text-right">
              <p className="text-xs text-gray-400">Date Printed</p>
              <p className="text-sm font-medium text-gray-700">{today}</p>
              <p className="text-xs text-gray-400 mt-1">Ref: {worker._id?.slice(-8).toUpperCase()}</p>
            </div>
          </div>

          {/* ── Photo + Name + Badges ── */}
          <div className="flex items-start gap-5 mb-6">
            {/* Photo */}
            <div className="shrink-0">
              {worker.passportPhoto?.url
                ? <img src={worker.passportPhoto.url}
                    className="w-24 h-24 rounded-xl object-cover border-2 border-gray-200 print:w-20 print:h-20"
                    alt={worker.fullName} />
                : <div className="w-24 h-24 rounded-xl bg-gray-100 border-2 border-gray-200 flex items-center justify-center">
                    <User size={32} className="text-gray-300" />
                  </div>
              }
              {/* Signature below photo */}
              {worker.signature?.url && (
                <div className="mt-2 text-center">
                  <img src={worker.signature.url}
                    className="h-10 mx-auto object-contain border border-gray-200 rounded p-1 bg-white"
                    alt="Signature" />
                  <p className="text-xs text-gray-400 mt-0.5">Signature</p>
                </div>
              )}
            </div>

            {/* Name + key info */}
            <div className="flex-1 min-w-0">
              <h2 className="text-2xl font-bold text-gray-900">{worker.fullName}</h2>
              <p className="text-base text-gray-600 mt-0.5">{worker.role}</p>

              <div className="flex flex-wrap gap-2 mt-2">
                {/* Employment badge */}
                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold border"
                  style={{ color: emp.color, borderColor: emp.color, backgroundColor: `${emp.color}18` }}>
                  <span className="w-1.5 h-1.5 rounded-full inline-block" style={{ backgroundColor: emp.color }} />
                  {emp.label}
                </span>
                {/* Verification badge */}
                <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold border
                  ${worker.verificationStatus === 'verified' || worker.verificationStatus === 'fully_verified'
                    ? 'bg-green-50 border-green-300 text-green-700'
                    : worker.verificationStatus === 'rejected'
                    ? 'bg-red-50 border-red-300 text-red-700'
                    : worker.verificationStatus === 'pending_approval'
                    ? 'bg-purple-50 border-purple-300 text-purple-700'
                    : 'bg-gray-50 border-gray-300 text-gray-600'
                  }`}>
                  <BadgeCheck size={11} />
                  {verLabel}
                </span>
              </div>

              {/* Quick info row */}
              <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-sm text-gray-600">
                <span className="flex items-center gap-1.5">
                  <Phone size={12} className="text-gray-400" /> {worker.phone}
                </span>
                {(worker.branchId?.name || worker.branch) && (
                  <span className="flex items-center gap-1.5">
                    <Building2 size={12} className="text-gray-400" /> {worker.branchId?.name || worker.branch}
                  </span>
                )}
                {(worker.shiftId?.name || worker.schedule) && (
                  <span className="flex items-center gap-1.5">
                    <Clock size={12} className="text-gray-400" />
                    {worker.shiftId?.name || worker.schedule}
                    {worker.shiftId?.startTime && worker.shiftId?.endTime &&
                      ` (${worker.shiftId.startTime}–${worker.shiftId.endTime})`}
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* ── Personal Information ── */}
          <Section title="Personal Information" icon={User}>
            <table className="w-full">
              <tbody>
                <Row label="Full Name"   value={worker.fullName} />
                <Row label="Phone"       value={worker.phone} />
                <Row label="Google Address"   value={worker.addressLocation?.formatted || worker.address} />
                {worker.addressLocation?.workerAddress && (
                  <Row label="Worker's Address" value={worker.addressLocation.workerAddress} />
                )}
                {worker.addressLocation?.landmark && (
                  <Row label="Landmark"     value={worker.addressLocation.landmark} />
                )}
                {worker.addressLocation?.plusCode && (
                  <Row label="Plus Code"    value={worker.addressLocation.plusCode} />
                )}
                {worker.addressLocation?.coordinates?.lat && (
                  <Row label="Coordinates"
                    value={`${worker.addressLocation.coordinates.lat.toFixed(6)}, ${worker.addressLocation.coordinates.lng.toFixed(6)}`} />
                )}
                <Row label="Registered"  value={fmt(worker.createdAt)} />
                {worker.addedBy?.name && <Row label="Added By" value={worker.addedBy.name} />}
              </tbody>
            </table>
          </Section>

          {/* ── Employment Information ── */}
          <Section title="Employment" icon={Briefcase}>
            <table className="w-full">
              <tbody>
                <Row label="Status"     value={emp.label} />
                <Row label="Branch"     value={worker.branchId?.name || worker.branch || '—'} />
                <Row label="Role"       value={worker.role} />
                <Row label="Shift"
                  value={
                    worker.shiftId?.name
                      ? `${worker.shiftId.name}${worker.shiftId.startTime && worker.shiftId.endTime
                          ? ` (${worker.shiftId.startTime}–${worker.shiftId.endTime})` : ''}`
                      : worker.schedule || '—'
                  }
                />
                {worker.activatedAt && <Row label="Activated"  value={fmt(worker.activatedAt)} />}
                {worker.activatedBy?.name && <Row label="Activated By" value={worker.activatedBy.name} />}
                {worker.employmentStatus === 'suspended' && worker.suspensionReason && (
                  <Row label="Suspension Reason" value={worker.suspensionReason} />
                )}
                {worker.employmentStatus === 'sacked' && worker.sackReason && (
                  <Row label="Dismissal Reason" value={worker.sackReason} />
                )}
              </tbody>
            </table>
          </Section>

          {/* ── Salary & Bank (only if data exists) ── */}
          {(worker.salary?.monthly > 0 || worker.bankDetails?.bankName) && (
            <Section title="Salary & Bank Details" icon={Wallet}>
              <table className="w-full">
                <tbody>
                  {worker.salary?.monthly > 0 && (
                    <Row label="Monthly Salary"
                      value={`₦${Number(worker.salary.monthly).toLocaleString('en-NG')}`} />
                  )}
                  {worker.bankDetails?.bankName && (
                    <Row label="Bank" value={worker.bankDetails.bankName} />
                  )}
                  {worker.bankDetails?.accountNumber && (
                    <Row label="Account No." value={worker.bankDetails.accountNumber} />
                  )}
                  {worker.bankDetails?.accountName && (
                    <Row label="Account Name" value={worker.bankDetails.accountName} />
                  )}
                </tbody>
              </table>
            </Section>
          )}

          {/* ── Verification ── */}
          <Section title="Verification" icon={BadgeCheck}>
            <table className="w-full">
              <tbody>
                <Row label="Status" value={verLabel} />
                {worker.approvedBy?.name && <Row label="Approved By"  value={worker.approvedBy.name} />}
                {worker.approvedAt       && <Row label="Approved On"  value={fmt(worker.approvedAt)} />}
                {worker.rejectionReason  && <Row label="Rejection Reason" value={worker.rejectionReason} />}
              </tbody>
            </table>

            {worker.verificationDocuments?.length > 0 && (
              <div className="mt-2">
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">Documents Submitted</p>
                <div className="grid grid-cols-2 gap-1.5">
                  {worker.verificationDocuments.map((doc) => (
                    <div key={doc._id}
                      className="flex items-center gap-2 text-sm text-gray-700 bg-green-50 border border-green-200 rounded-lg px-3 py-1.5">
                      <CheckCircle size={12} className="text-green-600 shrink-0" />
                      <span className="truncate">{DOC_LABELS[doc.type] || doc.type}</span>
                      {doc.documentNumber && (
                        <span className="text-xs text-gray-400 shrink-0 ml-auto">{doc.documentNumber}</span>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </Section>

          {/* ── House Verification ── */}
          {(worker.houseVerification?.address || worker.houseVerification?.coordinates?.lat) && (
            <Section title="House / Residence" icon={MapPin}>
              <table className="w-full">
                <tbody>
                  <Row label="Address"
                    value={worker.houseVerification.formattedAddress || worker.houseVerification.address} />
                  {worker.houseVerification.coordinates?.lat && (
                    <Row label="Coordinates"
                      value={`${worker.houseVerification.coordinates.lat.toFixed(6)}, ${worker.houseVerification.coordinates.lng.toFixed(6)}`} />
                  )}
                  {worker.houseVerification.notes && (
                    <Row label="Notes" value={worker.houseVerification.notes} />
                  )}
                  {worker.houseVerification.photos?.length > 0 && (
                    <Row label="Photos" value={`${worker.houseVerification.photos.length} photo(s) on file`} />
                  )}
                </tbody>
              </table>
              {/* House photos grid */}
              {worker.houseVerification.photos?.length > 0 && (
                <div className="flex flex-wrap gap-2 mt-2">
                  {worker.houseVerification.photos.map((p) => (
                    <img key={p._id} src={p.url}
                      className="w-20 h-20 object-cover rounded-lg border border-gray-200 print:w-16 print:h-16"
                      alt={p.photoType || 'house'} />
                  ))}
                </div>
              )}
            </Section>
          )}

          {/* ── Guarantors ── */}
          {guarantors.length > 0 && (
            <Section title={`Guarantors (${guarantors.length})`} icon={Users}>
              {guarantors.map((g, idx) => {
                // Map house photos by type for easy lookup
                const hpByType = {};
                (g.houseLocation?.photos || []).forEach(p => { hpByType[p.photoType] = p; });
                const houseFront = hpByType.house_front;
                const streetView = hpByType.street_view;
                const envPhoto   = hpByType.environment;
                const otherPhotos = (g.houseLocation?.photos || []).filter(
                  p => !['house_front','street_view','environment'].includes(p.photoType)
                );

                return (
                  <div key={g._id} className={`p-3 rounded-xl border border-gray-200 ${idx > 0 ? 'mt-3' : ''}`}>
                    {/* Header: photo + name */}
                    <div className="flex items-start gap-3">
                      {g.passportPhoto?.url
                        ? <img src={g.passportPhoto.url}
                            className="w-14 h-14 rounded-lg object-cover border border-gray-200 shrink-0"
                            alt={g.fullName} />
                        : <div className="w-14 h-14 rounded-lg bg-purple-100 text-purple-700 flex items-center justify-center font-bold text-lg shrink-0">
                            {g.fullName[0]}
                          </div>
                      }
                      <div className="flex-1 min-w-0">
                        <p className="font-semibold text-gray-900">{g.fullName}</p>
                        <p className="text-sm text-gray-500">{g.relationship}</p>
                      </div>
                    </div>

                    {/* Details */}
                    <table className="w-full mt-2">
                      <tbody>
                        <Row label="Phone"   value={g.phone} />
                        <Row label="Address" value={g.address} />
                        {g.occupation && <Row label="Occupation" value={g.occupation} />}
                        {g.bankDetails?.bankName     && <Row label="Bank"     value={g.bankDetails.bankName} />}
                        {g.bankDetails?.accountNumber && <Row label="Acct No." value={g.bankDetails.accountNumber} />}
                      </tbody>
                    </table>

                    {/* House location */}
                    {(g.houseLocation?.address || g.houseLocation?.coordinates?.lat) && (
                      <div className="mt-2 pt-2 border-t border-gray-100">
                        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">House Location</p>
                        <table className="w-full">
                          <tbody>
                            {(g.houseLocation.formattedAddress || g.houseLocation.address) && (
                              <Row label="Address"
                                value={g.houseLocation.formattedAddress || g.houseLocation.address} />
                            )}
                            {g.houseLocation.coordinates?.lat && (
                              <Row label="GPS / Lat-Long"
                                value={`${g.houseLocation.coordinates.lat.toFixed(6)}, ${g.houseLocation.coordinates.lng.toFixed(6)}`} />
                            )}
                          </tbody>
                        </table>

                        {/* House photos: front, street, environment */}
                        {(houseFront || streetView || envPhoto || otherPhotos.length > 0) && (
                          <div className="grid grid-cols-3 gap-2 mt-2">
                            {houseFront && (
                              <div>
                                <img src={houseFront.url}
                                  className="w-full h-24 object-cover rounded-lg border border-gray-200"
                                  alt="House Front" />
                                <p className="text-xs text-center text-gray-400 mt-0.5">House Front</p>
                              </div>
                            )}
                            {streetView && (
                              <div>
                                <img src={streetView.url}
                                  className="w-full h-24 object-cover rounded-lg border border-gray-200"
                                  alt="Street View" />
                                <p className="text-xs text-center text-gray-400 mt-0.5">Street View</p>
                              </div>
                            )}
                            {envPhoto && (
                              <div>
                                <img src={envPhoto.url}
                                  className="w-full h-24 object-cover rounded-lg border border-gray-200"
                                  alt="Environment" />
                                <p className="text-xs text-center text-gray-400 mt-0.5">Environment</p>
                              </div>
                            )}
                            {otherPhotos.map(p => (
                              <div key={p._id}>
                                <img src={p.url}
                                  className="w-full h-24 object-cover rounded-lg border border-gray-200"
                                  alt="House photo" />
                                <p className="text-xs text-center text-gray-400 mt-0.5 capitalize">
                                  {(p.photoType || 'photo').replace(/_/g, ' ')}
                                </p>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    )}

                    {/* Guarantor signature */}
                    {g.signature?.url && (
                      <div className="mt-2 flex items-center gap-3 pt-2 border-t border-gray-100">
                        <p className="text-xs text-gray-400 shrink-0">Guarantor Signature:</p>
                        <img src={g.signature.url}
                          className="h-10 object-contain border border-gray-200 rounded px-2 bg-white"
                          alt="signature" />
                      </div>
                    )}
                  </div>
                );
              })}
            </Section>
          )}

          {/* ── Footer ── */}
          <div className="mt-8 pt-4 border-t border-gray-300 flex items-end justify-between text-xs text-gray-400">
            <div>
              <p className="font-medium text-gray-600">{companyName}</p>
              <p className="mt-0.5">This document is auto-generated from the HR Management System.</p>
            </div>
            <div className="text-right">
              <p>Worker ID: {worker._id?.slice(-12).toUpperCase()}</p>
              <p className="mt-0.5">Generated: {today}</p>
            </div>
          </div>

          {/* Worker declaration / signature lines */}
          <div className="mt-8 grid grid-cols-2 gap-8">
            {/* Worker's own signature */}
            <div>
              {worker.signature?.url
                ? <>
                    <img src={worker.signature.url}
                      className="h-12 object-contain mb-1"
                      alt="Worker signature" />
                    <div className="border-b border-gray-400" />
                  </>
                : <div className="border-b border-gray-400 mb-0.5" style={{ height: '48px' }} />
              }
              <p className="text-xs text-gray-500 mt-1">Worker's Signature &amp; Date</p>
            </div>

            {/* Authorised signature + stamp */}
            <div>
              <div className="flex items-end gap-3 mb-0.5" style={{ minHeight: '48px' }}>
                {worker.authorisedSignature?.url
                  ? <img src={worker.authorisedSignature.url}
                      className="h-12 object-contain"
                      alt="Authorised signature" />
                  : <div className="flex-1 border-b border-gray-400 self-end" />
                }
                {worker.companyStamp?.url && (
                  <img src={worker.companyStamp.url}
                    className="h-14 w-14 object-contain opacity-80"
                    alt="Company stamp" />
                )}
              </div>
              {(worker.authorisedSignature?.url || worker.companyStamp?.url) && (
                <div className="border-b border-gray-400" />
              )}
              <p className="text-xs text-gray-500 mt-1">
                Authorised Signature &amp; Stamp
                {worker.authorisedSignature?.authorisedBy &&
                  <span className="ml-1 text-gray-400">({worker.authorisedSignature.authorisedBy})</span>
                }
              </p>
            </div>
          </div>

        </div>
      </div>

      {/* ── Print styles ─────────────────────────────────────────────────────── */}
      <style>{`
        @media print {
          .no-print { display: none !important; }
          .no-print-pad { padding-top: 0 !important; }
          body { margin: 0; }
          @page { margin: 12mm 14mm; size: A4 portrait; }
        }
      `}</style>
    </>
  );
}
