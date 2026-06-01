const express = require('express');
const router  = express.Router();
const { protect }           = require('../middleware/auth');
const { checkSubscription } = require('../middleware/subscription');
const { requirePermission } = require('../middleware/permissions');
const {
  startBreak, endBreak, getBreakStatus,
  getBreaks, getBreakSummary, processMissedBreaks,
  getShiftBoard,
} = require('../controllers/breakController');

// ── Public — device-token authenticated (terminal) ────────────────────────────
router.post('/start',       startBreak);
router.post('/end',         endBreak);
router.get('/status',       getBreakStatus);
router.get('/shift-board',  getShiftBoard);

// ── Protected — admin / supervisor ───────────────────────────────────────────
router.use(protect, checkSubscription);
router.get('/',        getBreaks);
router.get('/summary', getBreakSummary);
router.post('/process-missed', requirePermission('manageBranches'), processMissedBreaks);

module.exports = router;
