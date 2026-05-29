const Break           = require('../models/Break');
const AttendanceDevice = require('../models/AttendanceDevice');
const Worker          = require('../models/Worker');
const Branch          = require('../models/Branch');
const Attendance      = require('../models/Attendance');

// ─── Helpers ──────────────────────────────────────────────────────────────────

// 'HH:MM' → minutes since midnight
function toMins(hhmm) {
  if (!hhmm) return null;
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
}

function nowUtcMins() {
  const n = new Date();
  return n.getUTCHours() * 60 + n.getUTCMinutes();
}

function todayUtcStr() {
  return new Date().toISOString().split('T')[0];
}

const BREAK_DEFAULTS = {
  morning:   { enabled: true, allowedMinutes: 5,  windowStart: '07:00', windowEnd: '09:30' },
  afternoon: { enabled: true, allowedMinutes: 10, windowStart: '12:00', windowEnd: '14:00' },
  night:     { enabled: true, allowedMinutes: 5,  windowStart: '19:00', windowEnd: '21:00' },
};

const BREAK_LABELS = {
  morning:   'Morning Break',
  afternoon: 'Afternoon Break',
  night:     'Night Break',
};

function getBreakConfig(branch) {
  const s = branch?.breakSettings || {};
  return {
    morning:   { ...BREAK_DEFAULTS.morning,   ...(s.morning   || {}) },
    afternoon: { ...BREAK_DEFAULTS.afternoon, ...(s.afternoon || {}) },
    night:     { ...BREAK_DEFAULTS.night,     ...(s.night     || {}) },
  };
}

async function validateDevice(deviceToken) {
  if (!deviceToken) return null;
  return AttendanceDevice.findOne({ deviceToken, status: 'approved' }).lean();
}

// ─── POST /api/breaks/start ───────────────────────────────────────────────────
const startBreak = async (req, res) => {
  const { deviceToken, workerId, breakType } = req.body;
  if (!deviceToken || !workerId || !breakType)
    return res.status(400).json({ success: false, message: 'deviceToken, workerId and breakType required' });

  const device = await validateDevice(deviceToken);
  if (!device) return res.status(401).json({ success: false, message: 'Invalid or unapproved device' });

  const worker = await Worker.findOne({ _id: workerId, company: device.company, employmentStatus: 'active' }).lean();
  if (!worker) return res.status(404).json({ success: false, message: 'Worker not found' });

  const dateStr = todayUtcStr();

  // Must be clocked in (and not clocked out)
  const clockIn  = await Attendance.findOne({ company: device.company, worker: worker._id, date: dateStr, type: 'clock_in'  }).lean();
  const clockOut = await Attendance.findOne({ company: device.company, worker: worker._id, date: dateStr, type: 'clock_out' }).lean();
  if (!clockIn)  return res.status(400).json({ success: false, message: 'You must clock in before taking a break' });
  if (clockOut)  return res.status(400).json({ success: false, message: 'You have already clocked out today' });

  // Validate break type
  if (!['morning', 'afternoon', 'night'].includes(breakType))
    return res.status(400).json({ success: false, message: 'Invalid break type' });

  const branch = await Branch.findById(device.branch).lean();
  const config  = getBreakConfig(branch);
  const cfg     = config[breakType];

  if (!cfg.enabled)
    return res.status(400).json({ success: false, message: `${BREAK_LABELS[breakType]} is not enabled for this branch` });

  // Check window
  const nowMins  = nowUtcMins();
  const winStart = toMins(cfg.windowStart);
  const winEnd   = toMins(cfg.windowEnd);
  if (winStart !== null && nowMins < winStart)
    return res.status(400).json({ success: false, message: `${BREAK_LABELS[breakType]} window hasn't started yet. Available from ${cfg.windowStart} UTC` });
  if (winEnd !== null && nowMins > winEnd)
    return res.status(400).json({ success: false, message: `${BREAK_LABELS[breakType]} window has closed (closed at ${cfg.windowEnd} UTC)` });

  // Already have an active break?
  const active = await Break.findOne({ company: device.company, worker: worker._id, date: dateStr, status: 'active' }).lean();
  if (active)
    return res.status(400).json({ success: false, message: `You are already on a ${BREAK_LABELS[active.breakType]} — end it first` });

  // Already took this break type today?
  const prior = await Break.findOne({ company: device.company, worker: worker._id, date: dateStr, breakType }).lean();
  if (prior && prior.status !== 'missed')
    return res.status(400).json({ success: false, message: `You already took your ${BREAK_LABELS[breakType]} today` });

  const now = new Date();
  const deadline = new Date(now.getTime() + cfg.allowedMinutes * 60000);

  // Upsert: if a 'missed' record exists replace it; otherwise create fresh
  const breakRecord = await Break.findOneAndUpdate(
    { company: device.company, worker: worker._id, date: dateStr, breakType },
    {
      $set: {
        company:    device.company,
        branchId:   device.branch,
        branchName: device.branchName || branch.name,
        worker:     worker._id,
        workerName: worker.fullName,
        workerRole: worker.role,
        date:       dateStr,
        breakType,
        status:     'active',
        allowedMinutes: cfg.allowedMinutes,
        windowStart:    cfg.windowStart,
        windowEnd:      cfg.windowEnd,
        startTime:  now,
        endTime:    null,
        actualMinutes: 0,
        excessMinutes: 0,
      },
      $push: {
        auditLog: {
          action:    'started',
          timestamp: now,
          by:        'worker',
          notes:     `${worker.fullName} started ${BREAK_LABELS[breakType]}`,
        },
      },
    },
    { upsert: true, new: true }
  );

  res.json({
    success: true,
    message: `${BREAK_LABELS[breakType]} started — you have ${cfg.allowedMinutes} minutes`,
    data: {
      _id:            breakRecord._id,
      breakType,
      label:          BREAK_LABELS[breakType],
      allowedMinutes: cfg.allowedMinutes,
      startTime:      now,
      deadline,
    },
  });
};

// ─── POST /api/breaks/end ─────────────────────────────────────────────────────
const endBreak = async (req, res) => {
  const { deviceToken, workerId } = req.body;
  if (!deviceToken || !workerId)
    return res.status(400).json({ success: false, message: 'deviceToken and workerId required' });

  const device = await validateDevice(deviceToken);
  if (!device) return res.status(401).json({ success: false, message: 'Invalid or unapproved device' });

  const dateStr = todayUtcStr();
  const activeBreak = await Break.findOne({
    company: device.company,
    worker:  workerId,
    date:    dateStr,
    status:  'active',
  });

  if (!activeBreak)
    return res.status(400).json({ success: false, message: 'No active break found' });

  const now         = new Date();
  const elapsedMs   = now - activeBreak.startTime;
  const actualMins  = Math.max(0, Math.round(elapsedMs / 60000));
  const excessMins  = Math.max(0, actualMins - activeBreak.allowedMinutes);
  const overstayed  = excessMins > 0;

  activeBreak.endTime       = now;
  activeBreak.actualMinutes = actualMins;
  activeBreak.excessMinutes = excessMins;
  activeBreak.status        = overstayed ? 'overstayed' : 'completed';
  activeBreak.auditLog.push({
    action:    overstayed ? 'ended_overstayed' : 'ended',
    timestamp: now,
    by:        'worker',
    notes:     `Ended after ${actualMins} min (allowed ${activeBreak.allowedMinutes} min)${overstayed ? ` — ${excessMins} min OVER` : ''}`,
  });

  await activeBreak.save();

  res.json({
    success: true,
    overstayed,
    data: {
      breakType:      activeBreak.breakType,
      label:          BREAK_LABELS[activeBreak.breakType],
      status:         activeBreak.status,
      actualMinutes:  actualMins,
      allowedMinutes: activeBreak.allowedMinutes,
      excessMinutes:  excessMins,
    },
  });
};

// ─── GET /api/breaks/status — terminal queries this after PIN ─────────────────
const getBreakStatus = async (req, res) => {
  const { deviceToken, workerId } = req.query;
  if (!deviceToken || !workerId)
    return res.status(400).json({ success: false, message: 'deviceToken and workerId required' });

  const device = await validateDevice(deviceToken);
  if (!device) return res.status(401).json({ success: false, message: 'Invalid device' });

  const dateStr = todayUtcStr();

  const [clockIn, clockOut, todayBreaks, branch] = await Promise.all([
    Attendance.findOne({ company: device.company, worker: workerId, date: dateStr, type: 'clock_in'  }).lean(),
    Attendance.findOne({ company: device.company, worker: workerId, date: dateStr, type: 'clock_out' }).lean(),
    Break.find({ company: device.company, worker: workerId, date: dateStr }).lean(),
    Branch.findById(device.branch).lean(),
  ]);

  const config    = getBreakConfig(branch);
  const nowMins   = nowUtcMins();
  const now       = new Date();
  const clockedIn  = !!clockIn && !clockOut;
  const clockedOut = !!clockOut;
  const activeBreak = todayBreaks.find(b => b.status === 'active');

  let elapsedMinutes = 0;
  let isOverdue = false;
  if (activeBreak) {
    elapsedMinutes = Math.floor((now - new Date(activeBreak.startTime)) / 60000);
    isOverdue      = elapsedMinutes > activeBreak.allowedMinutes;
  }

  // Attendance status
  let attendanceStatus = 'absent';
  if (clockedOut)                         attendanceStatus = 'clocked_out';
  else if (activeBreak && isOverdue)      attendanceStatus = 'break_overdue';
  else if (activeBreak)                   attendanceStatus = 'on_break';
  else if (clockedIn)                     attendanceStatus = 'active';

  // Available breaks
  const availableBreaks = Object.entries(config).map(([type, cfg]) => {
    const taken   = todayBreaks.find(b => b.breakType === type);
    const winStart = toMins(cfg.windowStart);
    const winEnd   = toMins(cfg.windowEnd);
    const inWindow = cfg.enabled
      && (!winStart || nowMins >= winStart)
      && (!winEnd   || nowMins <= winEnd);

    return {
      type,
      label:          BREAK_LABELS[type],
      allowedMinutes: cfg.allowedMinutes,
      windowStart:    cfg.windowStart,
      windowEnd:      cfg.windowEnd,
      enabled:        cfg.enabled,
      inWindow,
      taken:  !!taken && taken.status !== 'missed',
      status: taken?.status || null,
    };
  });

  res.json({
    success: true,
    data: {
      attendanceStatus,
      clockedIn,
      clockedOut,
      clockInTime: clockIn?.timestamp || null,
      activeBreak: activeBreak ? {
        _id:            activeBreak._id,
        breakType:      activeBreak.breakType,
        label:          BREAK_LABELS[activeBreak.breakType],
        startTime:      activeBreak.startTime,
        allowedMinutes: activeBreak.allowedMinutes,
        elapsedMinutes,
        isOverdue,
        excessMinutes:  Math.max(0, elapsedMinutes - activeBreak.allowedMinutes),
      } : null,
      todayBreaks: todayBreaks.map(b => ({
        breakType:      b.breakType,
        label:          BREAK_LABELS[b.breakType],
        status:         b.status,
        startTime:      b.startTime,
        endTime:        b.endTime,
        actualMinutes:  b.actualMinutes,
        allowedMinutes: b.allowedMinutes,
        excessMinutes:  b.excessMinutes,
      })),
      availableBreaks,
    },
  });
};

// ─── GET /api/breaks — admin list ─────────────────────────────────────────────
const getBreaks = async (req, res) => {
  const { date, branchId, workerId, status, page = 1, limit = 100 } = req.query;
  const cid = req.user.company._id;

  const filter = { company: cid };
  filter.date  = date || todayUtcStr();
  if (branchId) filter.branchId = branchId;
  if (workerId) filter.worker   = workerId;
  if (status)   filter.status   = status;

  const [breaks, total] = await Promise.all([
    Break.find(filter)
      .sort({ startTime: 1, createdAt: 1 })
      .limit(Number(limit))
      .skip((Number(page) - 1) * Number(limit))
      .lean(),
    Break.countDocuments(filter),
  ]);

  res.json({ success: true, data: breaks, total });
};

// ─── GET /api/breaks/summary — dashboard stats ────────────────────────────────
const getBreakSummary = async (req, res) => {
  const { date, branchId } = req.query;
  const cid = req.user.company._id;
  const targetDate = date || todayUtcStr();

  const filter = { company: cid, date: targetDate };
  if (branchId) filter.branchId = branchId;

  const breaks = await Break.find(filter).lean();

  const summary = {
    total:      breaks.length,
    active:     breaks.filter(b => b.status === 'active').length,
    completed:  breaks.filter(b => b.status === 'completed').length,
    overstayed: breaks.filter(b => b.status === 'overstayed').length,
    missed:     breaks.filter(b => b.status === 'missed').length,
    byType: {},
  };

  for (const type of ['morning', 'afternoon', 'night']) {
    const rows = breaks.filter(b => b.breakType === type);
    summary.byType[type] = {
      total:      rows.length,
      completed:  rows.filter(b => b.status === 'completed').length,
      overstayed: rows.filter(b => b.status === 'overstayed').length,
      missed:     rows.filter(b => b.status === 'missed').length,
      active:     rows.filter(b => b.status === 'active').length,
    };
  }

  res.json({ success: true, data: { date: targetDate, summary, breaks } });
};

// ─── POST /api/breaks/process-missed — admin trigger ─────────────────────────
const processMissedBreaks = async (req, res) => {
  const { branchId, date } = req.body;
  if (!branchId || !date)
    return res.status(400).json({ success: false, message: 'branchId and date required' });

  const cid    = req.user.company._id;
  const branch = await Branch.findOne({ _id: branchId, company: cid }).lean();
  if (!branch) return res.status(404).json({ success: false, message: 'Branch not found' });

  const config  = getBreakConfig(branch);
  const nowMins = nowUtcMins();

  const clockedIn = await Attendance.find({
    company: cid, branchId, date, type: 'clock_in',
  }).distinct('worker');

  let processed = 0;

  for (const workerId of clockedIn) {
    for (const [breakType, cfg] of Object.entries(config)) {
      if (!cfg.enabled) continue;
      const winEnd = toMins(cfg.windowEnd);
      if (winEnd && nowMins <= winEnd) continue;  // window still open

      const existing = await Break.findOne({ company: cid, worker: workerId, date, breakType }).lean();
      if (existing) continue;

      const worker = await Worker.findById(workerId).select('fullName role').lean();
      try {
        await Break.create({
          company:    cid,
          branchId:   branch._id,
          branchName: branch.name,
          worker:     workerId,
          workerName: worker?.fullName || '',
          workerRole: worker?.role || '',
          date,
          breakType,
          status:     'missed',
          allowedMinutes: cfg.allowedMinutes,
          windowStart:    cfg.windowStart,
          windowEnd:      cfg.windowEnd,
          auditLog: [{
            action: 'auto_missed', by: 'system',
            notes:  `Window closed (${cfg.windowStart}–${cfg.windowEnd} UTC) — break not taken`,
          }],
        });
        processed++;
      } catch (e) {
        if (e.code !== 11000) console.error('[BREAKS] processMissed error:', e.message);
      }
    }
  }

  res.json({ success: true, processed, workers: clockedIn.length });
};

module.exports = {
  startBreak, endBreak, getBreakStatus,
  getBreaks, getBreakSummary, processMissedBreaks,
  getBreakConfig, BREAK_LABELS,
};
