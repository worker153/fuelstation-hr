const Payroll         = require('../models/Payroll');
const Worker          = require('../models/Worker');
const Branch          = require('../models/Branch');
const Shortage        = require('../models/Shortage');
const PumpAssignment  = require('../models/PumpAssignment');

const MONTHS = ['January','February','March','April','May','June',
                'July','August','September','October','November','December'];

// ─── GET /api/payroll  (?year=2026&branchId=xxx) ─────────────────────────────
const getPayrolls = async (req, res) => {
  const cid = req.user.company._id;
  const { year, branchId } = req.query;
  const filter = { company: cid };
  if (year)     filter.year     = Number(year);
  if (branchId) filter.branchId = branchId;

  const payrolls = await Payroll.find(filter)
    .sort({ year: -1, month: -1, branchName: 1 })
    .select('month year label status branchId branchName totalGross totalShortage totalNet entries createdAt')
    .lean();

  const data = payrolls.map(p => ({ ...p, workerCount: p.entries?.length || 0 }));
  res.json({ success: true, data });
};

// ─── GET /api/payroll/:id ─────────────────────────────────────────────────────
const getPayroll = async (req, res) => {
  const payroll = await Payroll.findOne({ _id: req.params.id, company: req.user.company._id })
    .populate('createdBy',    'name')
    .populate('finalisedBy',  'name');
  if (!payroll) return res.status(404).json({ success: false, message: 'Payroll not found' });
  res.json({ success: true, data: payroll });
};

// ─── POST /api/payroll/generate  (branchId + month + year) ───────────────────
const generatePayroll = async (req, res) => {
  const { month, year, branchId } = req.body;
  if (!month || !year)   return res.status(400).json({ success: false, message: 'Month and year are required' });
  if (!branchId)         return res.status(400).json({ success: false, message: 'Branch is required' });

  const cid = req.user.company._id;

  // Verify the branch belongs to this company
  const branch = await Branch.findOne({ _id: branchId, company: cid }).lean();
  if (!branch) return res.status(404).json({ success: false, message: 'Branch not found' });
  const branchName = branch.name;

  // Check if payroll already exists for this branch + period
  const existing = await Payroll.findOne({ company: cid, branchId, month: Number(month), year: Number(year) });
  if (existing) return res.status(409).json({
    success: false,
    message: `Payroll for ${branchName} — ${MONTHS[month - 1]} ${year} already exists`,
    data: existing
  });

  // Fetch active workers + workers sacked THIS month (they still get paid for days worked)
  const monthStart = new Date(Date.UTC(Number(year), Number(month) - 1, 1));
  const monthEnd   = new Date(Date.UTC(Number(year), Number(month), 0, 23, 59, 59));

  const workers = await Worker.find({
    company:  cid,
    branchId: branchId,
    $or: [
      { employmentStatus: 'active' },
      { employmentStatus: 'sacked', sackedAt: { $gte: monthStart, $lte: monthEnd } },
    ],
  })
  .select('fullName role branchId branch salary bankDetails resumptionDate sackedAt employmentStatus')
  .populate('branchId', 'name')
  .lean();

  // Helper: days in a given month/year
  const daysInMonth = (m, y) => new Date(y, m, 0).getDate();
  const totalDays   = daysInMonth(Number(month), Number(year));
  const m           = Number(month);
  const y           = Number(year);

  // ── Pull litres sold per worker for per_litre payment mode ────────────────────
  const monthStr = String(m).padStart(2, '0');
  const dayStr   = String(totalDays).padStart(2, '0');
  const periodStart = `${y}-${monthStr}-01`;
  const periodEnd   = `${y}-${monthStr}-${dayStr}`;

  // Gather all pump assignments for this branch/period that have volume recorded
  const pumpAssignments = await PumpAssignment.find({
    company:  cid,
    branchId: branchId,
    date:     { $gte: periodStart, $lte: periodEnd },
    volume:   { $exists: true, $ne: null },
  }).lean();

  const litresByWorker = {};
  pumpAssignments.forEach(a => {
    const wid = String(a.worker);
    litresByWorker[wid] = (litresByWorker[wid] || 0) + (a.volume || 0);
  });

  const entries = workers.map(w => {
    const paymentMode = w.salary?.paymentMode || 'fixed';
    const branchName_ = w.branchId?.name || w.branch || 'Unassigned';
    const baseEntry = {
      worker:        w._id,
      fullName:      w.fullName,
      role:          w.role,
      branchId:      w.branchId?._id || null,
      branchName:    branchName_,
      paymentMode,
      bankName:      w.bankDetails?.bankName      || '',
      accountNumber: w.bankDetails?.accountNumber || '',
      accountName:   w.bankDetails?.accountName   || '',
      paid:          false,
      notes:         w.employmentStatus === 'sacked' ? `Sacked ${new Date(w.sackedAt).toLocaleDateString('en-NG')} — partial month` : '',
    };

    if (paymentMode === 'per_litre') {
      const rate        = w.salary?.litreRate || 0;
      const litresSold  = Math.round((litresByWorker[String(w._id)] || 0) * 100) / 100;
      const litreEarnings = Math.round(litresSold * rate * 100) / 100;
      return {
        ...baseEntry,
        litreRate:          rate,
        litresSold,
        litreEarnings,
        grossSalary:        litreEarnings,
        calculatedSalary:   litreEarnings,
        workingDaysInMonth: 26,
        dailyRate:          0,
        daysInMonth:        totalDays,
        daysWorked:         totalDays,
        isProrated:         false,
        absentDays:         0,
        absenceDeduction:   0,
        shortage:           0,
        bonus:              0,
        netPay:             litreEarnings,
      };
    }

    // ── Fixed salary ─────────────────────────────────────────────────────────
    const gross = w.salary?.monthly || 0;
    const wdm   = 26;
    let isProrated    = false;
    let daysWorked    = totalDays;
    let resumDate     = null;
    let calculatedSal = gross;

    if (w.resumptionDate) {
      const rd = new Date(w.resumptionDate);
      if (rd.getFullYear() === y && rd.getMonth() + 1 === m) {
        isProrated    = true;
        resumDate     = rd;
        daysWorked    = totalDays - rd.getDate() + 1;
        calculatedSal = Math.round((gross * daysWorked / totalDays) * 100) / 100;
      }
    }

    // Sacked this month — prorate up to sacking date
    if (w.employmentStatus === 'sacked' && w.sackedAt) {
      const sd = new Date(w.sackedAt);
      if (sd.getFullYear() === y && sd.getMonth() + 1 === m) {
        isProrated    = true;
        daysWorked    = sd.getDate();  // worked day 1 up to sacking day
        calculatedSal = Math.round((gross * daysWorked / totalDays) * 100) / 100;
      }
    }

    return {
      ...baseEntry,
      grossSalary:        gross,
      resumptionDate:     resumDate,
      isProrated,
      daysInMonth:        totalDays,
      daysWorked,
      calculatedSalary:   calculatedSal,
      workingDaysInMonth: wdm,
      dailyRate:          Math.round((gross / wdm) * 100) / 100,
      absentDays:         0,
      absenceDeduction:   0,
      shortage:           0,
      bonus:              0,
      netPay:             calculatedSal,
    };
  });

  // ── Pull approved shortages for this period and apply to entries ─────────────
  // Query by worker IDs (not branchId) so shortages follow the worker if transferred
  const workerIds = entries.map(e => e.worker);
  const approvedShortages = await Shortage.find({
    company: cid,
    worker:  { $in: workerIds },
    month:   Number(month),
    year:    Number(year),
    status:  'approved'
  }).lean();

  const shortageByWorker = {};
  approvedShortages.forEach(s => {
    const wid = String(s.worker);
    shortageByWorker[wid] = (shortageByWorker[wid] || 0) + s.amount;
  });

  entries.forEach(e => {
    const shortageAmt = shortageByWorker[String(e.worker)] || 0;
    e.shortage = shortageAmt;
    e.netPay   = Math.max(0, e.calculatedSalary - e.absenceDeduction - shortageAmt + e.bonus);
  });

  // Sort by name within the branch
  entries.sort((a, b) => (a.fullName || '').localeCompare(b.fullName || ''));

  const payroll = await Payroll.create({
    company:    cid,
    branchId,
    branchName,
    month:      Number(month),
    year:       Number(year),
    entries,
    createdBy:  req.user._id
  });

  res.status(201).json({ success: true, data: payroll });
};

// ─── PUT /api/payroll/:id ─────────────────────────────────────────────────────
const updatePayroll = async (req, res) => {
  const payroll = await Payroll.findOne({ _id: req.params.id, company: req.user.company._id });
  if (!payroll) return res.status(404).json({ success: false, message: 'Payroll not found' });
  if (payroll.status === 'finalised')
    return res.status(400).json({ success: false, message: 'Finalised payroll cannot be edited' });

  const { entries: updates, notes } = req.body;

  if (notes !== undefined) payroll.notes = notes;

  if (Array.isArray(updates)) {
    // Build a lookup map keyed by entry _id string
    const updateMap = {};
    updates.forEach(u => { updateMap[String(u._id)] = u; });

    // Convert each subdocument to a plain object, apply updates, then replace the whole array.
    // Replacing the array entirely forces Mongoose to serialise every field — no dirty-tracking issues.
    const newEntries = payroll.entries.map(e => {
      const plain = e.toObject();
      const u = updateMap[String(e._id)];
      if (!u) return plain;

      if (u.shortage   !== undefined) plain.shortage   = Math.max(0, Number(u.shortage)   || 0);
      if (u.bonus      !== undefined) plain.bonus      = Math.max(0, Number(u.bonus)      || 0);
      if (u.paid       !== undefined) plain.paid       = Boolean(u.paid);
      if (u.notes      !== undefined) plain.notes      = u.notes;
      if (u.absentDays !== undefined) plain.absentDays = Math.max(0, Number(u.absentDays) || 0);

      // Proration flag — explicit override from frontend takes precedence
      const isProrated = u.isProrated !== undefined ? Boolean(u.isProrated) : plain.isProrated;
      plain.isProrated = isProrated;

      // Gross salary + derived calculatedSalary
      const gross = u.grossSalary !== undefined ? Math.max(0, Number(u.grossSalary) || 0) : plain.grossSalary;
      plain.grossSalary = gross;

      if (isProrated && plain.daysInMonth > 0) {
        plain.calculatedSalary = Math.round((gross * plain.daysWorked / plain.daysInMonth) * 100) / 100;
      } else {
        // Proration removed or was never set → full gross
        plain.calculatedSalary = gross;
      }

      // Allow an explicit calculatedSalary override when not prorated
      if (u.calculatedSalary !== undefined && !isProrated) {
        plain.calculatedSalary = Math.max(0, Number(u.calculatedSalary) || 0);
      }

      return plain;
    });

    payroll.entries = newEntries;   // replace entire array — guaranteed to persist
  }

  await payroll.save();   // pre-save hook recalculates dailyRate, absenceDeduction, netPay, totals
  res.json({ success: true, data: payroll });
};

// ─── POST /api/payroll/:id/finalise ──────────────────────────────────────────
const finalisePayroll = async (req, res) => {
  const payroll = await Payroll.findOne({ _id: req.params.id, company: req.user.company._id });
  if (!payroll) return res.status(404).json({ success: false, message: 'Payroll not found' });

  payroll.status      = 'finalised';
  payroll.finalisedBy = req.user._id;
  payroll.finalisedAt = new Date();
  await payroll.save();
  res.json({ success: true, data: payroll });
};

// ─── POST /api/payroll/:id/unlock ─────────────────────────────────────────────
const unlockPayroll = async (req, res) => {
  const payroll = await Payroll.findOne({ _id: req.params.id, company: req.user.company._id });
  if (!payroll) return res.status(404).json({ success: false, message: 'Payroll not found' });
  if (payroll.status !== 'finalised')
    return res.status(400).json({ success: false, message: 'Payroll is already a draft' });

  payroll.status      = 'draft';
  payroll.finalisedBy = undefined;
  payroll.finalisedAt = undefined;
  await payroll.save();
  res.json({ success: true, data: payroll });
};

// ─── DELETE /api/payroll/:id ──────────────────────────────────────────────────
const deletePayroll = async (req, res) => {
  const payroll = await Payroll.findOne({ _id: req.params.id, company: req.user.company._id });
  if (!payroll) return res.status(404).json({ success: false, message: 'Payroll not found' });
  if (payroll.status === 'finalised')
    return res.status(400).json({ success: false, message: 'Cannot delete a finalised payroll' });

  await payroll.deleteOne();
  res.json({ success: true, message: 'Payroll deleted' });
};

module.exports = { getPayrolls, getPayroll, generatePayroll, updatePayroll, finalisePayroll, unlockPayroll, deletePayroll };
