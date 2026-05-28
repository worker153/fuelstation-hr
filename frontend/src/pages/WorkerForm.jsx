import { useState, useEffect, useRef } from 'react';
import { useNavigate, useParams, Link } from 'react-router-dom';
import { ChevronLeft, Save, Upload, X, Crop } from 'lucide-react';
import api from '../utils/api';
import FileUpload from '../components/FileUpload';
import PhotoCropper from '../components/PhotoCropper';
import { useNotify } from '../context/NotificationContext';

const ROLES = [
  'Pump Attendant', 'Supervisor', 'Outside Supervisor', 'Station Manager',
  'Cashier', 'Security Guard', 'Mechanic', 'Electrical Technician',
  'Office Staff', 'Cleaner', 'Other'
];

const INIT = { fullName: '', phone: '', address: '', branch: '', role: '' };

export default function WorkerForm({ edit = false }) {
  const { id }       = useParams();
  const navigate     = useNavigate();
  const notify       = useNotify();
  const fileInputRef = useRef(null);

  const [form, setForm]           = useState(INIT);
  const [photo, setPhoto]         = useState(null);         // File/Blob to upload
  const [preview, setPreview]     = useState(null);         // data URL shown in UI
  const [existing, setExisting]   = useState(null);         // current saved photo URL
  const [cropFile, setCropFile]   = useState(null);         // raw file waiting to be cropped
  const [loading, setLoading]     = useState(false);
  const [fetching, setFetching]   = useState(!!edit);

  const set = (k) => (e) => setForm(f => ({ ...f, [k]: e.target.value }));

  useEffect(() => {
    if (!edit || !id) return;
    const load = async () => {
      try {
        const { data } = await api.get(`/workers/${id}`);
        const w = data.data;
        setForm({ fullName: w.fullName, phone: w.phone, address: w.address, branch: w.branch, role: w.role });
        if (w.passportPhoto?.url) setExisting(w.passportPhoto.url);
      } catch {
        notify('Could not load worker data', 'error');
        navigate('/workers');
      } finally {
        setFetching(false);
      }
    };
    load();
  }, [edit, id]); // eslint-disable-line

  // When user picks a file → open cropper
  const handleFileSelect = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      notify('Please select an image file', 'error');
      return;
    }
    setCropFile(file);
    // reset input so same file can be re-selected after cancel
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  // Cropper confirmed → convert blob → preview + upload file
  const handleCropConfirm = (blob) => {
    const croppedFile = new File([blob], 'passport.jpg', { type: 'image/jpeg' });
    setPhoto(croppedFile);
    setPreview(URL.createObjectURL(blob));
    setExisting(null);
    setCropFile(null);
  };

  const clearPhoto = () => {
    setPhoto(null);
    setPreview(null);
    setExisting(null);
    setCropFile(null);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      const fd = new FormData();
      Object.entries(form).forEach(([k, v]) => fd.append(k, v));
      if (photo) fd.append('passportPhoto', photo);

      if (edit) {
        await api.put(`/workers/${id}`, fd, { headers: { 'Content-Type': 'multipart/form-data' } });
        notify('Worker updated successfully');
        navigate(`/workers/${id}`);
      } else {
        const { data } = await api.post('/workers', fd, { headers: { 'Content-Type': 'multipart/form-data' } });
        notify('Worker registered successfully');
        navigate(`/workers/${data.data._id}`);
      }
    } catch (err) {
      notify(err.response?.data?.message || 'Failed to save worker', 'error');
    } finally {
      setLoading(false);
    }
  };

  if (fetching) {
    return (
      <div className="flex items-center justify-center h-48">
        <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-brand-600" />
      </div>
    );
  }

  const displayPhoto = preview || existing;

  return (
    <div className="max-w-2xl mx-auto">
      <Link to={edit ? `/workers/${id}` : '/workers'}
        className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700 mb-5">
        <ChevronLeft size={16} />
        {edit ? 'Back to Worker' : 'Back to Workers'}
      </Link>

      <div className="card">
        <div className="px-6 py-5 border-b border-gray-100">
          <h1 className="text-xl font-semibold text-gray-900">
            {edit ? 'Edit Worker' : 'Register New Worker'}
          </h1>
          <p className="text-sm text-gray-500 mt-0.5">
            {edit ? 'Update worker details' : "Fill in the worker's details. Verification documents can be added later."}
          </p>
        </div>

        <form onSubmit={handleSubmit} className="px-6 py-6 space-y-6">

          {/* ── Passport Photo ── */}
          <div>
            <label className="label">Passport Photo</label>

            {displayPhoto ? (
              <div className="flex items-start gap-4">
                {/* Preview */}
                <div className="relative shrink-0">
                  <img
                    src={displayPhoto}
                    alt="Passport"
                    className="w-28 h-28 object-cover rounded-xl border-2 border-gray-200 shadow-sm"
                  />
                  <button
                    type="button"
                    onClick={clearPhoto}
                    className="absolute -top-2 -right-2 bg-red-500 hover:bg-red-600 text-white rounded-full p-1 shadow transition-colors">
                    <X size={11} />
                  </button>
                </div>

                {/* Action buttons */}
                <div className="flex flex-col gap-2 pt-1">
                  {/* Re-crop existing preview */}
                  {preview && (
                    <button
                      type="button"
                      onClick={() => {
                        // Re-open cropper with the same file (photo is already a File)
                        setCropFile(photo instanceof File ? photo : null);
                        if (!(photo instanceof File)) {
                          // If it's from existing URL, just open file picker
                          fileInputRef.current?.click();
                        }
                      }}
                      className="flex items-center gap-2 px-3 py-2 bg-brand-50 border border-brand-200
                                 text-brand-700 text-xs font-semibold rounded-xl hover:bg-brand-100 transition-colors">
                      <Crop size={13} /> Adjust crop
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="flex items-center gap-2 px-3 py-2 bg-gray-50 border border-gray-200
                               text-gray-600 text-xs font-semibold rounded-xl hover:bg-gray-100 transition-colors">
                    <Upload size={13} /> Change photo
                  </button>
                  <p className="text-[11px] text-gray-400 mt-1">
                    Photo will be cropped to square
                  </p>
                </div>
              </div>
            ) : (
              <div
                onClick={() => fileInputRef.current?.click()}
                className="flex flex-col items-center justify-center gap-2 px-4 py-8 border-2 border-dashed
                           border-gray-300 hover:border-brand-400 hover:bg-gray-50/80 rounded-xl cursor-pointer transition-colors">
                <div className="w-12 h-12 rounded-xl bg-gray-100 flex items-center justify-center">
                  <Upload size={20} className="text-gray-400" />
                </div>
                <div className="text-center">
                  <p className="text-sm font-semibold text-gray-600">
                    Upload passport photo
                  </p>
                  <p className="text-xs text-gray-400 mt-0.5">
                    JPEG or PNG · You can reposition after selecting
                  </p>
                </div>
              </div>
            )}

            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={handleFileSelect}
            />
          </div>

          {/* ── Personal info ── */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="sm:col-span-2">
              <label className="label">Full Name *</label>
              <input className="input" placeholder="e.g. Chukwuemeka Okafor"
                value={form.fullName} onChange={set('fullName')} required />
            </div>
            <div>
              <label className="label">Phone Number *</label>
              <input className="input" placeholder="+234 801 234 5678"
                value={form.phone} onChange={set('phone')} required />
            </div>
            <div className="sm:col-span-2">
              <label className="label">Residential Address *</label>
              <textarea className="input resize-none" rows={2} placeholder="Street, City, State"
                value={form.address} onChange={set('address')} required />
            </div>
          </div>

          {/* ── Employment info ── */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="label">Branch *</label>
              <input className="input" placeholder="e.g. Victoria Island Branch"
                value={form.branch} onChange={set('branch')} required />
            </div>
            <div>
              <label className="label">Role *</label>
              <select className="input" value={form.role} onChange={set('role')} required>
                <option value="">Select role…</option>
                {ROLES.map(r => <option key={r} value={r}>{r}</option>)}
              </select>
            </div>
          </div>

          {/* ── Actions ── */}
          <div className="flex items-center gap-3 pt-2">
            <button type="submit" disabled={loading} className="btn-primary">
              {loading
                ? <span className="flex items-center gap-2">
                    <span className="animate-spin h-4 w-4 border-2 border-white border-t-transparent rounded-full" />
                    Saving…
                  </span>
                : <><Save size={16} />{edit ? 'Save Changes' : 'Register Worker'}</>
              }
            </button>
            <Link to={edit ? `/workers/${id}` : '/workers'} className="btn-secondary">
              Cancel
            </Link>
          </div>
        </form>
      </div>

      {/* Cropper modal */}
      {cropFile && (
        <PhotoCropper
          file={cropFile}
          onConfirm={handleCropConfirm}
          onCancel={() => { setCropFile(null); fileInputRef.current?.click(); }}
        />
      )}
    </div>
  );
}
