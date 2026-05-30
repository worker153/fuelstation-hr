const express = require('express');
const router  = express.Router();
const { protect }           = require('../middleware/auth');
const { checkSubscription } = require('../middleware/subscription');
const { requirePermission } = require('../middleware/permissions');
const {
  startBreak, endBreak, getBreakStatus,
  getBreaks, getBreakSummary, processMissedBreaks,
} = require('../controllers/breakController');

// ── Public — device-token authenticated (terminal) ────────────────────────────
router.post('/start',  startBreak);
router.post('/end',    endBreak);
router.get('/status',  getBreakStatus);

// ── Protected — admin / supervisor ───────────────────────────────────────────
router.use(protect, checkSubscription);
router.get('/',        getBreaks);
router.get('/summary', getBreakSummary);
router.post('/process-missed', requirePermission('manageBranches'), processMissedBreaks);

module.exports = router;
