const express = require('express');
const router  = express.Router();
const { protect }           = require('../middleware/auth');
const { checkSubscription } = require('../middleware/subscription');
const { requirePermission } = require('../middleware/permissions');
const { getShifts, getShift, createShift, updateShift, toggleShift } = require('../controllers/shiftController');

router.use(protect, checkSubscription);

router.get('/',    getShifts);
router.get('/:id', getShift);

router.post('/',       requirePermission('manageBranches'), createShift);
router.put('/:id',     requirePermission('manageBranches'), updateShift);
router.delete('/:id',  requirePermission('manageBranches'), toggleShift);

module.exports = router;
