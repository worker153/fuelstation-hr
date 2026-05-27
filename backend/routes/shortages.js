const express = require('express');
const router  = express.Router();
const { protect } = require('../middleware/auth');
const { requirePermission } = require('../middleware/permissions');
const {
  submitShortage, getShortages,
  approveShortage, rejectShortage,
  deleteShortage, getShortagesSummary
} = require('../controllers/shortageController');

router.use(protect);

// Named routes first
router.get('/summary', requirePermission('manageBranches'), getShortagesSummary);

// Collection
router.get('/',  getShortages);
router.post('/', requirePermission('submitShortages'), submitShortage);

// Single
router.delete('/:id', deleteShortage);
router.post('/:id/approve', requirePermission('manageBranches'), approveShortage);
router.post('/:id/reject',  requirePermission('manageBranches'), rejectShortage);

module.exports = router;
