import { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { ChevronLeft, Save, Plus, X, Camera, MapPin, Home, Eye } from 'lucide-react';
import api from '../utils/api';
import { useNotify } from '../context/NotificationContext';
import FileUpload from '../components/FileUpload';
import MapPicker from '../components/MapPicker';

const DOC_LABELS = {
  nin:                    'NIN (National ID Number)',
  voter_card:             "Voter's Card",
  drivers_license:        "Driver's License",
  national_id:            'National ID Card',
  international_passport: 'International Passport'
};

const RELATIONSHIPS = [
  'Spouse', 'Parent', 'Sibling', 'Child', 'Relative',
  'Friend', 'Colleague', 'Employer', 'Landlord', 'Other'
];

const INIT = {
  fullName: '', phone: '', address: '', relationship: '',
  idDocType: '', documentNumber: '', houseAddress: ''
};

// ─── Single photo slot ────────────────────────────────────────────────────────
function PhotoSlot({ label, hint, icon: Icon, file, preview, onChange, onClear }) {
  const ref = useRef(null);
  const src = file ? URL.createObjectURL(file) : preview;

  return (
    <div>
      <label className="label flex items-center gap-1.5">
        <Icon size={13} className="text-gray-500" /> {label}
      </label>
      {hint && <p className="text-xs text-gray-400 mb-2">{hint}</p>}
      {src ? (
        <div className="relative inline-block w-full">
          <img src={src} className="w-full max-h-44 object-cover rounded-xl border border-gray-200" alt={label} />
          <button type="button" onClick={onClear}
            className="absolute top-2 right-2 bg-red-500 text-white rounded-full p-1 shadow-md hover:bg-red-600 transition-colors">
            <X size={12} />
          </button>
          {preview && !file && (
            <a href={preview} target="_blank" rel="noopener noreferrer"
              className="absolute bottom-2 right-2 bg-white/90 rounded-lg p-1 shadow text-brand-600 hover:text-brand-800">
              <Eye size={14} />
            </a>
          )}
        </div>
      ) : (
        <div onClick={() => ref.current?.click()}
          className="flex flex-col items-center justify-center gap-2 p-6 border-2 border-dashed border-gray-300 rounded-xl cursor-pointer hover:border-brand-400 hover:bg-brand-50/30 transition-colors">
          <Icon size={22} className="text-gray-300" />
          <span className="text-sm text-gray-400">Click to upload</span>
        </div>
      )}
      <input ref={ref} type="file" accept="image/*" className="hidden"
        onChange={e => { if (e.target.files[0]) onChange(e.target.files[0]); e.target.value = ''; }} />
    </div>
  );
}

export default function GuarantorForm({ edit = false }) {
  const { workerId, guarantorId } = useParams();
  const navigate                  = useNavigate();
  const notify                    = useNotify();

  const [form,        setForm       ] = useState(INIT);
  const [passportPhoto, setPassportPhoto] = useState(null);
  const [idDoc,       setIdDoc      ] = useState(null);
  const [coords,      setCoords     ] = useState(null);
  // Distinct house photo slots
  const [houseFront,  setHouseFront ] = useState(null);   // new file
  const [streetView,  setStreetView ] = useState(null);   // new file
  const [envPhoto,    setEnvPhoto   ] = useState(null);   // new file
  // Existing photo previews (edit mode)
  const [existingPhotos, setExistingPhotos] = useState({
    passport: null, idDoc: null,
    houseFront: null, streetView: null, envPhoto: null
  });
  const [existingGuarantorId, setExistingGuarantorId] = useState(null);
  const [loading,    setLoading    ] = useState(false);
  const [fetching,   setFetching   ] = useState(!!edit);
  const [workerName, setWorkerName ] = useState('');

  const set = (k) => (e) => setForm(f => ({ ...f, [k]: e.target.value }));

  useEffect(() => {
    api.get(`/workers/${workerId}`)
      .then(r => setWorkerName(r.data.data.fullName))
      .catch(() => {});
  }, [workerId]);

  useEffect(() => {
    if (!edit || !guarantorId) return;
    const load = async () => {
      try {
        const { data } = await api.get(`/workers/${workerId}/guarantors/${guarantorId}`);
        const g = data.data;
        setExistingGuarantorId(g._id);
        setForm({
          fullName:       g.fullName,
          phone:          g.phone,
          address:        g.address,
          relationship:   g.relationship,
          idDocType:      g.idDocument?.type || '',
          documentNumber: g.idDocument?.documentNumber || '',
          houseAddress:   g.houseLocation?.address || ''
        });
        if (g.houseLocation?.coordinates) setCoords(g.houseLocation.coordinates);

        // Map existing house photos by type
        const photosByType = {};
        (g.houseLocation?.photos || []).forEach(p => { photosByType[p.photoType] = p.url; });

        setExistingPhotos({
          passport:   g.passportPhoto?.url       || null,
          idDoc:      g.idDocument?.file?.url    || null,
          houseFront: photosByType.house_front   || null,
          streetView: photosByType.street_view   || null,
          envPhoto:   photosByType.environment   || null,
        });
      } catch {
        notify('Could not load guarantor', 'error');
        navigate(`/workers/${workerId}`);
      } finally {
        setFetching(false);
      }
    };
    load();
  }, [edit, guarantorId]);

  // ─── Upload house photos to a guarantor ID ────────────────────────────────
  const uploadHousePhotos = async (gid) => {
    const slots = [
      { file: houseFront, type: 'house_front' },
      { file: streetView, type: 'street_view' },
      { file: envPhoto,   type: 'environment' },
    ].filter(s => s.file);

    for (const slot of slots) {
      const pfd = new FormData();
      pfd.append('photos',    slot.file);
      pfd.append('photoType', slot.type);
      await api.post(
        `/workers/${workerId}/guarantors/${gid}/house-photos`,
        pfd,
        { headers: { 'Content-Type': 'multipart/form-data' } }
      );
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      const fd = new FormData();
      Object.entries(form).forEach(([k, v]) => { if (v) fd.append(k, v); });
      if (coords) {
        fd.append('lat', coords.lat);
        fd.append('lng', coords.lng);
        fd.append('houseFormattedAddress', form.houseAddress || '');
      }
      if (passportPhoto) fd.append('passportPhoto', passportPhoto);
      if (idDoc)         fd.append('idDocument',    idDoc);

      const headers = { 'Content-Type': 'multipart/form-data' };

      let gid = guarantorId;
      if (edit) {
        await api.put(`/workers/${workerId}/guarantors/${guarantorId}`, fd, { headers });
        notify('Guarantor updated');
      } else {
        const { data } = await api.post(`/workers/${workerId}/guarantors`, fd, { headers });
        gid = data.data._id;
        notify('Guarantor added successfully');
      }

      // Upload house photos separately (always — they go to their own endpoint)
      if (houseFront || streetView || envPhoto) {
        await uploadHousePhotos(gid);
      }

      navigate(`/workers/${workerId}`, { state: { tab: 'Guarantors' } });
    } catch (err) {
      notify(err.response?.data?.message || 'Failed to save guarantor', 'error');
    } finally {
      setLoading(false);
    }
  };

  if (fetching) return (
    <div className="flex items-center justify-center h-48">
      <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-brand-600" />
    </div>
  );

  return (
    <div className="max-w-2xl mx-auto">
      <Link to={`/workers/${workerId}`}
        className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700 mb-5">
        <ChevronLeft size={16} />
        Back to {workerName || 'Worker'}
      </Link>

      <form onSubmit={handleSubmit} className="space-y-5">

        {/* ── Basic Info ─────────────────────────────────────────────────── */}
        <div className="card px-6 py-5 space-y-5">
          <h2 className="font-semibold text-gray-900">
            {edit ? 'Edit Guarantor' : 'Add Guarantor'} — {workerName}
          </h2>

          <FileUpload
            label="Guarantor Passport Photo"
            accept="image/*"
            preview={existingPhotos.passport}
            onChange={setPassportPhoto}
            onClear={() => setPassportPhoto(null)}
          />

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="sm:col-span-2">
              <label className="label">Full Name *</label>
              <input className="input" placeholder="Guarantor's full name" value={form.fullName}
                onChange={set('fullName')} required />
            </div>
            <div>
              <label className="label">Phone Number *</label>
              <input className="input" placeholder="+234 801 234 5678" value={form.phone}
                onChange={set('phone')} required />
            </div>
            <div>
              <label className="label">Relationship to Worker *</label>
              <select className="input" value={form.relationship} onChange={set('relationship')} required>
                <option value="">Select…</option>
                {RELATIONSHIPS.map(r => <option key={r} value={r}>{r}</option>)}
              </select>
            </div>
            <div className="sm:col-span-2">
              <label className="label">Residential Address *</label>
              <textarea className="input resize-none" rows={2} placeholder="Street, City, State"
                value={form.address} onChange={set('address')} required />
            </div>
          </div>
        </div>

        {/* ── ID Document ───────────────────────────────────────────────── */}
        <div className="card px-6 py-5 space-y-4">
          <h3 className="font-semibold text-gray-800">Identification Document</h3>
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
              <input className="input" placeholder="Optional" value={form.documentNumber}
                onChange={set('documentNumber')} />
            </div>
          </div>
          <FileUpload
            label="ID Document File (image or PDF)"
            accept="image/*,application/pdf"
            preview={existingPhotos.idDoc}
            onChange={setIdDoc}
            onClear={() => setIdDoc(null)}
          />
        </div>

        {/* ── House Location ────────────────────────────────────────────── */}
        <div className="card px-6 py-5 space-y-5">
          <div>
            <h3 className="font-semibold text-gray-800">House Location</h3>
            <p className="text-xs text-gray-500 mt-0.5">Pin the guarantor's house on the map to capture GPS coordinates</p>
          </div>

          <MapPicker value={coords} onChange={setCoords} />

          {/* Coordinates display */}
          {coords && (
            <div className="flex items-center gap-2 p-3 bg-green-50 border border-green-200 rounded-xl">
              <MapPin size={14} className="text-green-600 shrink-0" />
              <div className="text-sm">
                <p className="font-medium text-green-800">Location captured</p>
                <p className="text-green-600 text-xs font-mono mt-0.5">
                  {coords.lat.toFixed(6)}, {coords.lng.toFixed(6)}
                </p>
              </div>
            </div>
          )}

          <div>
            <label className="label">House Address / Description</label>
            <input className="input" placeholder="Street address, landmarks, area…"
              value={form.houseAddress} onChange={set('houseAddress')} />
          </div>
        </div>

        {/* ── House Photos ──────────────────────────────────────────────── */}
        <div className="card px-6 py-5 space-y-5">
          <div>
            <h3 className="font-semibold text-gray-800">House Photos</h3>
            <p className="text-xs text-gray-500 mt-0.5">
              Upload photos of the guarantor's house — these appear on the worker's printed document
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <PhotoSlot
              label="House Front *"
              hint="Front view of the house"
              icon={Home}
              file={houseFront}
              preview={existingPhotos.houseFront}
              onChange={setHouseFront}
              onClear={() => setHouseFront(null)}
            />
            <PhotoSlot
              label="Street View *"
              hint="The street/road to the house"
              icon={MapPin}
              file={streetView}
              preview={existingPhotos.streetView}
              onChange={setStreetView}
              onClear={() => setStreetView(null)}
            />
            <PhotoSlot
              label="Environment"
              hint="Surrounding area (optional)"
              icon={Camera}
              file={envPhoto}
              preview={existingPhotos.envPhoto}
              onChange={setEnvPhoto}
              onClear={() => setEnvPhoto(null)}
            />
          </div>
        </div>

        {/* ── Submit ───────────────────────────────────────────────────── */}
        <div className="flex items-center gap-3 pb-2">
          <button type="submit" disabled={loading} className="btn-primary">
            {loading
              ? <span className="flex items-center gap-2">
                  <span className="animate-spin h-4 w-4 border-2 border-white border-t-transparent rounded-full" />
                  Saving…
                </span>
              : <><Save size={16} />{edit ? 'Save Changes' : 'Add Guarantor'}</>
            }
          </button>
          <Link to={`/workers/${workerId}`} className="btn-secondary">Cancel</Link>
        </div>

      </form>
    </div>
  );
}
