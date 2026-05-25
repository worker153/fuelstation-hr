import { useState, useEffect, useRef } from 'react';
import { useParams, Link } from 'react-router-dom';
import {
  UserCircle, MapPin, FileText, Users, Camera, CheckSquare,
  ChevronLeft, ChevronRight, Check, Upload, Eye, Trash2,
  Plus, X, Save, AlertCircle, ShieldCheck
} from 'lucide-react';
import api from '../utils/api';
import { useNotify } from '../context/NotificationContext';
import CameraCapture from '../components/CameraCapture';
import SignaturePad  from '../components/SignaturePad';
import AddressPicker from '../components/AddressPicker';
import FileUpload    from '../components/FileUpload';
import VerificationBadge from '../components/VerificationBadge';

// ─── Constants ────────────────────────────────────────────────────────────────
const DOC_LABELS = {
  nin:                    'NIN Slip (National ID Number)',
  voter_card:             "Voter's Card",
  drivers_license:        "Driver's License",
  national_id:            'National ID Card',
  international_passport: 'International Passport'
};

const HOUSE_PHOTO_TYPES = [
  { value: 'house_front', label: 'House Front' },
  { value: 'street_view', label: 'Street View' },
  { value: 'environment', label: 'Environment / Area' },
  { value: 'interior',    label: 'Interior' },
  { value: 'other',       label: 'Other' }
];

const RELATIONSHIPS = [
  'Spouse', 'Parent', 'Sibling', 'Child', 'Relative',
  'Friend', 'Colleague', 'Employer', 'Landlord', 'Other'
];

const STEPS = [
  { id: 'identity',   label: 'Worker',      shortLabel: '1', icon: UserCircle },
  { id: 'address',    label: 'Address',     shortLabel: '2', icon: MapPin },
  { id: 'documents',  label: 'Documents',   shortLabel: '3', icon: FileText },
  { id: 'guarantor1', label: 'Guarantor 1', shortLabel: '4', icon: Users },
  { id: 'guarantor2', label: 'Guarantor 2', shortLabel: '5', icon: Users },
  { id: 'photos',     label: 'House Photos',shortLabel: '6', icon: Camera },
  { id: 'summary',    label: 'Summary',     shortLabel: '7', icon: CheckSquare }
];

// ─── Shared SectionCard ──────────────────────────────────────────────────────
const SectionCard = ({ title, subtitle, children }) => (
  <div className="card p-5 sm:p-6 space-y-5">
    <div>
      <h3 className="font-semibold text-gray-900 text-lg">{title}</h3>
      {subtitle && <p className="text-sm text-gray-500 mt-0.5">{subtitle}</p>}
    </div>
    {children}
  </div>
);

const FieldRow = ({ label, children }) => (
  <div>
    <label className="label">{label}</label>
    {children}
  </div>
);

// ─── Step 1: Worker Identity ──────────────────────────────────────────────────
function WorkerIdentityStep({ worker, onUpdate, onNext, onPrev }) {
  const notify       = useNotify();
  const [photo,      setPhoto]      = useState(null);
  const [signature,  setSignature]  = useState(null);
  const [savingPhoto, setSavingPhoto] = useState(false);
  const [savingSig,  setSavingSig]  = useState(false);

  const savePhoto = async () => {
    if (!photo) return notify('Please capture or upload a photo', 'warning');
    setSavingPhoto(true);
    try {
      const fd = new FormData();
      fd.append('passportPhoto', photo);
      await api.put(`/workers/${worker._id}`, fd, { headers: { 'Content-Type': 'multipart/form-data' } });
      notify('Passport photo saved ✓');
      setPhoto(null);
      onUpdate();
    } catch { notify('Failed to save photo', 'error'); }
    finally { setSavingPhoto(false); }
  };

  const saveSignature = async () => {
    if (!signature?.file) return notify('Please draw or upload a signature', 'warning');
    setSavingSig(true);
    try {
      const fd = new FormData();
      fd.append('signature', signature.file);
      await api.post(`/workers/${worker._id}/signature`, fd, { headers: { 'Content-Type': 'multipart/form-data' } });
      notify('Signature saved ✓');
      setSignature(null);
      onUpdate();
    } catch { notify('Failed to save signature', 'error'); }
    finally { setSavingSig(false); }
  };

  return (
    <div className="space-y-4">
      <SectionCard title="Passport Photograph" subtitle="Clear face photo — camera or file upload">
        <CameraCapture
          preview={worker.passportPhoto?.url}
          onChange={setPhoto}
          onClear={() => setPhoto(null)}
          facingMode="user"
          square
        />
        {(photo || !worker.passportPhoto?.url) && (
          <button type="button" onClick={savePhoto} disabled={savingPhoto || !photo} className="btn-primary">
            {savingPhoto ? 'Saving…' : <><Save size={14} /> Save Photo</>}
          </button>
        )}
        {worker.passportPhoto?.url && !photo && (
          <p className="text-xs text-green-600 flex items-center gap-1"><Check size={12} /> Photo on file</p>
        )}
      </SectionCard>

      <SectionCard title="Worker Signature" subtitle="Draw on the pad or upload a signature image">
        <SignaturePad
          value={{ url: worker.signature?.url }}
          onChange={setSignature}
        />
        {(signature?.file || !worker.signature?.url) && (
          <button type="button" onClick={saveSignature} disabled={savingSig || !signature?.file} className="btn-primary">
            {savingSig ? 'Saving…' : <><Save size={14} /> Save Signature</>}
          </button>
        )}
        {worker.signature?.url && !signature?.file && (
          <p className="text-xs text-green-600 flex items-center gap-1"><Check size={12} /> Signature on file</p>
        )}
      </SectionCard>

      <StepNav onNext={onNext} nextLabel="Address →" />
    </div>
  );
}

// ─── Step 2: Address Verification ────────────────────────────────────────────
function AddressStep({ worker, onUpdate, onNext, onPrev }) {
  const notify = useNotify();
  const [location, setLocation] = useState(
    worker.addressLocation?.coordinates
      ? { formatted: worker.addressLocation.formatted, coordinates: worker.addressLocation.coordinates }
      : worker.address ? { formatted: worker.address, coordinates: null } : null
  );
  const [saving, setSaving] = useState(false);

  const save = async () => {
    if (!location?.formatted) return notify('Please enter or search an address', 'warning');
    setSaving(true);
    try {
      await api.put(`/workers/${worker._id}/address-location`, {
        formatted: location.formatted,
        lat: location.coordinates?.lat,
        lng: location.coordinates?.lng,
        address:  location.formatted
      });
      notify('Address saved ✓');
      onUpdate();
    } catch { notify('Failed to save address', 'error'); }
    finally { setSaving(false); }
  };

  return (
    <div className="space-y-4">
      <SectionCard title="Residential Address" subtitle="Search the exact address or click the map to pin location">
        <AddressPicker
          label="Worker's Home Address"
          value={location}
          onChange={setLocation}
          placeholder="Search street, area, city in Nigeria…"
          required
        />
        <button type="button" onClick={save} disabled={saving || !location?.formatted} className="btn-primary">
          {saving ? 'Saving…' : <><Save size={14} /> Save Address</>}
        </button>
        {worker.addressLocation?.coordinates && (
          <p className="text-xs text-green-600 flex items-center gap-1">
            <Check size={12} /> Address pinned: {worker.addressLocation.formatted}
          </p>
        )}
      </SectionCard>
      <StepNav onPrev={onPrev} onNext={onNext} prevLabel="← Worker" nextLabel="Documents →" />
    </div>
  );
}

// ─── Step 3: Verification Documents ──────────────────────────────────────────
function DocumentsStep({ worker, onUpdate, onNext, onPrev }) {
  const notify     = useNotify();
  const [docType,  setDocType]  = useState('');
  const [docNum,   setDocNum]   = useState('');
  const [file,     setFile]     = useState(null);
  const [saving,   setSaving]   = useState(false);
  const [deleting, setDeleting] = useState(null);

  const upload = async (e) => {
    e.preventDefault();
    if (!docType) return notify('Select a document type', 'warning');
    setSaving(true);
    try {
      const fd = new FormData();
      fd.append('docType', docType);
      fd.append('documentNumber', docNum);
      if (file) fd.append('document', file);
      await api.post(`/workers/${worker._id}/verification`, fd, { headers: { 'Content-Type': 'multipart/form-data' } });
      notify('Document saved ✓');
      setDocType(''); setDocNum(''); setFile(null);
      onUpdate();
    } catch (err) { notify(err.response?.data?.message || 'Upload failed', 'error'); }
    finally { setSaving(false); }
  };

  const remove = async (docId) => {
    if (!confirm('Delete this document?')) return;
    setDeleting(docId);
    try {
      await api.delete(`/workers/${worker._id}/verification/${docId}`);
      notify('Document removed');
      onUpdate();
    } catch { notify('Failed to remove', 'error'); }
    finally { setDeleting(null); }
  };

  return (
    <div className="space-y-4">
      {/* Existing docs */}
      {worker.verificationDocuments?.length > 0 && (
        <SectionCard title={`Uploaded Documents (${worker.verificationDocuments.length})`}>
          <div className="space-y-2">
            {worker.verificationDocuments.map(doc => (
              <div key={doc._id} className="flex items-center gap-3 p-3 border border-gray-100 rounded-xl bg-white">
                <div className="w-9 h-9 rounded-lg bg-brand-50 flex items-center justify-center shrink-0">
                  <FileText size={16} className="text-brand-600" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-800">{DOC_LABELS[doc.type]}</p>
                  {doc.documentNumber && <p className="text-xs text-gray-500">No: {doc.documentNumber}</p>}
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  {doc.file?.url && (
                    <a href={doc.file.url} target="_blank" rel="noopener noreferrer"
                      className="p-1.5 text-brand-600 hover:bg-brand-50 rounded-lg"><Eye size={14} /></a>
                  )}
                  <button onClick={() => remove(doc._id)} disabled={deleting === doc._id}
                    className="p-1.5 text-red-400 hover:bg-red-50 rounded-lg">
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </SectionCard>
      )}

      {/* Upload new doc */}
      <SectionCard title="Upload Verification Document" subtitle="NIN, Voter's Card, National ID, Driver's License or International Passport">
        <form onSubmit={upload} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <FieldRow label="Document Type *">
              <select className="input" value={docType} onChange={e => setDocType(e.target.value)} required>
                <option value="">Select type…</option>
                {Object.entries(DOC_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select>
            </FieldRow>
            <FieldRow label="Document Number (optional)">
              <input className="input" placeholder="ID number" value={docNum} onChange={e => setDocNum(e.target.value)} />
            </FieldRow>
          </div>
          <CameraCapture
            label="Document Photo / PDF Upload"
            accept="image/*,application/pdf"
            onChange={setFile}
            onClear={() => setFile(null)}
          />
          <button type="submit" disabled={saving || !docType} className="btn-primary">
            {saving ? 'Uploading…' : <><Upload size={14} /> Upload Document</>}
          </button>
        </form>
      </SectionCard>

      <StepNav onPrev={onPrev} onNext={onNext} prevLabel="← Address" nextLabel="Guarantor 1 →" />
    </div>
  );
}

// ─── Step 4 & 5: Guarantor ────────────────────────────────────────────────────
function GuarantorStep({ worker, guarantors, index, onUpdate, onNext, onPrev, prevLabel, nextLabel }) {
  const notify   = useNotify();
  const existing = guarantors[index] || null;

  const INIT = {
    fullName: '', phone: '', address: '', relationship: '',
    idDocType: '', documentNumber: ''
  };

  const [form,      setForm]      = useState(existing ? {
    fullName: existing.fullName, phone: existing.phone, address: existing.address,
    relationship: existing.relationship,
    idDocType: existing.idDocument?.type || '',
    documentNumber: existing.idDocument?.documentNumber || ''
  } : INIT);

  const [photo,      setPhoto]     = useState(null);
  const [idFile,     setIdFile]    = useState(null);
  const [signature,  setSignature] = useState(null);
  const [houseLocation, setHouseLocation] = useState(
    existing?.houseLocation?.coordinates
      ? { formatted: existing.houseLocation.formattedAddress || existing.houseLocation.address,
          coordinates: existing.houseLocation.coordinates }
      : null
  );
  const [housePhotos,  setHousePhotos]  = useState([]);
  const [photoType,    setPhotoType]    = useState('house_front');
  const [saving,       setSaving]       = useState(false);
  const photoInputRef = useRef(null);

  const set = k => e => setForm(f => ({ ...f, [k]: e.target.value }));

  const save = async (e) => {
    e.preventDefault();
    if (!form.fullName || !form.phone || !form.address || !form.relationship) {
      return notify('Fill in all required fields', 'warning');
    }
    setSaving(true);
    try {
      const fd = new FormData();
      Object.entries(form).forEach(([k, v]) => { if (v) fd.append(k, v); });
      if (photo)     fd.append('passportPhoto', photo);
      if (idFile)    fd.append('idDocument', idFile);
      if (houseLocation?.coordinates) {
        fd.append('lat', houseLocation.coordinates.lat);
        fd.append('lng', houseLocation.coordinates.lng);
        fd.append('houseFormattedAddress', houseLocation.formatted || '');
        fd.append('houseAddress', houseLocation.formatted || '');
      }

      if (existing) {
        await api.put(`/workers/${worker._id}/guarantors/${existing._id}`, fd,
          { headers: { 'Content-Type': 'multipart/form-data' } });
      } else {
        await api.post(`/workers/${worker._id}/guarantors`, fd,
          { headers: { 'Content-Type': 'multipart/form-data' } });
      }

      // Save signature separately if provided
      if (signature?.file) {
        const updatedList = (await api.get(`/workers/${worker._id}/guarantors`)).data.data;
        const gid = existing?._id || updatedList[updatedList.length - 1]?._id;
        if (gid) {
          const sfd = new FormData();
          sfd.append('signature', signature.file);
          await api.post(`/workers/${worker._id}/guarantors/${gid}/signature`, sfd,
            { headers: { 'Content-Type': 'multipart/form-data' } });
        }
      }

      // Upload house photos
      if (housePhotos.length > 0) {
        const updatedList = (await api.get(`/workers/${worker._id}/guarantors`)).data.data;
        const gid = existing?._id || updatedList[updatedList.length - 1]?._id;
        if (gid) {
          const pfd = new FormData();
          housePhotos.forEach(f => pfd.append('photos', f));
          pfd.append('photoType', photoType);
          await api.post(`/workers/${worker._id}/guarantors/${gid}/house-photos`, pfd,
            { headers: { 'Content-Type': 'multipart/form-data' } });
        }
      }

      notify(`Guarantor ${index + 1} saved ✓`);
      onUpdate();
    } catch (err) {
      notify(err.response?.data?.message || 'Failed to save guarantor', 'error');
    } finally { setSaving(false); }
  };

  const title = `Guarantor ${index + 1}`;

  return (
    <div className="space-y-4">
      <form onSubmit={save} className="space-y-4">
        {/* Basic info */}
        <SectionCard title={`${title} — Personal Information`}>
          <CameraCapture
            label="Passport Photo"
            preview={existing?.passportPhoto?.url}
            onChange={setPhoto}
            onClear={() => setPhoto(null)}
            facingMode="user"
            square
          />
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="sm:col-span-2">
              <label className="label">Full Name *</label>
              <input className="input" placeholder="Guarantor's full legal name" value={form.fullName} onChange={set('fullName')} required />
            </div>
            <div>
              <label className="label">Phone Number *</label>
              <input className="input" placeholder="+234 801 234 5678" value={form.phone} onChange={set('phone')} required />
            </div>
            <div>
              <label className="label">Relationship to Worker *</label>
              <select className="input" value={form.relationship} onChange={set('relationship')} required>
                <option value="">Select…</option>
                {RELATIONSHIPS.map(r => <option key={r} value={r}>{r}</option>)}
              </select>
            </div>
          </div>

          <AddressPicker
            label="Guarantor's Home Address *"
            value={form.address ? { formatted: form.address, coordinates: null } : null}
            onChange={v => setForm(f => ({ ...f, address: v.formatted }))}
            placeholder="Search guarantor's address…"
            required
          />
        </SectionCard>

        {/* ID document */}
        <SectionCard title={`${title} — Identification Document`}>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="label">Document Type</label>
              <select className="input" value={form.idDocType} onChange={set('idDocType')}>
                <option value="">Select…</option>
                {Object.entries(DOC_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select>
            </div>
            <div>
              <label className="label">Document Number</label>
              <input className="input" placeholder="Optional" value={form.documentNumber} onChange={set('documentNumber')} />
            </div>
          </div>
          <CameraCapture
            label="ID Document Photo / PDF"
            accept="image/*,application/pdf"
            preview={existing?.idDocument?.file?.url}
            onChange={setIdFile}
            onClear={() => setIdFile(null)}
          />
        </SectionCard>

        {/* Signature */}
        <SectionCard title={`${title} — Signature`}>
          <SignaturePad
            value={{ url: existing?.signature?.url }}
            onChange={setSignature}
          />
        </SectionCard>

        {/* House location */}
        <SectionCard title={`${title} — House Location`} subtitle="Pin the exact location of guarantor's house">
          <AddressPicker
            label="Guarantor's House Location"
            value={houseLocation}
            onChange={setHouseLocation}
            placeholder="Search guarantor's house address…"
          />
        </SectionCard>

        {/* House photos */}
        <SectionCard title={`${title} — House Photos`}>
          {existing?.houseLocation?.photos?.length > 0 && (
            <div className="grid grid-cols-3 gap-2 mb-3">
              {existing.houseLocation.photos.map((p, i) => (
                <a key={i} href={p.url} target="_blank" rel="noopener noreferrer">
                  <img src={p.url} alt="" className="w-full h-20 object-cover rounded-lg border border-gray-200" />
                  <p className="text-xs text-center text-gray-400 mt-0.5 truncate">
                    {HOUSE_PHOTO_TYPES.find(t => t.value === p.photoType)?.label || p.photoType}
                  </p>
                </a>
              ))}
            </div>
          )}
          <div className="flex items-center gap-3 flex-wrap mb-2">
            <select className="input w-auto flex-1" value={photoType} onChange={e => setPhotoType(e.target.value)}>
              {HOUSE_PHOTO_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
            </select>
          </div>
          <div
            onClick={() => photoInputRef.current?.click()}
            className="flex items-center justify-center gap-2 p-4 border-2 border-dashed border-gray-300 rounded-xl cursor-pointer hover:border-brand-400 hover:bg-gray-50 transition-colors"
          >
            <Plus size={18} className="text-gray-400" />
            <span className="text-sm text-gray-500">Add house photos</span>
          </div>
          <input ref={photoInputRef} type="file" accept="image/*" multiple className="hidden"
            onChange={e => setHousePhotos(Array.from(e.target.files).slice(0, 5))} />
          {housePhotos.length > 0 && (
            <div className="flex gap-2 flex-wrap mt-2">
              {housePhotos.map((f, i) => (
                <div key={i} className="relative">
                  <img src={URL.createObjectURL(f)} className="w-16 h-16 object-cover rounded-lg" alt="" />
                  <button type="button" onClick={() => setHousePhotos(p => p.filter((_, j) => j !== i))}
                    className="absolute -top-1.5 -right-1.5 bg-red-500 text-white rounded-full p-0.5">
                    <X size={10} />
                  </button>
                </div>
              ))}
            </div>
          )}
        </SectionCard>

        <button type="submit" disabled={saving} className="btn-primary w-full sm:w-auto justify-center py-3">
          {saving
            ? <span className="flex items-center gap-2">
                <span className="animate-spin h-4 w-4 border-2 border-white border-t-transparent rounded-full" />
                Saving {title}…
              </span>
            : <><Save size={16} /> Save {title}</>
          }
        </button>
      </form>

      <StepNav onPrev={onPrev} onNext={onNext} prevLabel={prevLabel} nextLabel={nextLabel} />
    </div>
  );
}

// ─── Step 6: House Photos ─────────────────────────────────────────────────────
function HousePhotosStep({ worker, onUpdate, onNext, onPrev }) {
  const notify = useNotify();
  const [files,     setFiles]     = useState([]);
  const [type,      setType]      = useState('house_front');
  const [address,   setAddress]   = useState(null);
  const [notes,     setNotes]     = useState(worker.houseVerification?.notes || '');
  const [saving,    setSaving]    = useState(false);
  const [deleting,  setDeleting]  = useState(null);
  const fileRef = useRef(null);

  const save = async () => {
    if (!files.length && !address && !notes) return notify('Add photos or location info', 'warning');
    setSaving(true);
    try {
      const fd = new FormData();
      if (address?.coordinates) {
        fd.append('lat', address.coordinates.lat);
        fd.append('lng', address.coordinates.lng);
        fd.append('formattedAddress', address.formatted || '');
        fd.append('address', address.formatted || '');
      }
      if (notes) fd.append('notes', notes);
      fd.append('photoType', type);
      files.forEach(f => fd.append('photos', f));
      await api.put(`/workers/${worker._id}/house`, fd, { headers: { 'Content-Type': 'multipart/form-data' } });
      notify('House verification saved ✓');
      setFiles([]);
      onUpdate();
    } catch { notify('Failed to save', 'error'); }
    finally { setSaving(false); }
  };

  const deletePhoto = async (photoId) => {
    if (!confirm('Delete this photo?')) return;
    setDeleting(photoId);
    try {
      await api.delete(`/workers/${worker._id}/house/photos/${photoId}`);
      notify('Photo removed');
      onUpdate();
    } catch { notify('Failed to delete photo', 'error'); }
    finally { setDeleting(null); }
  };

  const hv = worker.houseVerification;

  return (
    <div className="space-y-4">
      <SectionCard title="House Location" subtitle="Pin and record the worker's house location on map">
        <AddressPicker
          label="House Address"
          value={hv?.coordinates
            ? { formatted: hv.formattedAddress || hv.address, coordinates: hv.coordinates }
            : null
          }
          onChange={setAddress}
          placeholder="Search house address…"
        />
        <div>
          <label className="label">Additional Notes</label>
          <textarea className="input resize-none" rows={2} placeholder="Landmarks, gate colour, directions…"
            value={notes} onChange={e => setNotes(e.target.value)} />
        </div>
      </SectionCard>

      <SectionCard title="House Photos" subtitle="Upload photos of different areas of the house">
        {/* Existing photos */}
        {hv?.photos?.length > 0 && (
          <div className="grid grid-cols-3 sm:grid-cols-4 gap-2 mb-3">
            {hv.photos.map((p) => (
              <div key={p._id} className="relative group">
                <a href={p.url} target="_blank" rel="noopener noreferrer">
                  <img src={p.url} alt="" className="w-full h-24 object-cover rounded-xl border border-gray-100" />
                </a>
                <p className="text-xs text-center text-gray-400 mt-0.5 truncate">
                  {HOUSE_PHOTO_TYPES.find(t => t.value === p.photoType)?.label || 'Photo'}
                </p>
                <button type="button" onClick={() => deletePhoto(p._id)}
                  disabled={deleting === p._id}
                  className="absolute top-1 right-1 bg-red-500 text-white rounded-full p-0.5 opacity-0 group-hover:opacity-100 transition-opacity shadow">
                  <X size={10} />
                </button>
              </div>
            ))}
          </div>
        )}

        {/* Add new photos */}
        <div className="flex items-center gap-3 mb-3">
          <select className="input flex-1" value={type} onChange={e => setType(e.target.value)}>
            {HOUSE_PHOTO_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
          </select>
        </div>

        <div onClick={() => fileRef.current?.click()}
          className="flex items-center justify-center gap-2 p-4 border-2 border-dashed border-gray-300 rounded-xl cursor-pointer hover:border-brand-400 hover:bg-gray-50 transition-colors">
          <Camera size={20} className="text-gray-400" />
          <span className="text-sm text-gray-500">Camera or upload (up to 5 photos)</span>
        </div>
        <input ref={fileRef} type="file" accept="image/*" multiple className="hidden"
          onChange={e => setFiles(Array.from(e.target.files).slice(0, 5))} />

        {files.length > 0 && (
          <div className="flex gap-2 flex-wrap mt-2">
            {files.map((f, i) => (
              <div key={i} className="relative">
                <img src={URL.createObjectURL(f)} className="w-20 h-20 object-cover rounded-xl border" alt="" />
                <button type="button" onClick={() => setFiles(p => p.filter((_, j) => j !== i))}
                  className="absolute -top-1.5 -right-1.5 bg-red-500 text-white rounded-full p-0.5"><X size={10} /></button>
              </div>
            ))}
          </div>
        )}

        <button type="button" onClick={save} disabled={saving} className="btn-primary mt-2">
          {saving ? 'Saving…' : <><Save size={14} /> Save House Info</>}
        </button>
      </SectionCard>

      <StepNav onPrev={onPrev} onNext={onNext} prevLabel="← Guarantor 2" nextLabel="Summary →" />
    </div>
  );
}

// ─── Step 7: Summary ──────────────────────────────────────────────────────────
function SummaryStep({ worker, guarantors, onUpdate, workerId }) {
  const notify = useNotify();
  const [setting, setSetting] = useState(false);

  const checks = [
    { label: 'Passport Photo',    done: !!worker.passportPhoto?.url },
    { label: 'Signature',         done: !!worker.signature?.url },
    { label: 'Address Pinned',    done: !!worker.addressLocation?.coordinates?.lat },
    { label: 'Verification Docs', done: (worker.verificationDocuments?.length || 0) > 0 },
    { label: 'Guarantor 1',       done: guarantors.length >= 1 },
    { label: 'Guarantor 2',       done: guarantors.length >= 2 },
    { label: 'House Photos',      done: (worker.houseVerification?.photos?.length || 0) > 0 }
  ];

  const doneCount = checks.filter(c => c.done).length;
  const allDone   = doneCount === checks.length;
  const pct       = Math.round((doneCount / checks.length) * 100);

  const setStatus = async (status) => {
    setSetting(true);
    try {
      await api.put(`/workers/${workerId}/verification-status`, { status });
      notify(`Status updated to ${status.replace('_', ' ')}`);
      onUpdate();
    } catch { notify('Failed to update status', 'error'); }
    finally { setSetting(false); }
  };

  return (
    <div className="space-y-4">
      <SectionCard title="Verification Summary">
        {/* Progress bar */}
        <div className="space-y-2">
          <div className="flex items-center justify-between text-sm">
            <span className="font-medium text-gray-700">{doneCount}/{checks.length} sections complete</span>
            <span className="font-bold text-brand-600">{pct}%</span>
          </div>
          <div className="w-full bg-gray-100 rounded-full h-2.5">
            <div className="bg-brand-500 h-2.5 rounded-full transition-all duration-500" style={{ width: `${pct}%` }} />
          </div>
        </div>

        {/* Checklist */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mt-4">
          {checks.map(({ label, done }) => (
            <div key={label} className={`flex items-center gap-2.5 p-2.5 rounded-xl border text-sm
              ${done ? 'bg-green-50 border-green-200 text-green-800' : 'bg-amber-50 border-amber-200 text-amber-800'}`}>
              {done
                ? <Check size={14} className="text-green-600 shrink-0" />
                : <AlertCircle size={14} className="text-amber-500 shrink-0" />
              }
              {label}
            </div>
          ))}
        </div>

        {/* Current status */}
        <div className="flex items-center gap-3 pt-2">
          <span className="text-sm font-medium text-gray-700">Current Status:</span>
          <VerificationBadge status={worker.verificationStatus} />
        </div>
      </SectionCard>

      {/* Status controls */}
      <SectionCard title="Set Verification Status" subtitle="Manually override the automatic status">
        <div className="flex flex-wrap gap-2">
          <button onClick={() => setStatus('pending')} disabled={setting}
            className={`btn-secondary text-xs ${worker.verificationStatus === 'pending' ? 'border-amber-400 text-amber-700' : ''}`}>
            Pending
          </button>
          <button onClick={() => setStatus('partially_verified')} disabled={setting}
            className={`btn-secondary text-xs ${worker.verificationStatus === 'partially_verified' ? 'border-blue-400 text-blue-700' : ''}`}>
            Partially Verified
          </button>
          <button onClick={() => setStatus('fully_verified')} disabled={setting || !allDone}
            title={allDone ? '' : 'Complete all sections first'}
            className={`btn-primary text-xs ${!allDone ? 'opacity-50 cursor-not-allowed' : ''}`}>
            <ShieldCheck size={13} /> Mark Fully Verified
          </button>
        </div>
        {!allDone && (
          <p className="text-xs text-gray-400 flex items-center gap-1">
            <AlertCircle size={11} />
            Complete all {checks.length} sections to enable "Fully Verified"
          </p>
        )}
      </SectionCard>

      <StepNav showNext={false} prevLabel="← House Photos" />
    </div>
  );
}

// ─── Shared step navigation bar ──────────────────────────────────────────────
function StepNav({ onPrev, onNext, prevLabel = '← Back', nextLabel = 'Continue →', showNext = true }) {
  return (
    <div className="flex items-center justify-between pt-2">
      <div>
        {onPrev && (
          <button type="button" onClick={onPrev} className="btn-secondary">
            <ChevronLeft size={16} /> {prevLabel}
          </button>
        )}
      </div>
      {showNext && onNext && (
        <button type="button" onClick={onNext} className="btn-primary">
          {nextLabel} <ChevronRight size={16} />
        </button>
      )}
    </div>
  );
}

// ─── Main VerificationModule page ────────────────────────────────────────────
export default function VerificationModule() {
  const { id }      = useParams();
  const notify      = useNotify();

  const [step,       setStep]       = useState(0);
  const [worker,     setWorker]     = useState(null);
  const [guarantors, setGuarantors] = useState([]);
  const [loading,    setLoading]    = useState(true);

  const loadAll = async () => {
    try {
      const [w, g] = await Promise.all([
        api.get(`/workers/${id}`),
        api.get(`/workers/${id}/guarantors`)
      ]);
      setWorker(w.data.data);
      setGuarantors(g.data.data);
    } catch { notify('Failed to load worker data', 'error'); }
    finally { setLoading(false); }
  };

  useEffect(() => { loadAll(); }, [id]);

  const isComplete = (stepId) => {
    if (!worker) return false;
    switch (stepId) {
      case 'identity':   return !!(worker.passportPhoto?.url && worker.signature?.url);
      case 'address':    return !!(worker.addressLocation?.coordinates?.lat);
      case 'documents':  return (worker.verificationDocuments?.length || 0) > 0;
      case 'guarantor1': return guarantors.length >= 1;
      case 'guarantor2': return guarantors.length >= 2;
      case 'photos':     return (worker.houseVerification?.photos?.length || 0) > 0;
      case 'summary':    return worker.verificationStatus !== 'pending';
      default: return false;
    }
  };

  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-brand-600" />
    </div>
  );
  if (!worker) return null;

  return (
    <div className="max-w-2xl mx-auto pb-10">
      {/* Header */}
      <div className="flex items-center gap-3 mb-5">
        <Link to={`/workers/${id}`} className="text-gray-400 hover:text-gray-600">
          <ChevronLeft size={20} />
        </Link>
        <div>
          <h1 className="font-bold text-gray-900">{worker.fullName}</h1>
          <p className="text-sm text-gray-500">{worker.role} — {worker.branch}</p>
        </div>
        <div className="ml-auto">
          <VerificationBadge status={worker.verificationStatus} />
        </div>
      </div>

      {/* Stepper */}
      <div className="card mb-5 overflow-hidden">
        {/* Desktop: all labels */}
        <div className="hidden sm:flex border-b border-gray-100">
          {STEPS.map((s, i) => {
            const done    = isComplete(s.id);
            const current = i === step;
            return (
              <button
                key={s.id}
                onClick={() => setStep(i)}
                className={`flex-1 flex flex-col items-center gap-1 py-3 px-1 text-center transition-colors
                  ${current ? 'bg-brand-50 border-b-2 border-brand-600' : 'hover:bg-gray-50'}`}
              >
                <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold
                  ${done ? 'bg-green-500 text-white' : current ? 'bg-brand-600 text-white' : 'bg-gray-100 text-gray-500'}`}>
                  {done ? <Check size={13} /> : i + 1}
                </div>
                <span className={`text-xs ${current ? 'text-brand-700 font-medium' : done ? 'text-green-700' : 'text-gray-400'}`}>
                  {s.label}
                </span>
              </button>
            );
          })}
        </div>

        {/* Mobile: compact bar */}
        <div className="sm:hidden flex items-center gap-2 px-4 py-3 border-b border-gray-100">
          <div className="flex gap-1.5">
            {STEPS.map((s, i) => (
              <button key={s.id} onClick={() => setStep(i)}
                className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold transition-colors
                  ${isComplete(s.id) ? 'bg-green-500 text-white'
                    : i === step ? 'bg-brand-600 text-white'
                    : 'bg-gray-100 text-gray-400'}`}>
                {isComplete(s.id) ? <Check size={10} /> : i + 1}
              </button>
            ))}
          </div>
          <div className="ml-2">
            <p className="text-xs font-medium text-gray-700">Step {step + 1} of {STEPS.length}</p>
            <p className="text-xs text-brand-600 font-semibold">{STEPS[step].label}</p>
          </div>
        </div>

        {/* Progress bar */}
        <div className="h-1 bg-gray-100">
          <div className="h-1 bg-brand-500 transition-all duration-500"
            style={{ width: `${(STEPS.filter(s => isComplete(s.id)).length / STEPS.length) * 100}%` }} />
        </div>
      </div>

      {/* Step content */}
      {step === 0 && <WorkerIdentityStep worker={worker} onUpdate={loadAll} onNext={() => setStep(1)} />}
      {step === 1 && <AddressStep worker={worker} onUpdate={loadAll} onNext={() => setStep(2)} onPrev={() => setStep(0)} />}
      {step === 2 && <DocumentsStep worker={worker} onUpdate={loadAll} onNext={() => setStep(3)} onPrev={() => setStep(1)} />}
      {step === 3 && (
        <GuarantorStep worker={worker} guarantors={guarantors} index={0} onUpdate={loadAll}
          onNext={() => setStep(4)} onPrev={() => setStep(2)}
          prevLabel="← Documents" nextLabel="Guarantor 2 →" />
      )}
      {step === 4 && (
        <GuarantorStep worker={worker} guarantors={guarantors} index={1} onUpdate={loadAll}
          onNext={() => setStep(5)} onPrev={() => setStep(3)}
          prevLabel="← Guarantor 1" nextLabel="House Photos →" />
      )}
      {step === 5 && <HousePhotosStep worker={worker} onUpdate={loadAll} onNext={() => setStep(6)} onPrev={() => setStep(4)} />}
      {step === 6 && <SummaryStep worker={worker} guarantors={guarantors} onUpdate={loadAll} workerId={id} />}
    </div>
  );
}
