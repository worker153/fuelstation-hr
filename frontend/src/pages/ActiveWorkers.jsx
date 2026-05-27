import { useState, useEffect, useCallback } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import {
  Users, Search, ChevronRight, Phone, ShieldCheck,
  Briefcase, Building2, Clock, Filter, Printer
} from 'lucide-react';
import api from '../utils/api';
import VerificationBadge from '../components/VerificationBadge';

// ─── Employment status badge ──────────────────────────────────────────────────
export function EmploymentBadge({ status }) {
  const MAP = {
    registered: { label: 'Registered', cls: 'bg-gray-100 text-gray-600' },
    active:      { label: 'Active',     cls: 'bg-green-100 text-green-700' },
    suspended:   { label: 'Suspended',  cls: 'bg-amber-100 text-amber-700' },
    sacked:      { label: 'Sacked',     cls: 'bg-red-100 text-red-600' },
    inactive:    { label: 'Inactive',   cls: 'bg-gray-100 text-gray-500' },
  };
  const s = MAP[status] || MAP.registered;
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${s.cls}`}>
      {s.label}
    </span>
  );
}

const ROLE_OPTIONS = [
  'Pump Attendant', 'Supervisor', 'Cashier', 'Manager', 'Security',
  'Maintenance', 'Accountant', 'Driver', 'Cleaner'
];

const STATUS_OPTIONS = [
  { value: 'active',    label: 'Active' },
  { value: 'suspended', label: 'Suspended' },
  { value: 'sacked',    label: 'Sacked' },
  { value: 'inactive',  label: 'Inactive' },
];

export default function ActiveWorkers() {
  const [searchParams] = useSearchParams();

  const [workers,    setWorkers   ] = useState([]);
  const [branches,   setBranches  ] = useState([]);
  const [loading,    setLoading   ] = useState(true);
  const [pagination, setPagination] = useState({ page: 1, pages: 1, total: 0 });
  const [page,       setPage      ] = useState(1);

  const [search,   setSearch  ] = useState('');
  const [branchId, setBranchId] = useState(searchParams.get('branchId') || '');
  const [shiftId,  setShiftId ] = useState(searchParams.get('shiftId')  || '');
  const [shifts,   setShifts  ] = useState([]);
  const [role,     setRole    ] = useState('');
  const [status,   setStatus  ] = useState('');

  // Load branches + shifts for filter dropdowns
  useEffect(() => {
    api.get('/branches').then(r => setBranches(r.data.data)).catch(() => {});
    api.get('/shifts').then(r => setShifts(r.data.data)).catch(() => {});
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page, limit: 20 });
      if (search)   params.set('search',   search);
      if (branchId) params.set('branchId', branchId);
      if (shiftId)  params.set('shiftId',  shiftId);
      if (role)     params.set('role',     role);
      if (status)   params.set('status',   status);
      const { data } = await api.get(`/workers/active-workers?${params}`);
      setWorkers(data.data);
      setPagination(data.pagination);
    } catch {
      // silent
    } finally {
      setLoading(false);
    }
  }, [search, branchId, role, status, page]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { setPage(1); }, [search, branchId, shiftId, role, status]);

  // Count by status for the summary chips
  const statusCounts = workers.reduce((acc, w) => {
    acc[w.employmentStatus] = (acc[w.employmentStatus] || 0) + 1;
    return acc;
  }, {});

  return (
    <div className="max-w-5xl mx-auto space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Active Workers</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            {loading ? '…' : `${pagination.total} worker${pagination.total !== 1 ? 's' : ''}`}
            {searchParams.get('branchName') && (
              <span className="ml-1 text-brand-600">· {searchParams.get('branchName')}</span>
            )}
            {searchParams.get('shiftName') && (
              <span className="ml-1 text-brand-600">· {searchParams.get('shiftName')}</span>
            )}
          </p>
        </div>
        <Link to="/workers/new" className="btn-primary">
          + Add Worker
        </Link>
      </div>

      {/* Filters */}
      <div className="card p-4 space-y-3">
        <div className="flex items-center gap-1.5 text-xs font-medium text-gray-500 uppercase tracking-wide">
          <Filter size={12} /> Filters
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {/* Search */}
          <div className="relative">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input className="input pl-9 text-sm"
              placeholder="Search name or phone…"
              value={search} onChange={e => setSearch(e.target.value)} />
          </div>

          {/* Branch */}
          <select className="input text-sm" value={branchId} onChange={e => { setBranchId(e.target.value); setShiftId(''); }}>
            <option value="">All Branches</option>
            {branches.map(b => (
              <option key={b._id} value={b._id}>{b.name}</option>
            ))}
          </select>

          {/* Shift — filtered by selected branch */}
          <select className="input text-sm" value={shiftId} onChange={e => setShiftId(e.target.value)}>
            <option value="">All Shifts</option>
            {(branchId
              ? shifts.filter(s => (s.branch?._id || s.branch) === branchId)
              : shifts
            ).map(s => (
              <option key={s._id} value={s._id}>
                {s.name}{s.startTime ? ` (${s.startTime})` : ''}
              </option>
            ))}
          </select>

          {/* Role */}
          <select className="input text-sm" value={role} onChange={e => setRole(e.target.value)}>
            <option value="">All Roles</option>
            {ROLE_OPTIONS.map(r => <option key={r} value={r}>{r}</option>)}
          </select>

          {/* Status */}
          <select className="input text-sm" value={status} onChange={e => setStatus(e.target.value)}>
            <option value="">All Statuses</option>
            {STATUS_OPTIONS.map(s => (
              <option key={s.value} value={s.value}>{s.label}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Workers */}
      {loading ? (
        <div className="card divide-y divide-gray-50">
          {[...Array(5)].map((_, i) => (
            <div key={i} className="flex items-center gap-4 px-5 py-4 animate-pulse">
              <div className="w-12 h-12 rounded-xl bg-gray-100 shrink-0" />
              <div className="flex-1">
                <div className="h-4 w-40 bg-gray-100 rounded mb-2" />
                <div className="h-3 w-56 bg-gray-100 rounded" />
              </div>
            </div>
          ))}
        </div>
      ) : workers.length === 0 ? (
        <div className="card px-6 py-20 text-center">
          <Users size={52} className="text-gray-200 mx-auto mb-3" />
          <p className="font-semibold text-gray-600">No workers found</p>
          {(search || branchId || shiftId || role || status) && (
            <p className="text-sm text-gray-400 mt-1">Try adjusting your filters</p>
          )}
          {!search && !branchId && !shiftId && !role && !status && (
            <p className="text-sm text-gray-400 mt-1">
              Activate workers from their profile to see them here
            </p>
          )}
        </div>
      ) : (
        <div className="card divide-y divide-gray-50 overflow-hidden">
          {workers.map(w => (
            <Link
              key={w._id}
              to={`/workers/${w._id}`}
              className="flex items-center gap-4 px-5 py-4 hover:bg-gray-50 transition-colors"
            >
              {/* Avatar */}
              {w.passportPhoto?.url
                ? <img src={w.passportPhoto.url} className="w-12 h-12 rounded-xl object-cover border border-gray-200 shrink-0" alt="" />
                : <div className="w-12 h-12 rounded-xl bg-brand-100 text-brand-700 flex items-center justify-center font-bold text-lg shrink-0">
                    {w.fullName[0]}
                  </div>
              }

              {/* Info */}
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-gray-900 truncate">{w.fullName}</p>
                <div className="flex items-center flex-wrap gap-x-3 gap-y-1 mt-0.5">
                  <span className="flex items-center gap-1 text-xs text-gray-500">
                    <Briefcase size={10} /> {w.role}
                  </span>
                  {(w.branchId?.name || w.branch) && (
                    <span className="flex items-center gap-1 text-xs text-gray-500">
                      <Building2 size={10} /> {w.branchId?.name || w.branch}
                    </span>
                  )}
                  {(w.shiftId?.name || w.schedule) && (
                    <span className="flex items-center gap-1 text-xs text-brand-600 font-medium">
                      <Clock size={10} /> {w.shiftId?.name || w.schedule}
                      {w.shiftId?.startTime && w.shiftId?.endTime && (
                        <span className="text-gray-400 font-normal">
                          {w.shiftId.startTime}–{w.shiftId.endTime}
                        </span>
                      )}
                    </span>
                  )}
                  <span className="flex items-center gap-1 text-xs text-gray-400">
                    <Phone size={10} /> {w.phone}
                  </span>
                </div>
              </div>

              {/* Badges */}
              <div className="flex items-center gap-2 shrink-0 flex-wrap justify-end">
                <EmploymentBadge status={w.employmentStatus} />
                <VerificationBadge status={w.verificationStatus} />
              </div>

              {/* Print shortcut */}
              <Link to={`/workers/${w._id}/print`} target="_blank" rel="noopener noreferrer"
                onClick={e => e.stopPropagation()}
                className="p-1.5 text-gray-300 hover:text-brand-600 hover:bg-brand-50 rounded-lg transition-colors shrink-0"
                title="Print / PDF">
                <Printer size={14} />
              </Link>

              <ChevronRight size={16} className="text-gray-300 shrink-0" />
            </Link>
          ))}
        </div>
      )}

      {/* Pagination */}
      {pagination.pages > 1 && (
        <div className="flex items-center justify-between pt-2">
          <p className="text-sm text-gray-500">Page {pagination.page} of {pagination.pages}</p>
          <div className="flex gap-2">
            <button className="btn-secondary px-3 py-1.5 text-xs" disabled={page <= 1}
              onClick={() => setPage(p => p - 1)}>Previous</button>
            <button className="btn-secondary px-3 py-1.5 text-xs" disabled={page >= pagination.pages}
              onClick={() => setPage(p => p + 1)}>Next</button>
          </div>
        </div>
      )}
    </div>
  );
}
