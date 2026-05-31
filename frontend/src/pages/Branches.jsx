import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import {
  GitBranch, Plus, Edit2, Phone, MapPin, User, Users,
  CheckCircle, XCircle, X, Save, Loader, ToggleLeft, ToggleRight,
  Building2, Navigation, Link2, AlertCircle, Clock, ChevronDown,
  Camera, Trash2, DollarSign,
} from 'lucide-react';

import api from '../utils/api';
import NumInput from '../components/NumInput';
import { useNotify } from '../context/NotificationContext';
import { useAuth } from '../context/AuthContext';
import MapPicker from '../components/MapPicker';

// ─── Google Maps URL helpers ──────────────────────────────────────────────────
function parseMapsCoords(url) {
  const at = url.match(/@(-?\d+\.\d+),(-?\d+\.\d+)/);
  if (at) return { lat: parseFloat(at[1]), lng: parseFloat(at[2]) };
  const q  = url.match(/[?&]q=(-?\d+\.\d+),(-?\d+\.\d+)/);
  if (q)  return { lat: parseFloat(q[1]),  lng: parseFloat(q[2])  };
  const ll = url.match(/[?&]ll=(-?\d+\.\d+),(-?\d+\.\d+)/);
  if (ll) return { lat: parseFloat(ll[1]), lng: parseFloat(ll[2]) };
  return null;
}

function extractPlaceName(url) {
  const m = url.match(/maps\/place\/([^/@?#]+)/);
  if (m) return decodeURIComponent(m[1]).replace(/\+/g, ' ').replace(/_/g, ' ');
  return '';
}

const isGoogleMapsUrl = (url) =>
  /google\.com\/maps|maps\.app\.goo\.gl|goo\.gl\/maps/i.test(url);

async function reverseGeocode(lat, lng) {
  const r = await fetch(
    `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json&zoom=18`,
    { headers: { 'Accept-Language': 'en', 'User-Agent': 'FuelStationHR/1.0' } }
  );
  if (!r.ok) return '';
  const d = await r.json();
  return d.display_name || '';
}

// ─── Attendance Rule Card ─────────────────────────────────────────────────────
const PRESET_ROLES = ['Supervisor', 'Outside Supervisor', 'Security', 'Pump Attendant', 'Manager', 'Cashier', 'Cleaner', 'Mechanic', 'Driver', 'Accountant'];

function RuleCard({ rule, isDefault, onChange, onRemove }) {
  return (
    <div className={`rounded-xl border p-3 space-y-3 ${isDefault ? 'border-brand-200 bg-brand-50/30' : 'border-gray-200 bg-white'}`}>
      {/* Header */}
      <div className="flex items-center gap-2">
        {isDefault ? (
          <span className="text-sm font-semibold text-brand-700 flex-1">Default (All Roles)</span>
        ) : (
          <>
            <input
              list="role-suggestions-list"
              className="input py-1.5 text-sm flex-1"
              placeholder="Role name — e.g. Supervisor"
              value={rule.role}
              onChange={e => onChange('role', e.target.value)}
            />
            <button type="button" onClick={onRemove}
              className="p-1 text-gray-300 hover:text-red-500 transition-colors shrink-0" title="Remove rule">
              <X size={14} />
            </button>
          </>
        )}
      </div>

      {/* Times */}
      <div className="grid grid-cols-3 gap-2">
        <div>
          <p className="text-xs text-gray-500 font-medium mb-1">Clock-In Time</p>
          <input type="time" className="input py-1.5 text-sm"
            value={rule.clockInDeadline || ''}
            onChange={e => onChange('clockInDeadline', e.target.value)} />
        </div>
        <div>
          <p className="text-xs text-gray-500 font-medium mb-1">Clock-Out Time</p>
          <input type="time" className="input py-1.5 text-sm"
            value={rule.shiftEnd || ''}
            onChange={e => onChange('shiftEnd', e.target.value)} />
          {/* Next-day toggle — for 24-hour shifts like Security */}
          <label className="flex items-center gap-1.5 mt-1.5 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={!!rule.shiftEndNextDay}
              onChange={e => onChange('shiftEndNextDay', e.target.checked)}
              className="rounded accent-brand-600 w-3.5 h-3.5"
            />
            <span className="text-[11px] text-gray-500 font-medium">Next day (+1)</span>
          </label>
        </div>
        <div>
          <p className="text-xs text-gray-500 font-medium mb-1">Absent After</p>
          <input type="time" className="input py-1.5 text-sm"
            value={rule.absentThreshold || ''}
            onChange={e => onChange('absentThreshold', e.target.value)} />
        </div>
      </div>

      {/* Deductions */}
      <div className="grid grid-cols-2 gap-2">
        <div>
          <p className="text-xs text-gray-500 font-medium mb-1">Late ₦</p>
          <NumInput className="input py-1.5 text-sm"
            value={rule.lateDeductionAmount ?? 0}
            onChange={v => onChange('lateDeductionAmount', v)} />
        </div>
        <div>
          <p className="text-xs text-gray-500 font-medium mb-1">Absent ₦</p>
          <NumInput className="input py-1.5 text-sm"
            value={rule.absentDeductionAmount ?? 0}
            onChange={v => onChange('absentDeductionAmount', v)} />
        </div>
        <div>
          <p className="text-xs text-gray-500 font-medium mb-1">No Show ₦ <span className="text-gray-400 font-normal">(full day absent)</span></p>
          <NumInput className="input py-1.5 text-sm" placeholder="e.g. 10000"
            value={rule.noClockInDeductionAmount ?? 0}
            onChange={v => onChange('noClockInDeductionAmount', v)} />
        </div>
        <div>
          <p className="text-xs text-gray-500 font-medium mb-1">Early Exit ₦</p>
          <NumInput className="input py-1.5 text-sm"
            value={rule.earlyDepartureDeductionAmount ?? 0}
            onChange={v => onChange('earlyDepartureDeductionAmount', v)} />
        </div>
      </div>

      {/* Work days — only on default rule */}
      {isDefault && (
        <div>
          <p className="text-xs text-gray-500 font-medium mb-1.5">Work Days</p>
          <div className="flex gap-3 flex-wrap">
            {['Sun','Mon','Tue','Wed','Thu','Fri','Sat'].map((day, i) => (
              <label key={i} className="flex items-center gap-1.5 cursor-pointer">
                <input type="checkbox"
                  checked={(rule.workDays || [1,2,3,4,5,6]).includes(i)}
                  onChange={e => {
                    const cur = rule.workDays || [1,2,3,4,5,6];
                    onChange('workDays', e.target.checked
                      ? [...cur, i].sort((a,b) => a-b)
                      : cur.filter(d => d !== i));
                  }} />
                <span className="text-sm text-gray-700">{day}</span>
              </label>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Branch Form Modal ────────────────────────────────────────────────────────
function BranchModal({ branch, staff, onClose, onSaved }) {
  const notify = useNotify();
  const [saving,       setSaving     ] = useState(false);
  const [showMap,      setShowMap    ] = useState(!!branch?.location?.lat);
  const [mapsLink,     setMapsLink   ] = useState('');
  const [importing,    setImporting  ] = useState(false);
  const [importError,  setImportError] = useState('');
  const [imported,     setImported   ] = useState(false);
  // Photo state
  const [photoFile,    setPhotoFile  ] = useState(null);
  const [photoPreview, setPhotoPreview] = useState(branch?.photo?.url || '');
  const [photoUploading, setPhotoUploading] = useState(false);

  // Migrate legacy attendanceSettings → attendanceRules on first edit
  const getInitialRules = () => {
    if (branch?.attendanceRules?.length > 0) {
      return branch.attendanceRules.map(r => ({ ...r }));
    }
    const s = branch?.attendanceSettings;
    return [{
      role:                         'default',
      clockInDeadline:              s?.clockInDeadline              || '',
      absentThreshold:              s?.absentThreshold              || '',
      shiftEnd:                     s?.shiftEnd                     || '',
      lateDeductionAmount:          s?.lateDeductionAmount          || 0,
      absentDeductionAmount:        s?.absentDeductionAmount        || 0,
      earlyDepartureDeductionAmount:s?.earlyDepartureDeductionAmount|| 0,
      noClockInDeductionAmount:     s?.noClockInDeductionAmount     || 0,
      shiftEndNextDay:              s?.shiftEndNextDay              || false,
      workDays:                     s?.workDays                     || [1,2,3,4,5,6],
    }];
  };

  const getInitialRule = () => {
    const r = branch?.salesShortageRule || {};
    return {
      enabled:        r.enabled        ?? true,
      threshold:      r.threshold      ?? 10000,
      belowPenalty:   r.belowPenalty   ?? 2000,
      atAbovePenalty: r.atAbovePenalty ?? 5000,
    };
  };

  const [form, setForm] = useState({
    name:      branch?.name      || '',
    address:   branch?.address   || '',
    phone:     branch?.phone     || '',
    managerId: branch?.manager?._id || branch?.manager || '',
    location:  branch?.location  || null,
    attendanceRules:   getInitialRules(),
    salesShortageRule: getInitialRule(),
  });
  const [showAttendance,      setShowAttendance     ] = useState(false);
  const [showPenaltyPresets,  setShowPenaltyPresets ] = useState(false);

  const setSalesRule = (key, val) => setForm(f => ({
    ...f,
    salesShortageRule: { ...f.salesShortageRule, [key]: val },
  }));

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const setRule = (idx, key, val) => setForm(f => {
    const rules = [...f.attendanceRules];
    rules[idx] = { ...rules[idx], [key]: val };
    return { ...f, attendanceRules: rules };
  });

  const addRule = () => setForm(f => ({
    ...f,
    attendanceRules: [...f.attendanceRules, {
      role: '', clockInDeadline: '', absentThreshold: '', shiftEnd: '',
      lateDeductionAmount: 0, absentDeductionAmount: 0, earlyDepartureDeductionAmount: 0, noClockInDeductionAmount: 0, shiftEndNextDay: false,
    }],
  }));

  const removeRule = (idx) => setForm(f => ({
    ...f,
    attendanceRules: f.attendanceRules.filter((_, i) => i !== idx),
  }));

  // ── Google Maps import ──────────────────────────────────────────────────────
  const importFromMaps = async () => {
    // Strip accidental trailing punctuation (sometimes browsers append "?")
    const url = mapsLink.trim().replace(/[?&#]+$/, '');
    if (!url) return;
    if (!isGoogleMapsUrl(url)) {
      setImportError('Paste a valid Google Maps link (google.com/maps or maps.app.goo.gl)');
      return;
    }
    setImporting(true);
    setImportError('');
    setImported(false);

    try {
      let lat, lng, finalUrl = url;
      let addressAlreadySet = false;

      // 1. Try to parse coordinates directly from the URL (works for full URLs)
      const directCoords = parseMapsCoords(url);
      if (directCoords) {
        lat = directCoords.lat;
        lng = directCoords.lng;
      } else {
        // 2. Short URL (maps.app.goo.gl) → backend follows the full redirect chain
        const { data } = await api.post('/branches/resolve-url', { url });
        finalUrl = data.data.url || url;

        // Backend extracts the place name / address from the URL path
        if (data.data.address) {
          set('address', data.data.address);
          addressAlreadySet = true;
        }

        if (data.data.lat != null) {
          lat = data.data.lat;
          lng = data.data.lng;
          if (data.data.geocodeNote) {
            setImportError('ℹ️ ' + data.data.geocodeNote);
          }
        } else if (data.data.coordsNotFound) {
          // Address filled but no coords — tell user to pin on map
          setImportError('Address filled in. Coordinates not found — use "Pin on map" to set the exact location.');
          setImported(true);
          setMapsLink('');
          setImporting(false);
          return;
        } else {
          const resolved = parseMapsCoords(finalUrl);
          if (resolved) { lat = resolved.lat; lng = resolved.lng; }
        }
      }

      if (lat == null || lng == null) {
        setImportError(
          'Could not extract coordinates from this link. '
          + 'In Google Maps tap Share → Copy link, then paste that link here.'
        );
        setImporting(false);
        return;
      }

      // 3. Pin the location
      set('location', { lat, lng });

      // 4. If address not already set by backend, fill from URL place name
      const placeName = extractPlaceName(finalUrl);
      if (!addressAlreadySet && placeName) {
        set('address', placeName);
        addressAlreadySet = true;
      }

      // 5. Reverse geocode for full formatted address
      //    Only if we got coords from the URL directly (backend already did this)
      if (!addressAlreadySet) {
        try {
          const addr = await reverseGeocode(lat, lng);
          if (addr) set('address', addr);
        } catch { /* keep place name */ }
      }

      setImported(true);
      setMapsLink('');
    } catch (err) {
      setImportError(err.response?.data?.message || 'Import failed. Please try again.');
    } finally {
      setImporting(false);
    }
  };

  // Auto-import when user pastes a recognisable Maps URL
  const handleMapsLinkChange = (e) => {
    const v = e.target.value;
    setMapsLink(v);
    setImportError('');
    setImported(false);
  };

  // Handle photo file selection
  const handlePhotoSelect = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setPhotoFile(file);
    setPhotoPreview(URL.createObjectURL(file));
  };

  // Delete photo — local preview or server photo
  const handleDeletePhoto = async () => {
    if (photoFile) {
      // Only a local preview — just discard it; restore server photo if any
      setPhotoFile(null);
      setPhotoPreview(branch?.photo?.url || '');
      return;
    }
    if (branch?._id && branch?.photo?.url) {
      try {
        await api.delete(`/branches/${branch._id}/photo`);
        setPhotoPreview('');
        notify('Photo removed');
      } catch {
        notify('Could not remove photo', 'error');
      }
    } else {
      setPhotoPreview('');
    }
  };

  const submit = async (e) => {
    e.preventDefault();
    if (!form.name.trim()) return notify('Branch name is required', 'error');
    setSaving(true);
    try {
      const payload = {
        name:              form.name.trim(),
        address:           form.address.trim(),
        phone:             form.phone.trim(),
        managerId:         form.managerId || null,
        location:          form.location  || null,
        attendanceRules:   form.attendanceRules,
        salesShortageRule: form.salesShortageRule,
      };
      const res = branch
        ? await api.put(`/branches/${branch._id}`, payload)
        : await api.post('/branches', payload);

      const saved = res.data.data;

      // Upload photo if a new one was selected
      if (photoFile) {
        setPhotoUploading(true);
        try {
          const fd = new FormData();
          fd.append('photo', photoFile);
          const photoRes = await api.post(`/branches/${saved._id}/photo`, fd, {
            headers: { 'Content-Type': 'multipart/form-data' },
          });
          saved.photo = photoRes.data.data;
        } catch { notify('Branch saved but photo upload failed', 'error'); }
        finally { setPhotoUploading(false); }
      }

      notify(branch ? 'Branch updated' : 'Branch created ✓');
      onSaved(saved);
    } catch (err) {
      notify(err.response?.data?.message || 'Failed to save branch', 'error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/60 overflow-y-auto md:pl-64">
      <div className="min-h-full flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl w-full max-w-xl shadow-2xl my-6">

          {/* ── Header ─────────────────────────────────────────────────────── */}
          <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-brand-100 flex items-center justify-center shrink-0">
                <Building2 size={18} className="text-brand-600" />
              </div>
              <div>
                <h3 className="font-bold text-gray-900 leading-tight">
                  {branch ? 'Edit Branch' : 'New Branch'}
                </h3>
                <p className="text-xs text-gray-400 mt-0.5">
                  {branch ? 'Update branch details and attendance rules' : 'Add a new branch location'}
                </p>
              </div>
            </div>
            <button onClick={onClose}
              className="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors shrink-0">
              <X size={18} />
            </button>
          </div>

          <form onSubmit={submit} className="divide-y divide-gray-100">

            {/* ── Section 0: Station Photo ──────────────────────────────────── */}
            <div className="px-6 py-5 space-y-3">
              <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-widest">Station Photo</p>

              {/* Hidden file input */}
              <input
                type="file"
                id="branch-photo-input"
                accept="image/*"
                className="hidden"
                onChange={handlePhotoSelect}
              />

              {photoPreview ? (
                <div className="relative rounded-xl overflow-hidden group">
                  <img
                    src={photoPreview}
                    alt="Station preview"
                    className="w-full h-40 object-cover"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/50 to-transparent" />
                  <div className="absolute bottom-2.5 right-2.5 flex gap-2">
                    <button
                      type="button"
                      onClick={() => document.getElementById('branch-photo-input').click()}
                      className="flex items-center gap-1.5 bg-white/90 hover:bg-white text-gray-700 text-xs font-semibold px-3 py-1.5 rounded-lg shadow transition-colors"
                    >
                      <Camera size={12} />
                      Change
                    </button>
                    <button
                      type="button"
                      onClick={handleDeletePhoto}
                      className="flex items-center gap-1.5 bg-red-500 hover:bg-red-600 text-white text-xs font-semibold px-3 py-1.5 rounded-lg shadow transition-colors"
                    >
                      <Trash2 size={12} />
                      Remove
                    </button>
                  </div>
                  {photoFile && (
                    <span className="absolute top-2 left-2 bg-amber-400 text-amber-900 text-[10px] font-bold px-2 py-0.5 rounded-full">
                      New — save to upload
                    </span>
                  )}
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => document.getElementById('branch-photo-input').click()}
                  className="w-full h-32 rounded-xl border-2 border-dashed border-gray-200 hover:border-brand-400 hover:bg-brand-50/30 transition-colors flex flex-col items-center justify-center gap-2 text-gray-400 hover:text-brand-500"
                >
                  <Camera size={22} />
                  <span className="text-sm font-medium">Add Station Photo</span>
                  <span className="text-xs">JPG or PNG · shows as banner on branch card</span>
                </button>
              )}
            </div>

            {/* ── Section 1: Branch Details ─────────────────────────────────── */}
            <div className="px-6 py-5 space-y-4">
              <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-widest">Branch Details</p>

              {/* Name */}
              <div>
                <label className="label">Branch Name *</label>
                <input className="input" placeholder="e.g. Main Branch, North Station…"
                  value={form.name} onChange={e => set('name', e.target.value)} required />
              </div>

              {/* Address */}
              <div>
                <label className="label">Address</label>
                <textarea className="input resize-none" rows={2}
                  placeholder="Full street address (auto-filled on map import)"
                  value={form.address} onChange={e => set('address', e.target.value)} />
              </div>

              {/* Phone + Manager — 2 columns */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="label">Branch Phone</label>
                  <input className="input" placeholder="08012345678" type="tel"
                    value={form.phone} onChange={e => set('phone', e.target.value)} />
                </div>
                <div>
                  <label className="label">Branch Manager</label>
                  <select className="input" value={form.managerId} onChange={e => set('managerId', e.target.value)}>
                    <option value="">— Unassigned —</option>
                    {staff.map(s => (
                      <option key={s._id} value={s._id}>
                        {s.name} ({s.role?.replace(/_/g, ' ')})
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            </div>

            {/* ── Section 2: Location ───────────────────────────────────────── */}
            <div className="px-6 py-5 space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-widest">Location</p>
                <button type="button" onClick={() => setShowMap(v => !v)}
                  className="text-xs text-brand-600 hover:underline flex items-center gap-1 font-medium">
                  <Navigation size={11} />
                  {showMap ? 'Hide map' : form.location?.lat ? 'Adjust on map' : 'Pin on map'}
                </button>
              </div>

              {/* Google Maps Import */}
              <div className={`rounded-xl border p-3.5 space-y-2 transition-colors
                ${imported ? 'border-green-300 bg-green-50' : 'border-dashed border-brand-300 bg-brand-50/40'}`}>
                <div className="flex items-center gap-2">
                  <Link2 size={13} className={imported ? 'text-green-600' : 'text-brand-500'} />
                  <p className="text-xs font-semibold text-gray-700">Import from Google Maps</p>
                  {imported && <span className="text-xs text-green-600 font-medium ml-auto">✓ Location imported</span>}
                </div>
                <p className="text-xs text-gray-400">
                  Open in Google Maps → tap <strong>Share</strong> → <strong>Copy link</strong> → paste below
                </p>
                <div className="flex gap-2">
                  <input
                    type="url"
                    className={`input flex-1 text-sm py-2 ${importError ? 'border-red-300 focus:ring-red-300' : ''}`}
                    placeholder="https://maps.app.goo.gl/... or google.com/maps/..."
                    value={mapsLink}
                    onChange={handleMapsLinkChange}
                    onKeyDown={e => e.key === 'Enter' && (e.preventDefault(), importFromMaps())}
                  />
                  <button
                    type="button"
                    onClick={importFromMaps}
                    disabled={!mapsLink.trim() || importing}
                    className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-brand-600 text-white text-sm font-medium
                               hover:bg-brand-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors shrink-0">
                    {importing
                      ? <Loader size={13} className="animate-spin" />
                      : <><Navigation size={13} /> Import</>
                    }
                  </button>
                </div>
                {importError && (
                  <p className={`text-xs flex items-start gap-1 ${importError.startsWith('ℹ️') ? 'text-brand-600' : 'text-red-600'}`}>
                    {importError.startsWith('ℹ️')
                      ? <span>{importError}</span>
                      : <><AlertCircle size={11} className="shrink-0 mt-0.5" /> {importError}</>
                    }
                  </p>
                )}
                {imported && form.location?.lat && (
                  <p className="text-xs text-green-700 font-mono flex items-center gap-1">
                    <MapPin size={11} />
                    {form.location.lat.toFixed(6)}, {form.location.lng.toFixed(6)}
                  </p>
                )}
              </div>

              {/* Coords display when map hidden */}
              {form.location?.lat && !showMap && (
                <p className="text-xs text-brand-600 font-mono flex items-center gap-1.5">
                  <MapPin size={11} />
                  {form.location.lat.toFixed(6)}, {form.location.lng.toFixed(6)}
                  <button type="button" onClick={() => set('location', null)}
                    className="ml-2 text-gray-400 hover:text-red-500 transition-colors">
                    <X size={11} />
                  </button>
                </p>
              )}
              {showMap && (
                <MapPicker value={form.location} onChange={loc => set('location', loc)} />
              )}
            </div>

            {/* ── Section 3: Attendance Rules ───────────────────────────────── */}
            <div>
              <button type="button" onClick={() => setShowAttendance(v => !v)}
                className="w-full flex items-center justify-between px-6 py-4 hover:bg-gray-50 transition-colors">
                <span className="flex items-center gap-2 text-sm font-medium text-gray-700">
                  <Clock size={15} className="text-brand-500" />
                  Attendance Rules
                  {form.attendanceRules.length > 1 && (
                    <span className="text-xs bg-brand-100 text-brand-700 px-1.5 py-0.5 rounded-full font-medium">
                      {form.attendanceRules.length} roles
                    </span>
                  )}
                </span>
                <ChevronDown size={14} className={`text-gray-400 transition-transform ${showAttendance ? 'rotate-180' : ''}`} />
              </button>

              {showAttendance && (
                <div className="px-6 pb-5 space-y-3 border-t border-gray-100">
                  <datalist id="role-suggestions-list">
                    {PRESET_ROLES.map(r => <option key={r} value={r} />)}
                  </datalist>

                  {form.attendanceRules.map((rule, idx) => (
                    <RuleCard
                      key={idx}
                      rule={rule}
                      isDefault={rule.role === 'default'}
                      onChange={(key, val) => setRule(idx, key, val)}
                      onRemove={() => removeRule(idx)}
                    />
                  ))}

                  <button type="button" onClick={addRule}
                    className="w-full flex items-center justify-center gap-2 py-2.5 border-2 border-dashed border-gray-200 rounded-xl text-sm text-gray-500 hover:border-brand-300 hover:text-brand-600 transition-colors">
                    <Plus size={14} /> Add Role-Specific Rule
                  </button>

                  <p className="text-xs text-gray-500 bg-gray-50 px-3 py-2 rounded-lg">
                    💡 Enter times in Nigerian time (WAT). Set ₦ amounts to 0 to track without deducting.
                  </p>
                </div>
              )}
            </div>

            {/* ── Section 4: Sales Shortage Penalty Rule ────────────────── */}
            <div>
              <button type="button" onClick={() => setShowPenaltyPresets(v => !v)}
                className="w-full flex items-center justify-between px-6 py-4 hover:bg-gray-50 transition-colors">
                <span className="flex items-center gap-2 text-sm font-medium text-gray-700">
                  <DollarSign size={15} className="text-red-500" />
                  Sales Shortage Penalty
                  {form.salesShortageRule.enabled && (
                    <span className="text-xs bg-red-100 text-red-700 px-1.5 py-0.5 rounded-full font-medium">Active</span>
                  )}
                </span>
                <ChevronDown size={14} className={`text-gray-400 transition-transform ${showPenaltyPresets ? 'rotate-180' : ''}`} />
              </button>

              {showPenaltyPresets && (
                <div className="px-6 pb-5 space-y-4 border-t border-gray-100 pt-4">
                  <p className="text-xs text-gray-500">
                    When a supervisor submits a sales shortage, a penalty deduction is automatically added to the worker's salary based on how much they were short.
                  </p>

                  {/* Enable toggle */}
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium text-gray-700">Enable auto-penalty</span>
                    <button type="button"
                      onClick={() => setSalesRule('enabled', !form.salesShortageRule.enabled)}
                      className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-semibold transition-colors
                        ${form.salesShortageRule.enabled
                          ? 'bg-green-100 text-green-700 hover:bg-green-200'
                          : 'bg-gray-100 text-gray-500 hover:bg-gray-200'}`}>
                      {form.salesShortageRule.enabled ? '✓ Enabled' : 'Disabled'}
                    </button>
                  </div>

                  {form.salesShortageRule.enabled && (
                    <>
                      <div>
                        <label className="text-xs font-medium text-gray-600 block mb-1">Threshold Amount (₦)</label>
                        <p className="text-xs text-gray-400 mb-1.5">Shortages at or above this amount get the higher penalty</p>
                        <div className="relative">
                          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm font-medium pointer-events-none">₦</span>
                          <NumInput min={0} className="input pl-7"
                            value={form.salesShortageRule.threshold}
                            onChange={v => setSalesRule('threshold', v)} />
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="text-xs font-medium text-gray-600 block mb-1">
                            Below Threshold Penalty
                          </label>
                          <p className="text-xs text-gray-400 mb-1.5">Shortage &lt; ₦{(form.salesShortageRule.threshold||0).toLocaleString()}</p>
                          <div className="relative">
                            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm font-medium pointer-events-none">₦</span>
                            <NumInput min={0} className="input pl-7"
                              value={form.salesShortageRule.belowPenalty}
                              onChange={v => setSalesRule('belowPenalty', v)} />
                          </div>
                        </div>
                        <div>
                          <label className="text-xs font-medium text-gray-600 block mb-1">
                            At/Above Threshold Penalty
                          </label>
                          <p className="text-xs text-gray-400 mb-1.5">Shortage ≥ ₦{(form.salesShortageRule.threshold||0).toLocaleString()}</p>
                          <div className="relative">
                            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm font-medium pointer-events-none">₦</span>
                            <NumInput min={0} className="input pl-7"
                              value={form.salesShortageRule.atAbovePenalty}
                              onChange={v => setSalesRule('atAbovePenalty', v)} />
                          </div>
                        </div>
                      </div>

                      {/* Live preview */}
                      <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 text-sm space-y-1">
                        <p className="font-semibold text-amber-800 text-xs uppercase tracking-wide">Rule Preview</p>
                        <p className="text-gray-700">
                          Short &lt; ₦{(form.salesShortageRule.threshold||0).toLocaleString()} →
                          <span className="font-bold text-red-600 ml-1">₦{(form.salesShortageRule.belowPenalty||0).toLocaleString()} deducted</span>
                        </p>
                        <p className="text-gray-700">
                          Short ≥ ₦{(form.salesShortageRule.threshold||0).toLocaleString()} →
                          <span className="font-bold text-red-600 ml-1">₦{(form.salesShortageRule.atAbovePenalty||0).toLocaleString()} deducted</span>
                        </p>
                      </div>
                    </>
                  )}
                </div>
              )}
            </div>

            {/* ── Footer Buttons ────────────────────────────────────────────── */}
            <div className="px-6 py-4 flex gap-3 bg-gray-50 rounded-b-2xl">
              <button type="submit" disabled={saving}
                className="btn-primary flex-1 justify-center">
                {saving
                  ? <Loader size={15} className="animate-spin" />
                  : <><Save size={14} /> {branch ? 'Save Changes' : 'Create Branch'}</>
                }
              </button>
              <button type="button" onClick={onClose} className="btn-secondary">Cancel</button>
            </div>
          </form>

        </div>
      </div>
    </div>
  );
}

// ─── Branch Card ──────────────────────────────────────────────────────────────
function BranchCard({ branch, canManage, onEdit, onToggle }) {
  const [toggling, setToggling] = useState(false);

  const handleToggle = async () => {
    setToggling(true);
    try { await onToggle(); }
    finally { setToggling(false); }
  };

  return (
    <div className={`card overflow-hidden transition-all ${!branch.isActive ? 'opacity-60' : ''}`}>
      {/* Station photo — full width banner if present, else colour bar */}
      {branch.photo?.url ? (
        <div className="relative h-36 overflow-hidden">
          <img src={branch.photo.url} alt={branch.name}
            className="w-full h-full object-cover" />
          <div className="absolute inset-0 bg-gradient-to-t from-black/40 to-transparent" />
          {/* Active badge over photo */}
          <span className={`absolute top-2 right-2 inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium backdrop-blur
            ${branch.isActive ? 'bg-green-500/80 text-white' : 'bg-gray-500/80 text-white'}`}>
            {branch.isActive ? <CheckCircle size={10} /> : <XCircle size={10} />}
            {branch.isActive ? 'Active' : 'Inactive'}
          </span>
        </div>
      ) : (
        <div className={`h-1 ${branch.isActive ? 'bg-brand-500' : 'bg-gray-300'}`} />
      )}

      <div className="p-5 space-y-3">
        {/* Top row */}
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <h3 className="font-bold text-gray-900 text-lg">{branch.name}</h3>
              {!branch.photo?.url && (
                <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium
                  ${branch.isActive ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                  {branch.isActive ? <CheckCircle size={10} /> : <XCircle size={10} />}
                  {branch.isActive ? 'Active' : 'Inactive'}
                </span>
              )}
            </div>
            {/* Worker count badge */}
            <div className="flex items-center gap-1.5 mt-1">
              <Users size={13} className="text-brand-400" />
              <span className="text-sm text-gray-600">
                <strong className="text-brand-700">{branch.activeWorkerCount}</strong> active worker{branch.activeWorkerCount !== 1 ? 's' : ''}
              </span>
            </div>
          </div>

          {/* Actions */}
          {canManage && (
            <div className="flex items-center gap-1.5 shrink-0">
              <button onClick={onEdit}
                className="p-2 text-gray-400 hover:text-brand-600 hover:bg-brand-50 rounded-lg transition-colors"
                title="Edit branch">
                <Edit2 size={15} />
              </button>
              <button onClick={handleToggle} disabled={toggling}
                className="p-2 text-gray-400 hover:text-amber-600 hover:bg-amber-50 rounded-lg transition-colors"
                title={branch.isActive ? 'Deactivate branch' : 'Activate branch'}>
                {toggling
                  ? <Loader size={15} className="animate-spin" />
                  : branch.isActive ? <ToggleRight size={17} /> : <ToggleLeft size={17} />
                }
              </button>
            </div>
          )}
        </div>

        {/* Details */}
        <div className="space-y-1.5 text-sm">
          {branch.address && (
            <div className="flex items-start gap-2 text-gray-600">
              <MapPin size={13} className="text-gray-400 mt-0.5 shrink-0" />
              <span>{branch.address}</span>
            </div>
          )}
          {branch.phone && (
            <div className="flex items-center gap-2 text-gray-600">
              <Phone size={13} className="text-gray-400 shrink-0" />
              <span>{branch.phone}</span>
            </div>
          )}
          {branch.manager ? (
            <div className="flex items-center gap-2 text-gray-600">
              <User size={13} className="text-gray-400 shrink-0" />
              <span>
                <span className="font-medium">{branch.manager.name}</span>
                <span className="text-gray-400 ml-1 text-xs capitalize">
                  ({branch.manager.role?.replace(/_/g, ' ')})
                </span>
              </span>
            </div>
          ) : (
            <div className="flex items-center gap-2 text-gray-400">
              <User size={13} className="shrink-0" />
              <span className="text-xs italic">No manager assigned</span>
            </div>
          )}
          {branch.location?.lat && (
            <div className="flex items-center gap-2 text-brand-600">
              <Navigation size={13} className="shrink-0" />
              <span className="text-xs font-mono">
                {branch.location.lat.toFixed(5)}, {branch.location.lng.toFixed(5)}
              </span>
            </div>
          )}
        </div>

        {/* Attendance rules summary */}
        {(() => {
          const rules = branch.attendanceRules?.length > 0
            ? branch.attendanceRules
            : branch.attendanceSettings?.clockInDeadline
              ? [{ role: 'default', ...branch.attendanceSettings }]
              : null;
          if (!rules) return null;
          return (
            <div className="text-xs text-amber-700 bg-amber-50 px-2.5 py-1.5 rounded-lg space-y-0.5">
              {rules.map((r, i) => (
                <div key={i} className="flex items-center gap-1.5 flex-wrap">
                  <Clock size={10} className="shrink-0" />
                  {rules.length > 1 && (
                    <span className="font-semibold">{r.role === 'default' ? 'Default' : r.role}:</span>
                  )}
                  <span className="font-medium">
                    {r.clockInDeadline || '—'}{r.shiftEnd ? ` – ${r.shiftEnd}` : ''}
                  </span>
                  {(r.lateDeductionAmount > 0 || r.absentDeductionAmount > 0) && (
                    <span className="text-amber-600">
                      · Late ₦{Number(r.lateDeductionAmount||0).toLocaleString()}
                      {' '}Absent ₦{Number(r.absentDeductionAmount||0).toLocaleString()}
                    </span>
                  )}
                </div>
              ))}
            </div>
          );
        })()}

        {/* View workers link */}
        <div className="pt-2 border-t border-gray-100">
          <Link
            to={`/active-workers?branchId=${branch._id}&branchName=${encodeURIComponent(branch.name)}`}
            className="text-xs text-brand-600 hover:underline font-medium flex items-center gap-1"
          >
            <Users size={12} /> View workers in this branch →
          </Link>
        </div>
      </div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function Branches() {
  const notify              = useNotify();
  const { can, isSuperAdmin } = useAuth();
  const canManage           = isSuperAdmin() || can('manageBranches');

  const [branches, setBranches] = useState([]);
  const [staff,    setStaff   ] = useState([]);
  const [loading,  setLoading ] = useState(true);
  const [showAll,  setShowAll ] = useState(false);
  const [modal,    setModal   ] = useState(null); // null | 'new' | branch-object

  const load = async () => {
    setLoading(true);
    try {
      const [b, s] = await Promise.all([
        api.get(`/branches?all=${showAll ? 1 : 0}`),
        api.get('/staff')
      ]);
      setBranches(b.data.data);
      setStaff(s.data.data || []);
    } catch {
      notify('Failed to load branches', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [showAll]);   // eslint-disable-line

  const handleSaved = (updated) => {
    setBranches(prev => {
      const idx = prev.findIndex(b => b._id === updated._id);
      if (idx >= 0) {
        const next = [...prev];
        next[idx] = updated;
        return next;
      }
      return [updated, ...prev];
    });
    setModal(null);
  };

  const handleToggle = async (branch) => {
    try {
      const { data } = await api.delete(`/branches/${branch._id}`);
      notify(data.message);
      setBranches(prev => prev.map(b => b._id === branch._id ? { ...b, isActive: data.data.isActive } : b));
    } catch (err) {
      notify(err.response?.data?.message || 'Failed to update branch', 'error');
    }
  };

  const activeBranches   = branches.filter(b => b.isActive);
  const inactiveBranches = branches.filter(b => !b.isActive);

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Branches</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            {activeBranches.length} active
            {inactiveBranches.length > 0 && `, ${inactiveBranches.length} inactive`}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <label className="flex items-center gap-2 text-sm text-gray-600 cursor-pointer select-none">
            <input type="checkbox" className="rounded" checked={showAll} onChange={e => setShowAll(e.target.checked)} />
            Show inactive
          </label>
          {canManage && (
            <button onClick={() => setModal('new')} className="btn-primary">
              <Plus size={16} /> New Branch
            </button>
          )}
        </div>
      </div>

      {/* Grid */}
      {loading ? (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="card p-5 animate-pulse space-y-3">
              <div className="h-5 w-36 bg-gray-100 rounded" />
              <div className="h-3 w-full bg-gray-100 rounded" />
              <div className="h-3 w-2/3 bg-gray-100 rounded" />
            </div>
          ))}
        </div>
      ) : branches.length === 0 ? (
        <div className="card px-6 py-20 text-center">
          <Building2 size={52} className="text-gray-200 mx-auto mb-3" />
          <p className="font-semibold text-gray-600">No branches yet</p>
          <p className="text-sm text-gray-400 mt-1">Create your first branch to get started</p>
          {canManage && (
            <button onClick={() => setModal('new')} className="btn-primary mt-5 inline-flex">
              <Plus size={16} /> Create Branch
            </button>
          )}
        </div>
      ) : (
        <>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {branches.map(b => (
              <BranchCard
                key={b._id}
                branch={b}
                canManage={canManage}
                onEdit={() => setModal(b)}
                onToggle={() => handleToggle(b)}
              />
            ))}
          </div>
        </>
      )}

      {/* Modal */}
      {modal && (
        <BranchModal
          branch={modal === 'new' ? null : modal}
          staff={staff}
          onClose={() => setModal(null)}
          onSaved={handleSaved}
        />
      )}
    </div>
  );
}
