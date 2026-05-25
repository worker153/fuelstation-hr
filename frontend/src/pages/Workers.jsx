import { useEffect, useState, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { Plus, Search, Phone, MapPin, ChevronRight, Users } from 'lucide-react';
import api from '../utils/api';
import VerificationBadge from '../components/VerificationBadge';

export default function Workers() {
  const [workers, setWorkers]     = useState([]);
  const [loading, setLoading]     = useState(true);
  const [search, setSearch]       = useState('');
  const [status, setStatus]       = useState('');
  const [pagination, setPagination] = useState({ page: 1, pages: 1, total: 0 });
  const [page, setPage]           = useState(1);

  const loadWorkers = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page, limit: 15 });
      if (search) params.set('search', search);
      if (status) params.set('status', status);
      const { data } = await api.get(`/workers?${params}`);
      setWorkers(data.data);
      setPagination(data.pagination);
    } catch {
      // silent
    } finally {
      setLoading(false);
    }
  }, [search, status, page]);

  useEffect(() => { loadWorkers(); }, [loadWorkers]);

  // Reset page on filter change
  useEffect(() => { setPage(1); }, [search, status]);

  return (
    <div className="max-w-4xl mx-auto space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Workers</h1>
          <p className="text-sm text-gray-500 mt-0.5">{pagination.total} registered</p>
        </div>
        <Link to="/workers/new" className="btn-primary">
          <Plus size={16} />
          <span className="hidden sm:inline">Add Worker</span>
        </Link>
      </div>

      {/* Filters */}
      <div className="flex gap-3 flex-col sm:flex-row">
        <div className="relative flex-1">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            className="input pl-9"
            placeholder="Search by name or phone…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <select
          className="input sm:w-44"
          value={status}
          onChange={(e) => setStatus(e.target.value)}
        >
          <option value="">All Statuses</option>
          <option value="pending">Pending</option>
          <option value="verified">Verified</option>
        </select>
      </div>

      {/* List */}
      {loading ? (
        <div className="card divide-y divide-gray-50">
          {[...Array(5)].map((_, i) => (
            <div key={i} className="flex items-center gap-3 px-5 py-4 animate-pulse">
              <div className="w-12 h-12 rounded-xl bg-gray-100 shrink-0" />
              <div className="flex-1">
                <div className="h-4 w-40 bg-gray-100 rounded mb-2" />
                <div className="h-3 w-56 bg-gray-100 rounded" />
              </div>
            </div>
          ))}
        </div>
      ) : workers.length === 0 ? (
        <div className="card px-6 py-16 text-center">
          <Users size={48} className="text-gray-200 mx-auto mb-3" />
          <p className="font-medium text-gray-600">No workers found</p>
          {(search || status) && (
            <p className="text-sm text-gray-400 mt-1">Try adjusting your filters</p>
          )}
          {!search && !status && (
            <Link to="/workers/new" className="btn-primary mt-4 inline-flex">
              <Plus size={16} /> Register First Worker
            </Link>
          )}
        </div>
      ) : (
        <div className="card divide-y divide-gray-50">
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
                <p className="font-medium text-gray-900 truncate">{w.fullName}</p>
                <p className="text-xs text-gray-500 mt-0.5 truncate">
                  {w.role} &bull; {w.branch}
                </p>
                <div className="flex items-center gap-1 mt-1 text-xs text-gray-400">
                  <Phone size={10} />
                  {w.phone}
                </div>
              </div>

              {/* Badge */}
              <div className="flex items-center gap-2 shrink-0">
                <VerificationBadge status={w.verificationStatus} />
                <ChevronRight size={16} className="text-gray-300" />
              </div>
            </Link>
          ))}
        </div>
      )}

      {/* Pagination */}
      {pagination.pages > 1 && (
        <div className="flex items-center justify-between pt-2">
          <p className="text-sm text-gray-500">
            Page {pagination.page} of {pagination.pages}
          </p>
          <div className="flex gap-2">
            <button
              className="btn-secondary px-3 py-1.5 text-xs"
              disabled={page <= 1}
              onClick={() => setPage(p => p - 1)}
            >
              Previous
            </button>
            <button
              className="btn-secondary px-3 py-1.5 text-xs"
              disabled={page >= pagination.pages}
              onClick={() => setPage(p => p + 1)}
            >
              Next
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
