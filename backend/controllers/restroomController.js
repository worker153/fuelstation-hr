const RestroomBreak    = require('../models/RestroomBreak');
const AttendanceDevice = require('../models/AttendanceDevice');
const Worker           = require('../models/Worker');
const Attendance       = require('../models/Attendance');
const Branch           = require('../models/Branch');
const { createAttendanceShortage } = require('./shortageController');

// Fallback defaults — overridden by branch.restroomSettings
const DEFAULT_ALLOWED_MINUTES   = 2;
const DEFAULT_DEDUCTION_PER_MIN = 500;

// ─── Haversine distance (metres) ──────────────────────────────────────────────
function haversineDistance(lat1, lng1, lat2, lng2) {
  const R = 6371000;
  const φ1 = lat1 * Math.PI / 180, φ2 = lat2 * Math.PI / 180;
  const Δφ = (lat2 - lat1) * Math.PI / 180;
  const Δλ = (lng2 - lng1) * Math.PI / 180;
  const a  = Math.sin(Δφ/2)**2 + Math.cos(φ1)*Math.cos(φ2)*Math.sin(Δλ/2)**2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
}

function todayUtcStr() {
  return new Date().toISOString().split('T')[0];
}

async function validateDevice(deviceToken) {
  if (!deviceToken) return null;
  return AttendanceDevice.findOne({ deviceToken, status: 'approved' }).lean();
}

// ─── Dual-auth context resolver (same pattern as breakController) ─────────────
// requireGPS: false — skip GPS check for read-only status queries
async function resolveRestroomContext({ deviceToken, pin, gps, reqWorkerId, requireGPS = true }) {
  if (deviceToken) {
    const device = await validateDevice(deviceToken);
    if (!device) return { error: 'Invalid or unapproved device' };
    return { company: device.company, branchId: device.branch, branchName: device.branchName || '', workerId: reqWorkerId, authType: 'device', device };
  }
  if (pin) {
    if (requireGPS && (!gps?.lat || !gps?.lng))
      return { error: 'GPS location is required when using a personal phone. Please allow location access.' };
    const worker = await Worker.findOne({ pin: String(pin).trim(), employmentStatus: 'active' })
      .populate('branchId', 'name restroomSettings location personalPhoneRadius').lean();
    if (!worker) return { error: 'Invalid PIN' };
    const branch = worker.branchId;

    // ── GPS radius check (personal phone only, mutating ops) ─────────────────
    if (requireGPS && gps?.lat != null && gps?.lng != null) {
      const bLat = branch?.location?.lat;
      const bLng = branch?.location?.lng;
      const radius = branch?.personalPhoneRadius ?? 150;
      if (bLat != null && bLng != null && radius > 0) {
        const dist = haversineDistance(gps.lat, gps.lng, bLat, bLng);
        if (dist > radius) {
          return {
            error: `You are ${Math.round(dist)}m from the branch. Must be within ${radius}m to use a personal phone for restroom breaks.`,
          };
        }
      }
    }

    return { company: worker.company, branchId: branch?._id || worker.branchId, branchName: branch?.name || worker.branch || '', workerId: String(worker._id), authType: 'pin', pinWorker: worker, branch };
  }
  return { error: 'deviceToken or PIN required' };
}

// ─── POST /api/restroom/start ─────────────────────────────────────────────────
const startRestroom = async (req, res) => {
  const { deviceToken, pin, gps, workerId: reqWorkerId } = req.body;

  const ctx = await resolveRestroomContext({ deviceToken, pin, gps, reqWorkerId });
  if (ctx.error) return res.status(401).json({ success: false, message: ctx.error });

  const { company, branchId, branchName, authType } = ctx;
  const workerId = ctx.workerId;

  const worker = ctx.pinWorker
    || await Worker.findOne({ _id: workerId, company, employmentStatus: 'active' }).lean();
  if (!worker) return res.status(404).json({ success: false, message: 'Worker not found' });

  const dateStr = todayUtcStr();

  // Must be clocked in and not clocked out
  const [clockIn, clockOut] = await Promise.all([
    Attendance.findOne({ company, worker: worker._id, date: dateStr, type: 'clock_in'  }).lean(),
    Attendance.findOne({ company, worker: worker._id, date: dateStr, type: 'clock_out' }).lean(),
  ]);
  if (!clockIn)  return res.status(400).json({ success: false, message: 'You must clock in before taking a restroom break' });
  if (clockOut)  return res.status(400).json({ success: false, message: 'You have already clocked out today' });

  // Only one active restroom break at a time
  const existing = await RestroomBreak.findOne({
    company, worker: worker._id, date: dateStr, status: 'active',
  }).lean();
  if (existing)
    return res.status(400).json({ success: false, message: 'You already have an active restroom break — clock back in first' });

  // Fetch branch settings for configured restroom limits
  const branch         = ctx.branch || await Branch.findById(branchId).lean();
  const allowedMinutes  = branch?.restroomSettings?.allowedMinutes  ?? DEFAULT_ALLOWED_MINUTES;
  const deductionPerMin = branch?.restroomSettings?.deductionPerMin ?? DEFAULT_DEDUCTION_PER_MIN;

  const now = new Date();
  const rb  = await RestroomBreak.create({
    company,
    branchId,
    branchName,
    worker:          worker._id,
    workerName:      worker.fullName,
    workerRole:      worker.role,
    date:            dateStr,
    startTime:       now,
    allowedMinutes,
    deductionPerMin,
    status:          'active',
  });

  res.json({
    success: true,
    message: `Restroom break started — you have ${allowedMinutes} minute${allowedMinutes !== 1 ? 's' : ''}`,
    data: {
      _id:             rb._id,
      startTime:       now,
      allowedMinutes,
      deductionPerMin,
    },
  });
};

// ─── POST /api/restroom/end ───────────────────────────────────────────────────
const endRestroom = async (req, res) => {
  const { deviceToken, pin, gps, workerId: reqWorkerId } = req.body;

  const ctx = await resolveRestroomContext({ deviceToken, pin, gps, reqWorkerId });
  if (ctx.error) return res.status(401).json({ success: false, message: ctx.error });

  const { company } = ctx;
  const workerId = ctx.workerId;

  const dateStr   = todayUtcStr();
  const activeRB  = await RestroomBreak.findOne({
    company, worker: workerId, date: dateStr, status: 'active',
  });
  if (!activeRB)
    return res.status(400).json({ success: false, message: 'No active restroom break found' });

  const now         = new Date();
  const elapsed     = Math.max(0, Math.round((now - activeRB.startTime) / 60000));
  const excess      = Math.max(0, elapsed - activeRB.allowedMinutes);
  const overstayed  = excess > 0;
  const deductAmt   = overstayed ? excess * (activeRB.deductionPerMin || DEFAULT_DEDUCTION_PER_MIN) : 0;

  activeRB.endTime       = now;
  activeRB.actualMinutes = elapsed;
  activeRB.excessMinutes = excess;
  activeRB.status        = overstayed ? 'overstayed' : 'completed';

  if (overstayed) {
    try {
      const worker = await Worker.findById(activeRB.worker).lean();
      if (worker) {
        await createAttendanceShortage({
          company:       activeRB.company,
          worker,
          branchId:      activeRB.branchId,
          branchName:    activeRB.branchName,
          amount:        deductAmt,
          source:        'restroom_overstay',
          reason:        'restroom_overstay',
          about:         `Restroom overstay — ${excess} min over limit`,
          attendanceDate: new Date(dateStr + 'T00:00:00.000Z'),
          notes: `${excess} min × ₦${activeRB.deductionPerMin || DEFAULT_DEDUCTION_PER_MIN}/min = ₦${deductAmt.toLocaleString()}`,
        });
      }
    } catch (e) {
      console.error('[RESTROOM] deduction error:', e.message);
    }
    activeRB.deductionCreated = true;
    activeRB.deductionAmount  = deductAmt;
  }

  await activeRB.save();

  res.json({
    success: true,
    overstayed,
    data: {
      status:          activeRB.status,
      actualMinutes:   elapsed,
      allowedMinutes:  activeRB.allowedMinutes,
      excessMinutes:   excess,
      deductionAmount: deductAmt,
      deductionPerMin: activeRB.deductionPerMin || DEFAULT_DEDUCTION_PER_MIN,
    },
  });
};

// ─── GET /api/restroom/status — terminal/portal queries ──────────────────────
const getRestroomStatus = async (req, res) => {
  const { deviceToken, workerId: reqWorkerId, pin } = req.query;

  const ctx = await resolveRestroomContext({ deviceToken, pin, gps: null, reqWorkerId, requireGPS: false });
  if (ctx.error) return res.status(401).json({ success: false, message: ctx.error });

  const { company } = ctx;
  const workerId = ctx.workerId;

  const dateStr    = todayUtcStr();
  const todayBreaks = await RestroomBreak.find({
    company, worker: workerId, date: dateStr,
  }).sort({ startTime: 1 }).lean();

  const activeRB = todayBreaks.find(b => b.status === 'active');
  const now      = new Date();

  res.json({
    success: true,
    data: {
      active: activeRB ? {
        _id:             activeRB._id,
        startTime:       activeRB.startTime,
        allowedMinutes:  activeRB.allowedMinutes,
        deductionPerMin: activeRB.deductionPerMin,
        elapsedSec:      Math.floor((now - new Date(activeRB.startTime)) / 1000),
      } : null,
      todayCount:  todayBreaks.length,
      todayBreaks: todayBreaks.map(b => ({
        _id:             b._id,
        startTime:       b.startTime,
        endTime:         b.endTime,
        status:          b.status,
        actualMinutes:   b.actualMinutes,
        excessMinutes:   b.excessMinutes,
        deductionAmount: b.deductionAmount,
      })),
    },
  });
};

// ─── GET /api/restroom — admin list with daily per-worker summary ─────────────
const getRestroomList = async (req, res) => {
  const cid = req.user.company._id;
  const { date, branchId, workerId, limit = 500 } = req.query;
  const targetDate = date || todayUtcStr();

  const filter = { company: cid, date: targetDate };
  if (branchId) filter.branchId = branchId;
  if (workerId) filter.worker   = workerId;

  const breaks = await RestroomBreak.find(filter)
    .sort({ workerName: 1, startTime: 1 })
    .limit(Number(limit))
    .lean();

  // Build per-worker summary sorted by most trips
  const map = {};
  for (const b of breaks) {
    const key = String(b.worker);
    if (!map[key]) map[key] = {
      workerId:      key,
      workerName:    b.workerName,
      workerRole:    b.workerRole,
      trips:         0,
      totalMinutes:  0,
      excessMinutes: 0,
      overstays:     0,
      totalDeducted: 0,
    };
    const s = map[key];
    s.trips++;
    s.totalMinutes  += b.actualMinutes   || 0;
    s.excessMinutes += b.excessMinutes   || 0;
    if (b.status === 'overstayed') s.overstays++;
    s.totalDeducted += b.deductionAmount || 0;
  }

  const summary = Object.values(map).sort((a, b) => b.trips - a.trips);

  res.json({ success: true, data: breaks, summary, date: targetDate });
};

module.exports = { startRestroom, endRestroom, getRestroomStatus, getRestroomList };
