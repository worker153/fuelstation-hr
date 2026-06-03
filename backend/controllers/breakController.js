const Break           = require('../models/Break');
const AttendanceDevice = require('../models/AttendanceDevice');
const Worker          = require('../models/Worker');
const Branch          = require('../models/Branch');
const Attendance      = require('../models/Attendance');

// ─── Helpers ──────────────────────────────────────────────────────────────────

// Nigeria WAT = UTC+1 — all break window times are treated as local (WAT) time
const WAT_OFFSET_MINS = 60;

// 'HH:MM' → minutes since midnight
function toMins(hhmm) {
  if (!hhmm) return null;
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
}

// Current local (WAT) time in minutes since midnight
function nowLocalMins() {
  const n = new Date();
  return (n.getUTCHours() * 60 + n.getUTCMinutes() + WAT_OFFSET_MINS) % (24 * 60);
}

function todayUtcStr() {
  return new Date().toISOString().split('T')[0];
}

const BREAK_DEFAULTS = {
  morning:   { enabled: true,  label: 'Morning Break',   allowedMinutes: 5,  windowStart: '07:00', windowEnd: '09:30' },
  afternoon: { enabled: true,  label: 'Afternoon Break', allowedMinutes: 10, windowStart: '12:00', windowEnd: '14:00' },
  night:     { enabled: true,  label: 'Night Break',     allowedMinutes: 5,  windowStart: '19:00', windowEnd: '21:00' },
  break_4:   { enabled: false, label: 'Break 4',         allowedMinutes: 10, windowStart: '10:00', windowEnd: '12:00' },
  break_5:   { enabled: false, label: 'Break 5',         allowedMinutes: 10, windowStart: '15:00', windowEnd: '17:00' },
  break_6:   { enabled: false, label: 'Break 6',         allowedMinutes: 10, windowStart: '22:00', windowEnd: '23:30' },
};

// Fallback label lookup (used where config object not available)
const BREAK_LABELS = Object.fromEntries(
  Object.entries(BREAK_DEFAULTS).map(([k, v]) => [k, v.label])
);

function getBreakConfig(branch) {
  const s = branch?.breakSettings || {};
  const result = {};
  for (const [key, defaults] of Object.entries(BREAK_DEFAULTS)) {
    const stored = s[key] ? (s[key].toObject ? s[key].toObject() : s[key]) : {};
    result[key] = {
      ...defaults,
      ...stored,
      // Custom label from branch settings overrides default; empty string = use default
      label: stored.label || defaults.label,
    };
  }
  return result;
}

async function validateDevice(deviceToken) {
  if (!deviceToken) return null;
  return AttendanceDevice.findOne({ deviceToken, status: 'approved' }).lean();
}

// ─── Haversine distance (metres) ──────────────────────────────────────────────
function haversineDistance(lat1, lng1, lat2, lng2) {
  const R = 6371000;
  const φ1 = lat1 * Math.PI / 180, φ2 = lat2 * Math.PI / 180;
  const Δφ = (lat2 - lat1) * Math.PI / 180;
  const Δλ = (lng2 - lng1) * Math.PI / 180;
  const a  = Math.sin(Δφ/2)**2 + Math.cos(φ1)*Math.cos(φ2)*Math.sin(Δλ/2)**2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
}

// ─── Dual-auth context resolver ───────────────────────────────────────────────
// Accepts either:  deviceToken (approved branch device)
//              or  pin + gps   (worker's personal phone — GPS required for mutating ops)
// requireGPS: false — skip GPS check for read-only status queries
async function resolveBreakContext({ deviceToken, pin, gps, reqWorkerId, requireGPS = true }) {
  if (deviceToken) {
    const device = await validateDevice(deviceToken);
    if (!device) return { error: 'Invalid or unapproved device' };
    return {
      company:   device.company,
      branchId:  device.branch,
      branchName: device.branchName || '',
      workerId:  reqWorkerId,
      authType:  'device',
      device,
      branch:    null, // loaded by caller if needed
    };
  }
  if (pin) {
    if (requireGPS && (!gps?.lat || !gps?.lng))
      return { error: 'GPS location is required when starting a break from your personal phone. Please allow location access.' };
    const worker = await Worker.findOne({ pin: String(pin).trim(), employmentStatus: 'active' })
      .populate('branchId', 'name breakSettings restroomSettings location personalPhoneRadius')
      .lean();
    if (!worker) return { error: 'Invalid PIN — worker not found' };
    const branch = worker.branchId; // populated

    // ── GPS radius check (personal phone only, mutating ops) ─────────────────
    if (requireGPS && gps?.lat != null && gps?.lng != null) {
      const bLat   = branch?.location?.lat;
      const bLng   = branch?.location?.lng;
      const radius = branch?.personalPhoneRadius ?? 150;

      if (radius > 0) {
        if (bLat == null || bLng == null) {
          // Admin set a radius but forgot to pin branch GPS — block until fixed
          return { error: 'Branch GPS location is not set. Contact admin to pin the branch on the map before using a personal phone for breaks.' };
        }
        const dist = haversineDistance(gps.lat, gps.lng, bLat, bLng);
        if (dist > radius) {
          return { error: 'YOU ARE NOT IN LOCATION' };
        }
      }
    }

    return {
      company:    worker.company,
      branchId:   branch?._id || worker.branchId,
      branchName: branch?.name || worker.branch || '',
      workerId:   String(worker._id),
      authType:   'pin',
      pinWorker:  worker,
      branch,
    };
  }
  return { error: 'deviceToken or PIN required' };
}

// ─── POST /api/breaks/start ───────────────────────────────────────────────────
const startBreak = async (req, res) => {
  const { deviceToken, pin, gps, workerId: reqWorkerId, breakType } = req.body;
  if (!breakType)
    return res.status(400).json({ success: false, message: 'breakType required' });

  const ctx = await resolveBreakContext({ deviceToken, pin, gps, reqWorkerId });
  if (ctx.error) return res.status(401).json({ success: false, message: ctx.error });

  const { company, branchId, branchName, authType } = ctx;
  const workerId = ctx.workerId;

  const worker = ctx.pinWorker
    || await Worker.findOne({ _id: workerId, company, employmentStatus: 'active' }).lean();
  if (!worker) return res.status(404).json({ success: false, message: 'Worker not found' });

  const dateStr = todayUtcStr();

  // Must be clocked in (and not clocked out)
  const clockIn  = await Attendance.findOne({ company, worker: worker._id, date: dateStr, type: 'clock_in'  }).lean();
  const clockOut = await Attendance.findOne({ company, worker: worker._id, date: dateStr, type: 'clock_out' }).lean();
  if (!clockIn)  return res.status(400).json({ success: false, message: 'You must clock in before taking a break' });
  if (clockOut)  return res.status(400).json({ success: false, message: 'You have already clocked out today' });

  // Validate break type
  if (!Object.keys(BREAK_DEFAULTS).includes(breakType))
    return res.status(400).json({ success: false, message: 'Invalid break type' });

  const branch = ctx.branch || (ctx.device ? await Branch.findById(ctx.device.branch).lean() : null);
  const config  = getBreakConfig(branch);
  const cfg     = config[breakType];

  if (!cfg.enabled)
    return res.status(400).json({ success: false, message: `${BREAK_LABELS[breakType]} is not enabled for this branch` });

  // Check window (times are local WAT)
  const nowMins  = nowLocalMins();
  const winStart = toMins(cfg.windowStart);
  const winEnd   = toMins(cfg.windowEnd);
  if (winStart !== null && nowMins < winStart)
    return res.status(400).json({ success: false, message: `${BREAK_LABELS[breakType]} window hasn't started yet. Available from ${cfg.windowStart}` });
  if (winEnd !== null && nowMins > winEnd)
    return res.status(400).json({ success: false, message: `${BREAK_LABELS[breakType]} window has closed (closed at ${cfg.windowEnd})` });

  // Already have an active break?
  const active = await Break.findOne({ company, worker: worker._id, date: dateStr, status: 'active' }).lean();
  if (active)
    return res.status(400).json({ success: false, message: `You are already on a ${BREAK_LABELS[active.breakType]} — end it first` });

  // Already took this break type today?
  const prior = await Break.findOne({ company, worker: worker._id, date: dateStr, breakType }).lean();
  if (prior && prior.status !== 'missed')
    return res.status(400).json({ success: false, message: `You already took your ${BREAK_LABELS[breakType]} today` });

  // ── Minimum active workers check ─────────────────────────────────────────────
  const minActive = branch?.minActiveWorkers ?? 1;
  if (minActive > 0) {
    const [presentIds, clockedOutIds, onBreakCount] = await Promise.all([
      Attendance.distinct('worker', { company, branch: branchId, date: dateStr, type: 'clock_in' }),
      Attendance.distinct('worker', { company, branch: branchId, date: dateStr, type: 'clock_out' }),
      Break.countDocuments({ company, branchId, date: dateStr, status: 'active' }),
    ]);
    const clockedOutSet  = new Set(clockedOutIds.map(String));
    const presentCount   = presentIds.filter(id => !clockedOutSet.has(String(id))).length;
    const activeNow      = presentCount - onBreakCount;   // workers currently NOT on break
    // After this worker starts a break, activeNow drops by 1
    if (activeNow - 1 < minActive) {
      return res.status(400).json({
        success: false,
        breakBlocked: true,
        message: 'Break not available at the moment. Minimum active workers must remain on duty.',
      });
    }
  }

  const now = new Date();
  const deadline = new Date(now.getTime() + cfg.allowedMinutes * 60000);

  // Upsert: if a 'missed' record exists replace it; otherwise create fresh
  const breakRecord = await Break.findOneAndUpdate(
    { company, worker: worker._id, date: dateStr, breakType },
    {
      $set: {
        company,
        branchId,
        branchName: branchName || branch?.name || '',
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
        authType,
        ...(gps?.lat ? { startGps: { lat: gps.lat, lng: gps.lng, accuracy: gps.accuracy } } : {}),
      },
      $push: {
        auditLog: {
          action:    'started',
          timestamp: now,
          by:        authType === 'pin' ? 'worker_phone' : 'worker',
          notes:     `${worker.fullName} started ${BREAK_LABELS[breakType]}${authType === 'pin' ? ' (personal phone)' : ''}`,
        },
      },
    },
    { upsert: true, new: true }
  );

  // Fire push notification (non-blocking)
  setImmediate(async () => {
    try {
      const { sendPushToCompany } = require('./pushController');
      const timeStr = new Date(now.getTime() + 60 * 60 * 1000)
        .toLocaleTimeString('en-NG', { hour: '2-digit', minute: '2-digit', hour12: true });
      await sendPushToCompany(company, {
        title: `☕ ${worker.fullName} started break`,
        body:  `${BREAK_LABELS[breakType]} · ${branchName} · ${timeStr}`,
        tag:   `break-start-${worker._id}`,
        url:   '/admin-dashboard',
      });
    } catch { /* ignore */ }
  });

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
  const { deviceToken, pin, gps, workerId: reqWorkerId } = req.body;

  const ctx = await resolveBreakContext({ deviceToken, pin, gps, reqWorkerId });
  if (ctx.error) return res.status(401).json({ success: false, message: ctx.error });

  const { company, authType } = ctx;
  const workerId = ctx.workerId;

  const dateStr = todayUtcStr();
  const activeBreak = await Break.findOne({
    company,
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
  if (gps?.lat) activeBreak.endGps = { lat: gps.lat, lng: gps.lng, accuracy: gps.accuracy };
  activeBreak.auditLog.push({
    action:    overstayed ? 'ended_overstayed' : 'ended',
    timestamp: now,
    by:        authType === 'pin' ? 'worker_phone' : 'worker',
    notes:     `Ended after ${actualMins} min (allowed ${activeBreak.allowedMinutes} min)${overstayed ? ` — ${excessMins} min OVER` : ''}${authType === 'pin' ? ' (personal phone)' : ''}`,
  });

  await activeBreak.save();

  // Fire push notification (non-blocking)
  setImmediate(async () => {
    try {
      const { sendPushToCompany } = require('./pushController');
      const timeStr = new Date(now.getTime() + 60 * 60 * 1000)
        .toLocaleTimeString('en-NG', { hour: '2-digit', minute: '2-digit', hour12: true });
      const overNote = overstayed ? ` ⚠️ ${excessMins} min over` : ` · ${actualMins} min`;
      await sendPushToCompany(company, {
        title: `✅ ${activeBreak.workerName} returned from break`,
        body:  `${BREAK_LABELS[activeBreak.breakType]} · ${activeBreak.branchName} · ${timeStr}${overNote}`,
        tag:   `break-end-${workerId}`,
        url:   '/admin-dashboard',
      });
    } catch { /* ignore */ }
  });

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

// ─── GET /api/breaks/status — terminal OR personal phone queries this ─────────
const getBreakStatus = async (req, res) => {
  const { deviceToken, workerId: reqWorkerId, pin } = req.query;

  const ctx = await resolveBreakContext({ deviceToken, pin, gps: null, reqWorkerId, requireGPS: false });
  if (ctx.error) return res.status(401).json({ success: false, message: ctx.error });

  const { company, branchId, authType } = ctx;
  const workerId = ctx.workerId;

  const dateStr = todayUtcStr();

  const [clockIn, clockOut, todayBreaks, branch] = await Promise.all([
    Attendance.findOne({ company, worker: workerId, date: dateStr, type: 'clock_in'  }).lean(),
    Attendance.findOne({ company, worker: workerId, date: dateStr, type: 'clock_out' }).lean(),
    Break.find({ company, worker: workerId, date: dateStr }).lean(),
    ctx.branch || Branch.findById(branchId).lean(),
  ]);

  const config    = getBreakConfig(branch);
  const nowMins   = nowLocalMins();
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

  // Available breaks — only include enabled slots (extras are hidden until admin enables them)
  const availableBreaks = Object.entries(config)
    .filter(([, cfg]) => cfg.enabled)
    .map(([type, cfg]) => {
      const taken   = todayBreaks.find(b => b.breakType === type);
      const winStart = toMins(cfg.windowStart);
      const winEnd   = toMins(cfg.windowEnd);
      const inWindow = (!winStart || nowMins >= winStart) && (!winEnd || nowMins <= winEnd);

      return {
        type,
        label:          cfg.label,
        allowedMinutes: cfg.allowedMinutes,
        windowStart:    cfg.windowStart,
        windowEnd:      cfg.windowEnd,
        enabled:        cfg.enabled,
        inWindow,
        taken:  !!taken && taken.status !== 'missed',
        status: taken?.status || null,
      };
    });

  // Server WAT time for client-side debug / display
  const watH   = Math.floor(nowMins / 60);
  const watM   = nowMins % 60;
  const serverTimeWAT = `${String(watH).padStart(2,'0')}:${String(watM).padStart(2,'0')}`;

  res.json({
    success: true,
    data: {
      attendanceStatus,
      clockedIn,
      clockedOut,
      clockInTime: clockIn?.timestamp || null,
      serverTimeWAT,
      restroomConfig: {
        allowedMinutes:  branch?.restroomSettings?.allowedMinutes  ?? 2,
        deductionPerMin: branch?.restroomSettings?.deductionPerMin ?? 500,
      },
      activeBreak: activeBreak ? {
        _id:            activeBreak._id,
        breakType:      activeBreak.breakType,
        label:          config[activeBreak.breakType]?.label || BREAK_LABELS[activeBreak.breakType],
        startTime:      activeBreak.startTime,
        allowedMinutes: activeBreak.allowedMinutes,
        elapsedMinutes,
        isOverdue,
        excessMinutes:  Math.max(0, elapsedMinutes - activeBreak.allowedMinutes),
      } : null,
      todayBreaks: todayBreaks.map(b => ({
        breakType:      b.breakType,
        label:          config[b.breakType]?.label || BREAK_LABELS[b.breakType],
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

  // Load branch break settings to know which slots are enabled + their custom labels
  const Branch = require('../models/Branch');
  let enabledSlots = new Set(['morning', 'afternoon', 'night']);
  let customLabels = {};
  if (branchId) {
    const branch = await Branch.findById(branchId).lean();
    if (branch?.breakSettings) {
      Object.entries(branch.breakSettings).forEach(([key, cfg]) => {
        if (cfg?.enabled) enabledSlots.add(key);
        if (cfg?.label) customLabels[key] = cfg.label;
      });
    }
  }

  const summary = {
    total:      breaks.length,
    active:     breaks.filter(b => b.status === 'active').length,
    completed:  breaks.filter(b => b.status === 'completed').length,
    overstayed: breaks.filter(b => b.status === 'overstayed').length,
    missed:     breaks.filter(b => b.status === 'missed').length,
    byType: {},
  };

  for (const type of Object.keys(BREAK_DEFAULTS)) {
    const rows = breaks.filter(b => b.breakType === type);
    // Include if: has records OR is an enabled break slot in this branch
    if (rows.length === 0 && !enabledSlots.has(type)) continue;
    summary.byType[type] = {
      label:      customLabels[type] || BREAK_LABELS[type],
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
  const nowMins = nowLocalMins();

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

// ─── GET /api/breaks/shift-board — public shift status board ─────────────────
// Requires deviceToken OR pin+workerId to identify the branch.
// Returns: list of clocked-in workers with statuses, counters, break availability.
const getShiftBoard = async (req, res) => {
  const { deviceToken, pin, workerId: reqWorkerId } = req.query;

  const ctx = await resolveBreakContext({ deviceToken, pin, gps: null, reqWorkerId, requireGPS: false });
  if (ctx.error) return res.status(401).json({ success: false, message: ctx.error });

  const { company, branchId } = ctx;
  const dateStr = todayUtcStr();

  const branch = ctx.branch || (branchId ? await Branch.findById(branchId).lean() : null);
  if (!branch) return res.status(404).json({ success: false, message: 'Branch not found' });

  const minActiveWorkers = branch.minActiveWorkers ?? 1;

  // Workers present today (clocked in, not clocked out)
  const [clockedInIds, clockedOutIds] = await Promise.all([
    Attendance.distinct('worker', { company, branch: branchId, date: dateStr, type: 'clock_in'  }),
    Attendance.distinct('worker', { company, branch: branchId, date: dateStr, type: 'clock_out' }),
  ]);
  const clockedOutSet  = new Set(clockedOutIds.map(String));
  const presentIds     = clockedInIds.filter(id => !clockedOutSet.has(String(id)));

  // Active breaks among present workers
  const activeBreaks = await Break.find({
    company, branchId, date: dateStr, status: 'active',
    worker: { $in: presentIds },
  }).lean();
  const onBreakMap = {};
  activeBreaks.forEach(b => { onBreakMap[String(b.worker)] = b; });

  // Fetch names / roles
  const workerDocs = await Worker.find({ _id: { $in: presentIds }, company })
    .select('fullName role').lean();
  const workerMap = {};
  workerDocs.forEach(w => { workerMap[String(w._id)] = w; });

  const config     = getBreakConfig(branch);
  const workerRows = presentIds.map(id => {
    const w  = workerMap[String(id)];
    const br = onBreakMap[String(id)];
    return {
      id:         String(id),
      name:       w?.fullName || 'Unknown',
      role:       w?.role     || '',
      status:     br ? 'on_break' : 'active',
      breakLabel: br ? (config[br.breakType]?.label || BREAK_LABELS[br.breakType]) : null,
      breakStart: br?.startTime || null,
    };
  }).sort((a, b) => {
    if (a.status !== b.status) return a.status === 'active' ? -1 : 1;
    return a.name.localeCompare(b.name);
  });

  const onBreakCount   = workerRows.filter(w => w.status === 'on_break').length;
  const activeCount    = workerRows.filter(w => w.status === 'active').length;
  // Break available if removing 1 active worker still keeps enough on duty
  const breakAvailable = minActiveWorkers === 0 || (activeCount - 1) >= minActiveWorkers;

  res.json({
    success: true,
    data: {
      branchName:       branch.name,
      date:             dateStr,
      minActiveWorkers,
      breakAvailable,
      activeCount,
      onBreakCount,
      totalPresent:     workerRows.length,
      workers:          workerRows,
    },
  });
};

module.exports = {
  startBreak, endBreak, getBreakStatus,
  getBreaks, getBreakSummary, processMissedBreaks,
  getShiftBoard,
  getBreakConfig, BREAK_LABELS,
};
