const express = require('express');
const router  = express.Router();
const { protect }           = require('../middleware/auth');
const { checkSubscription } = require('../middleware/subscription');
const { requirePermission } = require('../middleware/permissions');
const { getAssignments, override, getTodayBoard } = require('../controllers/pumpAssignmentController');

router.use(protect, checkSubscription);
router.get('/',          requirePermission('manageBranches'), getAssignments);
router.get('/today',     requirePermission('manageBranches'), getTodayBoard);
router.post('/override', requirePermission('manageBranches'), override);

module.exports = router;
