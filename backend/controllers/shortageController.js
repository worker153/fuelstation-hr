const Shortage = require('../models/Shortage');
const Worker   = require('../models/Worker');
const Branch   = require('../models/Branch');

const MONTHS = ['January','February','March','April','May','June',
                'July','August','September','October','November','December'];

// ─── POST /api/shortages  (supervisor submits) ────────────────────────────────
const submitShortage = async (req, res) => {
  const { workerId, branchId, month, year, date, amount, notes } = req.body;

  if (!workerId || !month || !year || amount == null)
    return res.status(400).json({ success: false, message: 'workerId, month, year and amount are required' });
  if (Number(amount) < 0)
    return res.status(400).json({ success: false, message: 'Amount cannot be negative' });

  const cid = req.user.company._id;

  const worker = await Worker.findOne({ _id: workerId, company: cid }).lean();
  if (!worker) return res.status(404).json({ success: false, message: 'Worker not found' });

  let branchName = worker.branch || '';
  let resolvedBranchId = branchId || worker.branchId;
  if (resolvedBranchId) {
    const branch = await Branch.findById(resolvedBranchId).lean();
    if (branch) branchName = branch.name;
  }

  const shortage = await Shortage.create({
    company:     cid,
    branchId:    resolvedBranchId || undefined,
    branchName,
    worker:      workerId,
    workerName:  worker.fullName,
    workerRole:  worker.role,
    month:       Number(month),
    year:        Number(year),
    date:        date ? new Date(date) : undefined,
    amount:      Number(amount),
    notes:       notes?.trim() || '',
    submittedBy: req.user._id,
    status:      'pending'
  });

  await shortage.populate('submittedBy', 'name');
  res.status(201).json({ success: true, data: shortage });
};

// ─── GET /api/shortages  ──────────────────────────────────────────────────────
// Admin/super_admin: see all (filter by status, branch, month, year)
// Supervisor: see only their own submissions
const getShortages = async (req, res) => {
  const cid = req.user.company._id;
  const { status, branchId, month, year } = req.query;

  const isAdmin = ['super_admin', 'admin'].includes(req.user.role) || req.user.can('manageBranches');

  const filter = { company: cid };
  if (!isAdmin) filter.submittedBy = req.user._id;   // supervisor sees own only
  if (status)   filter.status   = status;
  if (branchId) filter.branchId = branchId;
  if (month)    filter.month    = Number(month);
  if (year)     filter.year     = Number(year);

  const shortages = await Shortage.find(filter)
    .populate('submittedBy', 'name')
    .populate('reviewedBy',  'name')
    .sort({ createdAt: -1 })
    .lean();

  res.json({ success: true, data: shortages });
};

// ─── POST /api/shortages/:id/approve  (admin only) ───────────────────────────
const approveShortage = async (req, res) => {
  const shortage = await Shortage.findOne({ _id: req.params.id, company: req.user.company._id });
  if (!shortage) return res.status(404).json({ success: false, message: 'Shortage not found' });
  if (shortage.status !== 'pending')
    return res.status(400).json({ success: false, message: `Shortage is already ${shortage.status}` });

  shortage.status     = 'approved';
  shortage.reviewedBy  = req.user._id;
  shortage.reviewedAt  = new Date();
  await shortage.save();
  await shortage.populate('submittedBy reviewedBy', 'name');
  res.json({ success: true, data: shortage });
};

// ─── POST /api/shortages/:id/reject  (admin only) ────────────────────────────
const rejectShortage = async (req, res) => {
  const shortage = await Shortage.findOne({ _id: req.params.id, company: req.user.company._id });
  if (!shortage) return res.status(404).json({ success: false, message: 'Shortage not found' });
  if (shortage.status !== 'pending')
    return res.status(400).json({ success: false, message: `Shortage is already ${shortage.status}` });

  shortage.status          = 'rejected';
  shortage.reviewedBy       = req.user._id;
  shortage.reviewedAt       = new Date();
  shortage.rejectionReason  = req.body.reason?.trim() || '';
  await shortage.save();
  await shortage.populate('submittedBy reviewedBy', 'name');
  res.json({ success: true, data: shortage });
};

// ─── DELETE /api/shortages/:id  (supervisor cancels own pending) ──────────────
const deleteShortage = async (req, res) => {
  const cid = req.user.company._id;
  const isAdmin = ['super_admin', 'admin'].includes(req.user.role) || req.user.can('manageBranches');

  const filter = { _id: req.params.id, company: cid };
  if (!isAdmin) filter.submittedBy = req.user._id;   // supervisor can only delete own

  const shortage = await Shortage.findOne(filter);
  if (!shortage) return res.status(404).json({ success: false, message: 'Shortage not found' });
  if (shortage.status === 'approved' && !isAdmin)
    return res.status(403).json({ success: false, message: 'Cannot delete an approved shortage' });

  await shortage.deleteOne();
  res.json({ success: true, message: 'Shortage deleted' });
};

// ─── GET /api/shortages/summary  (admin: totals per worker for payroll) ───────
const getShortagesSummary = async (req, res) => {
  const { branchId, month, year } = req.query;
  if (!month || !year) return res.status(400).json({ success: false, message: 'month and year required' });

  const cid = req.user.company._id;
  const filter = { company: cid, status: 'approved', month: Number(month), year: Number(year) };
  if (branchId) filter.branchId = branchId;

  const items = await Shortage.find(filter).lean();

  // Group by worker — sum approved amounts
  const byWorker = {};
  items.forEach(s => {
    const wid = String(s.worker);
    if (!byWorker[wid]) byWorker[wid] = { worker: s.worker, workerName: s.workerName, total: 0, items: [] };
    byWorker[wid].total += s.amount;
    byWorker[wid].items.push(s);
  });

  res.json({ success: true, data: Object.values(byWorker) });
};

module.exports = { submitShortage, getShortages, approveShortage, rejectShortage, deleteShortage, getShortagesSummary };
