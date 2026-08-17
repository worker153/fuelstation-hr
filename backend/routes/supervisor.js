const express = require('express');
const router  = express.Router();
const {
  getSupervisorDashboard,
  supervisorSaveMeter,
  supervisorBookShortage,
  supervisorIslandStatus,
  supervisorReassign,
  supervisorPumpStatus,
  supervisorClockWorker,
} = require('../controllers/supervisorController');

// All routes are PIN-authenticated inside the controller (no JWT middleware)
router.post('/dashboard',     getSupervisorDashboard);
router.post('/meter',         supervisorSaveMeter);
router.post('/shortage',      supervisorBookShortage);
router.patch('/island-status', supervisorIslandStatus);
router.patch('/pump-status',   supervisorPumpStatus);
router.post('/reassign',      supervisorReassign);
router.post('/clock-worker',  supervisorClockWorker);

module.exports = router;
