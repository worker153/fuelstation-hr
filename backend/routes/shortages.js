const express = require('express');
const router  = express.Router();
const { protect } = require('../middleware/auth');
const { requirePermission } = require('../middleware/permissions');
const {
  submitShortage, getShortages,
  approveShortage, rejectShortage,
  deleteShortage, getShortagesSummary,
  workerPinSubmit, workerPinLookup, workerDashboard
} = require('../controllers/shortageController');

// ── Public routes (no auth — worker PIN self-service) ─────────────────────────
router.get('/worker/lookup',    workerPinLookup);
router.get('/worker/dashboard', workerDashboard);
router.post('/worker',          workerPinSubmit);

// ── Protected routes ──────────────────────────────────────────────────────────
router.use(protect);

router.get('/summary', requirePermission('manageBranches'), getShortagesSummary);

router.get('/',  getShortages);
router.post('/', requirePermission('submitShortages'), submitShortage);

router.delete('/:id', deleteShortage);
router.post('/:id/approve', requirePermission('manageBranches'), approveShortage);
router.post('/:id/reject',  requirePermission('manageBranches'), rejectShortage);

module.exports = router;
