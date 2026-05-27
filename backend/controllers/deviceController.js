const crypto           = require('crypto');
const AttendanceDevice = require('../models/AttendanceDevice');
const Branch           = require('../models/Branch');

// ── GET /api/devices  ─────────────────────────────────────────────────────────
const getDevices = async (req, res) => {
  const cid = req.user.company._id;
  const { branchId, status } = req.query;

  const filter = { company: cid };
  if (branchId) filter.branch = branchId;
  if (status)   filter.status = status;

  const devices = await AttendanceDevice.find(filter)
    .populate('branch',       'name location')
    .populate('registeredBy', 'name')
    .populate('approvedBy',   'name')
    .sort({ createdAt: -1 })
    .lean();

  res.json({ success: true, data: devices });
};

// ── POST /api/devices  ────────────────────────────────────────────────────────
const createDevice = async (req, res) => {
  const cid = req.user.company._id;
  const { name, branchId, type, allowedRadius, notes } = req.body;

  if (!name?.trim() || !branchId)
    return res.status(400).json({ success: false, message: 'Device name and branch are required' });

  const branch = await Branch.findOne({ _id: branchId, company: cid }).lean();
  if (!branch) return res.status(404).json({ success: false, message: 'Branch not found' });

  const device = await AttendanceDevice.create({
    company:      cid,
    name:         name.trim(),
    branch:       branchId,
    branchName:   branch.name,
    branchGPS:    branch.location?.lat ? { lat: branch.location.lat, lng: branch.location.lng } : null,
    type:         type || 'other',
    allowedRadius: Number(allowedRadius) || 150,
    notes:        notes?.trim() || '',
    registeredBy: req.user._id,
  });

  await device.populate('branch registeredBy', 'name');
  res.status(201).json({ success: true, data: device });
};

// ── GET /api/devices/:id  ─────────────────────────────────────────────────────
const getDevice = async (req, res) => {
  const device = await AttendanceDevice.findOne({ _id: req.params.id, company: req.user.company._id })
    .populate('branch',       'name location')
    .populate('registeredBy', 'name')
    .populate('approvedBy',   'name')
    .lean();
  if (!device) return res.status(404).json({ success: false, message: 'Device not found' });
  res.json({ success: true, data: device });
};

// ── PUT /api/devices/:id  ─────────────────────────────────────────────────────
const updateDevice = async (req, res) => {
  const { name, branchId, type, allowedRadius, notes } = req.body;
  const cid = req.user.company._id;

  const device = await AttendanceDevice.findOne({ _id: req.params.id, company: cid });
  if (!device) return res.status(404).json({ success: false, message: 'Device not found' });

  if (branchId && String(branchId) !== String(device.branch)) {
    const branch = await Branch.findOne({ _id: branchId, company: cid }).lean();
    if (!branch) return res.status(404).json({ success: false, message: 'Branch not found' });
    device.branch    = branchId;
    device.branchName = branch.name;
    device.branchGPS  = branch.location?.lat
      ? { lat: branch.location.lat, lng: branch.location.lng }
      : null;
  }

  if (name)          device.name          = name.trim();
  if (type)          device.type          = type;
  if (allowedRadius) device.allowedRadius = Number(allowedRadius);
  if (notes !== undefined) device.notes   = notes;

  await device.save();
  await device.populate('branch', 'name');
  res.json({ success: true, data: device });
};

// ── POST /api/devices/:id/approve  ───────────────────────────────────────────
const approveDevice = async (req, res) => {
  const device = await AttendanceDevice.findOne({ _id: req.params.id, company: req.user.company._id });
  if (!device) return res.status(404).json({ success: false, message: 'Device not found' });
  if (device.status === 'blocked')
    return res.status(400).json({ success: false, message: 'Cannot approve a blocked device — unblock it first' });

  device.status     = 'approved';
  device.approvedBy = req.user._id;
  device.approvedAt = new Date();
  await device.save();
  await device.populate('branch approvedBy', 'name');
  res.json({ success: true, data: device, message: 'Device approved — it can now accept attendance' });
};

// ── POST /api/devices/:id/deactivate  ────────────────────────────────────────
const deactivateDevice = async (req, res) => {
  const device = await AttendanceDevice.findOne({ _id: req.params.id, company: req.user.company._id });
  if (!device) return res.status(404).json({ success: false, message: 'Device not found' });
  device.status = 'inactive';
  await device.save();
  res.json({ success: true, data: device, message: 'Device deactivated' });
};

// ── POST /api/devices/:id/block  ─────────────────────────────────────────────
const blockDevice = async (req, res) => {
  const device = await AttendanceDevice.findOne({ _id: req.params.id, company: req.user.company._id });
  if (!device) return res.status(404).json({ success: false, message: 'Device not found' });
  device.status        = 'blocked';
  device.blockedReason = req.body.reason?.trim() || 'Blocked by admin';
  await device.save();
  res.json({ success: true, data: device, message: 'Device blocked — all attendance from this device is rejected' });
};

// ── POST /api/devices/:id/reset-token  ───────────────────────────────────────
// Use when device is replaced / stolen — generates new token + code, resets fingerprint
const resetToken = async (req, res) => {
  const device = await AttendanceDevice.findOne({ _id: req.params.id, company: req.user.company._id });
  if (!device) return res.status(404).json({ success: false, message: 'Device not found' });

  device.deviceToken      = crypto.randomBytes(32).toString('hex');
  device.registrationCode = Math.random().toString(36).substring(2, 8).toUpperCase();
  device.deviceId         = null;
  device.status           = 'pending';
  await device.save();
  res.json({ success: true, data: device, message: 'Token reset — device must re-register' });
};

// ── DELETE /api/devices/:id  ──────────────────────────────────────────────────
const deleteDevice = async (req, res) => {
  const device = await AttendanceDevice.findOne({ _id: req.params.id, company: req.user.company._id });
  if (!device) return res.status(404).json({ success: false, message: 'Device not found' });
  await device.deleteOne();
  res.json({ success: true, message: 'Device removed' });
};

// ══ PUBLIC terminal endpoints (no JWT) ════════════════════════════════════════

// ── POST /api/devices/terminal/register  ─────────────────────────────────────
// Physical device calls this once to bind its fingerprint to the registration code
const terminalRegister = async (req, res) => {
  const { registrationCode, deviceId } = req.body;
  if (!registrationCode || !deviceId)
    return res.status(400).json({ success: false, message: 'Registration code and device ID are required' });

  const device = await AttendanceDevice.findOne({ registrationCode: registrationCode.trim().toUpperCase() });
  if (!device) return res.status(404).json({ success: false, message: 'Invalid registration code' });
  if (device.status === 'blocked')
    return res.status(403).json({ success: false, message: 'This device has been blocked by admin' });
  if (device.deviceId && device.deviceId !== deviceId)
    return res.status(409).json({ success: false, message: 'This code was already claimed by another device. Ask admin to reset the token.' });

  device.deviceId   = deviceId;
  device.lastOnline = new Date();
  await device.save();

  res.json({
    success: true,
    message: device.status === 'approved'
      ? 'Device registered and approved — ready for attendance'
      : 'Device registered — awaiting admin approval',
    data: {
      deviceToken: device.deviceToken,
      deviceName:  device.name,
      branchName:  device.branchName,
      status:      device.status,
    }
  });
};

// ── GET /api/devices/terminal/info?token=xxx  ────────────────────────────────
// Terminal polls this to confirm it is still approved and get branch GPS
const terminalInfo = async (req, res) => {
  const { token } = req.query;
  if (!token) return res.status(400).json({ success: false, message: 'Token required' });

  const device = await AttendanceDevice.findOne({ deviceToken: token })
    .populate('branch', 'name location')
    .lean();
  if (!device) return res.status(404).json({ success: false, message: 'Device not found' });

  // Update last-online (fire-and-forget, don't await)
  AttendanceDevice.findByIdAndUpdate(device._id, { lastOnline: new Date() }).exec();

  res.json({
    success: true,
    data: {
      _id:           device._id,
      name:          device.name,
      branchName:    device.branchName,
      branchGPS:     device.branchGPS || (device.branch?.location?.lat
        ? { lat: device.branch.location.lat, lng: device.branch.location.lng }
        : null),
      allowedRadius: device.allowedRadius,
      status:        device.status,
      type:          device.type,
      blockedReason: device.blockedReason,
    }
  });
};

// ── GET /api/devices/terminal/workers?q=name&token=xxx  ──────────────────────
// Terminal searches workers in its branch by name fragment
const terminalWorkerSearch = async (req, res) => {
  const { token, q } = req.query;
  if (!token) return res.status(400).json({ success: false, message: 'Token required' });
  if (!q || q.trim().length < 2)
    return res.status(400).json({ success: false, message: 'Search term must be at least 2 characters' });

  const device = await AttendanceDevice.findOne({ deviceToken: token, status: 'approved' }).lean();
  if (!device) return res.status(403).json({ success: false, message: 'Device not authorized' });

  const Worker = require('../models/Worker');
  const workers = await Worker.find({
    company:          device.company,
    branchId:         device.branch,
    employmentStatus: 'active',
    fullName:         { $regex: q.trim(), $options: 'i' }
  })
    .select('fullName role passportPhoto branchId')
    .limit(10)
    .lean();

  res.json({
    success: true,
    data: workers.map(w => ({
      _id:      w._id,
      fullName: w.fullName,
      role:     w.role,
      photo:    w.passportPhoto?.url,
    }))
  });
};

// ── GET /api/devices/terminal/worker-by-pin?pin=xxxx&token=xxx ───────────────
// Worker enters 4-digit PIN → return their info + whether face is already registered
const terminalWorkerByPin = async (req, res) => {
  const { token, pin } = req.query;
  if (!token) return res.status(400).json({ success: false, message: 'Token required' });
  if (!pin)   return res.status(400).json({ success: false, message: 'PIN required' });

  const device = await AttendanceDevice.findOne({ deviceToken: token, status: 'approved' }).lean();
  if (!device) return res.status(403).json({ success: false, message: 'Device not authorized' });

  const Worker = require('../models/Worker');
  const worker = await Worker.findOne({
    pin:              String(pin).trim(),
    company:          device.company,
    employmentStatus: 'active',
  }).lean();

  if (!worker) return res.status(404).json({ success: false, message: 'Invalid PIN — worker not found' });

  // Confirm worker belongs to this branch (optional: remove for multi-branch workers)
  // if (String(worker.branchId) !== String(device.branch))
  //   return res.status(403).json({ success: false, message: 'Worker is not assigned to this branch' });

  res.json({
    success: true,
    data: {
      _id:            worker._id,
      fullName:       worker.fullName,
      role:           worker.role,
      photo:          worker.passportPhoto?.url,
      branchName:     worker.branch,
      // Return face descriptor ONLY if worker has one (for live comparison)
      faceDescriptor:    worker.faceDescriptor?.length ? worker.faceDescriptor : null,
      faceRegisteredAt:  worker.faceRegisteredAt,
      hasFace:           !!(worker.faceDescriptor?.length),
    }
  });
};

// ── POST /api/devices/terminal/register-face ──────────────────────────────────
// Worker's first login — save face descriptor to their record
const terminalRegisterFace = async (req, res) => {
  const { token, workerId, faceDescriptor } = req.body;
  if (!token || !workerId || !faceDescriptor)
    return res.status(400).json({ success: false, message: 'token, workerId and faceDescriptor are required' });
  if (!Array.isArray(faceDescriptor) || faceDescriptor.length !== 128)
    return res.status(400).json({ success: false, message: 'faceDescriptor must be an array of 128 numbers' });

  const device = await AttendanceDevice.findOne({ deviceToken: token, status: 'approved' }).lean();
  if (!device) return res.status(403).json({ success: false, message: 'Device not authorized' });

  const Worker = require('../models/Worker');
  const worker = await Worker.findOne({ _id: workerId, company: device.company });
  if (!worker) return res.status(404).json({ success: false, message: 'Worker not found' });

  worker.faceDescriptor   = faceDescriptor;
  worker.faceRegisteredAt = new Date();
  worker.faceRegisteredOn = device.name;
  await worker.save();

  res.json({
    success: true,
    message: `Face registered for ${worker.fullName}`,
    data: { faceRegisteredAt: worker.faceRegisteredAt }
  });
};

module.exports = {
  getDevices, createDevice, getDevice, updateDevice,
  approveDevice, deactivateDevice, blockDevice, resetToken, deleteDevice,
  terminalRegister, terminalInfo, terminalWorkerSearch,
  terminalWorkerByPin, terminalRegisterFace,
};
