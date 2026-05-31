const RestroomBreak    = require('../models/RestroomBreak');
const AttendanceDevice = require('../models/AttendanceDevice');
const Worker           = require('../models/Worker');
const Attendance       = require('../models/Attendance');
const Branch           = require('../models/Branch');
const { createAttendanceShortage } = require('./shortageController');

// Fallback defaults — overridden by branch.restroomSettings
const DEFAULT_ALLOWED_MINUTES   = 2;
const DEFAULT_DEDUCTION_PER_MIN = 500;

function todayUtcStr() {
  return new Date().toISOString().split('T')[0];
}

async function validateDevice(deviceToken) {
  if (!deviceToken) return null;
  return AttendanceDevice.findOne({ deviceToken, status: 'approved' }).lean();
}

// ─── POST /api/restroom/start ─────────────────────────────────────────────────
const startRestroom = async (req, res) => {
  const { deviceToken, workerId } = req.body;
  if (!deviceToken || !workerId)
    return res.status(400).json({ success: false, message: 'deviceToken and workerId required' });

  const device = await validateDevice(deviceToken);
  if (!device) return res.status(401).json({ success: false, message: 'Invalid or unapproved device' });

  const worker = await Worker.findOne({
    _id: workerId, company: device.company, employmentStatus: 'active',
  }).lean();
  if (!worker) return res.status(404).json({ success: false, message: 'Worker not found' });

  const dateStr = todayUtcStr();

  // Must be clocked in and not clocked out
  const [clockIn, clockOut] = await Promise.all([
    Attendance.findOne({ company: device.company, worker: worker._id, date: dateStr, type: 'clock_in'  }).lean(),
    Attendance.findOne({ company: device.company, worker: worker._id, date: dateStr, type: 'clock_out' }).lean(),
  ]);
  if (!clockIn)  return res.status(400).json({ success: false, message: 'You must clock in before taking a restroom break' });
  if (clockOut)  return res.status(400).json({ success: false, message: 'You have already clocked out today' });

  // Only one active restroom break at a time
  const existing = await RestroomBreak.findOne({
    company: device.company, worker: worker._id, date: dateStr, status: 'active',
  }).lean();
  if (existing)
    return res.status(400).json({ success: false, message: 'You already have an active restroom break — clock back in first' });

  // Fetch branch settings for configured restroom limits
  const branch         = await Branch.findById(device.branch).lean();
  const allowedMinutes  = branch?.restroomSettings?.allowedMinutes  ?? DEFAULT_ALLOWED_MINUTES;
  const deductionPerMin = branch?.restroomSettings?.deductionPerMin ?? DEFAULT_DEDUCTION_PER_MIN;

  const now = new Date();
  const rb  = await RestroomBreak.create({
    company:         device.company,
    branchId:        device.branch,
    branchName:      device.branchName || '',
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
  const { deviceToken, workerId } = req.body;
  if (!deviceToken || !workerId)
    return res.status(400).json({ success: false, message: 'deviceToken and workerId required' });

  const device = await validateDevice(deviceToken);
  if (!device) return res.status(401).json({ success: false, message: 'Invalid or unapproved device' });

  const dateStr   = todayUtcStr();
  const activeRB  = await RestroomBreak.findOne({
    company: device.company, worker: workerId, date: dateStr, status: 'active',
  });
  if (!activeRB)
    return res.status(400).json({ success: false, message: 'No active restroom break found' });

  const now         = new Date();
  const elapsed     = Math.max(0, Math.round((now - activeRB.startTime) / 60000));
  const excess      = Math.max(0, elapsed - activeRB.allowedMinutes);
  const overstayed  = excess > 0;
  const deductAmt   = overstayed ? excess * (activeRB.deductionPerMin || DEDUCTION_PER_MIN) : 0;

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
          source:        'manual',
          reason:        'other',
          attendanceDate: new Date(dateStr + 'T00:00:00.000Z'),
          notes: `Restroom overstay — ${excess} min × ₦${activeRB.deductionPerMin || DEDUCTION_PER_MIN}/min = ₦${deductAmt.toLocaleString()}`,
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
      deductionPerMin: activeRB.deductionPerMin || DEDUCTION_PER_MIN,
    },
  });
};

// ─── GET /api/restroom/status — terminal/portal queries ──────────────────────
const getRestroomStatus = async (req, res) => {
  const { deviceToken, workerId } = req.query;
  if (!deviceToken || !workerId)
    return res.status(400).json({ success: false, message: 'deviceToken and workerId required' });

  const device = await validateDevice(deviceToken);
  if (!device) return res.status(401).json({ success: false, message: 'Invalid device' });

  const dateStr    = todayUtcStr();
  const todayBreaks = await RestroomBreak.find({
    company: device.company, worker: workerId, date: dateStr,
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
