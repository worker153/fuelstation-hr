// ── Shared attendance helper functions ───────────────────────────────────────
// Used by both attendanceController.js and the absence cron job.

const DAY_NAMES = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];

/**
 * Returns true if the worker is on their scheduled duty day.
 *
 * Checks two sources — both must pass for the worker to be on duty:
 *  1. Fixed-shift days: if the worker's assigned shift is 'fixed' and has a
 *     'days' list (e.g. Mon–Sat), today must be in that list.
 *  2. Rotation schedule: if the worker has a rotation pattern (1_1, 2_2 etc.),
 *     today must fall in the "on" portion of the cycle.
 *
 * @param {object} worker  - Worker doc (must include rotationSchedule; shiftId
 *                           may be the raw ObjectId OR a populated Shift object)
 * @param {Date|string} date - The date to check
 */
function isWorkerOnDuty(worker, date) {
  const checkDate = new Date(date);

  // ── 1. Fixed-shift day check ─────────────────────────────────────────────
  const shift = worker.shiftId;
  if (shift && typeof shift === 'object' && shift.shiftType === 'fixed') {
    const shiftDays = shift.days;
    // Only enforce if the shift actually restricts days (not all 7)
    if (Array.isArray(shiftDays) && shiftDays.length > 0 && shiftDays.length < 7) {
      const todayName = DAY_NAMES[checkDate.getDay()];
      if (!shiftDays.includes(todayName)) return false;  // scheduled off day
    }
  }

  // ── 2. Rotation-cycle check ──────────────────────────────────────────────
  const sched = worker.rotationSchedule;
  if (!sched || !sched.pattern || sched.pattern === 'none') return true;

  // Use same fallback anchor as dashboard: startDate → resumptionDate → activatedAt
  const anchorRaw = sched.startDate || worker.resumptionDate || worker.activatedAt;
  if (!anchorRaw) return true;

  const [onStr, offStr] = sched.pattern.split('_');
  const onDays   = parseInt(onStr)  || 1;
  const offDays  = parseInt(offStr) || 1;
  const cycleLen = onDays + offDays;

  const start    = new Date(anchorRaw);
  const startUTC = Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), start.getUTCDate());
  const checkUTC = Date.UTC(checkDate.getUTCFullYear(), checkDate.getUTCMonth(), checkDate.getUTCDate());

  const daysDiff   = Math.round((checkUTC - startUTC) / 86400000);
  const posInCycle = ((daysDiff % cycleLen) + cycleLen) % cycleLen;
  return posInCycle < onDays;
}

/**
 * Returns the attendance rule that applies to a given worker role.
 * Prefers exact role match, falls back to 'default', then legacy attendanceSettings.
 */
function getSettingsForRole(branch, workerRole) {
  const rules = branch?.attendanceRules;
  if (rules?.length) {
    const lRole = (workerRole || '').toLowerCase().trim();
    return (
      rules.find(r => r.role !== 'default' && r.role.toLowerCase().trim() === lRole) ||
      rules.find(r => r.role === 'default') ||
      null
    );
  }
  return branch?.attendanceSettings || null;
}

module.exports = { isWorkerOnDuty, getSettingsForRole };
