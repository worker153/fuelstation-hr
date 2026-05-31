/**
 * Break Cron — runs every 5 minutes.
 *
 * Job 1: Detect overstayed breaks
 *   Active breaks that started > (allowedMinutes + 2 grace) minutes ago → mark 'overstayed'
 *
 * Job 2: Detect missed breaks
 *   For each break window that has just closed (in the last 5 min) and each worker who
 *   clocked in but never started that break → create a 'missed' record.
 */
const cron       = require('node-cron');
const Break      = require('../models/Break');
const Branch     = require('../models/Branch');
const Worker     = require('../models/Worker');
const Attendance = require('../models/Attendance');
const { getBreakConfig }            = require('../controllers/breakController');
const { createAttendanceShortage }  = require('../controllers/shortageController');

const WAT_OFFSET_MINS = 60; // Nigeria WAT = UTC+1

function toMins(hhmm) {
  if (!hhmm) return null;
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
}

async function runBreakCron() {
  const now     = new Date();
  // Use WAT local time — break windows are stored as WAT times
  const nowMins = (now.getUTCHours() * 60 + now.getUTCMinutes() + WAT_OFFSET_MINS) % (24 * 60);
  const dateStr = now.toISOString().split('T')[0];

  // ── 1. Overstayed detection ───────────────────────────────────────────────────
  const activeBreaks = await Break.find({ status: 'active' }).lean();
  for (const b of activeBreaks) {
    const elapsedMins = Math.floor((now - new Date(b.startTime)) / 60000);
    const grace = 2;   // 2-minute grace before marking overstayed
    if (elapsedMins > b.allowedMinutes + grace) {
      const excess = elapsedMins - b.allowedMinutes;
      await Break.findByIdAndUpdate(b._id, {
        $set:  { status: 'overstayed', excessMinutes: excess },
        $push: { auditLog: {
          action: 'auto_overstay', by: 'cron', timestamp: now,
          notes:  `Auto-detected ${excess} min overstay (elapsed: ${elapsedMins} min, allowed: ${b.allowedMinutes} min)`,
        }},
      });
      console.log(`[BREAK-CRON] Overstay: ${b.workerName} — ${b.breakType} break, ${excess} min over`);

      // Create shortage deduction if configured
      try {
        const branch = await Branch.findById(b.branchId).lean();
        const cfg    = getBreakConfig(branch)?.[b.breakType] || {};
        const amt    = cfg.overstayDeductionAmount || 0;
        if (amt > 0) {
          const worker = await Worker.findById(b.worker).lean();
          if (worker) {
            await createAttendanceShortage({
              company: b.company, worker, branchId: b.branchId, branchName: b.branchName,
              amount: amt, source: 'manual', reason: 'other',
              attendanceDate: new Date(dateStr + 'T00:00:00.000Z'),
              notes: `Break overstay — ${b.breakType} break, ${excess} min over limit`,
            });
          }
        }
      } catch (e) { console.error('[BREAK-CRON] overstay shortage error:', e.message); }
    }
  }

  // ── 2. Missed break detection ─────────────────────────────────────────────────
  const branches = await Branch.find({ isActive: true }).lean();

  for (const branch of branches) {
    const config = getBreakConfig(branch);

    // Workers clocked in today at this branch
    const clockedIn = await Attendance.find({
      company:  branch.company,
      branchId: branch._id,
      date:     dateStr,
      type:     'clock_in',
    }).distinct('worker');
    if (!clockedIn.length) continue;

    for (const [breakType, cfg] of Object.entries(config)) {
      if (!cfg.enabled) continue;
      const winEnd = toMins(cfg.windowEnd);
      if (!winEnd) continue;

      // Only fire in the 5-minute window after the break period closes
      if (nowMins < winEnd || nowMins > winEnd + 5) continue;

      for (const workerId of clockedIn) {
        const existing = await Break.findOne({
          company: branch.company, worker: workerId, date: dateStr, breakType,
        }).lean();
        if (existing) continue;

        const worker = await Worker.findById(workerId).select('fullName role').lean();
        try {
          await Break.create({
            company:    branch.company,
            branchId:   branch._id,
            branchName: branch.name,
            worker:     workerId,
            workerName: worker?.fullName || '',
            workerRole: worker?.role     || '',
            date: dateStr,
            breakType,
            status: 'missed',
            allowedMinutes: cfg.allowedMinutes,
            windowStart:    cfg.windowStart,
            windowEnd:      cfg.windowEnd,
            auditLog: [{
              action: 'auto_missed', by: 'cron', timestamp: now,
              notes:  `Break window closed (${cfg.windowStart}–${cfg.windowEnd} UTC) — break not started`,
            }],
          });
          console.log(`[BREAK-CRON] Missed: ${worker?.fullName} ${breakType} break at ${branch.name}`);

          // Create shortage deduction if configured
          const amt = cfg.missedDeductionAmount || 0;
          if (amt > 0 && worker) {
            await createAttendanceShortage({
              company: branch.company, worker, branchId: branch._id, branchName: branch.name,
              amount: amt, source: 'manual', reason: 'other',
              attendanceDate: new Date(dateStr + 'T00:00:00.000Z'),
              notes: `Missed ${breakType} break (window: ${cfg.windowStart}–${cfg.windowEnd} UTC)`,
            });
          }
        } catch (e) {
          if (e.code !== 11000) console.error('[BREAK-CRON] missed creation error:', e.message);
        }
      }
    }
  }
}

function startBreakCron() {
  cron.schedule('*/5 * * * *', async () => {
    try { await runBreakCron(); }
    catch (e) { console.error('[BREAK-CRON] Unhandled error:', e.message); }
  });
  console.log('✅ Break cron started (every 5 minutes)');
}

module.exports = { startBreakCron, runBreakCron };
