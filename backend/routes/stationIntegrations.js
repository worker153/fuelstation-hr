const express = require('express');
const router  = express.Router();
const { protect }           = require('../middleware/auth');
const { checkSubscription } = require('../middleware/subscription');
const { superAdminOnly }    = require('../middleware/permissions');
const {
  getIntegrations, createIntegration, updateIntegration, deleteIntegration,
  testConnection, getPumps, fetchLocations,
} = require('../controllers/stationIntegrationController');

router.use(protect, checkSubscription, superAdminOnly);

router.get('/',           getIntegrations);
router.post('/',          createIntegration);
router.put('/:id',        updateIntegration);
router.delete('/:id',     deleteIntegration);
router.post('/:id/test',   testConnection);
router.get('/:id/pumps',   getPumps);
router.post('/fetch-locations', fetchLocations);

module.exports = router;
