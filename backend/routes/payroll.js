const express = require('express');
const router  = express.Router();
const { protect }           = require('../middleware/auth');
const { checkSubscription } = require('../middleware/subscription');
const { requirePermission } = require('../middleware/permissions');
const {
  getPayrolls, getPayroll, generatePayroll,
  updatePayroll, finalisePayroll, unlockPayroll, deletePayroll
} = require('../controllers/payrollController');

router.use(protect, checkSubscription);

router.get('/',               getPayrolls);
router.get('/:id',            getPayroll);
router.post('/generate',      requirePermission('manageBranches'), generatePayroll);
router.put('/:id',            requirePermission('manageBranches'), updatePayroll);
router.post('/:id/finalise',  requirePermission('manageBranches'), finalisePayroll);
router.post('/:id/unlock',    requirePermission('manageBranches'), unlockPayroll);
router.delete('/:id',         requirePermission('manageBranches'), deletePayroll);

module.exports = router;
