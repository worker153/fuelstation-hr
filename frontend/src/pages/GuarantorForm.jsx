import { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { ChevronLeft, Save, Plus, X } from 'lucide-react';
import api from '../utils/api';
import { useNotify } from '../context/NotificationContext';
import FileUpload from '../components/FileUpload';
import MapPicker from '../components/MapPicker';

const DOC_LABELS = {
  nin: 'NIN (National ID Number)',
  voter_card: "Voter's Card",
  drivers_license: "Driver's License",
  national_id: 'National ID Card',
  international_passport: 'International Passport'
};

const RELATIONSHIPS = [
  'Spouse', 'Parent', 'Sibling', 'Child', 'Relative',
  'Friend', 'Colleague', 'Employer', 'Landlord', 'Other'
];

const INIT = {
  fullName: '', phone: '', address: '', relationship: '',
  idDocType: '', documentNumber: '',
  houseAddress: ''
};

export default function GuarantorForm({ edit = false }) {
  const { workerId, guarantorId } = useParams();
  const navigate                  = useNavigate();
  const notify                    = useNotify();

  const [form, setForm]               = useState(INIT);
  const [passportPhoto, setPassportPhoto]   = useState(null);
  const [idDoc, setIdDoc]             = useState(null);
  const [coords, setCoords]           = useState(null);
  const [housePhotos, setHousePhotos] = useState([]);
  const [existingPhotos, setExistingPhotos] = useState({
    passport: null, idDoc: null
  });
  const [loading, setLoading]         = useState(false);
  const [fetching, setFetching]       = useState(!!edit);
  const [workerName, setWorkerName]   = useState('');
  const photoInputRef                 = useRef(null);

  const set = (k) => (e) => setForm(f => ({ ...f, [k]: e.target.value }));

  useEffect(() => {
    const loadWorker = async () => {
      try {
        const { data } = await api.get(`/workers/${workerId}`);
        setWorkerName(data.data.fullName);
      } catch { /* silent */ }
    };
    loadWorker();
  }, [workerId]);

  useEffect(() => {
    if (!edit || !guarantorId) return;
    const load = async () => {
      try {
        const { data } = await api.get(`/workers/${workerId}/guarantors/${guarantorId}`);
        const g = data.data;
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
        setExistingPhotos({
          passport: g.passportPhoto?.url || null,
          idDoc:    g.idDocument?.file?.url || null
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

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      const fd = new FormData();
      Object.entries(form).forEach(([k, v]) => { if (v) fd.append(k, v); });
      if (coords) { fd.append('lat', coords.lat); fd.append('lng', coords.lng); }
      if (passportPhoto) fd.append('passportPhoto', passportPhoto);
      if (idDoc)         fd.append('idDocument', idDoc);
      housePhotos.forEach(f => fd.append('housePhotos', f));

      const headers = { 'Content-Type': 'multipart/form-data' };

      if (edit) {
        await api.put(`/workers/${workerId}/guarantors/${guarantorId}`, fd, { headers });
        notify('Guarantor updated');
      } else {
        await api.post(`/workers/${workerId}/guarantors`, fd, { headers });
        notify('Guarantor added successfully');
      }

      // Upload house photos separately if new ones added in edit mode
      if (edit && housePhotos.length) {
        const pfd = new FormData();
        housePhotos.forEach(f => pfd.append('photos', f));
        await api.post(`/workers/${workerId}/guarantors/${guarantorId}/house-photos`, pfd, { headers });
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
        {/* Section: Basic Info */}
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

        {/* Section: ID Document */}
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

        {/* Section: House Location */}
        <div className="card px-6 py-5 space-y-4">
          <h3 className="font-semibold text-gray-800">House Location</h3>
          <p className="text-sm text-gray-500">Click the map to pin the guarantor's house location</p>
          <MapPicker value={coords} onChange={setCoords} />
          <div>
            <label className="label">House Address</label>
            <input className="input" placeholder="Street address, area, state"
              value={form.houseAddress} onChange={set('houseAddress')} />
          </div>

          {/* House photos */}
          <div>
            <label className="label">House Photos</label>
            <div
              onClick={() => photoInputRef.current?.click()}
              className="flex items-center justify-center gap-2 p-4 border-2 border-dashed border-gray-300 rounded-xl cursor-pointer hover:border-brand-400 hover:bg-gray-50 transition-colors"
            >
              <Plus size={18} className="text-gray-400" />
              <span className="text-sm text-gray-500">Add house photos (up to 5)</span>
            </div>
            <input ref={photoInputRef} type="file" accept="image/*" multiple className="hidden"
              onChange={e => setHousePhotos(Array.from(e.target.files).slice(0, 5))} />
            {housePhotos.length > 0 && (
              <div className="flex gap-2 mt-2 flex-wrap">
                {housePhotos.map((f, i) => (
                  <div key={i} className="relative">
                    <img src={URL.createObjectURL(f)} className="w-16 h-16 object-cover rounded-lg border border-gray-200" alt="" />
                    <button type="button" onClick={() => setHousePhotos(p => p.filter((_, j) => j !== i))}
                      className="absolute -top-1.5 -right-1.5 bg-red-500 text-white rounded-full p-0.5">
                      <X size={10} />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Submit */}
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
