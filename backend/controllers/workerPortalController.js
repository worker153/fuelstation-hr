const Worker           = require('../models/Worker');
const AttendanceDevice = require('../models/AttendanceDevice');
const Attendance       = require('../models/Attendance');

// ─── POST /api/worker/auth ────────────────────────────────────────────────────
// Public. PIN + optional device token.
// Returns: worker info, device status, shift workers (supervisor), today's clock state.
const workerPortalAuth = async (req, res) => {
  const { pin, deviceToken } = req.body;
  if (!pin) return res.status(400).json({ success: false, message: 'PIN required' });

  const worker = await Worker.findOne({ pin: String(pin).trim() })
    .populate('branchId', 'name')
    .populate('shiftId',  'name')
    .lean();

  if (!worker)
    return res.status(404).json({ success: false, message: 'Invalid PIN — worker not found' });
  if (worker.employmentStatus !== 'active')
    return res.status(400).json({ success: false, message: 'Your account is not active' });

  // ── Device check ─────────────────────────────────────────────────────────────
  let deviceApproved = false;
  let deviceInfo     = null;

  if (deviceToken) {
    const device = await AttendanceDevice.findOne({ deviceToken }).lean();
    if (device && device.status === 'approved' &&
        String(device.company) === String(worker.company)) {
      deviceApproved = true;
      deviceInfo = {
        _id:          String(device._id),
        name:         device.name,
        branchId:     String(device.branch),
        branchName:   device.branchName,
        branchGPS:    device.branchGPS,
        allowedRadius: device.allowedRadius,
        deviceToken,
      };
    }
  }

  const isSupervisor = ['supervisor', 'outside supervisor']
    .includes((worker.role || '').toLowerCase());

  // ── Today's attendance ────────────────────────────────────────────────────────
  const today     = new Date().toISOString().split('T')[0];
  const todayRecs = await Attendance.find({
    company: worker.company, worker: worker._id, date: today,
  }).select('type timestamp').lean();
  const todayIn  = todayRecs.find(r => r.type === 'clock_in');
  const todayOut = todayRecs.find(r => r.type === 'clock_out');
  const todayStatus = {
    clockedIn:    !!todayIn,
    clockedOut:   !!todayOut,
    clockInTime:  todayIn?.timestamp  || null,
    clockOutTime: todayOut?.timestamp || null,
  };

  // ── Shift workers (supervisor + approved device only) ─────────────────────────
  let shiftWorkers = [];
  if (isSupervisor && deviceApproved) {
    const filter = {
      company:          worker.company,
      branchId:         worker.branchId?._id || worker.branchId,
      employmentStatus: 'active',
    };
    if (worker.shiftId) filter.shiftId = worker.shiftId;

    const ws = await Worker.find(filter)
      .select('fullName role passportPhoto shiftId faceDescriptor')
      .populate('shiftId', 'name')
      .lean();

    // Fetch today's attendance for all shift workers
    const swIds      = ws.map(w => w._id);
    const swTodayRecs = await Attendance.find({
      company: worker.company, worker: { $in: swIds }, date: today,
    }).select('worker type').lean();

    const swTodayMap = {};
    swTodayRecs.forEach(r => {
      const id = String(r.worker);
      if (!swTodayMap[id]) swTodayMap[id] = { clockedIn: false, clockedOut: false };
      if (r.type === 'clock_in')  swTodayMap[id].clockedIn  = true;
      if (r.type === 'clock_out') swTodayMap[id].clockedOut = true;
    });

    shiftWorkers = ws.map(w => ({
      _id:            String(w._id),
      fullName:       w.fullName,
      role:           w.role,
      shift:          w.shiftId?.name,
      photo:          w.passportPhoto?.url,
      faceDescriptor: w.faceDescriptor,
      hasFace:        (w.faceDescriptor?.length || 0) > 0,
      todayStatus:    swTodayMap[String(w._id)] || { clockedIn: false, clockedOut: false },
    }));
  }

  res.json({
    success: true,
    data: {
      worker: {
        _id:            String(worker._id),
        fullName:       worker.fullName,
        role:           worker.role,
        branch:         worker.branchId?.name || worker.branch,
        branchId:       String(worker.branchId?._id || worker.branchId || ''),
        photo:          worker.passportPhoto?.url,
        isSupervisor,
        shiftId:        String(worker.shiftId?._id || worker.shiftId || ''),
        shiftName:      worker.shiftId?.name,
        faceDescriptor: worker.faceDescriptor,
        hasFace:        (worker.faceDescriptor?.length || 0) > 0,
        company:        String(worker.company),
      },
      deviceApproved,
      deviceInfo,
      shiftWorkers,
      todayStatus,
    },
  });
};

// ─── POST /api/worker/change-pin ──────────────────────────────────────────────
// Public. Verifies current PIN then updates to newPin.
const workerChangePin = async (req, res) => {
  const { currentPin, newPin } = req.body;
  if (!currentPin || !newPin)
    return res.status(400).json({ success: false, message: 'currentPin and newPin are required' });
  if (!/^\d{4}$/.test(String(newPin)))
    return res.status(400).json({ success: false, message: 'New PIN must be exactly 4 digits' });
  if (String(currentPin).trim() === String(newPin).trim())
    return res.status(400).json({ success: false, message: 'New PIN must be different from your current PIN' });

  const worker = await Worker.findOne({ pin: String(currentPin).trim() });
  if (!worker)
    return res.status(404).json({ success: false, message: 'Current PIN is incorrect' });
  if (worker.employmentStatus !== 'active')
    return res.status(400).json({ success: false, message: 'Account is not active' });

  const conflict = await Worker.findOne({
    pin:     String(newPin).trim(),
    company: worker.company,
    _id:     { $ne: worker._id },
  }).lean();
  if (conflict)
    return res.status(400).json({
      success: false,
      message: 'This PIN is already taken — choose a different one',
    });

  worker.pin            = String(newPin).trim();
  worker.pinSelfReset   = true;
  worker.pinSelfResetAt = new Date();
  await worker.save();

  res.json({ success: true, message: 'PIN changed successfully' });
};

module.exports = { workerPortalAuth, workerChangePin };
