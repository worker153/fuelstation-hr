const Attendance       = require('../models/Attendance');
const AttendanceDevice = require('../models/AttendanceDevice');
const Worker           = require('../models/Worker');
const cloudinary       = require('../config/cloudinary');

// Haversine distance in metres between two GPS coordinates
function haversineDistance(lat1, lng1, lat2, lng2) {
  const R    = 6371000;
  const toR  = d => d * Math.PI / 180;
  const dLat = toR(lat2 - lat1);
  const dLng = toR(lng2 - lng1);
  const a    = Math.sin(dLat / 2) ** 2 +
    Math.cos(toR(lat1)) * Math.cos(toR(lat2)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// ── POST /api/attendance/clock  (public — called from terminal) ───────────────
const terminalClock = async (req, res) => {
  const { deviceToken, workerId, type, gps, selfieBase64 } = req.body;

  if (!deviceToken || !workerId || !type)
    return res.status(400).json({ success: false, message: 'deviceToken, workerId and type are required' });
  if (!['clock_in', 'clock_out'].includes(type))
    return res.status(400).json({ success: false, message: 'type must be clock_in or clock_out' });

  // ── 1. Verify device ─────────────────────────────────────────────────────────
  const device = await AttendanceDevice.findOne({ deviceToken }).lean();
  if (!device)
    return res.status(403).json({ success: false, message: 'Unrecognized device — attendance blocked' });
  if (device.status !== 'approved')
    return res.status(403).json({
      success: false,
      message: device.status === 'blocked'
        ? `This device has been blocked: ${device.blockedReason || 'contact admin'}`
        : `Device is ${device.status} — contact your admin to approve it`
    });

  // ── 2. Verify worker ─────────────────────────────────────────────────────────
  const worker = await Worker.findOne({ _id: workerId, company: device.company }).lean();
  if (!worker) return res.status(404).json({ success: false, message: 'Worker not found' });
  if (worker.employmentStatus !== 'active')
    return res.status(400).json({ success: false, message: 'Worker account is not active' });

  const failReasons = [];
  let gpsVerified  = false;
  let gpsDistance  = null;

  // ── 3. GPS verification ──────────────────────────────────────────────────────
  const branchGPS = device.branchGPS;
  if (gps?.lat != null && gps?.lng != null && branchGPS?.lat != null) {
    gpsDistance  = haversineDistance(gps.lat, gps.lng, branchGPS.lat, branchGPS.lng);
    if (gpsDistance <= device.allowedRadius) {
      gpsVerified = true;
    } else {
      return res.status(400).json({
        success:      false,
        message:      `You are ${Math.round(gpsDistance)}m from the branch. Must be within ${device.allowedRadius}m.`,
        data:         { gpsDistance: Math.round(gpsDistance), allowedRadius: device.allowedRadius }
      });
    }
  } else if (!branchGPS?.lat) {
    // Branch has no GPS set — GPS check skipped
    gpsVerified = true;
  } else {
    failReasons.push('GPS unavailable on device');
    gpsVerified = false;
  }

  // ── 4. Upload selfie ─────────────────────────────────────────────────────────
  let selfie = {};
  if (selfieBase64) {
    try {
      const result = await cloudinary.uploader.upload(selfieBase64, {
        folder:        `fuelstation-hr/${String(device.company)}/attendance`,
        resource_type: 'image',
        transformation: [{ width: 400, height: 400, crop: 'fill', gravity: 'face' }],
      });
      selfie = { url: result.secure_url, publicId: result.public_id };
    } catch (err) {
      console.error('Selfie upload error:', err.message);
      failReasons.push('Selfie upload failed');
    }
  } else {
    failReasons.push('No selfie captured');
  }

  // ── 5. Determine overall status ──────────────────────────────────────────────
  const deviceVerified = true;
  const status = (gpsVerified && selfie.url && failReasons.length === 0)
    ? 'verified'
    : failReasons.length > 0 ? 'partial' : 'verified';

  const now     = new Date();
  const dateStr = now.toISOString().split('T')[0];

  // ── 6. Save attendance record ────────────────────────────────────────────────
  const record = await Attendance.create({
    company:        device.company,
    worker:         worker._id,
    workerName:     worker.fullName,
    workerRole:     worker.role,
    device:         device._id,
    deviceName:     device.name,
    branch:         device.branch,
    branchName:     device.branchName,
    type,
    timestamp:      now,
    date:           dateStr,
    gps:            gps || undefined,
    gpsVerified,
    gpsDistance,
    selfie,
    deviceVerified,
    status,
    failReasons,
  });

  // Update device stats (fire-and-forget)
  AttendanceDevice.findByIdAndUpdate(device._id, {
    lastOnline:       now,
    lastAttendanceAt: now,
    ...(gps ? { lastGPS: { ...gps, updatedAt: now } } : {}),
  }).exec();

  res.status(201).json({
    success: true,
    message: `${type === 'clock_in' ? 'Clocked in' : 'Clocked out'} — ${worker.fullName}`,
    data: {
      workerName:  worker.fullName,
      workerRole:  worker.role,
      photo:       worker.passportPhoto?.url,
      type,
      timestamp:   now,
      gpsVerified,
      selfieUrl:   selfie.url,
      status,
      failReasons,
    }
  });
};

// ── GET /api/attendance  (admin) ─────────────────────────────────────────────
const getAttendance = async (req, res) => {
  const cid = req.user.company._id;
  const { branchId, workerId, date, month, year, type, page = 1, limit = 50 } = req.query;

  const filter = { company: cid };
  if (branchId) filter.branch = branchId;
  if (workerId) filter.worker = workerId;
  if (type)     filter.type   = type;
  if (date)     filter.date   = date;

  if (month && year) {
    const start  = new Date(Number(year), Number(month) - 1, 1);
    const end    = new Date(Number(year), Number(month),     1);
    filter.timestamp = { $gte: start, $lt: end };
  } else if (year && !month) {
    const start  = new Date(Number(year), 0, 1);
    const end    = new Date(Number(year) + 1, 0, 1);
    filter.timestamp = { $gte: start, $lt: end };
  }

  const skip  = (Number(page) - 1) * Number(limit);
  const total = await Attendance.countDocuments(filter);
  const records = await Attendance.find(filter)
    .sort({ timestamp: -1 })
    .skip(skip)
    .limit(Number(limit))
    .lean();

  res.json({
    success: true,
    data:    records,
    total,
    page:    Number(page),
    pages:   Math.ceil(total / Number(limit)),
  });
};

// ── GET /api/attendance/workers/:workerId  (admin / self) ─────────────────────
const getWorkerAttendance = async (req, res) => {
  const cid = req.user.company._id;
  const { month, year } = req.query;

  const filter = { company: cid, worker: req.params.workerId };
  if (month && year) {
    filter.timestamp = {
      $gte: new Date(Number(year), Number(month) - 1, 1),
      $lt:  new Date(Number(year), Number(month), 1),
    };
  }

  const records = await Attendance.find(filter).sort({ timestamp: -1 }).limit(200).lean();
  res.json({ success: true, data: records });
};

// ── GET /api/attendance/today  (admin — today's summary per branch) ───────────
const todaySummary = async (req, res) => {
  const cid     = req.user.company._id;
  const today   = new Date().toISOString().split('T')[0];
  const { branchId } = req.query;

  const filter = { company: cid, date: today };
  if (branchId) filter.branch = branchId;

  const records = await Attendance.find(filter).sort({ timestamp: -1 }).lean();

  // Group by worker — latest clock_in and clock_out for today
  const byWorker = {};
  records.forEach(r => {
    if (!byWorker[r.worker]) byWorker[r.worker] = { workerName: r.workerName, workerRole: r.workerRole, branchName: r.branchName };
    if (r.type === 'clock_in'  && !byWorker[r.worker].clockIn)  byWorker[r.worker].clockIn  = r.timestamp;
    if (r.type === 'clock_out' && !byWorker[r.worker].clockOut) byWorker[r.worker].clockOut = r.timestamp;
  });

  res.json({ success: true, data: Object.entries(byWorker).map(([id, v]) => ({ worker: id, ...v })), date: today });
};

module.exports = { terminalClock, getAttendance, getWorkerAttendance, todaySummary };
