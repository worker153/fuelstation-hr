const express    = require('express');
const router     = express.Router();
const { protect }            = require('../middleware/auth');
const { requirePermission, superAdminOnly } = require('../middleware/permissions');
const {
  getOffences, createOffence, resolveOffence, deleteOffence, getWorkerOffences
} = require('../controllers/offenceController');

router.use(protect);

// Any staff with bookOffences permission (or admin) can list + create
router.get('/',                   requirePermission('bookOffences'), getOffences);
router.post('/',                  requirePermission('bookOffences'), createOffence);
router.get('/worker/:workerId',   requirePermission('bookOffences'), getWorkerOffences);

// Only admin / super_admin can resolve or delete
router.patch('/:id/resolve',      superAdminOnly, resolveOffence);
router.delete('/:id',             superAdminOnly, deleteOffence);

module.exports = router;
