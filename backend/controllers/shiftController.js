const Shift  = require('../models/Shift');
const Branch = require('../models/Branch');
const Worker = require('../models/Worker');

// ─── GET /api/shifts  (?branchId=xxx&all=1) ───────────────────────────────────
const getShifts = async (req, res) => {
  const cid = req.user.company._id;
  const { branchId, all } = req.query;

  const filter = { company: cid };
  if (!all)     filter.isActive = true;
  if (branchId) filter.branch   = branchId;

  const shifts = await Shift.find(filter)
    .populate('branch', 'name')
    .sort({ branch: 1, name: 1 });

  // Add worker counts per shift
  const counts = await Worker.aggregate([
    { $match: { company: cid, employmentStatus: 'active', shiftId: { $exists: true, $ne: null } } },
    { $group: { _id: '$shiftId', count: { $sum: 1 } } }
  ]);
  const countMap = {};
  counts.forEach(c => { if (c._id) countMap[c._id.toString()] = c.count; });

  const data = shifts.map(s => ({
    ...s.toObject(),
    workerCount: countMap[s._id.toString()] || 0
  }));

  res.json({ success: true, data });
};

// ─── GET /api/shifts/:id ──────────────────────────────────────────────────────
const getShift = async (req, res) => {
  const shift = await Shift.findOne({ _id: req.params.id, company: req.user.company._id })
    .populate('branch', 'name');
  if (!shift) return res.status(404).json({ success: false, message: 'Shift not found' });
  res.json({ success: true, data: shift });
};

// ─── POST /api/shifts ─────────────────────────────────────────────────────────
const createShift = async (req, res) => {
  const { branchId, name, startTime, endTime, days, maxWorkers } = req.body;
  if (!name?.trim())  return res.status(400).json({ success: false, message: 'Shift name is required' });
  if (!branchId)      return res.status(400).json({ success: false, message: 'Branch is required' });

  const branch = await Branch.findOne({ _id: branchId, company: req.user.company._id });
  if (!branch) return res.status(404).json({ success: false, message: 'Branch not found' });

  const { shiftType = 'fixed', rotationPattern, rotationLabel } = req.body;

  const shift = await Shift.create({
    company:         req.user.company._id,
    branch:          branchId,
    name:            name.trim(),
    shiftType,
    // fixed fields
    startTime:       shiftType === 'fixed' ? (startTime || '') : '',
    endTime:         shiftType === 'fixed' ? (endTime   || '') : '',
    days:            shiftType === 'fixed' ? (days || ['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday']) : [],
    // rotation fields
    rotationPattern: shiftType === 'rotation' ? (rotationPattern || '') : '',
    rotationLabel:   shiftType === 'rotation' ? (rotationLabel   || '') : '',
    maxWorkers:      maxWorkers ? Number(maxWorkers) : 0,
    createdBy:       req.user._id
  });

  await shift.populate('branch', 'name');
  res.status(201).json({ success: true, data: { ...shift.toObject(), workerCount: 0 } });
};

// ─── PUT /api/shifts/:id ──────────────────────────────────────────────────────
const updateShift = async (req, res) => {
  const shift = await Shift.findOne({ _id: req.params.id, company: req.user.company._id });
  if (!shift) return res.status(404).json({ success: false, message: 'Shift not found' });

  const { name, shiftType, startTime, endTime, days, rotationPattern, rotationLabel, maxWorkers, isActive } = req.body;
  if (name            !== undefined) shift.name            = name.trim();
  if (shiftType       !== undefined) shift.shiftType       = shiftType;
  if (startTime       !== undefined) shift.startTime       = startTime;
  if (endTime         !== undefined) shift.endTime         = endTime;
  if (days            !== undefined) shift.days            = days;
  if (rotationPattern !== undefined) shift.rotationPattern = rotationPattern;
  if (rotationLabel   !== undefined) shift.rotationLabel   = rotationLabel;
  if (maxWorkers      !== undefined) shift.maxWorkers      = Number(maxWorkers);
  if (isActive        !== undefined) shift.isActive        = isActive;

  await shift.save();
  await shift.populate('branch', 'name');

  const workerCount = await Worker.countDocuments({
    shiftId: shift._id, company: req.user.company._id, employmentStatus: 'active'
  });

  res.json({ success: true, data: { ...shift.toObject(), workerCount } });
};

// ─── DELETE /api/shifts/:id  (toggle active) ──────────────────────────────────
const toggleShift = async (req, res) => {
  const shift = await Shift.findOne({ _id: req.params.id, company: req.user.company._id });
  if (!shift) return res.status(404).json({ success: false, message: 'Shift not found' });

  shift.isActive = !shift.isActive;
  await shift.save();
  res.json({ success: true, message: `Shift ${shift.isActive ? 'activated' : 'deactivated'}`, data: shift });
};

module.exports = { getShifts, getShift, createShift, updateShift, toggleShift };
