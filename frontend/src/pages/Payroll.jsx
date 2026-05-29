import { useState, useEffect, useCallback, useRef } from 'react';
import { Link } from 'react-router-dom';
import {
  DollarSign, Plus, Printer, Share2, ChevronDown, ChevronUp,
  Building2, Users, AlertCircle, CheckCircle, Loader, Trash2,
  Save, Lock, LockOpen, TrendingDown, Gift, ReceiptText, X, Edit2, Check
} from 'lucide-react';
import api from '../utils/api';
import { useNotify } from '../context/NotificationContext';
import { useAuth } from '../context/AuthContext';

// ─── Constants ────────────────────────────────────────────────────────────────
const MONTHS = ['January','February','March','April','May','June',
                'July','August','September','October','November','December'];

const fmt = (n) => `₦${Number(n || 0).toLocaleString('en-NG', { minimumFractionDigits: 0 })}`;
const fmtShort = (n) => {
  const v = Number(n || 0);
  if (v >= 1000000) return `₦${(v/1000000).toFixed(1)}M`;
  if (v >= 1000)    return `₦${(v/1000).toFixed(0)}K`;
  return `₦${v.toLocaleString()}`;
};

// Net pay computed client-side (mirrors backend pre-save hook)
const computeNetPay = (e) => {
  const calc   = e.calculatedSalary != null ? e.calculatedSalary : (e.grossSalary || 0);
  const wdm    = (e.workingDaysInMonth > 0 ? e.workingDaysInMonth : 26);
  const daily  = (e.grossSalary || 0) / wdm;
  const absDed = (e.absentDays || 0) * daily;
  return Math.max(0, calc - absDed - (e.shortage || 0) + (e.bonus || 0));
};

// ─── Generate modal ───────────────────────────────────────────────────────────
function GenerateModal({ onClose, onGenerated }) {
  const notify = useNotify();
  const now    = new Date();
  const [month,    setMonth   ] = useState(now.getMonth() + 1);
  const [year,     setYear    ] = useState(now.getFullYear());
  const [branchId, setBranchId] = useState('');
  const [branches, setBranches] = useState([]);
  const [loading,  setLoading ] = useState(false);

  const years = Array.from({ length: 5 }, (_, i) => now.getFullYear() - i);

  useEffect(() => {
    api.get('/branches').then(r => setBranches(r.data.data || [])).catch(() => {});
  }, []);

  const submit = async (e) => {
    e.preventDefault();
    if (!branchId) return notify('Please select a branch', 'error');
    setLoading(true);
    try {
      const { data } = await api.post('/payroll/generate', { month, year, branchId });
      notify(`${data.data.label} payroll generated ✓`);
      onGenerated(data.data);
    } catch (err) {
      if (err.response?.status === 409) {
        notify(err.response.data.message, 'error');
        if (err.response.data.data) onGenerated(err.response.data.data);
      } else {
        notify(err.response?.data?.message || 'Failed to generate payroll', 'error');
      }
    } finally { setLoading(false); }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="bg-white rounded-2xl w-full max-w-sm shadow-2xl">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-brand-100 flex items-center justify-center">
              <ReceiptText size={15} className="text-brand-600" />
            </div>
            <p className="font-bold text-gray-900 text-sm">Generate Payroll</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X size={18} /></button>
        </div>
        <form onSubmit={submit} className="px-5 py-5 space-y-4">
          {/* Branch selector */}
          <div>
            <label className="label flex items-center gap-1.5"><Building2 size={12} /> Branch *</label>
            <select className="input" value={branchId} onChange={e => setBranchId(e.target.value)} required>
              <option value="">— Select branch —</option>
              {branches.map(b => <option key={b._id} value={b._id}>{b.name}</option>)}
            </select>
          </div>
          {/* Month / Year */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Month</label>
              <select className="input" value={month} onChange={e => setMonth(Number(e.target.value))}>
                {MONTHS.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
              </select>
            </div>
            <div>
              <label className="label">Year</label>
              <select className="input" value={year} onChange={e => setYear(Number(e.target.value))}>
                {years.map(y => <option key={y} value={y}>{y}</option>)}
              </select>
            </div>
          </div>
          <p className="text-xs text-gray-400">
            Generates payroll for all <strong>active workers</strong> in the selected branch.
          </p>
          <div className="flex gap-3 pt-1">
            <button type="submit" disabled={loading}
              className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl bg-brand-600 text-white font-medium text-sm hover:bg-brand-700 transition-colors">
              {loading ? <Loader size={15} className="animate-spin" /> : <><ReceiptText size={14} /> Generate</>}
            </button>
            <button type="button" onClick={onClose} className="btn-secondary">Cancel</button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── Editable cell ────────────────────────────────────────────────────────────
function EditCell({ value, onChange, highlight }) {
  const [editing, setEditing] = useState(false);
  const [draft,   setDraft  ] = useState('');
  const inputRef = useRef(null);

  const open = () => { setDraft(value ? String(value) : ''); setEditing(true); setTimeout(() => inputRef.current?.select(), 50); };
  const save = () => { onChange(Number(draft) || 0); setEditing(false); };

  if (editing) return (
    <div className="flex items-center gap-1">
      <input ref={inputRef} type="number" min="0" className="w-24 px-2 py-1 border border-brand-400 rounded-lg text-sm text-right focus:outline-none focus:ring-2 focus:ring-brand-300"
        value={draft} onChange={e => setDraft(e.target.value)}
        onKeyDown={e => { if (e.key === 'Enter') save(); if (e.key === 'Escape') setEditing(false); }}
        onBlur={save} />
    </div>
  );

  return (
    <button onClick={open}
      className={`text-sm font-medium px-2 py-0.5 rounded hover:bg-gray-100 transition-colors tabular-nums
        ${highlight && value > 0 ? 'text-red-600' : 'text-gray-700'}`}>
      {fmt(value)}
    </button>
  );
}

// ─── Worker row ───────────────────────────────────────────────────────────────
function WorkerRow({ entry, idx, onChange, readonly }) {
  const netPay = computeNetPay(entry);
  const isProrated = entry.isProrated && entry.calculatedSalary != null && entry.calculatedSalary < entry.grossSalary;

  const removeProration = () => {
    // Override proration — use full gross salary
    onChange('isProrated', false);
    onChange('calculatedSalary', entry.grossSalary);
  };

  return (
    <tr className={`border-b border-gray-50 hover:bg-gray-50/50 transition-colors ${entry.paid ? 'opacity-60' : ''}`}>
      <td className="py-3 px-3 text-xs text-gray-400 tabular-nums w-8">{idx + 1}</td>
      <td className="py-3 px-2">
        <div>
          <div className="flex items-center gap-1.5 flex-wrap">
            <p className="text-sm font-medium text-gray-900 leading-tight">{entry.fullName}</p>
            {isProrated && (
              readonly
                ? <span className="text-xs px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-700 font-medium leading-none whitespace-nowrap">
                    Prorated {entry.daysWorked}/{entry.daysInMonth}d
                  </span>
                : <button
                    onClick={removeProration}
                    title="Click to remove proration — pay full salary"
                    className="flex items-center gap-0.5 text-xs px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-700 font-medium leading-none whitespace-nowrap hover:bg-red-100 hover:text-red-700 transition-colors group">
                    Prorated {entry.daysWorked}/{entry.daysInMonth}d
                    <X size={10} className="opacity-50 group-hover:opacity-100 ml-0.5" />
                  </button>
            )}
          </div>
          <p className="text-xs text-gray-400">{entry.role}</p>
        </div>
      </td>
      <td className="py-3 px-2 hidden md:table-cell">
        {entry.bankName ? (
          <div>
            <p className="text-xs font-medium text-gray-700">{entry.accountName || '—'}</p>
            <p className="text-xs text-gray-400">{entry.bankName}</p>
            <p className="text-xs font-mono text-gray-500">{entry.accountNumber || '—'}</p>
          </div>
        ) : (
          <span className="text-xs text-amber-600 flex items-center gap-1">
            <AlertCircle size={11} /> No bank details
          </span>
        )}
      </td>
      {/* Gross / Earned salary */}
      <td className="py-3 px-2 text-right">
        {readonly ? (
          <div>
            <span className="text-sm font-medium tabular-nums text-gray-700">{fmt(entry.grossSalary)}</span>
            {isProrated && (
              <p className="text-xs text-amber-600 tabular-nums">{fmt(entry.calculatedSalary)} earned</p>
            )}
          </div>
        ) : (
          <div>
            <EditCell value={entry.grossSalary} onChange={v => onChange('grossSalary', v)} />
            {isProrated && (
              <p className="text-xs text-amber-600 tabular-nums mt-0.5">{fmt(entry.calculatedSalary)} earned</p>
            )}
          </div>
        )}
      </td>
      {/* Absent days */}
      <td className="py-3 px-2 text-right hidden sm:table-cell">
        {readonly ? (
          <div>
            <span className={`text-sm font-medium tabular-nums ${entry.absentDays > 0 ? 'text-orange-600' : 'text-gray-400'}`}>
              {entry.absentDays > 0 ? entry.absentDays : '0'}
            </span>
            {entry.absentDays > 0 && (
              <p className="text-xs text-orange-500 tabular-nums">−{fmt(entry.absenceDeduction || (entry.absentDays * (entry.grossSalary / (entry.workingDaysInMonth || 26))))}</p>
            )}
          </div>
        ) : (
          <div>
            <EditCell value={entry.absentDays || 0} onChange={v => onChange('absentDays', v)} />
            {entry.absentDays > 0 && (
              <p className="text-xs text-orange-500 mt-0.5 tabular-nums">
                −{fmt((entry.absentDays) * (entry.grossSalary / (entry.workingDaysInMonth || 26)))}
              </p>
            )}
          </div>
        )}
      </td>
      {/* Shortage */}
      <td className="py-3 px-2 text-right">
        {readonly
          ? <span className={`text-sm font-medium tabular-nums ${entry.shortage > 0 ? 'text-red-600' : 'text-gray-400'}`}>{entry.shortage > 0 ? `−${fmt(entry.shortage)}` : '₦0'}</span>
          : <EditCell value={entry.shortage} onChange={v => onChange('shortage', v)} highlight />
        }
      </td>
      {/* Bonus */}
      <td className="py-3 px-2 text-right hidden lg:table-cell">
        {readonly
          ? <span className={`text-sm font-medium tabular-nums ${entry.bonus > 0 ? 'text-green-600' : 'text-gray-400'}`}>{entry.bonus > 0 ? `+${fmt(entry.bonus)}` : '₦0'}</span>
          : <EditCell value={entry.bonus} onChange={v => onChange('bonus', v)} />
        }
      </td>
      {/* Net pay */}
      <td className="py-3 px-3 text-right">
        <span className={`text-sm font-bold tabular-nums ${netPay > 0 ? 'text-brand-700' : 'text-gray-400'}`}>
          {fmt(netPay)}
        </span>
      </td>
      {!readonly && (
        <td className="py-3 px-2 text-center">
          <button
            onClick={() => onChange('paid', !entry.paid)}
            className={`w-5 h-5 rounded border flex items-center justify-center transition-colors mx-auto
              ${entry.paid ? 'bg-green-500 border-green-500 text-white' : 'border-gray-300 hover:border-green-400'}`}>
            {entry.paid && <Check size={11} />}
          </button>
        </td>
      )}
    </tr>
  );
}

// ─── Workers table (flat, single-branch payroll) ─────────────────────────────
function WorkerTable({ entries, onEntryChange, readonly }) {
  return (
    <div className="card overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="border-b border-gray-100 bg-gray-50">
              <th className="py-2.5 px-3 text-left text-xs font-semibold text-gray-400 w-8">#</th>
              <th className="py-2.5 px-2 text-left text-xs font-semibold text-gray-400">Worker</th>
              <th className="py-2.5 px-2 text-left text-xs font-semibold text-gray-400 hidden md:table-cell">Bank Details</th>
              <th className="py-2.5 px-2 text-right text-xs font-semibold text-gray-400">Gross Salary</th>
              <th className="py-2.5 px-2 text-right text-xs font-semibold text-orange-400 hidden sm:table-cell">Absent</th>
              <th className="py-2.5 px-2 text-right text-xs font-semibold text-red-400">Shortage</th>
              <th className="py-2.5 px-2 text-right text-xs font-semibold text-green-500 hidden lg:table-cell">Bonus</th>
              <th className="py-2.5 px-3 text-right text-xs font-semibold text-brand-600">Net Pay</th>
              {!readonly && <th className="py-2.5 px-2 text-center text-xs font-semibold text-gray-400">Paid</th>}
            </tr>
          </thead>
          <tbody>
            {entries.map((entry, idx) => (
              <WorkerRow
                key={entry._id}
                entry={entry}
                idx={idx}
                readonly={readonly}
                onChange={(field, val) => onEntryChange(entry._id, field, val)}
              />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─── Past Payrolls list ───────────────────────────────────────────────────────
function PastPayrolls({ onOpen }) {
  const [payrolls, setPayrolls] = useState([]);
  const [loading,  setLoading ] = useState(true);

  useEffect(() => {
    api.get('/payroll').then(r => setPayrolls(r.data.data)).catch(() => {}).finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="text-center py-6"><div className="animate-spin rounded-full h-5 w-5 border-b-2 border-brand-600 mx-auto" /></div>;
  if (payrolls.length === 0) return (
    <div className="text-center py-10 text-gray-400">
      <ReceiptText size={32} className="mx-auto mb-2 text-gray-300" />
      <p className="text-sm">No payrolls generated yet</p>
    </div>
  );

  return (
    <div className="space-y-2">
      {payrolls.map(p => (
        <button key={p._id} onClick={() => onOpen(p._id)}
          className="w-full flex items-center gap-4 px-4 py-3.5 bg-white border border-gray-200 rounded-xl hover:border-brand-300 hover:bg-brand-50/30 transition-colors text-left">
          <div className="w-10 h-10 rounded-xl bg-brand-100 flex items-center justify-center shrink-0">
            <ReceiptText size={16} className="text-brand-600" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              {p.branchName && (
                <span className="flex items-center gap-1 text-xs font-semibold text-brand-700 bg-brand-50 px-2 py-0.5 rounded-full">
                  <Building2 size={10} /> {p.branchName}
                </span>
              )}
              <p className="font-semibold text-gray-900 text-sm">
                {MONTHS[(p.month || 1) - 1]} {p.year}
              </p>
            </div>
            <p className="text-xs text-gray-400 mt-0.5">{p.workerCount} workers · Net {fmt(p.totalNet)}</p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <span className={`text-xs font-medium px-2 py-0.5 rounded-full
              ${p.status === 'finalised' ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'}`}>
              {p.status === 'finalised' ? 'Final' : 'Draft'}
            </span>
          </div>
        </button>
      ))}
    </div>
  );
}

// ─── Main Payroll Page ────────────────────────────────────────────────────────
export default function Payroll() {
  const notify = useNotify();
  const { user, can, isSuperAdmin } = useAuth();
  const canManage = isSuperAdmin() || can('manageBranches');

  const [view,       setView      ] = useState('list');  // 'list' | 'edit'
  const [payroll,    setPayroll   ] = useState(null);
  const [entries,    setEntries   ] = useState([]);      // local editable copy
  const [showGen,    setShowGen   ] = useState(false);
  const [saving,     setSaving    ] = useState(false);
  const [finalising, setFinalising] = useState(false);
  const [unlocking,  setUnlocking ] = useState(false);
  const [deleting,   setDeleting  ] = useState(false);
  const [listKey,    setListKey   ] = useState(0);

  // Open a payroll by ID
  const openPayroll = useCallback(async (id) => {
    try {
      const { data } = await api.get(`/payroll/${id}`);
      setPayroll(data.data);
      setEntries(data.data.entries.map(e => ({ ...e })));
      setView('edit');
    } catch {
      notify('Failed to load payroll', 'error');
    }
  }, []);

  // Handle entry cell change (local state only)
  const handleEntryChange = (entryId, field, value) => {
    setEntries(prev => prev.map(e => {
      if (e._id !== entryId) return e;
      const updated = { ...e, [field]: value };
      // If grossSalary changed, recompute calculatedSalary
      if (field === 'grossSalary') {
        if (updated.isProrated && updated.daysInMonth > 0) {
          updated.calculatedSalary = Math.round((value * updated.daysWorked / updated.daysInMonth) * 100) / 100;
        } else {
          updated.calculatedSalary = value;
        }
      }
      // If proration was removed, set calculatedSalary = grossSalary
      if (field === 'isProrated' && value === false) {
        updated.calculatedSalary = updated.grossSalary;
      }
      return updated;
    }));
  };

  // Save to backend
  const handleSave = async () => {
    setSaving(true);
    try {
      const updates = entries.map(e => ({
        _id:             e._id,
        grossSalary:     e.grossSalary,
        isProrated:      e.isProrated,
        calculatedSalary: e.calculatedSalary,
        absentDays:      e.absentDays || 0,
        shortage:        e.shortage,
        bonus:           e.bonus,
        paid:            e.paid,
        notes:           e.notes || ''
      }));
      const { data } = await api.put(`/payroll/${payroll._id}`, { entries: updates });
      setPayroll(data.data);
      setEntries(data.data.entries.map(e => ({ ...e })));
      notify('Payroll saved ✓');
    } catch (err) {
      notify(err.response?.data?.message || 'Failed to save', 'error');
    } finally { setSaving(false); }
  };

  const handleFinalise = async () => {
    if (!confirm(`Finalise ${payroll.label} payroll? It will be locked from editing.`)) return;
    setFinalising(true);
    try {
      const { data } = await api.post(`/payroll/${payroll._id}/finalise`);
      setPayroll(data.data);
      setEntries(data.data.entries.map(e => ({ ...e })));
      notify('Payroll finalised ✓');
    } catch { notify('Failed to finalise', 'error'); }
    finally { setFinalising(false); }
  };

  const handleUnlock = async () => {
    if (!confirm(`Re-open "${payroll.label}" for editing? This will change it back to Draft.`)) return;
    setUnlocking(true);
    try {
      const { data } = await api.post(`/payroll/${payroll._id}/unlock`);
      setPayroll(data.data);
      setEntries(data.data.entries.map(e => ({ ...e })));
      notify('Payroll re-opened as draft ✓');
    } catch (err) {
      notify(err.response?.data?.message || 'Failed to unlock', 'error');
    } finally { setUnlocking(false); }
  };

  const handleDelete = async () => {
    if (!confirm(`Delete ${payroll.label} payroll? This cannot be undone.`)) return;
    setDeleting(true);
    try {
      await api.delete(`/payroll/${payroll._id}`);
      notify('Payroll deleted');
      setView('list'); setPayroll(null); setListKey(k => k + 1);
    } catch (err) {
      notify(err.response?.data?.message || 'Failed', 'error');
    } finally { setDeleting(false); }
  };

  // ── Print ─────────────────────────────────────────────────────────────────
  const handlePrint = () => window.print();

  // ── WhatsApp ──────────────────────────────────────────────────────────────
  const handleWhatsApp = () => {
    if (!payroll) return;
    const companyName = user?.company?.name || 'HR System';

    const totalGross    = entries.reduce((s, e) => s + (e.grossSalary || 0), 0);
    const totalShortage = entries.reduce((s, e) => s + (e.shortage    || 0), 0);
    const totalBonus    = entries.reduce((s, e) => s + (e.bonus       || 0), 0);
    const totalNet      = entries.reduce((s, e) => s + computeNetPay(e), 0);

    const lines = [
      `💰 *PAYROLL — ${payroll.label}*`,
      payroll.status === 'finalised' ? `✅ FINALISED` : `📝 DRAFT`,
      `━━━━━━━━━━━━━━━━━━━━━━━━━━`,
      `🏢 *${payroll.branchName || 'Branch'}* · ${entries.length} worker${entries.length !== 1 ? 's' : ''}`,
      ``
    ];

    entries.forEach((e, i) => {
      const net   = computeNetPay(e);
      const parts = [`${i + 1}. ${e.fullName} (${e.role}) — *${fmt(net)}*`];
      if (e.isProrated && e.daysWorked != null)
        parts.push(`  ↳ Prorated: ${e.daysWorked}/${e.daysInMonth} days (${fmt(e.calculatedSalary)} earned)`);
      if (e.absentDays > 0)
        parts.push(`  ↳ Absent: ${e.absentDays} day${e.absentDays !== 1 ? 's' : ''} deducted`);
      if (e.shortage > 0) parts.push(`  ↳ Shortage: −${fmt(e.shortage)}`);
      if (e.bankName)     parts.push(`  ↳ ${e.bankName}: ${e.accountNumber}`);
      lines.push(parts.join('\n'));
    });

    lines.push(
      ``,
      `━━━━━━━━━━━━━━━━━━━━━━━━━━`,
      `📊 *TOTALS*`,
      `Gross Salary:  ${fmt(totalGross)}`,
      totalShortage > 0 ? `Total Shortage: −${fmt(totalShortage)}` : null,
      totalBonus    > 0 ? `Total Bonus:   +${fmt(totalBonus)}`    : null,
      `*Net Payable:  ${fmt(totalNet)}*`,
      ``,
      `━━━━━━━━━━━━━━━━━━━━━━━━━━`,
      `_${companyName}_`,
      `_${new Date().toLocaleDateString('en-NG', { day: 'numeric', month: 'long', year: 'numeric' })}_`
    );

    window.open(`https://wa.me/?text=${encodeURIComponent(lines.filter(l => l !== null).join('\n'))}`, '_blank');
  };

  // Computed totals from local state
  const totalGross    = entries.reduce((s, e) => s + (e.grossSalary || 0), 0);
  const totalShortage = entries.reduce((s, e) => s + (e.shortage    || 0), 0);
  const totalBonus    = entries.reduce((s, e) => s + (e.bonus       || 0), 0);
  const totalAbsent   = entries.reduce((s, e) => s + (e.absentDays  || 0), 0);
  const totalNet      = entries.reduce((s, e) => s + computeNetPay(e), 0);

  const readonly = payroll?.status === 'finalised';

  // ────────────────────────────────────────────────────────────────────────
  return (
    <>
      {/* ── Main UI (hidden when printing) ─────────────────────────────── */}
      <div className="no-print space-y-5">
        {/* Header */}
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div>
            <h1 className="text-xl font-bold text-gray-900">Payroll</h1>
            <p className="text-sm text-gray-500 mt-0.5">
              {view === 'edit' && payroll ? `${payroll.label} · ${entries.length} workers` : 'Manage monthly payroll'}
            </p>
          </div>
          <div className="flex gap-2 flex-wrap">
            {view === 'edit' && (
              <>
                <button onClick={() => { setView('list'); setPayroll(null); setListKey(k=>k+1); }}
                  className="btn-secondary text-sm">← Back</button>
                <button onClick={handlePrint}
                  className="flex items-center gap-1.5 px-3 py-2 rounded-lg border border-gray-200 bg-white text-gray-700 text-sm font-medium hover:bg-gray-50 transition-colors">
                  <Printer size={14} /> Print
                </button>
                <button onClick={handleWhatsApp}
                  className="flex items-center gap-1.5 px-3 py-2 rounded-lg border border-green-200 bg-green-50 text-green-700 text-sm font-medium hover:bg-green-100 transition-colors">
                  <Share2 size={14} /> WhatsApp
                </button>
                {canManage && !readonly && (
                  <button onClick={handleSave} disabled={saving}
                    className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-brand-600 text-white text-sm font-medium hover:bg-brand-700 transition-colors">
                    {saving ? <Loader size={14} className="animate-spin" /> : <><Save size={14} /> Save</>}
                  </button>
                )}
              </>
            )}
            {canManage && view === 'list' && (
              <button onClick={() => setShowGen(true)}
                className="btn-primary">
                <Plus size={14} /> New Payroll
              </button>
            )}
          </div>
        </div>

        {/* ── List view ──────────────────────────────────────────────── */}
        {view === 'list' && (
          <div className="card p-5">
            <h2 className="font-semibold text-gray-800 mb-4">Payroll History</h2>
            <PastPayrolls key={listKey} onOpen={openPayroll} />
          </div>
        )}

        {/* ── Edit view ──────────────────────────────────────────────── */}
        {view === 'edit' && payroll && (
          <>
            {/* Status bar */}
            <div className={`flex items-center justify-between gap-3 px-4 py-3 rounded-xl border flex-wrap
              ${readonly ? 'bg-green-50 border-green-200' : 'bg-amber-50 border-amber-200'}`}>
              <div className="flex items-center gap-2 flex-wrap">
                {readonly ? (
                  <>
                    <Lock size={14} className="text-green-600" />
                    <span className="text-sm font-medium text-green-800">Finalised</span>
                    {canManage && (
                      <span className="text-xs text-green-600">— unlock to make changes</span>
                    )}
                  </>
                ) : (
                  <>
                    <Edit2 size={14} className="text-amber-600" />
                    <span className="text-sm font-medium text-amber-800">Draft — click any amount to edit</span>
                  </>
                )}
              </div>
              {canManage && (
                <div className="flex gap-2 flex-wrap">
                  {readonly ? (
                    <button onClick={handleUnlock} disabled={unlocking}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-brand-600 text-white text-xs font-medium hover:bg-brand-700 transition-colors">
                      {unlocking ? <Loader size={12} className="animate-spin" /> : <><LockOpen size={12} /> Unlock &amp; Edit</>}
                    </button>
                  ) : (
                    <button onClick={handleFinalise} disabled={finalising}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-green-600 text-white text-xs font-medium hover:bg-green-700 transition-colors">
                      {finalising ? <Loader size={12} className="animate-spin" /> : <><Lock size={12} /> Finalise</>}
                    </button>
                  )}
                  <button onClick={handleDelete} disabled={deleting || readonly}
                    title={readonly ? 'Unlock payroll before deleting' : ''}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-medium transition-colors
                      ${readonly
                        ? 'border-gray-200 bg-gray-50 text-gray-300 cursor-not-allowed'
                        : 'border-red-200 bg-red-50 text-red-600 hover:bg-red-100'}`}>
                    {deleting ? <Loader size={12} className="animate-spin" /> : <><Trash2 size={12} /> Delete</>}
                  </button>
                </div>
              )}
            </div>

            {/* Summary cards */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {[
                { label: 'Workers',       value: entries.length,     icon: Users,        cls: 'bg-blue-50  text-blue-600'  },
                { label: 'Gross Salary',  value: fmt(totalGross),    icon: DollarSign,   cls: 'bg-gray-50  text-gray-600'  },
                { label: 'Total Shortage',value: fmt(totalShortage), icon: TrendingDown, cls: 'bg-red-50   text-red-600'   },
                { label: 'Net Payable',   value: fmt(totalNet),      icon: ReceiptText,  cls: 'bg-brand-50 text-brand-600' },
              ].map(({ label, value, icon: Icon, cls }) => (
                <div key={label} className="card p-4">
                  <div className={`w-8 h-8 rounded-lg flex items-center justify-center mb-2 ${cls}`}>
                    <Icon size={15} />
                  </div>
                  <p className="text-xs text-gray-400">{label}</p>
                  <p className="font-bold text-gray-900 text-lg leading-tight">
                    {label === 'Workers' ? value : value}
                  </p>
                  {label === 'Workers' && totalAbsent > 0 && (
                    <p className="text-xs text-orange-500 mt-0.5">{totalAbsent} absent day{totalAbsent !== 1 ? 's' : ''}</p>
                  )}
                </div>
              ))}
            </div>

            {/* Workers by branch */}
            {entries.length === 0 ? (
              <div className="card p-10 text-center text-gray-400">
                <Users size={32} className="mx-auto mb-2 text-gray-300" />
                <p>No active workers found for this period</p>
              </div>
            ) : (
              <>
                <WorkerTable
                  entries={entries}
                  onEntryChange={handleEntryChange}
                  readonly={readonly}
                />

                {/* Grand total */}
                <div className="card px-5 py-4">
                  <div className="flex items-center justify-between flex-wrap gap-3">
                    <p className="font-bold text-gray-900">Grand Total</p>
                    <div className="flex items-center gap-6 flex-wrap">
                      <div className="text-center">
                        <p className="text-xs text-gray-400">Gross</p>
                        <p className="font-semibold text-gray-700 tabular-nums">{fmt(totalGross)}</p>
                      </div>
                      {totalShortage > 0 && (
                        <div className="text-center">
                          <p className="text-xs text-red-400">Shortage</p>
                          <p className="font-semibold text-red-600 tabular-nums">−{fmt(totalShortage)}</p>
                        </div>
                      )}
                      {totalBonus > 0 && (
                        <div className="text-center">
                          <p className="text-xs text-green-500">Bonus</p>
                          <p className="font-semibold text-green-600 tabular-nums">+{fmt(totalBonus)}</p>
                        </div>
                      )}
                      <div className="text-center border-l border-gray-200 pl-6">
                        <p className="text-xs text-brand-500 font-semibold">Net Payable</p>
                        <p className="font-bold text-brand-700 text-xl tabular-nums">{fmt(totalNet)}</p>
                      </div>
                    </div>
                  </div>
                </div>
              </>
            )}
          </>
        )}
      </div>

      {/* ── Print layout (visible only when printing) ──────────────────── */}
      {view === 'edit' && payroll && (
        <div className="print-only">
          <PrintPayroll
            payroll={payroll}
            entries={entries}
            totalGross={totalGross}
            totalShortage={totalShortage}
            totalBonus={totalBonus}
            totalNet={totalNet}
            companyName={user?.company?.name || 'HR System'}
          />
        </div>
      )}

      {/* Generate modal */}
      {showGen && (
        <GenerateModal
          onClose={() => setShowGen(false)}
          onGenerated={(p) => { setShowGen(false); openPayroll(p._id); setListKey(k=>k+1); }}
        />
      )}

      <style>{`
        @media print {
          .no-print   { display: none !important; }
          .print-only { display: block !important; }
          body { margin: 0; font-size: 11px; }
          @page { margin: 10mm 12mm; size: A4 landscape; }
        }
        .print-only { display: none; }
      `}</style>
    </>
  );
}

// ─── Print layout component ───────────────────────────────────────────────────
function PrintPayroll({ payroll, entries, totalGross, totalShortage, totalBonus, totalNet, companyName }) {
  const today = new Date().toLocaleDateString('en-NG', { day: 'numeric', month: 'long', year: 'numeric' });

  return (
    <div style={{ fontFamily: 'Arial, sans-serif', color: '#111', fontSize: '11px' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start',
                    borderBottom: '2px solid #111', paddingBottom: '8px', marginBottom: '12px' }}>
        <div>
          <h1 style={{ margin: 0, fontSize: '18px', fontWeight: 900 }}>{companyName}</h1>
          <p style={{ margin: '2px 0 0', color: '#555', fontSize: '11px' }}>
            Payroll Sheet — {payroll.label}
            {payroll.status === 'finalised' ? '  ✅ FINALISED' : '  📝 DRAFT'}
          </p>
        </div>
        <div style={{ textAlign: 'right', fontSize: '10px', color: '#666' }}>
          <p style={{ margin: '0 0 2px' }}>Date Printed: {today}</p>
          <p style={{ margin: 0 }}>{entries.length} worker{entries.length !== 1 ? 's' : ''}</p>
        </div>
      </div>

      {/* Summary row */}
      <div style={{ display: 'flex', gap: '24px', marginBottom: '14px',
                    background: '#f8f9fa', padding: '8px 12px', borderRadius: '6px' }}>
        <div><span style={{ color:'#555' }}>Gross Salary: </span><strong>{fmt(totalGross)}</strong></div>
        {totalShortage > 0 && <div><span style={{ color:'#c00' }}>Shortage: </span><strong style={{ color:'#c00' }}>−{fmt(totalShortage)}</strong></div>}
        {totalBonus    > 0 && <div><span style={{ color:'#070' }}>Bonus: </span><strong style={{ color:'#070' }}>+{fmt(totalBonus)}</strong></div>}
        <div style={{ marginLeft: 'auto' }}><span>Net Payable: </span><strong style={{ fontSize: '14px', color: '#1a3c5e' }}>{fmt(totalNet)}</strong></div>
      </div>

      {/* Workers table */}
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '10px' }}>
        <thead>
          <tr style={{ background: '#1a3c5e', color: '#fff' }}>
            {['#', 'Worker', 'Role', 'Bank', 'Account Name', 'Acct No.', 'Gross', 'Earned', 'Absent', 'Shortage', 'Bonus', 'Net Pay'].map(h => (
              <th key={h} style={{
                padding: '5px 5px',
                textAlign: ['Worker', 'Role', 'Bank', 'Account Name'].includes(h) ? 'left' : 'right',
                fontWeight: 700,
                whiteSpace: 'nowrap',
                fontSize: '9.5px'
              }}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {entries.map((e, idx) => {
            const net       = computeNetPay(e);
            const wdm       = e.workingDaysInMonth || 26;
            const dailyR    = (e.grossSalary || 0) / wdm;
            const absDeduct = (e.absentDays || 0) * dailyR;
            const earned    = e.calculatedSalary != null ? e.calculatedSalary : e.grossSalary;
            const isProrat  = e.isProrated && earned < (e.grossSalary || 0);
            return (
              <tr key={e._id} style={{ borderBottom: '1px solid #eee', background: idx % 2 === 0 ? '#fff' : '#fafafa' }}>
                <td style={{ padding: '4px 5px', textAlign: 'right', color: '#888' }}>{idx + 1}</td>
                <td style={{ padding: '4px 5px', fontWeight: 600 }}>
                  {e.fullName}
                  {isProrat && <span style={{ fontSize: '8px', color: '#b45309', marginLeft: '4px' }}>({e.daysWorked}/{e.daysInMonth}d)</span>}
                </td>
                <td style={{ padding: '4px 5px', color: '#555' }}>{e.role}</td>
                <td style={{ padding: '4px 5px', color: '#555' }}>{e.bankName || '—'}</td>
                <td style={{ padding: '4px 5px' }}>{e.accountName || '—'}</td>
                <td style={{ padding: '4px 5px', fontFamily: 'monospace' }}>{e.accountNumber || '—'}</td>
                <td style={{ padding: '4px 5px', textAlign: 'right' }}>{fmt(e.grossSalary)}</td>
                <td style={{ padding: '4px 5px', textAlign: 'right', color: isProrat ? '#b45309' : '#aaa' }}>
                  {isProrat ? fmt(earned) : '—'}
                </td>
                <td style={{ padding: '4px 5px', textAlign: 'right', color: e.absentDays > 0 ? '#c45700' : '#aaa' }}>
                  {e.absentDays > 0 ? `${e.absentDays}d (−${fmt(absDeduct)})` : '—'}
                </td>
                <td style={{ padding: '4px 5px', textAlign: 'right', color: e.shortage > 0 ? '#c00' : '#aaa' }}>
                  {e.shortage > 0 ? `−${fmt(e.shortage)}` : '—'}
                </td>
                <td style={{ padding: '4px 5px', textAlign: 'right', color: e.bonus > 0 ? '#070' : '#aaa' }}>
                  {e.bonus > 0 ? `+${fmt(e.bonus)}` : '—'}
                </td>
                <td style={{ padding: '4px 5px', textAlign: 'right', fontWeight: 700, color: '#1a3c5e' }}>{fmt(net)}</td>
              </tr>
            );
          })}
          {/* Total row */}
          <tr style={{ background: '#dce8f5', fontWeight: 700 }}>
            <td colSpan={6} style={{ padding: '5px 5px', textAlign: 'right', fontSize: '9.5px' }}>
              TOTAL ({entries.length} worker{entries.length !== 1 ? 's' : ''})
            </td>
            <td style={{ padding: '5px 5px', textAlign: 'right' }}>{fmt(totalGross)}</td>
            <td style={{ padding: '5px 5px' }} />
            <td style={{ padding: '5px 5px' }} />
            <td style={{ padding: '5px 5px', textAlign: 'right', color: '#c00' }}>
              {totalShortage > 0 ? `−${fmt(totalShortage)}` : '—'}
            </td>
            <td style={{ padding: '5px 5px', textAlign: 'right', color: '#070' }}>
              {totalBonus > 0 ? `+${fmt(totalBonus)}` : '—'}
            </td>
            <td style={{ padding: '5px 5px', textAlign: 'right', color: '#1a3c5e', fontSize: '11px' }}>{fmt(totalNet)}</td>
          </tr>
        </tbody>
      </table>

      {/* Net payable footer */}
      <div style={{ borderTop: '2px solid #111', paddingTop: '8px', marginTop: '16px',
                    display: 'flex', justifyContent: 'flex-end', gap: '32px', fontSize: '12px' }}>
        <div><strong>Total Gross:</strong> {fmt(totalGross)}</div>
        {totalShortage > 0 && <div style={{ color: '#c00' }}><strong>Total Shortage:</strong> −{fmt(totalShortage)}</div>}
        {totalBonus    > 0 && <div style={{ color: '#070' }}><strong>Total Bonus:</strong> +{fmt(totalBonus)}</div>}
        <div style={{ fontSize: '14px', fontWeight: 900, color: '#1a3c5e' }}>NET PAYABLE: {fmt(totalNet)}</div>
      </div>

      {/* Signature lines */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '32px', marginTop: '40px' }}>
        {['Prepared By', 'Reviewed By', 'Authorised By'].map(label => (
          <div key={label}>
            <div style={{ borderBottom: '1px solid #555', height: '40px', marginBottom: '4px' }} />
            <p style={{ fontSize: '9px', color: '#666', margin: 0 }}>{label} — Signature &amp; Date</p>
          </div>
        ))}
      </div>
    </div>
  );
}
