const express = require('express');
const router  = express.Router();
const { protect }           = require('../middleware/auth');
const { checkSubscription } = require('../middleware/subscription');
const { requirePermission, requireActive } = require('../middleware/permissions');
const {
  submitShortage, getShortages,
  approveShortage, rejectShortage,
  deleteShortage, getShortagesSummary,
  workerPinSubmit, workerPinLookup, workerDashboard,
  joinShortage,
} = require('../controllers/shortageController');

// ── Public routes (no auth — worker PIN self-service) ─────────────────────────
router.get('/worker/lookup',    workerPinLookup);
router.get('/worker/dashboard', workerDashboard);
router.post('/worker',          workerPinSubmit);

// ── Protected routes ──────────────────────────────────────────────────────────
router.use(protect, checkSubscription);

router.get('/summary', requirePermission('manageBranches'), getShortagesSummary);

router.get('/',  getShortages);
router.post('/', requireActive, submitShortage);

router.delete('/:id', deleteShortage);
router.post('/:id/approve', requirePermission('manageBranches'), approveShortage);
router.post('/:id/reject',  requirePermission('manageBranches'), rejectShortage);
router.post('/:id/join',    requireActive, joinShortage);

module.exports = router;
