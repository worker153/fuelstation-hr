/**
 * Platform Admin Routes
 * All routes require: protect + platformAdminOnly
 */
const express = require('express');
const router  = express.Router();
const { protect, platformAdminOnly } = require('../middleware/auth');
const {
  listCompanies,
  getCompany,
  approveCompany,
  rejectCompany,
  activateSubscription,
  suspendCompany,
  unsuspendCompany,
  extendSubscription,
  updateNotes,
  getPlatformStats,
  listPlatformAdmins,
  createPlatformAdmin,
  removePlatformAdmin,
} = require('../controllers/platformController');

// All platform routes are protected + platform-admin only
router.use(protect, platformAdminOnly);

// ── Stats ─────────────────────────────────────────────────────────────────────
router.get('/stats', getPlatformStats);

// ── Companies ─────────────────────────────────────────────────────────────────
router.get('/companies',                        listCompanies);
router.get('/companies/:id',                    getCompany);
router.post('/companies/:id/approve',           approveCompany);
router.post('/companies/:id/reject',            rejectCompany);
router.post('/companies/:id/activate',          activateSubscription);
router.post('/companies/:id/suspend',           suspendCompany);
router.post('/companies/:id/unsuspend',         unsuspendCompany);
router.post('/companies/:id/extend',            extendSubscription);
router.put('/companies/:id/notes',              updateNotes);

// ── Platform Admin Users ──────────────────────────────────────────────────────
router.get('/admins',        listPlatformAdmins);
router.post('/admins',       createPlatformAdmin);
router.delete('/admins/:id', removePlatformAdmin);

module.exports = router;
