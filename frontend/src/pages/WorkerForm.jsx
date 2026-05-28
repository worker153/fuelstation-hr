import { useState, useEffect } from 'react';
import { useNavigate, useParams, Link } from 'react-router-dom';
import { ChevronLeft, Save } from 'lucide-react';
import api from '../utils/api';
import FileUpload from '../components/FileUpload';
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

  const [form, setForm]       = useState(INIT);
  const [photo, setPhoto]     = useState(null);
  const [existing, setExisting] = useState(null); // current photo URL
  const [loading, setLoading] = useState(false);
  const [fetching, setFetching] = useState(!!edit);

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
  }, [edit, id]);

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

  return (
    <div className="max-w-2xl mx-auto">
      {/* Back */}
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
            {edit ? 'Update worker details' : 'Fill in the worker\'s details. Verification documents can be added later.'}
          </p>
        </div>

        <form onSubmit={handleSubmit} className="px-6 py-6 space-y-6">
          {/* Passport photo */}
          <FileUpload
            label="Passport Photo"
            accept="image/*"
            preview={existing}
            onChange={setPhoto}
            onClear={() => { setPhoto(null); setExisting(null); }}
          />

          {/* Personal info */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="sm:col-span-2">
              <label className="label">Full Name *</label>
              <input className="input" placeholder="e.g. Chukwuemeka Okafor" value={form.fullName}
                onChange={set('fullName')} required />
            </div>
            <div>
              <label className="label">Phone Number *</label>
              <input className="input" placeholder="+234 801 234 5678" value={form.phone}
                onChange={set('phone')} required />
            </div>
            <div className="sm:col-span-2">
              <label className="label">Residential Address *</label>
              <textarea className="input resize-none" rows={2} placeholder="Street, City, State"
                value={form.address} onChange={set('address')} required />
            </div>
          </div>

          {/* Employment info */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="label">Branch *</label>
              <input className="input" placeholder="e.g. Victoria Island Branch" value={form.branch}
                onChange={set('branch')} required />
            </div>
            <div>
              <label className="label">Role *</label>
              <select className="input" value={form.role} onChange={set('role')} required>
                <option value="">Select role…</option>
                {ROLES.map(r => <option key={r} value={r}>{r}</option>)}
              </select>
            </div>
          </div>

          {/* Actions */}
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
    </div>
  );
}
