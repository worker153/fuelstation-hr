const router = require('express').Router();
const { protect } = require('../middleware/auth');
const { requirePermission } = require('../middleware/permissions');
const { terminalClock, getAttendance, getWorkerAttendance,
        todaySummary, processAbsences } = require('../controllers/attendanceController');

// ── Public (terminal submits attendance with device token) ────────────────────
router.post('/clock', terminalClock);

// ── Protected ─────────────────────────────────────────────────────────────────
router.use(protect);

router.get('/',                   getAttendance);
router.get('/today',              todaySummary);
router.get('/workers/:workerId',  getWorkerAttendance);
router.post('/process-absences',  requirePermission('manageBranches'), processAbsences);

module.exports = router;
