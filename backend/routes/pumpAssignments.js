const express = require('express');
const router  = express.Router();
const { protect }           = require('../middleware/auth');
const { checkSubscription } = require('../middleware/subscription');
const { requirePermission } = require('../middleware/permissions');
const { getAssignments, override, getTodayBoard, syncMeters, deleteAssignment } = require('../controllers/pumpAssignmentController');

router.use(protect, checkSubscription);
router.get('/',          requirePermission('manageBranches'), getAssignments);
router.get('/today',     requirePermission('manageBranches'), getTodayBoard);
router.post('/override',     requirePermission('manageBranches'), override);
router.post('/sync-meters', requirePermission('manageBranches'), syncMeters);
router.delete('/:id',       requirePermission('manageBranches'), deleteAssignment);

module.exports = router;
