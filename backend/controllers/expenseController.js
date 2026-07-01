const Expense = require('../models/Expense');

const CATEGORIES = ['fuel','equipment','maintenance','supplies','utilities','salary_advance','other'];

// GET /api/expenses
const getExpenses = async (req, res) => {
  const cid = req.user.company._id;
  const { branchId, month, year, date, page = 1, limit = 100 } = req.query;

  const filter = { company: cid };
  if (branchId) filter.branchId = branchId;
  if (date)  { filter.date = date; }
  else {
    if (month) filter.month = Number(month);
    if (year)  filter.year  = Number(year);
  }

  const skip  = (Number(page) - 1) * Number(limit);
  const total = await Expense.countDocuments(filter);
  const data  = await Expense.find(filter)
    .sort({ date: -1, createdAt: -1 })
    .skip(skip).limit(Number(limit))
    .lean();

  // Sum for the current filter
  const agg = await Expense.aggregate([
    { $match: filter },
    { $group: { _id: null, total: { $sum: '$amount' } } },
  ]);
  const totalAmount = agg[0]?.total || 0;

  res.json({ success: true, data, total, totalAmount, page: Number(page) });
};

// POST /api/expenses
const createExpense = async (req, res) => {
  const cid  = req.user.company._id;
  const { title, category, quantity, unitPrice, amount, notes, date, branchId, branchName } = req.body;

  if (!title)  return res.status(400).json({ success: false, message: 'Title is required' });
  if (!amount) return res.status(400).json({ success: false, message: 'Amount is required' });
  if (!date)   return res.status(400).json({ success: false, message: 'Date is required' });

  const [yr, mo] = date.split('-').map(Number);

  const expense = await Expense.create({
    company: cid,
    branchId:  branchId  || undefined,
    branchName: branchName || '',
    title, category: CATEGORIES.includes(category) ? category : 'other',
    quantity: Number(quantity) || 1,
    unitPrice: Number(unitPrice) || 0,
    amount: Number(amount),
    notes, date,
    month: mo, year: yr,
    recordedBy: req.user._id,
    recordedByName: req.user.name,
  });

  res.status(201).json({ success: true, data: expense });
};

// PUT /api/expenses/:id
const updateExpense = async (req, res) => {
  const cid = req.user.company._id;
  const expense = await Expense.findOne({ _id: req.params.id, company: cid });
  if (!expense) return res.status(404).json({ success: false, message: 'Expense not found' });

  const { title, category, quantity, unitPrice, amount, notes, date, branchId, branchName } = req.body;
  if (title)      expense.title      = title;
  if (category)   expense.category   = CATEGORIES.includes(category) ? category : expense.category;
  if (quantity)   expense.quantity   = Number(quantity);
  if (unitPrice !== undefined) expense.unitPrice = Number(unitPrice);
  if (amount)     expense.amount     = Number(amount);
  if (notes !== undefined)    expense.notes = notes;
  if (branchId)   expense.branchId   = branchId;
  if (branchName) expense.branchName = branchName;
  if (date) {
    expense.date = date;
    const [yr, mo] = date.split('-').map(Number);
    expense.month = mo; expense.year = yr;
  }

  await expense.save();
  res.json({ success: true, data: expense });
};

// DELETE /api/expenses/:id
const deleteExpense = async (req, res) => {
  const cid = req.user.company._id;
  const expense = await Expense.findOneAndDelete({ _id: req.params.id, company: cid });
  if (!expense) return res.status(404).json({ success: false, message: 'Expense not found' });
  res.json({ success: true });
};

module.exports = { getExpenses, createExpense, updateExpense, deleteExpense };
