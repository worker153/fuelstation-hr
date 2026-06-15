import { useState, useEffect, useCallback } from 'react';
import {
  ArrowLeftRight, RefreshCw, X, Save, Loader, Fuel, Layers, Flame, Trash2,
  ChevronLeft, ChevronRight, AlertCircle, RefreshCcw,
} from 'lucide-react';
import api from '../utils/api';
import { useNotify } from '../context/NotificationContext';
import { useAuth } from '../context/AuthContext';

// ─── Helpers ──────────────────────────────────────────────────────────────────
function todayWAT() {
  const now    = new Date();
  const watNow = new Date(now.getTime() + 60 * 60 * 1000);
  return `${watNow.getUTCFullYear()}-${String(watNow.getUTCMonth()+1).padStart(2,'0')}-${String(watNow.getUTCDate()).padStart(2,'0')}`;
}

function fmtMeter(val) {
  if (val == null) return <span className="text-gray-400">Pending</span>;
  return <span>{Number(val).toLocaleString()}</span>;
}

function fmtVolume(val) {
  if (val == null) return <span className="text-gray-400">— L</span>;
  return <span className="font-semibold text-brand-700">{Number(val).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} L</span>;
}

const PRODUCT_COLORS = {
  PMS:   { bg: 'bg-green-100',  text: 'text-green-700'  },
  AGO:   { bg: 'bg-amber-100',  text: 'text-amber-700'  },
  LPG:   { bg: 'bg-blue-100',   text: 'text-blue-700'   },
  DPK:   { bg: 'bg-purple-100', text: 'text-purple-700' },
  other: { bg: 'bg-gray-100',   text: 'text-gray-600'   },
};

const STATUS_MAP = {
  active:    { label: 'On Shift',  bg: 'bg-amber-100',  text: 'text-amber-700'  },
  completed: { label: 'Completed', bg: 'bg-green-100',  text: 'text-green-700'  },
  cancelled: { label: 'Cancelled', bg: 'bg-gray-100',   text: 'text-gray-500'   },
};

// ─── Override Modal ───────────────────────────────────────────────────────────
function OverrideModal({ assignment, pumps, onClose, onSaved }) {
  const notify = useNotify();
  const [newPumpId, setNewPumpId] = useState('');
  const [reason,    setReason   ] = useState('');
  const [saving,    setSaving   ] = useState(false);

  const availablePumps = pumps.filter(p => p.status === 'active');

  const submit = async (e) => {
    e.preventDefault();
    if (!newPumpId) return notify('Please select a pump', 'error');
    setSaving(true);
    try {
      const res = await api.post('/pump-assignments/override', {
        assignmentId: assignment._id,
        newPumpId,
        reason: reason.trim(),
      });
      notify('Assignment overridden');
      onSaved(res.data.data);
    } catch (err) {
      notify(err.response?.data?.message || 'Override failed', 'error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4 md:pl-64">
      <div className="bg-white rounded-2xl w-full max-w-sm shadow-2xl">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <div className="flex items-center gap-2">
            <ArrowLeftRight size={16} className="text-amber-600" />
            <h3 className="font-bold text-gray-900 text-sm">Override Pump Assignment</h3>
          </div>
          <button onClick={onClose} className="p-1 text-gray-400 hover:text-gray-600 rounded"><X size={16} /></button>
        </div>

        <form onSubmit={submit} className="px-5 py-4 space-y-4">
          <div className="bg-gray-50 rounded-xl px-4 py-3 text-sm">
            <p className="text-gray-500">Worker</p>
            <p className="font-semibold text-gray-900">{assignment.workerName}</p>
            <p className="text-gray-400 text-xs mt-0.5">Current: {assignment.pumpName}</p>
          </div>

          <div>
            <label className="label">Reassign to Pump *</label>
            <select className="input" value={newPumpId} onChange={e => setNewPumpId(e.target.value)} required>
              <option value="">— Select pump —</option>
              {availablePumps.map(p => (
                <option key={p._id} value={p._id} disabled={String(p._id) === String(assignment.pump)}>
                  {p.pumpName} ({p.productType}){String(p._id) === String(assignment.pump) ? ' — current' : ''}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="label">Reason (optional)</label>
            <input className="input" placeholder="e.g. Pump 1 faulty"
              value={reason} onChange={e => setReason(e.target.value)} />
          </div>

          <div className="flex gap-3">
            <button type="submit" disabled={saving} className="btn-primary flex-1 justify-center">
              {saving ? <Loader size={14} className="animate-spin" /> : <><Save size={13} /> Override</>}
            </button>
            <button type="button" onClick={onClose} className="btn-secondary">Cancel</button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── Today Board Card ─────────────────────────────────────────────────────────
function BoardCard({ assignment, pumps, canManage, onOverride, onDelete }) {
  const pc  = PRODUCT_COLORS[assignment.productType] || PRODUCT_COLORS.other;
  const sta = STATUS_MAP[assignment.status] || STATUS_MAP.active;

  return (
    <div className="card p-4 space-y-3 hover:shadow-md transition-shadow">
      {/* Worker */}
      <div>
        <p className="font-bold text-gray-900 leading-tight">{assignment.workerName}</p>
        <p className="text-xs text-gray-400 mt-0.5">{assignment.workerRole || '—'}</p>
      </div>

      {/* Island or Pump badge */}
      {assignment.islandName ? (
        <div>
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-xl bg-brand-100">
            <Layers size={14} className="text-brand-700" />
            <span className="font-bold text-sm text-brand-700">{assignment.islandName}</span>
          </div>
          {assignment.includesGas && (
            <span className="ml-2 inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 font-semibold">
              <Flame size={11} />AGO + Gas
            </span>
          )}
          {assignment.productTypes?.length > 0 && (
            <div className="flex flex-wrap gap-1 mt-1">
              {assignment.productTypes.map(pt => (
                <span key={pt} className={`text-[10px] px-2 py-0.5 rounded-full font-semibold ${PRODUCT_COLORS[pt]?.bg} ${PRODUCT_COLORS[pt]?.text}`}>{pt}</span>
              ))}
            </div>
          )}
        </div>
      ) : (
        <div className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-xl ${pc.bg}`}>
          <Fuel size={14} className={pc.text} />
          <span className={`font-bold text-sm ${pc.text}`}>{assignment.pumpName}</span>
          <span className={`text-xs font-semibold ${pc.text} opacity-70`}>{assignment.productType}</span>
        </div>
      )}

      {/* Meter info */}
      <div className="grid grid-cols-2 gap-2 text-xs">
        <div>
          <p className="text-gray-400 mb-0.5">Opening</p>
          <p className="font-medium text-gray-700">{fmtMeter(assignment.openingMeter)}</p>
        </div>
        <div>
          <p className="text-gray-400 mb-0.5">Volume Sold</p>
          <p>{fmtVolume(assignment.volume)}</p>
        </div>
      </div>

      {/* Status + override */}
      <div className="flex items-center justify-between pt-1 border-t border-gray-100">
        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${sta.bg} ${sta.text}`}>
          {sta.label}
        </span>
        <div className="flex items-center gap-1.5">
          {assignment.isOverride && (
            <span className="text-[10px] text-amber-600 font-semibold">⚡ Override</span>
          )}
          <div className="flex items-center gap-2">
            {canManage && assignment.status === 'active' && (
              <button
                onClick={() => onOverride(assignment)}
                className="text-xs text-brand-600 hover:text-brand-700 font-medium hover:underline"
              >
                Reassign
              </button>
            )}
            {canManage && (
              <button
                onClick={() => onDelete(assignment)}
                className="p-1 text-gray-300 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                title="Delete assignment"
              >
                <Trash2 size={13} />
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function PumpAssignments() {
  const notify = useNotify();
  const { can, isSuperAdmin } = useAuth();
  const canManage = isSuperAdmin() || can('manageBranches');

  const today = todayWAT();

  const [branches,     setBranches    ] = useState([]);
  const [pumps,        setPumps       ] = useState([]);
  const [assignments,  setAssignments ] = useState([]);
  const [boardData,    setBoardData   ] = useState([]);
  const [total,        setTotal       ] = useState(0);
  const [loading,      setLoading     ] = useState(true);
  const [boardLoading, setBoardLoading] = useState(false);
  const [branchId,     setBranchId    ] = useState('');
  const [date,         setDate        ] = useState(today);
  const [page,         setPage        ] = useState(1);
  const [overrideTarget, setOverrideTarget] = useState(null);
  const [syncing,        setSyncing        ] = useState(false);
  const LIMIT = 50;

  const isToday = date === today;

  // Load branches + pumps once
  useEffect(() => {
    Promise.all([api.get('/branches'), api.get('/pumps')])
      .then(([bRes, pRes]) => {
        setBranches(bRes.data.data || []);
        setPumps(pRes.data.data || []);
      })
      .catch(() => notify('Failed to load branch/pump data', 'error'));
  }, []); // eslint-disable-line

  // Load history assignments
  const loadAssignments = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page, limit: LIMIT, date });
      if (branchId) params.set('branchId', branchId);
      const res = await api.get(`/pump-assignments?${params}`);
      setAssignments(res.data.data || []);
      setTotal(res.data.total || 0);
    } catch {
      notify('Failed to load assignments', 'error');
    } finally {
      setLoading(false);
    }
  }, [branchId, date, page]); // eslint-disable-line

  // Load today's board
  const loadBoard = useCallback(async () => {
    if (!isToday || !branchId) { setBoardData([]); return; }
    setBoardLoading(true);
    try {
      const res = await api.get(`/pump-assignments/today?branchId=${branchId}`);
      setBoardData(res.data.data || []);
    } catch {
      /* silent — board is optional */
    } finally {
      setBoardLoading(false);
    }
  }, [isToday, branchId]); // eslint-disable-line

  useEffect(() => { loadAssignments(); }, [loadAssignments]);
  useEffect(() => { loadBoard(); },      [loadBoard]);

  const branchPumps = branchId ? pumps.filter(p => String(p.branchId) === branchId) : pumps;

  // Volume summary
  const totalVolume = assignments
    .filter(a => a.volume != null)
    .reduce((sum, a) => sum + a.volume, 0);

  const handleOverrideSaved = (updated) => {
    setAssignments(prev => prev.map(a => a._id === updated._id ? updated : a));
    setBoardData(prev  => prev.map(a => a._id === updated._id ? updated : a));
    setOverrideTarget(null);
  };

  const handleSyncMeters = async () => {
    if (!date) return notify('Select a date first', 'error');
    setSyncing(true);
    try {
      const res = await api.post('/pump-assignments/sync-meters', {
        date,
        branchId: branchId || undefined,
      });
      notify(res.data.message || `Synced ${res.data.synced} readings`);
      loadAssignments();
      loadBoard();
    } catch (err) {
      notify(err.response?.data?.message || 'Sync failed', 'error');
    } finally {
      setSyncing(false);
    }
  };

  const handleResetToday = async () => {
    if (!branchId) return notify('Select a branch first', 'error');
    if (!window.confirm('This will delete ALL clock-ins and pump assignments for today so workers can clock in again. Continue?')) return;
    try {
      const res = await api.post('/attendance/reset-today', { branchId });
      notify(res.data.message || 'Today reset — workers can clock in again');
      loadAssignments();
      loadBoard();
    } catch (err) {
      notify(err.response?.data?.message || 'Reset failed', 'error');
    }
  };

  const handleDelete = async (assignment) => {
    if (!window.confirm(`Delete pump assignment for ${assignment.workerName}? This cannot be undone.`)) return;
    try {
      await api.delete(`/pump-assignments/${assignment._id}`);
      setAssignments(prev => prev.filter(a => a._id !== assignment._id));
      setBoardData(prev  => prev.filter(a => a._id !== assignment._id));
      notify('Assignment deleted');
    } catch {
      notify('Delete failed', 'error');
    }
  };

  const totalPages = Math.ceil(total / LIMIT);

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Pump Assignments</h1>
          <p className="text-sm text-gray-500 mt-0.5">Automatic rotation + meter tracking</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          {canManage && isToday && branchId && (
            <button
              onClick={handleResetToday}
              className="btn-secondary gap-1.5 text-sm text-red-600 border-red-200 hover:bg-red-50"
              title="Clear today's clock-ins and assignments so workers can re-clock-in (testing only)"
            >
              Reset Today
            </button>
          )}
          <button
            onClick={handleSyncMeters}
            disabled={syncing}
            className="btn-primary gap-1.5 text-sm"
            title="Pull opening/closing meter readings from StationDesk"
          >
            {syncing
              ? <Loader size={14} className="animate-spin" />
              : <RefreshCcw size={14} />
            }
            Sync Meters
          </button>
          <button onClick={() => { loadAssignments(); loadBoard(); }}
            className="btn-secondary gap-1.5 text-sm">
            <RefreshCw size={14} /> Refresh
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3 items-center">
        <div>
          <label className="label text-xs mb-1">Date</label>
          <input
            type="date"
            className="input py-2 text-sm w-40"
            value={date}
            onChange={e => { setDate(e.target.value); setPage(1); }}
          />
        </div>
        <div>
          <label className="label text-xs mb-1">Branch</label>
          <select
            className="input py-2 text-sm w-44"
            value={branchId}
            onChange={e => { setBranchId(e.target.value); setPage(1); }}
          >
            <option value="">All branches</option>
            {branches.map(b => <option key={b._id} value={b._id}>{b.name}</option>)}
          </select>
        </div>
      </div>

      {/* Summary strip */}
      {!loading && assignments.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="card p-4 text-center">
            <p className="text-2xl font-black text-brand-700">{assignments.length}</p>
            <p className="text-xs text-gray-400 mt-0.5">Assignments</p>
          </div>
          <div className="card p-4 text-center">
            <p className="text-2xl font-black text-green-700">
              {assignments.filter(a => a.status === 'completed').length}
            </p>
            <p className="text-xs text-gray-400 mt-0.5">Completed</p>
          </div>
          <div className="card p-4 text-center">
            <p className="text-2xl font-black text-amber-700">
              {assignments.filter(a => a.status === 'active').length}
            </p>
            <p className="text-xs text-gray-400 mt-0.5">On Shift</p>
          </div>
          <div className="card p-4 text-center">
            <p className="text-lg font-black text-brand-700">
              {totalVolume > 0
                ? `${totalVolume.toLocaleString(undefined, { maximumFractionDigits: 0 })} L`
                : '—'}
            </p>
            <p className="text-xs text-gray-400 mt-0.5">Total Volume</p>
          </div>
        </div>
      )}

      {/* Today's Board */}
      {isToday && branchId && (
        <div>
          <h2 className="text-sm font-bold text-gray-700 uppercase tracking-wide mb-3 flex items-center gap-2">
            Today's Board
            {boardLoading && <Loader size={12} className="animate-spin text-gray-400" />}
          </h2>
          {boardData.length === 0 && !boardLoading ? (
            <div className="card px-5 py-8 text-center text-sm text-gray-400">
              No workers have clocked in yet today for this branch.
            </div>
          ) : (
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
              {boardData.map(a => (
                <BoardCard
                  key={a._id}
                  assignment={a}
                  pumps={branchPumps}
                  canManage={canManage}
                  onOverride={setOverrideTarget}
                  onDelete={handleDelete}
                />
              ))}
            </div>
          )}
        </div>
      )}

      {/* History Table */}
      <div>
        <h2 className="text-sm font-bold text-gray-700 uppercase tracking-wide mb-3">
          {isToday ? 'All Assignments Today' : `Assignments — ${date}`}
        </h2>

        {loading ? (
          <div className="card p-6 text-center">
            <Loader size={22} className="animate-spin text-brand-400 mx-auto" />
          </div>
        ) : assignments.length === 0 ? (
          <div className="card px-6 py-16 text-center">
            <ArrowLeftRight size={44} className="text-gray-200 mx-auto mb-3" />
            <p className="font-semibold text-gray-600">No assignments found</p>
            <p className="text-sm text-gray-400 mt-1">
              {date === today
                ? 'Pump assignments appear here as workers clock in.'
                : 'No data for this date/branch combination.'}
            </p>
          </div>
        ) : (
          <>
            <div className="card overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-100 bg-gray-50">
                      <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Date</th>
                      <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Worker</th>
                      <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Pump</th>
                      <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Product</th>
                      <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Opening</th>
                      <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Closing</th>
                      <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Volume</th>
                      <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Status</th>
                      <th className="px-4 py-3" />
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {assignments.map(a => {
                      const pc  = PRODUCT_COLORS[a.productType] || PRODUCT_COLORS.other;
                      const sta = STATUS_MAP[a.status] || STATUS_MAP.active;
                      return (
                        <tr key={a._id} className="hover:bg-gray-50/60 transition-colors">
                          <td className="px-4 py-3 text-gray-500 whitespace-nowrap font-mono text-xs">{a.date}</td>
                          <td className="px-4 py-3">
                            <p className="font-medium text-gray-900">{a.workerName}</p>
                            <p className="text-xs text-gray-400">{a.workerRole}</p>
                          </td>
                          <td className="px-4 py-3 font-medium text-gray-800 whitespace-nowrap">
                            {a.islandName ? (
                              <span className="flex items-center gap-1.5">
                                <Layers size={13} className="text-brand-600" />
                                {a.islandName}
                                {a.includesGas && <Flame size={12} className="text-amber-600" title="AGO + Gas" />}
                              </span>
                            ) : (a.pumpName || '—')}
                          </td>
                          <td className="px-4 py-3">
                            {a.productTypes?.length > 0 ? (
                              <div className="flex flex-wrap gap-1">
                                {a.productTypes.map(pt => {
                                  const c = PRODUCT_COLORS[pt] || PRODUCT_COLORS.other;
                                  return <span key={pt} className={`inline-flex items-center px-1.5 py-0.5 rounded-full text-[10px] font-semibold ${c.bg} ${c.text}`}>{pt}</span>;
                                })}
                              </div>
                            ) : (
                              <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold ${pc.bg} ${pc.text}`}>
                                {a.productType || '—'}
                              </span>
                            )}
                          </td>
                          <td className="px-4 py-3 text-right font-mono text-xs">{fmtMeter(a.openingMeter)}</td>
                          <td className="px-4 py-3 text-right font-mono text-xs">{fmtMeter(a.closingMeter)}</td>
                          <td className="px-4 py-3 text-right text-xs">{fmtVolume(a.volume)}</td>
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-1.5">
                              <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${sta.bg} ${sta.text}`}>
                                {sta.label}
                              </span>
                              {a.isOverride && (
                                <span className="text-[10px] text-amber-600 font-semibold" title={`Override by ${a.overrideByName}: ${a.overrideReason}`}>
                                  ⚡
                                </span>
                              )}
                            </div>
                          </td>
                          <td className="px-4 py-3 text-right">
                            <div className="flex items-center justify-end gap-2">
                              {canManage && a.status === 'active' && (
                                <button
                                  onClick={() => setOverrideTarget(a)}
                                  className="text-xs text-brand-600 hover:text-brand-700 font-medium hover:underline whitespace-nowrap"
                                >
                                  Reassign
                                </button>
                              )}
                              {canManage && (
                                <button
                                  onClick={() => handleDelete(a)}
                                  className="p-1 text-gray-300 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                                  title="Delete"
                                >
                                  <Trash2 size={13} />
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="flex items-center justify-between mt-3 text-sm">
                <span className="text-gray-500">
                  Page {page} of {totalPages} · {total} total
                </span>
                <div className="flex gap-2">
                  <button
                    onClick={() => setPage(p => Math.max(1, p-1))}
                    disabled={page === 1}
                    className="btn-secondary py-1.5 px-3 disabled:opacity-40"
                  >
                    <ChevronLeft size={14} />
                  </button>
                  <button
                    onClick={() => setPage(p => Math.min(totalPages, p+1))}
                    disabled={page === totalPages}
                    className="btn-secondary py-1.5 px-3 disabled:opacity-40"
                  >
                    <ChevronRight size={14} />
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {/* Info box */}
      {!loading && assignments.length === 0 && (
        <div className="bg-blue-50 border border-blue-200 rounded-xl px-4 py-3 flex gap-3">
          <AlertCircle size={16} className="text-blue-500 shrink-0 mt-0.5" />
          <p className="text-sm text-blue-700">
            Pump assignments are created automatically when workers clock in.
            Each worker is rotated to a different pump each day.
            Supervisors can manually reassign using the Reassign button.
          </p>
        </div>
      )}

      {/* Override modal */}
      {overrideTarget && (
        <OverrideModal
          assignment={overrideTarget}
          pumps={branchId ? branchPumps : pumps}
          onClose={() => setOverrideTarget(null)}
          onSaved={handleOverrideSaved}
        />
      )}
    </div>
  );
}
