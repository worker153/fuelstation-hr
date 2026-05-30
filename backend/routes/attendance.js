const router = require('express').Router();
const { protect }           = require('../middleware/auth');
const { checkSubscription } = require('../middleware/subscription');
const { requirePermission } = require('../middleware/permissions');
const { terminalClock, getAttendance, getWorkerAttendance,
        todaySummary, processAbsences, getMonthlySummary, debugSettings } = require('../controllers/attendanceController');

// ── Public (terminal submits attendance with device token) ────────────────────
router.post('/clock', terminalClock);

// ── Protected ─────────────────────────────────────────────────────────────────
router.use(protect, checkSubscription);

router.get('/',                   getAttendance);
router.get('/today',              todaySummary);
router.get('/monthly-summary',    getMonthlySummary);
router.get('/debug-settings',     debugSettings);
router.get('/workers/:workerId',  getWorkerAttendance);
router.post('/process-absences',  requirePermission('manageBranches'), processAbsences);

module.exports = router;
