const express = require('express');
const router  = express.Router();
const { protect }           = require('../middleware/auth');
const { checkSubscription } = require('../middleware/subscription');
const { requirePermission } = require('../middleware/permissions');
const { getPumpShifts, updatePumpShift, assignPump } = require('../controllers/pumpShiftController');

router.use(protect, checkSubscription);

router.get('/',             requirePermission('manageBranches'), getPumpShifts);
router.put('/:id',          requirePermission('manageBranches'), updatePumpShift);
router.post('/assign-pump', requirePermission('manageBranches'), assignPump);

module.exports = router;
