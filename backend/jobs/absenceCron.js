/**
 * Absence Cron Job
 * ─────────────────────────────────────────────────────────────────────────────
 * Runs daily at 01:00 UTC (02:00 WAT) and automatically creates no-clockin
 * shortage deductions for every active worker who:
 *   • Was scheduled to work that day (rotation schedule check)
 *   • Never clocked in
 *   • Has a noClockInDeductionAmount > 0 configured for their role
 *
 * Workers on their "off day" (1-on-1-off rotation etc.) are automatically
 * skipped — they will never be charged for their scheduled day off.
 */

const cron       = require('node-cron');
const Branch     = require('../models/Branch');
const Worker     = require('../models/Worker');
const Attendance = require('../models/Attendance');
const { createAttendanceShortage } = require('../controllers/shortageController');
const { isWorkerOnDuty, getSettingsForRole } = require('../utils/attendanceHelpers');

// ── Core processing function (also exported for manual use / testing) ─────────
async function processAllAbsences(dateStr) {
  console.log(`[ABSENCE CRON] Processing no-shows for ${dateStr}`);

  const [yr, mo, dy] = dateStr.split('-').map(Number);
  const localDate    = new Date(yr, mo - 1, dy);

  if (isNaN(localDate.getTime())) {
    console.error(`[ABSENCE CRON] Invalid date: ${dateStr}`);
    return 0;
  }

  // Get all branches that have at least one attendance rule configured
  const branches = await Branch.find({
    $or: [
      { 'attendanceRules.0': { $exists: true } },
      { 'attendanceSettings.clockInDeadline': { $nin: ['', null] } },
    ]
  }).lean();

  console.log(`[ABSENCE CRON] Found ${branches.length} configured branch(es)`);

  let totalProcessed = 0;
  let totalSkipped   = 0;

  for (const branch of branches) {
    try {
      // Skip if this is not a configured work day (uses default rule's workDays)
      const defaultSettings = getSettingsForRole(branch, null) || {};
      if (defaultSettings.workDays?.length) {
        const dow = localDate.getDay(); // 0 = Sun … 6 = Sat
        if (!defaultSettings.workDays.includes(dow)) {
          console.log(`[ABSENCE CRON] ${branch.name}: not a work day (${dow}) — skipping`);
          continue;
        }
      }

      // Active workers who are required to clock in
      const workers = await Worker.find({
        company:          branch.company,
        branchId:         branch._id,
        employmentStatus: 'active',
        clockInRequired:  { $ne: false },
      }).lean();

      // Workers who DID clock in that day
      const clockedInIds = await Attendance.find({
        company: branch.company,
        branch:  branch._id,
        date:    dateStr,
        type:    'clock_in',
      }).distinct('worker');

      const clockedSet = new Set(clockedInIds.map(String));

      let branchProcessed = 0;
      let branchSkipped   = 0;

      for (const worker of workers) {
        // Already clocked in — not absent
        if (clockedSet.has(String(worker._id))) continue;

        // Off-duty day for this worker (rotation schedule) — never charge
        if (!isWorkerOnDuty(worker, localDate)) {
          branchSkipped++;
          continue;
        }

        // Get deduction amount for this worker's role
        const settings        = getSettingsForRole(branch, worker.role) || {};
        const deductionAmount = settings.noClockInDeductionAmount > 0
          ? settings.noClockInDeductionAmount
          : (settings.absentDeductionAmount || 0);

        if (deductionAmount <= 0) {
          branchSkipped++;
          continue;
        }

        const result = await createAttendanceShortage({
          company:        branch.company,
          worker,
          branchId:       branch._id,
          branchName:     branch.name,
          amount:         deductionAmount,
          source:         'no_clockin',
          reason:         'no_clockin',
          attendanceDate: localDate,
          notes:          `No clock-in — absent on ${dateStr} (auto)`,
        });

        if (!result._alreadyExisted) {
          branchProcessed++;
        }
      }

      totalProcessed += branchProcessed;
      totalSkipped   += branchSkipped;

      if (branchProcessed > 0 || branchSkipped > 0) {
        console.log(`[ABSENCE CRON] ${branch.name}: ${branchProcessed} deducted, ${branchSkipped} skipped (off-duty / no rule)`);
      }

    } catch (err) {
      console.error(`[ABSENCE CRON] ERROR in branch ${branch.name}:`, err.message);
    }
  }

  console.log(`[ABSENCE CRON] Done — ${totalProcessed} deduction(s) created, ${totalSkipped} skipped`);
  return totalProcessed;
}

// ── Schedule: runs at 01:00 UTC = 02:00 WAT every day ─────────────────────────
function startAbsenceCron() {
  cron.schedule('0 1 * * *', async () => {
    // Process YESTERDAY (UTC date, which matches WAT date at 01:00 UTC / 02:00 WAT)
    const yesterday = new Date();
    yesterday.setUTCDate(yesterday.getUTCDate() - 1);
    const dateStr = yesterday.toISOString().split('T')[0];

    try {
      await processAllAbsences(dateStr);
    } catch (err) {
      console.error('[ABSENCE CRON] Unhandled error:', err.message);
    }
  }, { timezone: 'UTC' });

  console.log('[ABSENCE CRON] Scheduled — runs daily at 01:00 UTC (02:00 WAT)');
}

module.exports = { startAbsenceCron, processAllAbsences };
