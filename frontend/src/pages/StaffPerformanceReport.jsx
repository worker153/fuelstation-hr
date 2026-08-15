import { useState, useEffect, useCallback } from 'react';
import {
  BarChart2, UserX, Clock, AlertOctagon, RefreshCw, Filter, Trophy,
} from 'lucide-react';
import api from '../utils/api';
import { useNotify } from '../context/NotificationContext';

const MEDAL = ['🥇', '🥈', '🥉'];

const getRank = (index, count) => {
  if (count === 0) return null;
  if (index < 3) return MEDAL[index];
  return `#${index + 1}`;
};

const getBadgeColor = (index) => {
  if (index === 0) return 'bg-red-100 text-red-700 border border-red-200';
  if (index === 1) return 'bg-orange-100 text-orange-700 border border-orange-200';
  if (index === 2) return 'bg-yellow-100 text-yellow-700 border border-yellow-200';
  return 'bg-gray-100 text-gray-600 border border-gray-200';
};

function WorkerRow({ index, worker, label }) {
  return (
    <div className={`flex items-center gap-3 px-4 py-3 rounded-xl ${index === 0 ? 'bg-red-50/60' : 'bg-gray-50/50'}`}>
      <span className={`w-8 h-8 rounded-lg flex items-center justify-center text-sm font-bold shrink-0 ${getBadgeColor(index)}`}>
        {getRank(index, worker.count)}
      </span>
      <div className="flex-1 min-w-0">
        <p className="font-semibold text-gray-800 text-sm truncate">{worker.workerName || 'Unknown'}</p>
        <p className="text-xs text-gray-400 truncate">
          {worker.workerRole || '—'}
          {worker.branchName ? ` · ${worker.branchName}` : ''}
        </p>
      </div>
      <div className="shrink-0 text-right">
        <p className="text-lg font-black text-gray-700">{worker.count}</p>
        <p className="text-[10px] text-gray-400">{label}</p>
      </div>
    </div>
  );
}

function RankCard({ title, icon: Icon, color, data, label, loading, emptyMsg }) {
  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden flex flex-col">
      {/* Header */}
      <div className={`px-4 py-3.5 flex items-center gap-2.5 border-b border-gray-100 ${color.bg}`}>
        <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${color.icon}`}>
          <Icon size={16} />
        </div>
        <div>
          <p className={`font-bold text-sm ${color.text}`}>{title}</p>
          {!loading && data.length > 0 && (
            <p className="text-[10px] text-gray-400">{data.length} worker{data.length !== 1 ? 's' : ''} ranked</p>
          )}
        </div>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto max-h-[420px]">
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <RefreshCw size={20} className="animate-spin text-gray-300" />
          </div>
        ) : data.length === 0 ? (
          <div className="text-center py-10 px-4">
            <p className="text-gray-300 text-3xl mb-2">✓</p>
            <p className="text-sm text-gray-400">{emptyMsg}</p>
          </div>
        ) : (
          <div className="p-3 space-y-2">
            {data.map((w, i) => (
              <WorkerRow key={String(w._id)} index={i} worker={w} label={label} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export default function StaffPerformanceReport() {
  const notify = useNotify();

  // filters
  const today = new Date();
  const firstOfMonth = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-01`;
  const todayStr = today.toISOString().slice(0, 10);

  const [from,      setFrom     ] = useState(firstOfMonth);
  const [to,        setTo       ] = useState(todayStr);
  const [branchId,  setBranchId ] = useState('');
  const [branches,  setBranches ] = useState([]);
  const [data,      setData     ] = useState({ absences: [], lateArrivals: [], disciplinary: [] });
  const [loading,   setLoading  ] = useState(true);

  useEffect(() => {
    api.get('/branches').then(r => setBranches(r.data.data || [])).catch(() => {});
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = {};
      if (from)     params.from     = from;
      if (to)       params.to       = to;
      if (branchId) params.branchId = branchId;
      const { data: res } = await api.get('/reports/staff-performance', { params });
      setData(res.data);
    } catch {
      notify('Failed to load report', 'error');
    } finally { setLoading(false); }
  }, [from, to, branchId]);

  useEffect(() => { load(); }, [load]);

  return (
    <div className="p-4 sm:p-6 max-w-6xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-black text-gray-900 flex items-center gap-2">
            <BarChart2 size={24} className="text-brand-600" /> Staff Performance Report
          </h1>
          <p className="text-sm text-gray-500 mt-0.5">Workers with most absences, late arrivals, and disciplinary actions</p>
        </div>
        <button onClick={load} className="btn-secondary flex items-center gap-2 text-sm">
          <RefreshCw size={14} /> Refresh
        </button>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 mb-6 flex flex-wrap gap-3 items-end">
        <Filter size={15} className="text-gray-400 self-center shrink-0" />
        <div>
          <label className="label">From</label>
          <input type="date" className="input text-sm" value={from} onChange={e => setFrom(e.target.value)} />
        </div>
        <div>
          <label className="label">To</label>
          <input type="date" className="input text-sm" value={to} onChange={e => setTo(e.target.value)} />
        </div>
        <div>
          <label className="label">Branch</label>
          <select className="input text-sm" value={branchId} onChange={e => setBranchId(e.target.value)}>
            <option value="">All Branches</option>
            {branches.map(b => <option key={b._id} value={b._id}>{b.name}</option>)}
          </select>
        </div>
        {/* Quick ranges */}
        <div className="flex gap-2 flex-wrap self-end">
          {[
            { label: 'This Month', fn: () => { setFrom(firstOfMonth); setTo(todayStr); } },
            { label: 'Last Month', fn: () => {
              const d = new Date(today.getFullYear(), today.getMonth() - 1, 1);
              const last = new Date(today.getFullYear(), today.getMonth(), 0);
              setFrom(d.toISOString().slice(0, 10));
              setTo(last.toISOString().slice(0, 10));
            }},
            { label: 'This Year', fn: () => { setFrom(`${today.getFullYear()}-01-01`); setTo(todayStr); } },
          ].map(r => (
            <button key={r.label} onClick={r.fn}
              className="text-xs px-3 py-1.5 rounded-lg border border-gray-200 hover:bg-brand-50 hover:border-brand-300 hover:text-brand-700 transition-colors">
              {r.label}
            </button>
          ))}
        </div>
      </div>

      {/* Summary tiles */}
      {!loading && (
        <div className="grid grid-cols-3 gap-3 mb-6">
          <div className="bg-red-50 rounded-xl p-3.5 text-center border border-red-100">
            <p className="text-2xl font-black text-red-700">{data.absences.reduce((s, w) => s + w.count, 0)}</p>
            <p className="text-xs text-red-500 mt-0.5">Total Absences</p>
          </div>
          <div className="bg-orange-50 rounded-xl p-3.5 text-center border border-orange-100">
            <p className="text-2xl font-black text-orange-600">{data.lateArrivals.reduce((s, w) => s + w.count, 0)}</p>
            <p className="text-xs text-orange-500 mt-0.5">Total Late Arrivals</p>
          </div>
          <div className="bg-purple-50 rounded-xl p-3.5 text-center border border-purple-100">
            <p className="text-2xl font-black text-purple-700">{data.disciplinary.reduce((s, w) => s + w.count, 0)}</p>
            <p className="text-xs text-purple-500 mt-0.5">Total Disciplinary</p>
          </div>
        </div>
      )}

      {/* Three columns */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <RankCard
          title="Most Absent"
          icon={UserX}
          color={{ bg: 'bg-red-50/40', icon: 'bg-red-100 text-red-600', text: 'text-red-800' }}
          data={data.absences}
          label="absences"
          loading={loading}
          emptyMsg="No absences recorded in this period"
        />
        <RankCard
          title="Most Late Arrivals"
          icon={Clock}
          color={{ bg: 'bg-orange-50/40', icon: 'bg-orange-100 text-orange-600', text: 'text-orange-800' }}
          data={data.lateArrivals}
          label="late arrivals"
          loading={loading}
          emptyMsg="No late arrivals recorded in this period"
        />
        <RankCard
          title="Most Disciplinary"
          icon={AlertOctagon}
          color={{ bg: 'bg-purple-50/40', icon: 'bg-purple-100 text-purple-600', text: 'text-purple-800' }}
          data={data.disciplinary}
          label="offences"
          loading={loading}
          emptyMsg="No disciplinary actions in this period"
        />
      </div>

      <p className="text-center text-xs text-gray-400 mt-6">
        Absences and late arrivals are counted from shortage deduction records · Disciplinary from the Disciplinary module
      </p>
    </div>
  );
}
