const express = require('express');
const router  = express.Router();
const { protect }            = require('../middleware/auth');
const { requirePermission, superAdminOnly } = require('../middleware/permissions');
const {
  getBranches, getBranch, createBranch, updateBranch, deactivateBranch, resolveMapsUrl
} = require('../controllers/branchController');

router.use(protect);

// ── Named routes BEFORE /:id ──────────────────────────────────────────────────
router.post('/resolve-url', resolveMapsUrl);   // Google Maps URL → coordinates

// All authenticated users can view branches
router.get('/',    getBranches);
router.get('/:id', getBranch);

// Create / Edit / Toggle require manageBranches permission (super_admin always passes)
router.post('/',       requirePermission('manageBranches'), createBranch);
router.put('/:id',     requirePermission('manageBranches'), updateBranch);
router.delete('/:id',  requirePermission('manageBranches'), deactivateBranch);

module.exports = router;
