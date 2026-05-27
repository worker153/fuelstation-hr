import { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Clock, Building2, Search, RefreshCw, Loader,
  LogIn, LogOut, UserX, AlertTriangle, CheckCircle,
  ChevronLeft, ChevronRight, Users
} from 'lucide-react';
import api from '../utils/api';
import { useNotify } from '../context/NotificationContext';
import { useAuth } from '../context/AuthContext';

// ── Helpers ───────────────────────────────────────────────────────────────────
const today = () => new Date().toISOString().split('T')[0];

function fmtTime(ts) {
  if (!ts) return '—';
  return new Date(ts).toLocaleTimeString('en-NG', { hour: '2-digit', minute: '2-digit' });
}

function fmtHours(inTs, outTs) {
  if (!inTs || !outTs) return '—';
  const mins = Math.round((new Date(outTs) - new Date(inTs)) / 60000);
  if (mins < 0) return '—';
  const h = Math.floor(mins / 60), m = mins % 60;
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

// Compare clock-in timestamp against branch settings — returns status string
function computeStatus(clockInRecord, settings) {
  if (!clockInRecord) return 'no_show';
  if (!settings?.clockInDeadline) return 'on_time';
  const t = new Date(clockInRecord.timestamp);
  const mins = t.getHours() * 60 + t.getMinutes();
  const [atH, atM] = (settings.absentThreshold || '09:00').split(':').map(Number);
  const [dlH, dlM] = (settings.clockInDeadline  || '07:00').split(':').map(Number);
  if (mins >= atH * 60 + atM) return 'absent';
  if (mins > dlH * 60 + dlM)  return 'late';
  return 'on_time';
}

const STATUS_CFG = {
  on_time: { label: 'On Time', cls: 'bg-green-100 text-green-700',  row: '',                icon: CheckCircle },
  late:    { label: 'Late',    cls: 'bg-amber-100 text-amber-700',  row: 'bg-amber-50/40',  icon: AlertTriangle },
  absent:  { label: 'Absent',  cls: 'bg-red-100 text-red-700',      row: 'bg-red-50/40',    icon: UserX },
  no_show: { label: 'No Show', cls: 'bg-red-100 text-red-700',      row: 'bg-red-50/60',    icon: UserX },
};

function StatusBadge({ status }) {
  const cfg = STATUS_CFG[status] || STATUS_CFG.on_time;
  const Icon = cfg.icon;
  return (
    <span className={`inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full ${cfg.cls}`}>
      <Icon size={10} /> {cfg.label}
    </span>
  );
}

// ── Date navigator ────────────────────────────────────────────────────────────
function DateNav({ value, onChange }) {
  const prev = () => {
    const d = new Date(value); d.setDate(d.getDate() - 1);
    onChange(d.toISOString().split('T')[0]);
  };
  const next = () => {
    const d = new Date(value); d.setDate(d.getDate() + 1);
    const t = today();
    if (d.toISOString().split('T')[0] <= t) onChange(d.toISOString().split('T')[0]);
  };
  const isToday = value === today();

  return (
    <div className="flex items-center gap-1">
      <button onClick={prev} className="p-1.5 rounded-lg hover:bg-gray-100 transition-colors">
        <ChevronLeft size={16} className="text-gray-500" />
      </button>
      <input
        type="date"
        value={value}
        max={today()}
        onChange={e => onChange(e.target.value)}
        className="px-3 py-1.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-400 text-gray-700"
      />
      <button onClick={next} disabled={isToday}
        className="p-1.5 rounded-lg hover:bg-gray-100 transition-colors disabled:opacity-30">
        <ChevronRight size={16} className="text-gray-500" />
      </button>
      {!isToday && (
        <button onClick={() => onChange(today())}
          className="px-2.5 py-1.5 rounded-lg text-xs font-medium text-brand-600 hover:bg-brand-50 transition-colors">
          Today
        </button>
      )}
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function Attendance() {
  const notify = useNotify();
  const { isSuperAdmin, can } = useAuth();
  const isAdmin = isSuperAdmin() || can('manageBranches');

  const [filterDate,   setFilterDate  ] = useState(today());
  const [filterBranch, setFilterBranch] = useState('');
  const [search,       setSearch      ] = useState('');
  const [branches,     setBranches    ] = useState([]);
  const [records,      setRecords     ] = useState([]);   // raw Attendance docs for the day
  const [allWorkers,   setAllWorkers  ] = useState([]);   // active workers for selected branch
  const [loading,      setLoading     ] = useState(false);
  const [processing,   setProcessing  ] = useState(false);

  // Load branches on mount
  useEffect(() => {
    api.get('/branches').then(r => setBranches(r.data.data || [])).catch(() => {});
  }, []);

  const selectedBranch = branches.find(b => b._id === filterBranch);

  // Load attendance records + all workers when filters change
  const load = useCallback(async () => {
    if (!filterDate) return;
    setLoading(true);
    try {
      const params = new URLSearchParams({ date: filterDate, limit: 500 });
      if (filterBranch) params.set('branchId', filterBranch);

      const [attRes, workerRes] = await Promise.allSettled([
        api.get(`/attendance?${params}`),
        filterBranch
          ? api.get(`/workers?branchId=${filterBranch}&status=active&limit=500`)
          : Promise.resolve({ data: { data: [] } }),
      ]);

      setRecords(attRes.status === 'fulfilled' ? (attRes.value.data.data || []) : []);
      setAllWorkers(workerRes.status === 'fulfilled' ? (workerRes.value.data.data || []) : []);
    } catch { notify('Failed to load attendance', 'error'); }
    finally { setLoading(false); }
  }, [filterDate, filterBranch]);

  useEffect(() => { load(); }, [load]);

  // Build display rows — join workers with attendance records
  const rows = useMemo(() => {
    const clockInMap  = {};
    const clockOutMap = {};
    records.forEach(r => {
      const wid = String(r.worker?._id || r.worker);
      if (r.type === 'clock_in'  && !clockInMap[wid])  clockInMap[wid]  = r;
      if (r.type === 'clock_out' && !clockOutMap[wid]) clockOutMap[wid] = r;
    });

    const settings = selectedBranch?.attendanceSettings;

    if (filterBranch && allWorkers.length > 0) {
      // Show all workers for branch with attendance overlay
      return allWorkers.map(w => {
        const wid    = String(w._id);
        const ci     = clockInMap[wid];
        const co     = clockOutMap[wid];
        const status = computeStatus(ci, settings);
        return { _id: wid, fullName: w.fullName, role: w.role, branch: w.branch,
                 clockIn: ci, clockOut: co, status };
      });
    }

    // No branch selected — show raw records only
    const seen = new Set();
    const result = [];
    records.forEach(r => {
      const wid = String(r.worker?._id || r.worker);
      if (!seen.has(wid)) {
        seen.add(wid);
        const ci = clockInMap[wid], co = clockOutMap[wid];
        result.push({
          _id: wid,
          fullName: r.workerName,
          role: r.workerRole,
          branch: r.branchName,
          clockIn: ci, clockOut: co,
          status: computeStatus(ci, settings),
        });
      }
    });
    return result;
  }, [records, allWorkers, filterBranch, selectedBranch]);

  // Filter by search
  const visible = useMemo(() => {
    if (!search.trim()) return rows;
    const q = search.toLowerCase();
    return rows.filter(r =>
      r.fullName?.toLowerCase().includes(q) || r.role?.toLowerCase().includes(q)
    );
  }, [rows, search]);

  // Sort: no_show first, then absent, late, on_time
  const sorted = useMemo(() => {
    const order = { no_show: 0, absent: 1, late: 2, on_time: 3 };
    return [...visible].sort((a, b) => (order[a.status] ?? 4) - (order[b.status] ?? 4));
  }, [visible]);

  // Summary counts
  const summary = useMemo(() => {
    const counts = { on_time: 0, late: 0, absent: 0, no_show: 0 };
    rows.forEach(r => { if (counts[r.status] !== undefined) counts[r.status]++; });
    return counts;
  }, [rows]);

  const handleProcessAbsences = async () => {
    if (!filterBranch) return notify('Select a branch to process absences', 'error');
    if (!window.confirm(`Process no-show absences for ${selectedBranch?.name} on ${filterDate}?\n\nThis will create deduction records for workers who did not clock in.`)) return;
    setProcessing(true);
    try {
      const { data } = await api.post('/attendance/process-absences', {
        branchId: filterBranch, date: filterDate,
      });
      notify(data.message || `${data.processed} absence(s) recorded`);
      load();
    } catch (err) {
      notify(err.response?.data?.message || 'Failed to process absences', 'error');
    } finally { setProcessing(false); }
  };

  return (
    <div className="p-4 sm:p-6 space-y-5 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Attendance</h1>
          <p className="text-gray-500 text-sm mt-0.5">Clock-in / clock-out records by date and branch</p>
        </div>
        <button onClick={load} disabled={loading}
          className="flex items-center gap-2 px-3 py-2 rounded-xl border border-gray-200 text-sm text-gray-600 hover:bg-gray-50 transition-colors">
          <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
          Refresh
        </button>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-2xl border border-gray-200 p-4 flex flex-wrap gap-3 items-end">
        <div>
          <p className="text-xs font-medium text-gray-500 mb-1.5">Date</p>
          <DateNav value={filterDate} onChange={setFilterDate} />
        </div>

        <div className="min-w-[180px]">
          <p className="text-xs font-medium text-gray-500 mb-1.5">Branch</p>
          <select
            className="px-3 py-1.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-400 w-full"
            value={filterBranch}
            onChange={e => setFilterBranch(e.target.value)}>
            <option value="">All branches</option>
            {branches.map(b => <option key={b._id} value={b._id}>{b.name}</option>)}
          </select>
        </div>

        <div className="flex-1 min-w-[180px]">
          <p className="text-xs font-medium text-gray-500 mb-1.5">Search worker</p>
          <div className="relative">
            <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Name or role…"
              className="pl-8 pr-3 py-1.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-400 w-full"
            />
          </div>
        </div>

        {isAdmin && filterBranch && (
          <button
            onClick={handleProcessAbsences}
            disabled={processing}
            className="flex items-center gap-2 px-4 py-1.5 rounded-lg bg-red-600 text-white text-sm font-medium hover:bg-red-700 transition-colors disabled:opacity-50">
            {processing ? <Loader size={14} className="animate-spin" /> : <UserX size={14} />}
            Process No-Shows
          </button>
        )}
      </div>

      {/* Summary strip — only when branch selected */}
      {filterBranch && rows.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { key: 'on_time', label: 'On Time',  icon: CheckCircle,  cls: 'text-green-600', bg: 'bg-green-50 border-green-100' },
            { key: 'late',    label: 'Late',     icon: Clock,        cls: 'text-amber-600', bg: 'bg-amber-50 border-amber-100' },
            { key: 'absent',  label: 'Absent',   icon: AlertTriangle,cls: 'text-red-600',   bg: 'bg-red-50 border-red-100' },
            { key: 'no_show', label: 'No Show',  icon: UserX,        cls: 'text-red-700',   bg: 'bg-red-50 border-red-100' },
          ].map(({ key, label, icon: Icon, cls, bg }) => (
            <div key={key} className={`rounded-xl border p-3 ${bg}`}>
              <div className={`flex items-center gap-1.5 mb-1 ${cls}`}>
                <Icon size={14} />
                <span className="text-xs font-medium">{label}</span>
              </div>
              <p className={`text-2xl font-bold ${cls}`}>{summary[key]}</p>
            </div>
          ))}
        </div>
      )}

      {/* Settings note if branch selected but no settings configured */}
      {filterBranch && selectedBranch &&
       !selectedBranch.attendanceSettings?.clockInDeadline &&
       !selectedBranch.attendanceSettings?.lateDeductionAmount && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 text-sm text-amber-700 flex items-center gap-2">
          <AlertTriangle size={15} />
          No attendance rules configured for this branch. Go to <strong>Branches</strong> → Edit → Attendance Rules to set clock-in deadline and deduction amounts.
        </div>
      )}

      {/* Table */}
      <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-16 gap-2 text-gray-400">
            <Loader size={20} className="animate-spin" />
            <span className="text-sm">Loading…</span>
          </div>
        ) : sorted.length === 0 ? (
          <div className="text-center py-16 space-y-2">
            <Users size={28} className="text-gray-300 mx-auto" />
            <p className="text-gray-400 text-sm">
              {filterBranch ? 'No attendance records for this date and branch' : 'Select a branch or date to view attendance'}
            </p>
          </div>
        ) : (
          <>
            {/* Table header */}
            <div className="hidden sm:grid grid-cols-[2fr_1fr_1fr_1fr_1fr_1fr] gap-4 px-5 py-3 bg-gray-50 border-b border-gray-100 text-xs font-medium text-gray-500 uppercase tracking-wide">
              <span>Worker</span>
              <span>Clock In</span>
              <span>Clock Out</span>
              <span>Hours</span>
              <span>Status</span>
              <span>Branch</span>
            </div>

            {/* Rows */}
            <div className="divide-y divide-gray-50">
              {sorted.map((row, i) => {
                const rowCls = STATUS_CFG[row.status]?.row || '';
                return (
                  <div key={row._id || i}
                    className={`grid grid-cols-1 sm:grid-cols-[2fr_1fr_1fr_1fr_1fr_1fr] gap-2 sm:gap-4 px-5 py-3.5 hover:bg-gray-50/50 transition-colors ${rowCls}`}>
                    {/* Worker */}
                    <div className="flex items-center gap-2.5">
                      <div className="w-7 h-7 rounded-full bg-brand-100 flex items-center justify-center text-xs font-bold text-brand-700 shrink-0">
                        {row.fullName?.[0]?.toUpperCase()}
                      </div>
                      <div>
                        <p className="font-medium text-gray-900 text-sm">{row.fullName}</p>
                        <p className="text-xs text-gray-400">{row.role}</p>
                      </div>
                    </div>

                    {/* Clock In */}
                    <div className="flex sm:block items-center gap-2">
                      <span className="sm:hidden text-xs text-gray-400 w-20 shrink-0">Clock In:</span>
                      <div className="flex items-center gap-1.5">
                        {row.clockIn ? (
                          <>
                            <LogIn size={12} className="text-green-500 shrink-0" />
                            <span className="text-sm text-gray-700 font-mono">{fmtTime(row.clockIn.timestamp)}</span>
                          </>
                        ) : (
                          <span className="text-sm text-gray-300">—</span>
                        )}
                      </div>
                    </div>

                    {/* Clock Out */}
                    <div className="flex sm:block items-center gap-2">
                      <span className="sm:hidden text-xs text-gray-400 w-20 shrink-0">Clock Out:</span>
                      <div className="flex items-center gap-1.5">
                        {row.clockOut ? (
                          <>
                            <LogOut size={12} className="text-red-400 shrink-0" />
                            <span className="text-sm text-gray-700 font-mono">{fmtTime(row.clockOut.timestamp)}</span>
                          </>
                        ) : (
                          <span className="text-sm text-gray-300">—</span>
                        )}
                      </div>
                    </div>

                    {/* Hours */}
                    <div className="flex sm:block items-center gap-2">
                      <span className="sm:hidden text-xs text-gray-400 w-20 shrink-0">Hours:</span>
                      <span className="text-sm text-gray-600">{fmtHours(row.clockIn?.timestamp, row.clockOut?.timestamp)}</span>
                    </div>

                    {/* Status */}
                    <div className="flex sm:block items-center gap-2">
                      <span className="sm:hidden text-xs text-gray-400 w-20 shrink-0">Status:</span>
                      <StatusBadge status={row.status} />
                    </div>

                    {/* Branch */}
                    <div className="flex sm:block items-center gap-2">
                      <span className="sm:hidden text-xs text-gray-400 w-20 shrink-0">Branch:</span>
                      <span className="text-xs text-gray-500">{row.branch || selectedBranch?.name || '—'}</span>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Footer count */}
            <div className="px-5 py-3 border-t border-gray-50 bg-gray-50/50">
              <p className="text-xs text-gray-400">
                {sorted.length} worker{sorted.length !== 1 ? 's' : ''} shown
                {filterBranch && ` · ${summary.on_time + summary.late} present · ${summary.absent + summary.no_show} absent`}
              </p>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
