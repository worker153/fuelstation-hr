const Attendance       = require('../models/Attendance');
const AttendanceDevice = require('../models/AttendanceDevice');
const Worker           = require('../models/Worker');
const Branch           = require('../models/Branch');
const Shift            = require('../models/Shift');
const cloudinary       = require('../config/cloudinary');
const { createAttendanceShortage } = require('./shortageController');
const { isWorkerOnDuty, getSettingsForRole } = require('../utils/attendanceHelpers');

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

  // ── 2.5. Duplicate check — one clock-in and one clock-out per worker per day ──
  const now    = new Date();
  // Use WAT (UTC+1) for the shift date so midnight Nigeria is the boundary
  const watNow = new Date(now.getTime() + 60 * 60 * 1000);
  const toDateStr = d =>
    `${d.getUTCFullYear()}-${String(d.getUTCMonth()+1).padStart(2,'0')}-${String(d.getUTCDate()).padStart(2,'0')}`;
  let dateStr = toDateStr(watNow);

  // Overnight shift handling: if clocking OUT and no clock-in exists for today,
  // check if there is a clock-in from yesterday (worker is finishing a night shift).
  // If so, record the clock-out against yesterday's shift date.
  if (type === 'clock_out') {
    const todayClockIn = await Attendance.findOne({
      company: device.company, worker: worker._id, date: dateStr, type: 'clock_in',
    }).lean();
    if (!todayClockIn) {
      const watYest   = new Date(watNow.getTime() - 24 * 60 * 60 * 1000);
      const yesterday = toDateStr(watYest);
      const prevClockIn = await Attendance.findOne({
        company: device.company, worker: worker._id, date: yesterday, type: 'clock_in',
      }).lean();
      if (prevClockIn) dateStr = yesterday; // overnight — tie clock-out to previous shift date
    }
  }

  const existing = await Attendance.findOne({
    company: device.company,
    worker:  worker._id,
    date:    dateStr,
    type,
  }).lean();

  if (existing) {
    const timeStr = new Date(existing.timestamp).toLocaleTimeString('en-NG', {
      hour: '2-digit', minute: '2-digit', hour12: true,
    });
    return res.status(400).json({
      success:     false,
      alreadyDone: true,
      message:     type === 'clock_in'
        ? `Already clocked in today at ${timeStr}`
        : `Already clocked out today at ${timeStr}`,
    });
  }

  const failReasons = [];
  let gpsVerified  = false;
  let gpsDistance  = null;

  // ── 3. GPS verification ──────────────────────────────────────────────────────
  // allowedRadius === 0 means GPS enforcement is disabled for this device
  const branchGPS = device.branchGPS;
  if (!branchGPS?.lat || device.allowedRadius === 0) {
    // No GPS pin set OR enforcement disabled — skip check
    gpsVerified = true;
  } else if (gps?.lat != null && gps?.lng != null) {
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

  // Block clock-in if worker has a registered face but the presented face doesn't match
  if (worker.faceDescriptor?.length && !faceVerified) {
    return res.status(400).json({
      success:     false,
      faceBlocked: true,
      message:     `Face not recognised for ${worker.fullName}. Please look directly at the camera and try again.`,
      data:        { faceMatchScore: faceMatchScore || 0 },
    });
  }

  const status = (gpsVerified && selfie.url && faceVerified && failReasons.length === 0)
    ? 'verified'
    : failReasons.length > 0 ? 'partial' : 'verified';

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
      console.log(`[AUTO-DEDUCT] worker=${worker.fullName} role=${worker.role} clockInRequired=${worker.clockInRequired}`);
      // Skip all deductions for salary/flexible workers who don't need to clock in
      if (worker.clockInRequired === false) {
        console.log(`[AUTO-DEDUCT] exempt worker — skipping`);
      }
      // Skip all deductions if today is this worker's scheduled off day
      // Populate shift so isWorkerOnDuty can check fixed-shift days as well
      else if (!isWorkerOnDuty(
        { ...worker, shiftId: worker.shiftId ? await Shift.findById(worker.shiftId).lean() : null },
        now
      )) {
        console.log(`[AUTO-DEDUCT] off-duty day — skipping`);
      }
      else {
        const branch   = await Branch.findById(device.branch).lean();
        const settings = getSettingsForRole(branch, worker.role);
        console.log(`[AUTO-DEDUCT] branch=${branch?.name} settings=${JSON.stringify(settings)}`);

        if (!settings) {
          console.log(`[AUTO-DEDUCT] no settings found — skipping`);
        } else if (!(settings.lateDeductionAmount > 0) && !(settings.absentDeductionAmount > 0)) {
          console.log(`[AUTO-DEDUCT] both deduction amounts are 0 — skipping. late=${settings.lateDeductionAmount} absent=${settings.absentDeductionAmount}`);
        } else {
          // Convert server UTC time to Nigeria WAT (UTC+1) for threshold comparisons
          const watNow    = new Date(now.getTime() + 60 * 60 * 1000);
          const clockH    = watNow.getUTCHours();
          const clockM    = watNow.getUTCMinutes();
          const clockMins = clockH * 60 + clockM;
          const timeStr = `${String(clockH).padStart(2,'0')}:${String(clockM).padStart(2,'0')}`;
          const attendanceDate = new Date(dateStr + 'T00:00:00.000Z');
          console.log(`[AUTO-DEDUCT] WAT time=${timeStr} (${clockMins}mins) deadline=${settings.clockInDeadline} absentThreshold=${settings.absentThreshold}`);

          // Check absent threshold independently (no fallback — only fires when explicitly configured)
          let deducted = false;
          if (settings.absentThreshold && settings.absentDeductionAmount > 0) {
            const [atH, atM] = settings.absentThreshold.split(':').map(Number);
            if (clockMins >= atH * 60 + atM) {
              console.log(`[AUTO-DEDUCT] ABSENT — clockMins ${clockMins} >= threshold ${atH*60+atM}, amount=${settings.absentDeductionAmount}`);
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
              deducted = true;
            }
          }
          // Check late threshold independently — skip if already deducted as absent
          if (!deducted && settings.clockInDeadline && settings.lateDeductionAmount > 0) {
            const [dlH, dlM] = settings.clockInDeadline.split(':').map(Number);
            if (clockMins > dlH * 60 + dlM) {
              console.log(`[AUTO-DEDUCT] LATE — clockMins ${clockMins} > deadline ${dlH*60+dlM}, amount=${settings.lateDeductionAmount}`);
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
            } else {
              console.log(`[AUTO-DEDUCT] on time — clockMins ${clockMins} <= deadline ${dlH*60+dlM}`);
            }
          }
        }
      }
    } catch (e) {
      console.error('[AUTO-DEDUCT] ERROR:', e.message, e.stack);
    }
  }

  // ── Step 8: auto-deduction for early clock-out ──────────────────────────────
  if (type === 'clock_out') {
    try {
      const populatedWorkerCO = { ...worker, shiftId: worker.shiftId ? await Shift.findById(worker.shiftId).lean() : null };
      if (isWorkerOnDuty(populatedWorkerCO, now)) {
      const branch   = await Branch.findById(device.branch).lean();
      const settings = getSettingsForRole(branch, worker.role);

      if (settings?.shiftEnd && settings.earlyDepartureDeductionAmount > 0) {
        // Convert server UTC time to Nigeria WAT (UTC+1) for threshold comparisons
        const watNow    = new Date(now.getTime() + 60 * 60 * 1000);
        const clockH    = watNow.getUTCHours();
        const clockM    = watNow.getUTCMinutes();
        const clockMins = clockH * 60 + clockM;
        const timeStr   = `${String(clockH).padStart(2,'0')}:${String(clockM).padStart(2,'0')}`;

        const [seH, seM]   = settings.shiftEnd.split(':').map(Number);
        const shiftEndMins = seH * 60 + seM;

        let isEarly        = false;
        let earlyNotes     = '';
        let attendanceDate = new Date(dateStr + 'T00:00:00.000Z'); // default: today

        if (settings.shiftEndNextDay) {
          // 24-hour shift: clock-out should be on the NEXT calendar day
          // Check if there is a clock-in from yesterday for this worker
          const watYest    = new Date(watNow.getTime() - 24 * 60 * 60 * 1000);
          const yesterdayStr = `${watYest.getUTCFullYear()}-${String(watYest.getUTCMonth()+1).padStart(2,'0')}-${String(watYest.getUTCDate()).padStart(2,'0')}`;

          const prevClockIn = await Attendance.findOne({
            company: device.company, worker: worker._id,
            date: yesterdayStr, type: 'clock_in',
          }).lean();

          if (prevClockIn) {
            // Clocking out on the correct next day — just check if before scheduled end time
            attendanceDate = new Date(yesterdayStr + 'T00:00:00.000Z');
            if (clockMins < shiftEndMins) {
              isEarly    = true;
              earlyNotes = `Early departure — clocked out at ${timeStr} (scheduled: ${settings.shiftEnd} next day)`;
            }
          } else {
            // Clocked out on the same day they clocked in — way too early for a 24h shift
            isEarly    = true;
            earlyNotes = `Early departure — clocked out at ${timeStr} same day (24h shift, scheduled out: ${settings.shiftEnd} next day)`;
          }
        } else {
          // Normal same-day shift
          if (clockMins < shiftEndMins) {
            isEarly    = true;
            earlyNotes = `Early departure — clocked out at ${timeStr} (scheduled: ${settings.shiftEnd})`;
          }
        }

        if (isEarly) {
          await createAttendanceShortage({
            company:    device.company,
            worker,
            branchId:   device.branch,
            branchName: device.branchName,
            amount:     settings.earlyDepartureDeductionAmount,
            source:     'early_departure',
            reason:     'early_departure',
            attendanceDate,
            notes:      earlyNotes,
          });
        }
      }
      } // end isWorkerOnDuty check
    } catch (e) {
      console.error('Early departure deduction error:', e.message);
    }
  }

  // ── Step 6b: Auto-assign pump (synchronous — included in response) ─────────────
  let pumpAssignment = null;
  if (type === 'clock_in') {
    try {
      const { autoAssignPump } = require('../services/pumpService');
      pumpAssignment = await autoAssignPump({
        company:    device.company,
        branchId:   device.branch,
        branchName: device.branchName,
        worker,
        date:       dateStr,
        shiftName:  '', // will populate if worker has shift
      });
    } catch (e) {
      console.error('[PumpAssign] error:', e.message);
    }
  }

  // Fire push notification to all subscribed admin devices (non-blocking)
  setImmediate(async () => {
    try {
      const { sendPushToCompany } = require('./pushController');
      const watTime = new Date(now.getTime() + 60 * 60 * 1000);
      const timeStr = watTime.toLocaleTimeString('en-NG', { hour: '2-digit', minute: '2-digit', hour12: true });
      await sendPushToCompany(device.company, {
        title: type === 'clock_in'
          ? `🟢 ${worker.fullName} clocked in`
          : `🔴 ${worker.fullName} clocked out`,
        body:  `${device.branchName} · ${timeStr}`,
        tag:   `attendance-${worker._id}-${type}`,
        url:   '/admin-dashboard',
      });
    } catch { /* never break the clock response */ }
  });

  // ── Pump meter: capture opening meter on clock-in (fire-and-forget) ──────────
  if (type === 'clock_in') {
    setImmediate(async () => {
      try {
        const { captureOpeningMeter } = require('../services/stationApi');
        await captureOpeningMeter({
          company:        device.company,
          worker,
          branchId:       device.branch,
          branchName:     device.branchName,
          date:           dateStr,
          shiftName:      '',
          pumpAssignment, // pass the assignment
        });
      } catch (e) { console.error('[PumpMeter] open error:', e.message); }
    });
  }
  if (type === 'clock_out') {
    setImmediate(async () => {
      try {
        const { captureClosingMeter } = require('../services/stationApi');
        await captureClosingMeter({ company: device.company, worker, date: dateStr });
      } catch (e) { console.error('[PumpMeter] close error:', e.message); }
    });
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
      // Pump assignment (only on clock_in, null on clock_out)
      pumpAssignment: pumpAssignment ? {
        pumpName:     pumpAssignment.pumpName,
        pumpNumber:   pumpAssignment.pumpNumber,
        productType:  pumpAssignment.productType,
        assignmentId: String(pumpAssignment._id),
        isOverride:   pumpAssignment.isOverride,
      } : null,
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

  // Use default rule to check work days
  const defaultSettings = getSettingsForRole(branch, null) || {};
  if (defaultSettings.workDays?.length) {
    if (!defaultSettings.workDays.includes(localDate.getDay()))
      return res.json({ success: true, processed: 0, total: 0, message: 'Not a configured work day for this branch' });
  }

  const workers   = await Worker.find({ company: cid, branchId, employmentStatus: 'active', clockInRequired: { $ne: false }, alwaysPresent: { $ne: true } })
    .populate('shiftId', 'shiftType days rotationPattern')
    .lean();
  const clockedIn = await Attendance.find({ company: cid, branch: branchId, date, type: 'clock_in' })
    .distinct('worker');
  const clockedSet = new Set(clockedIn.map(String));

  // Only consider workers who didn't clock in AND are scheduled to work today
  const absentWorkers = workers.filter(w =>
    !clockedSet.has(String(w._id)) && isWorkerOnDuty(w, localDate)
  );

  let processed = 0;
  for (const worker of absentWorkers) {
    // Use the rule that matches this worker's role
    const settings = getSettingsForRole(branch, worker.role) || {};
    // Prefer dedicated noClockInDeductionAmount; fall back to absentDeductionAmount for old configs
    const deductionAmount = settings.noClockInDeductionAmount > 0
      ? settings.noClockInDeductionAmount
      : (settings.absentDeductionAmount || 0);
    if (deductionAmount > 0) {
      const result = await createAttendanceShortage({
        company:  cid,
        worker,
        branchId: branch._id,
        branchName: branch.name,
        amount:   deductionAmount,
        source:   'no_clockin',
        reason:   'no_clockin',
        attendanceDate: localDate,
        notes:    `No clock-in — full day absent on ${date}`,
      });
      if (!result._alreadyExisted) processed++;
    }
  }

  const offDutyCount = workers.filter(w =>
    !clockedSet.has(String(w._id)) && !isWorkerOnDuty(w, localDate)   // shiftId already populated
  ).length;

  res.json({
    success:     true,
    processed,
    total:       absentWorkers.length,
    offDuty:     offDutyCount,
    message:     processed > 0
      ? `${processed} absence deduction(s) recorded for ${date}${offDutyCount > 0 ? ` · ${offDutyCount} worker(s) skipped (off-duty day)` : ''}`
      : `${absentWorkers.length} absent worker(s) found — no deductions configured${offDutyCount > 0 ? ` · ${offDutyCount} off-duty (skipped)` : ''}`,
  });
};

// ─── GET /api/attendance/monthly-summary  ─────────────────────────────────────
// Returns per-worker attendance stats for a given branch/month/year:
// days present, late count, absent count, no-show count, early-exit count, total deductions
const Shortage = require('../models/Shortage');

const getMonthlySummary = async (req, res) => {
  const { branchId, month, year } = req.query;
  if (!month || !year) return res.status(400).json({ success: false, message: 'month and year required' });

  const cid = req.user.company._id;
  const mo  = Number(month);
  const yr  = Number(year);

  // ── Days present: distinct clock-in dates per worker ────────────────────────
  const datePrefix = `${yr}-${String(mo).padStart(2, '0')}-`;
  const attFilter  = { company: cid, type: 'clock_in', date: { $regex: `^${datePrefix}` } };
  if (branchId) attFilter.branch = require('mongoose').Types.ObjectId.createFromHexString
    ? require('mongoose').Types.ObjectId.createFromHexString(branchId)
    : require('mongoose').Types.ObjectId(branchId);

  const attRecords = await Attendance.find(attFilter).select('worker workerName workerRole date').lean();

  // ── Attendance-source shortages: count per source per worker ─────────────────
  const shortageFilter = {
    company: cid,
    month: mo, year: yr,
    source: { $in: ['late_arrival', 'absent', 'no_clockin', 'early_departure'] },
    status: 'approved',
  };
  if (branchId) shortageFilter.branchId = branchId;

  const shortages = await Shortage.find(shortageFilter).select('worker workerName workerRole source amount').lean();

  // ── Merge into per-worker summary ────────────────────────────────────────────
  const map = {};

  const getOrCreate = (wid, name, role) => {
    if (!map[wid]) map[wid] = { workerName: name || '', role: role || '', daysPresent: 0, late: 0, absent: 0, noShow: 0, earlyExit: 0, totalDeduction: 0, _dates: new Set() };
    if (name && !map[wid].workerName) map[wid].workerName = name;
    if (role && !map[wid].role)       map[wid].role       = role;
    return map[wid];
  };

  attRecords.forEach(r => {
    const e = getOrCreate(String(r.worker), r.workerName, r.workerRole);
    e._dates.add(r.date);
  });

  shortages.forEach(s => {
    const e = getOrCreate(String(s.worker), s.workerName, s.workerRole);
    if (s.source === 'late_arrival')    e.late++;
    if (s.source === 'absent')          e.absent++;
    if (s.source === 'no_clockin')      e.noShow++;
    if (s.source === 'early_departure') e.earlyExit++;
    e.totalDeduction += s.amount;
  });

  // Finalise days present from the Set of unique dates
  const data = Object.entries(map).map(([wid, e]) => {
    const { _dates, ...rest } = e;
    return { workerId: wid, ...rest, daysPresent: _dates.size };
  }).sort((a, b) => a.workerName.localeCompare(b.workerName));

  res.json({ success: true, data });
};

// ─── GET /api/attendance/debug-settings  (admin — check what rules apply for a branch) ──
const debugSettings = async (req, res) => {
  const { branchId } = req.query;
  if (!branchId) return res.status(400).json({ success: false, message: 'branchId required' });

  const cid    = req.user.company._id;
  const branch = await Branch.findOne({ _id: branchId, company: cid }).lean();
  if (!branch)  return res.status(404).json({ success: false, message: 'Branch not found' });

  const now     = new Date();
  const watNow  = new Date(now.getTime() + 60 * 60 * 1000);
  const clockH  = watNow.getUTCHours();
  const clockM  = watNow.getUTCMinutes();

  // Show what settings apply for each distinct role in this branch's workers
  const workers = await Worker.find({ company: cid, branchId, employmentStatus: 'active' })
    .select('fullName role clockInRequired rotationSchedule').lean();

  const roleMap = {};
  workers.forEach(w => {
    if (!roleMap[w.role]) roleMap[w.role] = getSettingsForRole(branch, w.role);
  });

  res.json({
    success: true,
    data: {
      branchName:      branch.name,
      serverUTC:       now.toISOString(),
      nigeriaWAT:      `${String(clockH).padStart(2,'0')}:${String(clockM).padStart(2,'0')}`,
      attendanceRules: branch.attendanceRules,
      attendanceSettings: branch.attendanceSettings,
      roleSettings:    roleMap,
      workers: workers.map(w => ({
        name: w.fullName,
        role: w.role,
        clockInRequired: w.clockInRequired,
        onDutyToday: isWorkerOnDuty(w, now),
        settings: getSettingsForRole(branch, w.role),
      })),
    }
  });
};

module.exports = { terminalClock, getAttendance, getWorkerAttendance, todaySummary, processAbsences, getMonthlySummary, debugSettings };
