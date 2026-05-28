import { useState, useEffect, useCallback } from 'react';
import {
  Smartphone, Tablet, Monitor, Laptop, HelpCircle,
  Plus, CheckCircle, XCircle, Clock, Shield, ShieldOff, ShieldAlert,
  Building2, Wifi, WifiOff, MapPin, RefreshCw, Trash2, Edit3,
  Eye, EyeOff, Copy, RotateCcw, Check, X, ChevronDown, Filter,
  AlertTriangle, Loader, QrCode
} from 'lucide-react';
import api from '../utils/api';
import { useNotify } from '../context/NotificationContext';
import { useAuth }   from '../context/AuthContext';

const TYPE_ICONS = {
  android_phone: Smartphone,
  tablet:        Tablet,
  kiosk:         Monitor,
  laptop:        Laptop,
  other:         HelpCircle,
};

const TYPE_LABELS = {
  android_phone: 'Android Phone',
  tablet:        'Tablet',
  kiosk:         'Kiosk',
  laptop:        'Laptop',
  other:         'Other',
};

const STATUS_MAP = {
  pending:  { cls: 'bg-amber-100 text-amber-700 border border-amber-200',  icon: Clock,        label: 'Pending'   },
  approved: { cls: 'bg-green-100 text-green-700 border border-green-200',  icon: CheckCircle,  label: 'Approved'  },
  inactive: { cls: 'bg-gray-100  text-gray-600  border border-gray-200',   icon: WifiOff,      label: 'Inactive'  },
  blocked:  { cls: 'bg-red-100   text-red-700   border border-red-200',    icon: ShieldAlert,  label: 'Blocked'   },
};

function StatusBadge({ status }) {
  const { cls, icon: Icon, label } = STATUS_MAP[status] || STATUS_MAP.pending;
  return (
    <span className={`inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full ${cls}`}>
      <Icon size={11} /> {label}
    </span>
  );
}

function timeAgo(date) {
  if (!date) return 'Never';
  const diff = Date.now() - new Date(date).getTime();
  const mins  = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days  = Math.floor(diff / 86400000);
  if (mins < 2)    return 'Just now';
  if (mins < 60)   return `${mins}m ago`;
  if (hours < 24)  return `${hours}h ago`;
  return `${days}d ago`;
}

// ── Register Device Modal ──────────────────────────────────────────────────────
function RegisterModal({ branches, onClose, onCreated }) {
  const notify = useNotify();
  const [name,          setName         ] = useState('');
  const [branchId,      setBranchId     ] = useState('');
  const [type,          setType         ] = useState('android_phone');
  const [allowedRadius, setAllowedRadius] = useState(150);
  const [notes,         setNotes        ] = useState('');
  const [loading,       setLoading      ] = useState(false);

  const submit = async e => {
    e.preventDefault();
    if (!name.trim() || !branchId) return notify('Device name and branch are required', 'error');
    setLoading(true);
    try {
      const { data } = await api.post('/devices', { name, branchId, type, allowedRadius, notes });
      notify('Device registered ✓');
      onCreated(data.data);
    } catch (err) { notify(err.response?.data?.message || 'Failed', 'error'); }
    finally { setLoading(false); }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="bg-white rounded-2xl w-full max-w-md shadow-2xl">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-brand-100 flex items-center justify-center">
              <Smartphone size={15} className="text-brand-700" />
            </div>
            <p className="font-bold text-gray-900 text-sm">Register Attendance Device</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X size={18} /></button>
        </div>

        <form onSubmit={submit} className="px-5 py-5 space-y-4">
          <div>
            <label className="label">Device Name *</label>
            <input className="input" placeholder="e.g. Ekehuan Rd Front Desk" value={name} onChange={e => setName(e.target.value)} required />
          </div>

          <div>
            <label className="label">Branch *</label>
            <select className="input" value={branchId} onChange={e => setBranchId(e.target.value)} required>
              <option value="">{branches.length === 0 ? 'Loading branches…' : '— Select branch —'}</option>
              {branches.map(b => <option key={b._id} value={b._id}>{b.name}</option>)}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Device Type</label>
              <select className="input" value={type} onChange={e => setType(e.target.value)}>
                {Object.entries(TYPE_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select>
            </div>
            <div>
              <label className="label">GPS Radius (m)</label>
              <input type="number" min="10" max="2000" className="input" value={allowedRadius}
                onChange={e => setAllowedRadius(Number(e.target.value))} />
            </div>
          </div>

          <div>
            <label className="label">Notes</label>
            <textarea className="input" rows={2} placeholder="Optional notes about this device..."
              value={notes} onChange={e => setNotes(e.target.value)} />
          </div>

          <div className="flex gap-3 pt-1">
            <button type="submit" disabled={loading}
              className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl bg-brand-600 text-white font-medium text-sm hover:bg-brand-700">
              {loading ? <Loader size={14} className="animate-spin" /> : <><Plus size={14} /> Register Device</>}
            </button>
            <button type="button" onClick={onClose} className="btn-secondary">Cancel</button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── Edit Device Modal ──────────────────────────────────────────────────────────
function EditModal({ device, branches, onClose, onUpdated }) {
  const notify = useNotify();
  const [name,          setName         ] = useState(device.name);
  const [branchId,      setBranchId     ] = useState(String(device.branch?._id || device.branch));
  const [type,          setType         ] = useState(device.type);
  const [allowedRadius, setAllowedRadius] = useState(device.allowedRadius || 150);
  const [notes,         setNotes        ] = useState(device.notes || '');
  const [loading,       setLoading      ] = useState(false);

  const submit = async e => {
    e.preventDefault();
    setLoading(true);
    try {
      const { data } = await api.put(`/devices/${device._id}`, { name, branchId, type, allowedRadius, notes });
      notify('Device updated ✓');
      onUpdated(data.data);
    } catch (err) { notify(err.response?.data?.message || 'Failed', 'error'); }
    finally { setLoading(false); }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="bg-white rounded-2xl w-full max-w-md shadow-2xl">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <p className="font-bold text-gray-900 text-sm">Edit Device — {device.name}</p>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X size={18} /></button>
        </div>

        <form onSubmit={submit} className="px-5 py-5 space-y-4">
          <div>
            <label className="label">Device Name</label>
            <input className="input" value={name} onChange={e => setName(e.target.value)} required />
          </div>
          <div>
            <label className="label">Branch</label>
            <select className="input" value={branchId} onChange={e => setBranchId(e.target.value)}>
              {branches.map(b => <option key={b._id} value={b._id}>{b.name}</option>)}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Type</label>
              <select className="input" value={type} onChange={e => setType(e.target.value)}>
                {Object.entries(TYPE_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select>
            </div>
            <div>
              <label className="label">GPS Radius (m)</label>
              <input type="number" min="10" max="2000" className="input" value={allowedRadius}
                onChange={e => setAllowedRadius(Number(e.target.value))} />
            </div>
          </div>
          <div>
            <label className="label">Notes</label>
            <textarea className="input" rows={2} value={notes} onChange={e => setNotes(e.target.value)} />
          </div>
          <div className="flex gap-3">
            <button type="submit" disabled={loading}
              className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl bg-brand-600 text-white font-medium text-sm">
              {loading ? <Loader size={14} className="animate-spin" /> : 'Save Changes'}
            </button>
            <button type="button" onClick={onClose} className="btn-secondary">Cancel</button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── Block Modal ────────────────────────────────────────────────────────────────
function BlockModal({ device, onClose, onBlocked }) {
  const notify  = useNotify();
  const [reason,  setReason ] = useState('');
  const [loading, setLoading] = useState(false);

  const submit = async e => {
    e.preventDefault();
    setLoading(true);
    try {
      const { data } = await api.post(`/devices/${device._id}/block`, { reason });
      notify('Device blocked');
      onBlocked(data.data);
    } catch (err) { notify(err.response?.data?.message || 'Failed', 'error'); }
    finally { setLoading(false); }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="bg-white rounded-2xl w-full max-w-sm shadow-2xl">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <div className="flex items-center gap-2">
            <ShieldAlert size={16} className="text-red-600" />
            <p className="font-bold text-gray-900 text-sm">Block Device</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X size={18} /></button>
        </div>
        <form onSubmit={submit} className="px-5 py-4 space-y-4">
          <div className="p-3 bg-red-50 rounded-xl text-sm text-red-700">
            <strong>{device.name}</strong> will be immediately blocked. All attendance attempts from this device will be rejected.
          </div>
          <div>
            <label className="label">Reason (optional)</label>
            <textarea className="input" rows={2} placeholder="e.g. Device reported stolen..."
              value={reason} onChange={e => setReason(e.target.value)} />
          </div>
          <div className="flex gap-3">
            <button type="submit" disabled={loading}
              className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl bg-red-600 text-white font-medium text-sm">
              {loading ? <Loader size={14} className="animate-spin" /> : <><ShieldAlert size={14} /> Block Device</>}
            </button>
            <button type="button" onClick={onClose} className="btn-secondary">Cancel</button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── Device Detail Panel ────────────────────────────────────────────────────────
function DevicePanel({ device, branches, onClose, onUpdated }) {
  const notify  = useNotify();
  const [showToken,  setShowToken ] = useState(false);
  const [copied,     setCopied    ] = useState('');
  const [loading,    setLoading   ] = useState('');
  const [showBlock,  setShowBlock ] = useState(false);
  const [showEdit,   setShowEdit  ] = useState(false);

  const copy = (text, key) => {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(key);
      setTimeout(() => setCopied(''), 2000);
    });
  };

  const action = async (path, label) => {
    setLoading(label);
    try {
      const { data } = await api.post(`/devices/${device._id}/${path}`);
      notify(`${label} ✓`);
      onUpdated(data.data);
    } catch (err) { notify(err.response?.data?.message || 'Failed', 'error'); }
    finally { setLoading(''); }
  };

  const handleDelete = async () => {
    if (!confirm(`Delete ${device.name}? This cannot be undone.`)) return;
    try {
      await api.delete(`/devices/${device._id}`);
      notify('Device deleted');
      onClose();
    } catch (err) { notify(err.response?.data?.message || 'Failed', 'error'); }
  };

  const TypeIcon = TYPE_ICONS[device.type] || HelpCircle;
  const terminalUrl = `${window.location.origin}/terminal?token=${device.deviceToken}`;

  return (
    <>
      <div className="fixed inset-0 z-40 bg-black/40" onClick={onClose} />
      <div className="fixed right-0 top-0 bottom-0 z-50 w-full max-w-md bg-white shadow-2xl flex flex-col overflow-hidden">

        {/* Header */}
        <div className="flex items-center gap-3 px-5 py-4 border-b border-gray-100 bg-brand-800 text-white">
          <div className="w-10 h-10 rounded-xl bg-brand-700 flex items-center justify-center">
            <TypeIcon size={20} />
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-bold truncate">{device.name}</p>
            <p className="text-brand-300 text-xs">{TYPE_LABELS[device.type]} · {device.branchName}</p>
          </div>
          <button onClick={onClose} className="text-brand-300 hover:text-white"><X size={20} /></button>
        </div>

        <div className="flex-1 overflow-y-auto">
          {/* Status */}
          <div className="px-5 py-4 border-b border-gray-50">
            <div className="flex items-center justify-between">
              <StatusBadge status={device.status} />
              <span className="text-xs text-gray-400">
                {device.lastOnline ? `Online ${timeAgo(device.lastOnline)}` : 'Never online'}
              </span>
            </div>
            {device.status === 'blocked' && device.blockedReason && (
              <p className="mt-2 text-xs text-red-600 bg-red-50 px-3 py-2 rounded-lg">
                Blocked: {device.blockedReason}
              </p>
            )}
          </div>

          {/* Info rows */}
          <div className="px-5 py-4 space-y-3 border-b border-gray-50">
            <Row label="Branch"        value={device.branchName} />
            <Row label="Type"          value={TYPE_LABELS[device.type]} />
            <Row label="GPS Radius"    value={`${device.allowedRadius}m`} />
            <Row label="Registered"    value={new Date(device.createdAt).toLocaleDateString('en-NG', { day:'numeric', month:'short', year:'numeric' })} />
            <Row label="Last Attendance" value={device.lastAttendanceAt ? timeAgo(device.lastAttendanceAt) : 'No activity'} />
            {device.lastGPS?.lat && (
              <Row label="Last GPS"
                value={<a href={`https://maps.google.com/?q=${device.lastGPS.lat},${device.lastGPS.lng}`}
                  target="_blank" rel="noreferrer"
                  className="text-brand-600 hover:underline flex items-center gap-1">
                  <MapPin size={11} /> View on map
                </a>} />
            )}
            {device.deviceId ? (
              <Row label="Fingerprint" value={<span className="font-mono text-xs text-gray-500">{device.deviceId.slice(0,16)}…</span>} />
            ) : (
              <Row label="Fingerprint" value={<span className="text-amber-600 text-xs">Not registered yet</span>} />
            )}
          </div>

          {/* Setup credentials */}
          <div className="px-5 py-4 space-y-3 border-b border-gray-50">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Device Setup</p>

            <div className="bg-gray-50 rounded-xl p-3 space-y-2">
              <p className="text-xs text-gray-500 mb-1">Registration Code (one-time setup)</p>
              <div className="flex items-center gap-2">
                <code className="flex-1 font-mono text-lg font-bold text-brand-700 tracking-widest">{device.registrationCode}</code>
                <button onClick={() => copy(device.registrationCode, 'code')}
                  className="p-1.5 rounded-lg bg-white border border-gray-200 text-gray-500 hover:text-brand-600">
                  {copied === 'code' ? <Check size={14} className="text-green-600" /> : <Copy size={14} />}
                </button>
              </div>
            </div>

            <div className="bg-gray-50 rounded-xl p-3 space-y-2">
              <p className="text-xs text-gray-500 mb-1">Terminal URL</p>
              <div className="flex items-center gap-2">
                <p className="flex-1 text-xs text-gray-700 font-mono break-all leading-relaxed">
                  {showToken ? terminalUrl : `${window.location.origin}/terminal?token=••••••••`}
                </p>
                <div className="flex gap-1 shrink-0">
                  <button onClick={() => setShowToken(v => !v)}
                    className="p-1.5 rounded-lg bg-white border border-gray-200 text-gray-500 hover:text-brand-600">
                    {showToken ? <EyeOff size={14} /> : <Eye size={14} />}
                  </button>
                  <button onClick={() => copy(terminalUrl, 'url')}
                    className="p-1.5 rounded-lg bg-white border border-gray-200 text-gray-500 hover:text-brand-600">
                    {copied === 'url' ? <Check size={14} className="text-green-600" /> : <Copy size={14} />}
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* Actions */}
          <div className="px-5 py-4 space-y-2">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Actions</p>

            {device.status !== 'approved' && device.status !== 'blocked' && (
              <ActionBtn icon={CheckCircle} label="Approve Device" color="green"
                loading={loading === 'Approve'} onClick={() => action('approve', 'Approve')} />
            )}
            {device.status === 'approved' && (
              <ActionBtn icon={WifiOff} label="Deactivate Device" color="gray"
                loading={loading === 'Deactivate'} onClick={() => action('deactivate', 'Deactivate')} />
            )}
            {device.status === 'inactive' && (
              <ActionBtn icon={CheckCircle} label="Re-activate Device" color="green"
                loading={loading === 'Activate'} onClick={() => action('approve', 'Activate')} />
            )}
            {device.status !== 'blocked' && (
              <ActionBtn icon={ShieldAlert} label="Block Device (stolen / lost)" color="red"
                loading={false} onClick={() => setShowBlock(true)} />
            )}
            {device.status === 'blocked' && (
              <ActionBtn icon={Shield} label="Unblock Device" color="green"
                loading={loading === 'Unblock'} onClick={() => action('approve', 'Unblock')} />
            )}
            <ActionBtn icon={RotateCcw} label="Replace / Reset Token" color="amber"
              loading={loading === 'Reset'} onClick={() => action('reset-token', 'Reset')} />
            <ActionBtn icon={Edit3} label="Edit Device Info" color="blue"
              loading={false} onClick={() => setShowEdit(true)} />
            <ActionBtn icon={Trash2} label="Delete Device" color="red"
              loading={false} onClick={handleDelete} />
          </div>
        </div>
      </div>

      {showBlock && (
        <BlockModal device={device} onClose={() => setShowBlock(false)}
          onBlocked={d => { onUpdated(d); setShowBlock(false); }} />
      )}
      {showEdit && (
        <EditModal device={device} branches={branches} onClose={() => setShowEdit(false)}
          onUpdated={d => { onUpdated(d); setShowEdit(false); }} />
      )}
    </>
  );
}

function ActionBtn({ icon: Icon, label, color, loading, onClick }) {
  const colors = {
    green: 'border-green-200  text-green-700  hover:bg-green-50',
    red:   'border-red-200    text-red-700    hover:bg-red-50',
    gray:  'border-gray-200   text-gray-600   hover:bg-gray-50',
    amber: 'border-amber-200  text-amber-700  hover:bg-amber-50',
    blue:  'border-blue-200   text-blue-700   hover:bg-blue-50',
  };
  return (
    <button onClick={onClick} disabled={loading}
      className={`w-full flex items-center gap-3 px-4 py-2.5 rounded-xl border text-sm font-medium transition-colors ${colors[color]} disabled:opacity-50`}>
      {loading ? <Loader size={15} className="animate-spin" /> : <Icon size={15} />}
      {label}
    </button>
  );
}

function Row({ label, value }) {
  return (
    <div className="flex items-start justify-between gap-3">
      <span className="text-xs text-gray-400 shrink-0 w-32 mt-0.5">{label}</span>
      <span className="text-xs text-gray-800 font-medium text-right">{value}</span>
    </div>
  );
}

// ── Device Card ────────────────────────────────────────────────────────────────
function DeviceCard({ device, onClick }) {
  const TypeIcon = TYPE_ICONS[device.type] || HelpCircle;
  const isOnline = device.lastOnline && (Date.now() - new Date(device.lastOnline) < 5 * 60 * 1000);

  return (
    <button onClick={onClick}
      className="card p-4 w-full text-left hover:shadow-md transition-all hover:-translate-y-0.5 group">
      <div className="flex items-start gap-3">
        <div className={`w-11 h-11 rounded-xl flex items-center justify-center shrink-0 ${
          device.status === 'approved' ? 'bg-brand-100 text-brand-700' :
          device.status === 'blocked'  ? 'bg-red-100   text-red-700'   :
          'bg-gray-100 text-gray-500'
        }`}>
          <TypeIcon size={21} />
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="font-semibold text-gray-900 text-sm truncate">{device.name}</p>
            <StatusBadge status={device.status} />
          </div>
          <div className="flex items-center gap-3 mt-1 flex-wrap">
            <span className="text-xs text-gray-500 flex items-center gap-1">
              <Building2 size={10} /> {device.branchName}
            </span>
            <span className="text-xs text-gray-400">{TYPE_LABELS[device.type]}</span>
          </div>
          <div className="flex items-center gap-3 mt-2 flex-wrap">
            <span className={`text-xs flex items-center gap-1 ${isOnline ? 'text-green-600' : 'text-gray-400'}`}>
              {isOnline ? <Wifi size={10} /> : <WifiOff size={10} />}
              {isOnline ? 'Online' : timeAgo(device.lastOnline)}
            </span>
            {device.lastAttendanceAt && (
              <span className="text-xs text-gray-400">
                Last attendance: {timeAgo(device.lastAttendanceAt)}
              </span>
            )}
            <span className="text-xs text-gray-400 flex items-center gap-1">
              <MapPin size={10} /> {device.allowedRadius}m radius
            </span>
          </div>
          {!device.deviceId && (
            <p className="text-xs text-amber-600 mt-1 flex items-center gap-1">
              <AlertTriangle size={10} /> Not yet set up on device
            </p>
          )}
        </div>
      </div>
    </button>
  );
}

// ── Main Page ──────────────────────────────────────────────────────────────────
export default function AttendanceDevices() {
  const notify     = useNotify();
  const { isSuperAdmin } = useAuth();

  const [devices,       setDevices      ] = useState([]);
  const [branches,      setBranches     ] = useState([]);
  const [loading,       setLoading      ] = useState(true);
  const [showRegister,  setShowRegister ] = useState(false);
  const [selected,      setSelected     ] = useState(null);
  const [filterBranch,  setFilterBranch ] = useState('');
  const [filterStatus,  setFilterStatus ] = useState('');

  // Load branches once on mount — independent of device filters
  useEffect(() => {
    api.get('/branches')
      .then(r => setBranches(r.data.data || []))
      .catch(() => {});
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (filterBranch) params.set('branchId', filterBranch);
      if (filterStatus) params.set('status',   filterStatus);

      const dRes = await api.get(`/devices?${params}`);
      setDevices(dRes.data.data || []);
    } catch { notify('Failed to load devices', 'error'); }
    finally { setLoading(false); }
  }, [filterBranch, filterStatus]);

  useEffect(() => { load(); }, [load]);

  const updateDevice = updated => {
    setDevices(prev => prev.map(d => d._id === updated._id ? updated : d));
    if (selected?._id === updated._id) setSelected(updated);
  };

  const stats = {
    total:    devices.length,
    approved: devices.filter(d => d.status === 'approved').length,
    pending:  devices.filter(d => d.status === 'pending').length,
    blocked:  devices.filter(d => d.status === 'blocked').length,
  };

  if (!isSuperAdmin()) {
    return (
      <div className="flex items-center justify-center h-64">
        <p className="text-gray-400 text-sm">Super Admin access required</p>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-xl font-bold text-gray-900 flex items-center gap-2">
            <Smartphone size={20} className="text-brand-600" />
            Attendance Devices
          </h1>
          <p className="text-sm text-gray-500 mt-0.5">
            Manage approved branch attendance devices — only registered devices can accept worker clock-in
          </p>
        </div>
        <div className="flex gap-2">
          <button onClick={load} className="btn-secondary" title="Refresh">
            <RefreshCw size={14} />
          </button>
          <button onClick={() => setShowRegister(true)} className="btn-primary">
            <Plus size={14} /> Register Device
          </button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: 'Total Devices', value: stats.total,    color: 'text-gray-700',   bg: 'bg-gray-50',   icon: Smartphone },
          { label: 'Approved',      value: stats.approved, color: 'text-green-700',  bg: 'bg-green-50',  icon: CheckCircle },
          { label: 'Pending',       value: stats.pending,  color: 'text-amber-700',  bg: 'bg-amber-50',  icon: Clock },
          { label: 'Blocked',       value: stats.blocked,  color: 'text-red-700',    bg: 'bg-red-50',    icon: ShieldAlert },
        ].map(({ label, value, color, bg, icon: Icon }) => (
          <div key={label} className={`card p-4 ${bg}`}>
            <div className="flex items-center gap-2 mb-1">
              <Icon size={14} className={color} />
              <p className="text-xs text-gray-500">{label}</p>
            </div>
            <p className={`text-2xl font-bold ${color}`}>{value}</p>
          </div>
        ))}
      </div>

      {/* Setup guide */}
      {stats.pending > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 flex items-start gap-3">
          <AlertTriangle size={16} className="text-amber-600 mt-0.5 shrink-0" />
          <div>
            <p className="text-sm font-semibold text-amber-800">{stats.pending} device{stats.pending > 1 ? 's' : ''} waiting for approval</p>
            <p className="text-xs text-amber-700 mt-0.5">
              Click on a device → verify its registration code matches the physical device → click Approve.
            </p>
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="card p-3 flex gap-3 flex-wrap items-center">
        <Filter size={14} className="text-gray-400" />
        <select className="input max-w-[160px]" value={filterBranch} onChange={e => setFilterBranch(e.target.value)}>
          <option value="">All branches</option>
          {branches.map(b => <option key={b._id} value={b._id}>{b.name}</option>)}
        </select>
        <select className="input max-w-[140px]" value={filterStatus} onChange={e => setFilterStatus(e.target.value)}>
          <option value="">All statuses</option>
          <option value="pending">Pending</option>
          <option value="approved">Approved</option>
          <option value="inactive">Inactive</option>
          <option value="blocked">Blocked</option>
        </select>
      </div>

      {/* Device grid */}
      {loading ? (
        <div className="flex justify-center py-12"><Loader size={24} className="animate-spin text-brand-500" /></div>
      ) : devices.length === 0 ? (
        <div className="card py-16 text-center">
          <Smartphone size={36} className="mx-auto text-gray-300 mb-3" />
          <p className="text-gray-500 font-medium">No attendance devices registered</p>
          <p className="text-gray-400 text-sm mt-1">Register your first branch attendance device to get started</p>
          <button onClick={() => setShowRegister(true)} className="btn-primary mt-4 mx-auto">
            <Plus size={14} /> Register First Device
          </button>
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {devices.map(d => (
            <DeviceCard key={d._id} device={d} onClick={() => setSelected(d)} />
          ))}
        </div>
      )}

      {/* How-to-setup guide */}
      <div className="card p-5">
        <p className="font-semibold text-gray-800 text-sm mb-3 flex items-center gap-2">
          <QrCode size={15} className="text-brand-600" /> How to set up an attendance device
        </p>
        <ol className="space-y-2 text-sm text-gray-600 list-decimal list-inside">
          <li>Register the device above (enter name, branch, type)</li>
          <li>Open the device detail — copy the <strong>Registration Code</strong></li>
          <li>On the physical device, open: <code className="bg-gray-100 px-1 rounded text-xs">{window.location.origin}/terminal</code></li>
          <li>Enter the Registration Code when prompted — device fingerprint is bound automatically</li>
          <li>Return here and click <strong>Approve Device</strong> to activate it</li>
          <li>Workers can now clock in/out using that device</li>
        </ol>
      </div>

      {/* Modals */}
      {showRegister && (
        <RegisterModal branches={branches} onClose={() => setShowRegister(false)}
          onCreated={d => { setDevices(prev => [d, ...prev]); setShowRegister(false); }} />
      )}
      {selected && (
        <DevicePanel device={selected} branches={branches}
          onClose={() => setSelected(null)}
          onUpdated={d => { updateDevice(d); }} />
      )}
    </div>
  );
}
