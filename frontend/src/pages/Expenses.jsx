import { useState, useEffect, useCallback } from 'react';
import {
  Plus, Filter, Loader, Trash2, Edit2, Save, X,
  ShoppingCart, TrendingDown, Building2, AlertTriangle
} from 'lucide-react';
import api from '../utils/api';
import { useNotify } from '../context/NotificationContext';
import { useAuth } from '../context/AuthContext';

const MONTHS = ['January','February','March','April','May','June',
                'July','August','September','October','November','December'];

const fmt = n => `₦${Number(n || 0).toLocaleString()}`;

const CATEGORIES = [
  { value: 'fuel',           label: 'Fuel' },
  { value: 'equipment',      label: 'Equipment' },
  { value: 'maintenance',    label: 'Maintenance' },
  { value: 'supplies',       label: 'Supplies / Materials' },
  { value: 'utilities',      label: 'Utilities (Light/Water)' },
  { value: 'salary_advance', label: 'Salary Advance' },
  { value: 'other',          label: 'Other' },
];

const CAT_COLORS = {
  fuel:           'bg-blue-100 text-blue-700',
  equipment:      'bg-purple-100 text-purple-700',
  maintenance:    'bg-orange-100 text-orange-700',
  supplies:       'bg-green-100 text-green-700',
  utilities:      'bg-cyan-100 text-cyan-700',
  salary_advance: 'bg-pink-100 text-pink-700',
  other:          'bg-gray-100 text-gray-600',
};

function CategoryBadge({ value }) {
  const cat = CATEGORIES.find(c => c.value === value) || CATEGORIES[CATEGORIES.length - 1];
  return (
    <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${CAT_COLORS[value] || CAT_COLORS.other}`}>
      {cat.label}
    </span>
  );
}

// ─── Add / Edit Modal ─────────────────────────────────────────────────────────
function ExpenseModal({ expense, branches, onClose, onSaved }) {
  const notify = useNotify();
  const now = new Date();
  const todayStr = now.toISOString().split('T')[0];

  const [form, setForm] = useState({
    title:      expense?.title      || '',
    category:   expense?.category   || 'supplies',
    quantity:   expense?.quantity   || 1,
    unitPrice:  expense?.unitPrice  || '',
    amount:     expense?.amount     || '',
    notes:      expense?.notes      || '',
    date:       expense?.date       || todayStr,
    branchId:   expense?.branchId   || '',
    branchName: expense?.branchName || '',
  });
  const [saving, setSaving] = useState(false);

  const set = k => e => setForm(f => ({ ...f, [k]: e.target.value }));

  // Auto-calculate amount when quantity × unit price changes
  const handleQty = e => {
    const q = e.target.value;
    setForm(f => ({
      ...f, quantity: q,
      amount: q && f.unitPrice ? (Number(q) * Number(f.unitPrice)).toString() : f.amount,
    }));
  };
  const handleUnitPrice = e => {
    const up = e.target.value;
    setForm(f => ({
      ...f, unitPrice: up,
      amount: up && f.quantity ? (Number(f.quantity) * Number(up)).toString() : f.amount,
    }));
  };
  const handleBranch = e => {
    const bid = e.target.value;
    const b = branches.find(b => b._id === bid);
    setForm(f => ({ ...f, branchId: bid, branchName: b?.name || '' }));
  };

  const save = async e => {
    e.preventDefault();
    if (!form.title.trim()) return notify('Enter what was purchased', 'warning');
    if (!form.amount || Number(form.amount) <= 0) return notify('Enter the amount', 'warning');
    setSaving(true);
    try {
      if (expense) {
        const { data } = await api.put(`/expenses/${expense._id}`, form);
        onSaved(data.data, 'update');
      } else {
        const { data } = await api.post('/expenses', form);
        onSaved(data.data, 'create');
      }
      notify(expense ? 'Expense updated ✓' : 'Expense recorded ✓');
      onClose();
    } catch (err) {
      notify(err.response?.data?.message || 'Failed to save', 'error');
    } finally { setSaving(false); }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/60 overflow-y-auto">
      <div className="min-h-full flex items-center justify-center p-4 py-8">
        <div className="bg-white rounded-2xl w-full max-w-md shadow-2xl">
          <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
            <h2 className="font-bold text-gray-900">{expense ? 'Edit Expense' : 'Record New Purchase'}</h2>
            <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-gray-100"><X size={16} /></button>
          </div>

          <form onSubmit={save} className="px-5 py-5 space-y-4">
            {/* What was purchased */}
            <div>
              <label className="label">What was purchased? *</label>
              <input className="input" placeholder="e.g. Engine oil, Generator parts, Stationery…"
                value={form.title} onChange={set('title')} required />
            </div>

            {/* Category */}
            <div>
              <label className="label">Category</label>
              <select className="input" value={form.category} onChange={set('category')}>
                {CATEGORIES.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
              </select>
            </div>

            {/* Branch */}
            {branches.length > 0 && (
              <div>
                <label className="label">Branch / Station</label>
                <select className="input" value={form.branchId} onChange={handleBranch}>
                  <option value="">All / General</option>
                  {branches.map(b => <option key={b._id} value={b._id}>{b.name}</option>)}
                </select>
              </div>
            )}

            {/* Quantity + Unit Price */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="label">Quantity</label>
                <input className="input" type="number" min="1" step="any"
                  placeholder="1" value={form.quantity} onChange={handleQty} />
              </div>
              <div>
                <label className="label">Unit Price (₦)</label>
                <input className="input" type="number" min="0" step="any"
                  placeholder="0" value={form.unitPrice} onChange={handleUnitPrice} />
              </div>
            </div>

            {/* Total Amount */}
            <div>
              <label className="label">Total Amount (₦) *</label>
              <input className="input text-lg font-bold" type="number" min="0" step="any"
                placeholder="0" value={form.amount} onChange={set('amount')} required />
              {form.quantity > 1 && form.unitPrice > 0 && (
                <p className="text-xs text-gray-400 mt-1">
                  {form.quantity} × {fmt(form.unitPrice)} = {fmt(Number(form.quantity) * Number(form.unitPrice))}
                </p>
              )}
            </div>

            {/* Date */}
            <div>
              <label className="label">Date *</label>
              <input className="input" type="date" value={form.date} onChange={set('date')} required />
            </div>

            {/* Notes */}
            <div>
              <label className="label">Notes (optional)</label>
              <textarea className="input" rows={2}
                placeholder="Extra details, supplier name, receipt number…"
                value={form.notes} onChange={set('notes')} />
            </div>

            <div className="flex gap-3 pt-1">
              <button type="submit" disabled={saving}
                className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl bg-brand-600 text-white font-medium text-sm hover:bg-brand-700 transition-colors">
                {saving ? <Loader size={14} className="animate-spin" /> : <><Save size={14} /> {expense ? 'Update' : 'Save Expense'}</>}
              </button>
              <button type="button" onClick={onClose} className="btn-secondary">Cancel</button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}

// ─── Main Page ─────────────────────────────────────────────────────────────────
export default function Expenses() {
  const notify = useNotify();
  const { isSuperAdmin, can } = useAuth();
  const isAdmin = isSuperAdmin() || can('manageBranches');

  const now = new Date();
  const [expenses,      setExpenses    ] = useState([]);
  const [branches,      setBranches    ] = useState([]);
  const [loading,       setLoading     ] = useState(true);
  const [totalAmount,   setTotalAmount ] = useState(0);
  const [showModal,     setShowModal   ] = useState(false);
  const [editItem,      setEditItem    ] = useState(null);
  const [filterBranch,  setFilterBranch] = useState('');
  const [filterMonth,   setFilterMonth ] = useState(now.getMonth() + 1);
  const [filterYear,    setFilterYear  ] = useState(now.getFullYear());

  useEffect(() => {
    api.get('/branches?limit=200').then(r => setBranches(r.data.data || [])).catch(() => {});
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ month: filterMonth, year: filterYear, limit: 200 });
      if (filterBranch) params.set('branchId', filterBranch);
      const { data } = await api.get(`/expenses?${params}`);
      setExpenses(data.data || []);
      setTotalAmount(data.totalAmount || 0);
    } catch { notify('Failed to load expenses', 'error'); }
    finally { setLoading(false); }
  }, [filterBranch, filterMonth, filterYear]);

  useEffect(() => { load(); }, [load]);

  const handleSaved = (item, action) => {
    if (action === 'create') setExpenses(prev => [item, ...prev]);
    else setExpenses(prev => prev.map(e => e._id === item._id ? item : e));
    load(); // refresh totals
  };

  const handleDelete = async (id) => {
    if (!confirm('Delete this expense record?')) return;
    try {
      await api.delete(`/expenses/${id}`);
      setExpenses(prev => prev.filter(e => e._id !== id));
      load();
    } catch (err) { notify(err.response?.data?.message || 'Failed', 'error'); }
  };

  // Group by category for summary
  const byCat = expenses.reduce((acc, e) => {
    acc[e.category] = (acc[e.category] || 0) + e.amount;
    return acc;
  }, {});

  const monthLabel = `${MONTHS[filterMonth - 1]} ${filterYear}`;

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Expenses</h1>
          <p className="text-sm text-gray-500 mt-0.5">Record purchases and track spending per branch</p>
        </div>
        {isAdmin && (
          <button onClick={() => { setEditItem(null); setShowModal(true); }} className="btn-primary">
            <Plus size={14} /> Record Purchase
          </button>
        )}
      </div>

      {/* Summary card */}
      <div className="card p-5 bg-gradient-to-r from-red-50 to-white border border-red-100">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-xl bg-red-100 flex items-center justify-center shrink-0">
            <TrendingDown size={20} className="text-red-600" />
          </div>
          <div>
            <p className="text-xs text-gray-500 font-medium">{monthLabel} · {filterBranch ? branches.find(b => b._id === filterBranch)?.name : 'All Stations'}</p>
            <p className="text-2xl font-bold text-red-700">{fmt(totalAmount)}</p>
            <p className="text-xs text-gray-400">{expenses.length} expense{expenses.length !== 1 ? 's' : ''} recorded</p>
          </div>
        </div>

        {/* Category breakdown */}
        {Object.keys(byCat).length > 0 && (
          <div className="flex flex-wrap gap-2">
            {Object.entries(byCat).sort((a, b) => b[1] - a[1]).map(([cat, total]) => (
              <div key={cat} className="flex items-center gap-1.5">
                <CategoryBadge value={cat} />
                <span className="text-xs font-semibold text-gray-700">{fmt(total)}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Filters */}
      <div className="card p-4 flex flex-wrap gap-3 items-center">
        <Filter size={14} className="text-gray-400" />
        {branches.length > 0 && (
          <select className="input max-w-[170px]" value={filterBranch} onChange={e => setFilterBranch(e.target.value)}>
            <option value="">All stations</option>
            {branches.map(b => <option key={b._id} value={b._id}>{b.name}</option>)}
          </select>
        )}
        <select className="input max-w-[130px]" value={filterMonth} onChange={e => setFilterMonth(Number(e.target.value))}>
          {MONTHS.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
        </select>
        <select className="input max-w-[100px]" value={filterYear} onChange={e => setFilterYear(Number(e.target.value))}>
          {Array.from({ length: 3 }, (_, i) => now.getFullYear() - i).map(y =>
            <option key={y} value={y}>{y}</option>)}
        </select>
      </div>

      {/* List */}
      <div className="card overflow-hidden">
        <div className="px-5 py-3 border-b border-gray-100 flex items-center justify-between">
          <p className="font-semibold text-gray-800 text-sm">Purchase Records</p>
          <span className="text-xs text-gray-400">{expenses.length} record{expenses.length !== 1 ? 's' : ''}</span>
        </div>

        {loading ? (
          <div className="py-10 flex justify-center"><Loader size={20} className="animate-spin text-brand-500" /></div>
        ) : expenses.length === 0 ? (
          <div className="py-10 text-center text-gray-400">
            <ShoppingCart size={28} className="mx-auto mb-2 text-gray-300" />
            <p className="text-sm">No expenses recorded for {monthLabel}</p>
            {isAdmin && (
              <button onClick={() => { setEditItem(null); setShowModal(true); }}
                className="mt-3 text-sm text-brand-600 hover:underline">
                + Record first purchase
              </button>
            )}
          </div>
        ) : (
          <div className="divide-y divide-gray-50">
            {expenses.map(e => (
              <div key={e._id} className="flex items-start gap-3 px-5 py-4 hover:bg-gray-50/50">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="font-medium text-gray-900 text-sm">{e.title}</p>
                    <CategoryBadge value={e.category} />
                    {e.branchName && (
                      <span className="text-xs text-gray-400 flex items-center gap-0.5">
                        <Building2 size={10} /> {e.branchName}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-3 mt-1 flex-wrap">
                    <span className="text-base font-bold text-red-600">{fmt(e.amount)}</span>
                    {e.quantity > 1 && (
                      <span className="text-xs text-gray-400">
                        {e.quantity} × {fmt(e.unitPrice)}
                      </span>
                    )}
                    <span className="text-xs text-gray-400">
                      {new Date(e.date).toLocaleDateString('en-NG', { day: 'numeric', month: 'short', year: 'numeric' })}
                    </span>
                    {e.recordedByName && (
                      <span className="text-xs text-gray-400">by {e.recordedByName}</span>
                    )}
                  </div>
                  {e.notes && <p className="text-xs text-gray-500 mt-0.5 italic">"{e.notes}"</p>}
                </div>
                {isAdmin && (
                  <div className="flex gap-1 shrink-0">
                    <button onClick={() => { setEditItem(e); setShowModal(true); }}
                      className="p-1.5 text-gray-400 hover:text-brand-600 hover:bg-brand-50 rounded-lg">
                      <Edit2 size={14} />
                    </button>
                    <button onClick={() => handleDelete(e._id)}
                      className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg">
                      <Trash2 size={14} />
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {showModal && (
        <ExpenseModal
          expense={editItem}
          branches={branches}
          onClose={() => { setShowModal(false); setEditItem(null); }}
          onSaved={handleSaved}
        />
      )}
    </div>
  );
}
