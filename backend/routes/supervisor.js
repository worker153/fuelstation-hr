const express = require('express');
const router  = express.Router();
const {
  getSupervisorDashboard,
  supervisorSaveMeter,
  supervisorBookShortage,
  supervisorIslandStatus,
  supervisorReassign,
} = require('../controllers/supervisorController');

// All routes are PIN-authenticated inside the controller (no JWT middleware)
router.post('/dashboard',     getSupervisorDashboard);
router.post('/meter',         supervisorSaveMeter);
router.post('/shortage',      supervisorBookShortage);
router.patch('/island-status', supervisorIslandStatus);
router.post('/reassign',      supervisorReassign);

module.exports = router;
