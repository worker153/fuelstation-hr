const Attendance       = require('../models/Attendance');
const AttendanceDevice = require('../models/AttendanceDevice');
const Worker           = require('../models/Worker');
const Branch           = require('../models/Branch');
const cloudinary       = require('../config/cloudinary');
const { createAttendanceShortage } = require('./shortageController');

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
  const { deviceToken, workerId, type, gps, selfieBase64, faceMatchScore } = req.body;

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
  const faceVerified   = typeof faceMatchScore === 'number' && faceMatchScore >= 55;
  const status = (gpsVerified && selfie.url && faceVerified && failReasons.length === 0)
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
    faceMatchScore: faceMatchScore || null,
    faceVerified,
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

  // ── Step 7: auto-deduction for late/absent clock-in ──────────────────────────
  if (type === 'clock_in') {
    try {
      const branch   = await Branch.findById(device.branch).lean();
      const settings = branch?.attendanceSettings;

      if (settings && (settings.lateDeductionAmount > 0 || settings.absentDeductionAmount > 0)) {
        const clockH    = now.getHours();
        const clockM    = now.getMinutes();
        const clockMins = clockH * 60 + clockM;

        const [dlH, dlM] = (settings.clockInDeadline || '07:00').split(':').map(Number);
        const [atH, atM] = (settings.absentThreshold  || '09:00').split(':').map(Number);
        const deadlineMins  = dlH * 60 + dlM;
        const thresholdMins = atH * 60 + atM;
        const timeStr = `${String(clockH).padStart(2,'0')}:${String(clockM).padStart(2,'0')}`;
        const attendanceDate = new Date(dateStr + 'T00:00:00.000Z');

        if (clockMins >= thresholdMins && settings.absentDeductionAmount > 0) {
          await createAttendanceShortage({
            company:     device.company,
            worker,
            branchId:    device.branch,
            branchName:  device.branchName,
            amount:      settings.absentDeductionAmount,
            source:      'absent',
            reason:      'absent',
            attendanceDate,
            notes: `Absent — arrived at ${timeStr} (threshold: ${settings.absentThreshold})`,
          });
        } else if (clockMins > deadlineMins && settings.lateDeductionAmount > 0) {
          await createAttendanceShortage({
            company:     device.company,
            worker,
            branchId:    device.branch,
            branchName:  device.branchName,
            amount:      settings.lateDeductionAmount,
            source:      'late_arrival',
            reason:      'late_arrival',
            attendanceDate,
            notes: `Late arrival — clocked in at ${timeStr} (deadline: ${settings.clockInDeadline})`,
          });
        }
      }
    } catch (e) {
      console.error('Auto-deduction error:', e.message);
    }
  }

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

// ── POST /api/attendance/process-absences  (admin — mark no-shows for a date) ──
const processAbsences = async (req, res) => {
  const { branchId, date } = req.body;   // date = 'YYYY-MM-DD'
  if (!branchId || !date)
    return res.status(400).json({ success: false, message: 'branchId and date are required' });

  const [yr, mo, dy] = date.split('-').map(Number);
  const localDate = new Date(yr, mo - 1, dy);
  if (isNaN(localDate.getTime()))
    return res.status(400).json({ success: false, message: 'Invalid date' });
  const today = new Date(); today.setHours(0,0,0,0);
  if (localDate > today)
    return res.status(400).json({ success: false, message: 'Cannot process absences for a future date' });

  const cid    = req.user.company._id;
  const branch = await Branch.findOne({ _id: branchId, company: cid }).lean();
  if (!branch) return res.status(404).json({ success: false, message: 'Branch not found' });

  const settings       = branch.attendanceSettings || {};
  const deductionAmount = settings.absentDeductionAmount || 0;

  // Skip if it's not a configured work day
  if (settings.workDays?.length) {
    if (!settings.workDays.includes(localDate.getDay()))
      return res.json({ success: true, processed: 0, total: 0, message: 'Not a configured work day for this branch' });
  }

  const workers   = await Worker.find({ company: cid, branchId, employmentStatus: 'active' }).lean();
  const clockedIn = await Attendance.find({ company: cid, branch: branchId, date, type: 'clock_in' })
    .distinct('worker');
  const clockedSet = new Set(clockedIn.map(String));

  const absentWorkers = workers.filter(w => !clockedSet.has(String(w._id)));

  let processed = 0;
  if (deductionAmount > 0) {
    for (const worker of absentWorkers) {
      const result = await createAttendanceShortage({
        company:  cid,
        worker,
        branchId: branch._id,
        branchName: branch.name,
        amount:   deductionAmount,
        source:   'no_clockin',
        reason:   'no_clockin',
        attendanceDate: localDate,
        notes:    `No clock-in — absent on ${date}`,
      });
      if (!result._alreadyExisted) processed++;
    }
  }

  res.json({
    success:  true,
    processed,
    total:    absentWorkers.length,
    message:  deductionAmount > 0
      ? `${processed} absence deduction(s) recorded for ${date}`
      : `${absentWorkers.length} absent worker(s) found (no deduction amount configured)`,
  });
};

module.exports = { terminalClock, getAttendance, getWorkerAttendance, todaySummary, processAbsences };
