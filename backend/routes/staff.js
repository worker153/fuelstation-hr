const express    = require('express');
const router     = express.Router();
const { protect }            = require('../middleware/auth');
const { checkSubscription }  = require('../middleware/subscription');
const { superAdminOnly }     = require('../middleware/permissions');
const {
  getStaff, getRoleDefaults, createStaff, updateStaff, deleteStaff, resetPassword,
  getCustomRoles, addCustomRole, deleteCustomRole,
} = require('../controllers/staffController');

router.use(protect, checkSubscription);
router.use(superAdminOnly);

router.get('/role-defaults/:role', getRoleDefaults);

// Custom roles
router.route('/custom-roles')
  .get(getCustomRoles)
  .post(addCustomRole);
router.delete('/custom-roles/:value', deleteCustomRole);

router.route('/')
  .get(getStaff)
  .post(createStaff);

router.route('/:id')
  .put(updateStaff)
  .delete(deleteStaff);

router.put('/:id/reset-password', resetPassword);

module.exports = router;
