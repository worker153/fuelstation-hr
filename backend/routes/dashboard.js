const express = require('express');
const router  = express.Router();
const { protect }    = require('../middleware/auth');
const { getOpsStats, getAdminSummary } = require('../controllers/dashboardController');

router.use(protect);
router.get('/ops',           getOpsStats);
router.get('/admin-summary', getAdminSummary);

module.exports = router;
