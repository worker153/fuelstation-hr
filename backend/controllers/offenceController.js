const Offence = require('../models/Offence');
const Worker  = require('../models/Worker');

// ── List offences ─────────────────────────────────────────────────────────────
const getOffences = async (req, res) => {
  const cid = req.user.company._id;
  const { branchId, workerId, severity, status, from, to, limit = 200 } = req.query;

  const q = { company: cid };
  if (branchId)  q.branchId  = branchId;
  if (workerId)  q.worker    = workerId;
  if (severity)  q.severity  = severity;
  if (status)    q.status    = status;
  if (from || to) {
    q.date = {};
    if (from) q.date.$gte = new Date(from);
    if (to)   q.date.$lte = new Date(to + 'T23:59:59Z');
  }

  const offences = await Offence.find(q)
    .sort({ date: -1 })
    .limit(Number(limit))
    .lean();

  res.json({ success: true, data: offences });
};

// ── Create offence (supervisor books a worker) ────────────────────────────────
const createOffence = async (req, res) => {
  const cid = req.user.company._id;
  const {
    workerId, date, offenceType, description,
    severity, action, deductionAmount, witness,
  } = req.body;

  if (!workerId)    return res.status(400).json({ success: false, message: 'Worker is required' });
  if (!offenceType) return res.status(400).json({ success: false, message: 'Offence type is required' });
  if (!severity)    return res.status(400).json({ success: false, message: 'Severity is required' });

  const worker = await Worker.findOne({ _id: workerId, company: cid }).lean();
  if (!worker) return res.status(404).json({ success: false, message: 'Worker not found' });

  const offence = await Offence.create({
    company:        cid,
    worker:         worker._id,
    workerName:     worker.fullName,
    workerRole:     worker.role,
    branch:         worker.branch,
    branchId:       worker.branchId,
    date:           date ? new Date(date) : new Date(),
    offenceType,
    description:    description || '',
    severity,
    action:         action || 'verbal_warning',
    deductionAmount: action === 'deduction' ? (Number(deductionAmount) || 0) : 0,
    witness:        witness || '',
    recordedBy:     req.user._id,
    recordedByName: req.user.name || req.user.email,
    status:         'active',
  });

  res.status(201).json({ success: true, data: offence });
};

// ── Resolve / dismiss an offence (admin only) ────────────────────────────────
const resolveOffence = async (req, res) => {
  const cid = req.user.company._id;
  const { id } = req.params;
  const { status, resolution } = req.body;

  if (!['dismissed', 'resolved', 'appealed'].includes(status))
    return res.status(400).json({ success: false, message: 'Invalid status' });

  const offence = await Offence.findOne({ _id: id, company: cid });
  if (!offence) return res.status(404).json({ success: false, message: 'Offence not found' });

  offence.status     = status;
  offence.resolution = resolution || '';
  offence.resolvedBy = req.user._id;
  offence.resolvedAt = new Date();
  await offence.save();

  res.json({ success: true, data: offence });
};

// ── Delete offence (admin only) ───────────────────────────────────────────────
const deleteOffence = async (req, res) => {
  const cid = req.user.company._id;
  const { id } = req.params;
  const offence = await Offence.findOneAndDelete({ _id: id, company: cid });
  if (!offence) return res.status(404).json({ success: false, message: 'Not found' });
  res.json({ success: true });
};

// ── Worker offence history ────────────────────────────────────────────────────
const getWorkerOffences = async (req, res) => {
  const cid = req.user.company._id;
  const offences = await Offence.find({ company: cid, worker: req.params.workerId })
    .sort({ date: -1 }).lean();
  res.json({ success: true, data: offences });
};

module.exports = { getOffences, createOffence, resolveOffence, deleteOffence, getWorkerOffences };
