const cron       = require('node-cron');
const Worker     = require('../models/Worker');
const Branch     = require('../models/Branch');
const Attendance = require('../models/Attendance');

async function runAutoClockIn(dateStr) {
  const watNow = dateStr
    ? new Date(dateStr + 'T07:00:00.000Z')
    : (() => { const n = new Date(); return new Date(n.getTime() + 60 * 60 * 1000); })();

  const d = dateStr || [
    watNow.getUTCFullYear(),
    String(watNow.getUTCMonth() + 1).padStart(2, '0'),
    String(watNow.getUTCDate()).padStart(2, '0'),
  ].join('-');

  console.log(`[AUTO-CLOCKIN] Running for ${d}`);

  const workers = await Worker.find({
    autoClockIn:      true,
    employmentStatus: 'active',
  }).lean();

  if (!workers.length) {
    console.log('[AUTO-CLOCKIN] No auto-clockin workers found');
    return 0;
  }

  let created = 0;
  for (const worker of workers) {
    try {
      // Skip if already clocked in today
      const existing = await Attendance.findOne({
        company: worker.company,
        worker:  worker._id,
        date:    d,
        type:    'clock_in',
      }).lean();
      if (existing) continue;

      const branch = worker.branchId ? await Branch.findById(worker.branchId).lean() : null;

      await Attendance.create({
        company:       worker.company,
        worker:        worker._id,
        workerName:    worker.fullName,
        workerRole:    worker.role,
        branch:        worker.branchId || null,
        branchName:    branch?.name    || '',
        type:          'clock_in',
        timestamp:     watNow,
        date:          d,
        status:        'auto',
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

  console.log(`[AUTO-CLOCKIN] Done — ${created} of ${workers.length} clocked in`);
  return created;
}

function start() {
  // Run daily at 06:00 UTC = 07:00 WAT (shift start)
  cron.schedule('0 6 * * *', async () => {
    await runAutoClockIn();
  }, { timezone: 'UTC' });

  console.log('[AUTO-CLOCKIN] Scheduled — runs daily at 06:00 UTC (07:00 WAT)');
}

module.exports = { start, runAutoClockIn };
