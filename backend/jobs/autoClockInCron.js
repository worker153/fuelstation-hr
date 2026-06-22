const cron       = require('node-cron');
const Worker     = require('../models/Worker');
const Shift      = require('../models/Shift');
const Branch     = require('../models/Branch');
const Attendance = require('../models/Attendance');
const { isWorkerOnDuty } = require('../utils/attendanceHelpers');

async function runAutoClockIn(dateStr) {
  const watNow = (() => {
    const n = new Date();
    return new Date(n.getTime() + 60 * 60 * 1000); // UTC → WAT
  })();

  const d = dateStr || [
    watNow.getUTCFullYear(),
    String(watNow.getUTCMonth() + 1).padStart(2, '0'),
    String(watNow.getUTCDate()).padStart(2, '0'),
  ].join('-');

  const clockTime = dateStr
    ? new Date(dateStr + 'T06:00:00.000Z') // 7am WAT for manual runs
    : new Date();

  console.log(`[AUTO-CLOCKIN] Running for ${d}`);

  const workers = await Worker.find({
    autoClockIn:      true,
    employmentStatus: 'active',
  }).lean();

  if (!workers.length) {
    console.log('[AUTO-CLOCKIN] No auto-clockin workers found');
    return 0;
  }

  // Pre-load all shifts needed
  const shiftIds = [...new Set(workers.map(w => w.shiftId).filter(Boolean).map(String))];
  const shifts   = await Shift.find({ _id: { $in: shiftIds } }).lean();
  const shiftMap = Object.fromEntries(shifts.map(s => [String(s._id), s]));

  let created = 0;
  let skipped = 0;

  for (const worker of workers) {
    try {
      // Attach populated shift so isWorkerOnDuty can check fixed-shift days & rotation
      const populatedWorker = {
        ...worker,
        shiftId: worker.shiftId ? shiftMap[String(worker.shiftId)] || null : null,
      };

      // autoClockIn workers clock in every day regardless of rotation/shift schedule
      // Only skip the duty check for workers without the flag (future use)
      if (!worker.autoClockIn && !isWorkerOnDuty(populatedWorker, clockTime)) {
        console.log(`[AUTO-CLOCKIN] ${worker.fullName} — off day, skipping`);
        skipped++;
        continue;
      }

      // Skip if already has a clock-in for today
      const existing = await Attendance.findOne({
        company: worker.company,
        worker:  worker._id,
        date:    d,
        type:    'clock_in',
      }).lean();
      if (existing) {
        console.log(`[AUTO-CLOCKIN] ${worker.fullName} — already clocked in`);
        continue;
      }

      const branch = worker.branchId ? await Branch.findById(worker.branchId).lean() : null;

      await Attendance.create({
        company:        worker.company,
        worker:         worker._id,
        workerName:     worker.fullName,
        workerRole:     worker.role,
        branch:         worker.branchId || null,
        branchName:     branch?.name    || '',
        type:           'clock_in',
        timestamp:      clockTime,
        date:           d,
        status:         'auto',
        deviceVerified: false,
        gpsVerified:    false,
        faceVerified:   false,
        failReasons:    ['auto clock-in'],
        source:         'auto',
      });

      // Auto-assign pump for pump attendants
      const isPumpAttendant = /pump.?attendant/i.test(worker.role || '');
      if (isPumpAttendant && worker.branchId) {
        try {
          const { autoAssignIsland, autoAssignPump } = require('../services/pumpService');
          const params = {
            company:    worker.company,
            branchId:   worker.branchId,
            branchName: branch?.name || '',
            worker,
            date:       d,
            shiftName:  '',
          };
          const assignment = await autoAssignIsland(params);
          if (!assignment) await autoAssignPump(params);
        } catch (e) {
          console.error(`[AUTO-CLOCKIN] pump assign error for ${worker.fullName}:`, e.message);
        }
      }

      created++;
      console.log(`[AUTO-CLOCKIN] Clocked in: ${worker.fullName}`);
    } catch (e) {
      console.error(`[AUTO-CLOCKIN] Error for ${worker.fullName}:`, e.message);
    }
  }

  console.log(`[AUTO-CLOCKIN] Done — ${created} clocked in, ${skipped} off-day skips`);
  return created;
}

function start() {
  // Run daily at 06:00 UTC = 07:00 WAT
  cron.schedule('0 6 * * *', async () => {
    await runAutoClockIn();
  }, { timezone: 'UTC' });

  console.log('[AUTO-CLOCKIN] Scheduled — runs daily at 06:00 UTC (07:00 WAT)');
}

module.exports = { start, runAutoClockIn };
