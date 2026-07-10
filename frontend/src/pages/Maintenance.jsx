/**
 * Maintenance Log — /maintenance
 * Admin-only. Track pump maintenance: what was done, when, and by whom.
 * Uses adminToken from localStorage (same auth as AdminDashboard).
 */
import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';

const API = import.meta.env.VITE_API_URL || '/api';

const adminApi = axios.create({ baseURL: API });
adminApi.interceptors.request.use(cfg => {
  const t = localStorage.getItem('adminToken');
  if (t) cfg.headers.Authorization = `Bearer ${t}`;
  return cfg;
});

const todayStr = () => new Date().toISOString().slice(0, 10);

const fmtDate = (d) => {
  const dt = new Date(d);
  return dt.toLocaleDateString('en-NG', {
    weekday: 'short', day: 'numeric', month: 'short', year: 'numeric',
  });
};

// ── Empty form state ──────────────────────────────────────────────────────────
const emptyForm = () => ({
  pumpChoice: '',    // id from pumps list, or 'other'
  pumpCustom: '',    // typed when pumpChoice === 'other'
  date:        todayStr(),
  workerName:  '',
  description: '',
});

export default function Maintenance() {
  const navigate = useNavigate();

  // Redirect if no admin token
  useEffect(() => {
    if (!localStorage.getItem('adminToken')) navigate('/admin-dashboard', { replace: true });
  }, [navigate]);

  const [pumps,   setPumps  ] = useState([]);
  const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form,    setForm   ] = useState(emptyForm());
  const [saving,  setSaving ] = useState(false);
  const [error,   setError  ] = useState('');
  const [delId,   setDelId  ] = useState(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [pRes, mRes] = await Promise.all([
        adminApi.get('/pumps').catch(() => ({ data: { data: [] } })),
        adminApi.get('/maintenance'),
      ]);
      setPumps(pRes.data?.data || pRes.data?.pumps || []);
      setRecords(mRes.data?.data || []);
    } catch (e) {
      setError('Failed to load data');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const handleSubmit = async () => {
    setError('');
    const pumpName = form.pumpChoice === 'other'
      ? form.pumpCustom.trim()
      : form.pumpChoice;
    if (!pumpName || !form.date || !form.workerName.trim() || !form.description.trim()) {
      setError('Please fill in all fields'); return;
    }
    const selectedPump = pumps.find(p => p.pumpName === form.pumpChoice);
    setSaving(true);
    try {
      await adminApi.post('/maintenance', {
        pump:        pumpName,
        pumpId:      selectedPump?._id,
        date:        form.date,
        workerName:  form.workerName.trim(),
        description: form.description.trim(),
      });
      setForm(emptyForm());
      setShowForm(false);
      loadData();
    } catch (e) {
      setError(e.response?.data?.message || 'Failed to save');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id) => {
    setDelId(id);
    try {
      await adminApi.delete(`/maintenance/${id}`);
      setRecords(r => r.filter(x => x._id !== id));
    } catch {
      alert('Could not delete record');
    } finally {
      setDelId(null);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">

      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div style={{ background: 'linear-gradient(135deg, #052e16 0%, #166534 100%)' }}
        className="px-4 pt-10 pb-5 text-white">
        <div className="flex items-center gap-3 mb-1">
          <button onClick={() => navigate('/admin-dashboard')}
            className="text-white/70 hover:text-white text-xl leading-none">←</button>
          <div>
            <p className="font-black text-lg leading-tight">Maintenance Log</p>
            <p className="text-green-300 text-xs">Track pump servicing records</p>
          </div>
        </div>
      </div>

      {/* ── Add button ─────────────────────────────────────────────────────── */}
      <div className="px-4 py-3">
        <button
          onClick={() => { setShowForm(s => !s); setError(''); }}
          className="w-full py-3.5 rounded-2xl bg-green-700 hover:bg-green-800 text-white font-black text-base shadow active:scale-95 transition-all">
          {showForm ? '✕  Cancel' : '+ Add Maintenance Record'}
        </button>
      </div>

      {/* ── Add form ───────────────────────────────────────────────────────── */}
      {showForm && (
        <div className="mx-4 mb-4 bg-white rounded-3xl shadow-sm border border-gray-100 p-5 space-y-4">
          <p className="font-black text-gray-900 text-base">New Record</p>

          {/* Pump / Location */}
          <div>
            <label className="block text-xs font-bold text-gray-500 mb-1.5 uppercase tracking-wide">
              Pump / Location
            </label>
            <select
              value={form.pumpChoice}
              onChange={e => set('pumpChoice', e.target.value)}
              className="w-full border border-gray-200 rounded-2xl px-4 py-3 text-gray-900 font-medium text-sm focus:outline-none focus:ring-2 focus:ring-green-400 bg-white">
              <option value="">— Select pump —</option>
              {pumps.map(p => (
                <option key={p._id} value={p.pumpName}>{p.pumpName}</option>
              ))}
              <option value="other">Other (type below)</option>
            </select>
            {form.pumpChoice === 'other' && (
              <input
                type="text"
                placeholder="e.g. Generator room, Island 3…"
                value={form.pumpCustom}
                onChange={e => set('pumpCustom', e.target.value)}
                className="mt-2 w-full border border-gray-200 rounded-2xl px-4 py-3 text-gray-900 text-sm focus:outline-none focus:ring-2 focus:ring-green-400"
              />
            )}
          </div>

          {/* Date */}
          <div>
            <label className="block text-xs font-bold text-gray-500 mb-1.5 uppercase tracking-wide">
              Date of Maintenance
            </label>
            <input
              type="date"
              value={form.date}
              onChange={e => set('date', e.target.value)}
              className="w-full border border-gray-200 rounded-2xl px-4 py-3 text-gray-900 font-medium text-sm focus:outline-none focus:ring-2 focus:ring-green-400"
            />
          </div>

          {/* Worker name */}
          <div>
            <label className="block text-xs font-bold text-gray-500 mb-1.5 uppercase tracking-wide">
              Name of Person Who Did the Work
            </label>
            <input
              type="text"
              placeholder="e.g. Emeka, Chidi, NSPC Technician…"
              value={form.workerName}
              onChange={e => set('workerName', e.target.value)}
              className="w-full border border-gray-200 rounded-2xl px-4 py-3 text-gray-900 text-sm focus:outline-none focus:ring-2 focus:ring-green-400"
            />
          </div>

          {/* Description */}
          <div>
            <label className="block text-xs font-bold text-gray-500 mb-1.5 uppercase tracking-wide">
              What Was Done
            </label>
            <textarea
              rows={3}
              placeholder="e.g. Replaced nozzle, serviced meter, changed oil filter…"
              value={form.description}
              onChange={e => set('description', e.target.value)}
              className="w-full border border-gray-200 rounded-2xl px-4 py-3 text-gray-900 text-sm focus:outline-none focus:ring-2 focus:ring-green-400 resize-none"
            />
          </div>

          {error && (
            <p className="text-red-600 text-sm font-semibold text-center">{error}</p>
          )}

          <button
            onClick={handleSubmit}
            disabled={saving}
            className="w-full py-4 rounded-2xl bg-green-700 hover:bg-green-800 disabled:opacity-50 text-white font-black text-base shadow active:scale-95 transition-all">
            {saving ? 'Saving…' : 'Save Record'}
          </button>
        </div>
      )}

      {/* ── Records list ───────────────────────────────────────────────────── */}
      <div className="flex-1 px-4 pb-8">
        {loading ? (
          <p className="text-center text-gray-400 py-12 text-sm">Loading…</p>
        ) : records.length === 0 ? (
          <div className="text-center py-16">
            <p className="text-5xl mb-3">🔧</p>
            <p className="font-bold text-gray-600">No maintenance records yet</p>
            <p className="text-gray-400 text-sm mt-1">Tap the button above to add the first one</p>
          </div>
        ) : (
          <div className="space-y-3">
            <p className="text-xs font-bold text-gray-400 uppercase tracking-wide">
              {records.length} record{records.length !== 1 ? 's' : ''}
            </p>
            {records.map(r => (
              <div key={r._id}
                className="bg-white rounded-3xl border border-gray-100 shadow-sm p-4">
                {/* Top row: pump + date */}
                <div className="flex items-start justify-between gap-2 mb-2">
                  <div className="flex items-center gap-2">
                    <span className="text-xl">⛽</span>
                    <span className="font-black text-gray-900 text-base">{r.pump}</span>
                  </div>
                  <span className="text-xs text-gray-400 shrink-0 font-medium mt-0.5">
                    {fmtDate(r.date)}
                  </span>
                </div>

                {/* Worker */}
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-sm">👤</span>
                  <span className="text-sm font-semibold text-gray-700">{r.workerName}</span>
                </div>

                {/* Description */}
                <p className="text-sm text-gray-600 leading-relaxed bg-gray-50 rounded-xl px-3 py-2">
                  {r.description}
                </p>

                {/* Delete */}
                <div className="mt-3 flex justify-end">
                  <button
                    onClick={() => {
                      if (window.confirm('Delete this maintenance record?')) handleDelete(r._id);
                    }}
                    disabled={delId === r._id}
                    className="text-xs text-red-400 hover:text-red-600 font-semibold px-3 py-1.5 rounded-xl hover:bg-red-50 transition-colors disabled:opacity-40">
                    {delId === r._id ? 'Deleting…' : 'Delete'}
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
