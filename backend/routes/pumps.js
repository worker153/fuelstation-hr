const express = require('express');
const router  = express.Router();
const { protect }            = require('../middleware/auth');
const { checkSubscription }  = require('../middleware/subscription');
const { requirePermission }  = require('../middleware/permissions');
const { getPumps, createPump, updatePump, deletePump, importFromApi, listStationLocations } = require('../controllers/pumpController');

router.use(protect, checkSubscription);
router.get('/',       requirePermission('manageBranches'), getPumps);
router.post('/',      requirePermission('manageBranches'), createPump);
router.put('/:id',    requirePermission('manageBranches'), updatePump);
router.delete('/:id',          requirePermission('manageBranches'), deletePump);
router.get('/station-locations',  requirePermission('manageBranches'), listStationLocations);
router.post('/import-from-api',   requirePermission('manageBranches'), importFromApi);

module.exports = router;
