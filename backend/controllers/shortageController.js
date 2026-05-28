const Shortage = require('../models/Shortage');
const Worker   = require('../models/Worker');
const Branch   = require('../models/Branch');
const Payroll  = require('../models/Payroll');

const MONTHS = ['January','February','March','April','May','June',
                'July','August','September','October','November','December'];

// ─── Shared helper: create an auto-approved attendance-based shortage ─────────
// Idempotent: returns existing record if already created for same worker/source/date.
const createAttendanceShortage = async ({
  company, worker, branchId, branchName,
  amount, source, reason, attendanceDate, notes,
}) => {
  // Idempotency check
  const existing = await Shortage.findOne({
    company, worker: worker._id, source, attendanceDate,
    status: { $ne: 'rejected' },
  }).lean();
  if (existing) return { ...existing, _alreadyExisted: true };

  const month = attendanceDate.getMonth() + 1;
  const year  = attendanceDate.getFullYear();

  const shortage = await Shortage.create({
    company, branchId, branchName,
    worker:     worker._id,
    workerName: worker.fullName,
    workerRole: worker.role,
    month, year,
    date: attendanceDate, attendanceDate,
    amount, notes, reason, source,
    status:     'approved',
    reviewedAt: new Date(),
    submittedBy: null,
  });

  // Auto-sync to draft payroll (same pattern as manual approval)
  try {
    const payroll = await Payroll.findOne({ company, branchId, month, year, status: 'draft' });
    if (payroll) {
      const allApproved = await Shortage.find({
        company, worker: worker._id, branchId, month, year, status: 'approved',
      }).lean();
      const total = allApproved.reduce((s, x) => s + x.amount, 0);
      const entry = payroll.entries.find(e => String(e.worker) === String(worker._id));
      if (entry) {
        payroll.entries = payroll.entries.map(e => {
          const plain = e.toObject();
          if (String(plain.worker) === String(worker._id)) plain.shortage = total;
          return plain;
        });
        await payroll.save();
      }
    }
  } catch (e) { console.error('payroll sync error:', e.message); }

  return shortage;
};

// ─── Shared payroll sync helper ───────────────────────────────────────────────
const syncPayroll = async ({ company, workerId, branchId, month, year }) => {
  const payroll = await Payroll.findOne({ company, branchId, month, year, status: 'draft' });
  if (!payroll) return;

  // Sum ALL approved shortages for this worker this month (no branchId filter —
  // penalties and auto-deductions are linked to the same worker regardless of
  // minor ObjectId representation differences).
  const allApproved = await Shortage.find({
    company, worker: workerId, month, year, status: 'approved',
  }).lean();
  const total = allApproved.reduce((s, x) => s + x.amount, 0);

  payroll.entries = payroll.entries.map(e => {
    const plain = e.toObject ? e.toObject() : e;
    if (String(plain.worker) === String(workerId)) plain.shortage = total;
    return plain;
  });
  payroll.markModified('entries');   // force Mongoose to detect the change
  await payroll.save();
};

// ─── POST /api/shortages  (admin/supervisor submits — auto-approved) ──────────
const submitShortage = async (req, res) => {
  const { workerId, branchId, month, year, date, amount, notes, reason } = req.body;

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

  const parsedAmount = Number(amount);
  const now = new Date();

  // ── Create shortage — auto-approved immediately ──────────────────────────────
  const shortage = await Shortage.create({
    company:     cid,
    branchId:    resolvedBranchId || undefined,
    branchName,
    worker:      workerId,
    workerName:  worker.fullName,
    workerRole:  worker.role,
    month:       Number(month),
    year:        Number(year),
    date:        date ? new Date(date) : now,
    amount:      parsedAmount,
    notes:       notes?.trim() || '',
    reason:      reason || 'cash_shortage',
    source:      'manual',
    submittedBy: req.user._id,
    status:      'approved',
    reviewedAt:  now,
  });

  // ── Auto-penalty ─────────────────────────────────────────────────────────────
  try {
    const penaltyAmount = parsedAmount >= 5000 ? 5000 : 2000;
    await Shortage.create({
      company:          cid,
      branchId:         resolvedBranchId || undefined,
      branchName,
      worker:           workerId,
      workerName:       worker.fullName,
      workerRole:       worker.role,
      month:            Number(month),
      year:             Number(year),
      date:             date ? new Date(date) : now,
      amount:           penaltyAmount,
      notes:            `Auto-penalty — shortage of ₦${parsedAmount.toLocaleString()} (${parsedAmount >= 5000 ? '≥ ₦5,000' : '< ₦5,000'})`,
      reason:           'other',
      source:           'penalty',
      status:           'approved',
      reviewedAt:       now,
      relatedShortageId: shortage._id,
    });
  } catch (e) { console.error('Penalty error:', e.message); }

  // ── Sync payroll ─────────────────────────────────────────────────────────────
  try {
    await syncPayroll({
      company: cid, workerId, branchId: resolvedBranchId,
      month: Number(month), year: Number(year),
    });
  } catch (e) { console.error('Payroll sync error:', e.message); }

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

// ─── POST /api/shortages/:id/approve  (kept for backward compat — no-op if already approved) ──
const approveShortage = async (req, res) => {
  const shortage = await Shortage.findOne({ _id: req.params.id, company: req.user.company._id });
  if (!shortage) return res.status(404).json({ success: false, message: 'Shortage not found' });
  // Shortages are now auto-approved on submission — this endpoint is a no-op
  if (shortage.status === 'pending') {
    shortage.status    = 'approved';
    shortage.reviewedBy = req.user._id;
    shortage.reviewedAt = new Date();
    await shortage.save();
    try {
      await syncPayroll({
        company: shortage.company, workerId: shortage.worker,
        branchId: shortage.branchId, month: shortage.month, year: shortage.year,
      });
    } catch (e) { /* silent */ }
  }
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

// ─── DELETE /api/shortages/:id ────────────────────────────────────────────────
const deleteShortage = async (req, res) => {
  const cid = req.user.company._id;
  const isAdmin = ['super_admin', 'admin'].includes(req.user.role) || req.user.can('manageBranches');

  const filter = { _id: req.params.id, company: cid };
  if (!isAdmin) filter.submittedBy = req.user._id;

  const shortage = await Shortage.findOne(filter);
  if (!shortage) return res.status(404).json({ success: false, message: 'Shortage not found' });

  const { worker, branchId, month, year } = shortage;

  // Delete the shortage + its auto-penalty (if any)
  await shortage.deleteOne();
  await Shortage.deleteMany({ relatedShortageId: shortage._id });

  // Re-sync payroll so deduction is recalculated
  try {
    await syncPayroll({ company: cid, workerId: worker, branchId, month, year });
  } catch (e) { /* silent */ }

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

// ─── POST /api/shortages/worker  (public — worker enters PIN, auto-approved) ──
const workerPinSubmit = async (req, res) => {
  const { pin, amount, notes, reason, date, targetWorkerId } = req.body;

  if (!pin)    return res.status(400).json({ success: false, message: 'PIN is required' });
  if (!amount || Number(amount) <= 0)
    return res.status(400).json({ success: false, message: 'Enter a valid amount' });

  // Find submitter by PIN
  const submitter = await Worker.findOne({ pin: String(pin).trim() })
    .populate('branchId', 'name')
    .lean();

  if (!submitter) return res.status(404).json({ success: false, message: 'Invalid PIN — worker not found' });
  if (submitter.employmentStatus !== 'active')
    return res.status(400).json({ success: false, message: 'Only active workers can submit shortages' });

  // Target worker: either a specific worker (supervisor submitting for subordinate) or self
  let worker = submitter;
  if (targetWorkerId && String(targetWorkerId) !== String(submitter._id)) {
    const target = await Worker.findOne({ _id: targetWorkerId, company: submitter.company })
      .populate('branchId', 'name').lean();
    if (!target) return res.status(404).json({ success: false, message: 'Target worker not found' });
    worker = target;
  }

  const now    = new Date();
  const month  = now.getMonth() + 1;
  const year   = now.getFullYear();

  const shortage = await Shortage.create({
    company:     worker.company,
    branchId:    worker.branchId?._id || worker.branchId,
    branchName:  worker.branchId?.name || worker.branch || '',
    worker:      worker._id,
    workerName:  worker.fullName,
    workerRole:  worker.role,
    month,
    year,
    date:        date ? new Date(date) : now,
    amount:      Number(amount),
    notes:       notes?.trim() || '',
    reason:      reason || 'cash_shortage',
    source:      'manual',
    submittedBy: null,   // self-service — no staff user
    status:      'approved',  // auto-approved
    reviewedAt:  now
  });

  // ── Auto-penalty ─────────────────────────────────────────────────────────
  const parsedAmount = Number(amount);
  console.log(`[PIN shortage] worker=${worker.fullName} amount=${parsedAmount} branchId=${worker.branchId?._id || worker.branchId}`);
  try {
    const penaltyAmount = parsedAmount >= 5000 ? 5000 : 2000;
    console.log(`[PIN penalty] creating ₦${penaltyAmount} penalty for ${worker.fullName}`);
    await Shortage.create({
      company:           worker.company,
      branchId:          worker.branchId?._id || worker.branchId,
      branchName:        worker.branchId?.name || worker.branch || '',
      worker:            worker._id,
      workerName:        worker.fullName,
      workerRole:        worker.role,
      month,
      year,
      date:              date ? new Date(date) : now,
      amount:            penaltyAmount,
      notes:             `Auto-penalty — shortage of ₦${parsedAmount.toLocaleString()} (${parsedAmount >= 5000 ? '≥ ₦5,000' : '< ₦5,000'})`,
      reason:            'other',
      source:            'penalty',
      status:            'approved',
      reviewedAt:        now,
      relatedShortageId: shortage._id,
    });
    console.log(`[PIN penalty] ✓ penalty saved for ${worker.fullName}`);
  } catch (e) { console.error('[PIN penalty] ERROR:', e.message); }

  // ── Sync payroll ──────────────────────────────────────────────────────────
  try {
    await syncPayroll({
      company:  worker.company,
      workerId: worker._id,
      branchId: worker.branchId?._id || worker.branchId,
      month, year,
    });
    console.log(`[PIN payroll-sync] ✓ done for ${worker.fullName}`);
  } catch (err) {
    console.error('[PIN payroll-sync] ERROR:', err.message);
  }

  res.status(201).json({
    success: true,
    message: `Shortage of ₦${Number(amount).toLocaleString()} recorded for ${worker.fullName}`,
    data: { workerName: worker.fullName, branchName: worker.branchId?.name || worker.branch, amount: Number(amount), month, year }
  });
};

// ─── GET /api/shortages/worker/lookup?pin=xxxx  (public — verify PIN) ─────────
const workerPinLookup = async (req, res) => {
  const { pin } = req.query;
  if (!pin) return res.status(400).json({ success: false, message: 'PIN required' });

  const worker = await Worker.findOne({ pin: String(pin).trim() })
    .populate('branchId', 'name')
    .select('fullName role branch branchId shiftId employmentStatus passportPhoto company')
    .lean();

  if (!worker) return res.status(404).json({ success: false, message: 'Invalid PIN' });
  if (worker.employmentStatus !== 'active')
    return res.status(400).json({ success: false, message: 'This worker account is not active' });

  const result = {
    _id:        worker._id,
    fullName:   worker.fullName,
    role:       worker.role,
    branchName: worker.branchId?.name || worker.branch,
    branchId:   worker.branchId?._id  || worker.branchId,
    shiftId:    worker.shiftId,
    photo:      worker.passportPhoto?.url,
    isSupervisor: ['supervisor','outside supervisor'].includes(worker.role?.toLowerCase())
  };

  // If supervisor — return active workers in their branch, scoped to their shift if assigned
  if (result.isSupervisor && result.branchId) {
    const filter = {
      company:          worker.company,
      branchId:         result.branchId,
      employmentStatus: 'active'
    };
    // If supervisor has a shift assigned, only show workers from that shift
    if (result.shiftId) filter.shiftId = result.shiftId;

    const shiftWorkers = await Worker.find(filter)
      .select('fullName role passportPhoto shiftId')
      .populate('shiftId', 'name')
      .sort({ fullName: 1 })
      .lean();

    result.workers = shiftWorkers.map(w => ({
      _id:      w._id,
      fullName: w.fullName,
      role:     w.role,
      shift:    w.shiftId?.name,
      photo:    w.passportPhoto?.url
    }));
  }

  res.json({ success: true, data: result });
};

module.exports = {
  submitShortage, getShortages, approveShortage, rejectShortage,
  deleteShortage, getShortagesSummary, workerPinSubmit, workerPinLookup,
  createAttendanceShortage,
};
