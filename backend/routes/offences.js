const express    = require('express');
const router     = express.Router();
const { protect }            = require('../middleware/auth');
const { checkSubscription }  = require('../middleware/subscription');
const { requirePermission, superAdminOnly, requireActive } = require('../middleware/permissions');
const {
  getOffences, createOffence, resolveOffence, deleteOffence, getWorkerOffences
} = require('../controllers/offenceController');

router.use(protect, checkSubscription);

// Any active authenticated staff can list + create offences
// (admin token is sufficient — bookOffences permission grants access to non-admin staff too)
router.get('/',                   requireActive, getOffences);
router.post('/',                  requireActive, createOffence);
router.get('/worker/:workerId',   requireActive, getWorkerOffences);

// Only admin / super_admin can resolve or delete
router.patch('/:id/resolve',      superAdminOnly, resolveOffence);
router.delete('/:id',             superAdminOnly, deleteOffence);

module.exports = router;
