const express = require('express');
const router  = express.Router();
const { protect }           = require('../middleware/auth');
const { checkSubscription } = require('../middleware/subscription');
const { getOpsStats, getAdminSummary } = require('../controllers/dashboardController');

router.use(protect, checkSubscription);
router.get('/ops',           getOpsStats);
router.get('/admin-summary', getAdminSummary);

module.exports = router;
