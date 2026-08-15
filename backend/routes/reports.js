const express = require('express');
const router  = express.Router();
const { protect }           = require('../middleware/auth');
const { checkSubscription } = require('../middleware/subscription');
const { getStaffPerformance } = require('../controllers/reportController');

router.use(protect, checkSubscription);

router.get('/staff-performance', getStaffPerformance);

module.exports = router;
