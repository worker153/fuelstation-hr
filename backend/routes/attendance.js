const router = require('express').Router();
const { protect } = require('../middleware/auth');
const { terminalClock, getAttendance, getWorkerAttendance, todaySummary } = require('../controllers/attendanceController');

// ── Public (terminal submits attendance with device token) ────────────────────
router.post('/clock', terminalClock);

// ── Protected ─────────────────────────────────────────────────────────────────
router.use(protect);

router.get('/',                   getAttendance);
router.get('/today',              todaySummary);
router.get('/workers/:workerId',  getWorkerAttendance);

module.exports = router;
