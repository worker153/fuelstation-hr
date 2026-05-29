// ── Shared attendance helper functions ───────────────────────────────────────
// Used by both attendanceController.js and the absence cron job.

/**
 * Returns true if the worker is on their scheduled duty day.
 * Workers with no rotation schedule (or pattern='none') are always on duty.
 */
function isWorkerOnDuty(worker, date) {
  const sched = worker.rotationSchedule;
  if (!sched || !sched.pattern || sched.pattern === 'none' || !sched.startDate) return true;

  const [onStr, offStr] = sched.pattern.split('_');
  const onDays   = parseInt(onStr)  || 1;
  const offDays  = parseInt(offStr) || 1;
  const cycleLen = onDays + offDays;

  const start    = new Date(sched.startDate);
  const startUTC = Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), start.getUTCDate());
  const check    = new Date(date);
  const checkUTC = Date.UTC(check.getUTCFullYear(), check.getUTCMonth(), check.getUTCDate());

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
