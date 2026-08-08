const express = require('express');
const router  = express.Router();
const { protect }            = require('../middleware/auth');
const { checkSubscription }  = require('../middleware/subscription');
const { requirePermission }  = require('../middleware/permissions');
const { getLogs, saveOpening, saveClosing, getReport } = require('../controllers/meterLogController');

router.use(protect, checkSubscription);

router.get('/report', requirePermission('manageBranches'), getReport);
router.get('/',       requirePermission('manageBranches'), getLogs);
router.post('/',      requirePermission('manageBranches'), saveOpening);
router.put('/:id/close', requirePermission('manageBranches'), saveClosing);

module.exports = router;
